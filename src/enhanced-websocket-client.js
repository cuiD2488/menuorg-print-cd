// 增强版 WebSocket 客户端
// 支持断网重连、电脑休眠重开、长时间运行等各种场景
// 同时优化性能，避免过度消耗资源

console.log('[ENHANCED-WEBSOCKET] 增强版WebSocket客户端开始加载...');

class EnhancedWebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.ws = null;
    this.callbacks = {};

    // 基础配置
    this.isManualClose = false;
    this.connectionId = this.generateConnectionId();

    // 重连配置 - 指数退避策略
    this.reconnectConfig = {
      enabled: true,
      minDelay: 1000, // 最小重连延迟1秒
      maxDelay: 60000, // 最大重连延迟60秒
      maxAttempts: 50, // 最大重连次数（增加以支持长时间运行）
      backoffMultiplier: 1.5, // 退避倍数
      jitterRange: 0.1, // 随机抖动范围
      ...options.reconnect,
    };

    // 心跳配置 - 自适应心跳间隔
    this.heartbeatConfig = {
      enabled: true,
      baseInterval: 30000, // 基础心跳间隔30秒
      maxInterval: 120000, // 最大心跳间隔2分钟
      timeout: 10000, // 心跳超时10秒
      missedThreshold: 3, // 连续错过心跳次数阈值
      adaptiveEnabled: true, // 启用自适应心跳
      ...options.heartbeat,
    };

    // 连接质量监控配置
    this.qualityConfig = {
      enabled: true,
      sampleWindow: 10, // 采样窗口大小
      latencyThreshold: 5000, // 延迟阈值5秒
      timeoutThreshold: 15000, // 响应超时阈值15秒
      checkInterval: 60000, // 质量检查间隔1分钟
      ...options.quality,
    };

    // 性能优化配置
    this.performanceConfig = {
      messageQueueSize: 100, // 消息队列大小
      batchProcessing: true, // 批量处理消息
      debounceReconnect: 5000, // 重连防抖延迟
      ...options.performance,
    };

    // 运行时状态
    this.state = {
      connectionAttempts: 0,
      currentDelay: this.reconnectConfig.minDelay,
      lastConnectionTime: null,
      lastMessageTime: null,
      lastHeartbeatSent: null,
      lastHeartbeatReceived: null,
      missedHeartbeats: 0,
      isReconnecting: false,
      connectionQuality: 'unknown', // unknown, good, poor, bad
      networkType: 'unknown',
    };

    // 质量监控数据
    this.qualityMetrics = {
      latencies: [],
      connectionDurations: [],
      reconnectCounts: 0,
      messageCount: 0,
      errorCount: 0,
    };

    // 定时器引用
    this.timers = {
      reconnect: null,
      heartbeat: null,
      qualityCheck: null,
      connectionMonitor: null,
      debounceReconnect: null,
    };

    // 消息队列（离线时缓存）
    this.messageQueue = [];

    console.log('[ENHANCED-WEBSOCKET] 客户端初始化完成', this.connectionId);

    // 初始化监听器
    this.initializeListeners();
  }

  // 生成连接ID
  generateConnectionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 初始化各种监听器
  initializeListeners() {
    this.setupNetworkListeners();
    this.setupVisibilityListeners();
    this.setupPowerListeners();
    this.startQualityMonitoring();
  }

  // 网络状态监听器
  setupNetworkListeners() {
    // 网络连接状态变化
    window.addEventListener('online', () => {
      console.log('[ENHANCED-WEBSOCKET] 网络已连接');
      this.state.networkType = this.detectNetworkType();
      this.emit('networkOnline');

      if (!this.isConnected()) {
        this.resetReconnectState();
        this.debounceReconnect();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[ENHANCED-WEBSOCKET] 网络已断开');
      this.state.networkType = 'offline';
      this.emit('networkOffline');
    });

    // 检测网络类型变化（如果支持）
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', () => {
        const newType = this.detectNetworkType();
        if (newType !== this.state.networkType) {
          console.log(
            `[ENHANCED-WEBSOCKET] 网络类型变化: ${this.state.networkType} -> ${newType}`
          );
          this.state.networkType = newType;
          this.adaptHeartbeatInterval();
        }
      });
    }
  }

  // 页面可见性监听器
  setupVisibilityListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[ENHANCED-WEBSOCKET] 页面变为可见');
        this.emit('pageVisible');

        // 检查连接状态，如果断开则尝试重连
        if (!this.isConnected()) {
          this.resetReconnectState();
          this.debounceReconnect();
        } else {
          // 立即发送心跳检查连接质量
          this.sendHeartbeat(true);
        }
      } else {
        console.log('[ENHANCED-WEBSOCKET] 页面变为隐藏');
        this.emit('pageHidden');

        // 页面隐藏时可以适当减少心跳频率
        this.adaptHeartbeatInterval();
      }
    });
  }

  // 电源状态监听器（检测休眠/唤醒）
  setupPowerListeners() {
    // 检测系统休眠/唤醒
    let lastActivity = Date.now();

    const checkSuspension = () => {
      const now = Date.now();
      const timeDiff = now - lastActivity;

      // 如果时间差超过阈值，可能发生了系统休眠
      if (timeDiff > 60000) {
        // 1分钟阈值
        console.log(
          `[ENHANCED-WEBSOCKET] 检测到可能的系统休眠/唤醒，时间差: ${timeDiff}ms`
        );
        this.emit('systemWakeup', { suspendTime: timeDiff });

        // 重置连接状态并重连
        if (!this.isConnected()) {
          this.resetReconnectState();
          this.connect();
        } else {
          // 立即检查连接质量
          this.sendHeartbeat(true);
        }
      }

      lastActivity = now;
    };

    // 定期检查（间隔较长以避免影响性能）
    setInterval(checkSuspension, 30000);

    // 监听焦点事件作为额外的唤醒检测
    window.addEventListener('focus', () => {
      checkSuspension();
    });
  }

  // 启动连接质量监控
  startQualityMonitoring() {
    if (!this.qualityConfig.enabled) return;

    this.stopQualityMonitoring();

    this.timers.qualityCheck = setInterval(() => {
      this.analyzeConnectionQuality();
    }, this.qualityConfig.checkInterval);
  }

  // 停止连接质量监控
  stopQualityMonitoring() {
    if (this.timers.qualityCheck) {
      clearInterval(this.timers.qualityCheck);
      this.timers.qualityCheck = null;
    }
  }

  // 分析连接质量
  analyzeConnectionQuality() {
    if (!this.isConnected()) {
      this.state.connectionQuality = 'disconnected';
      return;
    }

    const { latencies, connectionDurations } = this.qualityMetrics;

    // 计算平均延迟
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    // 计算连接稳定性
    const timeSinceLastMessage =
      Date.now() - (this.state.lastMessageTime || Date.now());
    const heartbeatHealth =
      this.state.missedHeartbeats / this.heartbeatConfig.missedThreshold;

    // 质量评估
    let quality = 'good';
    if (
      avgLatency > this.qualityConfig.latencyThreshold ||
      heartbeatHealth > 0.6 ||
      timeSinceLastMessage > this.qualityConfig.timeoutThreshold
    ) {
      quality = 'poor';
    }
    if (
      avgLatency > this.qualityConfig.latencyThreshold * 2 ||
      heartbeatHealth > 0.8
    ) {
      quality = 'bad';
    }

    if (quality !== this.state.connectionQuality) {
      console.log(
        `[ENHANCED-WEBSOCKET] 连接质量变化: ${this.state.connectionQuality} -> ${quality}`
      );
      this.state.connectionQuality = quality;
      this.emit('qualityChange', {
        quality,
        metrics: { avgLatency, heartbeatHealth },
      });

      // 根据质量调整心跳间隔
      this.adaptHeartbeatInterval();
    }

    // 清理旧的指标数据
    this.cleanupMetrics();
  }

  // 检测网络类型
  detectNetworkType() {
    if (!navigator.onLine) return 'offline';

    if ('connection' in navigator) {
      const conn = navigator.connection;
      return conn.effectiveType || conn.type || 'unknown';
    }

    return 'unknown';
  }

  // 自适应心跳间隔
  adaptHeartbeatInterval() {
    if (!this.heartbeatConfig.adaptiveEnabled) return;

    let interval = this.heartbeatConfig.baseInterval;

    // 根据网络类型调整
    if (
      this.state.networkType === 'slow-2g' ||
      this.state.networkType === '2g'
    ) {
      interval = Math.min(interval * 2, this.heartbeatConfig.maxInterval);
    } else if (
      this.state.networkType === '4g' ||
      this.state.networkType === '5g'
    ) {
      interval = Math.max(interval * 0.8, this.heartbeatConfig.baseInterval);
    }

    // 根据连接质量调整
    if (this.state.connectionQuality === 'poor') {
      interval = Math.max(
        interval * 0.7,
        this.heartbeatConfig.baseInterval * 0.5
      );
    } else if (this.state.connectionQuality === 'bad') {
      interval = Math.max(
        interval * 0.5,
        this.heartbeatConfig.baseInterval * 0.3
      );
    }

    // 根据页面可见性调整
    if (document.visibilityState === 'hidden') {
      interval = Math.min(interval * 1.5, this.heartbeatConfig.maxInterval);
    }

    // 应用新的间隔
    if (this.timers.heartbeat) {
      this.heartbeatConfig.currentInterval = interval;
      this.restartHeartbeat();
    }
  }

  // 重启心跳定时器
  restartHeartbeat() {
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  // 防抖重连
  debounceReconnect() {
    if (this.timers.debounceReconnect) {
      clearTimeout(this.timers.debounceReconnect);
    }

    this.timers.debounceReconnect = setTimeout(() => {
      if (!this.isConnected() && !this.state.isReconnecting) {
        this.connect();
      }
    }, this.performanceConfig.debounceReconnect);
  }

  // 重置重连状态
  resetReconnectState() {
    this.state.connectionAttempts = 0;
    this.state.currentDelay = this.reconnectConfig.minDelay;
    this.state.isReconnecting = false;
    console.log('[ENHANCED-WEBSOCKET] 重连状态已重置');
  }

  // 事件监听器管理
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
          console.error('[ENHANCED-WEBSOCKET] 事件回调执行失败:', error);
        }
      });
    }
  }

  // 连接到WebSocket
  connect() {
    if (this.isConnected()) {
      console.log('[ENHANCED-WEBSOCKET] 已连接，跳过重连');
      return;
    }

    if (this.state.isReconnecting) {
      console.log('[ENHANCED-WEBSOCKET] 正在重连中，跳过重复请求');
      return;
    }

    console.log(
      `[ENHANCED-WEBSOCKET] 开始连接 (尝试 ${
        this.state.connectionAttempts + 1
      }): ${this.url}`
    );

    this.state.isReconnecting = true;
    this.isManualClose = false;
    this.clearAllTimers();

    try {
      this.ws = new WebSocket(this.url);

      // 连接超时检测
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.warn('[ENHANCED-WEBSOCKET] 连接超时，关闭连接');
          this.ws.close();
        }
      }, 15000); // 15秒超时

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);

        const now = Date.now();
        this.state.lastConnectionTime = now;
        this.state.connectionAttempts = 0;
        this.state.currentDelay = this.reconnectConfig.minDelay;
        this.state.isReconnecting = false;
        this.state.networkType = this.detectNetworkType();

        console.log('[ENHANCED-WEBSOCKET] ✅ 连接建立成功');

        this.emit('connected', {
          connectionId: this.connectionId,
          timestamp: now,
          attempts: this.state.connectionAttempts,
        });

        // 启动心跳和监控
        this.startHeartbeat();
        this.startConnectionMonitor();

        // 发送队列中的消息
        this.flushMessageQueue();

        // 记录连接成功指标
        this.qualityMetrics.reconnectCounts++;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.handleClose(event);
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.handleError(error);
      };
    } catch (error) {
      this.state.isReconnecting = false;
      console.error('[ENHANCED-WEBSOCKET] 连接创建失败:', error);
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  // 处理收到的消息
  handleMessage(event) {
    const now = Date.now();
    this.state.lastMessageTime = now;
    this.qualityMetrics.messageCount++;

    try {
      console.log('[ENHANCED-WEBSOCKET] 收到消息:', event.data);

      let data;
      try {
        data = JSON.parse(event.data);

        // 处理心跳响应
        if (data.type === 'pong') {
          this.handleHeartbeatResponse(data);
          return;
        }

        // 分发消息事件
        this.distributeMessage(data);
      } catch (parseError) {
        // 处理非JSON消息
        console.log('[ENHANCED-WEBSOCKET] 收到文本消息:', event.data);
        this.emit('textMessage', event.data);
        this.emit('message', { type: 'text', content: event.data });
      }
    } catch (error) {
      console.error('[ENHANCED-WEBSOCKET] 消息处理失败:', error);
      this.emit('messageError', error);
      this.qualityMetrics.errorCount++;
    }
  }

  // 分发消息到相应的事件处理器
  distributeMessage(data) {
    // 根据消息类型分发事件
    if (data.type === 'order' || data.type === 'new_order') {
      this.emit('newOrder', data.data || data);
    } else if (data.type === 'order_update') {
      this.emit('orderUpdate', data);
    } else {
      this.emit('message', data);
    }
  }

  // 处理连接关闭
  handleClose(event) {
    this.state.isReconnecting = false;
    this.clearAllTimers();

    console.log(
      `[ENHANCED-WEBSOCKET] 连接关闭: ${event.code} - ${event.reason}`
    );

    // 记录连接持续时间
    if (this.state.lastConnectionTime) {
      const duration = Date.now() - this.state.lastConnectionTime;
      this.qualityMetrics.connectionDurations.push(duration);
    }

    this.emit('disconnected', {
      code: event.code,
      reason: event.reason,
      connectionId: this.connectionId,
    });

    // 如果不是手动关闭，则尝试重连
    if (!this.isManualClose) {
      this.scheduleReconnect();
    }
  }

  // 处理连接错误
  handleError(error) {
    console.error('[ENHANCED-WEBSOCKET] 连接错误:', error);
    this.qualityMetrics.errorCount++;
    this.emit('error', error);
  }

  // 处理心跳响应
  handleHeartbeatResponse(data) {
    const now = Date.now();
    this.state.lastHeartbeatReceived = now;
    this.state.missedHeartbeats = 0;

    // 计算延迟
    if (data.timestamp && this.state.lastHeartbeatSent) {
      const latency = now - this.state.lastHeartbeatSent;
      this.qualityMetrics.latencies.push(latency);
      console.log(`[ENHANCED-WEBSOCKET] 心跳延迟: ${latency}ms`);
    }
  }

  // 计划重连
  scheduleReconnect() {
    if (this.isManualClose || !this.reconnectConfig.enabled) {
      return;
    }

    this.clearReconnectTimer();
    this.state.connectionAttempts++;

    if (this.state.connectionAttempts > this.reconnectConfig.maxAttempts) {
      console.error('[ENHANCED-WEBSOCKET] ❌ 达到最大重连次数，停止重连');
      this.emit('maxReconnectAttemptsReached', {
        attempts: this.state.connectionAttempts,
        maxAttempts: this.reconnectConfig.maxAttempts,
      });
      return;
    }

    // 计算退避延迟（带随机抖动）
    const backoffDelay = Math.min(
      this.state.currentDelay *
        Math.pow(
          this.reconnectConfig.backoffMultiplier,
          this.state.connectionAttempts - 1
        ),
      this.reconnectConfig.maxDelay
    );

    // 添加随机抖动以避免雷群效应
    const jitter =
      backoffDelay * this.reconnectConfig.jitterRange * (Math.random() - 0.5);
    const finalDelay = Math.max(
      backoffDelay + jitter,
      this.reconnectConfig.minDelay
    );

    console.log(
      `[ENHANCED-WEBSOCKET] 🔄 将在 ${finalDelay}ms 后重连 (尝试 ${this.state.connectionAttempts}/${this.reconnectConfig.maxAttempts})`
    );

    this.timers.reconnect = setTimeout(() => {
      this.connect();
    }, finalDelay);

    this.emit('reconnectScheduled', {
      attempt: this.state.connectionAttempts,
      delay: finalDelay,
      maxAttempts: this.reconnectConfig.maxAttempts,
    });
  }

  // 启动心跳
  startHeartbeat() {
    if (!this.heartbeatConfig.enabled) return;

    this.stopHeartbeat();

    const interval =
      this.heartbeatConfig.currentInterval || this.heartbeatConfig.baseInterval;

    this.timers.heartbeat = setInterval(() => {
      this.sendHeartbeat();
    }, interval);

    console.log(`[ENHANCED-WEBSOCKET] 心跳已启动，间隔: ${interval}ms`);
  }

  // 停止心跳
  stopHeartbeat() {
    if (this.timers.heartbeat) {
      clearInterval(this.timers.heartbeat);
      this.timers.heartbeat = null;
    }
  }

  // 发送心跳
  sendHeartbeat(force = false) {
    if (!this.isConnected() && !force) {
      return false;
    }

    try {
      const now = Date.now();
      const heartbeatData = {
        type: 'ping',
        timestamp: now,
        connectionId: this.connectionId,
      };

      this.ws.send(JSON.stringify(heartbeatData));
      this.state.lastHeartbeatSent = now;

      console.log('[ENHANCED-WEBSOCKET] 💓 心跳已发送');

      // 设置心跳超时检测
      setTimeout(() => {
        if (
          this.state.lastHeartbeatSent === now &&
          (!this.state.lastHeartbeatReceived ||
            this.state.lastHeartbeatReceived < now)
        ) {
          this.state.missedHeartbeats++;
          console.warn(
            `[ENHANCED-WEBSOCKET] 心跳超时 (错过 ${this.state.missedHeartbeats} 次)`
          );

          if (
            this.state.missedHeartbeats >= this.heartbeatConfig.missedThreshold
          ) {
            console.error('[ENHANCED-WEBSOCKET] 心跳失败次数过多，关闭连接');
            this.ws.close();
          }
        }
      }, this.heartbeatConfig.timeout);

      return true;
    } catch (error) {
      console.error('[ENHANCED-WEBSOCKET] 心跳发送失败:', error);
      this.ws.close();
      return false;
    }
  }

  // 启动连接监控
  startConnectionMonitor() {
    this.stopConnectionMonitor();

    this.timers.connectionMonitor = setInterval(() => {
      this.checkConnectionHealth();
    }, 30000); // 30秒检查一次
  }

  // 停止连接监控
  stopConnectionMonitor() {
    if (this.timers.connectionMonitor) {
      clearInterval(this.timers.connectionMonitor);
      this.timers.connectionMonitor = null;
    }
  }

  // 检查连接健康状况
  checkConnectionHealth() {
    if (!this.isConnected()) return;

    const now = Date.now();
    const timeSinceLastMessage = now - (this.state.lastMessageTime || now);
    const timeSinceLastHeartbeat =
      now - (this.state.lastHeartbeatReceived || now);

    // 如果太久没有收到消息或心跳响应，发送测试心跳
    if (timeSinceLastMessage > 120000 || timeSinceLastHeartbeat > 90000) {
      console.log('[ENHANCED-WEBSOCKET] 连接可能有问题，发送测试心跳');
      this.sendHeartbeat(true);
    }
  }

  // 断开连接
  disconnect() {
    console.log('[ENHANCED-WEBSOCKET] 手动断开连接');

    this.isManualClose = true;
    this.state.isReconnecting = false;
    this.clearAllTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emit('manualDisconnect');
  }

  // 发送消息
  send(data) {
    if (this.isConnected()) {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.ws.send(message);
        return true;
      } catch (error) {
        console.error('[ENHANCED-WEBSOCKET] 发送消息失败:', error);
        this.qualityMetrics.errorCount++;
        return false;
      }
    } else {
      // 如果未连接，将消息加入队列
      if (this.messageQueue.length < this.performanceConfig.messageQueueSize) {
        this.messageQueue.push(data);
        console.log('[ENHANCED-WEBSOCKET] 消息已加入队列，等待连接');
        return false;
      } else {
        console.warn('[ENHANCED-WEBSOCKET] 消息队列已满，丢弃消息');
        return false;
      }
    }
  }

  // 发送队列中的消息
  flushMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log(
      `[ENHANCED-WEBSOCKET] 发送队列中的 ${this.messageQueue.length} 条消息`
    );

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((message) => {
      this.send(message);
    });
  }

  // 清理所有定时器
  clearAllTimers() {
    Object.values(this.timers).forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
      }
    });

    this.timers = {
      reconnect: null,
      heartbeat: null,
      qualityCheck: null,
      connectionMonitor: null,
      debounceReconnect: null,
    };
  }

  // 清理重连定时器
  clearReconnectTimer() {
    if (this.timers.reconnect) {
      clearTimeout(this.timers.reconnect);
      this.timers.reconnect = null;
    }
  }

  // 清理指标数据
  cleanupMetrics() {
    const maxSamples = this.qualityConfig.sampleWindow;

    if (this.qualityMetrics.latencies.length > maxSamples) {
      this.qualityMetrics.latencies = this.qualityMetrics.latencies.slice(
        -maxSamples
      );
    }

    if (this.qualityMetrics.connectionDurations.length > maxSamples) {
      this.qualityMetrics.connectionDurations =
        this.qualityMetrics.connectionDurations.slice(-maxSamples);
    }
  }

  // 获取连接状态
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // 获取连接状态字符串
  getReadyState() {
    if (!this.ws) return 'CLOSED';

    const states = {
      [WebSocket.CONNECTING]: 'CONNECTING',
      [WebSocket.OPEN]: 'OPEN',
      [WebSocket.CLOSING]: 'CLOSING',
      [WebSocket.CLOSED]: 'CLOSED',
    };

    return states[this.ws.readyState] || 'UNKNOWN';
  }

  // 获取详细状态信息
  getStatus() {
    return {
      connectionId: this.connectionId,
      isConnected: this.isConnected(),
      readyState: this.getReadyState(),
      state: { ...this.state },
      config: {
        reconnect: this.reconnectConfig,
        heartbeat: this.heartbeatConfig,
        quality: this.qualityConfig,
      },
      metrics: { ...this.qualityMetrics },
      queueSize: this.messageQueue.length,
    };
  }

  // 强制重连
  forceReconnect() {
    console.log('[ENHANCED-WEBSOCKET] 🔄 强制重连...');

    this.resetReconnectState();
    this.disconnect();

    setTimeout(() => {
      this.connect();
    }, 1000);
  }

  // 更新配置
  updateConfig(newConfig) {
    if (newConfig.reconnect) {
      this.reconnectConfig = {
        ...this.reconnectConfig,
        ...newConfig.reconnect,
      };
    }
    if (newConfig.heartbeat) {
      this.heartbeatConfig = {
        ...this.heartbeatConfig,
        ...newConfig.heartbeat,
      };
      this.adaptHeartbeatInterval();
    }
    if (newConfig.quality) {
      this.qualityConfig = { ...this.qualityConfig, ...newConfig.quality };
    }

    console.log('[ENHANCED-WEBSOCKET] 配置已更新');
  }

  // 销毁客户端
  destroy() {
    console.log('[ENHANCED-WEBSOCKET] 销毁客户端');

    this.disconnect();
    this.clearAllTimers();
    this.stopQualityMonitoring();

    // 清理事件监听器
    this.callbacks = {};
    this.messageQueue = [];

    // 移除全局事件监听器
    // 注意：这里只能移除我们自己添加的监听器
    // 由于我们使用的是全局addEventListener，实际项目中需要保存引用以便移除
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.EnhancedWebSocketClient = EnhancedWebSocketClient;
  console.log('[ENHANCED-WEBSOCKET] 增强版WebSocket客户端已加载到全局作用域');
}

// Node.js导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedWebSocketClient;
}

console.log('[ENHANCED-WEBSOCKET] 增强版WebSocket客户端加载完成');
