// C-Lodop 连接管理器
// 解决C-Lodop偶尔连接失败和检测不到的问题
// 提供自动重连、状态监控和故障恢复机制

console.log('[CLODOP-MANAGER] C-Lodop连接管理器开始加载...');

class CLodopConnectionManager {
  constructor() {
    this.LODOP = null;
    this.isConnected = false;
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, error
    this.lastConnectionTime = null;
    this.connectionAttempts = 0;
    this.maxRetryAttempts = 5;
    this.retryDelay = 2000; // 2秒
    this.healthCheckInterval = 30000; // 30秒健康检查
    this.healthCheckTimer = null;

    // 连接事件监听器
    this.eventListeners = {
      connected: [],
      disconnected: [],
      reconnecting: [],
      error: [],
    };

    // C-Lodop端口配置
    this.ports = [8000, 18000, 8001, 18001]; // 扩展端口列表

    console.log('[CLODOP-MANAGER] 连接管理器初始化完成');
  }

  // 添加事件监听器
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  // 触发事件
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[CLODOP-MANAGER] 事件监听器错误 (${event}):`, error);
        }
      });
    }
  }

  // 初始化连接
  async connect() {
    console.log('[CLODOP-MANAGER] 开始连接C-Lodop...');
    this.connectionState = 'connecting';
    this.emit('reconnecting', { attempt: this.connectionAttempts + 1 });

    try {
      // 重置全局状态
      this.resetGlobalState();

      // 尝试多种连接方式
      const connection = await this.attemptConnection();

      if (connection.success) {
        this.LODOP = connection.lodop;
        this.isConnected = true;
        this.connectionState = 'connected';
        this.lastConnectionTime = new Date();
        this.connectionAttempts = 0;

        console.log('[CLODOP-MANAGER] ✅ C-Lodop连接成功');
        console.log('[CLODOP-MANAGER] 版本:', this.LODOP.VERSION);

        // 启动健康检查
        this.startHealthCheck();

        // 触发连接成功事件
        this.emit('connected', {
          version: this.LODOP.VERSION,
          timestamp: this.lastConnectionTime,
        });

        return { success: true, lodop: this.LODOP };
      } else {
        throw new Error(connection.error || 'C-Lodop连接失败');
      }
    } catch (error) {
      console.error('[CLODOP-MANAGER] ❌ 连接失败:', error.message);
      this.handleConnectionError(error);
      return { success: false, error: error.message };
    }
  }

  // 重置全局C-Lodop状态
  resetGlobalState() {
    if (typeof window !== 'undefined') {
      window.CreatedOKLodopObject = null;
      window.CLodopIsLocal = false;
      window.CLodopJsState = null;
    }
  }

  // 尝试连接C-Lodop
  async attemptConnection() {
    console.log('[CLODOP-MANAGER] 尝试连接，端口列表:', this.ports);

    // 方法1: 检查现有连接
    if (
      typeof window !== 'undefined' &&
      typeof window.getLodop === 'function'
    ) {
      try {
        const existingLodop = window.getLodop();
        if (this.validateLodopObject(existingLodop)) {
          console.log('[CLODOP-MANAGER] 使用现有C-Lodop连接');
          return { success: true, lodop: existingLodop };
        }
      } catch (error) {
        console.warn('[CLODOP-MANAGER] 现有连接验证失败:', error);
      }
    }

    // 方法2: 通过端口连接
    for (const port of this.ports) {
      try {
        console.log(`[CLODOP-MANAGER] 尝试端口 ${port}...`);
        const lodop = await this.connectToPort(port);

        if (this.validateLodopObject(lodop)) {
          console.log(`[CLODOP-MANAGER] ✅ 端口 ${port} 连接成功`);
          return { success: true, lodop: lodop };
        }
      } catch (error) {
        console.warn(`[CLODOP-MANAGER] 端口 ${port} 连接失败:`, error.message);
        continue;
      }
    }

    // 方法3: 尝试ActiveX (IE浏览器)
    if (this.isIEBrowser()) {
      try {
        console.log('[CLODOP-MANAGER] 尝试ActiveX连接...');
        const lodop = new ActiveXObject('Lodop.LodopCtrl.1');

        if (this.validateLodopObject(lodop)) {
          console.log('[CLODOP-MANAGER] ✅ ActiveX连接成功');
          return { success: true, lodop: lodop };
        }
      } catch (error) {
        console.warn('[CLODOP-MANAGER] ActiveX连接失败:', error);
      }
    }

    return { success: false, error: '所有连接方式都失败了' };
  }

  // 连接到指定端口
  async connectToPort(port) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        const url = `http://localhost:${port}/CLodopfuncs.js`;

        // 设置超时
        xhr.timeout = 5000;

        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              try {
                // 执行返回的JavaScript代码
                eval(xhr.responseText);

                if (typeof getLodop !== 'undefined') {
                  const lodop = getLodop();
                  resolve(lodop);
                } else {
                  reject(new Error('getLodop函数未定义'));
                }
              } catch (evalError) {
                reject(new Error(`代码执行失败: ${evalError.message}`));
              }
            } else {
              reject(new Error(`HTTP错误: ${xhr.status}`));
            }
          }
        };

        xhr.ontimeout = function () {
          reject(new Error('连接超时'));
        };

        xhr.onerror = function () {
          reject(new Error('网络错误'));
        };

        xhr.open('GET', url, true);
        xhr.send();
      } catch (error) {
        reject(error);
      }
    });
  }

  // 验证C-Lodop对象
  validateLodopObject(lodop) {
    if (!lodop) {
      return false;
    }

    try {
      // 检查版本信息
      if (!lodop.VERSION) {
        console.warn('[CLODOP-MANAGER] C-Lodop对象无版本信息');
        return false;
      }

      // 检查基本功能
      if (typeof lodop.GET_PRINTER_COUNT !== 'function') {
        console.warn('[CLODOP-MANAGER] C-Lodop对象缺少基本功能');
        return false;
      }

      // 尝试获取打印机数量（这是最常用的测试）
      const printerCount = lodop.GET_PRINTER_COUNT();
      console.log(`[CLODOP-MANAGER] 验证通过，检测到 ${printerCount} 台打印机`);

      return true;
    } catch (error) {
      console.warn('[CLODOP-MANAGER] C-Lodop对象验证失败:', error);
      return false;
    }
  }

  // 检查是否为IE浏览器
  isIEBrowser() {
    const ua = navigator.userAgent;
    return ua.indexOf('MSIE') >= 0 || ua.indexOf('Trident') >= 0;
  }

  // 处理连接错误
  handleConnectionError(error) {
    this.isConnected = false;
    this.connectionState = 'error';
    this.connectionAttempts++;

    console.error(
      `[CLODOP-MANAGER] 连接错误 (尝试 ${this.connectionAttempts}/${this.maxRetryAttempts}):`,
      error.message
    );

    this.emit('error', {
      error: error.message,
      attempts: this.connectionAttempts,
      maxAttempts: this.maxRetryAttempts,
    });

    // 停止健康检查
    this.stopHealthCheck();
  }

  // 自动重连
  async autoReconnect() {
    if (this.connectionAttempts >= this.maxRetryAttempts) {
      console.error('[CLODOP-MANAGER] ❌ 达到最大重试次数，停止重连');
      this.emit('disconnected', { reason: '达到最大重试次数' });
      return { success: false, error: '达到最大重试次数' };
    }

    console.log(
      `[CLODOP-MANAGER] 🔄 ${this.retryDelay}ms 后进行第 ${
        this.connectionAttempts + 1
      } 次重连...`
    );

    await this.sleep(this.retryDelay);

    // 指数退避策略
    this.retryDelay = Math.min(this.retryDelay * 1.5, 10000);

    return await this.connect();
  }

  // 启动健康检查
  startHealthCheck() {
    this.stopHealthCheck(); // 确保不会重复启动

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);

    console.log(
      `[CLODOP-MANAGER] 健康检查已启动，间隔 ${this.healthCheckInterval}ms`
    );
  }

  // 停止健康检查
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // 执行健康检查
  async performHealthCheck() {
    if (!this.isConnected || !this.LODOP) {
      return;
    }

    try {
      // 简单的健康检查：获取打印机数量
      const printerCount = this.LODOP.GET_PRINTER_COUNT();
      console.log(
        `[CLODOP-MANAGER] 💓 健康检查通过，打印机数量: ${printerCount}`
      );
    } catch (error) {
      console.error('[CLODOP-MANAGER] ❤️‍🩹 健康检查失败:', error.message);

      // 连接可能断开，尝试重连
      this.isConnected = false;
      this.connectionState = 'disconnected';

      this.emit('disconnected', { reason: '健康检查失败' });

      // 自动重连
      this.autoReconnect();
    }
  }

  // 获取连接状态
  getStatus() {
    return {
      isConnected: this.isConnected,
      connectionState: this.connectionState,
      lastConnectionTime: this.lastConnectionTime,
      connectionAttempts: this.connectionAttempts,
      version: this.LODOP ? this.LODOP.VERSION : null,
      printerCount: this.getPrinterCount(),
    };
  }

  // 获取打印机数量
  getPrinterCount() {
    if (!this.isConnected || !this.LODOP) {
      return 0;
    }

    try {
      return this.LODOP.GET_PRINTER_COUNT();
    } catch (error) {
      console.error('[CLODOP-MANAGER] 获取打印机数量失败:', error);
      return 0;
    }
  }

  // 获取C-Lodop对象（供外部使用）
  getLodop() {
    if (!this.isConnected || !this.LODOP) {
      console.warn('[CLODOP-MANAGER] C-Lodop未连接，尝试重连...');
      // 异步重连，不阻塞当前调用
      this.connect().catch((error) => {
        console.error('[CLODOP-MANAGER] 自动重连失败:', error);
      });
      return null;
    }

    return this.LODOP;
  }

  // 强制重连
  async forceReconnect() {
    console.log('[CLODOP-MANAGER] 🔄 强制重连...');

    this.stopHealthCheck();
    this.isConnected = false;
    this.LODOP = null;
    this.connectionAttempts = 0;
    this.retryDelay = 2000;

    return await this.connect();
  }

  // 断开连接
  disconnect() {
    console.log('[CLODOP-MANAGER] 断开C-Lodop连接');

    this.stopHealthCheck();
    this.isConnected = false;
    this.connectionState = 'disconnected';
    this.LODOP = null;

    this.emit('disconnected', { reason: '主动断开' });
  }

  // 工具函数：休眠
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 检查C-Lodop服务状态
  async checkServiceStatus() {
    console.log('[CLODOP-MANAGER] 检查C-Lodop服务状态...');

    const results = {
      serviceRunning: false,
      portsAccessible: [],
      errors: [],
    };

    // 检查各个端口
    for (const port of this.ports) {
      try {
        const response = await fetch(
          `http://localhost:${port}/CLodopfuncs.js`,
          {
            method: 'HEAD',
            timeout: 2000,
          }
        );

        if (response.ok) {
          results.portsAccessible.push(port);
          results.serviceRunning = true;
        }
      } catch (error) {
        results.errors.push(`端口 ${port}: ${error.message}`);
      }
    }

    console.log('[CLODOP-MANAGER] 服务状态检查结果:', results);
    return results;
  }

  // 记录安装提示（不显示弹窗）
  showInstallPrompt() {
    const message = `C-Lodop连接失败详情：
- 连接状态：${this.connectionState}
- 尝试次数：${this.connectionAttempts}/${this.maxRetryAttempts}
- 上次连接：${
      this.lastConnectionTime
        ? this.lastConnectionTime.toLocaleString()
        : '从未连接'
    }

解决方案：
1. 确认已安装C-Lodop软件
2. 检查C-Lodop服务是否启动（系统托盘图标）
3. 尝试重启C-Lodop服务
4. 检查防火墙设置
5. 如果问题持续，请重新安装C-Lodop`;

    console.warn('[CLODOP-MANAGER] C-Lodop连接失败');
    console.warn('[CLODOP-MANAGER]', message);

    // 静默处理，不显示弹窗，只记录日志
    // 用户已安装C-Lodop但偶尔连接失败时，不需要弹窗提示
  }
}

// 创建全局连接管理器实例
let globalCLodopManager = null;

// 获取全局连接管理器
function getCLodopManager() {
  if (!globalCLodopManager) {
    globalCLodopManager = new CLodopConnectionManager();
  }
  return globalCLodopManager;
}

// 增强的getLodop函数，提供更可靠的连接
async function getReliableLodop() {
  const manager = getCLodopManager();

  // 如果已连接，直接返回
  if (manager.isConnected) {
    return manager.getLodop();
  }

  // 尝试连接
  const result = await manager.connect();
  if (result.success) {
    return result.lodop;
  } else {
    console.error('[CLODOP-MANAGER] 可靠连接失败:', result.error);

    // 记录失败信息，不显示弹窗
    manager.showInstallPrompt();
    return null;
  }
}

// 检查并自动修复C-Lodop连接
async function ensureCLodopConnection() {
  const manager = getCLodopManager();

  if (manager.isConnected) {
    return { success: true, lodop: manager.getLodop() };
  }

  console.log('[CLODOP-MANAGER] 检测到C-Lodop未连接，尝试自动连接...');

  const result = await manager.connect();
  if (
    !result.success &&
    manager.connectionAttempts < manager.maxRetryAttempts
  ) {
    // 如果首次连接失败，尝试自动重连
    return await manager.autoReconnect();
  }

  return result;
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.CLodopConnectionManager = CLodopConnectionManager;
  window.getCLodopManager = getCLodopManager;
  window.getReliableLodop = getReliableLodop;
  window.ensureCLodopConnection = ensureCLodopConnection;

  console.log('[CLODOP-MANAGER] 连接管理器已加载到全局作用域');
}

// Node.js导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CLodopConnectionManager,
    getCLodopManager,
    getReliableLodop,
    ensureCLodopConnection,
  };
}

console.log('[CLODOP-MANAGER] C-Lodop连接管理器加载完成');
