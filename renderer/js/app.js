class OrderPrintApp {
  constructor() {
    this.currentUser = null;
    this.orders = [];
    this.wsClient = null;
    this.printerManager = new PrinterManager();
    this.isInitialized = false;
    this.todayOrderCount = 0;

    this.init();
  }

  async init() {
    console.log('[APP] Starting application initialization...');

    await this.printerManager.init();
    this.bindEvents();
    await this.initUI();
    await this.checkAutoLogin();

    console.log('[APP] Application initialization completed');
  }

  async initUI() {
    await this.updatePrinterSelect();
    await this.loadUIConfig();
  }

  async updatePrinterSelect() {
    const printers = this.printerManager.getAllPrinters();
    const container = document.getElementById('printerList');
    const selectedPrinters = this.printerManager.getSelectedPrinters();

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

    // 打印设置和预览按钮
    document
      .getElementById('printSettingsBtn')
      .addEventListener('click', () => {
        this.showPrintSettings();
      });

    document.getElementById('printPreviewBtn').addEventListener('click', () => {
      this.showPrintPreview();
    });

    // 中文编码测试页面按钮
    document.getElementById('openTestPageBtn').addEventListener('click', () => {
      this.openChineseEncodingTestPage();
    });

    // 打印设置模态框事件
    document
      .getElementById('savePrintSettings')
      .addEventListener('click', () => {
        this.savePrintSettings();
      });

    document
      .getElementById('resetPrintSettings')
      .addEventListener('click', () => {
        this.resetPrintSettings();
      });

    document
      .getElementById('closePrintSettings')
      .addEventListener('click', () => {
        this.hidePrintSettings();
      });

    // 打印预览模态框事件
    document
      .getElementById('printFromPreview')
      .addEventListener('click', () => {
        this.printFromPreview();
      });

    document.getElementById('refreshPreview').addEventListener('click', () => {
      this.refreshPreview();
    });

    document.getElementById('closePreview').addEventListener('click', () => {
      this.hidePreview();
    });

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
        localStorage.setItem('authToken', result.data.token);
        localStorage.setItem('userId', result.data.user_id);

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

    this.wsClient.on('connected', () => {
      console.log('[APP] WebSocket connected successfully');
      document.getElementById('wsStatus').textContent = 'Connected';
      document.getElementById('wsStatus').className =
        'status-badge status-success';
    });

    this.wsClient.on('disconnected', () => {
      console.log('[APP] WebSocket disconnected');
      document.getElementById('wsStatus').textContent = 'Disconnected';
      document.getElementById('wsStatus').className =
        'status-badge status-error';
    });

    this.wsClient.on('newOrder', (orderData) => {
      console.log('[APP] New order received via WebSocket:', orderData);
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
    await window.electronAPI.showNotification({
      title: '新订单',
      body: `订单号: ${orderData.order_id || orderData.id}`,
    });

    const orderId = orderData.order_id || orderData.id;
    if (orderId) {
      const orderDetails = await API.getOrderById(orderId);
      if (orderDetails.success) {
        this.addOrderToList(orderDetails.data);

        // 检查是否启用自动打印
        if (document.getElementById('autoPrint').checked) {
          const selectedPrinters = this.printerManager.getSelectedPrinters();

          if (selectedPrinters.length === 0) {
            console.warn('[APP] 自动打印失败: 未选择任何打印机');
            this.showTrayNotification('⚠️ 自动打印失败: 未选择打印机');
          } else {
            try {
              console.log(
                `[APP] 自动打印新订单到 ${selectedPrinters.length} 台打印机`
              );
              const printResult = await this.printerManager.printOrder(
                orderDetails.data
              );

              if (printResult.成功数量 > 0) {
                this.showTrayNotification(
                  `✅ 订单 ${orderId} 已自动打印到 ${printResult.成功数量} 台打印机`
                );
              }

              if (printResult.失败数量 > 0) {
                console.warn('[APP] 自动打印部分失败:', printResult.错误列表);
                this.showTrayNotification(
                  `⚠️ ${printResult.失败数量} 台打印机打印失败`
                );
              }
            } catch (error) {
              console.error('[APP] 自动打印完全失败:', error);
              this.showTrayNotification(`❌ 自动打印失败: ${error.message}`);
            }
          }
        }
      }
    }
  }

  async loadRecentOrders() {
    // 模拟订单数据
    this.orders = [
      {
        order_id: 'ORD001',
        created_at: new Date().toISOString(),
        total_amount: '58.50',
        status: '待处理',
        items: [
          { name: '宫保鸡丁', quantity: 1, price: '28.00' },
          { name: '米饭', quantity: 2, price: '6.00' },
        ],
      },
    ];
    this.renderOrdersList();
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

    countEl.textContent = `(${this.orders.length})`;

    if (this.orders.length === 0) {
      container.innerHTML = '<div class="no-orders">No orders yet</div>';
      return;
    }

    container.innerHTML = '';

    this.orders.forEach((order) => {
      const orderEl = document.createElement('div');
      orderEl.className = 'order-item';

      orderEl.innerHTML = `
        <div class="order-header">
          <span class="order-id">Order ID: ${order.order_id}</span>
          <span class="order-time">${new Date(
            order.created_at
          ).toLocaleString()}</span>
        </div>
        <div class="order-info">
          <span>¥${order.total_amount}</span>
          <span>${order.status}</span>
        </div>
        <div class="order-actions">
          <button onclick="app.showOrderDetails('${
            order.order_id
          }')">View Details</button>
          <button onclick="app.printOrder('${order.order_id}')">Print</button>
        </div>
      `;

      container.appendChild(orderEl);
    });
  }

  clearOrders() {
    console.log('[APP] Clear orders requested');
    if (confirm('Are you sure you want to clear the order list?')) {
      console.log('[APP] Clearing orders list');
      this.orders = [];
      this.renderOrdersList();
    }
  }

  showOrderDetails(orderId) {
    console.log('[APP] Showing order details for:', orderId);

    const order = this.orders.find((o) => o.order_id === orderId);
    if (!order) {
      console.warn('[APP] Order not found:', orderId);
      return;
    }

    const detailsEl = document.getElementById('orderDetails');
    detailsEl.innerHTML = `
      <p><strong>Order ID:</strong> ${order.order_id}</p>
      <p><strong>Order Time:</strong> ${new Date(
        order.created_at
      ).toLocaleString()}</p>
      <p><strong>Total Amount:</strong> ¥${order.total_amount}</p>
      <p><strong>Status:</strong> ${order.status}</p>
      <h4>Order Items:</h4>
      <ul>
        ${order.items
          .map(
            (item) => `<li>${item.name} x${item.quantity} - ¥${item.price}</li>`
          )
          .join('')}
      </ul>
    `;

    document.getElementById('orderModal').classList.remove('hidden');
    this.currentOrderForPrint = order;
    console.log('[APP] Order details modal opened');
  }

  hideOrderModal() {
    document.getElementById('orderModal').classList.add('hidden');
    this.currentOrderForPrint = null;
  }

  async printCurrentOrder() {
    // 实现打印当前订单的逻辑
    console.log('[APP] 打印当前订单');
    this.hideOrderModal();
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

  // 打印设置相关方法
  async showPrintSettings() {
    console.log('[APP] Showing print settings modal');
    try {
      const settings = await window.electronAPI.getPrintSettings();
      this.loadPrintSettingsToForm(settings);
      document.getElementById('printSettingsModal').classList.remove('hidden');
    } catch (error) {
      console.error('[APP] Failed to load print settings:', error);
    }
  }

  loadPrintSettingsToForm(settings) {
    document.getElementById('paperWidth').value = settings.paperWidth || 58;
    document.getElementById('fontSize').value = settings.fontSize || 12;
    document.getElementById('fontFamily').value =
      settings.fontFamily || 'SimSun';
    document.getElementById('lineSpacing').value = settings.lineSpacing || 1.2;
    document.getElementById('margin').value = settings.margin || 5;
    document.getElementById('showLogo').checked = settings.showLogo !== false;
    document.getElementById('showOrderTime').checked =
      settings.showOrderTime !== false;
    document.getElementById('showItemDetails').checked =
      settings.showItemDetails !== false;
    document.getElementById('showSeparator').checked =
      settings.showSeparator !== false;
  }

  async savePrintSettings() {
    console.log('[APP] Saving print settings');
    try {
      const settings = {
        paperWidth: parseInt(document.getElementById('paperWidth').value),
        fontSize: parseInt(document.getElementById('fontSize').value),
        fontFamily: document.getElementById('fontFamily').value,
        lineSpacing: parseFloat(document.getElementById('lineSpacing').value),
        margin: parseInt(document.getElementById('margin').value),
        showLogo: document.getElementById('showLogo').checked,
        showOrderTime: document.getElementById('showOrderTime').checked,
        showItemDetails: document.getElementById('showItemDetails').checked,
        showSeparator: document.getElementById('showSeparator').checked,
      };

      const success = await window.electronAPI.savePrintSettings(settings);
      if (success) {
        console.log('[APP] Print settings saved successfully');
        this.showTrayNotification('Print settings saved successfully!');
        this.hidePrintSettings();
      } else {
        alert('Failed to save print settings');
      }
    } catch (error) {
      console.error('[APP] Failed to save print settings:', error);
      alert('Failed to save print settings: ' + error.message);
    }
  }

  resetPrintSettings() {
    console.log('[APP] Resetting print settings to defaults');
    this.loadPrintSettingsToForm({
      paperWidth: 58,
      fontSize: 12,
      fontFamily: 'SimSun',
      lineSpacing: 1.2,
      margin: 5,
      showLogo: true,
      showOrderTime: true,
      showItemDetails: true,
      showSeparator: true,
    });
  }

  hidePrintSettings() {
    document.getElementById('printSettingsModal').classList.add('hidden');
  }

  // 打印预览相关方法
  async showPrintPreview() {
    console.log('[APP] Showing print preview');
    try {
      // 使用第一个订单作为预览示例，如果没有订单则创建示例订单
      let sampleOrder =
        this.orders.length > 0
          ? this.orders[0]
          : {
              order_id: 'SAMPLE_001',
              created_at: new Date().toISOString(),
              total_amount: '88.50',
              status: 'New Order',
              items: [
                { name: 'Kung Pao Chicken', quantity: 1, price: '28.00' },
                { name: 'Fried Rice', quantity: 2, price: '12.00' },
                { name: 'Hot & Sour Soup', quantity: 1, price: '15.00' },
                { name: 'Spring Rolls', quantity: 3, price: '8.50' },
              ],
            };

      const settings = await window.electronAPI.getPrintSettings();
      const preview = await window.electronAPI.printPreview(
        sampleOrder,
        settings
      );

      this.displayPreview(preview);
      document.getElementById('printPreviewModal').classList.remove('hidden');
    } catch (error) {
      console.error('[APP] Failed to generate print preview:', error);
      alert('Failed to generate print preview: ' + error.message);
    }
  }

  displayPreview(preview) {
    const content = preview.content;
    const settings = preview.settings;

    document.getElementById('previewContent').textContent = content;
    document.getElementById('previewPaperWidth').textContent =
      settings.paperWidth;
    document.getElementById('previewFontSize').textContent = settings.fontSize;
    document.getElementById('previewCharsPerLine').textContent =
      settings.charsPerLine;

    // 动态调整预览内容的样式
    const previewElement = document.getElementById('previewContent');
    previewElement.style.fontSize = settings.fontSize + 'px';
    previewElement.style.fontFamily = settings.fontFamily;
    previewElement.style.lineHeight = settings.lineSpacing;
  }

  async refreshPreview() {
    console.log('[APP] Refreshing print preview');
    await this.showPrintPreview();
  }

  async printFromPreview() {
    console.log('[APP] Printing from preview');
    if (!this.printerManager.isAnyPrinterSelected()) {
      alert('Please select a printer first');
      return;
    }

    try {
      const sampleOrder =
        this.orders.length > 0
          ? this.orders[0]
          : {
              order_id: 'SAMPLE_001',
              created_at: new Date().toISOString(),
              total_amount: '88.50',
              status: 'New Order',
              items: [
                { name: 'Kung Pao Chicken', quantity: 1, price: '28.00' },
                { name: 'Fried Rice', quantity: 2, price: '12.00' },
              ],
            };

      await this.printerManager.printOrder(sampleOrder);
      this.showTrayNotification('Print job sent to printer!');
      this.hidePreview();
    } catch (error) {
      console.error('[APP] Failed to print from preview:', error);
      alert('Failed to print: ' + error.message);
    }
  }

  hidePreview() {
    document.getElementById('printPreviewModal').classList.add('hidden');
  }

  // 打开中文编码测试页面
  async openChineseEncodingTestPage() {
    console.log('[APP] Opening Chinese encoding test page');

    try {
      // 使用 electron API 打开新窗口
      if (window.electronAPI && window.electronAPI.openNewWindow) {
        const success = await window.electronAPI.openNewWindow(
          'test_electron_integration.html',
          {
            width: 1200,
            height: 900,
            title: '🧪 中文编码测试 - Electron环境热敏打印机测试',
          }
        );

        if (success) {
          this.showTrayNotification('已打开中文编码测试页面');
        } else {
          alert('打开测试页面失败，请检查文件是否存在');
        }
      } else {
        alert('无法打开新窗口，electronAPI 不可用');
      }
    } catch (error) {
      console.error('[APP] Failed to open test page:', error);
      alert('打开测试页面失败: ' + error.message);
    }
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
}

let app;

document.addEventListener('DOMContentLoaded', () => {
  app = new OrderPrintApp();
});

window.app = app;
