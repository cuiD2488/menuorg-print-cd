// 智能打印机管理器
// 根据构建配置自动选择打印引擎：原生引擎或C-Lodop

class PrinterManager {
  constructor() {
    this.selectedPrinters = [];
    this.currentEngine = null;
    this.nativeManager = null;
    this.lodopManager = null;
    this.buildConfig = null;
    this.isInitialized = false;
    this.systemPrinters = [];

    console.log('[PrinterManager] 智能打印机管理器初始化');
  }

  async init() {
    try {
      console.log('[PrinterManager] 开始初始化打印机管理器...');

      // 加载构建配置
      await this.loadBuildConfig();

      // 根据构建配置选择打印引擎
      if (this.buildConfig && this.buildConfig.useLodop) {
        console.log('[PrinterManager] 使用 C-Lodop 打印引擎');
        await this.initLodopEngine();
      } else {
        console.log('[PrinterManager] 使用原生打印引擎');
        await this.initNativeEngine();
      }

      this.isInitialized = true;
      console.log('[PrinterManager] 打印机管理器初始化完成');

      return {
        success: true,
        engine: this.currentEngine,
        buildMode: this.buildConfig ? this.buildConfig.buildMode : 'normal',
      };
    } catch (error) {
      console.error('[PrinterManager] 初始化失败:', error);
      return {
        success: false,
        error: error.message,
        engine: 'none',
      };
    }
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

  async initLodopEngine() {
    try {
      console.log('[PrinterManager] 开始检查C-Lodop可用性...');

      // 检查多种C-Lodop检测方式
      let lodopAvailable = false;
      let lodopObject = null;

      // 方式1: 检查window.getLodop函数
      if (typeof window.getLodop === 'function') {
        console.log('[PrinterManager] 找到window.getLodop函数');
        try {
          lodopObject = window.getLodop();
          if (lodopObject && lodopObject.VERSION) {
            console.log(
              '[PrinterManager] C-Lodop对象获取成功，版本:',
              lodopObject.VERSION
            );
            lodopAvailable = true;
          } else {
            console.log('[PrinterManager] C-Lodop对象无效或无版本信息');
          }
        } catch (err) {
          console.error('[PrinterManager] 调用getLodop()失败:', err);
        }
      } else {
        console.log('[PrinterManager] window.getLodop函数不存在');
      }

      // 方式2: 检查window.checkCLodopStatus函数
      if (!lodopAvailable && typeof window.checkCLodopStatus === 'function') {
        console.log('[PrinterManager] 尝试使用checkCLodopStatus检查状态');
        try {
          const status = window.checkCLodopStatus();
          console.log('[PrinterManager] C-Lodop状态:', status);
          if (status && status.available) {
            lodopObject = window.getLodop();
            lodopAvailable = true;
          }
        } catch (err) {
          console.error('[PrinterManager] checkCLodopStatus调用失败:', err);
        }
      }

      if (lodopAvailable && lodopObject) {
        // 初始化C-Lodop管理器（使用window对象）
        console.log('[PrinterManager] 开始初始化C-Lodop管理器...');

        console.log('[PrinterManager] 检查window对象:', typeof window);
        console.log(
          '[PrinterManager] 检查window.LodopPrinterManager:',
          typeof window.LodopPrinterManager
        );
        console.log(
          '[PrinterManager] window对象的所有Lodop相关属性:',
          Object.keys(window).filter((key) =>
            key.toLowerCase().includes('lodop')
          )
        );

        if (typeof window.LodopPrinterManager === 'undefined') {
          throw new Error(
            'LodopPrinterManager 类未找到，请确保 printer-lodop.js 已正确加载'
          );
        }

        this.lodopManager = new window.LodopPrinterManager();
        const result = await this.lodopManager.init();

        if (result.success) {
          this.currentEngine = 'C-Lodop';
          console.log('[PrinterManager] C-Lodop 引擎初始化成功');

          // 立即尝试获取打印机列表进行测试
          try {
            const printers = await this.lodopManager.refreshPrinters();
            console.log('[PrinterManager] C-Lodop 打印机列表:', printers);
            if (printers && printers.length > 0) {
              console.log(
                `[PrinterManager] 成功获取到 ${printers.length} 台打印机`
              );
            } else {
              console.warn('[PrinterManager] C-Lodop 初始化成功但未找到打印机');
            }
          } catch (printerError) {
            console.error('[PrinterManager] 获取打印机列表失败:', printerError);
          }
        } else {
          throw new Error(`C-Lodop 初始化失败: ${result.error}`);
        }
      } else {
        throw new Error('C-Lodop 未安装或不可用，将回退到系统打印机');
      }
    } catch (error) {
      console.error('[PrinterManager] C-Lodop 引擎初始化失败:', error);
      console.log('[PrinterManager] 回退到系统打印机引擎...');

      // 显示CLodop安装提示
      if (
        error.message.includes('未安装') ||
        error.message.includes('不可用')
      ) {
        console.log('[PrinterManager] 显示CLodop安装提示');
        setTimeout(() => {
          if (typeof window.installCLodop === 'function') {
            window.installCLodop();
          } else {
            alert(
              '需要安装C-Lodop打印控件才能使用高级打印功能。\n\n请访问 http://www.lodop.net/download.html 下载安装。'
            );
          }
        }, 1000);
      }

      // 回退到系统打印机
      await this.initSystemPrinterFallback();
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

  // 统一的打印机操作接口
  async refreshPrinters() {
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
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
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
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
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      return this.lodopManager.getSelectedPrinters();
    } else {
      return this.selectedPrinters;
    }
  }

  setSelectedPrinters(printerNames) {
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      this.lodopManager.setSelectedPrinters(printerNames);
    } else {
      this.selectedPrinters = printerNames;
      // 保存到配置
      this.saveConfig();
    }
  }

  async testPrint(printerName) {
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      return await this.lodopManager.testPrint(printerName);
    } else {
      // 使用原生引擎测试打印
      return await window.electronAPI.testPrint(printerName);
    }
  }

  async printOrder(order) {
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
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
    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      return await this.lodopManager.generatePrintPreview(order);
    } else {
      // 使用原生引擎生成预览
      return await window.electronAPI.generatePrintPreview(order);
    }
  }

  // 获取引擎状态
  getEngineStatus() {
    const baseStatus = {
      currentEngine: this.currentEngine,
      isInitialized: this.isInitialized,
      buildMode: this.buildConfig ? this.buildConfig.buildMode : 'normal',
      useLodop: this.buildConfig ? this.buildConfig.useLodop : false,
    };

    if (this.currentEngine === 'C-Lodop' && this.lodopManager) {
      return {
        ...baseStatus,
        ...this.lodopManager.getEngineStatus(),
      };
    } else {
      return {
        ...baseStatus,
        nativeAvailable: true,
        printerCount: this.getAllPrinters().length,
        selectedCount: this.getSelectedPrinters().length,
      };
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

  // 显示引擎信息
  displayEngineInfo() {
    const status = this.getEngineStatus();
    console.log('=== 打印引擎状态 ===');
    console.log(`当前引擎: ${status.currentEngine}`);
    console.log(`构建模式: ${status.buildMode}`);
    console.log(`使用C-Lodop: ${status.useLodop ? '是' : '否'}`);
    console.log(
      `初始化状态: ${status.isInitialized ? '已初始化' : '未初始化'}`
    );
    console.log(`打印机数量: ${status.printerCount || 0}`);
    console.log(`已选择数量: ${status.selectedCount || 0}`);

    if (status.version) {
      console.log(`引擎版本: ${status.version}`);
    }

    console.log('==================');
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
}

// 注意：LodopFuncs.js 已经在 HTML 中直接加载，无需动态加载
