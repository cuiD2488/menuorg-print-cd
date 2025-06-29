const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

class PrinterUtils {
  static async getPrinters() {
    try {
      // Windows 获取打印机列表
      const { stdout } = await execAsync(
        'wmic printer get name,status /format:csv'
      );
      const lines = stdout
        .split('\n')
        .filter((line) => line.trim() && !line.includes('Node'));

      const printers = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2 && parts[1] && parts[1].trim()) {
          const name = parts[1].trim();
          const { width, isThermal } = this.classifyPrinter(name);

          printers.push({
            name: name,
            status: parts[2]?.trim() || 'Ready',
            width: width,
            isThermal: isThermal,
            isEnabled: false,
            fontSize: 0, // 0=小, 1=中, 2=大
          });
        }
      }

      return printers.filter((p) => p.name);
    } catch (error) {
      console.error('获取打印机列表失败:', error);
      // 返回默认打印机列表作为备选
      return [
        {
          name: '默认打印机',
          status: 'Ready',
          width: 80,
          isThermal: true,
          isEnabled: false,
          fontSize: 0,
        },
        {
          name: 'Microsoft Print to PDF',
          status: 'Ready',
          width: 80,
          isThermal: false,
          isEnabled: false,
          fontSize: 0,
        },
      ];
    }
  }

  // 根据打印机名称分类判断宽度
  static classifyPrinter(name) {
    const nameLower = name.toLowerCase();

    // 检查是否为热敏打印机和宽度
    if (nameLower.includes('58') || nameLower.includes('58mm')) {
      return { width: 58, isThermal: true };
    } else if (nameLower.includes('80') || nameLower.includes('80mm')) {
      return { width: 80, isThermal: true };
    } else if (
      nameLower.includes('thermal') ||
      nameLower.includes('receipt') ||
      nameLower.includes('pos')
    ) {
      // 热敏打印机但未明确宽度，默认80mm
      return { width: 80, isThermal: true };
    } else {
      // 其他类型打印机，默认80mm宽度
      return { width: 80, isThermal: false };
    }
  }

  static async testPrint(printerName, width = 80, fontSize = 0) {
    try {
      console.log('🧪 [TEST] 开始测试打印');
      console.log('🧪 [TEST] 目标打印机:', printerName);

      // 生成包含中文的测试订单数据
      const testOrder = {
        order_id: '23410121749595834',
        rd_id: 341,
        user_id: '6305000000012',
        order_status: 1,
        paystyle: 0, // 线下付款测试
        delivery_style: 0, // 自取测试
        delivery_type: 0,
        doordash_id: '',
        recipient_name: '张三 (Zhang San)',
        recipient_address:
          '北京市朝阳区望京街道 123号 2B室 (123 Wangjing St, Apt 2B, Beijing)',
        recipient_phone: '(555) 123-4567',
        recipient_distance: '2.5',
        rd_name: '老王川菜馆 (Lao Wang Sichuan Restaurant)',
        rd_address: '456 Broadway Avenue, New York, NY 10012',
        rd_phone: '(555) 987-6543',
        dishes_count: 3,
        dishes_id_list: '[341120650,341120651,341120652]',
        dishes_array: [
          {
            dishes_id: 341120650,
            dishes_name: '麻婆豆腐 (Mapo Tofu)',
            amount: 1,
            price: '18.99',
            unit_price: '18.99',
            remark: '不要太辣 (Not too spicy)',
            dishes_describe: '嫩豆腐配麻辣汤汁 (Soft tofu with spicy sauce)',
            dishes_series_id: 10771,
            image_url:
              'https://www.menuorg.com/image/webp/dishes_photo/1746236681_13.png',
            dishes_specs_id: null,
          },
          {
            dishes_id: 341120651,
            dishes_name: '宫保鸡丁 (Kung Pao Chicken)',
            amount: 2,
            price: '23.98',
            unit_price: '11.99',
            remark: '多放花生米 (Extra peanuts)',
            dishes_describe:
              '鸡肉丁配花生米和青椒 (Diced chicken with peanuts and peppers)',
            dishes_series_id: 10772,
            image_url: '',
            dishes_specs_id: null,
          },
          {
            dishes_id: 341120652,
            dishes_name: '白米饭 (Steamed Rice)',
            amount: 1,
            price: '6.99',
            unit_price: '6.99',
            remark: '',
            dishes_describe: '香喷喷的白米饭 (Fragrant steamed white rice)',
            dishes_series_id: 10773,
            image_url: '',
            dishes_specs_id: null,
          },
        ],
        discount_total: '5.00',
        exemption: '0.00',
        sub_total: '49.96',
        user_commission: '1.25',
        tax_rate: '0.0825',
        tax_fee: '4.37',
        delivery_fee: '3.99',
        convenience_rate: '0.035',
        convenience_fee: '1.75',
        retail_delivery_fee: '0.00',
        tip_fee: '7.50',
        total: '65.82',
        cloud_print: 0,
        order_notes:
          '请按门铃两次。如无人应答请放在门口。(Please ring doorbell twice. Leave at front door if no answer.)',
        serial_num: 42,
        order_pdf_url:
          'https://www.menuorg.com/order_pdf/order_23410121749595834.pdf',
        user_email: 'john.smith@email.com',
        create_time: '2025-01-15 18:30:00',
        delivery_time: '2025-01-15 19:15:00',
      };

      console.log('✅ [TEST] 测试订单数据生成完成');
      console.log('🧪 [TEST] 正在生成打印内容...');

      const content = this.generatePrintContent(testOrder, width, fontSize);

      console.log('✅ [TEST] 打印内容生成完成，长度:', content.length, '字符');
      console.log('🧪 [TEST] 开始调用打印机API...');

      return await this.printText(printerName, content);
    } catch (error) {
      console.error('测试打印失败:', error);
      throw error;
    }
  }

  static async printOrder(printerName, orderData, width = 80, fontSize = 0) {
    try {
      const orderContent = this.generatePrintContent(
        orderData,
        width,
        fontSize
      );
      return await this.printText(printerName, orderContent);
    } catch (error) {
      console.error('打印订单失败:', error);
      throw error;
    }
  }

  static generatePrintContent(order, width = 80, fontSize = 0) {
    // 根据纸张宽度设置字符数 (考虑中文字符占2个位置)
    const charWidth = width === 80 ? 48 : 32;

    let content = '';

    // ESC/POS初始化命令 - 简化编码设置
    content += '\x1B@'; // 初始化打印机

    // 简化的编码设置 - 让打印机使用默认编码处理
    content += '\x1C\x26'; // 启用汉字模式 (通用命令)
    content += '\x1C\x43\x01'; // 选择汉字字符模式

    // 设置字体大小 - 确保中号和大号比小号大
    switch (fontSize) {
      case 0: // 小号字体 (默认大小)
        content += '\x1D\x21\x00'; // 正常大小 (1x1)
        break;
      case 1: // 中号字体 - 高度放大
        content += '\x1D\x21\x10'; // 宽度1x，高度2x
        break;
      case 2: // 大号字体 - 宽度和高度都放大
        content += '\x1D\x21\x11'; // 宽度2x，高度2x
        break;
      default: // 默认情况
        content += '\x1D\x21\x00'; // 正常大小
        break;
    }

    // 设置行间距为更宽松的间距
    content += '\x1B\x33\x30'; // 设置行间距为48/180英寸 (比默认大)

    // ============= 头部信息 (居中) =============
    content += '='.repeat(charWidth);
    content += '\n';
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed(order.rd_name.toUpperCase(), charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗
    content += '\n';

    // 订单类型 (居中)
    const orderType = this.getOrderTypeText(order);
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed(orderType, charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗
    content += '\n';
    content += '='.repeat(charWidth);
    content += '\n\n';

    // ============= 订单信息表格 =============
    // 订单号 (居中显示)
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed(`Order #: ${order.order_id}`, charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗
    content += '\n';

    // 流水号 (居中显示)
    const serial =
      order.serial_num > 0
        ? `#${order.serial_num.toString().padStart(3, '0')}`
        : `#${this.getOrderSerial(order)}`;
    content += this.centerTextMixed(`Serial: ${serial}`, charWidth);
    content += '\n\n';

    // 基本信息表格 (左对齐标签，右对齐数值)
    content += this.formatTableRow(
      'Order Date:',
      this.formatOrderTime(order.create_time),
      charWidth
    );

    if (order.delivery_style === 1) {
      // 外送
      content += this.formatTableRow(
        'Delivery Time:',
        this.formatDeliveryTime(order.delivery_time),
        charWidth
      );
      if (order.recipient_distance && order.recipient_distance !== '0.00') {
        content += this.formatTableRow(
          'Distance:',
          `${order.recipient_distance} miles`,
          charWidth
        );
      }
    } else {
      // 自取
      content += this.formatTableRow(
        'Pickup Time:',
        this.formatDeliveryTime(order.delivery_time),
        charWidth
      );
    }

    content += this.formatTableRow(
      'Payment:',
      this.getPaymentMethodText(order.paystyle),
      charWidth
    );
    content += this.formatTableRow(
      'Customer:',
      this.prepareMixedContent(order.recipient_name),
      charWidth
    );
    content += this.formatTableRow('Phone:', order.recipient_phone, charWidth);

    // 地址 (如果是外送)
    if (order.recipient_address && order.delivery_style === 1) {
      content += this.formatTableRow(
        'Address:',
        this.prepareMixedContent(order.recipient_address),
        charWidth
      );
    }

    if (order.user_email) {
      content += this.formatTableRow('Email:', order.user_email, charWidth);
    }

    content += '\n';
    content += '-'.repeat(charWidth);
    content += '\n';

    // ============= 商品明细表格 =============
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed('ORDER ITEMS', charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗
    content += '\n';
    content += '-'.repeat(charWidth);
    content += '\n';

    // 表格标题 - 简化版本
    const header = this.formatTableHeader(
      'Item Name',
      'Qty',
      '',
      'Total',
      charWidth
    );
    content += header;
    content += '-'.repeat(charWidth);
    content += '\n';

    for (const item of order.dishes_array) {
      const price = parseFloat(item.price) || 0.0;
      const unitPrice = parseFloat(item.unit_price) || 0.0;

      // 商品行 (使用混合编码处理菜名)
      content += this.formatItemTableRow(
        this.prepareMixedContent(item.dishes_name),
        item.amount,
        unitPrice,
        price,
        charWidth
      );

      // 附加项目 (如米饭等) - 只显示名称，不显示价格和数量
      if (item.dishes_describe) {
        content += `  + ${this.prepareMixedContent(item.dishes_describe)}\n`;
      }

      // 特殊要求 (使用混合编码)
      if (item.remark) {
        content += `  Note: ${this.prepareMixedContent(item.remark)}\n`;
      }

      // 增加商品间的行距
      content += '\n';
    }

    // ============= 费用明细 (右下角，每行一个数据，右对齐) =============
    const subTotal = parseFloat(order.sub_total) || 0.0;
    const discountTotal = parseFloat(order.discount_total) || 0.0;
    const exemption = parseFloat(order.exemption) || 0.0;
    const taxFee = parseFloat(order.tax_fee) || 0.0;
    const taxRate = parseFloat(order.tax_rate) || 0.0;
    const deliveryFee = parseFloat(order.delivery_fee) || 0.0;
    const convenienceFee = parseFloat(order.convenience_fee) || 0.0;
    const retailDeliveryFee = parseFloat(order.retail_delivery_fee) || 0.0;
    const tipFee = parseFloat(order.tip_fee) || 0.0;
    const total = parseFloat(order.total) || 0.0;

    content += '-'.repeat(charWidth);
    content += '\n';
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed('PAYMENT SUMMARY', charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗
    content += '\n';
    content += '-'.repeat(charWidth);
    content += '\n';

    // 小计
    content += this.formatFeeLine('Subtotal', subTotal, charWidth);

    // 折扣
    if (discountTotal > 0.0) {
      content += this.formatFeeLine('Discount', -discountTotal, charWidth);
    }

    // 免费金额
    if (exemption > 0.0) {
      content += this.formatFeeLine('Exemption', -exemption, charWidth);
    }

    // 税费
    if (taxFee > 0.0) {
      const taxLabel =
        taxRate > 0.0 ? `Tax (${(taxRate * 100.0).toFixed(1)}%)` : 'Tax';
      content += this.formatFeeLine(taxLabel, taxFee, charWidth);
    }

    // 配送费
    if (deliveryFee > 0.0) {
      content += this.formatFeeLine('Delivery Fee', deliveryFee, charWidth);
    }

    // 零售配送费
    if (retailDeliveryFee > 0.0) {
      content += this.formatFeeLine(
        'Retail Del. Fee',
        retailDeliveryFee,
        charWidth
      );
    }

    // 便民费
    if (convenienceFee > 0.0) {
      const convRate = parseFloat(order.convenience_rate) || 0.0;
      const convLabel =
        convRate > 0.0
          ? `Service Fee (${(convRate * 100.0).toFixed(1)}%)`
          : 'Service Fee';
      content += this.formatFeeLine(convLabel, convenienceFee, charWidth);
    }

    // 小费
    if (tipFee > 0.0) {
      content += this.formatFeeLine('Tip', tipFee, charWidth);
    }

    content += '\n';
    content += '='.repeat(charWidth);
    content += '\n';

    // 总计 (加粗显示)
    content += '\x1B\x45\x01'; // 加粗
    content += this.formatFeeLine('TOTAL', total, charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗

    content += '='.repeat(charWidth);
    content += '\n';

    // 底部信息 (使用混合编码)
    if (order.order_notes) {
      content += '\nNotes:\n';
      content += this.prepareMixedContent(order.order_notes);
      content += '\n';
    }

    content += '\n';
    content += this.centerTextMixed('Thank you for your order!', charWidth);
    content += '\n';
    content += this.centerTextMixed(
      `Order Time: ${this.formatSimpleTime(order.create_time)}`,
      charWidth
    );
    content += '\n\n\n\n'; // 空行，为切纸预留空间

    // 单次自动切纸命令 - 避免重复切纸
    content += '\x1D\x56\x00'; // GS V 0 - 全切 (最通用的切纸命令)

    return content;
  }

  // Helper function to get order type
  static getOrderTypeText(order) {
    return order.delivery_style === 1 ? 'DELIVERY' : 'PICKUP';
  }

  // Helper function to get payment method text
  static getPaymentMethodText(paystyle) {
    switch (paystyle) {
      case 0:
        return 'Pay at store';
      case 1:
        return 'Online payment';
      default:
        return 'Other';
    }
  }

  // Helper function to get order serial number
  static getOrderSerial(order) {
    // Use the last 6 digits of order_id or a simple counter
    const idStr = order.order_id;
    if (idStr.length >= 6) {
      return idStr.slice(-6);
    } else {
      return idStr;
    }
  }

  // Helper function to format order time
  static formatOrderTime(timeStr) {
    try {
      const date = new Date(timeStr);
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return timeStr;
    }
  }

  // Helper function to format delivery time
  static formatDeliveryTime(timeStr) {
    return this.formatOrderTime(timeStr);
  }

  // 计算中英文混合文本的显示宽度
  static displayWidth(text) {
    return [...text].reduce((width, char) => {
      return width + (char.charCodeAt(0) > 127 ? 2 : 1);
    }, 0);
  }

  // 中英文混合文本居中
  static centerTextMixed(text, width) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) {
      return text;
    } else {
      const padding = Math.floor((width - textWidth) / 2);
      return ' '.repeat(padding) + text;
    }
  }

  // 简化的混合内容处理函数 - 与上面保持一致
  static prepareMixedContent(text) {
    // 统一处理，让打印机自己识别编码
    return text
      .split('')
      .filter((c) => !this.isControlChar(c) || this.isAllowedControlChar(c))
      .join('');
  }

  static isControlChar(c) {
    const code = c.charCodeAt(0);
    return code < 32 || code === 127;
  }

  static isAllowedControlChar(c) {
    return c === '\n' || c === '\r' || c === '\t';
  }

  // 表格行格式化 (左对齐标签，右对齐数值)
  static formatTableRow(label, value, width) {
    const labelWidth = this.displayWidth(label);
    const valueWidth = this.displayWidth(value);

    if (labelWidth + valueWidth + 2 > width) {
      // 如果一行放不下，换行显示
      return `${label}\n  ${value}\n`;
    } else {
      const spaces = width - labelWidth - valueWidth;
      return `${label}${' '.repeat(spaces)}${value}\n`;
    }
  }

  // 商品表格标题
  static formatTableHeader(name, qty, price, total, width) {
    // 简化表格：只显示菜名、数量、总价
    const nameWidth = Math.max(Math.floor(width * 0.7), 20); // 菜名占70%宽度
    const qtyWidth = 4; // 数量宽度
    const totalWidth = width - nameWidth - qtyWidth - 2; // 总价宽度

    return `${this.truncateForWidth(name, nameWidth).padEnd(nameWidth)} ${qty
      .padStart(qtyWidth)
      .slice(-qtyWidth)} ${total.padStart(totalWidth).slice(-totalWidth)}\n`;
  }

  // 商品表格行 - 简化版本
  static formatItemTableRow(name, qty, unitPrice, totalPrice, width) {
    // 简化表格：只显示菜名、数量、总价
    const nameWidth = Math.max(Math.floor(width * 0.7), 20); // 菜名占70%宽度
    const qtyWidth = 4; // 数量宽度
    const totalWidth = width - nameWidth - qtyWidth - 2; // 总价宽度

    const qtyStr = qty.toString();
    const totalStr = totalPrice === 0.0 ? '+0.00' : totalPrice.toFixed(2);

    // 如果商品名太长，需要换行处理
    if (this.displayWidth(name) > nameWidth) {
      let result = '';

      // 将长菜名分行显示
      const wrappedLines = this.wrapTextForWidth(name, nameWidth).split('\n');

      // 第一行显示菜名开头和价格信息
      if (wrappedLines.length > 0) {
        const firstLine = this.truncateForWidth(wrappedLines[0], nameWidth);
        result += `${firstLine.padEnd(nameWidth)} ${qtyStr
          .padStart(qtyWidth)
          .slice(-qtyWidth)} ${totalStr
          .padStart(totalWidth)
          .slice(-totalWidth)}\n`;
      }

      // 后续行只显示菜名的剩余部分
      for (let i = 1; i < wrappedLines.length; i++) {
        const line = this.truncateForWidth(wrappedLines[i], nameWidth);
        result += `${line.padEnd(nameWidth)}\n`;
      }

      return result;
    } else {
      // 菜名长度适中，单行显示
      return `${this.padForWidth(name, nameWidth)} ${qtyStr
        .padStart(qtyWidth)
        .slice(-qtyWidth)} ${totalStr
        .padStart(totalWidth)
        .slice(-totalWidth)}\n`;
    }
  }

  // 费用行格式化 (右下角对齐)
  static formatFeeLine(label, amount, width) {
    const amountStr =
      amount < 0.0 ? `-$${(-amount).toFixed(2)}` : `$${amount.toFixed(2)}`;

    const labelWidth = this.displayWidth(label);
    const amountWidth = this.displayWidth(amountStr);

    if (labelWidth + amountWidth + 2 > width) {
      return `${label}\n${' '.repeat(width - amountWidth)}${amountStr}\n`;
    } else {
      const spaces = width - labelWidth - amountWidth;
      return `${label}${' '.repeat(spaces)}${amountStr}\n`;
    }
  }

  // 按显示宽度截断文本
  static truncateForWidth(text, maxWidth) {
    let result = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = char.charCodeAt(0) > 127 ? 2 : 1;
      if (currentWidth + charWidth > maxWidth) {
        if (currentWidth + 2 <= maxWidth) {
          result += '..';
        }
        break;
      }
      result += char;
      currentWidth += charWidth;
    }

    return result;
  }

  // 按显示宽度填充文本
  static padForWidth(text, targetWidth) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= targetWidth) {
      return text;
    } else {
      return text + ' '.repeat(targetWidth - textWidth);
    }
  }

  // 按显示宽度换行文本
  static wrapTextForWidth(text, width) {
    let result = '';
    let currentLine = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = char.charCodeAt(0) > 127 ? 2 : 1;

      if (currentWidth + charWidth > width) {
        result += currentLine + '\n';
        currentLine = char;
        currentWidth = charWidth;
      } else {
        currentLine += char;
        currentWidth += charWidth;
      }
    }

    if (currentLine) {
      result += currentLine;
    }

    return result;
  }

  // 简化的时间格式
  static formatSimpleTime(timeStr) {
    try {
      const date = new Date(timeStr);
      const now = new Date();

      if (date > now) {
        return `Future order ${date.toTimeString().slice(0, 5)}`;
      } else {
        return date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      }
    } catch (error) {
      return timeStr;
    }
  }

  // 生成打印预览内容
  static async generatePrintPreview(orderData, settings = {}) {
    try {
      const {
        paperWidth = 58,
        fontSize = 12,
        fontFamily = 'monospace',
        lineSpacing = 1.2,
        margin = 5,
        showLogo = true,
        showOrderTime = true,
        showItemDetails = true,
        showSeparator = true,
      } = settings;

      // 转换为打印内容格式
      const printContent = this.generatePrintContent(
        orderData,
        paperWidth,
        fontSize >= 16 ? 2 : fontSize >= 14 ? 1 : 0
      );

      // 转换为HTML预览格式
      const htmlContent = printContent
        .replace(/\x1B@/g, '') // 移除ESC/POS命令
        .replace(/\x1B\x45\x01/g, '<strong>') // 加粗开始
        .replace(/\x1B\x45\x00/g, '</strong>') // 加粗结束
        .replace(/\x1D\x21[\x00-\xFF]/g, '') // 移除字体大小命令
        .replace(/\x1B\x33[\x00-\xFF]/g, '') // 移除行间距命令
        .replace(/\x1C[\x00-\xFF][\x00-\xFF]?/g, '') // 移除中文模式命令
        .replace(/\x1D\x56\x00/g, '') // 移除切纸命令
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');

      return {
        html: htmlContent,
        settings: {
          paperWidth,
          fontSize,
          fontFamily,
          lineSpacing,
          margin,
          charWidth: paperWidth === 80 ? 48 : 32,
        },
      };
    } catch (error) {
      console.error('生成打印预览失败:', error);
      throw error;
    }
  }

  // 原有的英文版本函数 (保留兼容性)
  static centerText(text, width) {
    const textLen = text.length;
    if (textLen >= width) {
      return text;
    } else {
      const padding = Math.floor((width - textLen) / 2);
      return ' '.repeat(padding) + text;
    }
  }

  static async printText(printerName, content) {
    try {
      console.log(`开始打印到打印机: ${printerName}`);

      // 创建临时文件
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `print_${Date.now()}.txt`);

      // 写入打印内容
      fs.writeFileSync(tempFile, content, 'utf8');

      // Windows 打印命令
      const printCommand = `print /D:"${printerName}" "${tempFile}"`;

      console.log(`执行打印命令: ${printCommand}`);

      const { stdout, stderr } = await execAsync(printCommand);

      // 清理临时文件
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupError) {
        console.warn('清理临时文件失败:', cleanupError);
      }

      if (stderr) {
        console.warn('打印警告:', stderr);
      }

      console.log(`打印完成: ${printerName}`);
      return { success: true, output: stdout };
    } catch (error) {
      console.error(`打印失败 - ${printerName}:`, error);
      throw new Error(`打印失败: ${error.message}`);
    }
  }
}

module.exports = PrinterUtils;
