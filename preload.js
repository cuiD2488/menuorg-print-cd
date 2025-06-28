const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 打印机管理
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printOrder: (printerName, orderData) =>
    ipcRenderer.invoke('print-order', printerName, orderData),

  // 打印引擎状态 - 统一API命名
  getPrintEngineStatus: () => ipcRenderer.invoke('get-print-engine-status'),
  getEngineStatus: () => ipcRenderer.invoke('get-print-engine-status'),

  // 配置管理
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // 测试打印
  testPrint: (printerName) => ipcRenderer.invoke('test-print', printerName),

  // 通知
  showNotification: (options) =>
    ipcRenderer.invoke('show-notification', options),

  // 打印预览
  generatePrintPreview: (orderData, settings) =>
    ipcRenderer.invoke('print-preview', orderData, settings),

  // 🚀 开机自动运行
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),

  // 中文编码相关API已移除

  // 错误监听
  onError: (callback) => ipcRenderer.on('error', callback),
  removeErrorListener: (callback) =>
    ipcRenderer.removeListener('error', callback),
});
