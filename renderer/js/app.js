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
    const select = document.getElementById('printerSelect');

    select.innerHTML = '';

    if (printers.length === 0) {
      select.innerHTML = '<option value="">未发现打印机</option>';
    } else {
      printers.forEach((printer) => {
        const option = document.createElement('option');
        option.value = printer.name;
        option.textContent = `${printer.name} (${printer.status})`;

        if (this.printerManager.getSelectedPrinters().includes(printer.name)) {
          option.selected = true;
        }

        select.appendChild(option);
      });
    }

    this.updatePrinterStatus();
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

    document.getElementById('testPrint').addEventListener('click', () => {
      this.handleTestPrint();
    });

    document.getElementById('printerSelect').addEventListener('change', (e) => {
      this.handlePrinterSelection(e);
    });

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

  async handleTestPrint() {
    console.log('[APP] Test print initiated');

    if (!this.printerManager.isAnyPrinterSelected()) {
      console.warn('[APP] No printer selected for test print');
      alert('Please select a printer first');
      return;
    }

    try {
      console.log('[APP] Starting test print...');
      await this.printerManager.testPrint();
      console.log('[APP] Test print completed successfully');
      alert('Test print completed');
    } catch (error) {
      console.error('[APP] Test print failed:', error);
      alert('Test print failed: ' + error.message);
    }
  }

  handlePrinterSelection(e) {
    const selectedPrinters = Array.from(e.target.selectedOptions).map(
      (option) => option.value
    );
    this.printerManager.setSelectedPrinters(selectedPrinters);
    this.updatePrinterStatus();
  }

  updatePrinterStatus() {
    const statusEl = document.getElementById('printerStatus');
    const selectedCount = this.printerManager.getSelectedPrintersCount();

    console.log(
      '[APP] Updating printer status, selected count:',
      selectedCount
    );

    if (selectedCount === 0) {
      statusEl.textContent = 'Not Selected';
      statusEl.className = 'status-badge status-error';
    } else {
      statusEl.textContent = `Selected ${selectedCount}`;
      statusEl.className = 'status-badge status-success';
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
      title: 'New Order',
      body: `Order ID: ${orderData.order_id || orderData.id}`,
    });

    const orderId = orderData.order_id || orderData.id;
    if (orderId) {
      const orderDetails = await API.getOrderById(orderId);
      if (orderDetails.success) {
        this.addOrderToList(orderDetails.data);

        if (document.getElementById('autoPrint').checked) {
          await this.printerManager.printOrder(orderDetails.data);
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
    if (this.currentOrderForPrint) {
      await this.printOrderById(this.currentOrderForPrint.order_id);
      this.hideOrderModal();
    }
  }

  async printOrder(orderId) {
    await this.printOrderById(orderId);
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

  async printOrderById(orderId) {
    console.log('[APP] Print order requested for:', orderId);

    const order = this.orders.find((o) => o.order_id === orderId);
    if (!order) {
      console.warn('[APP] Order not found for printing:', orderId);
      return;
    }

    if (!this.printerManager.isAnyPrinterSelected()) {
      console.warn('[APP] No printer selected for order printing');
      alert('Please select a printer first');
      return;
    }

    try {
      console.log('[APP] Starting order print process...');
      await this.printerManager.printOrder(order);
      console.log('[APP] Order printed successfully');
      alert('Order printed successfully');
    } catch (error) {
      console.error('[APP] Order print failed:', error);
      alert('Print failed: ' + error.message);
    }
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
