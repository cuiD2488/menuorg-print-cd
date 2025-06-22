// C-Lodop 打印机管理器
// 用于兼容 Windows 7 系统的打印解决方案

console.log('[LODOP-SCRIPT] printer-lodop.js 开始加载...');

class LodopPrinterManager {
  constructor() {
    this.LODOP = null;
    this.isInitialized = false;
    this.printers = [];
    this.selectedPrinters = [];

    console.log('[LODOP] C-Lodop 打印机管理器初始化');
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
      const paperWidthMm = `${paperWidth}mm`;
      console.log(paperWidth, 'paperWidthpaperWidth');

      // 优化纸张高度计算 - 更精确的计算，减少底部空白
      const lines = content.split('\n');
      const nonEmptyLines = lines.filter((line) => line.trim()).length;
      const emptyLines = lines.length - nonEmptyLines;

      // 精确计算：非空行4mm + 空行2mm + 上下边距6mm
      const estimatedHeight = Math.max(
        nonEmptyLines * 4 + emptyLines * 2 + 6,
        80
      );
      const paperHeightMm = `${estimatedHeight}mm`;

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

      let yPosMm = 3; // 从顶部3mm开始，与底部边距一致
      const lineHeightMm = 4; // 行高4mm
      const leftMarginMm = 0.5; // 🔧 左边距0.5mm，避免贴边
      const rightMarginMm = 0.5; // 🔧 右边距0.5mm，避免贴边

      // 🔧 关键修复：使用与generateOrderPrintContent一致的字符宽度
      let totalWidth;
      if (paperWidth === 80) {
        // 80mm热敏纸：与generateOrderPrintContent保持一致
        totalWidth = 34;
      } else if (paperWidth === 58) {
        // 58mm热敏纸：与generateOrderPrintContent保持一致
        totalWidth = 24;
      } else {
        // 其他尺寸保守计算
        totalWidth = Math.floor(paperWidth * 0.4);
      }

      console.log(
        `[LODOP] 🔧 字符宽度统一 - 打印机宽度: ${paperWidth}mm, 字符宽度: ${totalWidth}`
      );

      // 🔧 热敏小票字体大小设置 - 稍微增大字体
      const baseFontSize = paperWidth === 58 ? 11 : 12; // 58mm用11pt，80mm用12pt
      const titleFontSize = baseFontSize + 2; // 标题字体
      const itemFontSize = baseFontSize + 1; // 菜品字体
      const normalFontSize = baseFontSize; // 普通字体

      console.log(
        `[LODOP] 🎫 字体设置 - 标题: ${titleFontSize}pt, 菜品: ${itemFontSize}pt, 普通: ${normalFontSize}pt`
      );

      // 🔧 修复：计算实际文本区域宽度，考虑边距
      const availableWidthMm = paperWidth - leftMarginMm - rightMarginMm; // 可用宽度
      // const availableWidthMm = paperWidth; // 可用宽度
      const avgCharWidthMm = baseFontSize * 0.15; // 估算字符宽度
      const textAreaWidthMm = totalWidth * avgCharWidthMm; // 文本区域宽度

      // 确保文本区域不超过可用宽度，但也不要太小
      const finalTextWidthMm = Math.min(textAreaWidthMm, availableWidthMm);

      console.log(
        `[LODOP] 🔧 边距修复: 纸张宽度=${paperWidth}mm, 左边距=${leftMarginMm}mm, 右边距=${rightMarginMm}mm`
      );
      console.log(
        `[LODOP] 🔧 宽度计算: 可用宽度=${availableWidthMm}mm, 文本区域=${textAreaWidthMm}mm, 最终宽度=${finalTextWidthMm}mm`
      );

      // 逐行添加打印内容
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🔧 关键修复：使用边距设置（与打印功能一致）
          this.LODOP.ADD_PRINT_TEXT(
            `${yPosMm}mm`, // Top - 明确指定单位
            `${leftMarginMm}mm`, // Left - 🔧 使用左边距！
            `${finalTextWidthMm}mm`, // Width - 🔧 使用计算出的文本宽度！
            `${lineHeightMm}mm`, // Height - 明确指定单位
            line
          );

          // 🔧 热敏小票字体样式设置 - 根据内容类型设置不同字体大小
          if (line.includes('Order #:')) {
            // 订单号 - 最大字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', titleFontSize);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (line.includes('TOTAL')) {
            // 总计 - 大字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', itemFontSize);
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
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', normalFontSize);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (line.startsWith('---') || line.startsWith('===')) {
            // 分隔线 - 小字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', normalFontSize - 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (
            this.isItemLine(line) ||
            line.includes('Item') ||
            line.includes('Qty') ||
            line.includes('Price')
          ) {
            // 菜品行和表头 - 菜品字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', itemFontSize);
            this.LODOP.SET_PRINT_STYLEA(
              i,
              'Bold',
              line.includes('Item') ? 1 : 0
            ); // 表头加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else {
            // 其他文本 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', normalFontSize);
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
    console.log('[LODOP] 生成热敏小票打印内容...');

    // 获取打印机宽度设置
    const printer = this.printers.find((p) =>
      this.selectedPrinters.includes(p.name)
    );
    const paperWidth = printer ? printer.width : 80;

    // 🎫 热敏小票机专用字符宽度设置 - 自适应多种宽度
    let totalWidth;
    if (paperWidth >= 80) {
      // 80mm及以上热敏纸：实际可用约32-34字符
      totalWidth = 34;
    } else if (paperWidth >= 58) {
      // 58mm热敏纸：实际可用约24字符
      totalWidth = 24;
    } else if (paperWidth >= 48) {
      // 48mm热敏纸：实际可用约20字符
      totalWidth = 20;
    } else {
      // 更小尺寸保守计算
      totalWidth = Math.max(Math.floor(paperWidth * 0.35), 16);
    }

    console.log(
      `[LODOP] 🎫 热敏小票设置 - 纸张宽度: ${paperWidth}mm, 字符宽度: ${totalWidth}`
    );

    let content = '';

    // ============= 头部区域：餐厅信息居中 =============
    // content += '='.repeat(totalWidth) + '\n';

    // 餐厅名称（居中，加粗效果用**包围）
    // const restaurantName = order.rd_name || 'RESTAURANT';
    // content += this.centerText(restaurantName.toUpperCase(), totalWidth) + '\n';
    content += `#${order.order_id}` + '\n';
    // 订单类型（居中）
    const deliveryType = order.delivery_style == 1 ? 'DELIVERY' : 'PICKUP';
    content += this.centerText(deliveryType, totalWidth) + '\n';

    content += '='.repeat(totalWidth) + '\n';
    content += '\n';

    // ============= 订单号区域：居中显示 =============
    // content += `#${order.order_id}` + '\n';
    // content += '='.repeat(totalWidth) + '\n';

    // ============= 订单信息：表格布局 =============
    const orderDate = this.formatDateTime(order.create_time);
    const deliveryTime = this.formatDateTime(order.delivery_time);
    const paystyle = order.paystyle == 1 ? 'Card' : 'Cash';
    const customerName = order.recipient_name || 'N/A';
    const customerPhone = order.recipient_phone || 'N/A';

    // 时间信息右对齐
    content += this.formatTableRow('Order Date:', orderDate, totalWidth);
    const timeLabel =
      order.delivery_style == 1 ? 'Delivery Time:' : 'Pickup Time:';
    content += this.formatTableRow(timeLabel, deliveryTime, totalWidth);
    content += this.formatTableRow('Payment:', paystyle, totalWidth);
    content += this.formatTableRow('Customer:', customerName, totalWidth);
    content += this.formatTableRow('Phone:', customerPhone, totalWidth);

    // 如果是外送，显示地址
    if (order.delivery_style == 1 && order.recipient_address) {
      const address = order.recipient_address;
      if (this.displayWidth(`Address: ${address}`) <= totalWidth) {
        content += this.formatTableRow('Address:', address, totalWidth);
      } else {
        content += 'Address:\n';
        // 地址换行显示，每行缩进2个空格
        const wrappedAddress = this.wrapText(address, totalWidth - 2);
        const addressLines = wrappedAddress.split('\n');
        addressLines.forEach((line) => {
          if (line.trim()) {
            content += `  ${line}\n`;
          }
        });
      }
    }

    content += '\n';
    content += '-'.repeat(totalWidth) + '\n';

    // ============= 订单明细区域标题 =============
    content += this.centerText('ORDER ITEMS', totalWidth) + '\n';
    content += '-'.repeat(totalWidth) + '\n';

    // ============= 菜品表格：专业布局 =============
    const dishes = order.dishes_array || [];

    // 根据纸张宽度调整列宽
    let nameWidth, qtyWidth, priceWidth;
    if (totalWidth >= 32) {
      // 80mm纸张：较宽布局
      nameWidth = totalWidth - 12; // 菜名列
      qtyWidth = 4; // 数量列
      priceWidth = 8; // 价格列
    } else if (totalWidth >= 24) {
      // 58mm纸张：紧凑布局
      nameWidth = totalWidth - 10;
      qtyWidth = 3;
      priceWidth = 7;
    } else {
      // 更小纸张：最紧凑布局
      nameWidth = totalWidth - 8;
      qtyWidth = 3;
      priceWidth = 5;
    }

    // 表头
    const itemHeader = this.padText('Item Name', nameWidth, 'left');
    const qtyHeader = this.padText('Qty', qtyWidth, 'center');
    const priceHeader = this.padText('Total', priceWidth, 'right');
    content += itemHeader + qtyHeader + priceHeader + '\n';
    content += '-'.repeat(totalWidth) + '\n';

    // 菜品明细
    dishes.forEach((dish) => {
      const price = parseFloat(dish.price || '0');
      const qty = parseInt(dish.amount || '1');
      const priceStr = `$${price.toFixed(2)}`;
      const qtyStr = qty.toString();

      // 菜名处理：长菜名自动换行
      const dishName = dish.dishes_name || '';
      const dishLines = this.wrapText(dishName, nameWidth);
      const dishLinesArray = dishLines.split('\n');

      // 第一行：菜名 + 数量 + 价格
      const firstLine = this.padText(
        dishLinesArray[0] || '',
        nameWidth,
        'left'
      );
      const qtyPart = this.padText(qtyStr, qtyWidth, 'center');
      const pricePart = this.padText(priceStr, priceWidth, 'right');
      content += firstLine + qtyPart + pricePart + '\n';

      // 后续行：只显示菜名续行
      for (let i = 1; i < dishLinesArray.length; i++) {
        if (dishLinesArray[i].trim()) {
          const continueLine = this.padText(
            dishLinesArray[i],
            nameWidth,
            'left'
          );
          content += continueLine + ' '.repeat(qtyWidth + priceWidth) + '\n';
        }
      }

      // 规格信息：缩进显示
      if (dish.remark && dish.remark.trim()) {
        const specIndent = 2;
        const specWidth = totalWidth - specIndent;
        const wrappedSpec = this.wrapText(dish.remark, specWidth);
        const specLines = wrappedSpec.split('\n');

        specLines.forEach((line) => {
          if (line.trim()) {
            content += `  ${line}\n`;
          }
        });
      }
    });

    content += '\n';
    content += '-'.repeat(totalWidth) + '\n';

    // ============= 费用汇总区域 =============
    content += this.centerText('PAYMENT SUMMARY', totalWidth) + '\n';
    content += '-'.repeat(totalWidth) + '\n';

    const subtotal = parseFloat(order.sub_total || '0');
    const discount = parseFloat(order.discount_total || '0');
    const taxFee = parseFloat(order.tax_fee || '0');
    const taxRate = parseFloat(order.tax_rate || '0');
    const deliveryFee = parseFloat(order.delivery_fee || '0');
    const serviceFee = parseFloat(order.convenience_fee || '0');
    const serviceRate = parseFloat(order.convenience_rate || '0');
    const tip = parseFloat(order.tip_fee || '0');
    const total = parseFloat(order.total || '0');

    // 费用明细右对齐
    content += this.formatTableRow(
      'Subtotal:',
      `$${subtotal.toFixed(2)}`,
      totalWidth
    );

    if (discount > 0) {
      content += this.formatTableRow(
        'Discount:',
        `-$${discount.toFixed(2)}`,
        totalWidth
      );
    }

    if (taxFee > 0) {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate.toFixed(1)}%):` : 'Tax:';
      content += this.formatTableRow(
        taxLabel,
        `$${taxFee.toFixed(2)}`,
        totalWidth
      );
    }

    if (deliveryFee > 0) {
      content += this.formatTableRow(
        'Delivery Fee:',
        `$${deliveryFee.toFixed(2)}`,
        totalWidth
      );
    }

    if (serviceFee > 0) {
      const serviceLabel =
        serviceRate > 0 ? `Service (${serviceRate.toFixed(1)}%):` : 'Service:';
      content += this.formatTableRow(
        serviceLabel,
        `$${serviceFee.toFixed(2)}`,
        totalWidth
      );
    }

    if (tip > 0) {
      content += this.formatTableRow('Tip:', `$${tip.toFixed(2)}`, totalWidth);
    }

    content += '-'.repeat(totalWidth) + '\n';

    // 总计（突出显示）
    content += this.formatTableRow(
      'TOTAL:',
      `$${total.toFixed(2)}`,
      totalWidth
    );

    content += '='.repeat(totalWidth) + '\n';

    // ============= 备注区域 =============
    if (order.order_notes && order.order_notes.trim()) {
      content += '\n';
      content += 'Notes:\n';
      const wrappedNotes = this.wrapText(order.order_notes, totalWidth - 2);
      const noteLines = wrappedNotes.split('\n');
      noteLines.forEach((line) => {
        if (line.trim()) {
          content += `  ${line}\n`;
        }
      });
      content += '\n';
    }

    // ============= 底部信息 =============
    // content += '\n';
    // content += this.centerText('Thank you for your order!', totalWidth) + '\n';

    // 如果订单有预付费标识
    if (order.paystyle == 1) {
      content += this.centerText('Prepaid - Do Not Charge', totalWidth) + '\n';
    }

    // content += '\n';
    // content += '='.repeat(totalWidth) + '\n';

    console.log('[LODOP] 🎫 专业热敏小票内容生成完成');
    console.log('[LODOP] 内容预览:\n', content);
    return content;
  }

  // 辅助函数：居中文本
  centerText(text, width) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) {
      return this.truncateText(text, width);
    }
    const padding = width - textWidth;
    const leftPad = Math.floor(padding / 2);
    return ' '.repeat(leftPad) + text;
  }

  // 辅助函数：表格行格式（左标签，右数值）
  formatTableRow(label, value, width) {
    const labelWidth = this.displayWidth(label);
    const valueWidth = this.displayWidth(value);
    const totalUsed = labelWidth + valueWidth;

    if (totalUsed >= width) {
      // 如果太长，换行显示
      return `${label}\n  ${value}\n`;
    }

    const padding = width - totalUsed;
    return label + ' '.repeat(padding) + value + '\n';
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
        year: 'numeric',
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
      const paperWidthMm = `${paperWidth}mm`;

      // 使用与打印相同的高度计算逻辑
      const lines = content.split('\n');
      const nonEmptyLines = lines.filter((line) => line.trim()).length;
      const emptyLines = lines.length - nonEmptyLines;

      // 精确计算：非空行4mm + 空行2mm + 上下边距6mm
      const estimatedHeight = Math.max(
        nonEmptyLines * 4 + emptyLines * 2 + 6,
        80
      );
      const paperHeightMm = `${estimatedHeight}mm`;

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

      let yPosMm = 3; // 从顶部3mm开始，与底部边距一致
      const lineHeightMm = 4; // 行高4mm
      const leftMarginMm = 0.5; // 🔧 左边距0.5mm，避免贴边
      const rightMarginMm = 0.5; // 🔧 右边距0.5mm，避免贴边

      // 🔧 关键修复：使用与generateOrderPrintContent一致的字符宽度
      let totalWidth;
      if (paperWidth === 80) {
        // 80mm热敏纸：与generateOrderPrintContent保持一致
        totalWidth = 34;
      } else if (paperWidth === 58) {
        // 58mm热敏纸：与generateOrderPrintContent保持一致
        totalWidth = 24;
      } else {
        // 其他尺寸保守计算
        totalWidth = Math.floor(paperWidth * 0.4);
      }

      // 🔧 热敏小票字体大小设置 - 稍微增大字体（与打印保持一致）
      const baseFontSize = paperWidth === 58 ? 11 : 12; // 58mm用11pt，80mm用12pt
      const titleFontSize = baseFontSize + 2; // 标题字体
      const itemFontSize = baseFontSize + 1; // 菜品字体
      const normalFontSize = baseFontSize; // 普通字体

      console.log(
        `[LODOP] 🎫 预览字体设置 - 标题: ${titleFontSize}pt, 菜品: ${itemFontSize}pt, 普通: ${normalFontSize}pt`
      );

      // 🔧 修复：计算实际文本区域宽度，考虑边距（与打印功能一致）
      const availableWidthMm = paperWidth - leftMarginMm - rightMarginMm; // 可用宽度
      const avgCharWidthMm = baseFontSize * 0.15; // 估算字符宽度
      const textAreaWidthMm = totalWidth * avgCharWidthMm; // 文本区域宽度

      // 确保文本区域不超过可用宽度，但也不要太小
      const finalTextWidthMm = Math.min(textAreaWidthMm, availableWidthMm);

      console.log(
        `[LODOP] 🔧 预览边距修复: 纸张宽度=${paperWidth}mm, 左边距=${leftMarginMm}mm, 右边距=${rightMarginMm}mm`
      );
      console.log(
        `[LODOP] 🔧 预览宽度计算: 可用宽度=${availableWidthMm}mm, 文本区域=${textAreaWidthMm}mm, 最终宽度=${finalTextWidthMm}mm`
      );

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🔧 关键修复：使用边距设置（与打印功能一致）
          this.LODOP.ADD_PRINT_TEXT(
            `${yPosMm}mm`, // Top - 明确指定单位
            `${leftMarginMm}mm`, // Left - 🔧 使用左边距！
            `${finalTextWidthMm}mm`, // Width - 🔧 使用计算出的文本宽度！
            `${lineHeightMm}mm`, // Height - 明确指定单位
            line
          );

          // 🔧 热敏小票预览字体样式设置 - 与打印保持一致
          if (line.includes('Order #:')) {
            // 订单号 - 最大字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', titleFontSize);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (line.includes('TOTAL')) {
            // 总计 - 大字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', itemFontSize);
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
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', normalFontSize);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (line.startsWith('---') || line.startsWith('===')) {
            // 分隔线 - 小字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', normalFontSize - 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (
            this.isItemLine(line) ||
            line.includes('Item') ||
            line.includes('Qty') ||
            line.includes('Price')
          ) {
            // 菜品行和表头 - 菜品字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', itemFontSize);
            this.LODOP.SET_PRINT_STYLEA(
              i,
              'Bold',
              line.includes('Item') ? 1 : 0
            ); // 表头加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else {
            // 其他文本 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', normalFontSize);
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
