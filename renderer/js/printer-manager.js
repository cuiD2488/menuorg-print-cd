// 智能打印机管理器
// 根据构建配置自动选择打印引擎：原生引擎或C-Lodop
// 集成增强的CLodop状态管理，解决时序和缓存问题

class PrinterManager {
  constructor() {
    this.selectedPrinters = [];
    this.currentEngine = null;
    this.nativeManager = null;
    this.lodopManager = null;
    this.buildConfig = null;
    this.isInitialized = false;
    this.systemPrinters = [];
    this.enhancedCLodopManager = null;
    this.initializationPromise = null;
    this.isInitializing = false;

    console.log('[PrinterManager] 智能打印机管理器初始化');
  }

  async init() {
    // 防止重复初始化
    if (this.isInitializing) {
      console.log('[PrinterManager] 初始化正在进行中，等待完成...');
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      console.log('[PrinterManager] 已经初始化完成，返回状态');
      return this.getInitResult();
    }

    this.isInitializing = true;
    this.initializationPromise = this.performInit();

    try {
      const result = await this.initializationPromise;
      this.isInitialized = true;
      return result;
    } finally {
      this.isInitializing = false;
    }
  }

  async performInit() {
    try {
      console.log('[PrinterManager] 开始初始化打印机管理器...');

      // 加载构建配置
      await this.loadBuildConfig();

      // 根据构建配置选择打印引擎
      if (this.buildConfig && this.buildConfig.useLodop) {
        console.log('[PrinterManager] 使用 C-Lodop 打印引擎');
        await this.initLodopEngineEnhanced();
      } else {
        console.log('[PrinterManager] 使用原生打印引擎');
        await this.initNativeEngine();
      }

      console.log('[PrinterManager] 打印机管理器初始化完成');

      return this.getInitResult();
    } catch (error) {
      console.error('[PrinterManager] 初始化失败:', error);
      return {
        success: false,
        error: error.message,
        engine: 'none',
      };
    }
  }

  getInitResult() {
    return {
      success: this.isInitialized,
      engine: this.currentEngine,
      buildMode: this.buildConfig ? this.buildConfig.buildMode : 'normal',
      useLodop: this.buildConfig ? this.buildConfig.useLodop : false,
    };
  }

  async loadBuildConfig() {
    try {
      // 尝试加载构建配置文件
      const response = await fetch('./build-config.json');
      if (response.ok) {
        this.buildConfig = await response.json();
        console.log('[PrinterManager] 构建配置加载成功:', this.buildConfig);
      } else {
        console.log('[PrinterManager] 构建配置文件不存在，使用CLodop默认配置');
        this.buildConfig = { buildMode: 'clodop', useLodop: true };
      }
    } catch (error) {
      console.warn(
        '[PrinterManager] 加载构建配置失败，使用CLodop默认配置:',
        error
      );
      this.buildConfig = { buildMode: 'clodop', useLodop: true };
    }
  }

  async initNativeEngine() {
    try {
      // 导入原生打印机管理器类（如果存在）
      if (typeof NativePrinterManager !== 'undefined') {
        this.nativeManager = new NativePrinterManager();
        await this.nativeManager.init();
        this.currentEngine = 'Native';
      } else {
        // 使用现有的electron API方式
        console.log('[PrinterManager] 使用 Electron API 打印引擎');
        await this.initElectronEngine();
        this.currentEngine = 'Electron';
      }
    } catch (error) {
      console.error('[PrinterManager] 原生引擎初始化失败:', error);
      throw error;
    }
  }

  // 增强的CLodop引擎初始化
  async initLodopEngineEnhanced() {
    try {
      console.log('[PrinterManager] 开始增强CLodop引擎初始化...');

      // 确保增强管理器已加载
      if (typeof window.getEnhancedCLodopManager === 'undefined') {
        console.log('[PrinterManager] 加载增强的CLodop管理器...');
        // 动态加载增强管理器（如果需要）
        await this.loadEnhancedManager();
      }

      // 获取增强的CLodop管理器
      this.enhancedCLodopManager = window.getEnhancedCLodopManager();

      // 监听连接事件
      this.setupCLodopEventListeners();

      // 执行增强的状态检查
      console.log('[PrinterManager] 执行增强的CLodop状态检查...');
      const status = await this.enhancedCLodopManager.checkStatus();

      if (status.available && status.lodop) {
        // CLodop可用，初始化Lodop管理器
        await this.initLodopManagerWithEnhanced(status.lodop);
        this.currentEngine = 'C-Lodop-Enhanced';

        console.log('[PrinterManager] ✅ 增强CLodop引擎初始化成功');
        console.log(
          `[PrinterManager] CLodop版本: ${status.version}, 打印机数量: ${status.printerCount}`
        );

        // 立即测试打印机列表
        await this.testLodopConnection();
      } else {
        throw new Error(`CLodop不可用: ${status.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[PrinterManager] 增强CLodop引擎初始化失败:', error);
      await this.handleLodopInitFailure(error);
    }
  }

  // 设置CLodop事件监听
  setupCLodopEventListeners() {
    if (!this.enhancedCLodopManager) return;

    this.enhancedCLodopManager.on('checking', (data) => {
      console.log(`[PrinterManager] CLodop检查中... (尝试 ${data.attempt})`);
    });

    this.enhancedCLodopManager.on('retry', (data) => {
      console.log(
        `[PrinterManager] CLodop重试中... (${data.attempt}) 延迟: ${data.delay}ms`
      );
    });

    this.enhancedCLodopManager.on('connected', (data) => {
      console.log(`[PrinterManager] ✅ CLodop连接成功: ${data.version}`);
    });

    this.enhancedCLodopManager.on('disconnected', (data) => {
      console.warn(`[PrinterManager] ⚠️ CLodop连接断开: ${data.reason}`);
      this.handleCLodopDisconnection();
    });

    this.enhancedCLodopManager.on('failed', (data) => {
      console.error(`[PrinterManager] ❌ CLodop连接失败: ${data.error}`);
    });
  }

  // 处理CLodop断开连接
  async handleCLodopDisconnection() {
    console.log('[PrinterManager] 处理CLodop断开连接...');

    // 尝试重新连接
    try {
      const status = await this.enhancedCLodopManager.reconnect();
      if (status.available) {
        console.log('[PrinterManager] ✅ CLodop重新连接成功');
        // 重新初始化Lodop管理器
        await this.initLodopManagerWithEnhanced(status.lodop);
      }
    } catch (error) {
      console.error('[PrinterManager] CLodop重新连接失败:', error);
      // 可以考虑回退到系统打印机
    }
  }

  // 使用增强管理器初始化Lodop管理器
  async initLodopManagerWithEnhanced(lodopObject) {
    try {
      if (typeof window.LodopPrinterManager === 'undefined') {
        throw new Error(
          'LodopPrinterManager 类未找到，请确保 printer-lodop.js 已正确加载'
        );
      }

      // 创建Lodop打印机管理器，传入已连接的LODOP对象
      this.lodopManager = new window.LodopPrinterManager();

      // 如果管理器支持直接设置LODOP对象，则使用它
      if (typeof this.lodopManager.setLodopObject === 'function') {
        this.lodopManager.setLodopObject(lodopObject);
      }

      const result = await this.lodopManager.init();

      if (!result.success) {
        throw new Error(`Lodop管理器初始化失败: ${result.error}`);
      }

      console.log('[PrinterManager] Lodop管理器初始化成功');
    } catch (error) {
      console.error('[PrinterManager] Lodop管理器初始化失败:', error);
      throw error;
    }
  }

  // 测试Lodop连接
  async testLodopConnection() {
    try {
      if (!this.lodopManager) return;

      const printers = await this.lodopManager.refreshPrinters();
      console.log('[PrinterManager] Lodop连接测试成功，打印机列表:', printers);

      if (!printers || printers.length === 0) {
        console.warn('[PrinterManager] ⚠️ Lodop连接成功但未找到打印机');
      } else {
        console.log(
          `[PrinterManager] ✅ 成功获取到 ${printers.length} 台打印机`
        );
      }
    } catch (error) {
      console.error('[PrinterManager] Lodop连接测试失败:', error);
      throw error;
    }
  }

  // 处理Lodop初始化失败
  async handleLodopInitFailure(error) {
    console.error('[PrinterManager] CLodop初始化失败，准备回退:', error);

    // 显示用户友好的错误信息
    this.showCLodopInstallationGuidance(error);

    // 回退到系统打印机
    console.log('[PrinterManager] 回退到系统打印机引擎...');
    await this.initSystemPrinterFallback();
  }

  // 显示CLodop安装指导
  showCLodopInstallationGuidance(error) {
    // 延迟显示，避免干扰启动流程
    setTimeout(() => {
      const errorMsg = error.message || error.toString();

      if (
        errorMsg.includes('未安装') ||
        errorMsg.includes('不可用') ||
        errorMsg.includes('连接失败')
      ) {
        console.log('[PrinterManager] 显示CLodop安装指导');

        // 检查是否有安装函数可用
        if (typeof window.installCLodop === 'function') {
          window.installCLodop();
        } else {
          // 静默处理，记录建议
          console.warn('═══ CLodop连接失败 ═══');
          console.warn('建议检查以下项目:');
          console.warn('1. CLodop服务是否已启动');
          console.warn('2. 防火墙是否阻止了端口8000或18000');
          console.warn('3. 是否需要重新安装CLodop');
          console.warn('4. 系统是否刚启动，CLodop服务可能还在启动中');
          console.warn('═══════════════════');
        }
      }
    }, 2000); // 延迟2秒显示
  }

  // 加载增强管理器（如果需要动态加载）
  async loadEnhancedManager() {
    if (typeof window.getEnhancedCLodopManager !== 'undefined') {
      return; // 已经加载
    }

    try {
      // 这里可以动态加载增强管理器脚本
      console.log('[PrinterManager] 增强管理器已内置，无需动态加载');
    } catch (error) {
      console.error('[PrinterManager] 加载增强管理器失败:', error);
      throw new Error('无法加载增强的CLodop管理器');
    }
  }

  async initElectronEngine() {
    try {
      // 使用现有的Electron API方式获取打印机
      const result = await window.electronAPI.getPrinters();
      console.log('[PrinterManager] Electron API 获取打印机成功');
      return result;
    } catch (error) {
      console.error('[PrinterManager] Electron API 初始化失败:', error);
      throw error;
    }
  }

  // 获取当前使用的打印引擎
  getCurrentEngine() {
    return this.currentEngine;
  }

  // 获取构建配置
  getBuildConfig() {
    return this.buildConfig;
  }

  // 统一的打印机操作接口 - 增强版
  async refreshPrinters() {
    if (!this.isInitialized) {
      await this.init();
    }

    if (this.currentEngine === 'C-Lodop-Enhanced' && this.lodopManager) {
      // 使用增强版CLodop
      return await this.lodopManager.refreshPrinters();
    } else if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      // 传统CLodop
      return await this.lodopManager.refreshPrinters();
    } else if (
      this.currentEngine === 'System-Fallback' ||
      this.currentEngine === 'None'
    ) {
      // 返回系统回退打印机
      console.log('[PrinterManager] 返回系统回退打印机列表');
      return this.systemPrinters || [];
    } else {
      // 使用原生或Electron API
      return await window.electronAPI.getPrinters();
    }
  }

  getAllPrinters() {
    if (
      (this.currentEngine === 'C-Lodop-Enhanced' ||
        this.currentEngine === 'C-Lodop') &&
      this.lodopManager
    ) {
      return this.lodopManager.getAllPrinters();
    } else if (
      this.currentEngine === 'System-Fallback' ||
      this.currentEngine === 'None'
    ) {
      return this.systemPrinters || [];
    } else {
      // 从存储中获取打印机列表（需要先调用refreshPrinters）
      return this.cachedPrinters || [];
    }
  }

  getSelectedPrinters() {
    if (
      (this.currentEngine === 'C-Lodop-Enhanced' ||
        this.currentEngine === 'C-Lodop') &&
      this.lodopManager
    ) {
      return this.lodopManager.getSelectedPrinters();
    } else {
      return this.selectedPrinters;
    }
  }

  setSelectedPrinters(printerNames) {
    if (
      (this.currentEngine === 'C-Lodop-Enhanced' ||
        this.currentEngine === 'C-Lodop') &&
      this.lodopManager
    ) {
      this.lodopManager.setSelectedPrinters(printerNames);
    } else {
      this.selectedPrinters = printerNames;
      // 保存到配置
      this.saveConfig();
    }
  }

  async printOrder(order) {
    if (
      (this.currentEngine === 'C-Lodop-Enhanced' ||
        this.currentEngine === 'C-Lodop') &&
      this.lodopManager
    ) {
      return await this.lodopManager.printOrder(order);
    } else {
      // 使用原生引擎打印订单
      const selectedPrinters = this.getSelectedPrinters();
      if (selectedPrinters.length === 0) {
        throw new Error('未选择任何打印机');
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // 并行打印到所有选中的打印机
      const printPromises = selectedPrinters.map(async (printerName) => {
        try {
          await window.electronAPI.printOrder(printerName, order);
          successCount++;
          console.log(`[PrinterManager] 订单打印成功: ${printerName}`);
          return { printer: printerName, success: true };
        } catch (error) {
          errorCount++;
          const errorMsg = `${printerName}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[PrinterManager] 订单打印失败 ${printerName}:`, error);
          return { printer: printerName, success: false, error: error.message };
        }
      });

      await Promise.all(printPromises);

      return {
        成功数量: successCount,
        失败数量: errorCount,
        错误列表: errors,
        打印引擎: this.currentEngine,
      };
    }
  }

  async generatePrintPreview(order) {
    if (
      (this.currentEngine === 'C-Lodop-Enhanced' ||
        this.currentEngine === 'C-Lodop') &&
      this.lodopManager
    ) {
      return await this.lodopManager.generatePrintPreview(order);
    } else {
      // 使用原生引擎生成预览
      return await window.electronAPI.generatePrintPreview(order);
    }
  }

  // 获取引擎状态 - 增强版
  getEngineStatus() {
    const baseStatus = {
      currentEngine: this.currentEngine,
      isInitialized: this.isInitialized,
      buildMode: this.buildConfig ? this.buildConfig.buildMode : 'normal',
      useLodop: this.buildConfig ? this.buildConfig.useLodop : false,
    };

    if (
      this.currentEngine === 'C-Lodop-Enhanced' &&
      this.enhancedCLodopManager
    ) {
      // 增强版状态
      const lodopStatus = this.enhancedCLodopManager.checkCache || {};
      return {
        ...baseStatus,
        enhanced: true,
        clodopConnected: this.enhancedCLodopManager.isConnected,
        clodopVersion: lodopStatus.version,
        printerCount: lodopStatus.printerCount || 0,
        selectedCount: this.getSelectedPrinters().length,
        lastCheckTime: this.enhancedCLodopManager.lastCheckTime,
        cacheValid: this.enhancedCLodopManager.checkCache
          ? Date.now() - this.enhancedCLodopManager.lastCheckTime <
            this.enhancedCLodopManager.cacheValidDuration
          : false,
      };
    } else if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      return {
        ...baseStatus,
        enhanced: false,
        ...this.lodopManager.getEngineStatus(),
      };
    } else {
      return {
        ...baseStatus,
        enhanced: false,
        nativeAvailable: true,
        printerCount: this.getAllPrinters().length,
        selectedCount: this.getSelectedPrinters().length,
      };
    }
  }

  // 强制重新检查CLodop状态
  async forceRefreshCLodop() {
    if (this.enhancedCLodopManager) {
      console.log('[PrinterManager] 强制刷新CLodop状态...');
      return await this.enhancedCLodopManager.checkStatus(true);
    } else {
      console.warn('[PrinterManager] 增强管理器不可用，无法强制刷新');
      return null;
    }
  }

  // 重新连接CLodop
  async reconnectCLodop() {
    if (this.enhancedCLodopManager) {
      console.log('[PrinterManager] 重新连接CLodop...');
      const result = await this.enhancedCLodopManager.reconnect();

      if (result.available && this.lodopManager) {
        // 重新初始化Lodop管理器
        await this.initLodopManagerWithEnhanced(result.lodop);
      }

      return result;
    } else {
      console.warn('[PrinterManager] 增强管理器不可用，无法重新连接');
      return null;
    }
  }

  // 保存配置
  async saveConfig() {
    try {
      const config = {
        selectedPrinters: this.getSelectedPrinters(),
        currentEngine: this.currentEngine,
        buildConfig: this.buildConfig,
      };

      await window.electronAPI.saveConfig(config);
      console.log('[PrinterManager] 配置保存成功');
    } catch (error) {
      console.error('[PrinterManager] 保存配置失败:', error);
    }
  }

  // 加载配置
  async loadConfig() {
    try {
      const config = await window.electronAPI.getConfig();
      if (config && config.selectedPrinters) {
        this.setSelectedPrinters(config.selectedPrinters);
        console.log('[PrinterManager] 配置加载成功');
      }
    } catch (error) {
      console.error('[PrinterManager] 加载配置失败:', error);
    }
  }

  // 显示引擎信息 - 增强版
  displayEngineInfo() {
    const status = this.getEngineStatus();
    console.log('=== 增强打印引擎状态 ===');
    console.log(`当前引擎: ${status.currentEngine}`);
    console.log(`构建模式: ${status.buildMode}`);
    console.log(`使用C-Lodop: ${status.useLodop ? '是' : '否'}`);
    console.log(`增强模式: ${status.enhanced ? '启用' : '禁用'}`);
    console.log(
      `初始化状态: ${status.isInitialized ? '已初始化' : '未初始化'}`
    );
    console.log(`打印机数量: ${status.printerCount || 0}`);
    console.log(`已选择数量: ${status.selectedCount || 0}`);

    if (status.enhanced) {
      console.log(
        `CLodop连接: ${status.clodopConnected ? '已连接' : '未连接'}`
      );
      console.log(`CLodop版本: ${status.clodopVersion || '未知'}`);
      console.log(`缓存有效: ${status.cacheValid ? '是' : '否'}`);
      if (status.lastCheckTime) {
        console.log(
          `最后检查: ${new Date(status.lastCheckTime).toLocaleString()}`
        );
      }
    }

    if (status.version) {
      console.log(`引擎版本: ${status.version}`);
    }

    console.log('========================');
  }

  // 新增：系统打印机回退方案
  async initSystemPrinterFallback() {
    try {
      console.log('[PrinterManager] 初始化系统打印机回退方案...');

      // 创建一个模拟的系统打印机管理器
      this.systemPrinters = [];
      this.selectedPrinters = [];
      this.currentEngine = 'System-Fallback';

      // 尝试获取系统打印机（如果可用）
      if (window.electronAPI && window.electronAPI.getPrinters) {
        try {
          const systemPrinters = await window.electronAPI.getPrinters();
          if (systemPrinters && systemPrinters.length > 0) {
            this.systemPrinters = systemPrinters.map((printer) => ({
              name: printer.name || printer,
              id: printer.id || this.systemPrinters.length,
              status: 'Ready',
              isDefault: false,
              isThermal: false,
              width: 210, // A4默认
              fontSize: 0,
              engine: 'System-Fallback',
            }));
            console.log(
              `[PrinterManager] 系统回退方案获取到 ${this.systemPrinters.length} 台打印机`
            );
          }
        } catch (sysError) {
          console.warn('[PrinterManager] 获取系统打印机也失败:', sysError);
        }
      }

      // 如果还是没有打印机，创建一个虚拟打印机用于测试
      if (this.systemPrinters.length === 0) {
        console.log('[PrinterManager] 创建虚拟打印机用于测试');
        this.systemPrinters = [
          {
            name: '虚拟打印机 (请安装CLodop)',
            id: 0,
            status: 'Warning',
            isDefault: true,
            isThermal: false,
            width: 80,
            fontSize: 0,
            engine: 'Virtual',
          },
        ];
      }

      console.log('[PrinterManager] 系统打印机回退方案初始化完成');
    } catch (error) {
      console.error('[PrinterManager] 系统打印机回退方案初始化失败:', error);

      // 最后的回退：创建虚拟打印机
      this.systemPrinters = [
        {
          name: '需要安装CLodop打印控件',
          id: 0,
          status: 'Error',
          isDefault: true,
          isThermal: false,
          width: 80,
          fontSize: 0,
          engine: 'None',
        },
      ];
      this.currentEngine = 'None';
    }
  }

  // 销毁管理器
  destroy() {
    if (this.enhancedCLodopManager) {
      this.enhancedCLodopManager.destroy();
    }

    this.isInitialized = false;
    this.isInitializing = false;
    this.initializationPromise = null;

    console.log('[PrinterManager] 管理器已销毁');
  }
}

// 注意：LodopFuncs.js 和 enhanced-clodop-manager.js 需要在 HTML 中预先加载
