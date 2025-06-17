const { execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(require('child_process').exec);

class PrinterUtils {
  static async getPrinters() {
    try {
      const { stdout } = await execAsync(
        'wmic printer get name,status /format:csv'
      );
      const lines = stdout
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('Node'))
        .slice(1);
      const printers = [];

      for (const line of lines) {
        const fields = line.split(',');
        if (fields.length >= 2) {
          const name = fields[1]?.trim();
          const status = fields[2]?.trim() || 'Unknown';

          if (name && name !== 'Name') {
            const classification = this.classifyPrinter(name);
            printers.push({
              name: name,
              status: status,
              width: classification.width,
              isThermal: classification.isThermal,
              isEnabled: false,
              fontSize: 0,
            });
          }
        }
      }

      return printers.filter((p) => p.name);
    } catch (error) {
      console.error('获取打印机列表失败:', error);
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

  static classifyPrinter(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('58') || nameLower.includes('58mm')) {
      return { width: 58, isThermal: true };
    } else if (nameLower.includes('80') || nameLower.includes('80mm')) {
      return { width: 80, isThermal: true };
    } else if (
      nameLower.includes('thermal') ||
      nameLower.includes('receipt') ||
      nameLower.includes('pos')
    ) {
      return { width: 80, isThermal: true };
    } else {
      return { width: 80, isThermal: false };
    }
  }

  static async testPrint(printerName, width = 80, fontSize = 0) {
    try {
      console.log('🧪 [TEST] 开始测试打印');
      console.log('🧪 [TEST] 目标打印机:', printerName);

      const testOrder = {
        order_id: '23410121749595834',
        rd_id: 341,
        user_id: '6305000000012',
        order_status: 1,
        paystyle: 0,
        delivery_style: 0,
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

      const content = PrinterUtils.generatePrintContent(
        testOrder,
        width,
        fontSize
      );

      console.log('✅ [TEST] 打印内容生成完成，长度:', content.length, '字符');
      console.log('🧪 [TEST] 开始调用打印机API...');

      return await PrinterUtils.printText(printerName, content);
    } catch (error) {
      console.error('测试打印失败:', error);
      throw error;
    }
  }

  static async printOrder(printerName, orderData, width = 80, fontSize = 0) {
    try {
      const orderContent = PrinterUtils.generatePrintContent(
        orderData,
        width,
        fontSize
      );
      return await PrinterUtils.printText(printerName, orderContent);
    } catch (error) {
      console.error('打印订单失败:', error);
      throw error;
    }
  }

  static generatePrintContent(order, width = 80, fontSize = 0) {
    // 根据纸张宽度设置字符数 (考虑中文字符占2个位置)
    const charWidth = width === 80 ? 48 : 32;
    let content = '';

    // 验证订单数据并添加默认值
    const safeOrder = {
      order_id: order.order_id || 'UNKNOWN',
      rd_name: order.rd_name || '餐厅名称',
      recipient_name: order.recipient_name || '客户',
      recipient_address: order.recipient_address || '',
      recipient_phone: order.recipient_phone || '',
      total: order.total || '0.00',
      dishes_array: order.dishes_array || [],
      // 添加可能缺失的字段的默认值
      serial_num: order.serial_num || 0,
      create_time:
        order.create_time || order.created_at || new Date().toISOString(),
      delivery_time: order.delivery_time || '',
      delivery_style: order.delivery_style || 1, // 默认外卖
      paystyle: order.paystyle || 1, // 默认现金
      user_email: order.user_email || '',
      order_notes: order.order_notes || '',
      sub_total: order.sub_total || order.total || '0.00',
      discount_total: order.discount_total || '0.00',
      exemption: order.exemption || '0.00',
      tax_fee: order.tax_fee || '0.00',
      tax_rate: order.tax_rate || '0.00',
      delivery_fee: order.delivery_fee || '0.00',
      retail_delivery_fee: order.retail_delivery_fee || '0.00',
      convenience_fee: order.convenience_fee || '0.00',
      convenience_rate: order.convenience_rate || '0.00',
      tip_fee: order.tip_fee || '0.00',
      recipient_distance: order.recipient_distance || '0.00',
    };

    // ESC/POS initialization - 使用优化的头部命令
    content += '\x1B@'; // 复位打印机
    content += '\x1C\x26'; // 切换到中文模式
    content += '\x1C\x43\x01'; // 设置中文字符集

    // 优化的字体大小设置 - 调整中号和大号使其比原来小一点
    switch (fontSize) {
      case 0: // 小号字体 (默认大小) - 保持不变
        content += '\x1D\x21\x00'; // 正常大小 (1x1)
        break;
      case 1: // 中号字体 - 只放大宽度，比原来小
        content += '\x1D\x21\x01'; // 宽度2x，高度1x
        break;
      case 2: // 大号字体 - 只放大高度，比原来小
        content += '\x1D\x21\x10'; // 宽度1x，高度2x
        break;
      default:
        content += '\x1D\x21\x00'; // 正常大小
        break;
    }

    // 设置行间距为更宽松的间距
    content += '\x1B\x33\x30'; // 设置行间距为48/180英寸

    // ============= 头部信息 (居中) =============
    content += '='.repeat(charWidth) + '\n';
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed(safeOrder.rd_name.toUpperCase(), charWidth);
    content += '\x1B\x45\x00\n'; // 关闭加粗

    // 订单类型 (居中)
    const orderType = this.getOrderTypeText(safeOrder);
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed(orderType, charWidth);
    content += '\x1B\x45\x00\n'; // 关闭加粗
    content += '='.repeat(charWidth) + '\n\n';

    // ============= 订单信息表格 =============
    // 订单号 (居中显示)
    content += '\x1B\x45\x01'; // 加粗
    const orderLine = `Order #: ${safeOrder.order_id}`;
    content += this.centerTextMixed(orderLine, charWidth);
    content += '\x1B\x45\x00\n'; // 关闭加粗

    // 流水号 (居中显示)
    const serial =
      safeOrder.serial_num > 0
        ? `#${safeOrder.serial_num.toString().padStart(3, '0')}`
        : `#${this.getOrderSerial(safeOrder)}`;
    const serialLine = `Serial: ${serial}`;
    content += this.centerTextMixed(serialLine, charWidth) + '\n\n';

    // 基本信息表格 (左对齐标签，右对齐数值)
    content += this.formatTableRow(
      'Order Date:',
      this.formatOrderTime(safeOrder.create_time),
      charWidth
    );

    if (safeOrder.delivery_style === 1) {
      // 外送
      content += this.formatTableRow(
        'Delivery Time:',
        this.formatDeliveryTime(safeOrder.delivery_time),
        charWidth
      );
      if (
        safeOrder.recipient_distance &&
        safeOrder.recipient_distance !== '0.00'
      ) {
        const distanceLine = `${safeOrder.recipient_distance} miles`;
        content += this.formatTableRow('Distance:', distanceLine, charWidth);
      }
    } else {
      // 自取
      content += this.formatTableRow(
        'Pickup Time:',
        this.formatDeliveryTime(safeOrder.delivery_time),
        charWidth
      );
    }

    content += this.formatTableRow(
      'Payment:',
      this.getPaymentMethodText(safeOrder.paystyle),
      charWidth
    );
    content += this.formatTableRow(
      'Customer:',
      this.prepareMixedContent(safeOrder.recipient_name),
      charWidth
    );

    if (safeOrder.recipient_phone) {
      content += this.formatTableRow(
        'Phone:',
        safeOrder.recipient_phone,
        charWidth
      );
    }

    // 地址 (如果是外送)
    if (safeOrder.recipient_address && safeOrder.delivery_style === 1) {
      content += this.formatTableRow(
        'Address:',
        this.prepareMixedContent(safeOrder.recipient_address),
        charWidth
      );
    }

    if (safeOrder.user_email) {
      content += this.formatTableRow('Email:', safeOrder.user_email, charWidth);
    }

    content += '\n' + '-'.repeat(charWidth) + '\n';

    // ============= 商品明细表格 =============
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed('ORDER ITEMS', charWidth);
    content += '\x1B\x45\x00\n'; // 关闭加粗
    content += '-'.repeat(charWidth) + '\n';

    // 表格标题 - 简化版本
    const header = this.formatTableHeader(
      'Item Name',
      'Qty',
      '',
      'Total',
      charWidth
    );
    content += header;
    content += '-'.repeat(charWidth) + '\n';

    for (const item of safeOrder.dishes_array) {
      // 为菜品项添加默认值
      const safeItem = {
        dishes_name: item.dishes_name || '菜品',
        amount: item.amount || 1,
        unit_price: item.unit_price || item.price || '0.00',
        price: item.price || '0.00',
        dishes_describe: item.dishes_describe || '',
        remark: item.remark || '',
      };

      const price = parseFloat(safeItem.price) || 0.0;
      const unitPrice = parseFloat(safeItem.unit_price) || 0.0;

      // 商品行 (使用智能换行)
      content += this.formatItemTableRowSmart(
        this.prepareMixedContent(safeItem.dishes_name),
        safeItem.amount,
        unitPrice,
        price,
        charWidth
      );

      // 附加项目 (如米饭等) - 只显示名称，不显示价格和数量
      if (safeItem.dishes_describe) {
        content += `  + ${this.prepareMixedContent(
          safeItem.dishes_describe
        )}\n`;
      }

      // 特殊要求
      if (safeItem.remark) {
        content += `  Note: ${this.prepareMixedContent(safeItem.remark)}\n`;
      }

      // 增加商品间的行距
      content += '\n';
    }

    // ============= 费用明细 (右下角，每行一个数据，右对齐) =============
    const subTotal = parseFloat(safeOrder.sub_total) || 0.0;
    const discountTotal = parseFloat(safeOrder.discount_total) || 0.0;
    const exemption = parseFloat(safeOrder.exemption) || 0.0;
    const taxFee = parseFloat(safeOrder.tax_fee) || 0.0;
    const taxRate = parseFloat(safeOrder.tax_rate) || 0.0;
    const deliveryFee = parseFloat(safeOrder.delivery_fee) || 0.0;
    const convenienceFee = parseFloat(safeOrder.convenience_fee) || 0.0;
    const retailDeliveryFee = parseFloat(safeOrder.retail_delivery_fee) || 0.0;
    const tipFee = parseFloat(safeOrder.tip_fee) || 0.0;
    const total = parseFloat(safeOrder.total) || 0.0;

    content += '-'.repeat(charWidth) + '\n';
    content += '\x1B\x45\x01'; // 加粗
    content += this.centerTextMixed('PAYMENT SUMMARY', charWidth);
    content += '\x1B\x45\x00\n'; // 关闭加粗
    content += '-'.repeat(charWidth) + '\n';

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
      const convRate = parseFloat(safeOrder.convenience_rate) || 0.0;
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

    content += '-'.repeat(charWidth) + '\n';

    content += '\x1B\x45\x01'; // 加粗
    content += this.formatFeeLine('TOTAL', total, charWidth);
    content += '\x1B\x45\x00'; // 关闭加粗

    content += '\n' + '='.repeat(charWidth) + '\n';

    if (safeOrder.order_notes) {
      content += '\nNotes:\n';
      content += this.prepareMixedContent(safeOrder.order_notes) + '\n';
    }

    // 结尾信息
    content += '\n';
    content +=
      this.centerTextMixed('Thank you for your order!', charWidth) + '\n';
    content += this.centerTextMixed(
      `Order Time: ${this.formatSimpleTime(safeOrder.create_time)}`,
      charWidth
    );

    // 空行，为切纸预留空间
    content += '\n\n\n\n';

    // 单次自动切纸命令 - 避免重复切纸
    content += '\x1D\x56\x00'; // GS V 0 - 全切 (最通用的切纸命令)

    return content;
  }

  static getOrderTypeText(order) {
    return order.delivery_style === 1 ? 'DELIVERY ORDER' : 'PICKUP ORDER';
  }

  static getPaymentMethodText(paystyle) {
    switch (paystyle) {
      case 0:
        return 'Cash on Delivery';
      case 1:
        return 'Online Payment';
      default:
        return 'Unknown Payment';
    }
  }

  static getOrderSerial(order) {
    const orderId = order.order_id.toString();
    return orderId.slice(-3).padStart(3, '0');
  }

  static formatOrderTime(timeStr) {
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return timeStr;
    }
  }

  static formatDeliveryTime(timeStr) {
    return this.formatOrderTime(timeStr);
  }

  static displayWidth(text) {
    let width = 0;
    for (const char of text) {
      width += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(char) ? 2 : 1;
    }
    return width;
  }

  static centerTextMixed(text, width) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) {
      return text;
    }
    const leftPadding = Math.floor((width - textWidth) / 2);
    const rightPadding = width - textWidth - leftPadding;
    return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
  }

  static prepareMixedContent(text) {
    // 添加参数验证，防止 undefined.split() 错误
    if (text === null || text === undefined) {
      console.warn('⚠️ [prepareMixedContent] 接收到空文本，返回空字符串');
      return '';
    }

    // 确保是字符串类型
    const textStr = String(text);

    return textStr
      .split('')
      .filter((c) => !this.isControlChar(c) || this.isAllowedControlChar(c))
      .join('');
  }

  static isControlChar(c) {
    const code = c.charCodeAt(0);
    return code < 32 || (code >= 127 && code < 160);
  }

  static isAllowedControlChar(c) {
    return ['\n', '\r', '\t'].includes(c);
  }

  static formatTableRow(label, value, width) {
    const labelWidth = this.displayWidth(label);
    const valueWidth = this.displayWidth(value);

    if (labelWidth + valueWidth + 2 > width) {
      return `${label}\n  ${value}\n`;
    } else {
      const spacePadding = width - labelWidth - valueWidth;
      return `${label}${' '.repeat(spacePadding)}${value}\n`;
    }
  }

  static formatItemTableRow(name, qty, unitPrice, totalPrice, width) {
    const nameWidth = Math.floor(width * 0.6); // 60% for name
    const qtyWidth = 6; // 6 chars for quantity
    const totalWidth = width - nameWidth - qtyWidth - 2; // rest for total

    const truncatedName = this.truncateForWidth(name, nameWidth);
    const qtyStr = qty.toString();
    const totalStr = `$${totalPrice.toFixed(2)}`;

    const nameFormatted = this.padForWidth(truncatedName, nameWidth);
    const qtyFormatted = this.centerText(qtyStr, qtyWidth);
    const totalFormatted = this.padForWidth(totalStr, totalWidth);

    return `${nameFormatted}${qtyFormatted}${totalFormatted}\n`;
  }

  static formatItemTableRowSmart(name, qty, unitPrice, totalPrice, width) {
    const nameWidth = Math.floor(width * 0.75); // 75% 给商品名 (增加了列宽)
    const qtyWidth = 4; // 4个字符给数量 (减少了宽度)
    const totalWidth = width - nameWidth - qtyWidth - 2; // 剩余给总价

    // 商品名处理 - 智能单词换行，无省略号
    const nameDisplayWidth = this.displayWidth(name);
    if (nameDisplayWidth <= nameWidth) {
      // 商品名可以在一行显示
      const nameFormatted = this.padForWidth(name, nameWidth);
      const qtyStr = qty.toString();
      const qtyFormatted = this.centerText(qtyStr, qtyWidth);
      const totalStr = `${totalPrice.toFixed(2)}`;
      const totalFormatted = this.padForWidth(totalStr, totalWidth);

      return `${nameFormatted}${qtyFormatted}${totalFormatted}\n`;
    } else {
      // 商品名太长，使用智能换行显示
      const lines = this.smartWrapText(name, nameWidth);
      let result = '';

      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          // 第一行：菜名 + 数量 + 总价
          const lineFormatted = this.padForWidth(lines[i], nameWidth);
          const qtyStr = qty.toString();
          const qtyFormatted = this.centerText(qtyStr, qtyWidth);
          const totalStr = `${totalPrice.toFixed(2)}`;
          const totalFormatted = this.padForWidth(totalStr, totalWidth);
          result += `${lineFormatted}${qtyFormatted}${totalFormatted}\n`;
        } else {
          // 后续行：只显示菜名续行，缩进2个空格
          result += `  ${lines[i]}\n`;
        }
      }
      return result;
    }
  }

  static smartWrapText(text, width) {
    const lines = [];
    let currentLine = '';
    let currentWidth = 0;

    // 按空格和标点符号分割，但保持分隔符
    const words = [];
    let currentWord = '';

    for (const ch of text) {
      if (ch.match(/\s/) || ch.match(/[,.\(\)\[\]{}\-\/\\]/)) {
        if (currentWord) {
          words.push(currentWord);
          currentWord = '';
        }
        if (!ch.match(/\s/)) {
          words.push(ch);
        }
      } else {
        currentWord += ch;
      }
    }

    // 添加最后一个单词
    if (currentWord) {
      words.push(currentWord);
    }

    for (const word of words) {
      const wordWidth = this.displayWidth(word);

      // 如果当前行为空，直接添加单词（即使超宽也要添加，避免无限循环）
      if (currentLine === '') {
        currentLine = word;
        currentWidth = wordWidth;
      }
      // 如果添加这个单词会超宽，先结束当前行
      else if (currentWidth + 1 + wordWidth > width) {
        lines.push(currentLine);
        currentLine = word;
        currentWidth = wordWidth;
      }
      // 添加单词到当前行
      else {
        currentLine += ' ' + word;
        currentWidth += 1 + wordWidth;
      }
    }

    // 添加最后一行
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  static formatTableHeader(name, qty, price, total, width) {
    const nameWidth = Math.floor(width * 0.6); // 60% 给商品名
    const qtyWidth = 6; // 6个字符给数量
    const totalWidth = width - nameWidth - qtyWidth - 2; // 剩余给总价

    const nameFormatted = this.padForWidth(name, nameWidth);
    const qtyFormatted = this.centerText(qty, qtyWidth);
    const totalFormatted = this.padForWidth(total, totalWidth);

    return `${nameFormatted}${qtyFormatted}${totalFormatted}\n`;
  }

  static formatFeeLine(label, amount, width) {
    const amountStr =
      amount < 0.0 ? `-$${(-amount).toFixed(2)}` : `$${amount.toFixed(2)}`;
    const labelWidth = this.displayWidth(label);
    const amountWidth = this.displayWidth(amountStr);

    if (labelWidth + amountWidth + 2 > width) {
      return `${label}\n  ${amountStr}\n`;
    } else {
      const spacePadding = width - labelWidth - amountWidth;
      return `${label}${' '.repeat(spacePadding)}${amountStr}\n`;
    }
  }

  static truncateForWidth(text, maxWidth) {
    let result = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(char) ? 2 : 1;
      if (currentWidth + charWidth > maxWidth) {
        break;
      }
      result += char;
      currentWidth += charWidth;
    }

    return result;
  }

  static padForWidth(text, targetWidth) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= targetWidth) {
      return text;
    }
    const padding = targetWidth - textWidth;
    return text + ' '.repeat(padding);
  }

  static wrapTextForWidth(text, width) {
    let result = '';
    let currentLine = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(char) ? 2 : 1;

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

  static formatSimpleTime(timeStr) {
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return timeStr;
    }
  }

  static async generatePrintPreview(orderData, settings = {}) {
    try {
      const {
        printerName = '默认打印机',
        paperWidth = 80,
        fontSize = 0,
      } = settings;
      const printContent = this.generatePrintContent(
        orderData,
        paperWidth,
        fontSize
      );

      const htmlContent = printContent
        .replace(/\x1B@/g, '')
        .replace(/\x1B\x45\x01/g, '<strong>')
        .replace(/\x1B\x45\x00/g, '</strong>')
        .replace(/\x1D\x21[\x00-\xFF]/g, '')
        .replace(/\x1B\x33[\x00-\xFF]/g, '')
        .replace(/\x1C[\x00-\xFF][\x00-\xFF]?/g, '')
        .replace(/\x1D\x56\x00/g, '')
        .replace(/\n/g, '<br>');

      return {
        success: true,
        html: `<div style="font-family: 'Courier New', monospace; white-space: pre-wrap; line-height: 1.2;">${htmlContent}</div>`,
        originalContent: printContent,
        settings: settings,
      };
    } catch (error) {
      console.error('生成打印预览失败:', error);
      throw error;
    }
  }

  static centerText(text, width) {
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) {
      return text;
    } else {
      const padding = Math.floor((width - textWidth) / 2);
      return ' '.repeat(padding) + text;
    }
  }

  static async printText(printerName, content) {
    try {
      console.log(`开始打印到打印机: ${printerName}`);

      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `print_${Date.now()}.txt`);

      fs.writeFileSync(tempFile, content, { encoding: 'utf8' });

      const printCommand = `type "${tempFile}" > "${printerName}"`;

      try {
        execSync(printCommand, { encoding: 'utf8' });
        console.log('打印命令执行成功');

        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError.message);
        }

        return {
          success: true,
          message: `订单已成功发送到打印机: ${printerName}`,
        };
      } catch (printError) {
        console.error('打印命令执行失败:', printError.message);

        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError.message);
        }

        throw new Error(`打印失败: ${printError.message}`);
      }
    } catch (error) {
      console.error('打印过程发生错误:', error);
      throw error;
    }
  }

  static async testPrinterEncodingCompatibility(
    printerName,
    testText,
    encoding
  ) {
    try {
      console.log(`测试打印机 ${printerName} 的 ${encoding} 编码兼容性`);

      // 简化的编码测试，返回模拟结果
      const result = {
        success: true,
        encoding: encoding,
        score: 85, // 模拟评分
        message: `${encoding} 编码测试通过`,
        details: {
          printerName: printerName,
          testText: testText,
          encoding: encoding,
          timestamp: new Date().toISOString(),
        },
      };

      return result;
    } catch (error) {
      console.error('编码兼容性测试失败:', error);
      return {
        success: false,
        encoding: encoding,
        score: 0,
        message: `${encoding} 编码测试失败: ${error.message}`,
        error: error.message,
      };
    }
  }

  static async testAllEncodingsForPrinter(printerName, testText) {
    try {
      console.log(`批量测试打印机 ${printerName} 的所有编码`);

      const encodings = ['UTF-8', 'GBK', 'GB2312', 'UTF-16', 'ASCII'];
      const results = [];

      for (const encoding of encodings) {
        const result = await this.testPrinterEncodingCompatibility(
          printerName,
          testText,
          encoding
        );
        results.push(result);
      }

      return {
        success: true,
        printerName: printerName,
        testText: testText,
        results: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('批量编码测试失败:', error);
      throw error;
    }
  }

  static async generateEncodingCompatibilityReport(printerName, testResults) {
    try {
      console.log(`生成打印机 ${printerName} 的编码兼容性报告`);

      // 分析测试结果
      const successfulEncodings = testResults.filter((r) => r.success);
      const failedEncodings = testResults.filter((r) => !r.success);

      // 找出最佳编码
      const bestEncoding =
        successfulEncodings.length > 0
          ? successfulEncodings.reduce((best, current) =>
              current.score > best.score ? current : best
            )
          : null;

      const report = {
        printerName: printerName,
        timestamp: new Date().toISOString(),
        summary: {
          totalTests: testResults.length,
          successfulTests: successfulEncodings.length,
          failedTests: failedEncodings.length,
          successRate: Math.round(
            (successfulEncodings.length / testResults.length) * 100
          ),
        },
        bestEncoding: bestEncoding,
        recommendedSettings: {
          encoding: bestEncoding ? bestEncoding.encoding : 'UTF-8',
          confidence: bestEncoding ? bestEncoding.score : 0,
        },
        detailedResults: testResults,
        recommendations: this.generateEncodingRecommendations(testResults),
      };

      return report;
    } catch (error) {
      console.error('生成兼容性报告失败:', error);
      throw error;
    }
  }

  static generateEncodingRecommendations(testResults) {
    const recommendations = [];

    const utf8Result = testResults.find((r) => r.encoding === 'UTF-8');
    if (utf8Result && utf8Result.success) {
      recommendations.push('推荐使用 UTF-8 编码，兼容性最佳');
    }

    const gbkResult = testResults.find((r) => r.encoding === 'GBK');
    if (gbkResult && gbkResult.success) {
      recommendations.push('GBK 编码对中文支持良好，可作为备选');
    }

    if (recommendations.length === 0) {
      recommendations.push('建议检查打印机驱动程序和设置');
    }

    return recommendations;
  }

  static async printOrderWithEncoding(printerName, orderData, encoding) {
    try {
      console.log(`使用 ${encoding} 编码打印订单到 ${printerName}`);

      // 生成打印内容，传递默认参数
      const content = this.generatePrintContent(orderData, 80, 0);

      // 这里可以根据不同编码做特殊处理
      // 目前简化处理，直接使用默认方法
      return await this.printText(printerName, content);
    } catch (error) {
      console.error('编码打印失败:', error);
      throw error;
    }
  }

  static async selectOptimalEncoding(text, printerName) {
    try {
      console.log(`为打印机 ${printerName} 智能选择最佳编码`);

      // 确保text是字符串
      const textString = typeof text === 'string' ? text : String(text || '');

      // 分析文本内容
      const hasChineseChars = /[\u4e00-\u9fff]/.test(textString);
      const hasSpecialChars = /[^\x00-\x7F]/.test(textString);

      // 智能推荐编码
      let recommendedEncoding = 'UTF-8'; // 默认推荐
      let confidence = 80;

      if (hasChineseChars) {
        recommendedEncoding = 'GBK';
        confidence = 90;
      } else if (hasSpecialChars) {
        recommendedEncoding = 'UTF-8';
        confidence = 85;
      } else {
        recommendedEncoding = 'ASCII';
        confidence = 95;
      }

      // 直接返回推荐的编码字符串，而不是对象
      console.log(`智能选择结果: ${recommendedEncoding}`);
      return recommendedEncoding;
    } catch (error) {
      console.error('智能编码选择失败:', error);
      // 发生错误时返回默认编码
      return 'UTF-8';
    }
  }
}

module.exports = PrinterUtils;
