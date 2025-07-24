// 自动更新用户界面管理器
// 负责处理更新相关的用户界面交互和状态显示

console.log('[AUTO-UPDATER-UI] 自动更新UI管理器开始加载...');

class AutoUpdaterUI {
  constructor() {
    this.isInitialized = false;
    this.currentUpdateInfo = null;
    this.downloadProgress = null;
    this.updateStatus = 'idle'; // idle, checking, available, downloading, downloaded, installing, error

    // UI元素引用
    this.elements = {
      updateButton: null,
      updateStatus: null,
      updateModal: null,
      progressBar: null,
      versionInfo: null,
      releaseNotes: null,
    };

    this.config = {
      autoCheckInterval: 4,
      autoDownload: true,
      silentInstall: false,
      checkOnStartup: true,
      allowPrerelease: false,
    };

    console.log('[AUTO-UPDATER-UI] UI管理器初始化完成');
  }

  // 初始化UI
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('[AUTO-UPDATER-UI] 初始化自动更新UI...');

      // 创建UI元素
      this.createUpdateUI();

      // 加载配置
      await this.loadConfig();

      // 设置事件监听器
      this.setupEventListeners();

      // 获取当前状态
      await this.refreshStatus();

      this.isInitialized = true;
      console.log('[AUTO-UPDATER-UI] 自动更新UI初始化完成');
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 初始化失败:', error);
    }
  }

  // 创建更新UI元素
  createUpdateUI() {
    // 在设置页面添加更新区域
    let settingsContainer =
      document.querySelector('.settings-section') ||
      document.querySelector('.config-section') ||
      document.body;

    if (!settingsContainer) {
      console.warn('[AUTO-UPDATER-UI] 未找到设置容器，创建独立容器');
      const container = document.createElement('div');
      container.className = 'settings-section';
      document.body.appendChild(container);
      settingsContainer = container;
    }

    // 创建更新设置区域
    const updateSection = document.createElement('div');
    updateSection.className = 'update-section';
    updateSection.innerHTML = `
      <div class="section-header">
        <h3>🔄 应用更新</h3>
        <div class="update-status-indicator" id="updateStatusIndicator">
          <span class="status-dot"></span>
          <span class="status-text" id="updateStatusText">就绪</span>
        </div>
      </div>
      
      <div class="update-content">
        <div class="version-info">
          <div class="current-version">
            <span class="label">当前版本:</span>
            <span class="value" id="currentVersion">加载中...</span>
          </div>
          <div class="latest-version" id="latestVersionInfo" style="display: none;">
            <span class="label">最新版本:</span>
            <span class="value" id="latestVersion">-</span>
          </div>
          <div class="last-check-time">
            <span class="label">上次检查:</span>
            <span class="value" id="lastCheckTime">从未检查</span>
          </div>
        </div>
        
        <div class="update-controls">
          <button class="btn btn-primary" id="checkUpdateBtn">
            <span class="btn-icon">🔍</span>
            <span class="btn-text">检查更新</span>
          </button>
          <button class="btn btn-success" id="downloadUpdateBtn" style="display: none;">
            <span class="btn-icon">⬇️</span>
            <span class="btn-text">下载更新</span>
          </button>
          <button class="btn btn-warning" id="installUpdateBtn" style="display: none;">
            <span class="btn-icon">🚀</span>
            <span class="btn-text">安装更新</span>
          </button>
        </div>
        
        <div class="update-progress" id="updateProgress" style="display: none;">
          <div class="progress-info">
            <span class="progress-text" id="progressText">准备中...</span>
            <span class="progress-percent" id="progressPercent">0%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" id="progressBar">
              <div class="progress-fill" id="progressFill"></div>
            </div>
          </div>
          <div class="progress-details">
            <span class="progress-speed" id="progressSpeed">-</span>
            <span class="progress-size" id="progressSize">-</span>
          </div>
        </div>
        
        <div class="update-settings">
          <h4>更新设置</h4>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="autoCheckUpdates" checked>
              启用自动检查更新
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="autoDownloadUpdates" checked>
              自动下载更新
            </label>
          </div>
          <div class="setting-item">
            <label>
              检查间隔:
              <select id="checkInterval">
                <option value="1">1小时</option>
                <option value="4" selected>4小时</option>
                <option value="12">12小时</option>
                <option value="24">24小时</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    `;

    // 添加样式
    this.addUpdateStyles();

    // 插入到设置容器
    settingsContainer.appendChild(updateSection);

    // 保存元素引用
    this.elements = {
      updateButton: document.getElementById('checkUpdateBtn'),
      downloadButton: document.getElementById('downloadUpdateBtn'),
      installButton: document.getElementById('installUpdateBtn'),
      updateStatus: document.getElementById('updateStatusText'),
      statusIndicator: document.getElementById('updateStatusIndicator'),
      progressContainer: document.getElementById('updateProgress'),
      progressBar: document.getElementById('progressFill'),
      progressText: document.getElementById('progressText'),
      progressPercent: document.getElementById('progressPercent'),
      progressSpeed: document.getElementById('progressSpeed'),
      progressSize: document.getElementById('progressSize'),
      currentVersion: document.getElementById('currentVersion'),
      latestVersion: document.getElementById('latestVersion'),
      latestVersionInfo: document.getElementById('latestVersionInfo'),
      lastCheckTime: document.getElementById('lastCheckTime'),
      autoCheckUpdates: document.getElementById('autoCheckUpdates'),
      autoDownloadUpdates: document.getElementById('autoDownloadUpdates'),
      checkInterval: document.getElementById('checkInterval'),
    };
  }

  // 添加样式
  addUpdateStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .update-section {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
        border: 1px solid #e9ecef;
      }
      
      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e9ecef;
      }
      
      .section-header h3 {
        margin: 0;
        color: #495057;
        font-size: 18px;
      }
      
      .update-status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 12px;
        border-radius: 15px;
        background: #ffffff;
        border: 1px solid #dee2e6;
      }
      
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6c757d;
      }
      
      .status-dot.checking { background: #ffc107; animation: pulse 1s infinite; }
      .status-dot.available { background: #28a745; }
      .status-dot.downloading { background: #007bff; animation: pulse 1s infinite; }
      .status-dot.ready { background: #17a2b8; }
      .status-dot.error { background: #dc3545; }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      .status-text {
        font-size: 12px;
        font-weight: 500;
        color: #495057;
      }
      
      .version-info {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
        padding: 15px;
        background: #ffffff;
        border-radius: 6px;
        border: 1px solid #dee2e6;
      }
      
      .version-info .label {
        font-weight: 600;
        color: #6c757d;
        margin-right: 8px;
      }
      
      .version-info .value {
        color: #495057;
        font-family: 'Consolas', monospace;
      }
      
      .update-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
      }
      
      .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .btn-primary {
        background: #007bff;
        color: white;
      }
      
      .btn-primary:hover:not(:disabled) {
        background: #0056b3;
        transform: translateY(-1px);
      }
      
      .btn-success {
        background: #28a745;
        color: white;
      }
      
      .btn-success:hover:not(:disabled) {
        background: #1e7e34;
        transform: translateY(-1px);
      }
      
      .btn-warning {
        background: #ffc107;
        color: #212529;
      }
      
      .btn-warning:hover:not(:disabled) {
        background: #e0a800;
        transform: translateY(-1px);
      }
      
      .update-progress {
        background: #ffffff;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 20px;
      }
      
      .progress-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      
      .progress-text {
        font-weight: 500;
        color: #495057;
      }
      
      .progress-percent {
        font-weight: 600;
        color: #007bff;
        font-family: 'Consolas', monospace;
      }
      
      .progress-bar-container {
        margin-bottom: 10px;
      }
      
      .progress-bar {
        width: 100%;
        height: 8px;
        background: #e9ecef;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #007bff, #0056b3);
        width: 0%;
        transition: width 0.3s ease;
        border-radius: 4px;
      }
      
      .progress-details {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #6c757d;
      }
      
      .update-settings {
        background: #ffffff;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 15px;
      }
      
      .update-settings h4 {
        margin: 0 0 15px 0;
        color: #495057;
        font-size: 16px;
      }
      
      .setting-item {
        margin-bottom: 10px;
      }
      
      .setting-item:last-child {
        margin-bottom: 0;
      }
      
      .setting-item label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        color: #495057;
        font-size: 14px;
      }
      
      .setting-item input[type="checkbox"] {
        margin: 0;
      }
      
      .setting-item select {
        padding: 4px 8px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        background: white;
        color: #495057;
      }
    `;
    document.head.appendChild(style);
  }

  // 设置事件监听器
  setupEventListeners() {
    // 按钮事件
    if (this.elements.updateButton) {
      this.elements.updateButton.addEventListener('click', () =>
        this.checkForUpdates()
      );
    }

    if (this.elements.downloadButton) {
      this.elements.downloadButton.addEventListener('click', () =>
        this.downloadUpdate()
      );
    }

    if (this.elements.installButton) {
      this.elements.installButton.addEventListener('click', () =>
        this.installUpdate()
      );
    }

    // 设置变更事件
    if (this.elements.autoCheckUpdates) {
      this.elements.autoCheckUpdates.addEventListener('change', () =>
        this.saveConfig()
      );
    }

    if (this.elements.autoDownloadUpdates) {
      this.elements.autoDownloadUpdates.addEventListener('change', () =>
        this.saveConfig()
      );
    }

    if (this.elements.checkInterval) {
      this.elements.checkInterval.addEventListener('change', () =>
        this.saveConfig()
      );
    }

    // 自动更新事件监听
    if (typeof window.electronAPI !== 'undefined') {
      window.electronAPI.onUpdateChecking(() => {
        this.updateStatus = 'checking';
        this.updateUI();
      });

      window.electronAPI.onUpdateAvailable((info) => {
        this.currentUpdateInfo = info;
        this.updateStatus = 'available';
        this.updateUI();
      });

      window.electronAPI.onUpdateNotAvailable(() => {
        this.updateStatus = 'idle';
        this.updateUI();
        this.showMessage('当前已是最新版本', 'success');
      });

      window.electronAPI.onUpdateError((error) => {
        this.updateStatus = 'error';
        this.updateUI();
        this.showMessage(`更新错误: ${error.message}`, 'error');
      });

      window.electronAPI.onUpdateDownloadProgress((progress) => {
        this.downloadProgress = progress;
        this.updateStatus = 'downloading';
        this.updateUI();
      });

      window.electronAPI.onUpdateDownloaded((info) => {
        this.updateStatus = 'downloaded';
        this.updateUI();
        this.showMessage('更新下载完成，可以安装了', 'success');
      });

      window.electronAPI.onUpdateInstalling(() => {
        this.updateStatus = 'installing';
        this.updateUI();
        this.showMessage('正在安装更新，应用将重启...', 'info');
      });

      window.electronAPI.onShowUpdateDetails((info) => {
        this.showUpdateDetails(info);
      });
    }
  }

  // 加载配置
  async loadConfig() {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        const config = await window.electronAPI.getUpdateConfig();
        this.config = { ...this.config, ...config };
        this.applyConfigToUI();
      }
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 加载配置失败:', error);
    }
  }

  // 保存配置
  async saveConfig() {
    try {
      if (this.elements.autoCheckUpdates) {
        this.config.checkOnStartup = this.elements.autoCheckUpdates.checked;
        this.config.autoCheckInterval = this.elements.autoCheckUpdates.checked
          ? parseInt(this.elements.checkInterval.value)
          : 0;
      }

      if (this.elements.autoDownloadUpdates) {
        this.config.autoDownload = this.elements.autoDownloadUpdates.checked;
      }

      if (typeof window.electronAPI !== 'undefined') {
        await window.electronAPI.updateConfig(this.config);
      }

      console.log('[AUTO-UPDATER-UI] 配置已保存:', this.config);
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 保存配置失败:', error);
    }
  }

  // 应用配置到UI
  applyConfigToUI() {
    if (this.elements.autoCheckUpdates) {
      this.elements.autoCheckUpdates.checked = this.config.checkOnStartup;
    }

    if (this.elements.autoDownloadUpdates) {
      this.elements.autoDownloadUpdates.checked = this.config.autoDownload;
    }

    if (this.elements.checkInterval) {
      this.elements.checkInterval.value =
        this.config.autoCheckInterval.toString();
    }
  }

  // 刷新状态
  async refreshStatus() {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        const versionInfo = await window.electronAPI.getVersionInfo();
        const updateStatus = await window.electronAPI.getUpdateStatus();

        // 更新版本信息
        if (this.elements.currentVersion) {
          this.elements.currentVersion.textContent = versionInfo.currentVersion;
        }

        if (versionInfo.latestVersion && this.elements.latestVersion) {
          this.elements.latestVersion.textContent = versionInfo.latestVersion;
          this.elements.latestVersionInfo.style.display = 'block';
        }

        if (versionInfo.lastCheckTime && this.elements.lastCheckTime) {
          const lastCheck = new Date(versionInfo.lastCheckTime);
          this.elements.lastCheckTime.textContent = lastCheck.toLocaleString();
        }

        // 更新状态
        this.currentUpdateInfo = updateStatus.updateInfo;
        if (updateStatus.isUpdateAvailable) {
          this.updateStatus = 'available';
        } else if (updateStatus.isCheckingForUpdate) {
          this.updateStatus = 'checking';
        } else if (updateStatus.isDownloadingUpdate) {
          this.updateStatus = 'downloading';
        }

        this.updateUI();
      }
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 刷新状态失败:', error);
    }
  }

  // 检查更新
  async checkForUpdates() {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        this.updateStatus = 'checking';
        this.updateUI();

        const result = await window.electronAPI.checkForUpdates();

        if (!result.success) {
          this.updateStatus = 'error';
          this.showMessage(`检查更新失败: ${result.message}`, 'error');
        }

        // 状态会通过事件监听器更新
      }
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 检查更新失败:', error);
      this.updateStatus = 'error';
      this.updateUI();
      this.showMessage(`检查更新异常: ${error.message}`, 'error');
    }
  }

  // 下载更新
  async downloadUpdate() {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        const result = await window.electronAPI.downloadUpdate();

        if (!result.success) {
          this.showMessage(`下载更新失败: ${result.message}`, 'error');
        }

        // 下载进度会通过事件监听器更新
      }
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 下载更新失败:', error);
      this.showMessage(`下载更新异常: ${error.message}`, 'error');
    }
  }

  // 安装更新
  async installUpdate() {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        // 确认安装
        const confirmed = confirm(
          '确定要安装更新并重启应用吗？\n\n请确保已保存所有重要数据。'
        );
        if (!confirmed) return;

        await window.electronAPI.installUpdate();
      }
    } catch (error) {
      console.error('[AUTO-UPDATER-UI] 安装更新失败:', error);
      this.showMessage(`安装更新异常: ${error.message}`, 'error');
    }
  }

  // 更新UI状态
  updateUI() {
    // 更新状态指示器
    if (this.elements.statusIndicator && this.elements.updateStatus) {
      const dot = this.elements.statusIndicator.querySelector('.status-dot');

      // 清除所有状态类
      dot.className = 'status-dot';

      switch (this.updateStatus) {
        case 'checking':
          dot.classList.add('checking');
          this.elements.updateStatus.textContent = '检查中...';
          break;
        case 'available':
          dot.classList.add('available');
          this.elements.updateStatus.textContent = '有更新可用';
          break;
        case 'downloading':
          dot.classList.add('downloading');
          this.elements.updateStatus.textContent = '下载中...';
          break;
        case 'downloaded':
          dot.classList.add('ready');
          this.elements.updateStatus.textContent = '更新已就绪';
          break;
        case 'installing':
          dot.classList.add('downloading');
          this.elements.updateStatus.textContent = '安装中...';
          break;
        case 'error':
          dot.classList.add('error');
          this.elements.updateStatus.textContent = '检查失败';
          break;
        default:
          this.elements.updateStatus.textContent = '就绪';
      }
    }

    // 更新按钮状态
    if (this.elements.updateButton) {
      this.elements.updateButton.disabled = this.updateStatus === 'checking';
      if (this.updateStatus === 'checking') {
        this.elements.updateButton.querySelector('.btn-text').textContent =
          '检查中...';
      } else {
        this.elements.updateButton.querySelector('.btn-text').textContent =
          '检查更新';
      }
    }

    // 显示/隐藏下载按钮
    if (this.elements.downloadButton) {
      this.elements.downloadButton.style.display =
        this.updateStatus === 'available' ? 'inline-flex' : 'none';
      this.elements.downloadButton.disabled =
        this.updateStatus === 'downloading';
    }

    // 显示/隐藏安装按钮
    if (this.elements.installButton) {
      this.elements.installButton.style.display =
        this.updateStatus === 'downloaded' ? 'inline-flex' : 'none';
    }

    // 更新进度条
    if (this.elements.progressContainer) {
      const showProgress =
        this.updateStatus === 'downloading' ||
        this.updateStatus === 'installing';
      this.elements.progressContainer.style.display = showProgress
        ? 'block'
        : 'none';

      if (showProgress && this.downloadProgress) {
        this.updateProgress(this.downloadProgress);
      }
    }
  }

  // 更新下载进度
  updateProgress(progress) {
    if (!this.elements.progressBar) return;

    const percent = Math.round(progress.percent || 0);
    this.elements.progressBar.style.width = `${percent}%`;

    if (this.elements.progressPercent) {
      this.elements.progressPercent.textContent = `${percent}%`;
    }

    if (this.elements.progressText) {
      this.elements.progressText.textContent = '正在下载更新...';
    }

    if (this.elements.progressSpeed && progress.bytesPerSecond) {
      const speed = this.formatBytes(progress.bytesPerSecond);
      this.elements.progressSpeed.textContent = `${speed}/s`;
    }

    if (this.elements.progressSize && progress.total) {
      const downloaded = this.formatBytes(progress.transferred || 0);
      const total = this.formatBytes(progress.total);
      this.elements.progressSize.textContent = `${downloaded} / ${total}`;
    }
  }

  // 显示更新详情
  showUpdateDetails(info) {
    const details = `
版本: ${info.version}
发布时间: ${new Date(info.releaseDate).toLocaleString()}
文件大小: ${this.formatBytes(info.files?.[0]?.size || 0)}

更新说明:
${info.releaseNotes || '暂无更新说明'}
    `.trim();

    alert(`更新详情\n\n${details}`);
  }

  // 显示消息
  showMessage(message, type = 'info') {
    console.log(`[AUTO-UPDATER-UI] ${type.toUpperCase()}: ${message}`);

    // 如果页面有通知系统，使用它
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, type);
    } else {
      // 简单的alert提示
      if (type === 'error') {
        alert(`错误: ${message}`);
      } else if (type === 'success') {
        console.log(`成功: ${message}`);
      }
    }
  }

  // 格式化字节大小
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 销毁UI
  destroy() {
    console.log('[AUTO-UPDATER-UI] 销毁自动更新UI...');

    // 移除事件监听器
    if (typeof window.electronAPI !== 'undefined') {
      window.electronAPI.removeAllUpdateListeners();
    }

    // 移除UI元素
    const updateSection = document.querySelector('.update-section');
    if (updateSection) {
      updateSection.remove();
    }

    this.isInitialized = false;
    console.log('[AUTO-UPDATER-UI] 自动更新UI已销毁');
  }
}

// 创建全局实例
let autoUpdaterUI = null;

// 初始化自动更新UI
function initAutoUpdaterUI() {
  if (!autoUpdaterUI) {
    autoUpdaterUI = new AutoUpdaterUI();
  }
  return autoUpdaterUI;
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.AutoUpdaterUI = AutoUpdaterUI;
  window.initAutoUpdaterUI = initAutoUpdaterUI;
  window.autoUpdaterUI = autoUpdaterUI;
}

console.log('[AUTO-UPDATER-UI] 自动更新UI管理器加载完成');
