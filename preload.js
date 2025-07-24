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

  // 移除测试打印API
  // testPrint: (printerName) => ipcRenderer.invoke('test-print', printerName),

  // 通知
  showNotification: (options) =>
    ipcRenderer.invoke('show-notification', options),

  // 打印预览
  generatePrintPreview: (orderData, settings) =>
    ipcRenderer.invoke('print-preview', orderData, settings),

  // 🚀 开机自动运行
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),

  // 🔄 自动更新功能
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  getVersionInfo: () => ipcRenderer.invoke('get-version-info'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  getUpdateConfig: () => ipcRenderer.invoke('get-update-config'),

  // 🔄 自动更新事件监听
  onUpdateChecking: (callback) =>
    ipcRenderer.on('auto-updater-update-checking', callback),
  onUpdateAvailable: (callback) =>
    ipcRenderer.on('auto-updater-update-available', callback),
  onUpdateNotAvailable: (callback) =>
    ipcRenderer.on('auto-updater-update-not-available', callback),
  onUpdateError: (callback) =>
    ipcRenderer.on('auto-updater-update-error', callback),
  onUpdateDownloadProgress: (callback) =>
    ipcRenderer.on('auto-updater-update-download-progress', callback),
  onUpdateDownloaded: (callback) =>
    ipcRenderer.on('auto-updater-update-downloaded', callback),
  onUpdateInstalling: (callback) =>
    ipcRenderer.on('auto-updater-update-installing', callback),
  onShowUpdateDetails: (callback) =>
    ipcRenderer.on('auto-updater-show-update-details', callback),

  // 移除自动更新事件监听器
  removeUpdateListener: (event, callback) =>
    ipcRenderer.removeListener(`auto-updater-${event}`, callback),
  removeAllUpdateListeners: () => {
    const events = [
      'update-checking',
      'update-available',
      'update-not-available',
      'update-error',
      'update-download-progress',
      'update-downloaded',
      'update-installing',
      'show-update-details',
    ];
    events.forEach((event) =>
      ipcRenderer.removeAllListeners(`auto-updater-${event}`)
    );
  },

  // 中文编码相关API已移除

  // 错误监听
  onError: (callback) => ipcRenderer.on('error', callback),
  removeErrorListener: (callback) =>
    ipcRenderer.removeListener('error', callback),
});
