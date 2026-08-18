(() => {
  const NativeWebSocket = window.WebSocket;
  const instances = new Set();

  class ResilientWebSocket extends EventTarget {
    static CONNECTING = NativeWebSocket.CONNECTING;
    static OPEN = NativeWebSocket.OPEN;
    static CLOSING = NativeWebSocket.CLOSING;
    static CLOSED = NativeWebSocket.CLOSED;

    constructor(url, protocols) {
      super();
      this.url = url;
      this.protocols = protocols;
      this.readyState = NativeWebSocket.CONNECTING;
      this.protocol = '';
      this.extensions = '';
      this.bufferedAmount = 0;
      this.binaryType = 'blob';
      this.manualClose = false;
      this.retryCount = 0;
      this.retryTimer = null;
      this.lastSubscription = null;
      this.socket = null;
      instances.add(this);
      window.__cameraPcSocket = this;
      this.open();
    }

    open() {
      if (this.manualClose) return;
      clearTimeout(this.retryTimer);
      this.readyState = NativeWebSocket.CONNECTING;

      let ws;
      try {
        ws = this.protocols ? new NativeWebSocket(this.url, this.protocols) : new NativeWebSocket(this.url);
      } catch (_) {
        this.scheduleReconnect();
        return;
      }
      this.socket = ws;
      ws.binaryType = this.binaryType;

      ws.addEventListener('open', () => {
        if (this.socket !== ws || this.manualClose) return;
        this.readyState = NativeWebSocket.OPEN;
        this.protocol = ws.protocol || '';
        this.extensions = ws.extensions || '';
        this.retryCount = 0;
        this.dispatchEvent(new Event('open'));

        if (this.lastSubscription) {
          setTimeout(() => {
            if (this.readyState === NativeWebSocket.OPEN && this.socket === ws && this.lastSubscription) {
              try { ws.send(this.lastSubscription); } catch (_) {}
            }
          }, 350);
        }
      });

      ws.addEventListener('message', (event) => {
        if (this.socket !== ws || this.manualClose) return;
        this.dispatchEvent(new MessageEvent('message', { data: event.data, origin: event.origin, lastEventId: event.lastEventId }));
      });

      ws.addEventListener('error', () => {
        if (this.socket !== ws || this.manualClose) return;
        this.dispatchEvent(new Event('error'));
      });

      ws.addEventListener('close', (event) => {
        if (this.socket !== ws) return;
        this.socket = null;
        this.readyState = NativeWebSocket.CLOSED;

        if (this.manualClose || event.code === 4004) {
          instances.delete(this);
          this.dispatchEvent(new CloseEvent('close', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          }));
          return;
        }

        this.scheduleReconnect();
      });
    }

    scheduleReconnect() {
      if (this.manualClose) return;
      const delays = [1000, 2000, 5000, 5000, 5000];
      const delay = delays[Math.min(this.retryCount, delays.length - 1)];
      this.retryCount += 1;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.open(), delay);
    }

    send(data) {
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'device:subscribe' && msg.deviceId) {
            this.lastSubscription = data;
          } else if (msg.type === 'device:unsubscribe') {
            this.lastSubscription = null;
          }
        } catch (_) {}
      }

      if (!this.socket || this.socket.readyState !== NativeWebSocket.OPEN) {
        throw new DOMException('WebSocket is not open', 'InvalidStateError');
      }
      this.socket.send(data);
    }

    close(code, reason) {
      this.manualClose = true;
      clearTimeout(this.retryTimer);
      this.readyState = NativeWebSocket.CLOSING;
      if (this.socket) {
        try { this.socket.close(code, reason); } catch (_) {}
      } else {
        this.readyState = NativeWebSocket.CLOSED;
        instances.delete(this);
        this.dispatchEvent(new CloseEvent('close', { code: code || 1000, reason: reason || '', wasClean: true }));
      }
    }

    get onopen() { return this._onopen || null; }
    set onopen(fn) {
      if (this._onopen) this.removeEventListener('open', this._onopen);
      this._onopen = fn;
      if (fn) this.addEventListener('open', fn);
    }
    get onmessage() { return this._onmessage || null; }
    set onmessage(fn) {
      if (this._onmessage) this.removeEventListener('message', this._onmessage);
      this._onmessage = fn;
      if (fn) this.addEventListener('message', fn);
    }
    get onerror() { return this._onerror || null; }
    set onerror(fn) {
      if (this._onerror) this.removeEventListener('error', this._onerror);
      this._onerror = fn;
      if (fn) this.addEventListener('error', fn);
    }
    get onclose() { return this._onclose || null; }
    set onclose(fn) {
      if (this._onclose) this.removeEventListener('close', this._onclose);
      this._onclose = fn;
      if (fn) this.addEventListener('close', fn);
    }
  }

  window.WebSocket = ResilientWebSocket;

  const simplifyStyle = document.createElement('style');
  simplifyStyle.textContent = `
    .workflow-panel,
    .nav-item[data-view="workflow"],
    .nav-item[data-view="files"],
    .nav-item[data-view="quick"],
    .nav-item[data-view="settings"],
    .nav-item[data-view="security"] {
      display: none !important;
    }
    nav .nav-title:last-of-type {
      display: none !important;
    }
    .left-column { gap: 0 !important; }
  `;
  document.head.appendChild(simplifyStyle);

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.device-card');
    if (!card || !card.dataset.deviceId) return;

    const socket = window.__cameraPcSocket;
    if (!socket || socket.readyState !== NativeWebSocket.OPEN) return;

    const deviceId = card.dataset.deviceId;
    setTimeout(() => {
      try {
        socket.send(JSON.stringify({ type: 'device:subscribe', deviceId }));
      } catch (_) {}
    }, 0);
  });

  window.addEventListener('beforeunload', () => {
    for (const socket of instances) {
      socket.manualClose = true;
      clearTimeout(socket.retryTimer);
      try { socket.socket?.close(1000, 'page unload'); } catch (_) {}
    }
  });
})();
