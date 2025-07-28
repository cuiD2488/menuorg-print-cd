// 增强的C-Lodop管理器 - 解决时序问题和重复检查
// 特别针对开机自启动场景优化

class EnhancedCLodopManager {
  constructor() {
    this.LODOP = null;
    this.isConnected = false;
    this.isChecking = false;
    this.lastCheckTime = 0;
    this.checkCache = null;
    this.cacheValidDuration = 30000; // 缓存30秒
    this.retryAttempts = 0;
    this.maxRetryAttempts = 10;
    this.retryDelay = 2000; // 初始重试延迟2秒
    this.maxRetryDelay = 30000; // 最大重试延迟30秒
    this.isSystemStartup = false;
    this.systemStartupDelay = 15000; // 系统启动时额外等待15秒
    this.healthCheckInterval = null;
    this.eventListeners = new Map();

    // 检测是否为系统启动（异步）
    this.detectSystemStartup();

    console.log('[EnhancedCLodop] 增强管理器初始化完成');
  }

  // 检测是否为系统启动场景
  detectSystemStartup() {
    try {
      // 优先使用主进程提供的启动信息
      if (
        typeof window !== 'undefined' &&
        window.electronAPI &&
        window.electronAPI.getSystemStartupInfo
      ) {
        // 异步获取，不阻塞构造函数
        this.getSystemStartupInfoFromMain().catch((error) => {
          console.warn('[EnhancedCLodop] 异步获取启动信息失败:', error);
          this.detectSystemStartupLocal();
        });
        return;
      }

      // 回退到本地检测
      this.detectSystemStartupLocal();
    } catch (error) {
      console.warn('[EnhancedCLodop] 检测系统启动状态失败:', error);
      this.isSystemStartup = false;
    }
  }

  // 从主进程获取系统启动信息
  async getSystemStartupInfoFromMain() {
    try {
      const result = await window.electronAPI.getSystemStartupInfo();
      if (result.success) {
        this.isSystemStartup = result.isRecentlyStarted || result.isAutoStarted;
        this.systemStartupTime = result.systemStartupTime;
        this.timeSinceStartup = result.timeSinceStartup;

        console.log('[EnhancedCLodop] 从主进程获取启动信息:', {
          isSystemStartup: this.isSystemStartup,
          timeSinceStartup: this.timeSinceStartup,
          isAutoStarted: result.isAutoStarted,
        });

        if (this.isSystemStartup) {
          console.log(
            '[EnhancedCLodop] 检测到系统启动场景，将使用延迟检查策略'
          );
          this.adjustStrategyForSystemStartup(this.timeSinceStartup);
        }
      } else {
        console.warn('[EnhancedCLodop] 获取主进程启动信息失败，使用本地检测');
        this.detectSystemStartupLocal();
      }
    } catch (error) {
      console.warn('[EnhancedCLodop] 调用主进程启动信息失败:', error);
      this.detectSystemStartupLocal();
    }
  }

  // 本地检测系统启动状态
  detectSystemStartupLocal() {
    try {
      // 检查启动时间
      const bootTime = Date.now() - performance.now();
      const timeSinceStartup = Date.now() - bootTime;

      // 如果系统启动时间小于5分钟，认为是开机启动
      this.isSystemStartup = timeSinceStartup < 300000;
      this.timeSinceStartup = timeSinceStartup;

      // 检查启动参数
      if (typeof process !== 'undefined' && process.argv) {
        this.isSystemStartup =
          this.isSystemStartup || process.argv.includes('--auto-start');
      }

      if (this.isSystemStartup) {
        console.log(
          '[EnhancedCLodop] 本地检测到系统启动场景，将使用延迟检查策略'
        );
        this.adjustStrategyForSystemStartup(timeSinceStartup);
      }
    } catch (error) {
      console.warn('[EnhancedCLodop] 本地检测系统启动状态失败:', error);
      this.isSystemStartup = false;
    }
  }

  // 根据系统启动时间调整检查策略
  adjustStrategyForSystemStartup(timeSinceStartup) {
    if (timeSinceStartup < 60000) {
      // 1分钟内
      this.retryDelay = 10000; // 10秒延迟
      this.systemStartupDelay = 20000; // 额外等待20秒
      this.maxRetryAttempts = 15; // 增加重试次数
    } else if (timeSinceStartup < 180000) {
      // 3分钟内
      this.retryDelay = 5000; // 5秒延迟
      this.systemStartupDelay = 15000; // 额外等待15秒
      this.maxRetryAttempts = 12; // 增加重试次数
    } else {
      this.retryDelay = 3000; // 3秒延迟
      this.systemStartupDelay = 10000; // 额外等待10秒
      this.maxRetryAttempts = 10; // 标准重试次数
    }

    console.log(
      `[EnhancedCLodop] 调整策略: 延迟${this.retryDelay}ms, 额外等待${this.systemStartupDelay}ms, 最大重试${this.maxRetryAttempts}次`
    );
  }

  // 事件发射器
  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[EnhancedCLodop] 事件监听器错误 ${event}:`, error);
      }
    });
  }

  // 事件监听器
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  // 智能检查CLodop状态（带缓存和重试）
  async checkStatus(forceRefresh = false) {
    const now = Date.now();

    // 检查缓存是否有效
    if (
      !forceRefresh &&
      this.checkCache &&
      now - this.lastCheckTime < this.cacheValidDuration
    ) {
      console.log('[EnhancedCLodop] 使用缓存的检查结果');
      return this.checkCache;
    }

    // 防止并发检查
    if (this.isChecking) {
      console.log('[EnhancedCLodop] 正在检查中，等待结果...');
      return this.waitForCurrentCheck();
    }

    return this.performStatusCheck();
  }

  // 等待当前检查完成
  async waitForCurrentCheck() {
    let attempts = 0;
    const maxWaitTime = 30000; // 最多等待30秒
    const checkInterval = 500;

    return new Promise((resolve) => {
      const waitTimer = setInterval(() => {
        attempts++;

        if (!this.isChecking || attempts * checkInterval >= maxWaitTime) {
          clearInterval(waitTimer);
          resolve(this.checkCache || this.createErrorStatus('检查超时'));
        }
      }, checkInterval);
    });
  }

  // 执行状态检查
  async performStatusCheck() {
    this.isChecking = true;
    this.emit('checking', { attempt: this.retryAttempts + 1 });

    try {
      console.log(
        `[EnhancedCLodop] 开始检查CLodop状态 (尝试 ${this.retryAttempts + 1}/${
          this.maxRetryAttempts
        })`
      );

      // 系统启动时增加等待时间
      if (this.isSystemStartup && this.retryAttempts === 0) {
        console.log(
          `[EnhancedCLodop] 系统启动场景，等待 ${this.systemStartupDelay}ms`
        );
        await this.delay(this.systemStartupDelay);
      }

      const result = await this.performActualCheck();

      if (result.available) {
        this.retryAttempts = 0;
        this.isConnected = true;
        this.LODOP = result.lodop;
        this.cacheResult(result);
        this.startHealthCheck();
        this.emit('connected', result);

        console.log('[EnhancedCLodop] ✅ CLodop连接成功');
        return result;
      } else {
        return this.handleCheckFailure(result);
      }
    } catch (error) {
      return this.handleCheckError(error);
    } finally {
      this.isChecking = false;
    }
  }

  // 执行实际的检查逻辑
  async performActualCheck() {
    const checks = [
      () => this.checkExistingConnection(),
      () => this.checkDirectPorts(),
      () => this.checkWindowsFunctions(),
      () => this.checkActiveX(),
    ];

    for (const check of checks) {
      try {
        const result = await check();
        if (result.available) {
          return result;
        }
      } catch (error) {
        console.warn('[EnhancedCLodop] 检查方法失败:', error);
        continue;
      }
    }

    return this.createErrorStatus('所有检查方法均失败');
  }

  // 检查现有连接
  async checkExistingConnection() {
    if (
      typeof window !== 'undefined' &&
      typeof window.getLodop === 'function'
    ) {
      try {
        const lodop = window.getLodop();
        if (this.validateLodopObject(lodop)) {
          console.log('[EnhancedCLodop] 使用现有连接');
          return this.createSuccessStatus(lodop);
        }
      } catch (error) {
        console.warn('[EnhancedCLodop] 现有连接验证失败:', error);
      }
    }
    return this.createErrorStatus('现有连接不可用');
  }

  // 检查直连端口
  async checkDirectPorts() {
    const ports = [8000, 18000, 8080, 18080];

    for (const port of ports) {
      try {
        console.log(`[EnhancedCLodop] 检查端口 ${port}...`);

        const response = await this.fetchWithTimeout(
          `http://localhost:${port}/CLodopfuncs.js`,
          5000
        );

        if (response.ok) {
          const jsCode = await response.text();

          // 在隔离的环境中执行代码
          const lodop = this.executeInSandbox(jsCode);

          if (this.validateLodopObject(lodop)) {
            console.log(`[EnhancedCLodop] ✅ 端口 ${port} 连接成功`);
            return this.createSuccessStatus(lodop);
          }
        }
      } catch (error) {
        console.warn(`[EnhancedCLodop] 端口 ${port} 连接失败:`, error.message);
        continue;
      }
    }

    return this.createErrorStatus('所有端口连接失败');
  }

  // 检查Window函数
  async checkWindowsFunctions() {
    if (typeof window !== 'undefined') {
      const checkFunctions = ['checkCLodopStatus', 'getCLodop'];

      for (const funcName of checkFunctions) {
        if (typeof window[funcName] === 'function') {
          try {
            const result = window[funcName]();
            if (
              result &&
              (result.available || this.validateLodopObject(result))
            ) {
              console.log(`[EnhancedCLodop] 通过 ${funcName} 获取成功`);
              return this.createSuccessStatus(result.lodop || result);
            }
          } catch (error) {
            console.warn(`[EnhancedCLodop] ${funcName} 调用失败:`, error);
          }
        }
      }
    }
    return this.createErrorStatus('Window函数检查失败');
  }

  // 检查ActiveX
  async checkActiveX() {
    if (this.isIEBrowser()) {
      try {
        const lodop = new ActiveXObject('Lodop.LodopCtrl.1');
        if (this.validateLodopObject(lodop)) {
          console.log('[EnhancedCLodop] ActiveX连接成功');
          return this.createSuccessStatus(lodop);
        }
      } catch (error) {
        console.warn('[EnhancedCLodop] ActiveX连接失败:', error);
      }
    }
    return this.createErrorStatus('ActiveX不可用');
  }

  // 在沙箱中执行JavaScript代码
  executeInSandbox(jsCode) {
    try {
      // 创建一个临时的函数作用域
      const sandbox = new Function(
        'window',
        jsCode + '; return typeof getLodop === "function" ? getLodop() : null;'
      );
      return sandbox(window);
    } catch (error) {
      console.error('[EnhancedCLodop] 沙箱执行失败:', error);
      return null;
    }
  }

  // 带超时的fetch
  fetchWithTimeout(url, timeout = 5000) {
    return Promise.race([
      fetch(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('请求超时')), timeout)
      ),
    ]);
  }

  // 验证Lodop对象
  validateLodopObject(lodop) {
    try {
      return (
        lodop &&
        typeof lodop === 'object' &&
        typeof lodop.VERSION === 'string' &&
        lodop.VERSION.length > 0 &&
        typeof lodop.PRINT_INIT === 'function'
      );
    } catch (error) {
      return false;
    }
  }

  // 处理检查失败
  async handleCheckFailure(result) {
    this.retryAttempts++;

    if (this.retryAttempts < this.maxRetryAttempts) {
      const delay = Math.min(
        this.retryDelay * Math.pow(1.5, this.retryAttempts - 1),
        this.maxRetryDelay
      );

      console.log(
        `[EnhancedCLodop] 检查失败，${delay}ms后重试 (${this.retryAttempts}/${this.maxRetryAttempts})`
      );
      this.emit('retry', { attempt: this.retryAttempts, delay });

      await this.delay(delay);
      return this.performStatusCheck();
    } else {
      console.error('[EnhancedCLodop] ❌ 达到最大重试次数，检查失败');
      this.cacheResult(result);
      this.emit('failed', result);
      return result;
    }
  }

  // 处理检查错误
  async handleCheckError(error) {
    console.error('[EnhancedCLodop] 检查过程中发生错误:', error);
    const errorResult = this.createErrorStatus(`检查错误: ${error.message}`);
    return this.handleCheckFailure(errorResult);
  }

  // 创建成功状态
  createSuccessStatus(lodop) {
    try {
      const printerCount = lodop.GET_PRINTER_COUNT
        ? lodop.GET_PRINTER_COUNT()
        : 0;
      return {
        available: true,
        connected: true,
        version: lodop.VERSION,
        cversion: lodop.CVERSION || null,
        printerCount,
        lodop,
        timestamp: Date.now(),
        checkMethod: 'enhanced',
      };
    } catch (error) {
      console.warn('[EnhancedCLodop] 获取详细信息失败:', error);
      return {
        available: true,
        connected: true,
        version: lodop.VERSION || 'unknown',
        printerCount: 0,
        lodop,
        timestamp: Date.now(),
        checkMethod: 'enhanced',
        warning: '无法获取详细信息',
      };
    }
  }

  // 创建错误状态
  createErrorStatus(message) {
    return {
      available: false,
      connected: false,
      version: null,
      printerCount: 0,
      lodop: null,
      error: message,
      timestamp: Date.now(),
      checkMethod: 'enhanced',
    };
  }

  // 缓存结果
  cacheResult(result) {
    this.checkCache = result;
    this.lastCheckTime = Date.now();
  }

  // 启动健康检查
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // 每分钟检查一次
  }

  // 执行健康检查
  async performHealthCheck() {
    if (!this.isConnected || !this.LODOP) {
      return;
    }

    try {
      // 简单的健康检查
      const version = this.LODOP.VERSION;
      if (!version) {
        throw new Error('版本信息丢失');
      }

      console.log('[EnhancedCLodop] 健康检查通过');
    } catch (error) {
      console.warn('[EnhancedCLodop] 健康检查失败，重置连接:', error);
      this.resetConnection();
      this.emit('disconnected', { reason: '健康检查失败' });
    }
  }

  // 重置连接
  resetConnection() {
    this.isConnected = false;
    this.LODOP = null;
    this.checkCache = null;
    this.lastCheckTime = 0;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // 获取CLodop对象
  getLodop() {
    return this.LODOP;
  }

  // 强制重新连接
  async reconnect() {
    console.log('[EnhancedCLodop] 强制重新连接...');
    this.resetConnection();
    this.retryAttempts = 0;
    return this.checkStatus(true);
  }

  // 工具方法
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isIEBrowser() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return ua.indexOf('MSIE') !== -1 || ua.indexOf('Trident') !== -1;
  }

  // 销毁管理器
  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.resetConnection();
    this.eventListeners.clear();
    console.log('[EnhancedCLodop] 管理器已销毁');
  }
}

// 单例模式
let enhancedManagerInstance = null;

function getEnhancedCLodopManager() {
  if (!enhancedManagerInstance) {
    enhancedManagerInstance = new EnhancedCLodopManager();
  }
  return enhancedManagerInstance;
}

// 便捷的状态检查函数
async function checkCLodopStatusEnhanced(forceRefresh = false) {
  const manager = getEnhancedCLodopManager();
  return manager.checkStatus(forceRefresh);
}

// 便捷的获取CLodop函数
async function getReliableCLodopEnhanced() {
  const manager = getEnhancedCLodopManager();
  const status = await manager.checkStatus();

  if (status.available) {
    return { success: true, lodop: status.lodop, status };
  } else {
    return { success: false, error: status.error, status };
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.EnhancedCLodopManager = EnhancedCLodopManager;
  window.getEnhancedCLodopManager = getEnhancedCLodopManager;
  window.checkCLodopStatusEnhanced = checkCLodopStatusEnhanced;
  window.getReliableCLodopEnhanced = getReliableCLodopEnhanced;
}

// Node.js导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EnhancedCLodopManager,
    getEnhancedCLodopManager,
    checkCLodopStatusEnhanced,
    getReliableCLodopEnhanced,
  };
}
