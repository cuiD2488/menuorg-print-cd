// 自动更新管理器
// 负责检查、下载和安装应用更新
// 支持主动检查和被动检查更新

const { autoUpdater } = require('electron-updater');
const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');
const semver = require('semver');

console.log('[AUTO-UPDATER] 自动更新管理器开始加载...');

class AutoUpdaterManager {
  constructor() {
    this.currentVersion = app.getVersion();
    this.isCheckingForUpdate = false;
    this.isDownloadingUpdate = false;
    this.isUpdateAvailable = false;
    this.updateInfo = null;
    this.mainWindow = null;
    this.lastCheckTime = null;
    this.checkInterval = null;

    // 更新配置
    this.config = {
      // 自动检查间隔（小时）
      autoCheckInterval: 4,
      // 是否启用自动下载
      autoDownload: true,
      // 是否启用静默安装
      silentInstall: false,
      // 更新服务器URL（如果不使用GitHub）
      updateServerUrl: null,
      // 是否在启动时检查更新
      checkOnStartup: true,
      // 是否允许预发布版本
      allowPrerelease: false,
    };

    this.loadConfig();
    this.setupAutoUpdater();
    this.setupIpcHandlers();

    console.log(`[AUTO-UPDATER] 当前版本: ${this.currentVersion}`);
  }

  // 加载更新配置
  loadConfig() {
    try {
      const configPath = path.join(
        app.getPath('userData'),
        'updater-config.json'
      );
      if (fs.existsSync(configPath)) {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.config = { ...this.config, ...savedConfig };
        console.log('[AUTO-UPDATER] 配置已加载:', this.config);
      }
    } catch (error) {
      console.error('[AUTO-UPDATER] 加载配置失败:', error);
    }
  }

  // 保存更新配置
  saveConfig() {
    try {
      const configPath = path.join(
        app.getPath('userData'),
        'updater-config.json'
      );
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      console.log('[AUTO-UPDATER] 配置已保存');
    } catch (error) {
      console.error('[AUTO-UPDATER] 保存配置失败:', error);
    }
  }

  // 设置自动更新器
  setupAutoUpdater() {
    // 配置更新源
    if (this.config.updateServerUrl) {
      autoUpdater.setFeedURL(this.config.updateServerUrl);
    }

    // 设置自动下载
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.allowPrerelease = this.config.allowPrerelease;

    // 监听更新事件
    autoUpdater.on('checking-for-update', () => {
      console.log('[AUTO-UPDATER] 正在检查更新...');
      this.isCheckingForUpdate = true;
      this.sendToRenderer('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AUTO-UPDATER] 发现更新:', info);
      this.isCheckingForUpdate = false;
      this.isUpdateAvailable = true;
      this.updateInfo = info;
      this.sendToRenderer('update-available', info);

      // 显示更新通知
      this.showUpdateNotification(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AUTO-UPDATER] 当前已是最新版本');
      this.isCheckingForUpdate = false;
      this.isUpdateAvailable = false;
      this.sendToRenderer('update-not-available', info);
    });

    autoUpdater.on('error', (error) => {
      console.error('[AUTO-UPDATER] 更新错误:', error);
      this.isCheckingForUpdate = false;
      this.isDownloadingUpdate = false;
      this.sendToRenderer('update-error', {
        message: error.message,
        stack: error.stack,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      console.log(
        `[AUTO-UPDATER] 下载进度: ${progress.percent.toFixed(2)}% (${
          progress.transferred
        }/${progress.total})`
      );
      this.sendToRenderer('update-download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AUTO-UPDATER] 更新下载完成:', info);
      this.isDownloadingUpdate = false;
      this.sendToRenderer('update-downloaded', info);

      // 显示安装确认对话框
      this.showInstallConfirmation(info);
    });
  }

  // 设置IPC处理器
  setupIpcHandlers() {
    // 检查更新
    ipcMain.handle('check-for-updates', async () => {
      return await this.checkForUpdates();
    });

    // 下载更新
    ipcMain.handle('download-update', async () => {
      return await this.downloadUpdate();
    });

    // 安装更新
    ipcMain.handle('install-update', () => {
      this.installUpdate();
    });

    // 获取更新状态
    ipcMain.handle('get-update-status', () => {
      return this.getUpdateStatus();
    });

    // 获取版本信息
    ipcMain.handle('get-version-info', () => {
      return {
        currentVersion: this.currentVersion,
        latestVersion: this.updateInfo?.version || null,
        updateAvailable: this.isUpdateAvailable,
        lastCheckTime: this.lastCheckTime,
      };
    });

    // 更新配置
    ipcMain.handle('update-config', (event, newConfig) => {
      this.updateConfig(newConfig);
    });

    // 获取配置
    ipcMain.handle('get-update-config', () => {
      return this.config;
    });
  }

  // 设置主窗口引用
  setMainWindow(window) {
    this.mainWindow = window;
  }

  // 发送消息到渲染进程
  sendToRenderer(event, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`auto-updater-${event}`, data);
    }
  }

  // 检查更新
  async checkForUpdates() {
    if (this.isCheckingForUpdate) {
      console.log('[AUTO-UPDATER] 正在检查更新中，跳过重复请求');
      return { success: false, message: '正在检查更新中' };
    }

    try {
      console.log('[AUTO-UPDATER] 开始检查更新...');
      this.lastCheckTime = new Date();

      const result = await autoUpdater.checkForUpdatesAndNotify();

      return {
        success: true,
        message: '更新检查完成',
        result: result,
      };
    } catch (error) {
      console.error('[AUTO-UPDATER] 检查更新失败:', error);
      return {
        success: false,
        message: `检查更新失败: ${error.message}`,
      };
    }
  }

  // 下载更新
  async downloadUpdate() {
    if (!this.isUpdateAvailable) {
      return { success: false, message: '没有可用的更新' };
    }

    if (this.isDownloadingUpdate) {
      return { success: false, message: '正在下载更新中' };
    }

    try {
      console.log('[AUTO-UPDATER] 开始下载更新...');
      this.isDownloadingUpdate = true;

      await autoUpdater.downloadUpdate();

      return {
        success: true,
        message: '更新下载已开始',
      };
    } catch (error) {
      console.error('[AUTO-UPDATER] 下载更新失败:', error);
      this.isDownloadingUpdate = false;
      return {
        success: false,
        message: `下载更新失败: ${error.message}`,
      };
    }
  }

  // 安装更新
  installUpdate() {
    if (!this.updateInfo) {
      console.warn('[AUTO-UPDATER] 没有可安装的更新');
      return;
    }

    try {
      console.log('[AUTO-UPDATER] 开始安装更新并重启应用...');

      // 保存当前状态
      this.saveConfig();

      // 通知渲染进程准备重启
      this.sendToRenderer('update-installing');

      // 延迟安装，给用户时间看到通知
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true);
      }, 2000);
    } catch (error) {
      console.error('[AUTO-UPDATER] 安装更新失败:', error);
      this.sendToRenderer('update-error', {
        message: `安装更新失败: ${error.message}`,
      });
    }
  }

  // 获取更新状态
  getUpdateStatus() {
    return {
      currentVersion: this.currentVersion,
      isCheckingForUpdate: this.isCheckingForUpdate,
      isDownloadingUpdate: this.isDownloadingUpdate,
      isUpdateAvailable: this.isUpdateAvailable,
      updateInfo: this.updateInfo,
      lastCheckTime: this.lastCheckTime,
      config: this.config,
    };
  }

  // 更新配置
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();

    // 应用新配置
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.allowPrerelease = this.config.allowPrerelease;

    // 重新设置定时检查
    this.setupPeriodicCheck();

    console.log('[AUTO-UPDATER] 配置已更新:', this.config);
  }

  // 显示更新通知
  showUpdateNotification(info) {
    const options = {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，当前版本 ${this.currentVersion}`,
      detail: info.releaseNotes || '点击查看更新详情',
      buttons: ['立即下载', '稍后提醒', '查看详情'],
      defaultId: 0,
      cancelId: 1,
    };

    if (this.mainWindow) {
      dialog.showMessageBox(this.mainWindow, options).then((result) => {
        if (result.response === 0) {
          // 立即下载
          this.downloadUpdate();
        } else if (result.response === 2) {
          // 查看详情
          this.sendToRenderer('show-update-details', info);
        }
      });
    }
  }

  // 显示安装确认对话框
  showInstallConfirmation(info) {
    const options = {
      type: 'question',
      title: '更新下载完成',
      message: `新版本 ${info.version} 已下载完成`,
      detail: '是否立即安装并重启应用？您也可以稍后手动安装。',
      buttons: ['立即安装', '稍后安装'],
      defaultId: 0,
      cancelId: 1,
    };

    if (this.mainWindow) {
      dialog.showMessageBox(this.mainWindow, options).then((result) => {
        if (result.response === 0) {
          this.installUpdate();
        }
      });
    }
  }

  // 设置定期检查
  setupPeriodicCheck() {
    // 清除现有的定时器
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.config.autoCheckInterval > 0) {
      const intervalMs = this.config.autoCheckInterval * 60 * 60 * 1000; // 转换为毫秒

      this.checkInterval = setInterval(() => {
        console.log('[AUTO-UPDATER] 定时检查更新...');
        this.checkForUpdates();
      }, intervalMs);

      console.log(
        `[AUTO-UPDATER] 已设置定时检查，间隔: ${this.config.autoCheckInterval}小时`
      );
    }
  }

  // 启动时检查更新
  checkOnStartup() {
    if (this.config.checkOnStartup) {
      // 延迟检查，等待应用完全加载
      setTimeout(() => {
        console.log('[AUTO-UPDATER] 启动时检查更新...');
        this.checkForUpdates();
      }, 5000); // 5秒后检查
    }
  }

  // 初始化自动更新功能
  initialize() {
    console.log('[AUTO-UPDATER] 初始化自动更新功能...');

    // 设置定期检查
    this.setupPeriodicCheck();

    // 启动时检查
    this.checkOnStartup();

    console.log('[AUTO-UPDATER] 自动更新功能已启动');
  }

  // 比较版本
  compareVersions(version1, version2) {
    try {
      return semver.compare(version1, version2);
    } catch (error) {
      console.error('[AUTO-UPDATER] 版本比较失败:', error);
      return 0;
    }
  }

  // 是否为新版本
  isNewerVersion(version) {
    return this.compareVersions(version, this.currentVersion) > 0;
  }

  // 获取更新日志
  getReleaseNotes(info) {
    if (typeof info.releaseNotes === 'string') {
      return info.releaseNotes;
    } else if (Array.isArray(info.releaseNotes)) {
      return info.releaseNotes.map((note) => note.note || note).join('\n');
    }
    return '暂无更新说明';
  }

  // 清理更新缓存
  clearUpdateCache() {
    try {
      const updateCachePath = path.join(
        app.getPath('userData'),
        'pending-update'
      );
      if (fs.existsSync(updateCachePath)) {
        fs.rmSync(updateCachePath, { recursive: true, force: true });
        console.log('[AUTO-UPDATER] 更新缓存已清理');
      }
    } catch (error) {
      console.error('[AUTO-UPDATER] 清理更新缓存失败:', error);
    }
  }

  // 获取更新历史
  getUpdateHistory() {
    try {
      const historyPath = path.join(
        app.getPath('userData'),
        'update-history.json'
      );
      if (fs.existsSync(historyPath)) {
        return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
      return [];
    } catch (error) {
      console.error('[AUTO-UPDATER] 读取更新历史失败:', error);
      return [];
    }
  }

  // 记录更新历史
  recordUpdateHistory(info) {
    try {
      const history = this.getUpdateHistory();
      const record = {
        version: info.version,
        date: new Date().toISOString(),
        releaseDate: info.releaseDate,
        size: info.files?.[0]?.size || 0,
        releaseNotes: this.getReleaseNotes(info),
      };

      history.unshift(record);

      // 只保留最近50条记录
      if (history.length > 50) {
        history.splice(50);
      }

      const historyPath = path.join(
        app.getPath('userData'),
        'update-history.json'
      );
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

      console.log('[AUTO-UPDATER] 更新历史已记录');
    } catch (error) {
      console.error('[AUTO-UPDATER] 记录更新历史失败:', error);
    }
  }

  // 销毁管理器
  destroy() {
    console.log('[AUTO-UPDATER] 销毁自动更新管理器...');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // 移除所有事件监听器
    autoUpdater.removeAllListeners();

    // 保存配置
    this.saveConfig();

    console.log('[AUTO-UPDATER] 自动更新管理器已销毁');
  }
}

// 导出单例
let autoUpdaterManager = null;

function getAutoUpdaterManager() {
  if (!autoUpdaterManager) {
    autoUpdaterManager = new AutoUpdaterManager();
  }
  return autoUpdaterManager;
}

module.exports = {
  AutoUpdaterManager,
  getAutoUpdaterManager,
};

console.log('[AUTO-UPDATER] 自动更新管理器模块加载完成');
