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

    console.log('[LODOP] C-Lodop 打印机管理器初始化（支持百分比排版）');
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

  // 🔧 新增：根据纸张宽度计算布局参数
  calculateLayoutParams(paperWidth) {
    const config = this.layoutConfig;

    // 计算边距（毫米）
    const leftMarginMm = (paperWidth * config.margins.left) / 100;
    const rightMarginMm = (paperWidth * config.margins.right) / 100;
    const topMarginMm = config.margins.top;
    const bottomMarginMm = config.margins.bottom;

    // 计算可用宽度
    const availableWidthMm = paperWidth - leftMarginMm - rightMarginMm;

    // 计算字符宽度
    const ratio =
      config.charWidthRatio[paperWidth] || config.charWidthRatio.default;
    const totalCharWidth = Math.floor(paperWidth * ratio);

    // 选择表格布局
    let tableLayout;
    if (paperWidth >= 80) {
      tableLayout = config.tableLayout.standard;
    } else if (paperWidth >= 58) {
      tableLayout = config.tableLayout.compact;
    } else {
      tableLayout = config.tableLayout.minimal;
    }

    // 计算表格列宽（字符数）
    const nameWidth = Math.floor(
      (totalCharWidth * tableLayout.nameColumn) / 100
    );
    const qtyWidth = Math.floor((totalCharWidth * tableLayout.qtyColumn) / 100);
    const priceWidth = Math.floor(
      (totalCharWidth * tableLayout.priceColumn) / 100
    );

    // 计算费用明细列宽
    const feeLayout = config.feeLayout;
    const feeLabelWidth = Math.floor(
      (totalCharWidth * feeLayout.labelColumn) / 100
    );
    const feeAmountWidth = Math.floor(
      (totalCharWidth * feeLayout.amountColumn) / 100
    );

    // 计算字体大小
    const baseFontSize =
      config.fontSize.base[paperWidth] || config.fontSize.base.default;
    const titleFontSize = baseFontSize + config.fontSize.title;
    const itemFontSize = baseFontSize + config.fontSize.item;
    const normalFontSize = baseFontSize + config.fontSize.normal;

    // 计算文本区域宽度（毫米）
    const avgCharWidthMm = baseFontSize * 0.15;
    const textAreaWidthMm = totalCharWidth * avgCharWidthMm;
    const finalTextWidthMm = Math.min(textAreaWidthMm, availableWidthMm);

    return {
      // 边距信息
      margins: {
        left: leftMarginMm,
        right: rightMarginMm,
        top: topMarginMm,
        bottom: bottomMarginMm,
      },

      // 宽度信息
      paperWidth: paperWidth,
      availableWidth: availableWidthMm,
      totalCharWidth: totalCharWidth,
      textAreaWidth: finalTextWidthMm,

      // 表格布局
      table: {
        nameWidth: nameWidth,
        qtyWidth: qtyWidth,
        priceWidth: priceWidth,
        // 验证总宽度
        totalWidth: nameWidth + qtyWidth + priceWidth,
      },

      // 费用布局
      fee: {
        labelWidth: feeLabelWidth,
        amountWidth: feeAmountWidth,
        totalWidth: feeLabelWidth + feeAmountWidth,
      },

      // 字体信息
      fonts: {
        base: baseFontSize,
        title: titleFontSize,
        item: itemFontSize,
        normal: normalFontSize,
      },

      // 调试信息
      debug: {
        charWidthRatio: ratio,
        avgCharWidthMm: avgCharWidthMm,
        layoutType:
          paperWidth >= 80
            ? 'standard'
            : paperWidth >= 58
            ? 'compact'
            : 'minimal',
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
    console.log(`[LODOP] 开始打印订单: ${order.order_id}`);
    console.log(JSON.stringify(order));

    const selectedPrinters = this.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      throw new Error('未选择任何打印机');
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // 生成打印内容
    const printContent = this.generateOrderPrintContent(order);

    // 并行打印到所有选中的打印机
    const printPromises = selectedPrinters.map(async (printerName) => {
      try {
        await this.printToLodop(printerName, printContent, order);
        successCount++;
        console.log(`[LODOP] 订单打印成功: ${printerName}`);
        return { printer: printerName, success: true };
      } catch (error) {
        errorCount++;
        const errorMsg = `${printerName}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[LODOP] 订单打印失败 ${printerName}:`, error);
        return { printer: printerName, success: false, error: error.message };
      }
    });

    await Promise.all(printPromises);

    const result = {
      成功数量: successCount,
      失败数量: errorCount,
      错误列表: errors,
      打印引擎: 'C-Lodop',
    };

    console.log(`[LODOP] 订单 ${order.order_id} 打印完成:`, result);
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

      // 🔧 使用新的百分比布局系统
      const layout = this.calculateLayoutParams(paperWidth);

      console.log(`[LODOP] 🎯 ${printerName} 使用百分比布局参数:`, {
        纸张宽度: `${layout.paperWidth}mm`,
        布局类型: layout.debug.layoutType,
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

      console.log(`[LODOP] 🎯 百分比布局打印设置:`, {
        起始Y位置: `${yPosMm}mm`,
        左边距: `${layout.margins.left}mm`,
        文本宽度: `${layout.textAreaWidth}mm`,
        行高: `${lineHeightMm}mm`,
      });

      // 逐行添加打印内容
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🔧 使用百分比布局计算的参数
          this.LODOP.ADD_PRINT_TEXT(
            `${yPosMm}mm`, // Top - 使用计算出的Y位置
            `${layout.margins.left}mm`, // Left - 使用百分比计算的左边距
            `${layout.textAreaWidth}mm`, // Width - 使用百分比计算的文本宽度
            `${lineHeightMm}mm`, // Height - 行高
            line
          );

          // 🔧 使用百分比布局的字体设置
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
    console.log('[LODOP] 生成热敏小票打印内容（百分比布局）...');

    // 获取打印机宽度设置
    const printer = this.printers.find((p) =>
      this.selectedPrinters.includes(p.name)
    );
    const paperWidth = printer ? printer.width : 80;

    // 🔧 使用新的百分比布局系统
    const layout = this.calculateLayoutParams(paperWidth);

    console.log('[LODOP] 🎯 百分比布局计算结果:', {
      纸张宽度: `${layout.paperWidth}mm`,
      布局类型: layout.debug.layoutType,
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

    // ============= 订单信息：靠左对齐，无间隔字符 =============
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

    // ============= 菜单表格：百分比列宽设计 =============
    console.log('[LODOP] 🎯 使用百分比表格布局:', {
      菜名列: `${layout.table.nameWidth}字符 (${Math.round(
        (layout.table.nameWidth / layout.totalCharWidth) * 100
      )}%)`,
      数量列: `${layout.table.qtyWidth}字符 (${Math.round(
        (layout.table.qtyWidth / layout.totalCharWidth) * 100
      )}%)`,
      价格列: `${layout.table.priceWidth}字符 (${Math.round(
        (layout.table.priceWidth / layout.totalCharWidth) * 100
      )}%)`,
    });

    // 表头
    content += this.padText('Item', layout.table.nameWidth, 'left');
    content += this.padText('Qty', layout.table.qtyWidth, 'center');
    content += this.padText('Price', layout.table.priceWidth, 'right');
    content += '\n';
    content += '-'.repeat(layout.totalCharWidth) + '\n';

    // ============= 菜单明细：百分比列宽，自动换行 =============
    const dishes = order.dishes_array || [];
    dishes.forEach((dish) => {
      const price = parseFloat(dish.price || '0');
      const qty = parseInt(dish.amount || '1');
      const priceStr = `$${price.toFixed(2)}`;
      const qtyStr = qty.toString();

      // 🔧 菜名处理：使用百分比计算的列宽
      const dishName = dish.dishes_name || '';
      if (this.displayWidth(dishName) <= layout.table.nameWidth) {
        // 菜名不超宽，单行显示
        content += this.padText(dishName, layout.table.nameWidth, 'left');
        content += this.padText(qtyStr, layout.table.qtyWidth, 'center');
        content += this.padText(priceStr, layout.table.priceWidth, 'right');
        content += '\n';
      } else {
        // 菜名超宽，多行显示
        const wrappedName = this.wrapText(dishName, layout.table.nameWidth);
        const nameLines = wrappedName.split('\n');

        // 第一行：菜名 + 数量 + 价格
        const firstLine = nameLines[0] || '';
        content += this.padText(firstLine, layout.table.nameWidth, 'left');
        content += this.padText(qtyStr, layout.table.qtyWidth, 'center');
        content += this.padText(priceStr, layout.table.priceWidth, 'right');
        content += '\n';

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

      // 🔧 规格处理：缩进显示，使用百分比宽度换行
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

    // ============= 费用明细：使用百分比布局 =============
    const subtotal = parseFloat(order.sub_total || '0');
    const discount = parseFloat(order.discount_total || '0');
    const taxFee = parseFloat(order.tax_fee || '0');
    const taxRate = parseFloat(order.tax_rate || '0');
    const deliveryFee = parseFloat(order.delivery_fee || '0');
    const serviceFee = parseFloat(order.convenience_fee || '0');
    const serviceRate = parseFloat(order.convenience_rate || '0');
    const tip = parseFloat(order.tip_fee || '0');
    const total = parseFloat(order.total || '0');

    console.log('[LODOP] 🎯 使用百分比费用布局:', {
      标签列: `${layout.fee.labelWidth}字符 (${Math.round(
        (layout.fee.labelWidth / layout.totalCharWidth) * 100
      )}%)`,
      金额列: `${layout.fee.amountWidth}字符 (${Math.round(
        (layout.fee.amountWidth / layout.totalCharWidth) * 100
      )}%)`,
    });

    // 🔧 费用行：使用百分比列宽
    // 小计
    content += this.padText('Subtotal', layout.fee.labelWidth, 'left');
    content += this.padText(
      `$${subtotal.toFixed(2)}`,
      layout.fee.amountWidth,
      'right'
    );
    content += '\n';

    // 折扣
    if (discount > 0) {
      content += this.padText('Discount', layout.fee.labelWidth, 'left');
      content += this.padText(
        `-$${discount.toFixed(2)}`,
        layout.fee.amountWidth,
        'right'
      );
      content += '\n';
    }

    // 税费
    if (taxFee > 0) {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate.toFixed(1)}%)` : 'Tax';
      content += this.padText(taxLabel, layout.fee.labelWidth, 'left');
      content += this.padText(
        `$${taxFee.toFixed(2)}`,
        layout.fee.amountWidth,
        'right'
      );
      content += '\n';
    }

    // 配送费
    if (deliveryFee > 0) {
      content += this.padText('Delivery Fee', layout.fee.labelWidth, 'left');
      content += this.padText(
        `$${deliveryFee.toFixed(2)}`,
        layout.fee.amountWidth,
        'right'
      );
      content += '\n';
    }

    // 服务费
    if (serviceFee > 0) {
      const serviceLabel =
        serviceRate > 0
          ? `Service Rate (${serviceRate.toFixed(4)}%)`
          : 'Service Fee';
      content += this.padText(serviceLabel, layout.fee.labelWidth, 'left');
      content += this.padText(
        `$${serviceFee.toFixed(2)}`,
        layout.fee.amountWidth,
        'right'
      );
      content += '\n';
    }

    // 小费
    if (tip > 0) {
      content += this.padText('Tip', layout.fee.labelWidth, 'left');
      content += this.padText(
        `$${tip.toFixed(2)}`,
        layout.fee.amountWidth,
        'right'
      );
      content += '\n';
    }

    // 总计（加粗显示）
    content += this.padText('TOTAL', layout.fee.labelWidth, 'left');
    content += this.padText(
      `$${total.toFixed(2)}`,
      layout.fee.amountWidth,
      'right'
    );
    content += '\n';

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

    console.log('[LODOP] 🎯 百分比布局小票内容生成完成');
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

  // 辅助函数：文本填充
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
      default:
        return text + ' '.repeat(padding);
    }
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

      // 🔧 使用新的百分比布局系统
      const layout = this.calculateLayoutParams(paperWidth);

      console.log(`[LODOP] 🎯 预览使用百分比布局参数:`, {
        纸张宽度: `${layout.paperWidth}mm`,
        布局类型: layout.debug.layoutType,
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

      console.log(`[LODOP] 🎯 百分比布局预览设置:`, {
        起始Y位置: `${yPosMm}mm`,
        左边距: `${layout.margins.left}mm`,
        文本宽度: `${layout.textAreaWidth}mm`,
        行高: `${lineHeightMm}mm`,
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🔧 使用百分比布局计算的参数
          this.LODOP.ADD_PRINT_TEXT(
            `${yPosMm}mm`, // Top - 使用计算出的Y位置
            `${layout.margins.left}mm`, // Left - 使用百分比计算的左边距
            `${layout.textAreaWidth}mm`, // Width - 使用百分比计算的文本宽度
            `${lineHeightMm}mm`, // Height - 行高
            line
          );

          // 🔧 使用百分比布局的字体设置（与打印保持一致）
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
