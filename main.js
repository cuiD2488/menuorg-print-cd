const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
  Tray,
  Menu,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const printerUtils = require('./src/printer');

// 简单的配置存储
const configPath = path.join(app.getPath('userData'), 'config.json');

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('保存配置失败:', error);
    return false;
  }
}

function getConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
    return {};
  } catch (error) {
    console.error('读取配置失败:', error);
    return {};
  }
}
let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // icon: path.join(__dirname, 'assets/icon.ico'), // 暂时移除图标
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发环境下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 处理窗口关闭
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 处理窗口最小化到托盘
  mainWindow.on('minimize', () => {
    if (tray) {
      mainWindow.hide();
    }
  });

  // 阻止窗口关闭，改为隐藏到托盘
  mainWindow.on('close', (event) => {
    if (!app.isQuiting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// 创建托盘
function createTray() {
  // 创建一个简单的托盘图标（使用系统默认图标）
  const trayIcon = nativeImage.createEmpty();
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开应用',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: '隐藏窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出应用',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('餐厅订单打印系统');

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 如果有托盘，不要退出应用
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

// 防止多实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// IPC 处理程序
ipcMain.handle('get-printers', async () => {
  try {
    return await printerUtils.getPrinters();
  } catch (error) {
    console.error('获取打印机列表失败:', error);
    return [];
  }
});

ipcMain.handle(
  'test-print',
  async (event, printerName, width = 80, fontSize = 0) => {
    try {
      return await printerUtils.testPrint(printerName, width, fontSize);
    } catch (error) {
      console.error('测试打印失败:', error);
      throw error;
    }
  }
);

// 新增：中文编码相关的IPC处理程序

// 检测文本中的中文字符类型
ipcMain.handle('detect-chinese-character-type', async (event, text) => {
  try {
    return await printerUtils.detectChineseCharacterType(text);
  } catch (error) {
    console.error('检测中文字符类型失败:', error);
    throw error;
  }
});

// 获取打印机编码支持信息
ipcMain.handle('get-printer-encoding-info', async (event, printerName) => {
  try {
    return await printerUtils.getPrinterEncodingInfo(printerName);
  } catch (error) {
    console.error('获取打印机编码信息失败:', error);
    throw error;
  }
});

// 测试打印机编码兼容性
ipcMain.handle(
  'test-printer-encoding-compatibility',
  async (event, printerName, testText, encoding) => {
    try {
      return await printerUtils.testPrinterEncodingCompatibility(
        printerName,
        testText,
        encoding
      );
    } catch (error) {
      console.error('测试编码兼容性失败:', error);
      throw error;
    }
  }
);

// 批量测试所有编码
ipcMain.handle(
  'test-all-encodings-for-printer',
  async (event, printerName, testText) => {
    try {
      return await printerUtils.testAllEncodingsForPrinter(
        printerName,
        testText
      );
    } catch (error) {
      console.error('批量测试编码失败:', error);
      throw error;
    }
  }
);

// 生成编码兼容性报告
ipcMain.handle(
  'generate-encoding-compatibility-report',
  async (event, printerName, testResults) => {
    try {
      return await printerUtils.generateEncodingCompatibilityReport(
        printerName,
        testResults
      );
    } catch (error) {
      console.error('生成兼容性报告失败:', error);
      throw error;
    }
  }
);

// 使用指定编码打印订单
ipcMain.handle(
  'print-order-with-encoding',
  async (event, printerName, orderData, encoding) => {
    try {
      return await printerUtils.printOrderWithEncoding(
        printerName,
        orderData,
        encoding
      );
    } catch (error) {
      console.error('编码打印失败:', error);
      throw error;
    }
  }
);

// 智能选择最佳编码
ipcMain.handle('select-optimal-encoding', async (event, text, printerName) => {
  try {
    return await printerUtils.selectOptimalEncoding(text, printerName);
  } catch (error) {
    console.error('智能编码选择失败:', error);
    throw error;
  }
});

ipcMain.handle(
  'print-order',
  async (event, orderData, width = 80, fontSize = 0) => {
    try {
      // 注意：这里我们不再传递printerName，因为新的逻辑是在后端处理多选打印机
      return await printerUtils.printOrder(
        'default', // 使用默认或第一个可用打印机
        orderData,
        width,
        fontSize
      );
    } catch (error) {
      console.error('打印订单失败:', error);
      throw error;
    }
  }
);

ipcMain.handle('save-config', async (event, config) => {
  return saveConfig(config);
});

ipcMain.handle('get-config', async () => {
  return getConfig();
});

ipcMain.handle('show-notification', async (event, options) => {
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: options.title || '通知',
        body: options.body || '',
        // icon: options.icon || path.join(__dirname, 'assets/icon.ico'), // 暂时移除图标
        silent: false,
      });
      notification.show();
      return true;
    }
    return false;
  } catch (error) {
    console.error('显示通知失败:', error);
    return false;
  }
});

ipcMain.handle('minimize-window', async () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('maximize-window', async () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', async () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// 打开新窗口（用于中文编码测试页面）
ipcMain.handle('open-new-window', async (event, url, options = {}) => {
  try {
    const newWindow = new BrowserWindow({
      width: options.width || 1200,
      height: options.height || 900,
      title: options.title || '新窗口',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      show: false,
      parent: mainWindow, // 设置为主窗口的子窗口
      modal: false,
    });

    // 加载指定的URL/文件
    if (url.startsWith('file://')) {
      // 如果是文件URL，直接加载
      await newWindow.loadURL(url);
    } else {
      // 如果是相对路径，加载文件
      await newWindow.loadFile(url);
    }

    newWindow.once('ready-to-show', () => {
      newWindow.show();
    });

    // 窗口关闭时清理
    newWindow.on('closed', () => {
      // 窗口已关闭，清理引用
    });

    return true;
  } catch (error) {
    console.error('打开新窗口失败:', error);
    return false;
  }
});

// 打印预览功能
ipcMain.handle('print-preview', async (event, orderData, printerSettings) => {
  try {
    return await printerUtils.generatePrintPreview(orderData, printerSettings);
  } catch (error) {
    console.error('生成打印预览失败:', error);
    throw error;
  }
});

// 打印排版设置
ipcMain.handle('save-print-settings', async (event, settings) => {
  try {
    const config = getConfig();
    config.printSettings = settings;
    return saveConfig(config);
  } catch (error) {
    console.error('保存打印设置失败:', error);
    return false;
  }
});

ipcMain.handle('get-print-settings', async () => {
  try {
    const config = getConfig();
    return (
      config.printSettings || {
        paperWidth: 58, // 58mm热敏纸
        fontSize: 12,
        fontFamily: 'SimSun',
        lineSpacing: 1.2,
        margin: 5,
        showLogo: true,
        showOrderTime: true,
        showItemDetails: true,
        showSeparator: true,
      }
    );
  } catch (error) {
    console.error('获取打印设置失败:', error);
    return {};
  }
});
