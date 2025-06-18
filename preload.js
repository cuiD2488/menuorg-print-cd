const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 打印机相关
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  testPrint: (printerName, width, fontSize) =>
    ipcRenderer.invoke('test-print', printerName, width, fontSize),
  printOrder: (printerName, orderData, width, fontSize) =>
    ipcRenderer.invoke('print-order', printerName, orderData, width, fontSize),

  // 打印预览和设置
  printPreview: (orderData, settings) =>
    ipcRenderer.invoke('print-preview', orderData, settings),
  generatePrintPreview: (orderData, settings) =>
    ipcRenderer.invoke('print-preview', orderData, settings),
  savePrintSettings: (settings) =>
    ipcRenderer.invoke('save-print-settings', settings),
  getPrintSettings: () => ipcRenderer.invoke('get-print-settings'),

  // 配置相关
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfig: () => ipcRenderer.invoke('get-config'),

  // 通知相关
  showNotification: (options) =>
    ipcRenderer.invoke('show-notification', options),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  openNewWindow: (url, options) =>
    ipcRenderer.invoke('open-new-window', url, options),

  // 新增：中文编码相关API
  // 检测文本中文字符类型
  detectChineseCharacterType: (text) =>
    ipcRenderer.invoke('detect-chinese-character-type', text),

  // 获取打印机编码支持信息
  getPrinterEncodingInfo: (printerName) =>
    ipcRenderer.invoke('get-printer-encoding-info', printerName),

  // 测试打印机编码兼容性
  testPrinterEncodingCompatibility: (printerName, testText, encoding) =>
    ipcRenderer.invoke(
      'test-printer-encoding-compatibility',
      printerName,
      testText,
      encoding
    ),

  // 批量测试所有编码
  testAllEncodingsForPrinter: (printerName, testText) =>
    ipcRenderer.invoke('test-all-encodings-for-printer', printerName, testText),

  // 生成编码兼容性报告
  generateEncodingCompatibilityReport: (printerName, testResults) =>
    ipcRenderer.invoke(
      'generate-encoding-compatibility-report',
      printerName,
      testResults
    ),

  // 使用指定编码打印订单
  printOrderWithEncoding: (printerName, orderData, encoding) =>
    ipcRenderer.invoke(
      'print-order-with-encoding',
      printerName,
      orderData,
      encoding
    ),

  // 智能选择最佳编码
  selectOptimalEncoding: (text, printerName) =>
    ipcRenderer.invoke('select-optimal-encoding', text, printerName),
});
