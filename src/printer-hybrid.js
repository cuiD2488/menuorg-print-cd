const PrinterUtils = require('./printer');
const PrinterNative = require('./printer-native');

class PrinterHybrid {
  constructor() {
    this.nativeEngine = null;
    this.initNativeEngine();
    this.printerNative = new PrinterNative();
    this.printerUtils = new PrinterUtils();
  }

  initNativeEngine() {
    try {
      this.nativeEngine = new PrinterNative();
      if (this.nativeEngine.isAvailable()) {
        console.log('🚀 使用高性能 Rust 打印引擎');
      } else {
        console.log('⚠️ Rust 引擎不可用，使用传统 Node.js 打印');
        this.nativeEngine = null;
      }
    } catch (error) {
      console.error('❌ 初始化 Rust 打印引擎失败:', error);
      console.log('💡 回退到传统 Node.js 打印方式');
      this.nativeEngine = null;
    }
  }

  async getPrinters() {
    try {
      if (this.nativeEngine && this.nativeEngine.isAvailable()) {
        console.log('🔧 使用 Rust 引擎获取打印机列表');
        const printers = await this.nativeEngine.getPrinters();

        // 转换为统一格式
        return printers.map((name) => ({
          name: name,
          status: 'Ready',
          width: this.classifyPrinter(name).width,
          isThermal: this.classifyPrinter(name).isThermal,
          isEnabled: false,
          fontSize: 0,
        }));
      } else {
        console.log('🔧 使用 Node.js 获取打印机列表');
        return await PrinterUtils.getPrinters();
      }
    } catch (error) {
      console.error('获取打印机失败，回退到 Node.js 方式:', error);
      return await PrinterUtils.getPrinters();
    }
  }

  async printOrder(printerName, orderData, width = 80, fontSize = 0) {
    console.log('🖨️ [混合引擎] 开始打印订单');
    console.log('📄 [混合引擎] 订单数据:', orderData);

    try {
      // 转换订单数据格式为 Rust 引擎期望的格式
      const convertedOrderData = this.convertOrderDataForRust(orderData);

      // 尝试使用高性能 Rust 引擎
      if (this.nativeEngine) {
        console.log('🚀 [混合引擎] 使用 Rust 引擎打印订单');
        try {
          const result = await this.nativeEngine.printOrder(
            printerName,
            convertedOrderData,
            width,
            fontSize
          );
          console.log('✅ [混合引擎] Rust 引擎打印成功:', result);
          return result;
        } catch (error) {
          console.error('❌ [混合引擎] Rust 引擎打印失败:', error);
          console.log('🔄 [混合引擎] 回退到 Node.js 方式...');
        }
      }

      // 回退到 Node.js 方式（使用转换后的数据）
      console.log('🔄 [混合引擎] 使用 Node.js 方式打印');
      try {
        const result = await PrinterUtils.printOrder(
          printerName,
          convertedOrderData,
          width,
          fontSize
        );
        console.log('✅ [混合引擎] Node.js 方式打印成功');
        return result;
      } catch (fallbackError) {
        console.error('❌ [混合引擎] Node.js 方式也失败:', fallbackError);
        throw new Error(`打印失败: ${fallbackError.message}`);
      }
    } catch (error) {
      console.error('❌ [混合引擎] 打印订单完全失败:', error);
      throw error;
    }
  }

  async testPrint(printerName, width = 80, fontSize = 0) {
    try {
      if (this.nativeEngine && this.nativeEngine.isAvailable()) {
        console.log('🧪 使用 Rust 引擎测试打印');
        return await this.nativeEngine.testPrint(printerName, width, fontSize);
      } else {
        console.log('🧪 使用 Node.js 测试打印');
        return await PrinterUtils.testPrint(printerName, width, fontSize);
      }
    } catch (error) {
      console.error('Rust 测试打印失败，回退到 Node.js 方式:', error);
      return await PrinterUtils.testPrint(printerName, width, fontSize);
    }
  }

  // 代理其他方法到 PrinterUtils
  static generatePrintContent(order, width = 80, fontSize = 0) {
    return PrinterUtils.generatePrintContent(order, width, fontSize);
  }

  static async generatePrintPreview(orderData, settings = {}) {
    return PrinterUtils.generatePrintPreview(orderData, settings);
  }

  static async printOrderWithEncoding(printerName, orderData, encoding) {
    return PrinterUtils.printOrderWithEncoding(
      printerName,
      orderData,
      encoding
    );
  }

  static async selectOptimalEncoding(text, printerName) {
    return PrinterUtils.selectOptimalEncoding(text, printerName);
  }

  // 工具方法
  classifyPrinter(name) {
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

  getEngineInfo() {
    return {
      rustAvailable: this.nativeEngine && this.nativeEngine.isAvailable(),
      currentEngine:
        this.nativeEngine && this.nativeEngine.isAvailable()
          ? 'Rust'
          : 'Node.js',
      fallbackAvailable: true,
    };
  }

  // 新增：转换订单数据格式（前端格式 -> Rust引擎格式）
  convertOrderDataForRust(orderData) {
    try {
      // 创建符合 Rust 引擎期望的数据结构
      const convertedOrder = {
        order_id: orderData.order_id || 'UNKNOWN',
        rd_name: orderData.rd_name || orderData.restaurant_name || '餐厅名称',
        recipient_name:
          orderData.recipient_name || orderData.customer_name || '客户',
        recipient_address:
          orderData.recipient_address || orderData.address || '地址',
        total: orderData.total || orderData.total_amount || '0.00',
        dishes_array: [],
      };

      // 转换菜品数组
      if (orderData.dishes_array) {
        // 如果已经是正确格式
        convertedOrder.dishes_array = orderData.dishes_array.map((dish) => ({
          dishes_name: dish.dishes_name || dish.name || '菜品',
          amount: dish.amount || dish.quantity || 1,
          price: dish.price || '0.00',
          remark: dish.remark || dish.note || '',
        }));
      } else if (orderData.items) {
        // 从前端的 items 格式转换
        convertedOrder.dishes_array = orderData.items.map((item) => ({
          dishes_name: item.name || '菜品',
          amount: item.quantity || 1,
          price: item.price || '0.00',
          remark: item.note || item.remark || '',
        }));
      }

      console.log('🔄 [数据转换] 原始订单:', orderData);
      console.log('🔄 [数据转换] 转换后订单:', convertedOrder);

      return convertedOrder;
    } catch (error) {
      console.error('❌ [数据转换] 订单数据转换失败:', error);
      throw new Error(`订单数据转换失败: ${error.message}`);
    }
  }
}

module.exports = PrinterHybrid;
