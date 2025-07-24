class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.callbacks = {};
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.maxReconnectAttempts = 50; // 🔧 增加最大重连次数以支持长时间运行
    this.reconnectAttempts = 0;
    this.isManualClose = false;
    this.connectionId = this.generateConnectionId();

    // 🔧 新增：心跳包相关
    this.heartbeatInterval = 30000; // 30秒心跳
    this.heartbeatTimer = null;
    this.lastHeartbeat = Date.now();
    this.lastHeartbeatReceived = Date.now();
    this.missedHeartbeats = 0;
    this.heartbeatTimeout = 10000; // 心跳超时10秒
    this.maxMissedHeartbeats = 3; // 最大错过心跳次数

    // 🔧 新增：连接状态监控
    this.connectionMonitorTimer = null;
    this.lastConnectionCheck = Date.now();
    this.lastConnectionTime = null;
    this.lastMessageTime = null;

    // 🔧 新增：网络质量监控
    this.connectionQuality = 'unknown';
    this.networkType = 'unknown';

    // 🔧 新增：性能优化
    this.messageQueue = [];
    this.maxQueueSize = 100;
    this.debounceTimer = null;
    this.debounceDelay = 3000; // 防抖延迟3秒

    // 🔧 新增：系统休眠/唤醒检测
    this.lastActivityTime = Date.now();
    this.suspensionThreshold = 60000; // 1分钟阈值

    // 🔧 新增：网络状态监听
    this.setupNetworkListeners();
    this.setupPowerManagement();
  }

  // 🔧 新增：生成唯一连接ID
  generateConnectionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      console.log('[WebSocket] 已连接，跳过重连');
      return;
    }

    console.log(
      `[WebSocket] 开始连接 (尝试 ${this.reconnectAttempts + 1}): ${this.url}`
    );
    this.isManualClose = false;

    try {
      this.ws = new WebSocket(this.url);

      // 🔧 新增：连接超时检测
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.warn('[WebSocket] 连接超时，关闭连接');
          this.ws.close();
        }
      }, 15000); // 15秒超时

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);

        const now = Date.now();
        this.lastConnectionTime = now;
        this.lastActivityTime = now;
        this.networkType = this.detectNetworkType();

        console.log('[WebSocket] ✅ 连接建立成功');
        this.reconnectAttempts = 0;
        this.emit('connected', {
          connectionId: this.connectionId,
          timestamp: now,
        });
        this.clearReconnectTimer();

        // 🔧 新增：连接成功后启动心跳
        this.startHeartbeat();

        // 🔧 新增：启动连接状态监控
        this.startConnectionMonitor();

        // 🔧 新增：发送队列中的消息
        this.flushMessageQueue();
      };

      this.ws.onmessage = (event) => {
        const now = Date.now();
        this.lastMessageTime = now;
        this.lastActivityTime = now;

        try {
          console.log('[WebSocket] 收到消息:', event.data);

          // 尝试解析 JSON，如果失败则作为纯文本处理
          let data;
          try {
            data = JSON.parse(event.data);
            console.log('[WebSocket] JSON消息解析成功:', data);

            // 🔧 增强：处理心跳响应
            if (data.type === 'pong') {
              this.handleHeartbeatResponse(data);
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
            console.log('[WebSocket] 收到文本消息:', event.data);
            this.emit('textMessage', event.data);
            this.emit('message', { type: 'text', content: event.data });
          }
        } catch (error) {
          console.error('[WebSocket] 消息处理失败:', error);
          this.emit('messageError', error);
        }
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);

        console.log(`[WebSocket] 连接关闭: ${event.code} - ${event.reason}`);
        if (event.code === 1006) {
          console.log(
            '[WebSocket] 连接异常关闭 (1006) - 可能是服务器拒绝连接或网络问题'
          );
        }

        // 🔧 新增：记录连接持续时间
        if (this.lastConnectionTime) {
          const duration = Date.now() - this.lastConnectionTime;
          console.log(`[WebSocket] 连接持续时间: ${duration}ms`);
        }

        this.emit('disconnected', {
          code: event.code,
          reason: event.reason,
          connectionId: this.connectionId,
        });

        // 🔧 新增：停止心跳和监控
        this.stopHeartbeat();
        this.stopConnectionMonitor();

        if (
          !this.isManualClose &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[WebSocket] ❌ 达到最大重连次数，停止重连');
          this.emit('maxReconnectAttemptsReached');
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('[WebSocket] 连接错误:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    console.log('[WebSocket] 手动断开连接');
    this.isManualClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat(); // 🔧 新增：停止心跳
    this.stopConnectionMonitor(); // 🔧 新增：停止监控

    // 🔧 新增：清理防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emit('manualDisconnect');
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.ws.send(message);
        this.lastActivityTime = Date.now();
        return true;
      } catch (error) {
        console.error('[WebSocket] 发送消息失败:', error);
        return false;
      }
    } else {
      // 🔧 新增：如果未连接，将消息加入队列
      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(data);
        console.log('[WebSocket] 消息已加入队列，等待连接');
        return false;
      } else {
        console.warn('[WebSocket] 消息队列已满，丢弃消息');
        return false;
      }
    }
  }

  // 🔧 新增：发送队列中的消息
  flushMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log(`[WebSocket] 发送队列中的 ${this.messageQueue.length} 条消息`);

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((message) => {
      this.send(message);
    });
  }

  // 🔧 增强：启动心跳包
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();
    this.lastHeartbeatReceived = Date.now();
    this.missedHeartbeats = 0;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);

    console.log(`[WebSocket] 心跳已启动，间隔: ${this.heartbeatInterval}ms`);
  }

  // 🔧 新增：发送心跳
  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const now = Date.now();
        const heartbeatData = {
          type: 'ping',
          timestamp: now,
          connectionId: this.connectionId,
        };

        this.ws.send(JSON.stringify(heartbeatData));
        this.lastHeartbeat = now;
        this.lastActivityTime = now;

        console.log('[WebSocket] 💓 心跳已发送');

        // 设置心跳超时检测
        setTimeout(() => {
          if (
            this.lastHeartbeat === now &&
            (!this.lastHeartbeatReceived || this.lastHeartbeatReceived < now)
          ) {
            this.missedHeartbeats++;
            console.warn(
              `[WebSocket] 心跳超时 (错过 ${this.missedHeartbeats} 次)`
            );

            if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
              console.error('[WebSocket] 心跳失败次数过多，关闭连接');
              this.connectionQuality = 'bad';
              this.ws.close();
            } else if (this.missedHeartbeats >= 2) {
              this.connectionQuality = 'poor';
            }
          }
        }, this.heartbeatTimeout);

        return true;
      } catch (error) {
        console.error('[WebSocket] 心跳发送失败:', error);
        this.ws.close();
        return false;
      }
    } else {
      console.log('[WebSocket] 连接未打开，停止心跳');
      this.stopHeartbeat();
      return false;
    }
  }

  // 🔧 新增：处理心跳响应
  handleHeartbeatResponse(data) {
    const now = Date.now();
    this.lastHeartbeatReceived = now;
    this.missedHeartbeats = 0;
    this.connectionQuality = 'good';

    // 计算延迟
    if (data.timestamp && this.lastHeartbeat) {
      const latency = now - this.lastHeartbeat;
      console.log(`[WebSocket] 心跳延迟: ${latency}ms`);

      // 根据延迟评估连接质量
      if (latency > 5000) {
        this.connectionQuality = 'poor';
      } else if (latency > 10000) {
        this.connectionQuality = 'bad';
      }
    }

    console.log('[WebSocket] 💓 心跳响应已收到');
  }

  // 🔧 新增：停止心跳包
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // 🔧 增强：指数退避重连策略
  scheduleReconnect() {
    if (this.isManualClose) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error('[WebSocket] ❌ 达到最大重连次数，停止重连');
      this.emit('maxReconnectAttemptsReached', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
      });
      return;
    }

    // 🔧 增强：指数退避策略（带随机抖动）
    const baseDelay =
      this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    const maxDelay = 60000; // 最大60秒
    const backoffDelay = Math.min(baseDelay, maxDelay);

    // 添加随机抖动以避免雷群效应
    const jitter = backoffDelay * 0.1 * (Math.random() - 0.5);
    const finalDelay = Math.max(backoffDelay + jitter, 1000);

    console.log(
      `[WebSocket] 🔄 将在 ${finalDelay}ms 后重连 (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, finalDelay);

    this.emit('reconnectScheduled', {
      attempt: this.reconnectAttempts,
      delay: finalDelay,
      maxAttempts: this.maxReconnectAttempts,
    });
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // 🔧 增强：启动连接状态监控
  startConnectionMonitor() {
    this.stopConnectionMonitor();
    this.lastConnectionCheck = Date.now();

    this.connectionMonitorTimer = setInterval(() => {
      this.checkConnectionHealth();
    }, 30000); // 每30秒检查一次

    console.log('[WebSocket] 连接监控已启动');
  }

  // 🔧 新增：检查连接健康状况
  checkConnectionHealth() {
    if (!this.isConnected()) {
      // 如果长时间未连接且重连次数已满，重置重连计数
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        const timeSinceLastConnection =
          Date.now() - (this.lastConnectionTime || 0);
        if (timeSinceLastConnection > 300000) {
          // 5分钟后重置
          console.log('[WebSocket] 长时间未连接，重置重连计数');
          this.resetReconnectAttempts();
        }
      }
      return;
    }

    const now = Date.now();
    const timeSinceLastMessage = now - (this.lastMessageTime || now);
    const timeSinceLastHeartbeat = now - (this.lastHeartbeatReceived || now);

    // 检查是否需要发送测试心跳
    if (timeSinceLastMessage > 120000 || timeSinceLastHeartbeat > 90000) {
      console.log('[WebSocket] 连接可能有问题，发送测试心跳');
      this.sendHeartbeat();
    }

    // 检查心跳超时
    if (timeSinceLastHeartbeat > 120000) {
      console.warn('[WebSocket] 心跳严重超时，关闭连接');
      this.connectionQuality = 'bad';
      this.ws.close();
    }

    // 根据连接质量调整心跳频率
    this.adaptHeartbeatInterval();
  }

  // 🔧 新增：停止连接状态监控
  stopConnectionMonitor() {
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer);
      this.connectionMonitorTimer = null;
    }
  }

  // 🔧 增强：设置网络状态监听
  setupNetworkListeners() {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      console.log('[WebSocket] 网络已连接，尝试重连');
      this.networkType = this.detectNetworkType();
      this.emit('networkOnline');

      if (!this.isConnected()) {
        this.resetReconnectAttempts();
        this.debounceReconnect();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[WebSocket] 网络已断开');
      this.networkType = 'offline';
      this.emit('networkOffline');
    });

    // 监听页面可见性变化（防止页面隐藏时连接被断开）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[WebSocket] 页面变为可见，检查连接状态');
        this.checkSystemResume();

        if (!this.isConnected()) {
          this.resetReconnectAttempts();
          this.debounceReconnect();
        } else {
          // 立即发送心跳检查连接质量
          this.sendHeartbeat();
        }
      } else {
        console.log('[WebSocket] 页面变为隐藏');
        // 页面隐藏时适当降低心跳频率
        this.adaptHeartbeatInterval();
      }
    });

    // 监听网络类型变化（如果支持）
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', () => {
        const newType = this.detectNetworkType();
        if (newType !== this.networkType) {
          console.log(
            `[WebSocket] 网络类型变化: ${this.networkType} -> ${newType}`
          );
          this.networkType = newType;
          this.adaptHeartbeatInterval();
        }
      });
    }
  }

  // 🔧 新增：电源管理和休眠检测
  setupPowerManagement() {
    // 定期检查系统是否从休眠中恢复
    setInterval(() => {
      this.checkSystemResume();
    }, 30000); // 每30秒检查一次

    // 监听窗口焦点事件作为额外的唤醒检测
    window.addEventListener('focus', () => {
      this.checkSystemResume();
    });

    // 监听鼠标和键盘活动（用于检测系统活跃状态）
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(
      (event) => {
        document.addEventListener(
          event,
          () => {
            this.lastActivityTime = Date.now();
          },
          { passive: true }
        );
      }
    );
  }

  // 🔧 新增：检查系统是否从休眠中恢复
  checkSystemResume() {
    const now = Date.now();
    const timeDiff = now - this.lastActivityTime;

    // 如果时间差超过阈值，可能发生了系统休眠
    if (timeDiff > this.suspensionThreshold) {
      console.log(
        `[WebSocket] 检测到可能的系统休眠/唤醒，时间差: ${timeDiff}ms`
      );
      this.emit('systemWakeup', { suspendTime: timeDiff });

      // 重置状态并检查连接
      this.lastActivityTime = now;

      if (!this.isConnected()) {
        this.resetReconnectAttempts();
        this.connect();
      } else {
        // 立即发送心跳检查连接质量
        this.sendHeartbeat();
      }
    }
  }

  // 🔧 新增：检测网络类型
  detectNetworkType() {
    if (!navigator.onLine) return 'offline';

    if ('connection' in navigator) {
      const conn = navigator.connection;
      return conn.effectiveType || conn.type || 'unknown';
    }

    return 'unknown';
  }

  // 🔧 新增：自适应心跳间隔
  adaptHeartbeatInterval() {
    let interval = 30000; // 基础间隔30秒

    // 根据网络类型调整
    if (this.networkType === 'slow-2g' || this.networkType === '2g') {
      interval = 60000; // 慢网络增加到60秒
    } else if (this.networkType === '4g' || this.networkType === '5g') {
      interval = 25000; // 快网络减少到25秒
    }

    // 根据连接质量调整
    if (this.connectionQuality === 'poor') {
      interval = Math.max(interval * 0.7, 20000); // 连接质量差时更频繁
    } else if (this.connectionQuality === 'bad') {
      interval = Math.max(interval * 0.5, 15000); // 连接质量很差时非常频繁
    }

    // 根据页面可见性调整
    if (document.visibilityState === 'hidden') {
      interval = Math.min(interval * 1.5, 120000); // 页面隐藏时减少频率
    }

    if (interval !== this.heartbeatInterval) {
      this.heartbeatInterval = interval;
      this.restartHeartbeat();
    }
  }

  // 🔧 新增：重启心跳定时器
  restartHeartbeat() {
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  // 🔧 新增：防抖重连
  debounceReconnect() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (!this.isConnected()) {
        this.connect();
      }
    }, this.debounceDelay);
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

  // 🔧 增强：获取连接状态信息
  getConnectionInfo() {
    return {
      connectionId: this.connectionId,
      isConnected: this.isConnected(),
      readyState: this.getReadyState(),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      lastHeartbeat: this.lastHeartbeat,
      lastHeartbeatReceived: this.lastHeartbeatReceived,
      missedHeartbeats: this.missedHeartbeats,
      timeSinceLastHeartbeat:
        Date.now() - (this.lastHeartbeatReceived || this.lastHeartbeat),
      timeSinceLastMessage: Date.now() - (this.lastMessageTime || Date.now()),
      isManualClose: this.isManualClose,
      heartbeatActive: !!this.heartbeatTimer,
      monitorActive: !!this.connectionMonitorTimer,
      connectionQuality: this.connectionQuality,
      networkType: this.networkType,
      queueSize: this.messageQueue.length,
      lastConnectionTime: this.lastConnectionTime,
    };
  }

  // 🔧 新增：强制重连
  forceReconnect() {
    console.log('[WebSocket] 🔄 强制重连...');

    this.resetReconnectAttempts();
    this.disconnect();

    setTimeout(() => {
      this.isManualClose = false;
      this.connect();
    }, 1000);
  }

  // 🔧 新增：获取详细状态（用于调试）
  getDetailedStatus() {
    return {
      connection: this.getConnectionInfo(),
      config: {
        url: this.url,
        heartbeatInterval: this.heartbeatInterval,
        maxReconnectAttempts: this.maxReconnectAttempts,
        reconnectInterval: this.reconnectInterval,
      },
      timestamps: {
        lastConnectionTime: this.lastConnectionTime,
        lastMessageTime: this.lastMessageTime,
        lastActivityTime: this.lastActivityTime,
        lastHeartbeat: this.lastHeartbeat,
        lastHeartbeatReceived: this.lastHeartbeatReceived,
      },
    };
  }
}
