// C-Lodop 打印机管理器
// 用于兼容 Windows 7 系统的打印解决方案

console.log('[LODOP-SCRIPT] printer-lodop.js 开始加载...');

class LodopPrinterManager {
  constructor() {
    this.LODOP = null;
    this.isInitialized = false;
    this.printers = [];
    this.selectedPrinters = [];

    // 🔧 固定宽度布局配置
    this.layoutConfig = {
      // 边距配置（毫米）
      margins: {
        left: 2.0, // 左边距2mm
        right: 2.0, // 右边距2mm
        top: 3.0, // 顶部边距3mm
        bottom: 3.0, // 底部边距3mm
      },

      // 固定表格列宽配置（毫米）
      fixedTableLayout: {
        nameColumn: 64, // 菜名列：64mm
        qtyColumn: 2, // 数量列：2mm
        priceColumn: 'auto', // 价格列：自适应
        qtyPriceSpacing: 2, // 数量与价格间距：2mm
        totalWidth: 79, // 总宽度：79mm
      },

      // 费用明细布局配置（毫米）
      fixedFeeLayout: {
        labelColumn: 54, // 费用标签列：54mm
        amountColumn: 25, // 金额列：25mm
        totalWidth: 79, // 总宽度：79mm
      },

      // 字体大小配置
      fontSize: {
        base: 10, // 基础字体10pt
        title: 14, // 标题字体14pt
        item: 11, // 菜品字体11pt
        normal: 10, // 普通字体10pt
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

    // 🏪 新增：餐厅信息缓存
    this.restaurantInfo = null;

    console.log(
      '[LODOP] C-Lodop 打印机管理器初始化（支持百分比排版、分菜打印、多语言和餐厅信息）'
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

  // 🔧 新增：根据固定宽度计算布局参数
  calculateLayoutParams(paperWidth) {
    const config = this.layoutConfig;

    // 使用固定边距
    const leftMarginMm = config.margins.left;
    const rightMarginMm = config.margins.right;
    const topMarginMm = config.margins.top;
    const bottomMarginMm = config.margins.bottom;

    // 计算可用宽度
    const availableWidthMm = paperWidth - leftMarginMm - rightMarginMm;

    // 使用固定表格列宽（毫米）
    const tableLayout = config.fixedTableLayout;
    const nameWidthMm = tableLayout.nameColumn;
    const qtyWidthMm = tableLayout.qtyColumn;
    const qtyPriceSpacingMm = tableLayout.qtyPriceSpacing;

    // 计算自适应价格列宽
    const usedWidth = nameWidthMm + qtyWidthMm + qtyPriceSpacingMm;
    const priceWidthMm = tableLayout.totalWidth - usedWidth;
    const tableWidthMm = tableLayout.totalWidth;

    // 使用固定费用列宽（毫米）
    const feeLayout = config.fixedFeeLayout;
    const feeLabelWidthMm = feeLayout.labelColumn;
    const feeAmountWidthMm = feeLayout.amountColumn;
    const feeWidthMm = feeLayout.totalWidth;

    // 使用固定字体大小
    const fonts = config.fontSize;

    // 🔧 计算总字符宽度（基于纸张宽度）
    // 80mm打印机大约可容纳38个字符，58mm大约28个字符
    const totalCharWidth = Math.floor(paperWidth * 0.475); // 约0.475个字符/mm

    console.log('[LODOP] 🔧 固定宽度布局计算:', {
      纸张宽度: `${paperWidth}mm`,
      边距: `左${leftMarginMm}mm, 右${rightMarginMm}mm`,
      可用宽度: `${availableWidthMm}mm`,
      表格列宽: `菜名${nameWidthMm}mm + 数量${qtyWidthMm}mm + 间距${qtyPriceSpacingMm}mm + 价格${priceWidthMm}mm = ${tableWidthMm}mm`,
      费用列宽: `标签${feeLabelWidthMm}mm + 金额${feeAmountWidthMm}mm = ${feeWidthMm}mm`,
      字体大小: `基础${fonts.base}pt, 标题${fonts.title}pt, 菜品${fonts.item}pt, 普通${fonts.normal}pt`,
      总字符宽度: `${totalCharWidth}字符`,
    });

    return {
      // 边距信息
      margins: config.margins,

      // 宽度信息
      paperWidth: paperWidth,
      availableWidth: availableWidthMm,
      textAreaWidth: Math.max(tableWidthMm, feeWidthMm), // 使用表格或费用区域的最大宽度
      totalCharWidth: totalCharWidth, // 🔧 新增：总字符宽度

      // 表格布局（毫米）
      table: {
        nameWidth: nameWidthMm,
        qtyWidth: qtyWidthMm,
        priceWidth: priceWidthMm,
        qtyPriceSpacing: qtyPriceSpacingMm,
        totalWidth: tableWidthMm,
      },

      // 费用布局（毫米）
      fee: {
        labelWidth: feeLabelWidthMm,
        amountWidth: feeAmountWidthMm,
        totalWidth: feeWidthMm,
      },

      // 字体信息
      fonts: fonts,

      // 调试信息
      debug: {
        layoutType: 'fixed-width',
        textAreaUtilization: `${(
          (Math.max(tableWidthMm, feeWidthMm) / paperWidth) *
          100
        ).toFixed(1)}%`,
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

  async printOrder(order) {
    console.log(`[LODOP] 🍽️ 开始分菜打印订单: ${order.order_id}`);
    console.log(JSON.stringify(order));

    // 🏪 获取餐厅信息（如果还没有获取或者rd_id不同）
    const rdId = order.rd_id;
    if (rdId && (!this.restaurantInfo || this.restaurantInfo.rd_id !== rdId)) {
      console.log(`[LODOP] �� 需要获取餐厅信息: rd_id=${rdId}`);
      await this.fetchRestaurantInfo(rdId);
    }

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
      const paperWidth = (printer ? printer.width : 80) + 8;

      // 🔧 使用新的固定宽度布局系统
      const layout = this.calculateLayoutParams(paperWidth);

      console.log(`[LODOP] 🎯 ${printerName} 使用固定宽度布局参数:`, {
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

      console.log(`[LODOP] 🎯 固定宽度布局打印设置:`, {
        起始Y位置: `${yPosMm}mm`,
        左边距: `${layout.margins.left}mm`,
        文本宽度: `${layout.textAreaWidth}mm`,
        行高: `${lineHeightMm}mm`,
      });

      // 逐行添加打印内容
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim()) {
          // 🔧 检查是否为费用行，如果是，则分别处理标签和金额
          if (this.isFeeLineForSeparateProcessing(line)) {
            const { label, amount } = this.parseFeeLineComponents(line);

            // 添加费用标签（左对齐）
            this.LODOP.ADD_PRINT_TEXT(
              `${yPosMm}mm`,
              `${layout.margins.left}mm`,
              `${layout.textAreaWidth * 0.7}mm`, // 标签占70%宽度
              `${lineHeightMm}mm`,
              label
            );

            // 设置标签样式
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
            this.LODOP.SET_PRINT_STYLEA(
              i,
              'Bold',
              line.includes('TOTAL') ? 1 : 0
            );
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐

            // 添加费用金额（右对齐）
            this.LODOP.ADD_PRINT_TEXT(
              `${yPosMm}mm`,
              `${layout.margins.left + layout.textAreaWidth * 0.7}mm`, // 从70%位置开始
              `${layout.textAreaWidth * 0.3}mm`, // 金额占30%宽度
              `${lineHeightMm}mm`,
              amount
            );

            // 设置金额样式
            this.LODOP.SET_PRINT_STYLEA(i + 1000, 'FontSize', 10); // 使用不同的索引避免冲突
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
            this.LODOP.SET_PRINT_STYLEA(
              i + 1000,
              'Bold',
              line.includes('TOTAL') ? 1 : 0
            );
            this.LODOP.SET_PRINT_STYLEA(i + 1000, 'Alignment', 3); // 右对齐
          } else if (this.isDishLineForSeparateProcessing(line)) {
            // 🔧 检查是否为菜品行，如果是，则分别处理菜名、数量和价格
            const { dishName, quantity, price } =
              this.parseDishLineComponents(line);

            // 添加菜名部分（左对齐，占70%宽度）
            this.LODOP.ADD_PRINT_TEXT(
              `${yPosMm}mm`,
              `${layout.margins.left}mm`,
              `${layout.textAreaWidth * 0.75}mm`, // 菜名占70%宽度
              `${lineHeightMm}mm`,
              dishName
            );

            // 设置菜名样式
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐

            // 添加数量和价格部分（右对齐，占30%宽度）
            const qtyPriceText = quantity ? `x${quantity}  ${price}` : price;
            this.LODOP.ADD_PRINT_TEXT(
              `${yPosMm}mm`,
              `${layout.margins.left + layout.textAreaWidth * 0.6}mm`, // 从70%位置开始
              `${layout.textAreaWidth * 0.3}mm`, // 数量价格占30%宽度
              `${lineHeightMm}mm`,
              qtyPriceText
            );

            // 设置数量价格样式
            this.LODOP.SET_PRINT_STYLEA(i + 2000, 'FontSize', 10); // 使用不同的索引避免冲突
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
            this.LODOP.SET_PRINT_STYLEA(i + 2000, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i + 2000, 'Alignment', 3); // 右对齐
          } else {
            // 🔧 普通行处理
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
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
              this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
            } else if (line.includes('TOTAL')) {
              // 总计 - 菜品字体，加粗
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
              this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
            } else if (
              line.includes('Subtotal') ||
              line.includes('Tax') ||
              line.includes('Fee') ||
              line.includes('Service') ||
              line.includes('Tip') ||
              line.includes('Discount')
            ) {
              // 费用项 - 普通字体
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
              this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
            } else if (line.startsWith('---') || line.startsWith('===')) {
              // 分隔线 - 普通字体
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
              this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
            } else if (
              this.isItemLine(line) ||
              line.includes('Item') ||
              line.includes('Qty') ||
              line.includes('Price')
            ) {
              // 菜品行和表头 - 菜品字体
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(
                i,
                'Bold',
                line.includes('Item') ? 1 : 0
              ); // 表头加粗
              this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
            } else if (this.isRestaurantHeaderLine(line)) {
              // 🏪 餐厅头部信息 - 特殊格式
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
              this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
            } else {
              // 其他文本 - 普通字体
              this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
              this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
              this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
              this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
            }

            this.LODOP.SET_PRINT_STYLE('FontSize', 10);
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
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

  // 🔧 新增：判断是否为需要分别处理的费用行
  isFeeLineForSeparateProcessing(line) {
    return (
      (line.includes('Subtotal') ||
        line.includes('Tax') ||
        line.includes('Fee') ||
        line.includes('Service') ||
        line.includes('Tip') ||
        line.includes('Discount') ||
        line.includes('TOTAL')) &&
      line.includes('$')
    );
  }

  // 🔧 新增：解析费用行的标签和金额组件
  parseFeeLineComponents(line) {
    // 找到最后一个$符号的位置
    const lastDollarIndex = line.lastIndexOf('$');

    if (lastDollarIndex === -1) {
      // 没有找到$符号，返回整行作为标签
      return { label: line.trim(), amount: '' };
    }

    // 从$符号开始向后找到金额的结束位置
    let amountEnd = lastDollarIndex + 1;
    while (
      amountEnd < line.length &&
      (line[amountEnd].match(/[0-9.,]/) || line[amountEnd] === ' ')
    ) {
      amountEnd++;
    }

    // 检查$符号前面是否有负号
    let amountStart = lastDollarIndex;
    if (lastDollarIndex > 0 && line[lastDollarIndex - 1] === '-') {
      amountStart = lastDollarIndex - 1;
    }

    const label = line.substring(0, amountStart).trim();
    const amount = line.substring(amountStart, amountEnd).trim();

    return { label, amount };
  }

  // 🔧 新增：判断是否为需要分别处理的菜品行
  isDishLineForSeparateProcessing(line) {
    return (
      this.isItemLine(line) &&
      line.includes('$') &&
      !line.includes('Subtotal') &&
      !line.includes('Tax') &&
      !line.includes('Fee') &&
      !line.includes('Service') &&
      !line.includes('Tip') &&
      !line.includes('Discount') &&
      !line.includes('TOTAL')
    );
  }

  // 🔧 新增：解析菜品行的组件（菜名、数量、价格）
  parseDishLineComponents(line) {
    // 找到最后一个$符号的位置
    const lastDollarIndex = line.lastIndexOf('$');

    if (lastDollarIndex === -1) {
      // 没有找到$符号，返回整行作为菜名
      return { dishName: line.trim(), quantity: '', price: '' };
    }

    // 从$符号开始向后找到价格的结束位置
    let priceEnd = lastDollarIndex + 1;
    while (
      priceEnd < line.length &&
      (line[priceEnd].match(/[0-9.,]/) || line[priceEnd] === ' ')
    ) {
      priceEnd++;
    }

    // 提取价格部分
    const price = line.substring(lastDollarIndex, priceEnd).trim();

    // 在价格之前找数量，通常是1-3位数字
    let qtyEnd = lastDollarIndex;
    let qtyStart = qtyEnd;

    // 向前跳过空格
    while (qtyStart > 0 && line[qtyStart - 1] === ' ') {
      qtyStart--;
    }

    // 向前找数字
    while (qtyStart > 0 && line[qtyStart - 1].match(/[0-9]/)) {
      qtyStart--;
    }

    const quantity = line.substring(qtyStart, qtyEnd).trim();

    // 菜名部分是剩余的内容
    const dishName = line.substring(0, qtyStart).trim();

    return { dishName, quantity, price };
  }

  generateOrderPrintContent(order) {
    console.log('[LODOP] 生成热敏小票打印内容（固定宽度布局）...');

    // 获取打印机宽度设置
    const printer = this.printers.find((p) =>
      this.selectedPrinters.includes(p.name)
    );
    const paperWidth = printer ? printer.width : 80;

    // 🔧 使用新的固定宽度布局系统
    const layout = this.calculateLayoutParams(paperWidth);

    console.log('[LODOP] 🎯 固定宽度布局计算结果:', {
      纸张宽度: `${layout.paperWidth}mm`,
      布局类型: layout.debug.layoutType,
      表格列宽: `菜名${layout.table.nameWidth}mm + 数量${layout.table.qtyWidth}mm + 价格${layout.table.priceWidth}mm = ${layout.table.totalWidth}mm`,
      费用列宽: `标签${layout.fee.labelWidth}mm + 金额${layout.fee.amountWidth}mm = ${layout.fee.totalWidth}mm`,
      字体大小: `基础${layout.fonts.base}pt, 标题${layout.fonts.title}pt, 菜品${layout.fonts.item}pt`,
      边距: `左${layout.margins.left}mm, 右${layout.margins.right}mm`,
    });

    let content = '';
    content += `#${order.order_id}\n`;
    content += '\n';
    // ============= 🏪 餐厅信息头部：居中显示 =============
    const restaurantHeader = this.generateRestaurantHeader(layout);
    content += restaurantHeader;

    // ============= 订单号区域：靠左对齐 =============

    // ============= 订单信息：靠左对齐 =============
    content += `Order Date: ${this.formatDateTime(order.create_time)}\n`;
    content += `Pickup Time: ${this.formatDateTime(order.delivery_time)}\n`;

    const paystyle = order.paystyle == 1 ? 'Card' : 'Cash';
    content += `Payment: ${paystyle}\n`;
    content += `Customer: ${order.recipient_name || 'N/A'}\n`;
    content += `Phone: ${order.recipient_phone || 'N/A'}\n`;

    // 取餐方式
    const deliveryType = order.delivery_type == 1 ? 'Delivery' : 'Pickup';
    content += `Type: ${deliveryType}\n`;

    // 如果是外送，显示地址
    if (order.delivery_type == 1 && order.recipient_address) {
      content += `Address: ${order.recipient_address}\n`;
    }

    content += '\n';
    content += '='.repeat(Math.floor(layout.textAreaWidth / 2)) + '\n';

    // ============= 菜单明细：固定宽度布局 =============
    console.log('[LODOP] 🎯 使用固定宽度表格布局');

    // 表头
    const nameColWidth = 26; // 菜名列字符宽度（调整为26字符）
    const qtyColWidth = 2; // 数量列字符宽度（调整为2字符）
    const spacingWidth = 2; // 间距字符宽度（2mm对应约2字符）
    const priceColWidth = 8; // 价格列字符宽度（调整为8字符）

    // content +=
    //   'Item'.padEnd(nameColWidth) +
    //   'Qty'.padStart(qtyColWidth) +
    //   ' '.repeat(spacingWidth) +
    //   'Price'.padStart(priceColWidth) +
    //   '\n';
    // content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    // ============= 菜品明细：固定宽度显示 =============
    const dishes = order.dishes_array || [];
    dishes.forEach((dish) => {
      const price = parseFloat(dish.price || '0');
      const qty = parseInt(dish.amount || '1');
      const qtyStr = qty.toString();
      const priceStr = `$${price.toFixed(2)}`;

      // 菜名处理：支持双语和单词换行
      const dishNameResult = this.getFormattedDishName(dish);
      let dishNameLines = [];

      if (dishNameResult && dishNameResult.isMultiLine) {
        // 双语模式：分别处理英文和中文
        dishNameResult.lines.forEach((name) => {
          if (name && name.trim()) {
            const wrappedLines = this.wrapTextByWords(
              name.trim(),
              nameColWidth
            );
            dishNameLines.push(...wrappedLines);
          }
        });
      } else {
        // 单语模式：按单词换行
        const dishName = dishNameResult || '';
        if (dishName.trim()) {
          const wrappedLines = this.wrapTextByWords(
            dishName.trim(),
            nameColWidth
          );
          dishNameLines.push(...wrappedLines);
        }
      }

      // 确保至少有一行（防止空菜名）
      if (dishNameLines.length === 0) {
        dishNameLines.push('Unknown Item'.padEnd(nameColWidth));
      }

      // 规格处理
      const formattedSpecs = this.getFormattedSpecs(dish);

      // 显示菜名行（固定列宽）
      dishNameLines.forEach((dishNameLine, index) => {
        const isFirstLine = index === 0;

        // 菜名列：固定宽度，已经在wrapTextByWords中padEnd了
        content += dishNameLine;

        // 只在第一行显示数量和价格
        if (isFirstLine) {
          content += qtyStr.padStart(qtyColWidth);
          content += ' '.repeat(spacingWidth);
          content += priceStr.padStart(priceColWidth);
        } else {
          // 非第一行：用空格填充数量和价格列
          content += ' '.repeat(qtyColWidth + spacingWidth + priceColWidth);
        }
        content += '\n';
      });

      // 规格信息：每个规格独占行，固定缩进
      if (formattedSpecs && formattedSpecs.length > 0) {
        formattedSpecs.forEach((spec) => {
          if (spec && spec.trim()) {
            // 规格行：缩进2个字符，然后固定宽度
            const specLines = this.wrapTextByWords(
              spec.trim(),
              nameColWidth - 2
            );
            specLines.forEach((specLine) => {
              content += `  ${specLine}`;
              // 补齐到完整行宽度
              content += ' '.repeat(qtyColWidth + spacingWidth + priceColWidth);
              content += '\n';
            });
          }
        });
      }

      content += '\n'; // 每个菜品后空一行
    });

    content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    // ============= 费用明细：固定宽度布局 =============
    const subtotal = parseFloat(order.sub_total || '0');
    const discount = parseFloat(order.discount_total || '0');
    const taxFee = parseFloat(order.tax_fee || '0');
    const taxRate = parseFloat(order.tax_rate || '0');
    const deliveryFee = parseFloat(order.delivery_fee || '0');
    const serviceFee = parseFloat(order.convenience_fee || '0');
    const serviceRate = parseFloat(order.convenience_rate || '0');
    const tip = parseFloat(order.tip_fee || '0');
    const total = parseFloat(order.total || '0');

    // 🔧 费用行：使用华文行楷字体宽度计算，实现右对齐
    const feeRowWidth = Math.min(layout.totalCharWidth, 38); // 费用行总宽度
    const amountWidth = 12; // 金额列宽度（为$符号和数字预留足够空间）
    const labelWidth = feeRowWidth - amountWidth; // 标签列宽度

    // Subtotal
    const subtotalLabel = 'Subtotal';
    const subtotalAmount = `$${subtotal.toFixed(2)}`;
    content +=
      this.padText(subtotalLabel, labelWidth, 'left') +
      this.padText(subtotalAmount, amountWidth, 'right') +
      '\n';

    // Discount
    if (discount > 0) {
      const discountLabel = 'Discount';
      const discountAmount = `-$${discount.toFixed(2)}`;
      content +=
        this.padText(discountLabel, labelWidth, 'left') +
        this.padText(discountAmount, amountWidth, 'right') +
        '\n';
    }

    // Tax
    if (taxFee > 0) {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate.toFixed(1)}%)` : 'Tax';
      const taxAmount = `$${taxFee.toFixed(2)}`;
      content +=
        this.padText(taxLabel, labelWidth, 'left') +
        this.padText(taxAmount, amountWidth, 'right') +
        '\n';
    }

    // Delivery Fee
    if (deliveryFee > 0) {
      const deliveryLabel = 'Delivery Fee';
      const deliveryAmount = `$${deliveryFee.toFixed(2)}`;
      content +=
        this.padText(deliveryLabel, labelWidth, 'left') +
        this.padText(deliveryAmount, amountWidth, 'right') +
        '\n';
    }

    // Service Fee
    if (serviceFee > 0) {
      const serviceLabel =
        serviceRate > 0
          ? `Service (${serviceRate.toFixed(2)}%)`
          : 'Service Fee';
      const serviceAmount = `$${serviceFee.toFixed(2)}`;
      content +=
        this.padText(serviceLabel, labelWidth, 'left') +
        this.padText(serviceAmount, amountWidth, 'right') +
        '\n';
    }

    // Tip
    if (tip > 0) {
      const tipLabel = 'Tip';
      const tipAmount = `$${tip.toFixed(2)}`;
      content +=
        this.padText(tipLabel, labelWidth, 'left') +
        this.padText(tipAmount, amountWidth, 'right') +
        '\n';
    }

    // Total
    const totalLabel = 'TOTAL';
    const totalDisplayAmount = `$${total.toFixed(2)}`;
    content +=
      this.padText(totalLabel, labelWidth, 'left') +
      this.padText(totalDisplayAmount, amountWidth, 'right') +
      '\n';

    // ============= 备注 =============
    if (order.order_notes && order.order_notes.trim()) {
      content += '\n';
      content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';
      content += 'Notes:\n';
      content += `${order.order_notes}\n`;
    }

    // 结尾
    content += '\n';
    content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    console.log('[LODOP] 🎯 固定宽度布局小票内容生成完成');
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

  // 🔧 新增：按单词换行，避免截断单词
  wrapTextByWords(text, width) {
    if (!text || width <= 0) return [];

    const words = text.split(/\s+/); // 按空格分割单词
    const lines = [];
    let currentLine = '';
    let currentWidth = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordWidth = this.displayWidth(word);
      const spaceWidth = currentLine ? 1 : 0; // 如果不是行首，需要加空格

      // 检查当前单词是否能放入当前行
      if (currentLine && currentWidth + spaceWidth + wordWidth > width) {
        // 当前行放不下，开始新行
        lines.push(currentLine.padEnd(width));
        currentLine = word;
        currentWidth = wordWidth;
      } else if (!currentLine && wordWidth > width) {
        // 单个单词太长，强制截断（这种情况很少见）
        let remainingWord = word;
        while (remainingWord.length > 0) {
          let truncated = '';
          let truncatedWidth = 0;

          for (const char of remainingWord) {
            const charWidth = char.charCodeAt(0) > 127 ? 2 : 1;
            if (truncatedWidth + charWidth > width) break;
            truncated += char;
            truncatedWidth += charWidth;
          }

          if (truncated) {
            lines.push(truncated.padEnd(width));
            remainingWord = remainingWord.substring(truncated.length);
          } else {
            // 防止无限循环
            break;
          }
        }
        currentLine = '';
        currentWidth = 0;
      } else {
        // 单词可以放入当前行
        if (currentLine) {
          currentLine += ' ' + word;
          currentWidth += spaceWidth + wordWidth;
        } else {
          currentLine = word;
          currentWidth = wordWidth;
        }
      }
    }

    // 添加最后一行
    if (currentLine) {
      lines.push(currentLine.padEnd(width));
    }

    return lines;
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
          // 🔧 统一字体设置：所有文本都使用字号10和华文行楷字体
          this.LODOP.SET_PRINT_STYLEA(index, 'FontSize', 10);
          this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
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

      // 🔧 使用新的固定宽度布局系统
      const layout = this.calculateLayoutParams(paperWidth);

      console.log(`[LODOP] 🎯 预览使用固定宽度布局参数:`, {
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
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (line.includes('TOTAL')) {
            // 总计 - 菜品字体，加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 1);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1); // 左对齐
          } else if (
            line.includes('Subtotal') ||
            line.includes('Tax') ||
            line.includes('Fee') ||
            line.includes('Service') ||
            line.includes('Tip') ||
            line.includes('Discount')
          ) {
            // 费用项 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (line.startsWith('---') || line.startsWith('===')) {
            // 分隔线 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (
            this.isItemLine(line) ||
            line.includes('Item') ||
            line.includes('Qty') ||
            line.includes('Price')
          ) {
            // 菜品行和表头 - 菜品字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(
              i,
              'Bold',
              line.includes('Item') ? 1 : 0
            ); // 表头加粗
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
          } else if (this.isRestaurantHeaderLine(line)) {
            // 🏪 餐厅头部信息 - 特殊格式
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
          } else {
            // 其他文本 - 普通字体
            this.LODOP.SET_PRINT_STYLEA(i, 'FontSize', 10);
            this.LODOP.SET_PRINT_STYLEA(i, 'Bold', 0);
            this.LODOP.SET_PRINT_STYLEA(i, 'Alignment', 1);
            this.LODOP.SET_PRINT_STYLE('FontName', '华文行楷');
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

    // 🔧 使用新的固定宽度布局系统
    const layout = this.calculateLayoutParams(paperWidth);

    let content = '';

    // ============= 🏪 餐厅信息头部：居中显示 =============
    const restaurantHeader = this.generateRestaurantHeader(layout);
    content += restaurantHeader;

    // ============= 订单号区域：靠左对齐 =============
    content += `#${order.order_id}\n`;
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
    content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    // ============= 菜单明细：固定宽度布局 =============
    console.log('[LODOP] 🍽️ 使用固定宽度表格布局 (部分菜品)');

    // 表头
    const nameColWidth = 26; // 菜名列字符宽度（调整为26字符）
    const qtyColWidth = 2; // 数量列字符宽度（调整为2字符）
    const spacingWidth = 2; // 间距字符宽度（2mm对应约2字符）
    const priceColWidth = 8; // 价格列字符宽度（调整为8字符）

    // content +=
    //   'Item'.padEnd(nameColWidth) +
    //   'Qty'.padStart(qtyColWidth) +
    //   ' '.repeat(spacingWidth) +
    //   'Price'.padStart(priceColWidth) +
    //   '\n';
    // content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    // ============= 菜品明细：只显示指定 printer_type 的菜品 =============
    let totalAmount = 0;
    group.dishes.forEach((dish) => {
      const price = parseFloat(dish.price || '0');
      const qty = parseInt(dish.amount || '1');
      const qtyStr = qty.toString();
      const priceStr = `$${price.toFixed(2)}`;

      totalAmount += price;

      // 菜名处理：支持双语和单词换行
      const dishNameResult = this.getFormattedDishName(dish);
      let dishNameLines = [];

      if (dishNameResult && dishNameResult.isMultiLine) {
        // 双语模式：分别处理英文和中文
        dishNameResult.lines.forEach((name) => {
          if (name && name.trim()) {
            const wrappedLines = this.wrapTextByWords(
              name.trim(),
              nameColWidth
            );
            dishNameLines.push(...wrappedLines);
          }
        });
      } else {
        // 单语模式：按单词换行
        const dishName = dishNameResult || '';
        if (dishName.trim()) {
          const wrappedLines = this.wrapTextByWords(
            dishName.trim(),
            nameColWidth
          );
          dishNameLines.push(...wrappedLines);
        }
      }

      // 确保至少有一行（防止空菜名）
      if (dishNameLines.length === 0) {
        dishNameLines.push('Unknown Item'.padEnd(nameColWidth));
      }

      // 规格处理
      const formattedSpecs = this.getFormattedSpecs(dish);

      // 显示菜名行（固定列宽）
      dishNameLines.forEach((dishNameLine, index) => {
        const isFirstLine = index === 0;

        // 菜名列：固定宽度，已经在wrapTextByWords中padEnd了
        content += dishNameLine;

        // 只在第一行显示数量和价格
        if (isFirstLine) {
          content += qtyStr.padStart(qtyColWidth);
          content += ' '.repeat(spacingWidth);
          content += priceStr.padStart(priceColWidth);
        } else {
          // 非第一行：用空格填充数量和价格列
          content += ' '.repeat(qtyColWidth + spacingWidth + priceColWidth);
        }
        content += '\n';
      });

      // 规格信息：每个规格独占行，固定缩进
      if (formattedSpecs && formattedSpecs.length > 0) {
        formattedSpecs.forEach((spec) => {
          if (spec && spec.trim()) {
            // 规格行：缩进2个字符，然后固定宽度
            const specLines = this.wrapTextByWords(
              spec.trim(),
              nameColWidth - 2
            );
            specLines.forEach((specLine) => {
              content += `  ${specLine}`;
              // 补齐到完整行宽度
              content += ' '.repeat(qtyColWidth + spacingWidth + priceColWidth);
              content += '\n';
            });
          }
        });
      }

      content += '\n'; // 每个菜品后空一行
    });

    content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    // ============= 费用明细：固定宽度布局 =============
    const subtotal = parseFloat(order.sub_total || '0');
    const discount = parseFloat(order.discount_total || '0');
    const taxFee = parseFloat(order.tax_fee || '0');
    const taxRate = parseFloat(order.tax_rate || '0');
    const deliveryFee = parseFloat(order.delivery_fee || '0');
    const serviceFee = parseFloat(order.convenience_fee || '0');
    const serviceRate = parseFloat(order.convenience_rate || '0');
    const tip = parseFloat(order.tip_fee || '0');
    const total = parseFloat(order.total || '0');

    // 🔧 费用行：使用华文行楷字体宽度计算，实现右对齐
    const feeRowWidth = Math.min(layout.totalCharWidth, 38); // 费用行总宽度
    const amountWidth = 12; // 金额列宽度（为$符号和数字预留足够空间）
    const labelWidth = feeRowWidth - amountWidth; // 标签列宽度

    // Subtotal
    const subtotalLabel = 'Subtotal';
    const subtotalAmount = `$${subtotal.toFixed(2)}`;
    content +=
      this.padText(subtotalLabel, labelWidth, 'left') +
      this.padText(subtotalAmount, amountWidth, 'right') +
      '\n';

    // Discount
    if (discount > 0) {
      const discountLabel = 'Discount';
      const discountAmount = `-$${discount.toFixed(2)}`;
      content +=
        this.padText(discountLabel, labelWidth, 'left') +
        this.padText(discountAmount, amountWidth, 'right') +
        '\n';
    }

    // Tax
    if (taxFee > 0) {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate.toFixed(1)}%)` : 'Tax';
      const taxAmount = `$${taxFee.toFixed(2)}`;
      content +=
        this.padText(taxLabel, labelWidth, 'left') +
        this.padText(taxAmount, amountWidth, 'right') +
        '\n';
    }

    // Delivery Fee
    if (deliveryFee > 0) {
      const deliveryLabel = 'Delivery Fee';
      const deliveryAmount = `$${deliveryFee.toFixed(2)}`;
      content +=
        this.padText(deliveryLabel, labelWidth, 'left') +
        this.padText(deliveryAmount, amountWidth, 'right') +
        '\n';
    }

    // Service Fee
    if (serviceFee > 0) {
      const serviceLabel =
        serviceRate > 0
          ? `Service (${serviceRate.toFixed(2)}%)`
          : 'Service Fee';
      const serviceAmount = `$${serviceFee.toFixed(2)}`;
      content +=
        this.padText(serviceLabel, labelWidth, 'left') +
        this.padText(serviceAmount, amountWidth, 'right') +
        '\n';
    }

    // Tip
    if (tip > 0) {
      const tipLabel = 'Tip';
      const tipAmount = `$${tip.toFixed(2)}`;
      content +=
        this.padText(tipLabel, labelWidth, 'left') +
        this.padText(tipAmount, amountWidth, 'right') +
        '\n';
    }

    // Total
    const totalLabel = 'TOTAL';
    const totalDisplayAmount = `$${total.toFixed(2)}`;
    content +=
      this.padText(totalLabel, labelWidth, 'left') +
      this.padText(totalDisplayAmount, amountWidth, 'right') +
      '\n';

    // ============= 备注 =============
    if (order.order_notes && order.order_notes.trim()) {
      content += '\n';
      content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';
      content += 'Notes:\n';
      content += `${order.order_notes}\n`;
    }

    // 结尾
    content += '\n';
    content += '='.repeat(Math.min(layout.totalCharWidth, 38)) + '\n';

    console.log('[LODOP] ��️ 部分订单内容生成完成');
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
      // 双语模式：中英文各自单独占行，不使用+号
      const englishName = dish.name_en || dish.dishes_name || '';
      const chineseName = dish.name_ch || '';

      if (englishName && chineseName) {
        // 返回对象，包含多行信息
        return {
          isMultiLine: true,
          lines: [englishName, chineseName],
        };
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

  // 🔧 新增：处理菜品规格信息 - 返回规格数组，每个规格独占行
  getFormattedSpecs(dish) {
    const specs = [];

    // 处理备注信息
    if (dish.remark && dish.remark.trim()) {
      specs.push(`备注: ${dish.remark.trim()}`);
    }

    // 处理dishes_specs_id中的规格信息
    if (dish.dishes_specs_id && Array.isArray(dish.dishes_specs_id)) {
      dish.dishes_specs_id.forEach((specGroup) => {
        if (specGroup.value_info && Array.isArray(specGroup.value_info)) {
          specGroup.value_info.forEach((valueItem) => {
            const specName = valueItem.name || '';
            const specCount = valueItem.count || 1;
            const specMoney = parseFloat(valueItem.money || 0);

            if (specName) {
              let specText = `${specName}`;
              if (specCount > 1) {
                specText += ` x${specCount}`;
              }
              if (specMoney > 0) {
                specText += ` (+$${specMoney.toFixed(2)})`;
              }
              specs.push(specText); // 每个规格作为独立元素
            }
          });
        }
      });
    }

    // 处理菜品描述
    // if (dish.dishes_describe && dish.dishes_describe.trim()) {
    //   specs.push(`描述: ${dish.dishes_describe.trim()}`);
    // }

    return specs; // 返回数组而不是连接的字符串
  }

  // 🍽️ 新增：判断是否为餐厅头部信息行
  isRestaurantHeaderLine(line) {
    if (!this.restaurantInfo || !line.trim()) {
      return false;
    }

    const trimmedLine = line.trim();
    const { name, address, telephone, city, state, zipcode } =
      this.restaurantInfo;

    // 检查是否是餐厅名称
    if (name && trimmedLine.includes(name)) {
      return true;
    }

    // 检查是否是地址相关
    if (address && trimmedLine.includes(address)) {
      return true;
    }

    // 检查是否是城市、州、邮编
    if (
      (city && trimmedLine.includes(city)) ||
      (state && trimmedLine.includes(state)) ||
      (zipcode && trimmedLine.includes(zipcode))
    ) {
      return true;
    }

    // 检查是否是电话号码
    if (telephone && trimmedLine.includes(telephone)) {
      return true;
    }

    return false;
  }

  // 🏪 新增：获取餐厅信息
  async fetchRestaurantInfo(rdId) {
    try {
      console.log(`[LODOP] 🏪 获取餐厅信息: rd_id=${rdId}`);

      const response = await fetch(
        `https://api.menuorg.com/app/v1/restaurant/get_by_id?id=${rdId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status_code === 200 && data.data) {
        this.restaurantInfo = {
          rd_id: rdId, // 添加rd_id用于缓存管理
          name: data.data.name || '',
          address: data.data.address_street || '',
          telephone: this.formatPhoneNumber(data.data.telephone || ''),
          city: data.data.address_county || '',
          state: data.data.address_state || '',
          zipcode: data.data.zipcode || '',
        };

        console.log('[LODOP] 🏪 餐厅信息获取成功:', this.restaurantInfo);
        return this.restaurantInfo;
      } else {
        throw new Error(data.message || '获取餐厅信息失败');
      }
    } catch (error) {
      console.error('[LODOP] 🏪 获取餐厅信息失败:', error);
      this.restaurantInfo = null;
      return null;
    }
  }

  // 🏪 新增：格式化电话号码 (xxx) xxx-xxxx
  formatPhoneNumber(phone) {
    if (!phone) return '';

    // 移除所有非数字字符
    const digits = phone.replace(/\D/g, '');

    // 如果是10位数字，格式化为 (xxx) xxx-xxxx
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    // 如果不是10位，返回原始号码
    return phone;
  }

  // 🏪 新增：获取缓存的餐厅信息
  getRestaurantInfo() {
    return this.restaurantInfo;
  }

  // 🏪 新增：生成餐厅头部信息（居中显示）
  generateRestaurantHeader(layout) {
    if (!this.restaurantInfo) {
      return ''; // 如果没有餐厅信息，返回空字符串
    }

    let header = '';
    const { name, address, telephone, city, state, zipcode } =
      this.restaurantInfo;

    // 餐厅名称（居中，加粗）
    if (name) {
      const centeredName = this.padText(name, layout.totalCharWidth, 'left');
      header += `${centeredName}\n`;
    }

    // 餐厅地址（居中）
    if (address) {
      let fullAddress = address;
      if (city || state || zipcode) {
        const cityStateZip = [city, state, zipcode].filter(Boolean).join(', ');
        fullAddress += `, ${cityStateZip}`;
      }

      // 如果地址太长，需要换行
      if (this.displayWidth(fullAddress) <= layout.totalCharWidth) {
        const centeredAddress = this.padText(
          fullAddress,
          layout.totalCharWidth,
          'left'
        );
        header += `${centeredAddress}\n`;
      } else {
        // 地址太长，分行显示
        const centeredStreet = this.padText(
          address,
          layout.totalCharWidth,
          'left'
        );
        header += `${centeredStreet}\n`;
        if (city || state || zipcode) {
          const cityStateZip = [city, state, zipcode]
            .filter(Boolean)
            .join(', ');
          const centeredCityState = this.padText(
            cityStateZip,
            layout.totalCharWidth,
            'left'
          );
          header += `${centeredCityState}\n`;
        }
      }
    }

    // 餐厅电话（居中）
    if (telephone) {
      const centeredPhone = this.padText(telephone, layout.totalCharWidth);
      header += `${centeredPhone}\n`;
    }

    // 添加分隔线
    if (header) {
      header += '\n';
      header += '-'.repeat(layout.totalCharWidth) + '\n';
      header += '\n';
    }

    console.log('[LODOP] 🏪 餐厅头部信息生成完成');
    return header;
  }

  // 🏪 新增：文本居中对齐
  centerText(text, width) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) {
      return this.truncateText(text, width);
    }

    const padding = width - textWidth;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;

    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }

  // 🏪 新增：设置餐厅ID并获取餐厅信息
  async setRestaurantId(rdId) {
    console.log(`[LODOP] 🏪 设置餐厅ID: ${rdId}`);
    return await this.fetchRestaurantInfo(rdId);
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
