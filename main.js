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
// 引入混合打印引擎
const PrinterHybrid = require('./src/printer-hybrid');

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
  tray.setToolTip('MenuorgPrint');

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
    console.log('🔍 获取系统打印机列表...');
    // 使用混合打印引擎获取打印机列表
    const printers = await hybridPrinter.getPrinters();
    console.log('✅ 成功获取打印机列表:', printers.length, '台');
    return printers;
  } catch (error) {
    console.error('❌ 获取打印机失败:', error);
    throw error;
  }
});

ipcMain.handle(
  'test-print',
  async (event, printerName, width = 80, fontSize = 0) => {
    try {
      console.log('🧪 测试打印:', { printerName, width, fontSize });
      // 使用混合打印引擎测试打印
      const result = await hybridPrinter.testPrint(
        printerName,
        width,
        fontSize
      );
      console.log('✅ 测试打印结果:', result);
      return result;
    } catch (error) {
      console.error('❌ 测试打印失败:', error);
      throw error;
    }
  }
);

// 新增：中文编码相关的IPC处理程序

// 检测文本中的中文字符类型
ipcMain.handle('detect-chinese-character-type', async (event, text) => {
  try {
    return (await PrinterHybrid.detectChineseCharacterType)
      ? await PrinterHybrid.detectChineseCharacterType(text)
      : await printerUtils.detectChineseCharacterType(text);
  } catch (error) {
    console.error('检测中文字符类型失败:', error);
    throw error;
  }
});

// 获取打印机编码支持信息
ipcMain.handle('get-printer-encoding-info', async (event, printerName) => {
  try {
    return (await PrinterHybrid.getPrinterEncodingInfo)
      ? await PrinterHybrid.getPrinterEncodingInfo(printerName)
      : await printerUtils.getPrinterEncodingInfo(printerName);
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
      return (await PrinterHybrid.testPrinterEncodingCompatibility)
        ? await PrinterHybrid.testPrinterEncodingCompatibility(
            printerName,
            testText,
            encoding
          )
        : await printerUtils.testPrinterEncodingCompatibility(
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
      return (await PrinterHybrid.testAllEncodingsForPrinter)
        ? await PrinterHybrid.testAllEncodingsForPrinter(printerName, testText)
        : await printerUtils.testAllEncodingsForPrinter(printerName, testText);
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
      return (await PrinterHybrid.generateEncodingCompatibilityReport)
        ? await PrinterHybrid.generateEncodingCompatibilityReport(
            printerName,
            testResults
          )
        : await printerUtils.generateEncodingCompatibilityReport(
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
      console.log('🖨️ 使用指定编码打印:', {
        printerName,
        encoding,
        orderId: orderData?.order_id,
      });

      // 使用混合打印引擎的静态方法或回退到 printerUtils
      if (PrinterHybrid.printOrderWithEncoding) {
        return await PrinterHybrid.printOrderWithEncoding(
          printerName,
          orderData,
          encoding
        );
      } else {
        return await printerUtils.printOrderWithEncoding(
          printerName,
          orderData,
          encoding
        );
      }
    } catch (error) {
      console.error('❌ 编码打印失败:', error);
      throw error;
    }
  }
);

// 智能选择最佳编码
ipcMain.handle('select-optimal-encoding', async (event, text, printerName) => {
  try {
    return (await PrinterHybrid.selectOptimalEncoding)
      ? await PrinterHybrid.selectOptimalEncoding(text, printerName)
      : await printerUtils.selectOptimalEncoding(text, printerName);
  } catch (error) {
    console.error('智能编码选择失败:', error);
    throw error;
  }
});

// 创建混合打印引擎实例
const hybridPrinter = new PrinterHybrid();

ipcMain.handle(
  'print-order',
  async (event, orderData, width = 80, fontSize = 0) => {
    try {
      console.log('🖨️ 开始打印订单:', {
        orderId: orderData.order_id,
        width,
        fontSize,
      });

      // 获取配置中的选中打印机
      const config = getConfig();
      const selectedPrinters = config.selectedPrinters || [];

      if (selectedPrinters.length === 0) {
        console.log('⚠️ 未配置打印机，使用默认打印机');
        // 获取第一台可用打印机
        const printers = await hybridPrinter.getPrinters();
        if (printers.length === 0) {
          throw new Error('没有可用的打印机');
        }
        const defaultPrinter = printers[0].name;
        console.log('📍 使用默认打印机:', defaultPrinter);

        // 使用混合打印引擎打印
        return await hybridPrinter.printOrder(
          defaultPrinter,
          orderData,
          width,
          fontSize
        );
      }

      // 批量打印到选中的打印机
      const results = [];
      for (const printerName of selectedPrinters) {
        try {
          console.log('🎯 打印到:', printerName);
          const result = await hybridPrinter.printOrder(
            printerName,
            orderData,
            width,
            fontSize
          );
          results.push({ printer: printerName, success: true, result });
          console.log('✅ 打印成功:', printerName);
        } catch (error) {
          console.error('❌ 打印失败:', printerName, error);
          results.push({
            printer: printerName,
            success: false,
            error: error.message,
          });
        }
      }

      return {
        success: results.some((r) => r.success),
        results: results,
        message: `打印完成: ${results.filter((r) => r.success).length}/${
          results.length
        } 成功`,
      };
    } catch (error) {
      console.error('❌ 打印订单失败:', error);
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
