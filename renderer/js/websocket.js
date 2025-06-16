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
      };

      this.ws.onmessage = (event) => {
        try {
          console.log('[WebSocket] Raw message received:', event.data);

          // 尝试解析 JSON，如果失败则作为纯文本处理
          let data;
          try {
            data = JSON.parse(event.data);
            console.log('[WebSocket] JSON message parsed:', data);

            // 根据消息类型分发事件
            if (data.type === 'new_order') {
              this.emit('newOrder', data);
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

    console.log(
      `[WebSocket] Will reconnect in ${this.reconnectInterval}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  getReadyState() {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
