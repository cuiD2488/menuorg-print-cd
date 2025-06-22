class OrderPrintApp {
  constructor() {
    this.currentUser = null;
    this.orders = [];
    this.wsClient = null;
    this.printerManager = new PrinterManager();
    this.isInitialized = false;
    this.todayOrderCount = 0;

    // 添加已打印订单记录和WebSocket状态跟踪
    this.printedOrderIds = new Set(); // 记录已打印的订单ID
    this.lastWebSocketConnectTime = null; // 记录最后连接时间
    this.lastOrderCheckTime = null; // 记录最后检查订单的时间

    this.init();
  }

  async init() {
    console.log('[APP] Starting application initialization...');

    await this.printerManager.init();
    this.bindEvents();
    await this.initUI();
    await this.loadPrintedOrdersRecord(); // 加载已打印订单记录
    await this.checkAutoLogin();

    console.log('[APP] Application initialization completed');
  }

  async initUI() {
    await this.updatePrinterSelect();
    await this.loadUIConfig();
    // 🍽️ 加载分菜打印配置
    this.loadDishPrintConfig();
  }

  async updatePrinterSelect() {
    const printers = this.printerManager.getAllPrinters();
    const container = document.getElementById('printerList');
    const selectedPrinters = this.printerManager.getSelectedPrinters();

    // 添加引擎状态调试信息
    try {
      const engineStatus = await window.electronAPI.getEngineStatus();
      console.log('🔧 [调试] 打印引擎状态:', engineStatus);

      // 在控制台显示详细状态
      if (engineStatus.error) {
        console.error('❌ [调试] 引擎错误:', engineStatus.error);
      } else {
        console.log(`🚀 [调试] 当前引擎: ${engineStatus.currentEngine}`);
        console.log(`🦀 [调试] Rust 可用: ${engineStatus.rustAvailable}`);
        console.log(
          `📦 [调试] Node.js 回退: ${engineStatus.fallbackAvailable}`
        );
      }
    } catch (error) {
      console.error('❌ [调试] 获取引擎状态失败:', error);
    }

    if (printers.length === 0) {
      container.innerHTML = `
        <div class="no-printers">
          <div class="icon">🖨️</div>
          <div>未发现可用打印机</div>
          <div style="font-size: 11px; margin-top: 4px;">请检查打印机连接并点击刷新</div>
        </div>
      `;
    } else {
      container.innerHTML = '';

      printers.forEach((printer) => {
        const isSelected = selectedPrinters.includes(printer.name);
        const printerItem = document.createElement('div');
        printerItem.className = `printer-item ${isSelected ? 'selected' : ''}`;

        printerItem.innerHTML = `
          <div class="printer-checkbox">
            <input type="checkbox"
                   data-printer="${printer.name}"
                   ${isSelected ? 'checked' : ''}>
          </div>
          <div class="printer-info">
            <div class="printer-name">${printer.name}</div>
            <div class="printer-details">
              <span class="printer-detail-item width">${printer.width}mm</span>
              ${
                printer.isThermal
                  ? '<span class="printer-detail-item thermal">热敏</span>'
                  : ''
              }
              ${
                printer.isDefault
                  ? '<span class="printer-detail-item default">默认</span>'
                  : ''
              }
              <span class="printer-detail-item">字体: ${this.getFontSizeText(
                printer.fontSize
              )}</span>
            </div>
          </div>
          <div class="printer-status">
            <span class="printer-status-dot ${this.getPrinterStatusClass(
              printer
            )}"></span>
            <span class="printer-status-text">${
              isSelected ? '已选择' : printer.status
            }</span>
          </div>
        `;

        // 添加复选框事件监听
        const checkbox = printerItem.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
          this.handlePrinterToggle(e.target.dataset.printer, e.target.checked);
        });

        container.appendChild(printerItem);
      });
    }

    this.updatePrinterSelectionSummary();
    this.updatePrinterStatus();

    // 🍽️ 如果分菜模式已启用，更新打印机编号配置界面
    const isEnabled = document.getElementById(
      'enableSeparatePrinting'
    )?.checked;
    if (isEnabled) {
      this.renderPrinterNumberConfig();
    }
  }

  handlePrinterToggle(printerName, isChecked) {
    console.log('[APP] 切换打印机选择:', printerName, isChecked);

    let selectedPrinters = this.printerManager.getSelectedPrinters();

    if (isChecked) {
      if (!selectedPrinters.includes(printerName)) {
        selectedPrinters.push(printerName);
      }
    } else {
      selectedPrinters = selectedPrinters.filter(
        (name) => name !== printerName
      );
    }

    this.printerManager.setSelectedPrinters(selectedPrinters);
    this.updatePrinterSelect(); // 重新渲染列表
  }

  updatePrinterSelectionSummary() {
    const selectedPrinters = this.printerManager.getSelectedPrinters();
    const totalPrinters = this.printerManager.getAllPrinters().length;

    // 检查是否已有摘要容器，如果没有则创建
    let summaryContainer = document.querySelector('.printer-selection-summary');
    if (!summaryContainer) {
      summaryContainer = document.createElement('div');
      summaryContainer.className = 'printer-selection-summary';
      const printerList = document.getElementById('printerList');
      printerList.parentNode.insertBefore(summaryContainer, printerList);
    }

    if (selectedPrinters.length === 0) {
      summaryContainer.innerHTML = `
        <div class="summary-title">打印机选择</div>
        <div class="summary-content">
          尚未选择任何打印机，新订单将无法自动打印
        </div>
      `;
    } else {
      const selectedNames =
        selectedPrinters.length > 2
          ? `${selectedPrinters.slice(0, 2).join(', ')} 等${
              selectedPrinters.length
            }台`
          : selectedPrinters.join(', ');

      summaryContainer.innerHTML = `
        <div class="summary-title">已选择 <span class="summary-count">${selectedPrinters.length}</span>/${totalPrinters} 台打印机</div>
        <div class="summary-content">${selectedNames}</div>
      `;
    }
  }

  getPrinterStatusClass(printer) {
    if (this.printerManager.getSelectedPrinters().includes(printer.name)) {
      return 'enabled';
    }
    if (printer.status === 'Ready') {
      return 'ready';
    }
    return 'error';
  }

  getFontSizeText(fontSize) {
    switch (fontSize) {
      case 0:
        return '小';
      case 1:
        return '中';
      case 2:
        return '大';
      default:
        return '小';
    }
  }

  handlePrinterSelection(e) {
    // 这个方法现在由新的复选框处理逻辑替代，保留以防兼容性问题
    console.log('[APP] 旧版打印机选择方法被调用，这不应该发生');
  }

  async loadUIConfig() {
    try {
      const config = await window.electronAPI.getConfig();
      if (config.autoPrint !== undefined) {
        document.getElementById('autoPrint').checked = config.autoPrint;
      }
    } catch (error) {
      console.error('加载UI配置失败:', error);
    }
  }

  bindEvents() {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      this.handleLogout();
    });

    document.getElementById('refreshPrinters').addEventListener('click', () => {
      this.handleRefreshPrinters();
    });

    document
      .getElementById('selectAllPrinters')
      .addEventListener('click', () => {
        this.handleSelectAllPrinters();
      });

    document
      .getElementById('clearAllPrinters')
      .addEventListener('click', () => {
        this.handleClearAllPrinters();
      });

    document.getElementById('testPrint').addEventListener('click', () => {
      this.handleTestPrint();
    });

    // 旧的 printerSelect 已被新的复选框列表替代

    document.getElementById('autoPrint').addEventListener('change', () => {
      this.saveUIConfig();
    });

    // 🍽️ 新增：分菜打印配置事件监听器
    document
      .getElementById('enableSeparatePrinting')
      .addEventListener('change', (e) => {
        this.handleSeparatePrintingToggle(e.target.checked);
      });

    document
      .getElementById('showDishPrintHelp')
      .addEventListener('click', () => {
        this.showDishPrintHelp();
      });

    document
      .getElementById('saveDishPrintConfig')
      .addEventListener('click', () => {
        this.saveDishPrintConfig();
      });

    document
      .getElementById('resetDishPrintConfig')
      .addEventListener('click', () => {
        this.resetDishPrintConfig();
      });

    document.getElementById('testDishPrint').addEventListener('click', () => {
      this.testDishPrint();
    });

    // 帮助模态框关闭事件
    document
      .getElementById('closeDishPrintHelpBtn')
      .addEventListener('click', () => {
        this.hideDishPrintHelp();
      });

    // 模态框点击背景关闭
    document
      .getElementById('dishPrintHelpModal')
      .addEventListener('click', (e) => {
        if (e.target.id === 'dishPrintHelpModal') {
          this.hideDishPrintHelp();
        }
      });

    document.getElementById('refreshOrders').addEventListener('click', () => {
      this.loadRecentOrders();
    });

    document.getElementById('clearOrders').addEventListener('click', () => {
      this.clearOrders();
    });

    document
      .getElementById('testWebSocketBtn')
      .addEventListener('click', () => {
        this.testWebSocketConnection();
      });

    // 打印设置和预览按钮功能已移除
    // document
    //   .getElementById('printSettingsBtn')
    //   .addEventListener('click', () => {
    //     this.showPrintSettings();
    //   });

    // document.getElementById('printPreviewBtn').addEventListener('click', () => {
    //   this.showPrintPreview();
    // });

    // 中文编码测试功能已移除
    // document.getElementById('openTestPageBtn').addEventListener('click', () => {
    //   this.openChineseEncodingTestPage();
    // });

    // 打印设置模态框事件已移除
    // document
    //   .getElementById('savePrintSettings')
    //   .addEventListener('click', () => {
    //     this.savePrintSettings();
    //   });

    // document
    //   .getElementById('resetPrintSettings')
    //   .addEventListener('click', () => {
    //     this.resetPrintSettings();
    //   });

    // 打印预览模态框事件已移除
    // document
    //   .getElementById('printFromPreview')
    //   .addEventListener('click', () => {
    //     this.printFromPreview();
    //   });

    // document.getElementById('refreshPreview').addEventListener('click', () => {
    //   this.refreshPreview();
    // });

    // document.getElementById('closePreview').addEventListener('click', () => {
    //   this.hidePreview();
    // });

    document.querySelector('.close').addEventListener('click', () => {
      this.hideOrderModal();
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => {
      this.hideOrderModal();
    });

    document.getElementById('printOrderBtn').addEventListener('click', () => {
      this.printCurrentOrder();
    });
  }

  async checkAutoLogin() {
    console.log('[APP] Checking for saved login credentials...');

    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');
    const savedUsername = localStorage.getItem('savedUsername');
    const savedPassword = localStorage.getItem('savedPassword');

    // Load saved credentials if remember login is enabled
    if (savedUsername && savedPassword) {
      console.log('[APP] Loading saved credentials for user:', savedUsername);
      document.getElementById('username').value = savedUsername;
      document.getElementById('password').value = atob(savedPassword); // Decode from base64
      document.getElementById('rememberLogin').checked = true;
    }

    if (token && userId) {
      console.log(
        '[APP] Found saved auth token, attempting auto-login for user:',
        userId
      );
      this.currentUser = { token, user_id: userId };
      this.showMainSection();
      this.connectWebSocket();
      this.loadRecentOrders();
    } else {
      console.log('[APP] No saved auth token found, showing login form');
    }
  }

  async handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const rememberLogin = document.getElementById('rememberLogin').checked;

    console.log(
      '[APP] Login attempt for user:',
      username,
      'Remember login:',
      rememberLogin
    );

    if (!username || !password) {
      this.showLoginStatus('Please enter username and password', 'error');
      return;
    }

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    this.showLoginStatus('Attempting to login...', '');

    try {
      const result = await API.login(username, password);
      console.log('[APP] Login result:', result);

      if (result.success) {
        console.log('[APP] Login successful, saving user data');

        this.currentUser = result.data;

        // 存储所有必要的认证信息
        if (result.data.token) {
          localStorage.setItem('authToken', result.data.token);
        }
        if (result.data.user_id) {
          localStorage.setItem('userId', result.data.user_id);
        }
        if (result.data.rd_id) {
          localStorage.setItem('rdId', result.data.rd_id.toString());
        }

        // 调试信息：显示存储的数据
        console.log('[APP] Stored authentication data:', {
          token: localStorage.getItem('authToken'),
          userId: localStorage.getItem('userId'),
          rdId: localStorage.getItem('rdId'),
        });

        // Save credentials if remember login is checked
        if (rememberLogin) {
          console.log('[APP] Saving login credentials for future use');
          localStorage.setItem('savedUsername', username);
          localStorage.setItem('savedPassword', btoa(password)); // Encode to base64
        } else {
          console.log('[APP] Clearing saved login credentials');
          localStorage.removeItem('savedUsername');
          localStorage.removeItem('savedPassword');
        }

        this.showLoginStatus('Login successful!', 'success');

        setTimeout(() => {
          this.showMainSection();
          this.connectWebSocket();
          this.loadRecentOrders();
        }, 1000);
      } else {
        console.warn('[APP] Login failed:', result.message);
        this.showLoginStatus('Login failed: ' + result.message, 'error');
      }
    } catch (error) {
      console.error('[APP] Login error:', error);
      this.showLoginStatus(
        'Login failed, please check network connection',
        'error'
      );
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  }

  showLoginStatus(message, type) {
    const statusEl = document.getElementById('loginStatus');
    statusEl.textContent = message;
    statusEl.className = `login-status ${type}`;
    console.log(`[APP] Login status: ${type.toUpperCase()} - ${message}`);
  }

  handleLogout() {
    console.log('[APP] User logout initiated');

    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('rdId');
    this.currentUser = null;

    if (this.wsClient) {
      console.log('[APP] Disconnecting WebSocket...');
      this.wsClient.disconnect();
      this.wsClient = null;
    }

    this.showLoginSection();
    console.log('[APP] User logged out successfully');
  }

  showLoginSection() {
    console.log('[APP] Showing login section');
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('mainSection').classList.add('hidden');

    // Clear form but keep saved credentials if remember is checked
    const rememberLogin = document.getElementById('rememberLogin').checked;
    if (!rememberLogin) {
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
    }
    document.getElementById('loginStatus').textContent = '';
  }

  showMainSection() {
    console.log('[APP] Showing main section');
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainSection').classList.remove('hidden');

    if (this.currentUser) {
      document.getElementById(
        'userInfo'
      ).textContent = `User ID: ${this.currentUser.user_id}`;

      // 加载订单列表
      this.loadRecentOrders();
    }
  }

  async handleRefreshPrinters() {
    await this.printerManager.refreshPrinters();
    await this.updatePrinterSelect();
  }

  handleSelectAllPrinters() {
    console.log('[APP] 全选打印机');
    const allPrinters = this.printerManager.getAllPrinters();
    const allPrinterNames = allPrinters.map((p) => p.name);

    this.printerManager.setSelectedPrinters(allPrinterNames);
    this.updatePrinterSelect();

    this.showTrayNotification(`已选择所有 ${allPrinterNames.length} 台打印机`);
  }

  handleClearAllPrinters() {
    console.log('[APP] 清空打印机选择');

    if (this.printerManager.getSelectedPrinters().length === 0) {
      this.showTrayNotification('当前没有选择任何打印机');
      return;
    }

    this.printerManager.setSelectedPrinters([]);
    this.updatePrinterSelect();

    this.showTrayNotification('已清空所有打印机选择');
  }

  async handleTestPrint() {
    const selectedPrinters = this.printerManager.getSelectedPrinters();

    if (selectedPrinters.length === 0) {
      alert('请先选择至少一台打印机');
      return;
    }

    console.log('[APP] 开始测试打印，选中的打印机:', selectedPrinters);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // 显示加载状态
    const testButton = document.getElementById('testPrint');
    const originalText = testButton.textContent;
    testButton.textContent = '测试中...';
    testButton.disabled = true;

    try {
      // 并行向所有选中的打印机发送测试打印
      const printPromises = selectedPrinters.map(async (printerName) => {
        try {
          console.log(`[APP] 向打印机 ${printerName} 发送测试打印`);
          await this.printerManager.testPrint(printerName);
          successCount++;
          console.log(`[APP] 打印机 ${printerName} 测试成功`);
          return { printer: printerName, success: true };
        } catch (error) {
          errorCount++;
          const errorMsg = `${printerName}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[APP] 打印机 ${printerName} 测试失败:`, error);
          return { printer: printerName, success: false, error: error.message };
        }
      });

      const results = await Promise.all(printPromises);

      // 显示结果
      if (successCount > 0 && errorCount === 0) {
        this.showTrayNotification(`✅ 所有 ${successCount} 台打印机测试成功！`);
      } else if (successCount > 0 && errorCount > 0) {
        this.showTrayNotification(
          `⚠️ ${successCount} 台成功，${errorCount} 台失败`
        );
      } else {
        this.showTrayNotification(`❌ 所有打印机测试失败`);
      }

      // 在控制台显示详细结果
      console.log('[APP] 测试打印结果:', {
        总数: selectedPrinters.length,
        成功: successCount,
        失败: errorCount,
        详细结果: results,
      });

      if (errors.length > 0) {
        console.error('[APP] 测试打印错误详情:', errors);
      }
    } catch (error) {
      console.error('[APP] 测试打印过程出错:', error);
      this.showTrayNotification(`❌ 测试打印失败: ${error.message}`);
    } finally {
      // 恢复按钮状态
      testButton.textContent = originalText;
      testButton.disabled = false;
    }
  }

  updatePrinterStatus() {
    const statusEl = document.getElementById('printerStatus');
    const selectedPrinters = this.printerManager.getSelectedPrinters();
    const totalPrinters = this.printerManager.getAllPrinters().length;

    console.log(
      '[APP] 更新打印机状态，已选择:',
      selectedPrinters.length,
      '总计:',
      totalPrinters
    );

    if (selectedPrinters.length === 0) {
      statusEl.textContent = '未选择';
      statusEl.className = 'status-badge status-error';
    } else if (selectedPrinters.length === 1) {
      statusEl.textContent = `已选择 1 台`;
      statusEl.className = 'status-badge status-success';
    } else {
      statusEl.textContent = `已选择 ${selectedPrinters.length} 台`;
      statusEl.className = 'status-badge status-success';
    }

    // 可选：添加工具提示显示选中的打印机名称
    if (selectedPrinters.length > 0) {
      const printerNames =
        selectedPrinters.length > 3
          ? `${selectedPrinters.slice(0, 3).join(', ')} 等`
          : selectedPrinters.join(', ');
      statusEl.title = `选中的打印机: ${printerNames}`;
    } else {
      statusEl.title = '请选择要使用的打印机';
    }
  }

  async saveUIConfig() {
    const config = {
      selectedPrinters: this.printerManager.getSelectedPrinters(),
      autoPrint: document.getElementById('autoPrint').checked,
    };

    await window.electronAPI.saveConfig(config);
  }

  connectWebSocket() {
    if (!this.currentUser) {
      console.warn('[APP] Cannot connect WebSocket: no current user');
      return;
    }

    // Use the correct WebSocket URL format
    const wsUrl = `wss://message.menuorg.com/app/v1/web_socket/7/${this.currentUser.user_id}`;

    console.log('[APP] User ID:', this.currentUser.user_id);
    console.log('[APP] Connecting to WebSocket:', wsUrl);

    this.wsClient = new WebSocketClient(wsUrl);

    this.wsClient.on('connected', async () => {
      console.log('[APP] WebSocket connected successfully');
      document.getElementById('wsStatus').textContent = 'Connected';
      document.getElementById('wsStatus').className =
        'status-badge status-success';

      // 记录连接时间
      const currentTime = new Date();
      const wasReconnection = this.lastWebSocketConnectTime !== null;
      this.lastWebSocketConnectTime = currentTime;

      // 如果是重连（不是首次连接），检查错过的订单
      if (wasReconnection) {
        console.log('[APP] WebSocket重连成功，检查错过的订单...');
        await this.checkMissedOrdersAfterReconnect();
      } else {
        console.log('[APP] WebSocket首次连接成功');
        this.lastOrderCheckTime = currentTime;
      }
    });

    this.wsClient.on('disconnected', () => {
      console.log('[APP] WebSocket disconnected');
      document.getElementById('wsStatus').textContent = 'Disconnected';
      document.getElementById('wsStatus').className =
        'status-badge status-error';
    });

    this.wsClient.on('newOrder', (orderData) => {
      this.handleNewOrder(orderData);
    });

    this.wsClient.on('error', (error) => {
      console.error('[APP] WebSocket error:', error);
      document.getElementById('wsStatus').textContent = 'Error';
      document.getElementById('wsStatus').className =
        'status-badge status-error';
    });

    this.wsClient.connect();
  }

  async handleNewOrder(orderData) {
    console.log('[APP] WebSocket收到新订单通知:', orderData);

    // 显示系统通知
    await window.electronAPI.showNotification({
      title: '新订单',
      body: `订单号: ${orderData.order_id || orderData.id}`,
    });

    const orderId = orderData.order_id || orderData.id;
    if (!orderId) {
      console.error('[APP] WebSocket订单数据缺少订单ID');
      return;
    }

    console.log('[APP] WebSocket处理订单ID:', orderId);

    try {
      // 从API获取完整订单详情（与手动打印相同的逻辑）
      console.log('[APP] WebSocket正在获取订单详情...');
      const orderDetails = await API.getOrderById(orderId);

      if (!orderDetails.success || !orderDetails.data) {
        console.error('[APP] WebSocket获取订单详情失败:', orderDetails.message);
        this.showTrayNotification(
          `❌ 获取订单详情失败: ${orderDetails.message || '未知错误'}`
        );
        return;
      }

      console.log('[APP] WebSocket成功获取订单详情');
      const order = orderDetails.data;

      // 添加订单到列表
      this.addOrderToList(order);

      // 检查是否启用自动打印
      if (!document.getElementById('autoPrint').checked) {
        console.log('[APP] WebSocket自动打印未启用，跳过打印');
        return;
      }

      // 使用与手动打印完全相同的逻辑进行自动打印
      await this.executeAutoPrint(order);
    } catch (error) {
      console.error('[APP] WebSocket处理新订单失败:', error);
      this.showTrayNotification(`❌ 处理新订单失败: ${error.message}`);
    }
  }

  // 提取自动打印逻辑为独立方法，与手动打印使用相同的核心逻辑
  async executeAutoPrint(order) {
    const selectedPrinters = this.printerManager.getSelectedPrinters();

    if (selectedPrinters.length === 0) {
      console.warn('[APP] 自动打印失败: 未选择任何打印机');
      this.showTrayNotification('⚠️ 自动打印失败: 未选择打印机');
      return;
    }

    // 检查是否已经打印过这个订单
    if (this.printedOrderIds.has(order.order_id)) {
      console.log(`[APP] 订单 ${order.order_id} 已经打印过，跳过重复打印`);
      this.showTrayNotification(
        `ℹ️ 订单 ${order.order_id} 已打印过，跳过重复打印`
      );
      return;
    }

    try {
      console.log(
        `[APP] 开始自动打印订单 ${order.order_id} 到 ${selectedPrinters.length} 台打印机`
      );

      // 使用与手动打印完全相同的打印逻辑
      const printResult = await this.printerManager.printOrder(order);

      if (printResult.成功数量 > 0) {
        // 记录已打印的订单ID
        this.printedOrderIds.add(order.order_id);
        console.log(`[APP] 订单 ${order.order_id} 已记录为已打印`);
        this.savePrintedOrdersRecord(); // 保存到localStorage

        this.showTrayNotification(
          `✅ 订单 ${order.order_id} 已自动打印到 ${printResult.成功数量} 台打印机`
        );
      }

      if (printResult.失败数量 > 0) {
        console.warn('[APP] 自动打印部分失败:', printResult.错误列表);
        this.showTrayNotification(
          `⚠️ ${printResult.失败数量} 台打印机打印失败`
        );
      }

      console.log('[APP] 自动打印结果:', printResult);
    } catch (error) {
      console.error('[APP] 自动打印完全失败:', error);
      this.showTrayNotification(`❌ 自动打印失败: ${error.message}`);
    }
  }

  // 检查WebSocket重连后错过的订单
  async checkMissedOrdersAfterReconnect() {
    if (!this.currentUser || !document.getElementById('autoPrint').checked) {
      console.log('[APP] 跳过检查错过订单：用户未登录或自动打印未启用');
      return;
    }

    try {
      console.log('[APP] 开始检查WebSocket断开期间错过的订单...');

      // 获取最近的订单列表（增加数量以确保不遗漏）
      const response = await API.getOrderList(1, 20);

      if (!response.success || !response.data) {
        console.warn('[APP] 检查错过订单失败:', response.message);
        return;
      }

      const recentOrders = response.data;
      console.log(`[APP] 获取到 ${recentOrders.length} 个最近订单`);

      // 筛选出在断开期间创建的新订单
      const missedOrders = this.filterMissedOrders(recentOrders);

      if (missedOrders.length === 0) {
        console.log('[APP] 没有发现错过的订单');
        this.updateLastOrderCheckTime();
        return;
      }

      console.log(
        `[APP] 发现 ${missedOrders.length} 个错过的订单:`,
        missedOrders.map((o) => o.order_id)
      );

      // 显示通知
      this.showTrayNotification(
        `🔔 发现 ${missedOrders.length} 个错过的订单，准备自动打印...`
      );

      // 逐个处理错过的订单
      for (const order of missedOrders) {
        console.log(`[APP] 处理错过的订单: ${order.order_id}`);

        try {
          // 添加到订单列表（如果还没有）
          if (!this.orders.find((o) => o.order_id === order.order_id)) {
            this.addOrderToList(order);
          }

          // 执行自动打印
          await this.executeAutoPrint(order);

          // 添加延迟避免打印过快
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`[APP] 处理错过订单 ${order.order_id} 失败:`, error);
        }
      }

      console.log('[APP] 错过订单处理完成');
      this.updateLastOrderCheckTime();
    } catch (error) {
      console.error('[APP] 检查错过订单过程出错:', error);
    }
  }

  // 筛选出错过的订单
  filterMissedOrders(orders) {
    if (!this.lastOrderCheckTime) {
      // 如果没有记录最后检查时间，只处理最近5分钟的订单
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      this.lastOrderCheckTime = fiveMinutesAgo;
    }

    const missedOrders = [];

    for (const order of orders) {
      const orderTime = new Date(order.create_time || order.created_at);

      // 检查订单是否在断开期间创建
      if (orderTime > this.lastOrderCheckTime) {
        // 检查是否已经打印过
        if (!this.printedOrderIds.has(order.order_id)) {
          // 只处理待处理或已确认的订单
          if (order.order_status === 0 || order.order_status === 1) {
            missedOrders.push(order);
          }
        } else {
          console.log(`[APP] 订单 ${order.order_id} 已打印过，跳过`);
        }
      }
    }

    // 按时间排序，最早的订单先打印
    missedOrders.sort((a, b) => {
      const timeA = new Date(a.create_time || a.created_at);
      const timeB = new Date(b.create_time || b.created_at);
      return timeA - timeB;
    });

    return missedOrders;
  }

  // 更新最后检查订单的时间
  updateLastOrderCheckTime() {
    this.lastOrderCheckTime = new Date();
    console.log('[APP] 更新最后检查订单时间:', this.lastOrderCheckTime);
  }

  async loadRecentOrders() {
    try {
      console.log('[APP] Loading recent orders from API...');
      const response = await API.getOrderList(1, 10);

      console.log('[APP] API response:', response);

      if (response.success) {
        this.orders = response.data || [];
        console.log('[APP] Loaded orders:', this.orders.length);
        console.log('[APP] First order sample:', this.orders[0]);
        this.renderOrdersList();

        // 更新今日订单数量
        const today = new Date().toDateString();
        this.todayOrderCount = this.orders.filter((order) => {
          const orderDate = new Date(
            order.create_time || order.created_at
          ).toDateString();
          return orderDate === today;
        }).length;

        document.getElementById('todayOrderCount').textContent =
          this.todayOrderCount;
      } else {
        console.warn('[APP] Failed to load orders:', response.message);
        this.orders = [];
        this.renderOrdersList();
        // 显示错误提示
        this.showTrayNotification(`获取订单失败: ${response.message}`);
      }
    } catch (error) {
      console.error('[APP] Error loading orders:', error);
      this.orders = [];
      this.renderOrdersList();
      this.showTrayNotification(`获取订单失败: ${error.message}`);
    }
  }

  addOrderToList(order) {
    this.orders.unshift(order);
    if (this.orders.length > 10) {
      this.orders = this.orders.slice(0, 10);
    }
    this.renderOrdersList();
  }

  renderOrdersList() {
    const container = document.getElementById('ordersList');
    const countEl = document.getElementById('orderCount');

    console.log(
      '[APP] Rendering orders list, total orders:',
      this.orders.length
    );
    console.log('[APP] Container element found:', !!container);
    console.log('[APP] Count element found:', !!countEl);

    if (!container) {
      console.error('[APP] ordersList container not found!');
      return;
    }

    countEl.textContent = `(${this.orders.length})`;

    if (this.orders.length === 0) {
      container.innerHTML = `
        <div class="no-orders">
          <div class="icon">📋</div>
          <div>No orders yet</div>
          <div style="font-size: 11px; margin-top: 4px;">
            <button id="refreshOrdersBtn" class="btn-small">Refresh Order List</button>
          </div>
        </div>
      `;

      // Add refresh button event listener
      const refreshBtn = container.querySelector('#refreshOrdersBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.loadRecentOrders());
      }
      return;
    }

    console.log('[APP] Creating order elements...');
    container.innerHTML = '';

    this.orders.forEach((order, index) => {
      console.log(`[APP] Rendering order ${index + 1}:`, order.order_id);

      const orderEl = document.createElement('div');
      orderEl.className = 'order-item';

      // Handle time display
      const createTime = order.create_time || order.created_at;
      const timeDisplay = createTime
        ? new Date(createTime).toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : 'Unknown time';

      // Count dishes
      const dishesCount = order.dishes_array
        ? order.dishes_array.length
        : order.items?.length || 0;

      // Get status information
      const statusText = this.getOrderStatusText(order.order_status);
      const statusClass = this.getOrderStatusClass(order.order_status);

      orderEl.innerHTML = `
        <div class="order-header">
          <span class="order-id">Order #${order.order_id}</span>
          <span class="order-time">${timeDisplay}</span>
        </div>
        <div class="order-info">
          <div class="order-customer">
            <span class="customer-name">${
              order.recipient_name || 'Customer'
            }</span>
            ${
              order.delivery_style === 1
                ? '<span class="delivery-type">Delivery</span>'
                : '<span class="delivery-type">Pickup</span>'
            }
          </div>
          <div class="order-summary">
            <span class="order-amount">$${parseFloat(order.total || 0).toFixed(
              2
            )}</span>
            <span class="order-items">${dishesCount} items</span>
          </div>
        </div>
        <div class="order-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="order-actions">
          <button class="btn-small btn-info" onclick="app.showOrderDetails('${
            order.order_id
          }')">View Details</button>
          <button class="btn-small btn-primary" onclick="app.printOrder('${
            order.order_id
          }')">Print Order</button>
        </div>
      `;

      container.appendChild(orderEl);
    });

    console.log('[APP] Order list rendering completed');
  }

  // Get order status text in English
  getOrderStatusText(status) {
    switch (status) {
      case 0:
        return 'Pending';
      case 1:
        return 'Confirmed';
      case 2:
        return 'In Progress';
      case 3:
        return 'Ready';
      case 4:
        return 'Completed';
      case 5:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  }

  getOrderStatusClass(status) {
    switch (status) {
      case 0:
        return 'status-pending';
      case 1:
        return 'status-confirmed';
      case 2:
        return 'status-progress';
      case 3:
        return 'status-ready';
      case 4:
        return 'status-completed';
      case 5:
        return 'status-cancelled';
      default:
        return 'status-unknown';
    }
  }

  clearOrders() {
    console.log('[APP] Clear orders requested');
    if (confirm('确定要清空订单列表吗？这不会影响服务器数据。')) {
      console.log('[APP] Clearing orders list');
      this.orders = [];
      this.renderOrdersList();
    }
  }

  async showOrderDetails(orderId) {
    console.log('[APP] Showing order details for:', orderId);

    try {
      // 显示加载状态
      const detailsEl = document.getElementById('orderDetails');
      detailsEl.innerHTML = '<div class="loading">正在加载订单详情...</div>';
      document.getElementById('orderModal').classList.remove('hidden');

      // 从API获取订单详情
      const response = await API.getOrderById(orderId);

      console.log('[APP] API Response Full:', response);
      console.log('[APP] Response Success:', response.success);
      console.log('[APP] Response Data:', response.data);

      if (response.success && response.data) {
        const order = response.data;
        this.displayOrderDetails(order);
        this.currentOrderForPrint = order;
        console.log('[APP] Order details loaded successfully');
      } else {
        console.warn('[APP] Failed to load order details:', response.message);
        detailsEl.innerHTML = `<div class="error">加载失败: ${response.message}</div>`;
      }
    } catch (error) {
      console.error('[APP] Error loading order details:', error);
      const detailsEl = document.getElementById('orderDetails');
      detailsEl.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
    }
  }

  displayOrderDetails(order) {
    const detailsEl = document.getElementById('orderDetails');

    // Handle time formatting
    const createTime = order.create_time
      ? new Date(order.create_time).toLocaleString('en-US')
      : 'Unknown';
    const deliveryTime = order.delivery_time
      ? new Date(order.delivery_time).toLocaleString('en-US')
      : 'None';

    // Handle dishes list
    const dishes = order.dishes_array || [];
    const dishesHtml = dishes
      .map(
        (dish) => `
      <tr>
        <td class="dish-name">${dish.dishes_name}</td>
        <td class="dish-qty">${dish.amount}</td>
        <td class="dish-price">$${parseFloat(dish.unit_price || 0).toFixed(
          2
        )}</td>
        <td class="dish-total">$${parseFloat(dish.price || 0).toFixed(2)}</td>
        ${
          dish.remark
            ? `<td class="dish-remark">${dish.remark}</td>`
            : '<td>-</td>'
        }
      </tr>
    `
      )
      .join('');

    detailsEl.innerHTML = `
      <div class="order-detail-content">
        <div class="order-basic-info">
          <h4>Basic Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <label>Order ID:</label>
              <span>${order.order_id}</span>
            </div>
            <div class="info-item">
              <label>Restaurant:</label>
              <span>${order.rd_name || 'Unknown Restaurant'}</span>
            </div>
            <div class="info-item">
              <label>Order Date:</label>
              <span>${createTime}</span>
            </div>
            <div class="info-item">
              <label>Delivery Time:</label>
              <span>${deliveryTime}</span>
            </div>
            <div class="info-item">
              <label>Order Status:</label>
              <span class="status-badge ${this.getOrderStatusClass(
                order.order_status
              )}">${this.getOrderStatusText(order.order_status)}</span>
            </div>
            <div class="info-item">
              <label>Delivery Type:</label>
              <span>${order.delivery_style === 1 ? 'Delivery' : 'Pickup'}</span>
            </div>
          </div>
        </div>

        <div class="customer-info">
          <h4>Customer Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <label>Customer Name:</label>
              <span>${order.recipient_name || 'Not Provided'}</span>
            </div>
            <div class="info-item">
              <label>Phone Number:</label>
              <span>${order.recipient_phone || 'Not Provided'}</span>
            </div>
            <div class="info-item full-width">
              <label>Delivery Address:</label>
              <span>${order.recipient_address || 'Not Provided'}</span>
            </div>
            ${
              order.user_email
                ? `
            <div class="info-item full-width">
              <label>Email:</label>
              <span>${order.user_email}</span>
            </div>
            `
                : ''
            }
            ${
              order.recipient_distance && order.recipient_distance !== '0.00'
                ? `
            <div class="info-item">
              <label>Distance:</label>
              <span>${order.recipient_distance} miles</span>
            </div>
            `
                : ''
            }
          </div>
        </div>

        <div class="dishes-info">
          <h4>Item Details</h4>
          <table class="dishes-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Subtotal</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${dishesHtml}
            </tbody>
          </table>
        </div>

        <div class="payment-info">
          <h4>Payment Details</h4>
          <div class="payment-grid">
            <div class="payment-item">
              <label>Subtotal:</label>
              <span>$${parseFloat(order.sub_total || 0).toFixed(2)}</span>
            </div>
            ${
              parseFloat(order.discount_total || 0) > 0
                ? `
            <div class="payment-item">
              <label>Discount:</label>
              <span>-$${parseFloat(order.discount_total || 0).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            ${
              parseFloat(order.exemption || 0) > 0
                ? `
            <div class="payment-item">
              <label>Exemption:</label>
              <span>-$${parseFloat(order.exemption || 0).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            ${
              parseFloat(order.tax_fee || 0) > 0
                ? `
            <div class="payment-item">
              <label>Tax Fee${
                order.tax_rate
                  ? ` (${(parseFloat(order.tax_rate) * 100).toFixed(1)}%)`
                  : ''
              }:</label>
              <span>$${parseFloat(order.tax_fee || 0).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            ${
              parseFloat(order.delivery_fee || 0) > 0
                ? `
            <div class="payment-item">
              <label>Delivery Fee:</label>
              <span>$${parseFloat(order.delivery_fee || 0).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            ${
              parseFloat(order.retail_delivery_fee || 0) > 0
                ? `
            <div class="payment-item">
              <label>Retail Delivery Fee:</label>
              <span>$${parseFloat(order.retail_delivery_fee || 0).toFixed(
                2
              )}</span>
            </div>
            `
                : ''
            }
            ${
              parseFloat(order.convenience_fee || 0) > 0
                ? `
            <div class="payment-item">
              <label>Service Fee${
                order.convenience_rate
                  ? ` (${(parseFloat(order.convenience_rate) * 100).toFixed(
                      1
                    )}%)`
                  : ''
              }:</label>
              <span>$${parseFloat(order.convenience_fee || 0).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            ${
              parseFloat(order.tip_fee || 0) > 0
                ? `
            <div class="payment-item">
              <label>Tip:</label>
              <span>$${parseFloat(order.tip_fee || 0).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            <div class="payment-item total">
              <label>Order Total:</label>
              <span>$${parseFloat(order.total || 0).toFixed(2)}</span>
            </div>
            <div class="payment-item">
              <label>Payment Method:</label>
              <span>${this.getPaymentMethodText(order.paystyle)}</span>
            </div>
          </div>
        </div>

        ${
          order.order_notes
            ? `
          <div class="order-notes">
            <h4>Order Notes</h4>
            <p>${order.order_notes}</p>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  // Get payment method text in English
  getPaymentMethodText(paystyle) {
    switch (paystyle) {
      case 0:
        return 'Cash on Delivery';
      case 1:
        return 'Cash';
      case 2:
        return 'Credit Card';
      case 3:
        return 'Debit Card';
      case 4:
        return 'Online Payment';
      default:
        return 'Unknown';
    }
  }

  hideOrderModal() {
    document.getElementById('orderModal').classList.add('hidden');
    this.currentOrderForPrint = null;
  }

  async printCurrentOrder() {
    console.log('[APP] 打印当前订单');

    if (!this.currentOrderForPrint) {
      alert('没有找到订单数据');
      return;
    }

    const selectedPrinters = this.printerManager.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      alert('请先选择至少一台打印机');
      return;
    }

    try {
      console.log(
        `[APP] 开始向 ${selectedPrinters.length} 台打印机打印订单 ${this.currentOrderForPrint.order_id}`
      );

      const printResult = await this.printerManager.printOrder(
        this.currentOrderForPrint
      );

      if (printResult.成功数量 > 0) {
        // 记录已打印的订单ID
        this.printedOrderIds.add(this.currentOrderForPrint.order_id);
        console.log(
          `[APP] 手动打印订单 ${this.currentOrderForPrint.order_id} 已记录为已打印`
        );
        this.savePrintedOrdersRecord(); // 保存到localStorage

        this.showTrayNotification(
          `✅ 订单 ${this.currentOrderForPrint.order_id} 已打印到 ${printResult.成功数量} 台打印机`
        );
      }

      if (printResult.失败数量 > 0) {
        console.warn('[APP] 打印部分失败:', printResult.错误列表);
        this.showTrayNotification(
          `⚠️ ${printResult.失败数量} 台打印机打印失败`
        );
      }

      console.log('[APP] 打印结果:', printResult);
      this.hideOrderModal();
    } catch (error) {
      console.error('[APP] 打印订单失败:', error);
      this.showTrayNotification(`❌ 打印失败: ${error.message}`);
      alert(`打印失败: ${error.message}`);
    }
  }

  async printOrder(orderId) {
    console.log('[APP] 手动打印订单:', orderId);

    const selectedPrinters = this.printerManager.getSelectedPrinters();
    if (selectedPrinters.length === 0) {
      alert('请先选择至少一台打印机');
      return;
    }

    // 查找订单数据
    const order = this.orders.find((o) => o.order_id === orderId);
    if (!order) {
      console.error('[APP] 未找到订单:', orderId);
      alert('未找到订单数据');
      return;
    }

    try {
      console.log(
        `[APP] 开始向 ${selectedPrinters.length} 台打印机打印订单 ${orderId}`
      );

      const printResult = await this.printerManager.printOrder(order);

      if (printResult.成功数量 > 0) {
        // 记录已打印的订单ID
        this.printedOrderIds.add(orderId);
        console.log(`[APP] 手动打印订单 ${orderId} 已记录为已打印`);
        this.savePrintedOrdersRecord(); // 保存到localStorage

        this.showTrayNotification(
          `✅ 订单 ${orderId} 已打印到 ${printResult.成功数量} 台打印机`
        );
      }

      if (printResult.失败数量 > 0) {
        console.warn('[APP] 打印部分失败:', printResult.错误列表);
        this.showTrayNotification(
          `⚠️ ${printResult.失败数量} 台打印机打印失败`
        );
      }

      console.log('[APP] 打印结果:', printResult);
    } catch (error) {
      console.error('[APP] 打印订单失败:', error);
      this.showTrayNotification(`❌ 打印失败: ${error.message}`);
      alert(`打印失败: ${error.message}`);
    }
  }

  testWebSocketConnection() {
    console.log('[APP] Testing WebSocket connection...');

    if (!this.currentUser) {
      alert('Please login first to test WebSocket connection');
      return;
    }

    // Disconnect current WebSocket if connected
    if (this.wsClient) {
      this.wsClient.disconnect();
    }

    // Force reconnection
    setTimeout(() => {
      console.log('[APP] Starting WebSocket connection test...');
      this.connectWebSocket();
    }, 1000);
  }

  // 托盘通知
  showTrayNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'tray-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  async loadPrintedOrdersRecord() {
    try {
      console.log('[APP] 加载已打印订单记录...');
      const storedIds = localStorage.getItem('printedOrderIds');

      if (storedIds) {
        const parsedIds = JSON.parse(storedIds);
        this.printedOrderIds = new Set(parsedIds);
        console.log(
          `[APP] 已加载 ${this.printedOrderIds.size} 个已打印订单记录`
        );
      } else {
        console.log('[APP] 没有找到已打印订单记录，使用空记录');
        this.printedOrderIds = new Set();
      }

      // 清理超过7天的记录，避免存储过多数据
      this.cleanupOldPrintedRecords();
    } catch (error) {
      console.error('[APP] 加载已打印订单记录失败:', error);
      this.printedOrderIds = new Set();
    }
  }

  // 保存已打印订单记录到localStorage
  savePrintedOrdersRecord() {
    try {
      const idsArray = Array.from(this.printedOrderIds);
      localStorage.setItem('printedOrderIds', JSON.stringify(idsArray));
      console.log(`[APP] 已保存 ${idsArray.length} 个已打印订单记录`);
    } catch (error) {
      console.error('[APP] 保存已打印订单记录失败:', error);
    }
  }

  // 清理超过7天的已打印记录
  cleanupOldPrintedRecords() {
    // 由于订单ID通常包含时间信息，我们可以根据订单列表来清理
    // 这里简单实现：如果记录超过100个，清理最旧的一半
    if (this.printedOrderIds.size > 100) {
      const idsArray = Array.from(this.printedOrderIds);
      const keepCount = 50;
      const newIds = new Set(idsArray.slice(-keepCount));
      this.printedOrderIds = newIds;
      this.savePrintedOrdersRecord();
      console.log(`[APP] 清理已打印记录，保留最近 ${keepCount} 个`);
    }
  }

  // 🍽️ 新增：分菜打印配置方法实现

  // 处理分菜打印模式切换
  handleSeparatePrintingToggle(isEnabled) {
    console.log('[APP] 🍽️ 切换分菜打印模式:', isEnabled);

    const configContainer = document.getElementById('printerNumberConfig');
    const statusElement = document.getElementById('dishPrintStatus');

    if (isEnabled) {
      // 显示打印机编号配置
      configContainer.classList.remove('hidden');
      statusElement.textContent = '已启用';
      statusElement.className = 'status-badge status-enabled';

      // 渲染打印机编号配置
      this.renderPrinterNumberConfig();

      // 通知打印管理器启用分菜模式
      if (this.printerManager && this.printerManager.lodopManager) {
        this.printerManager.lodopManager.setSeparatePrintingMode(true);
      }
    } else {
      // 隐藏打印机编号配置
      configContainer.classList.add('hidden');
      statusElement.textContent = '已禁用';
      statusElement.className = 'status-badge status-disabled';

      // 通知打印管理器禁用分菜模式
      if (this.printerManager && this.printerManager.lodopManager) {
        this.printerManager.lodopManager.setSeparatePrintingMode(false);
      }
    }

    // 保存配置
    this.saveDishPrintConfig();
  }

  // 渲染打印机编号配置界面
  renderPrinterNumberConfig() {
    const container = document.getElementById('printerNumberList');
    const printers = this.printerManager.getAllPrinters();

    container.innerHTML = '';

    printers.forEach((printer, index) => {
      const printerItem = document.createElement('div');
      printerItem.className = 'printer-number-item';

      // 获取当前打印机的编号
      let currentNumber = '';
      if (this.printerManager && this.printerManager.lodopManager) {
        const number = this.printerManager.lodopManager.getPrinterNumber(
          printer.name
        );
        currentNumber = number || '';
      }

      printerItem.innerHTML = `
        <label>${printer.name}</label>
        <input type="number"
               id="printerNumber_${index}"
               min="0"
               max="99"
               value="${currentNumber}"
               placeholder="编号"
               data-printer-name="${printer.name}">
        <span class="number-hint">(0=完整订单, 1-99=printType)</span>
      `;

      // 添加输入事件监听
      const input = printerItem.querySelector('input');
      input.addEventListener('change', (e) => {
        this.handlePrinterNumberChange(printer.name, e.target.value);
      });

      container.appendChild(printerItem);
    });
  }

  // 处理打印机编号变更
  handlePrinterNumberChange(printerName, value) {
    const number = parseInt(value) || null;
    console.log('[APP] 🍽️ 设置打印机编号:', printerName, '->', number);

    if (this.printerManager && this.printerManager.lodopManager) {
      const success = this.printerManager.lodopManager.setPrinterNumber(
        printerName,
        number
      );
      if (success) {
        console.log('[APP] 🍽️ 打印机编号设置成功');
      } else {
        console.error('[APP] 🍽️ 打印机编号设置失败');
      }
    }
  }

  // 显示分菜打印帮助
  showDishPrintHelp() {
    console.log('[APP] 显示分菜打印帮助');
    const modal = document.getElementById('dishPrintHelpModal');
    modal.classList.remove('hidden');
  }

  // 隐藏分菜打印帮助
  hideDishPrintHelp() {
    console.log('[APP] 隐藏分菜打印帮助');
    const modal = document.getElementById('dishPrintHelpModal');
    modal.classList.add('hidden');
  }

  // 保存分菜打印配置
  async saveDishPrintConfig() {
    console.log('[APP] 🍽️ 保存分菜打印配置');

    try {
      const isEnabled = document.getElementById(
        'enableSeparatePrinting'
      ).checked;

      // 收集所有打印机编号配置
      const printerNumbers = {};
      const printers = this.printerManager.getAllPrinters();

      printers.forEach((printer, index) => {
        const input = document.getElementById(`printerNumber_${index}`);
        if (input) {
          const number = parseInt(input.value) || null;
          if (number) {
            printerNumbers[printer.name] = number;
          }
        }
      });

      // 构建配置对象
      const config = {
        enableSeparatePrinting: isEnabled,
        printerNumbers: printerNumbers,
      };

      // 保存到本地存储
      localStorage.setItem('dishPrintConfig', JSON.stringify(config));

      console.log('[APP] 🍽️ 分菜打印配置已保存:', config);

      // 显示成功提示
      this.showNotification('分菜打印配置已保存', 'success');
    } catch (error) {
      console.error('[APP] 🍽️ 保存分菜打印配置失败:', error);
      this.showNotification('保存配置失败: ' + error.message, 'error');
    }
  }

  // 重置分菜打印配置
  resetDishPrintConfig() {
    console.log('[APP] 🍽️ 重置分菜打印配置');

    if (confirm('确定要重置所有分菜打印配置吗？此操作不可撤销。')) {
      // 重置界面
      document.getElementById('enableSeparatePrinting').checked = false;
      document.getElementById('printerNumberConfig').classList.add('hidden');
      document.getElementById('dishPrintStatus').textContent = '已禁用';
      document.getElementById('dishPrintStatus').className =
        'status-badge status-disabled';

      // 清空所有打印机编号输入框
      const inputs = document.querySelectorAll(
        '#printerNumberList input[type="number"]'
      );
      inputs.forEach((input) => {
        input.value = '';
      });

      // 重置打印管理器配置
      if (this.printerManager && this.printerManager.lodopManager) {
        this.printerManager.lodopManager.resetPrintTypeConfig();
      }

      // 清除本地存储
      localStorage.removeItem('dishPrintConfig');

      console.log('[APP] 🍽️ 分菜打印配置已重置');
      this.showNotification('分菜打印配置已重置', 'success');
    }
  }

  // 测试分菜打印
  async testDishPrint() {
    console.log('[APP] 🍽️ 开始测试分菜打印');

    try {
      // 检查是否有选中的打印机
      const selectedPrinters = this.printerManager.getSelectedPrinters();
      if (selectedPrinters.length === 0) {
        this.showNotification('请先选择至少一台打印机', 'error');
        return;
      }

      // 检查是否启用了分菜模式
      const isEnabled = document.getElementById(
        'enableSeparatePrinting'
      ).checked;
      if (!isEnabled) {
        this.showNotification('请先启用分菜打印模式', 'error');
        return;
      }

      // 创建测试订单
      const testOrder = {
        order_id: `TEST-${Date.now()}`,
        create_time: new Date().toISOString(),
        delivery_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        paystyle: 1,
        recipient_name: '测试客户',
        recipient_phone: '13800138000',
        delivery_type: 2,
        sub_total: 45.5,
        tax_fee: 3.64,
        tip_fee: 5.0,
        total: 54.14,
        order_notes: '这是分菜打印测试订单',
        dishes_array: [
          {
            dishes_name: '宫保鸡丁',
            price: '18.50',
            amount: '1',
            remark: '微辣，不要花生',
            printType: '1',
          },
          {
            dishes_name: '麻婆豆腐',
            price: '16.00',
            amount: '1',
            remark: '中辣',
            printType: '1',
          },
          {
            dishes_name: '凉拌黄瓜',
            price: '8.00',
            amount: '1',
            remark: '多放蒜',
            printType: '2',
          },
          {
            dishes_name: '米饭',
            price: '3.00',
            amount: '2',
            remark: '',
            printType: '0',
          },
        ],
      };

      // 执行测试打印
      this.showNotification('正在执行分菜打印测试...', 'info');

      const result = await this.printerManager.printOrder(testOrder);

      if (result && result.成功数量 > 0) {
        this.showNotification(
          `分菜打印测试完成！成功: ${result.成功数量}台, 失败: ${result.失败数量}台`,
          'success'
        );
        console.log('[APP] 🍽️ 分菜打印测试结果:', result);
      } else {
        this.showNotification('分菜打印测试失败', 'error');
        console.error('[APP] 🍽️ 分菜打印测试失败:', result);
      }
    } catch (error) {
      console.error('[APP] 🍽️ 分菜打印测试异常:', error);
      this.showNotification('分菜打印测试异常: ' + error.message, 'error');
    }
  }

  // 加载分菜打印配置
  loadDishPrintConfig() {
    console.log('[APP] 🍽️ 加载分菜打印配置');

    try {
      const configStr = localStorage.getItem('dishPrintConfig');
      if (configStr) {
        const config = JSON.parse(configStr);

        // 恢复分菜模式开关
        document.getElementById('enableSeparatePrinting').checked =
          config.enableSeparatePrinting || false;

        // 恢复状态显示
        const statusElement = document.getElementById('dishPrintStatus');
        if (config.enableSeparatePrinting) {
          statusElement.textContent = '已启用';
          statusElement.className = 'status-badge status-enabled';
          document
            .getElementById('printerNumberConfig')
            .classList.remove('hidden');
        } else {
          statusElement.textContent = '已禁用';
          statusElement.className = 'status-badge status-disabled';
          document
            .getElementById('printerNumberConfig')
            .classList.add('hidden');
        }

        // 恢复打印机编号配置
        if (
          config.printerNumbers &&
          this.printerManager &&
          this.printerManager.lodopManager
        ) {
          Object.entries(config.printerNumbers).forEach(
            ([printerName, number]) => {
              this.printerManager.lodopManager.setPrinterNumber(
                printerName,
                number
              );
            }
          );

          // 设置打印管理器的分菜模式
          this.printerManager.lodopManager.setSeparatePrintingMode(
            config.enableSeparatePrinting
          );
        }

        console.log('[APP] 🍽️ 分菜打印配置已加载:', config);
      }
    } catch (error) {
      console.error('[APP] 🍽️ 加载分菜打印配置失败:', error);
    }
  }

  // 显示通知消息
  showNotification(message, type = 'info') {
    // 简单的通知实现，可以根据需要改进
    console.log(`[NOTIFICATION-${type.toUpperCase()}] ${message}`);

    // 如果有现成的通知系统，可以调用
    if (typeof this.showTrayNotification === 'function') {
      this.showTrayNotification(message);
    } else {
      // 简单的alert作为临时方案
      alert(message);
    }
  }
}

let app;

document.addEventListener('DOMContentLoaded', () => {
  app = new OrderPrintApp();
});

window.app = app;
