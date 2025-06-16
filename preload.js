const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 打印机相关
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  testPrint: (printerName, width, fontSize) =>
    ipcRenderer.invoke('test-print', printerName, width, fontSize),
  printOrder: (orderData, width, fontSize) =>
    ipcRenderer.invoke('print-order', orderData, width, fontSize),

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
});
