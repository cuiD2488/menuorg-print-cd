class PrinterManager {
  constructor() {
    this.printers = [];
    this.selectedPrinters = [];
    this.isInitialized = false;
    this.globalFontSize = 0; // 0=小, 1=中, 2=大
  }

  async init() {
    try {
      await this.loadPrinters();
      await this.loadConfig();
      this.isInitialized = true;
      console.log('打印机管理器初始化完成');
    } catch (error) {
      console.error('打印机管理器初始化失败:', error);
    }
  }

  async loadPrinters() {
    try {
      this.printers = await window.electronAPI.getPrinters();
      console.log('已加载打印机列表:', this.printers);

      // 确保每个打印机都有完整的属性
      this.printers = this.printers.map((printer) => ({
        name: printer.name || '',
        status: printer.status || 'Ready',
        width: printer.width || 80,
        isThermal: printer.isThermal || false,
        isEnabled: printer.isEnabled || false,
        fontSize: printer.fontSize || 0,
        isDefault: printer.isDefault || false,
      }));

      return this.printers;
    } catch (error) {
      console.error('加载打印机列表失败:', error);
      this.printers = [];
      return [];
    }
  }

  async loadConfig() {
    try {
      const config = await window.electronAPI.getConfig();
      if (config.selectedPrinters) {
        this.selectedPrinters = config.selectedPrinters;
      }
      if (config.globalFontSize !== undefined) {
        this.globalFontSize = config.globalFontSize;
      }
      if (config.printerSettings) {
        // 合并保存的打印机设置
        this.printers = this.printers.map((printer) => {
          const savedSettings = config.printerSettings.find(
            (p) => p.name === printer.name
          );
          return savedSettings ? { ...printer, ...savedSettings } : printer;
        });
      }
      console.log('已加载打印机配置:', this.selectedPrinters);
    } catch (error) {
      console.error('加载打印机配置失败:', error);
    }
  }

  async saveConfig() {
    try {
      const config = {
        selectedPrinters: this.selectedPrinters,
        globalFontSize: this.globalFontSize,
        printerSettings: this.printers.map((p) => ({
          name: p.name,
          width: p.width,
          isEnabled: p.isEnabled,
          fontSize: p.fontSize,
        })),
        lastUpdated: new Date().toISOString(),
      };
      await window.electronAPI.saveConfig(config);
      console.log('打印机配置已保存');
      return true;
    } catch (error) {
      console.error('保存打印机配置失败:', error);
      return false;
    }
  }

  setSelectedPrinters(printerNames) {
    this.selectedPrinters = Array.isArray(printerNames)
      ? printerNames
      : [printerNames];
    console.log('已设置选中的打印机:', this.selectedPrinters);
    this.saveConfig();
  }

  getSelectedPrinters() {
    return this.selectedPrinters;
  }

  getAllPrinters() {
    return this.printers;
  }

  // 获取启用的打印机
  getEnabledPrinters() {
    return this.printers.filter((p) => p.isEnabled);
  }

  // 切换打印机启用状态
  togglePrinter(printerName, enabled) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (printer) {
      printer.isEnabled = enabled;
      console.log(`打印机 ${printerName} 已${enabled ? '启用' : '禁用'}`);
      this.saveConfig();
      return true;
    }
    return false;
  }

  // 设置打印机字体大小
  setPrinterFontSize(printerName, fontSize) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (printer && fontSize >= 0 && fontSize <= 2) {
      printer.fontSize = fontSize;
      console.log(`打印机 ${printerName} 字体大小设置为: ${fontSize}`);
      this.saveConfig();
      return true;
    }
    return false;
  }

  // 设置全局字体大小
  setGlobalFontSize(fontSize) {
    if (fontSize >= 0 && fontSize <= 2) {
      this.globalFontSize = fontSize;
      // 同时更新所有打印机的字体大小
      this.printers.forEach((printer) => {
        printer.fontSize = fontSize;
      });
      console.log(`全局字体大小设置为: ${fontSize}`);
      this.saveConfig();
      return true;
    }
    return false;
  }

  // 获取全局字体大小
  getGlobalFontSize() {
    return this.globalFontSize;
  }

  // 获取字体大小文本
  getFontSizeText(fontSize) {
    switch (fontSize) {
      case 0:
        return '小';
      case 1:
        return '中';
      case 2:
        return '大';
      default:
        return '未知';
    }
  }

  async testPrint(printerName = null) {
    const printersToTest = printerName
      ? [printerName]
      : this.getEnabledPrinters().map((p) => p.name);

    if (printersToTest.length === 0) {
      throw new Error('没有启用的打印机可供测试');
    }

    const results = [];

    for (const printerNameToTest of printersToTest) {
      try {
        const printer = this.printers.find((p) => p.name === printerNameToTest);
        const width = printer ? printer.width : 80;
        const fontSize = printer ? printer.fontSize : this.globalFontSize;

        console.log(
          `开始测试打印机: ${printerNameToTest} (宽度: ${width}mm, 字体: ${this.getFontSizeText(
            fontSize
          )})`
        );
        await window.electronAPI.testPrint(printerNameToTest, width, fontSize);
        results.push({ printer: printerNameToTest, success: true });
        console.log(`打印机测试成功: ${printerNameToTest}`);
      } catch (error) {
        console.error(`打印机测试失败: ${printerNameToTest}`, error);
        results.push({
          printer: printerNameToTest,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  async printOrder(orderData, printerName = null) {
    if (!orderData) {
      throw new Error('订单数据不能为空');
    }

    console.log('开始打印订单:', orderData.order_id || 'Unknown');

    // 如果指定了打印机名称，只打印到该打印机
    if (printerName) {
      const printer = this.printers.find((p) => p.name === printerName);
      if (!printer) {
        throw new Error(`找不到指定的打印机: ${printerName}`);
      }

      console.log(`向指定打印机打印: ${printerName}`);
      return await this.printToSinglePrinter(orderData, printer);
    }

    // 否则，向所有选中的打印机打印
    const selectedPrinters = this.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      throw new Error('没有选择任何打印机，无法打印订单');
    }

    console.log(`向 ${selectedPrinters.length} 台选中的打印机打印订单`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const results = [];

    // 并行向所有选中的打印机打印
    const printPromises = selectedPrinters.map(async (printerName) => {
      const printer = this.printers.find((p) => p.name === printerName);
      if (!printer) {
        const error = `找不到打印机: ${printerName}`;
        errors.push(error);
        errorCount++;
        return { printer: printerName, success: false, error };
      }

      try {
        console.log(`向打印机 ${printerName} 发送订单打印`);
        await this.printToSinglePrinter(orderData, printer);
        successCount++;
        console.log(`打印机 ${printerName} 订单打印成功`);
        return { printer: printerName, success: true };
      } catch (error) {
        errorCount++;
        const errorMsg = `${printerName}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`打印机 ${printerName} 订单打印失败:`, error);
        return { printer: printerName, success: false, error: error.message };
      }
    });

    const printResults = await Promise.all(printPromises);
    results.push(...printResults);

    // 汇总结果
    const summary = {
      总打印机数: selectedPrinters.length,
      成功数量: successCount,
      失败数量: errorCount,
      详细结果: results,
      错误列表: errors,
    };

    console.log('订单打印结果汇总:', summary);

    if (successCount === 0) {
      throw new Error(`所有打印机都打印失败: ${errors.join('; ')}`);
    }

    if (errorCount > 0) {
      console.warn(
        `订单打印部分成功: ${successCount} 成功, ${errorCount} 失败`
      );
    }

    return summary;
  }

  // 向单个打印机打印的辅助方法
  async printToSinglePrinter(orderData, printer) {
    try {
      const width = printer.width || 80;
      const fontSize =
        printer.fontSize !== undefined ? printer.fontSize : this.globalFontSize;

      console.log(
        `打印机 ${printer.name}: 宽度=${width}mm, 字体=${this.getFontSizeText(
          fontSize
        )}`
      );

      await window.electronAPI.printOrder(orderData, width, fontSize);
      return true;
    } catch (error) {
      console.error(`打印机 ${printer.name} 打印失败:`, error);
      throw error;
    }
  }

  // 生成打印预览
  async generatePrintPreview(orderData, settings = {}) {
    try {
      const enabledPrinters = this.getEnabledPrinters();
      const printer =
        enabledPrinters.length > 0
          ? enabledPrinters[0]
          : { width: 80, fontSize: 0 };

      const previewSettings = {
        paperWidth: settings.paperWidth || printer.width || 80,
        fontSize:
          settings.fontSize !== undefined
            ? settings.fontSize
            : printer.fontSize !== undefined
            ? printer.fontSize
            : this.globalFontSize,
        fontFamily: settings.fontFamily || 'SimSun',
        lineSpacing: settings.lineSpacing || 1.2,
        margin: settings.margin || 5,
        showLogo: settings.showLogo !== undefined ? settings.showLogo : true,
        showOrderTime:
          settings.showOrderTime !== undefined ? settings.showOrderTime : true,
        showItemDetails:
          settings.showItemDetails !== undefined
            ? settings.showItemDetails
            : true,
        showSeparator:
          settings.showSeparator !== undefined ? settings.showSeparator : true,
      };

      return await window.electronAPI.generatePrintPreview(
        orderData,
        previewSettings
      );
    } catch (error) {
      console.error('生成打印预览失败:', error);
      throw error;
    }
  }

  async refreshPrinters() {
    await this.loadPrinters();
    return this.printers;
  }

  isPrinterAvailable(printerName) {
    return this.printers.some(
      (printer) => printer.name === printerName && printer.status !== 'Error'
    );
  }

  getAvailablePrinters() {
    return this.printers.filter((printer) => printer.status !== 'Error');
  }

  getPrinterStatus(printerName) {
    const printer = this.printers.find((p) => p.name === printerName);
    return printer ? printer.status : 'Unknown';
  }

  getPrinterInfo(printerName) {
    return this.printers.find((p) => p.name === printerName);
  }

  isAnyPrinterSelected() {
    return this.selectedPrinters.length > 0;
  }

  isAnyPrinterEnabled() {
    return this.printers.some((p) => p.isEnabled);
  }

  getSelectedPrintersCount() {
    return this.selectedPrinters.length;
  }

  getEnabledPrintersCount() {
    return this.printers.filter((p) => p.isEnabled).length;
  }

  validateSelectedPrinters() {
    // 检查选中的打印机是否仍然可用
    const availablePrinterNames = this.printers.map((p) => p.name);
    const validSelectedPrinters = this.selectedPrinters.filter((name) =>
      availablePrinterNames.includes(name)
    );

    if (validSelectedPrinters.length !== this.selectedPrinters.length) {
      console.warn('部分选中的打印机不再可用，已自动移除');
      this.selectedPrinters = validSelectedPrinters;
      this.saveConfig();
    }

    return validSelectedPrinters;
  }

  // 获取打印机类型文本
  getPrinterTypeText(printer) {
    if (printer.isThermal) {
      return `热敏打印机 (${printer.width}mm)`;
    } else {
      return `普通打印机 (${printer.width}mm)`;
    }
  }

  // 获取打印机状态图标
  getPrinterStatusIcon(printer) {
    if (!printer.isEnabled) return '⚪'; // 禁用
    switch (printer.status) {
      case 'Ready':
        return '🟢'; // 就绪
      case 'Error':
        return '🔴'; // 错误
      case 'Offline':
        return '🟡'; // 离线
      default:
        return '⚪'; // 未知
    }
  }

  // 获取打印机状态文本
  getPrinterStatusText(printer) {
    if (!printer.isEnabled) return '已禁用';
    switch (printer.status) {
      case 'Ready':
        return '就绪';
      case 'Error':
        return '错误';
      case 'Offline':
        return '离线';
      default:
        return '未知';
    }
  }
}
