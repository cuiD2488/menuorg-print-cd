class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.callbacks = {};
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.maxReconnectAttempts = 10;
    this.reconnectAttempts = 0;
    this.isManualClose = false;

    // 🔧 新增：心跳包相关
    this.heartbeatInterval = 30000; // 30秒心跳
    this.heartbeatTimer = null;
    this.lastHeartbeat = Date.now();

    // 🔧 新增：连接状态监控
    this.connectionMonitorTimer = null;
    this.lastConnectionCheck = Date.now();

    // 🔧 新增：网络状态监听
    this.setupNetworkListeners();
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  off(event, callback) {
    if (this.callbacks[event]) {
      const index = this.callbacks[event].indexOf(callback);
      if (index > -1) {
        this.callbacks[event].splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('[WebSocket] Event callback execution failed:', error);
        }
      });
    }
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected, skipping reconnection');
      return;
    }

    console.log('[WebSocket] Starting connection to:', this.url);
    this.isManualClose = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connection established successfully');
        this.reconnectAttempts = 0;
        this.emit('connected');
        this.clearReconnectTimer();

        // 🔧 新增：连接成功后启动心跳
        this.startHeartbeat();

        // 🔧 新增：启动连接状态监控
        this.startConnectionMonitor();
      };

      this.ws.onmessage = (event) => {
        try {
          console.log('[WebSocket] Raw message received:', event.data);

          // 尝试解析 JSON，如果失败则作为纯文本处理
          let data;
          try {
            data = JSON.parse(event.data);
            console.log('[WebSocket] JSON message parsed:', data);

            // 🔧 新增：处理心跳响应
            if (data.type === 'pong') {
              console.log('[WebSocket] Heartbeat response received');
              this.lastHeartbeat = Date.now();
              return;
            }

            // 根据消息类型分发事件
            if (data.type === 'order' || data.type === 'new_order') {
              console.log(
                '[WebSocket] 订单消息，触发newOrder事件，数据:',
                data.data || data
              );
              this.emit('newOrder', data.data || data);
            } else if (data.type === 'order_update') {
              this.emit('orderUpdate', data);
            } else {
              this.emit('message', data);
            }
          } catch (parseError) {
            // 如果不是 JSON，作为纯文本消息处理
            console.log('[WebSocket] Text message received:', event.data);
            this.emit('textMessage', event.data);
            this.emit('message', { type: 'text', content: event.data });
          }
        } catch (error) {
          console.error('[WebSocket] Failed to process message:', error);
          this.emit('messageError', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        if (event.code === 1006) {
          console.log(
            '[WebSocket] Connection closed abnormally (code 1006) - likely server rejected connection'
          );
        }
        this.emit('disconnected', { code: event.code, reason: event.reason });

        // 🔧 新增：停止心跳和监控
        this.stopHeartbeat();
        this.stopConnectionMonitor();

        if (
          !this.isManualClose &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    console.log('[WebSocket] Manual disconnection initiated');
    this.isManualClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat(); // 🔧 新增：停止心跳
    this.stopConnectionMonitor(); // 🔧 新增：停止监控

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.ws.send(message);
        return true;
      } catch (error) {
        console.error('[WebSocket] Failed to send message:', error);
        return false;
      }
    } else {
      console.warn('[WebSocket] Not connected, cannot send message');
      return false;
    }
  }

  // 🔧 新增：启动心跳包
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // 发送心跳包
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          this.lastHeartbeat = Date.now();
          console.log('[WebSocket] Heartbeat sent');
        } catch (error) {
          console.error('[WebSocket] Heartbeat failed:', error);
          this.ws.close();
        }
      } else {
        console.log('[WebSocket] Connection not open, stopping heartbeat');
        this.stopHeartbeat();
      }
    }, this.heartbeatInterval);
  }

  // 🔧 新增：停止心跳包
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // 🔧 新增：指数退避重连策略
  scheduleReconnect() {
    if (this.isManualClose) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(
        '[WebSocket] Max reconnection attempts reached, stopping reconnection'
      );
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    // 🔧 新增：指数退避策略
    const backoffDelay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // 最大30秒
    );

    console.log(
      `[WebSocket] Will reconnect in ${backoffDelay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, backoffDelay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // 🔧 新增：启动连接状态监控
  startConnectionMonitor() {
    this.stopConnectionMonitor();
    this.lastConnectionCheck = Date.now();

    this.connectionMonitorTimer = setInterval(() => {
      const connectionInfo = this.getConnectionInfo();
      console.log('[WebSocket] Connection status:', connectionInfo);

      // 如果长时间未连接且重连次数已满，重置重连计数
      if (
        !connectionInfo.isConnected &&
        connectionInfo.reconnectAttempts >= connectionInfo.maxReconnectAttempts
      ) {
        console.log(
          '[WebSocket] Resetting reconnect attempts for long-running app'
        );
        this.resetReconnectAttempts();
      }

      // 检查心跳超时（如果超过60秒没有心跳响应，认为连接异常）
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
      if (connectionInfo.isConnected && timeSinceLastHeartbeat > 60000) {
        console.warn(
          '[WebSocket] Heartbeat timeout detected, closing connection'
        );
        this.ws.close();
      }
    }, 60000); // 每分钟检查一次
  }

  // 🔧 新增：停止连接状态监控
  stopConnectionMonitor() {
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer);
      this.connectionMonitorTimer = null;
    }
  }

  // 🔧 新增：设置网络状态监听
  setupNetworkListeners() {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      console.log('[WebSocket] Network came online, attempting reconnection');
      if (!this.isConnected()) {
        this.resetReconnectAttempts();
        this.connect();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[WebSocket] Network went offline');
      this.emit('networkOffline');
    });

    // 监听页面可见性变化（防止页面隐藏时连接被断开）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[WebSocket] Page became visible, checking connection');
        if (!this.isConnected()) {
          this.resetReconnectAttempts();
          this.connect();
        }
      }
    });
  }

  // 🔧 新增：重置重连计数（用于长时间运行后重置）
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
    console.log('[WebSocket] Reconnect attempts reset');
  }

  getReadyState() {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // 🔧 新增：获取连接状态信息
  getConnectionInfo() {
    return {
      isConnected: this.isConnected(),
      readyState: this.getReadyState(),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      lastHeartbeat: this.lastHeartbeat,
      timeSinceLastHeartbeat: Date.now() - this.lastHeartbeat,
      isManualClose: this.isManualClose,
      heartbeatActive: !!this.heartbeatTimer,
      monitorActive: !!this.connectionMonitorTimer,
    };
  }

  // 🔧 新增：手动发送心跳（用于测试）
  sendHeartbeat() {
    if (this.isConnected()) {
      this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      this.lastHeartbeat = Date.now();
      console.log('[WebSocket] Manual heartbeat sent');
      return true;
    }
    return false;
  }
}
