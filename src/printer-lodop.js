// C-Lodop 打印机管理器
// 用于兼容 Windows 7 系统的打印解决方案

console.log('[LODOP-SCRIPT] printer-lodop.js 开始加载...');

class LodopPrinterManager {
  constructor() {
    this.LODOP = null;
    this.isInitialized = false;
    this.printers = [];
    this.selectedPrinters = [];

    // 🔧 新增：百分比排版配置
    this.layoutConfig = {
      // 边距配置（百分比）
      margins: {
        left: 1.0, // 左边距：纸张宽度的1%
        right: 1.0, // 右边距：纸张宽度的1%
        top: 3.0, // 顶部边距：3mm固定
        bottom: 3.0, // 底部边距：3mm固定
      },

      // 字符宽度配置（相对于纸张宽度的系数）
      charWidthRatio: {
        58: 0.42, // 58mm纸张：字符宽度 = 纸张宽度 * 0.42
        80: 0.43, // 80mm纸张：字符宽度 = 纸张宽度 * 0.43
        default: 0.4, // 其他尺寸：默认系数
      },

      // 表格列宽配置（百分比分配）
      tableLayout: {
        // 标准布局（适用于80mm及以上）
        standard: {
          nameColumn: 65, // 菜名列占65%
          qtyColumn: 15, // 数量列占15%
          priceColumn: 20, // 价格列占20%
        },
        // 紧凑布局（适用于58mm）
        compact: {
          nameColumn: 60, // 菜名列占60%
          qtyColumn: 15, // 数量列占15%
          priceColumn: 25, // 价格列占25%
        },
        // 超紧凑布局（适用于更小纸张）
        minimal: {
          nameColumn: 55, // 菜名列占55%
          qtyColumn: 20, // 数量列占20%
          priceColumn: 25, // 价格列占25%
        },
      },

      // 费用明细布局配置（百分比）
      feeLayout: {
        labelColumn: 70, // 费用标签列占70%
        amountColumn: 30, // 金额列占30%
      },

      // 字体大小配置（基于纸张宽度）
      fontSize: {
        base: {
          58: 11, // 58mm基础字体11pt
          80: 12, // 80mm基础字体12pt
          default: 10, // 其他尺寸默认10pt
        },
        title: 2, // 标题字体 = 基础字体 + 2pt
        item: 1, // 菜品字体 = 基础字体 + 1pt
        normal: 0, // 普通字体 = 基础字体 + 0pt
      },
    };

    // 🍽️ 新增：分菜打印配置
    this.printTypeConfig = {
      // 打印机编号配置 - 用于分菜打印
      printerNumbers: new Map(), // printerName -> number

      // 是否启用分菜打印模式
      enableSeparatePrinting: false,
    };

    // 🌍 新增：语言配置管理
    this.languageConfig = {
      enableEnglish: true, // 默认启用英文
      enableChinese: false, // 默认禁用中文
    };

    console.log(
      '[LODOP] C-Lodop 打印机管理器初始化（支持百分比排版、分菜打印和多语言）'
    );
  }

  async init() {
    try {
      console.log('[LODOP] 初始化 C-Lodop 打印引擎...');

      // 检查C-Lodop是否可用
      if (typeof window !== 'undefined' && window.getLodop) {
        this.LODOP = window.getLodop();

        if (this.LODOP) {
          console.log('[LODOP] C-Lodop 初始化成功');
          console.log('[LODOP] 版本信息:', this.LODOP.VERSION);

          await this.refreshPrinters();
          this.isInitialized = true;

          return { success: true, engine: 'C-Lodop' };
        } else {
          throw new Error('无法获取 C-Lodop 对象');
        }
      } else {
        throw new Error('C-Lodop 未安装或不可用');
      }
    } catch (error) {
      console.error('[LODOP] 初始化失败:', error);
      return {
        success: false,
        error: error.message,
        engine: 'C-Lodop',
      };
    }
  }

  async refreshPrinters() {
    try {
      console.log('[LODOP] 刷新打印机列表...');

      if (!this.LODOP) {
        throw new Error('C-Lodop 未初始化');
      }

      this.printers = [];

      // 获取打印机数量
      const printerCount = this.LODOP.GET_PRINTER_COUNT();
      console.log(`[LODOP] 发现 ${printerCount} 台打印机`);

      // 遍历所有打印机
      for (let i = 0; i < printerCount; i++) {
        const printerName = this.LODOP.GET_PRINTER_NAME(i);

        if (printerName) {
          const printer = {
            name: printerName,
            id: i,
            status: 'Ready',
            isDefault: i === 0, // 第一台作为默认打印机
            isThermal: this.isThermalPrinter(printerName),
            width: this.estimatePrinterWidth(printerName),
            fontSize: 0, // 小字体
            engine: 'C-Lodop',
            // 🍽️ 新增：分菜打印相关字段
            printerNumber: null, // 打印机编号，用于分菜打印
          };

          this.printers.push(printer);
          console.log(`[LODOP] 添加打印机: ${printerName}`);
        }
      }

      // 如果没有选中的打印机，自动选择默认打印机
      if (this.selectedPrinters.length === 0 && this.printers.length > 0) {
        this.selectedPrinters = [this.printers[0].name];
        console.log(`[LODOP] 自动选择默认打印机: ${this.printers[0].name}`);
      }

      console.log(`[LODOP] 打印机列表刷新完成，共 ${this.printers.length} 台`);
      return this.printers;
    } catch (error) {
      console.error('[LODOP] 刷新打印机失败:', error);
      throw error;
    }
  }

  // 🎯 新增：固定数值模板布局系统
  calculateLayoutParams(paperWidth) {
    // 🎯 88mm和58mm固定模板配置
    const templates = {
      // 88mm纸张模板（通常对应80mm热敏纸实际可打印区域）
      88: {
        margins: {
          left: 2, // 左边距2mm
          right: 2, // 右边距2mm
          top: 3, // 顶部边距3mm
          bottom: 3, // 底部边距3mm
        },
        totalCharWidth: 42, // 总字符宽度42字符
        table: {
          nameWidth: 28, // 菜名列28字符（约67%）
          qtyWidth: 4, // 数量列4字符（约10%）
          priceWidth: 10, // 价格列10字符（约23%）
        },
        fee: {
          labelWidth: 28, // 费用标签28字符
          amountWidth: 14, // 费用金额14字符
        },
        fonts: {
          base: 12, // 基础字体12pt
          title: 14, // 标题字体14pt
          item: 12, // 菜品字体12pt
          normal: 11, // 普通字体11pt
        },
        layoutType: '88mm-standard',
      },

      // 58mm纸张模板
      58: {
        margins: {
          left: 1.5, // 左边距1.5mm
          right: 1.5, // 右边距1.5mm
          top: 2, // 顶部边距2mm
          bottom: 2, // 底部边距2mm
        },
        totalCharWidth: 28, // 总字符宽度28字符
        table: {
          nameWidth: 18, // 菜名列18字符（约64%）
          qtyWidth: 3, // 数量列3字符（约11%）
          priceWidth: 7, // 价格列7字符（约25%）
        },
        fee: {
          labelWidth: 18, // 费用标签18字符
          amountWidth: 10, // 费用金额10字符
        },
        fonts: {
          base: 10, // 基础字体10pt
          title: 12, // 标题字体12pt
          item: 11, // 菜品字体11pt
          normal: 10, // 普通字体10pt
        },
        layoutType: '58mm-compact',
      },
    };

    // 🎯 选择合适的模板
    let template;
    if (paperWidth >= 80) {
      template = templates[88];
      console.log('[LODOP] 🎯 使用88mm固定模板（适用于80mm+纸张）');
    } else {
      template = templates[58];
      console.log('[LODOP] 🎯 使用58mm固定模板');
    }

    // 计算可用宽度
    const availableWidthMm =
      paperWidth - template.margins.left - template.margins.right;
    const textAreaWidthMm = availableWidthMm;

    console.log('[LODOP] 🎯 固定模板参数:', {
      纸张宽度: `${paperWidth}mm`,
      模板类型: template.layoutType,
      边距: `左${template.margins.left}mm, 右${template.margins.right}mm`,
      可用宽度: `${availableWidthMm}mm`,
      总字符宽度: `${template.totalCharWidth}字符`,
      表格列宽: `菜名${template.table.nameWidth} + 数量${
        template.table.qtyWidth
      } + 价格${template.table.priceWidth} = ${
        template.table.nameWidth +
        template.table.qtyWidth +
        template.table.priceWidth
      }`,
      费用列宽: `标签${template.fee.labelWidth} + 金额${
        template.fee.amountWidth
      } = ${template.fee.labelWidth + template.fee.amountWidth}`,
      字体大小: `基础${template.fonts.base}pt, 标题${template.fonts.title}pt, 菜品${template.fonts.item}pt, 普通${template.fonts.normal}pt`,
    });

    return {
      // 边距信息
      margins: template.margins,

      // 宽度信息
      paperWidth: paperWidth,
      availableWidth: availableWidthMm,
      totalCharWidth: template.totalCharWidth,
      textAreaWidth: textAreaWidthMm,

      // 表格布局（固定数值）
      table: {
        nameWidth: template.table.nameWidth,
        qtyWidth: template.table.qtyWidth,
        priceWidth: template.table.priceWidth,
        totalWidth:
          template.table.nameWidth +
          template.table.qtyWidth +
          template.table.priceWidth,
      },

      // 费用布局（固定数值）
      fee: {
        labelWidth: template.fee.labelWidth,
        amountWidth: template.fee.amountWidth,
        totalWidth: template.fee.labelWidth + template.fee.amountWidth,
      },

      // 字体信息
      fonts: template.fonts,

      // 调试信息
      debug: {
        templateType: template.layoutType,
        isFixedTemplate: true,
        charDensity: `${template.totalCharWidth}字符/${paperWidth}mm = ${(
          template.totalCharWidth / paperWidth
        ).toFixed(3)}字符/mm`,
        tableRatio: {
          菜名: `${Math.round(
            (template.table.nameWidth / template.totalCharWidth) * 100
          )}%`,
          数量: `${Math.round(
            (template.table.qtyWidth / template.totalCharWidth) * 100
          )}%`,
          价格: `${Math.round(
            (template.table.priceWidth / template.totalCharWidth) * 100
          )}%`,
        },
        feeRatio: {
          标签: `${Math.round(
            (template.fee.labelWidth / template.totalCharWidth) * 100
          )}%`,
          金额: `${Math.round(
            (template.fee.amountWidth / template.totalCharWidth) * 100
          )}%`,
        },
      },
    };
  }

  // 判断是否为热敏打印机
  isThermalPrinter(printerName) {
    const thermalKeywords = [
      '热敏',
      'thermal',
      'receipt',
      '小票',
      'pos',
      '58mm',
      '80mm',
    ];
    const name = printerName.toLowerCase();
    return thermalKeywords.some((keyword) =>
      name.includes(keyword.toLowerCase())
    );
  }

  // 估算打印机宽度
  estimatePrinterWidth(printerName) {
    const name = printerName.toLowerCase();
    if (name.includes('58mm') || name.includes('58')) return 58;
    if (name.includes('80mm') || name.includes('80')) return 80;
    if (this.isThermalPrinter(printerName)) return 80; // 默认热敏打印机80mm
    return 210; // A4纸张宽度
  }

  getAllPrinters() {
    return this.printers;
  }

  getSelectedPrinters() {
    return this.selectedPrinters;
  }

  setSelectedPrinters(printerNames) {
    this.selectedPrinters = printerNames;
    console.log('[LODOP] 更新选中打印机:', printerNames);
  }

  async testPrint(printerName) {
    try {
      console.log(`[LODOP] 开始测试打印: ${printerName}`);

      if (!this.LODOP) {
        throw new Error('C-Lodop 未初始化');
      }

      // 创建打印任务
      this.LODOP.PRINT_INITA(0, 0, '80mm', '120mm', '测试打印');

      // 选择打印机
      this.LODOP.SET_PRINTER_INDEXA(printerName);

      // 添加测试文本
      this.LODOP.ADD_PRINT_TEXT(10, 10, 200, 30, 'C-Lodop 测试打印');
      this.LODOP.SET_PRINT_STYLEA(0, 'FontSize', 12);
      this.LODOP.SET_PRINT_STYLEA(0, 'Bold', 1);

      this.LODOP.ADD_PRINT_TEXT(50, 10, 200, 30, `打印机: ${printerName}`);
      this.LODOP.SET_PRINT_STYLEA(1, 'FontSize', 10);

      this.LODOP.ADD_PRINT_TEXT(
        90,
        10,
        200,
        30,
        `时间: ${new Date().toLocaleString()}`
      );
      this.LODOP.SET_PRINT_STYLEA(2, 'FontSize', 10);

      console.log('[LODOP] 测试打印内容已添加，开始执行打印...');

      // 执行打印
      const result = this.LODOP.PRINT();

      console.log(`[LODOP] 打印结果: ${result}`);

      if (result) {
        console.log(`[LODOP] 测试打印成功: ${printerName}`);
        return { success: true, printer: printerName };
      } else {
        throw new Error('打印命令执行失败');
      }
    } catch (error) {
      console.error(`[LODOP] 测试打印失败 ${printerName}:`, error);
      throw new Error(`测试打印失败: ${error.message}`);
    }
  }

  async printOrder(order) {
    console.log(`[LODOP] 🍽️ 开始分菜打印订单: ${order.order_id}`);
    console.log(JSON.stringify(order));

    const selectedPrinters = this.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      throw new Error('未选择任何打印机');
    }

    // 根据菜品 printer_type 分组
    const printerGroups = this.groupDishesByPrintType(order);

    if (printerGroups.size === 0) {
      throw new Error('没有可用的打印机组合');
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const printResults = [];

    // 并行打印到所有分组
    const printPromises = Array.from(printerGroups.entries()).map(
      async ([printerName, group]) => {
        try {
          // 创建针对该打印机的订单副本
          const printerOrder = {
            ...order,
            dishes_array: group.dishes,
          };

          // 生成打印内容
          const printContent = group.hasFullOrder
            ? this.generateOrderPrintContent(printerOrder)
            : this.generatePartialOrderPrintContent(printerOrder, group);

          await this.printToLodop(printerName, printContent, printerOrder);
          successCount++;

          const logMsg = group.hasFullOrder
            ? `完整订单打印成功: ${printerName}`
            : `分菜打印成功: ${printerName} (${group.dishes.length}个菜品, printer_type: ${group.printer_type})`;
          console.log(`[LODOP] 🍽️ ${logMsg}`);

          return {
            printer: printerName,
            success: true,
            type: group.hasFullOrder ? 'full' : 'partial',
            dishCount: group.dishes.length,
            printerNumber: group.printerNumber || null,
            printer_type: group.printer_type || null,
          };
        } catch (error) {
          errorCount++;
          const errorMsg = `${printerName}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[LODOP] 🍽️ 打印失败 ${printerName}:`, error);
          return {
            printer: printerName,
            success: false,
            error: error.message,
            type: group.hasFullOrder ? 'full' : 'partial',
            dishCount: group.dishes.length,
          };
        }
      }
    );

    const results = await Promise.all(printPromises);

    const result = {
      成功数量: successCount,
      失败数量: errorCount,
      错误列表: errors,
      打印引擎: 'C-Lodop (分菜打印)',
      分菜模式: this.printTypeConfig.enableSeparatePrinting,
      打印详情: results,
    };

    console.log(`[LODOP] 🍽️ 订单 ${order.order_id} 分菜打印完成:`, result);
    return result;
  }

  async printToLodop(printerName, content, order) {
    try {
      if (!this.LODOP) {
        throw new Error('C-Lodop 未初始化');
      }

      // 获取打印机信息
      const printer = this.printers.find((p) => p.name === printerName);
      const paperWidth = printer ? printer.width : 80;

      // 🎯 使用新的固定模板布局系统
      const layout = this.calculateLayoutParams(paperWidth);

      console.log(`[LODOP] 🎯 ${printerName} 使用固定模板布局参数:`, {
        纸张宽度: `${layout.paperWidth}mm`,
        模板类型: layout.debug.templateType,
        边距: `左${layout.margins.left}mm, 右${layout.margins.right}mm`,
        文本区域: `${layout.textAreaWidth}mm`,
        字体: `基础${layout.fonts.base}pt, 标题${layout.fonts.title}pt, 菜品${layout.fonts.item}pt`,
      });

      // 优化纸张高度计算 - 更精确的计算，减少底部空白
      const lines = content.split('\n');
      const nonEmptyLines = lines.filter((line) => line.trim()).length;
      const emptyLines = lines.length - nonEmptyLines;

      // 精确计算：非空行4mm + 空行2mm + 上下边距
      const estimatedHeight = Math.max(
        nonEmptyLines * 4 +
          emptyLines * 2 +
          layout.margins.top +
          layout.margins.bottom,
        80
      );
      const paperHeightMm = `${estimatedHeight}mm`;
      const paperWidthMm = `${paperWidth}mm`;

      console.log(`[LODOP] 设置纸张尺寸: ${paperWidthMm} x ${paperHeightMm}`);
      console.log(
        `[LODOP] 内容行数: ${lines.length} (非空: ${nonEmptyLines}, 空行: ${emptyLines})`
      );

      // 创建打印任务 - 使用PRINT_INITA而不是PRINT_INIT
      this.LODOP.PRINT_INITA(
        0,
        0,
        paperWidthMm,
        paperHeightMm,
        `订单-${order.order_id}`
      );

      // 选择打印机 - 使用SET_PRINTER_INDEXA
      this.LODOP.SET_PRINTER_INDEXA(printerName);

      // 设置页面属性
      this.LODOP.SET_PRINT_PAGESIZE(1, paperWidthMm, paperHeightMm, '');

      let yPosMm = layout.margins.top; // 🔧 使用计算出的顶部边距
      const lineHeightMm = 4; // 行高4mm

      console.log(`[LODOP] 🎯 固定模板打印设置:`, {
        起始Y位置: `${yPosMm}mm`,
        左边距: `${layout.margins.left}mm`,
        文本宽度: `${layout.textAreaWidth}mm`,
        行高: `${lineHeightMm}mm`,
      });

      // 逐行添加打印内容
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🎯 使用固定模板计算的参数
          this.LODOP.ADD_PRINT_TEXT(
            `${yPosMm}mm`, // Top - 使用计算出的Y位置
            `${layout.margins.left}mm`, // Left - 使用固定模板计算的左边距
            `${layout.textAreaWidth}mm`, // Width - 使用固定模板计算的文本宽度
            `${lineHeightMm}mm`, // Height - 行高
            line
          );

          // 🎯 使用固定模板的字体设置
          if (line.includes('Order #:')) {
            // 订单号 - 标题字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.title);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (line.includes('TOTAL')) {
            // 总计 - 菜品字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.item);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (
            line.includes('Subtotal') ||
            line.includes('Tax') ||
            line.includes('Fee') ||
            line.includes('Tip') ||
            line.includes('Discount')
          ) {
            // 费用项 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.normal);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (line.startsWith('---') || line.startsWith('===')) {
            // 分隔线 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.normal);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (
            this.isItemLine(line) ||
            line.includes('Item') ||
            line.includes('Qty') ||
            line.includes('Price')
          ) {
            // 菜品行和表头 - 菜品字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.item);
            this.LODOP.SET_PRINT_STYLEA(
              i,
              'Bold',
              line.includes('Item') ? 1 : 0
            ); // 表头加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else {
            // 其他文本 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.normal);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          }

          this.LODOP.SET_PRINT_STYLE('FontSize', 10);
          this.LODOP.SET_PRINT_STYLE('FontName', '微软雅黑');
          // this.LODOP.SET_PRINT_STYLEA(-1, 'FontName', '微软雅黑');
          // this.LODOP.SET_PRINT_STYLEA(-1, 'Alignment', 1); // 左对齐避免拉伸

          yPosMm += lineHeightMm;
        } else {
          yPosMm += 2; // 空行间距2mm
        }
      }

      console.log(
        `[LODOP] 共添加了 ${lines.filter((l) => l.trim()).length} 个文本项`
      );

      // 执行打印
      const result = this.LODOP.PRINT();

      if (!result) {
        throw new Error('C-Lodop 打印命令执行失败');
      }

      console.log(`[LODOP] 订单 ${order.order_id} 打印到 ${printerName} 成功`);
    } catch (error) {
      console.error(`[LODOP] 打印到 ${printerName} 失败:`, error);
      throw error;
    }
  }

  // 辅助函数：判断是否为商品行
  isItemLine(line) {
    // 简单判断：包含价格符号$且不是费用行
    return (
      line.includes('$') &&
      !line.includes('Subtotal') &&
      !line.includes('Tax') &&
      !line.includes('Fee') &&
      !line.includes('Tip') &&
      !line.includes('Discount') &&
      !line.includes('TOTAL')
    );
  }

  generateOrderPrintContent(order) {
    console.log('[LODOP] 🎯 生成热敏小票打印内容（固定模板布局）...');

    // 获取打印机宽度设置
    const printer = this.printers.find((p) =>
      this.selectedPrinters.includes(p.name)
    );
    const paperWidth = printer ? printer.width : 80;

    // 🎯 使用新的固定模板布局系统
    const layout = this.calculateLayoutParams(paperWidth);

    console.log('[LODOP] 🎯 固定模板布局结果:', {
      纸张宽度: `${layout.paperWidth}mm`,
      模板类型: layout.debug.templateType,
      字符宽度: layout.totalCharWidth,
      表格列宽: `菜名${layout.table.nameWidth} + 数量${layout.table.qtyWidth} + 价格${layout.table.priceWidth} = ${layout.table.totalWidth}`,
      费用列宽: `标签${layout.fee.labelWidth} + 金额${layout.fee.amountWidth} = ${layout.fee.totalWidth}`,
      字体大小: `基础${layout.fonts.base}pt, 标题${layout.fonts.title}pt, 菜品${layout.fonts.item}pt`,
      边距: `左${layout.margins.left}mm, 右${layout.margins.right}mm`,
    });

    let content = '';

    // ============= 订单号区域：靠左对齐 =============
    content += `#${order.order_id}\n`;
    content += '\n';

    // ============= 订单信息：靠左对齐，固定格式 =============
    content += `Order Date: ${this.formatDateTime(order.create_time)}\n`;
    content += `Pickup Time: ${this.formatDateTime(order.delivery_time)}\n`;

    const paystyle = order.paystyle == 1 ? 'Card' : 'Cash';
    content += `Payment: ${paystyle}\n`;
    content += `Customer: ${order.recipient_name || 'N/A'}\n`;
    content += `Phone: ${order.recipient_phone || 'N/A'}\n`;

    // 取餐方式
    const deliveryType = order.delivery_type == 1 ? 'Delivery' : 'Pickup';
    content += `Type: ${deliveryType}\n`;

    // 如果是外送，显示地址（可能需要换行）
    if (order.delivery_type == 1 && order.recipient_address) {
      const address = order.recipient_address;
      if (this.displayWidth(`Address: ${address}`) <= layout.totalCharWidth) {
        content += `Address: ${address}\n`;
      } else {
        content += `Address:\n`;
        // 地址换行显示，每行缩进2个空格
        const wrappedAddress = this.wrapText(
          address,
          layout.totalCharWidth - 2
        );
        const addressLines = wrappedAddress.split('\n');
        addressLines.forEach((line) => {
          if (line.trim()) {
            content += `  ${line}\n`;
          }
        });
      }
    }

    content += '\n';
    content += '='.repeat(layout.totalCharWidth) + '\n';

    // ============= 菜单表格：固定列宽设计，两端对齐 =============
    console.log('[LODOP] 🎯 使用固定模板表格布局:', {
      菜名列: `${layout.table.nameWidth}字符 (${layout.debug.tableRatio.菜名})`,
      数量列: `${layout.table.qtyWidth}字符 (${layout.debug.tableRatio.数量})`,
      价格列: `${layout.table.priceWidth}字符 (${layout.debug.tableRatio.价格})`,
    });

    // 🎯 表头：使用新的格式化函数
    content += this.formatItemLine('Item', 'Qty', 'Price', layout) + '\n';
    content += '-'.repeat(layout.totalCharWidth) + '\n';

    // ============= 菜单明细：固定列宽，优化对齐 =============
    const dishes = order.dishes_array || [];
    dishes.forEach((dish) => {
      const price = parseFloat(dish.price || '0');
      const qty = parseInt(dish.amount || '1');
      const priceStr = `$${price.toFixed(2)}`;

      // 🎯 菜名处理：使用固定列宽
      const dishName = this.getFormattedDishName(dish);
      if (this.displayWidth(dishName) <= layout.table.nameWidth) {
        // 菜名不超宽，单行显示 - 使用新的格式化函数
        content += this.formatItemLine(dishName, qty, priceStr, layout) + '\n';
      } else {
        // 菜名超宽，多行显示
        const wrappedName = this.wrapText(dishName, layout.table.nameWidth);
        const nameLines = wrappedName.split('\n');

        // 第一行：菜名 + 数量 + 价格
        const firstLine = nameLines[0] || '';
        content += this.formatItemLine(firstLine, qty, priceStr, layout) + '\n';

        // 后续行：只显示菜名续
        for (let i = 1; i < nameLines.length; i++) {
          if (nameLines[i].trim()) {
            content += this.padText(
              nameLines[i],
              layout.table.nameWidth,
              'left'
            );
            content += ' '.repeat(
              layout.table.qtyWidth + layout.table.priceWidth
            ); // 数量和价格列留空
            content += '\n';
          }
        }
      }

      // 🎯 规格处理：缩进显示，使用固定宽度换行
      if (dish.remark && dish.remark.trim()) {
        const specIndent = 2; // 2个空格缩进
        const specWidth = layout.table.nameWidth - specIndent;
        const wrappedSpec = this.wrapText(dish.remark, specWidth);
        const specLines = wrappedSpec.split('\n');

        specLines.forEach((line) => {
          if (line.trim()) {
            content += ' '.repeat(specIndent); // 缩进
            content += this.padText(line, specWidth, 'left');
            content += ' '.repeat(
              layout.table.qtyWidth + layout.table.priceWidth
            ); // 数量和价格列留空
            content += '\n';
          }
        });
      }

      content += '\n'; // 每个菜品后空一行
    });

    content += '='.repeat(layout.totalCharWidth) + '\n';

    // ============= 费用明细：使用固定模板布局，两端对齐 =============
    const subtotal = parseFloat(order.sub_total || '0');
    const discount = parseFloat(order.discount_total || '0');
    const taxFee = parseFloat(order.tax_fee || '0');
    const taxRate = parseFloat(order.tax_rate || '0');
    const deliveryFee = parseFloat(order.delivery_fee || '0');
    const serviceFee = parseFloat(order.convenience_fee || '0');
    const serviceRate = parseFloat(order.convenience_rate || '0');
    const tip = parseFloat(order.tip_fee || '0');
    const total = parseFloat(order.total || '0');

    console.log('[LODOP] 🎯 使用固定模板费用布局:', {
      标签列: `${layout.fee.labelWidth}字符 (${layout.debug.feeRatio.标签})`,
      金额列: `${layout.fee.amountWidth}字符 (${layout.debug.feeRatio.金额})`,
    });

    // 🎯 费用行：使用新的格式化函数，实现两端对齐
    // 小计
    content +=
      this.formatFeeLine('Subtotal', `$${subtotal.toFixed(2)}`, layout) + '\n';

    // 折扣
    if (discount > 0) {
      content +=
        this.formatFeeLine('Discount', `-$${discount.toFixed(2)}`, layout) +
        '\n';
    }

    // 税费
    if (taxFee > 0) {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate.toFixed(1)}%)` : 'Tax';
      content +=
        this.formatFeeLine(taxLabel, `$${taxFee.toFixed(2)}`, layout) + '\n';
    }

    // 配送费
    if (deliveryFee > 0) {
      content +=
        this.formatFeeLine(
          'Delivery Fee',
          `$${deliveryFee.toFixed(2)}`,
          layout
        ) + '\n';
    }

    // 服务费
    if (serviceFee > 0) {
      const serviceLabel =
        serviceRate > 0
          ? `Service Rate (${serviceRate.toFixed(4)}%)`
          : 'Service Fee';
      content +=
        this.formatFeeLine(serviceLabel, `$${serviceFee.toFixed(2)}`, layout) +
        '\n';
    }

    // 小费
    if (tip > 0) {
      content += this.formatFeeLine('Tip', `$${tip.toFixed(2)}`, layout) + '\n';
    }

    // 总计（加粗显示）
    content +=
      this.formatFeeLine('TOTAL', `$${total.toFixed(2)}`, layout) + '\n';

    // ============= 备注：靠左显示，自动换行 =============
    if (order.order_notes && order.order_notes.trim()) {
      content += '\n';
      content += '-'.repeat(layout.totalCharWidth) + '\n';
      content += 'Notes:\n';
      const wrappedNotes = this.wrapText(
        order.order_notes,
        layout.totalCharWidth - 2
      );
      const noteLines = wrappedNotes.split('\n');
      noteLines.forEach((line) => {
        if (line.trim()) {
          content += `  ${line}\n`;
        }
      });
    }

    // 结尾
    content += '\n';
    content += '='.repeat(layout.totalCharWidth) + '\n';

    console.log('[LODOP] 🎯 固定模板小票内容生成完成');
    console.log('[LODOP] 内容预览:\n', content);
    return content;
  }

  // 辅助函数：计算显示宽度（中文字符算2个宽度）
  displayWidth(text) {
    let width = 0;
    for (const char of text) {
      width += char.charCodeAt(0) > 127 ? 2 : 1;
    }
    return width;
  }

  // 🎯 优化：固定模板文本填充（支持精确对齐）
  padText(text, width, align = 'left') {
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) {
      return this.truncateText(text, width);
    }

    const padding = width - textWidth;
    switch (align) {
      case 'right':
        return ' '.repeat(padding) + text;
      case 'center':
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      default: // 'left'
        return text + ' '.repeat(padding);
    }
  }

  // 🎯 新增：菜品行格式化（两端对齐，数量和价格紧凑）
  formatItemLine(dishName, qty, price, layout) {
    let line = '';

    // 🎯 菜名部分：左对齐，填满指定宽度
    const nameText = this.padText(dishName, layout.table.nameWidth, 'left');

    // 🎯 数量部分：居中对齐，紧凑显示
    const qtyText = this.padText(
      qty.toString(),
      layout.table.qtyWidth,
      'center'
    );

    // 🎯 价格部分：右对齐，紧凑显示
    const priceText = this.padText(price, layout.table.priceWidth, 'right');

    line = nameText + qtyText + priceText;

    console.log('[LODOP] 🎯 菜品行格式化:', {
      菜名: `"${dishName}" -> "${nameText}" (${layout.table.nameWidth}字符)`,
      数量: `"${qty}" -> "${qtyText}" (${layout.table.qtyWidth}字符)`,
      价格: `"${price}" -> "${priceText}" (${layout.table.priceWidth}字符)`,
      总长度: `${this.displayWidth(line)}/${layout.totalCharWidth}字符`,
    });

    return line;
  }

  // 🎯 新增：费用行格式化（标签左对齐，金额右对齐）
  formatFeeLine(label, amount, layout) {
    let line = '';

    // 🎯 标签部分：左对齐
    const labelText = this.padText(label, layout.fee.labelWidth, 'left');

    // 🎯 金额部分：右对齐
    const amountText = this.padText(amount, layout.fee.amountWidth, 'right');

    line = labelText + amountText;

    console.log('[LODOP] 🎯 费用行格式化:', {
      标签: `"${label}" -> "${labelText}" (${layout.fee.labelWidth}字符)`,
      金额: `"${amount}" -> "${amountText}" (${layout.fee.amountWidth}字符)`,
      总长度: `${this.displayWidth(line)}/${layout.totalCharWidth}字符`,
    });

    return line;
  }

  // 辅助函数：文本截断
  truncateText(text, maxWidth) {
    let result = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = char.charCodeAt(0) > 127 ? 2 : 1;
      if (currentWidth + charWidth > maxWidth) {
        break;
      }
      result += char;
      currentWidth += charWidth;
    }

    return result;
  }

  // 辅助函数：文本换行
  wrapText(text, width) {
    let result = '';
    let currentLine = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = char.charCodeAt(0) > 127 ? 2 : 1;

      if (currentWidth + charWidth > width && currentLine) {
        result += currentLine + '\n';
        currentLine = '';
        currentWidth = 0;
      }

      currentLine += char;
      currentWidth += charWidth;
    }

    if (currentLine) {
      result += currentLine;
    }

    return result;
  }

  // 辅助函数：格式化日期时间
  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return 'N/A';

    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return dateTimeStr;
    }
  }

  // 获取引擎状态
  getEngineStatus() {
    return {
      currentEngine: 'C-Lodop',
      lodopAvailable: !!this.LODOP,
      isInitialized: this.isInitialized,
      printerCount: this.printers.length,
      selectedCount: this.selectedPrinters.length,
      version: this.LODOP ? this.LODOP.VERSION : 'Unknown',
    };
  }

  // 调试打印功能
  async debugPrint(order) {
    console.log(`[LODOP] 开始调试打印订单: ${order.order_id}`);

    const selectedPrinters = this.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      // 如果没有选中打印机，使用第一台可用打印机
      if (this.printers.length > 0) {
        this.setSelectedPrinters([this.printers[0].name]);
      } else {
        throw new Error('没有可用的打印机');
      }
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // 简化的打印内容
    const debugContent = `
调试打印测试
订单号: ${order.order_id}
时间: ${new Date().toLocaleString()}
测试内容: C-Lodop 打印功能正常
`;

    // 并行打印到所有选中的打印机
    const printPromises = this.getSelectedPrinters().map(
      async (printerName) => {
        try {
          await this.debugPrintToLodop(printerName, debugContent, order);
          successCount++;
          console.log(`[LODOP] 调试打印成功: ${printerName}`);
          return { printer: printerName, success: true };
        } catch (error) {
          errorCount++;
          const errorMsg = `${printerName}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[LODOP] 调试打印失败 ${printerName}:`, error);
          return { printer: printerName, success: false, error: error.message };
        }
      }
    );

    await Promise.all(printPromises);

    const result = {
      成功数量: successCount,
      失败数量: errorCount,
      错误列表: errors,
      打印引擎: 'C-Lodop (调试模式)',
    };

    console.log(`[LODOP] 调试打印完成:`, result);
    return result;
  }

  // 调试打印到C-Lodop
  async debugPrintToLodop(printerName, content, order) {
    try {
      if (!this.LODOP) {
        throw new Error('C-Lodop 未初始化');
      }

      console.log(`[LODOP] 调试打印到: ${printerName}`);

      // 创建打印任务
      this.LODOP.PRINT_INITA(0, 0, '80mm', '100mm', `调试-${order.order_id}`);

      // 选择打印机
      this.LODOP.SET_PRINTER_INDEXA(printerName);

      // 添加简单的文本内容
      const lines = content.trim().split('\n');
      let yPos = 10;
      const lineHeight = 15;

      lines.forEach((line, index) => {
        if (line.trim()) {
          this.LODOP.ADD_PRINT_TEXT(yPos, 5, 200, lineHeight, line.trim());
          this.LODOP.SET_PRINT_STYLEA(index, 'FontSize', 10);
          this.LODOP.SET_PRINT_STYLEA(index, 'Bold', index === 0 ? 1 : 0);
          yPos += lineHeight;
        }
      });

      console.log(`[LODOP] 调试内容已添加，共 ${lines.length} 行`);

      // 执行打印
      const result = this.LODOP.PRINT();

      if (!result) {
        throw new Error('C-Lodop 调试打印命令执行失败');
      }

      console.log(`[LODOP] 调试打印到 ${printerName} 成功`);
    } catch (error) {
      console.error(`[LODOP] 调试打印到 ${printerName} 失败:`, error);
      throw error;
    }
  }

  // 获取调试信息
  getDebugInfo() {
    return {
      打印机数量: this.printers.length,
      已选择数量: this.selectedPrinters.length,
      版本: this.LODOP ? this.LODOP.VERSION : 'Unknown',
      当前引擎: 'C-Lodop',
      C_Lodop可用: !!this.LODOP,
      初始化状态: this.isInitialized,
      打印机列表: this.printers.map((p) => p.name),
      已选择打印机: this.selectedPrinters,
      打印机状态: this.printers.map((p) => `${p.name}: ${p.status}`),
      错误列表: [], // 可以在这里添加错误收集逻辑
    };
  }

  // 预览功能（C-Lodop支持）
  async generatePrintPreview(order) {
    try {
      if (!this.LODOP) {
        throw new Error('C-Lodop 未初始化');
      }

      const content = this.generateOrderPrintContent(order);

      // 获取打印机信息
      const printer = this.printers.find((p) =>
        this.selectedPrinters.includes(p.name)
      );
      const paperWidth = printer ? printer.width : 80;

      // 🎯 使用新的固定模板布局系统
      const layout = this.calculateLayoutParams(paperWidth);

      console.log(`[LODOP] 🎯 预览使用固定模板布局参数:`, {
        纸张宽度: `${layout.paperWidth}mm`,
        模板类型: layout.debug.templateType,
        边距: `左${layout.margins.left}mm, 右${layout.margins.right}mm`,
        文本区域: `${layout.textAreaWidth}mm`,
        字体: `基础${layout.fonts.base}pt, 标题${layout.fonts.title}pt, 菜品${layout.fonts.item}pt`,
      });

      // 使用与打印相同的高度计算逻辑
      const lines = content.split('\n');
      const nonEmptyLines = lines.filter((line) => line.trim()).length;
      const emptyLines = lines.length - nonEmptyLines;

      // 精确计算：非空行4mm + 空行2mm + 上下边距
      const estimatedHeight = Math.max(
        nonEmptyLines * 4 +
          emptyLines * 2 +
          layout.margins.top +
          layout.margins.bottom,
        80
      );
      const paperHeightMm = `${estimatedHeight}mm`;
      const paperWidthMm = `${paperWidth}mm`;

      // 创建预览任务 - 使用PRINT_INITA
      this.LODOP.PRINT_INITA(
        0,
        0,
        paperWidthMm,
        paperHeightMm,
        `预览-${order.order_id}`
      );

      // 设置页面属性
      this.LODOP.SET_PRINT_PAGESIZE(1, paperWidthMm, paperHeightMm, '');

      let yPosMm = layout.margins.top; // 🔧 使用计算出的顶部边距
      const lineHeightMm = 4; // 行高4mm

      console.log(`[LODOP] 🎯 固定模板预览设置:`, {
        起始Y位置: `${yPosMm}mm`,
        左边距: `${layout.margins.left}mm`,
        文本宽度: `${layout.textAreaWidth}mm`,
        行高: `${lineHeightMm}mm`,
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🎯 使用固定模板计算的参数
          this.LODOP.ADD_PRINT_TEXT(
            `${yPosMm}mm`, // Top - 使用计算出的Y位置
            `${layout.margins.left}mm`, // Left - 使用固定模板计算的左边距
            `${layout.textAreaWidth}mm`, // Width - 使用固定模板计算的文本宽度
            `${lineHeightMm}mm`, // Height - 行高
            line
          );

          // 🎯 使用固定模板的字体设置（与打印保持一致）
          if (line.includes('Order #:')) {
            // 订单号 - 标题字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.title);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (line.includes('TOTAL')) {
            // 总计 - 菜品字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.item);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (
            line.includes('Subtotal') ||
            line.includes('Tax') ||
            line.includes('Fee') ||
            line.includes('Tip') ||
            line.includes('Discount')
          ) {
            // 费用项 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.normal);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (line.startsWith('---') || line.startsWith('===')) {
            // 分隔线 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.normal);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (
            this.isItemLine(line) ||
            line.includes('Item') ||
            line.includes('Qty') ||
            line.includes('Price')
          ) {
            // 菜品行和表头 - 菜品字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.item);
            this.LODOP.SET_PRINT_STYLEA(
              i,
              'Bold',
              line.includes('Item') ? 1 : 0
            ); // 表头加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else {
            // 其他文本 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', layout.fonts.normal);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          }

          this.LODOP.SET_PRINT_STYLE('FontSize', 10);
          this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');

          yPosMm += lineHeightMm;
        } else {
          yPosMm += 2; // 空行间距2mm
        }
      }

      console.log(
        `[LODOP] 预览共添加了 ${lines.filter((l) => l.trim()).length} 个文本项`
      );

      // 显示预览
      this.LODOP.PREVIEW();

      return { success: true, content: content };
    } catch (error) {
      console.error('[LODOP] 生成预览失败:', error);
      throw error;
    }
  }

  // 🍽️ 新增：设置打印机编号
  setPrinterNumber(printerName, number) {
    const printer = this.printers.find((p) => p.name === printerName);
    if (printer) {
      printer.printerNumber = number;
      this.printTypeConfig.printerNumbers.set(printerName, number);
      console.log(`[LODOP] 🍽️ 设置打印机编号: ${printerName} -> ${number}`);
      return true;
    }
    return false;
  }

  // 🍽️ 新增：获取打印机编号
  getPrinterNumber(printerName) {
    return this.printTypeConfig.printerNumbers.get(printerName) || null;
  }

  // 🍽️ 新增：启用/禁用分菜打印模式
  setSeparatePrintingMode(enabled) {
    this.printTypeConfig.enableSeparatePrinting = enabled;
    console.log(`[LODOP] 🍽️ 分菜打印模式: ${enabled ? '已启用' : '已禁用'}`);
  }

  // 🍽️ 新增：根据菜品 printer_type 分组订单
  groupDishesByPrintType(order) {
    const printerGroups = new Map(); // printerName -> {dishes: [], hasFullOrder: boolean, printer_type: number}

    console.log('[LODOP] 🍽️ 开始按 printer_type 分菜分组...');

    // 如果未启用分菜打印，返回完整订单
    if (!this.printTypeConfig.enableSeparatePrinting) {
      console.log('[LODOP] 🍽️ 分菜打印未启用，使用完整订单模式');
      const selectedPrinters = this.getSelectedPrinters();
      selectedPrinters.forEach((printerName) => {
        printerGroups.set(printerName, {
          dishes: order.dishes_array || [],
          hasFullOrder: true,
          printerName: printerName,
          printer_type: null,
        });
      });
      return printerGroups;
    }

    // 收集所有菜品的 printer_type
    const dishesWithPrintType = new Map(); // printer_type -> dishes[]
    const dishesWithoutPrintType = [];

    (order.dishes_array || []).forEach((dish) => {
      const printer_type = parseInt(dish.printer_type || '0');
      debugger;
      if (printer_type > 0) {
        if (!dishesWithPrintType.has(printer_type)) {
          dishesWithPrintType.set(printer_type, []);
        }
        dishesWithPrintType.get(printer_type).push(dish);
        console.log(
          `[LODOP] 🍽️ 菜品 "${dish.dishes_name}" printer_type: ${printer_type}`
        );
      } else {
        dishesWithoutPrintType.push(dish);
        console.log(
          `[LODOP] 🍽️ 菜品 "${dish.dishes_name}" 无 printType，归入通用组`
        );
      }
    });
    debugger;
    // 为每个 printer_type 找到对应的打印机
    dishesWithPrintType.forEach((dishes, printer_type) => {
      const targetPrinter = this.printers.find(
        (p) =>
          p.printerNumber === printer_type &&
          this.selectedPrinters.includes(p.name)
      );

      if (targetPrinter) {
        printerGroups.set(targetPrinter.name, {
          dishes: dishes,
          hasFullOrder: false,
          printerName: targetPrinter.name,
          printerNumber: printer_type,
          printer_type: printer_type,
        });
        console.log(
          `[LODOP] 🍽️ printer_type ${printer_type} -> 打印机 "${targetPrinter.name}" (${dishes.length}个菜品)`
        );
      } else {
        console.log(
          `[LODOP] 🍽️ 警告: printer_type ${printer_type} 没有找到对应的打印机，归入通用组`
        );
        dishesWithoutPrintType.push(...dishes);
      }
    });

    // 处理没有 printer_type 的菜品和没有编号的打印机
    if (dishesWithoutPrintType.length > 0) {
      console.log(
        `[LODOP] 🍽️ 处理 ${dishesWithoutPrintType.length} 个通用菜品`
      );

      // 找到没有编号的打印机，打印完整订单
      const unNumberedPrinters = this.selectedPrinters.filter((printerName) => {
        const printer = this.printers.find((p) => p.name === printerName);
        return !printer || !printer.printerNumber;
      });

      if (unNumberedPrinters.length > 0) {
        unNumberedPrinters.forEach((printerName) => {
          printerGroups.set(printerName, {
            dishes: order.dishes_array || [], // 完整订单
            hasFullOrder: true,
            printerName: printerName,
            printer_type: null,
          });
          console.log(
            `[LODOP] 🍽️ 未编号打印机 "${printerName}" 将打印完整订单`
          );
        });
      } else if (printerGroups.size === 0) {
        // 如果没有任何分组，至少选择一台打印机打印完整订单
        const firstPrinter = this.selectedPrinters[0];
        if (firstPrinter) {
          printerGroups.set(firstPrinter, {
            dishes: order.dishes_array || [],
            hasFullOrder: true,
            printerName: firstPrinter,
            printer_type: null,
          });
          console.log(`[LODOP] 🍽️ 兜底: 使用 "${firstPrinter}" 打印完整订单`);
        }
      }
    }

    console.log(
      `[LODOP] 🍽️ printer_type 分菜分组完成，共分配到 ${printerGroups.size} 台打印机`
    );
    return printerGroups;
  }

  // 🍽️ 新增：生成部分订单打印内容（仅包含指定 printer_type 的菜品）
  generatePartialOrderPrintContent(order, group) {
    console.log(
      `[LODOP] 🍽️ 🎯 生成部分订单打印内容（固定模板）(printer_type: ${group.printer_type}, ${group.dishes.length}个菜品)...`
    );

    // 获取打印机宽度设置
    const printer = this.printers.find((p) => p.name === group.printerName);
    const paperWidth = printer ? printer.width : 80;

    // 🎯 使用新的固定模板布局系统
    const layout = this.calculateLayoutParams(paperWidth);

    let content = '';

    // ============= 订单号区域：靠左对齐 =============
    content += `#${order.order_id}`;

    content += '\n';
    content += '\n';

    // ============= 订单信息：基本信息 =============
    content += `Order Date: ${this.formatDateTime(order.create_time)}\n`;
    content += `Pickup Time: ${this.formatDateTime(order.delivery_time)}\n`;

    const paystyle = order.paystyle == 1 ? 'Card' : 'Cash';
    content += `Payment: ${paystyle}\n`;
    content += `Customer: ${order.recipient_name || 'N/A'}\n`;
    content += `Phone: ${order.recipient_phone || 'N/A'}\n`;

    // 取餐方式
    const deliveryType = order.delivery_type == 1 ? 'Delivery' : 'Pickup';
    content += `Type: ${deliveryType}\n`;

    content += '\n';
    content += '='.repeat(layout.totalCharWidth) + '\n';

    // ============= 菜单表格：仅显示指定 printer_type 的菜品，固定列宽 =============
    console.log('[LODOP] 🍽️ 🎯 使用固定模板表格布局 (部分菜品):', {
      菜名列: `${layout.table.nameWidth}字符 (${layout.debug.tableRatio.菜名})`,
      数量列: `${layout.table.qtyWidth}字符 (${layout.debug.tableRatio.数量})`,
      价格列: `${layout.table.priceWidth}字符 (${layout.debug.tableRatio.价格})`,
    });

    // 🎯 表头：使用新的格式化函数
    content += this.formatItemLine('Item', 'Qty', 'Price', layout) + '\n';
    content += '-'.repeat(layout.totalCharWidth) + '\n';

    // ============= 菜单明细：只显示指定 printer_type 的菜品，固定列宽对齐 =============
    let totalAmount = 0;
    group.dishes.forEach((dish) => {
      const price = parseFloat(dish.price || '0');
      const qty = parseInt(dish.amount || '1');
      const priceStr = `$${price.toFixed(2)}`;

      totalAmount += price;

      // 🎯 菜名处理：使用固定列宽
      const dishName = this.getFormattedDishName(dish);
      if (this.displayWidth(dishName) <= layout.table.nameWidth) {
        // 菜名不超宽，单行显示 - 使用新的格式化函数
        content += this.formatItemLine(dishName, qty, priceStr, layout) + '\n';
      } else {
        // 菜名超宽，多行显示
        const wrappedName = this.wrapText(dishName, layout.table.nameWidth);
        const nameLines = wrappedName.split('\n');

        // 第一行：菜名 + 数量 + 价格
        const firstLine = nameLines[0] || '';
        content += this.formatItemLine(firstLine, qty, priceStr, layout) + '\n';

        // 后续行：只显示菜名续
        for (let i = 1; i < nameLines.length; i++) {
          if (nameLines[i].trim()) {
            content += this.padText(
              nameLines[i],
              layout.table.nameWidth,
              'left'
            );
            content += ' '.repeat(
              layout.table.qtyWidth + layout.table.priceWidth
            ); // 数量和价格列留空
            content += '\n';
          }
        }
      }

      // 🎯 规格处理：缩进显示，使用固定宽度换行
      if (dish.remark && dish.remark.trim()) {
        const specIndent = 2; // 2个空格缩进
        const specWidth = layout.table.nameWidth - specIndent;
        const wrappedSpec = this.wrapText(dish.remark, specWidth);
        const specLines = wrappedSpec.split('\n');

        specLines.forEach((line) => {
          if (line.trim()) {
            content += ' '.repeat(specIndent); // 缩进
            content += this.padText(line, specWidth, 'left');
            content += ' '.repeat(
              layout.table.qtyWidth + layout.table.priceWidth
            ); // 数量和价格列留空
            content += '\n';
          }
        });
      }

      content += '\n'; // 每个菜品后空一行
    });

    content += '='.repeat(layout.totalCharWidth) + '\n';

    // ============= 费用明细：使用固定模板布局，两端对齐 =============
    const subtotal = parseFloat(order.sub_total || '0');
    const discount = parseFloat(order.discount_total || '0');
    const taxFee = parseFloat(order.tax_fee || '0');
    const taxRate = parseFloat(order.tax_rate || '0');
    const deliveryFee = parseFloat(order.delivery_fee || '0');
    const serviceFee = parseFloat(order.convenience_fee || '0');
    const serviceRate = parseFloat(order.convenience_rate || '0');
    const tip = parseFloat(order.tip_fee || '0');
    const total = parseFloat(order.total || '0');

    console.log('[LODOP] 🍽️ 🎯 部分订单使用固定模板费用布局:', {
      标签列: `${layout.fee.labelWidth}字符 (${layout.debug.feeRatio.标签})`,
      金额列: `${layout.fee.amountWidth}字符 (${layout.debug.feeRatio.金额})`,
    });

    // 🎯 费用行：使用新的格式化函数，实现两端对齐
    // 小计
    content +=
      this.formatFeeLine('Subtotal', `$${subtotal.toFixed(2)}`, layout) + '\n';

    // 折扣
    if (discount > 0) {
      content +=
        this.formatFeeLine('Discount', `-$${discount.toFixed(2)}`, layout) +
        '\n';
    }

    // 税费
    if (taxFee > 0) {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate.toFixed(1)}%)` : 'Tax';
      content +=
        this.formatFeeLine(taxLabel, `$${taxFee.toFixed(2)}`, layout) + '\n';
    }

    // 配送费
    if (deliveryFee > 0) {
      content +=
        this.formatFeeLine(
          'Delivery Fee',
          `$${deliveryFee.toFixed(2)}`,
          layout
        ) + '\n';
    }

    // 服务费
    if (serviceFee > 0) {
      const serviceLabel =
        serviceRate > 0
          ? `Service Rate (${serviceRate.toFixed(4)}%)`
          : 'Service Fee';
      content +=
        this.formatFeeLine(serviceLabel, `$${serviceFee.toFixed(2)}`, layout) +
        '\n';
    }

    // 小费
    if (tip > 0) {
      content += this.formatFeeLine('Tip', `$${tip.toFixed(2)}`, layout) + '\n';
    }

    // 总计（加粗显示）
    content +=
      this.formatFeeLine('TOTAL', `$${total.toFixed(2)}`, layout) + '\n';

    // ============= 备注：靠左显示，自动换行 =============
    if (order.order_notes && order.order_notes.trim()) {
      content += '\n';
      content += '-'.repeat(layout.totalCharWidth) + '\n';
      content += 'Notes:\n';
      const wrappedNotes = this.wrapText(
        order.order_notes,
        layout.totalCharWidth - 2
      );
      const noteLines = wrappedNotes.split('\n');
      noteLines.forEach((line) => {
        if (line.trim()) {
          content += `  ${line}\n`;
        }
      });
    }

    // 结尾
    content += '\n';
    content += '='.repeat(layout.totalCharWidth) + '\n';

    console.log('[LODOP] 🍽️ 🎯 部分订单内容生成完成（固定模板）');
    return content;
  }

  // 🍽️ 新增：获取分菜打印配置
  getPrintTypeConfig() {
    return {
      enableSeparatePrinting: this.printTypeConfig.enableSeparatePrinting,
      printerNumbers: Object.fromEntries(this.printTypeConfig.printerNumbers),
      availablePrinters: this.printers.map((p) => ({
        name: p.name,
        number: p.printerNumber,
      })),
    };
  }

  // 🍽️ 新增：重置分菜打印配置
  resetPrintTypeConfig() {
    console.log('[LODOP] 🍽️ 重置分菜打印配置');
    this.printTypeConfig.printerNumbers.clear();
    this.printTypeConfig.enableSeparatePrinting = false;

    console.log('[LODOP] 🍽️ 分菜打印配置已重置');
    return true;
  }

  // 🌍 新增：语言配置相关方法
  setLanguageConfig(config) {
    this.languageConfig = {
      ...this.languageConfig,
      ...config,
    };
    console.log('[LODOP] 🌍 语言配置已更新:', this.languageConfig);
  }

  getLanguageConfig() {
    return { ...this.languageConfig };
  }

  // 🌍 获取格式化的菜名（根据语言配置）
  getFormattedDishName(dish) {
    const { enableEnglish, enableChinese } = this.languageConfig;

    let dishName = '';

    if (enableEnglish && enableChinese) {
      // 双语模式：显示 "English Name + 中文名称"
      const englishName = dish.name_en || dish.dishes_name || '';
      const chineseName = dish.name_ch || '';

      if (englishName && chineseName) {
        dishName = `${englishName} + ${chineseName}`;
      } else if (englishName) {
        dishName = englishName;
      } else if (chineseName) {
        dishName = chineseName;
      } else {
        dishName = dish.dishes_name || 'Unknown Dish';
      }
    } else if (enableEnglish) {
      // 仅英文模式
      dishName = dish.name_en || dish.dishes_name || 'Unknown Dish';
    } else if (enableChinese) {
      // 仅中文模式
      dishName = dish.name_ch || dish.dishes_name || '未知菜品';
    } else {
      // 未选择任何语言，使用默认字段
      dishName = dish.dishes_name || 'Unknown Dish';
    }

    console.log(
      `[LODOP] 🌍 菜名格式化: 原始="${dish.dishes_name}" 英文="${dish.name_en}" 中文="${dish.name_ch}" -> 输出="${dishName}"`
    );
    return dishName;
  }
}

console.log('[LODOP-SCRIPT] LodopPrinterManager 类定义完成');

// 浏览器环境导出
if (typeof window !== 'undefined') {
  window.LodopPrinterManager = LodopPrinterManager;
  console.log('[LODOP-SCRIPT] LodopPrinterManager 已导出到 window 对象');
} else {
  console.log('[LODOP-SCRIPT] window 对象不存在，跳过浏览器导出');
}

// Node.js环境导出（如果支持）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LodopPrinterManager;
  console.log('[LODOP-SCRIPT] LodopPrinterManager 已导出到 module.exports');
}

console.log('[LODOP-SCRIPT] printer-lodop.js 加载完成');
