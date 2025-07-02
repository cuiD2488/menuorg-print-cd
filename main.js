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

// 🚀 开机自动运行管理
function setAutoStart(enabled) {
  try {
    const appName = app.getName();
    const executablePath = process.execPath;
    const isDevMode = !app.isPackaged;

    console.log('📱 设置开机自动运行:', {
      enabled,
      appName,
      executablePath,
      isPackaged: app.isPackaged,
      isDevMode,
    });

    // 如果是开发模式，给出警告
    if (isDevMode) {
      console.warn('⚠️ 开发模式下开机自动运行可能无法生效，需要打包后测试');
    }

    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled, // 开机时在后台启动（最小化到托盘）
      path: executablePath,
      args: enabled ? ['--auto-start'] : [],
    });

    // 保存设置到配置文件
    const config = getConfig();
    config.autoStart = enabled;
    config.autoStartLastUpdate = new Date().toISOString();
    config.isDevMode = isDevMode; // 记录是否为开发模式
    saveConfig(config);

    console.log('✅ 开机自动运行设置已保存:', enabled);
    return true;
  } catch (error) {
    console.error('❌ 设置开机自动运行失败:', error);
    return false;
  }
}

function getAutoStartStatus() {
  try {
    const loginItemSettings = app.getLoginItemSettings();
    const config = getConfig();
    const configAutoStart = config.autoStart;
    const isDevMode = !app.isPackaged;

    console.log('📱 当前开机自动运行状态:', {
      systemEnabled: loginItemSettings.openAtLogin,
      configEnabled: configAutoStart,
      isDevMode,
      loginItemSettings,
    });

    // 在开发模式下，如果系统设置失败但配置文件中已保存，则返回配置文件的值
    if (
      isDevMode &&
      configAutoStart !== undefined &&
      !loginItemSettings.openAtLogin
    ) {
      console.log('🔧 开发模式：使用配置文件中的设置');
      return configAutoStart;
    }

    // 以系统设置为准
    return loginItemSettings.openAtLogin;
  } catch (error) {
    console.error('❌ 获取开机自动运行状态失败:', error);
    return false;
  }
}

// 🚀 异步验证开机自动运行状态（用于解决时序问题）
async function verifyAutoStartStatus(expectedStatus, maxRetries = 3) {
  const isDevMode = !app.isPackaged;

  for (let i = 0; i < maxRetries; i++) {
    const currentStatus = getAutoStartStatus();

    if (currentStatus === expectedStatus) {
      console.log('✅ 开机自动运行状态验证成功:', currentStatus);
      return { status: currentStatus, isDevMode, verified: true };
    }

    console.log(
      `🔄 开机自动运行状态验证中... (${
        i + 1
      }/${maxRetries}) 期望:${expectedStatus}, 实际:${currentStatus}`
    );

    // 等待一段时间后重试
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const finalStatus = getAutoStartStatus();
  const config = getConfig();

  // 在开发模式下，如果系统设置未生效但配置已保存，仍认为设置成功
  if (isDevMode && config.autoStart === expectedStatus) {
    console.log('🔧 开发模式：配置已保存，系统设置将在打包后生效');
    return {
      status: expectedStatus,
      isDevMode,
      verified: false,
      devModeNote: true,
    };
  }

  console.warn('⚠️ 开机自动运行状态验证最终结果:', finalStatus);
  return { status: finalStatus, isDevMode, verified: false };
}

function initAutoStart() {
  try {
    // 检查启动参数
    const isAutoStarted = process.argv.includes('--auto-start');

    if (isAutoStarted) {
      console.log('🚀 应用通过开机自动运行启动');

      // 自动启动时默认最小化到托盘
      if (mainWindow) {
        mainWindow.hide();
      }

      // 显示简短的托盘通知
      setTimeout(() => {
        if (Notification.isSupported()) {
          new Notification({
            title: 'MenuorgPrint',
            body: '应用已在后台启动，随时为您处理订单打印',
            silent: true,
          }).show();
        }
      }, 3000);
    }

    // 🎯 检查安装程序设置的开机自动运行标记
    const autoStartFlagPath = path.join(__dirname, 'auto-start-enabled.flag');
    const installerSetAutoStart = fs.existsSync(autoStartFlagPath);

    if (installerSetAutoStart && app.isPackaged) {
      console.log('🔧 检测到安装程序启用了开机自动运行，同步到应用配置');

      // 读取标记文件
      try {
        const flagContent = fs.readFileSync(autoStartFlagPath, 'utf8').trim();
        if (flagContent === '1') {
          // 同步到应用配置
          const config = getConfig();
          config.autoStart = true;
          config.autoStartSetByInstaller = true;
          config.autoStartLastUpdate = new Date().toISOString();
          saveConfig(config);

          // 删除标记文件，避免重复处理
          fs.unlinkSync(autoStartFlagPath);
          console.log('✅ 安装程序的开机自动运行设置已同步到应用配置');
        }
      } catch (error) {
        console.warn('⚠️ 处理安装程序开机自动运行标记失败:', error);
      }
    }

    // 同步系统设置和配置文件
    const systemEnabled = app.getLoginItemSettings().openAtLogin;
    const config = getConfig();

    if (config.autoStart !== systemEnabled) {
      console.log('🔄 同步开机自动运行设置:', systemEnabled);
      config.autoStart = systemEnabled;
      saveConfig(config);
    }
  } catch (error) {
    console.error('❌ 初始化开机自动运行失败:', error);
  }
}

let mainWindow;
let tray;

function createWindow() {
  // 检查是否为自动启动
  const isAutoStart = process.argv.includes('--auto-start');

  console.log('🚀 创建主窗口:', {
    isAutoStart,
    args: process.argv,
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: !isAutoStart, // 自动启动时不显示窗口
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('renderer/index.html');

  // 如果是自动启动，直接最小化到托盘
  if (isAutoStart) {
    mainWindow.hide();
    console.log('🚀 自动启动模式：应用已启动到托盘');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 本地运行打开，其他清空关闭控制台
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 点击关闭按钮时最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('✅ 应用已最小化到托盘');
    }
    return false;
  });
}

// 🚀 创建托盘菜单的全局函数
function createTrayMenu() {
  const isAutoStartEnabled = getAutoStartStatus();

  return Menu.buildFromTemplate([
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
      label: '🚀 开机自动运行',
      type: 'checkbox',
      checked: isAutoStartEnabled,
      click: (menuItem) => {
        const success = setAutoStart(menuItem.checked);
        if (success) {
          // 重新创建菜单以更新状态
          setTimeout(() => {
            if (tray) {
              tray.setContextMenu(createTrayMenu());
            }
          }, 100);

          // 显示状态通知
          if (Notification.isSupported()) {
            new Notification({
              title: 'MenuorgPrint',
              body: menuItem.checked
                ? '已启用开机自动运行，下次开机时将自动在后台启动'
                : '已禁用开机自动运行',
              silent: false,
            }).show();
          }
        } else {
          // 如果设置失败，恢复菜单状态
          setTimeout(() => {
            if (tray) {
              tray.setContextMenu(createTrayMenu());
            }
          }, 100);
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
}

// 创建托盘
function createTray() {
  let trayIcon;

  try {
    // 获取正确的资源路径
    const getResourcePath = (filename) => {
      if (app.isPackaged) {
        // 打包后文件在app.asar中，使用__dirname即可
        return path.join(__dirname, 'assets', filename);
      } else {
        // 开发环境使用__dirname
        return path.join(__dirname, 'assets', filename);
      }
    };

    // 尝试多种图标格式和路径
    const iconPaths = [
      getResourcePath('tray-icon.png'),
      getResourcePath('tray-icon.ico'),
      getResourcePath('icon.ico'),
      getResourcePath('icon.png'),
    ];

    console.log('🔍 尝试加载托盘图标');
    console.log('📦 应用是否已打包:', app.isPackaged);
    console.log('📁 当前目录:', __dirname);
    if (app.isPackaged) {
      console.log(
        '📁 资源路径 (process.resourcesPath):',
        process.resourcesPath
      );
      console.log('📁 应用路径 (app.getAppPath()):', app.getAppPath());
    }

    for (const iconPath of iconPaths) {
      console.log('📁 检查图标路径:', iconPath);
      console.log('📁 文件是否存在:', fs.existsSync(iconPath));

      if (fs.existsSync(iconPath)) {
        console.log('✅ 找到图标文件，尝试加载:', iconPath);

        trayIcon = nativeImage.createFromPath(iconPath);

        console.log('📏 图标是否为空:', trayIcon.isEmpty());
        if (!trayIcon.isEmpty()) {
          console.log('📏 图标大小:', trayIcon.getSize());

          // 确保图标大小适合托盘 (Windows通常是16x16)
          const size = trayIcon.getSize();
          if (size.width !== 16 || size.height !== 16) {
            console.log('🔄 调整图标大小到16x16');
            trayIcon = trayIcon.resize({ width: 16, height: 16 });
          }
          break;
        }
      }
    }

    // 如果所有图标都加载失败，创建一个基础图标
    if (!trayIcon || trayIcon.isEmpty()) {
      console.warn('⚠️ 所有图标加载失败，创建基础图标');

      // 创建一个16x16的基础图标数据（简单的蓝色方块）
      const iconData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x91, 0x68, 0x36, 0x00, 0x00, 0x00,
        0x19, 0x74, 0x45, 0x58, 0x74, 0x53, 0x6f, 0x66, 0x74, 0x77, 0x61, 0x72,
        0x65, 0x00, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x20, 0x49, 0x6d, 0x61, 0x67,
        0x65, 0x52, 0x65, 0x61, 0x64, 0x79, 0x71, 0xc9, 0x65, 0x3c, 0x00, 0x00,
        0x00, 0x38, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x62, 0x20, 0x16, 0x8c,
        0x48, 0x40, 0x12, 0x04, 0x83, 0x91, 0x48, 0x40, 0x12, 0x04, 0x83, 0x91,
        0x48, 0x40, 0x12, 0x04, 0x83, 0x91, 0x48, 0x40, 0x12, 0x04, 0x83, 0x91,
        0x48, 0x40, 0x12, 0x04, 0x83, 0x91, 0x48, 0x40, 0x12, 0x04, 0x83, 0x91,
        0x48, 0x40, 0x12, 0x04, 0x83, 0x91, 0x48, 0x40, 0x12, 0x04, 0x00, 0x01,
        0x01, 0x00, 0x02, 0x73, 0xd5, 0x6f, 0x99, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      try {
        trayIcon = nativeImage.createFromBuffer(iconData);
        console.log('✅ 使用内置图标数据创建图标');
      } catch (bufferError) {
        console.warn('⚠️ 内置图标创建失败，使用空图标');
        trayIcon = nativeImage.createEmpty();
      }
    }
  } catch (error) {
    console.error('❌ 托盘图标加载失败:', error);
    trayIcon = nativeImage.createEmpty();
  }

  console.log('🎯 最终托盘图标状态 - 是否为空:', trayIcon.isEmpty());

  tray = new Tray(trayIcon);

  // 设置初始菜单
  const contextMenu = createTrayMenu();
  tray.setContextMenu(contextMenu);

  tray.setToolTip('MenuorgPrint - 餐厅订单打印');

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

  console.log('✅ 托盘创建完成');
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // 🚀 初始化开机自动运行功能
  initAutoStart();

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

// 简化的IPC处理程序 - 打印功能现在完全由前端CLodop处理
ipcMain.handle('get-printers', async () => {
  // 返回空数组，让前端CLodop自己获取打印机
  console.log('🔍 前端将使用CLodop获取打印机列表');
  return [];
});

ipcMain.handle(
  'test-print',
  async (event, printerName, width = 80, fontSize = 0) => {
    // 返回成功状态，实际打印由前端CLodop处理
    console.log('🧪 前端将使用CLodop进行测试打印:', {
      printerName,
      width,
      fontSize,
    });
    return { success: true, message: '测试打印将由CLodop处理' };
  }
);

// 获取引擎状态 - 现在只返回CLodop状态
ipcMain.handle('get-print-engine-status', async () => {
  console.log('🔍 返回CLodop引擎状态');
  return {
    currentEngine: 'CLodop',
    rustAvailable: false,
    fallbackAvailable: false,
    clodopAvailable: true,
  };
});

ipcMain.handle(
  'print-order',
  async (event, orderData, width = 80, fontSize = 0) => {
    // 返回成功状态，实际打印由前端CLodop处理
    console.log('🖨️ 前端将使用CLodop打印订单:', {
      orderId: orderData.order_id,
      width,
      fontSize,
    });
    return {
      success: true,
      message: '订单打印将由CLodop处理',
      results: [],
    };
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

// 打印预览功能 - 现在由前端处理
ipcMain.handle('print-preview', async (event, orderData, printerSettings) => {
  console.log('📄 前端将使用CLodop生成打印预览');
  return { success: true, message: '打印预览将由CLodop处理' };
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

// 🚀 开机自动运行 IPC 处理程序
ipcMain.handle('set-auto-start', async (event, enabled) => {
  try {
    console.log('📱 IPC请求设置开机自动运行:', enabled);
    const success = setAutoStart(enabled);

    if (success) {
      // 🔄 异步验证设置是否生效
      const verifiedStatus = await verifyAutoStartStatus(enabled);

      if (tray) {
        // 更新托盘菜单状态
        setTimeout(() => {
          tray.setContextMenu(createTrayMenu());
        }, 100);
      }

      return {
        success: true,
        enabled: verifiedStatus.status,
        requested: enabled,
        verified: verifiedStatus.verified,
        isDevMode: verifiedStatus.isDevMode,
        devModeNote: verifiedStatus.devModeNote,
      };
    } else {
      return {
        success: false,
        enabled: getAutoStartStatus(),
        error: '设置失败',
      };
    }
  } catch (error) {
    console.error('❌ IPC设置开机自动运行失败:', error);
    return {
      success: false,
      enabled: getAutoStartStatus(),
      error: error.message,
    };
  }
});

ipcMain.handle('get-auto-start', async () => {
  try {
    const enabled = getAutoStartStatus();
    console.log('📱 IPC获取开机自动运行状态:', enabled);
    return { success: true, enabled };
  } catch (error) {
    console.error('❌ IPC获取开机自动运行状态失败:', error);
    return { success: false, enabled: false, error: error.message };
  }
});
