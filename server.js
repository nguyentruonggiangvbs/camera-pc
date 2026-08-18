const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'change-agent-token';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0
}));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'camera-pc-control-center', time: new Date().toISOString() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });

const devices = new Map();
const admins = new Set();

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function now() {
  return new Date().toISOString();
}

function deviceSummary(device) {
  return {
    id: device.id,
    name: device.name,
    group: device.group || 'Chưa phân nhóm',
    platform: device.platform || 'Windows',
    username: device.username || '',
    hostname: device.hostname || '',
    screen: device.screen || null,
    ip: device.ip || '',
    cpu: device.cpu ?? null,
    ram: device.ram ?? null,
    connectedAt: device.connectedAt,
    lastSeen: device.lastSeen,
    online: Boolean(device.socket && device.socket.readyState === WebSocket.OPEN)
  };
}

function broadcastDeviceList() {
  const payload = {
    type: 'device:list',
    devices: Array.from(devices.values()).map(deviceSummary)
  };
  for (const admin of admins) safeSend(admin.socket, payload);
}

function broadcastLog(message, level = 'info', deviceId = null) {
  const payload = {
    type: 'log',
    id: crypto.randomUUID(),
    at: now(),
    level,
    deviceId,
    message
  };
  for (const admin of admins) safeSend(admin.socket, payload);
}

function closeWith(ws, code, reason) {
  try { ws.close(code, reason); } catch (_) {}
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.role = 'pending';
  ws.authenticated = false;
  ws.subscribedDeviceId = null;

  ws.on('pong', () => { ws.isAlive = true; });

  const authTimeout = setTimeout(() => {
    if (!ws.authenticated) closeWith(ws, 4001, 'Authentication timeout');
  }, 8000);

  ws.on('message', (buffer) => {
    let msg;
    try {
      msg = JSON.parse(buffer.toString());
    } catch (_) {
      safeSend(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    if (!ws.authenticated) {
      if (msg.type !== 'auth') {
        safeSend(ws, { type: 'error', message: 'Authenticate first' });
        return;
      }

      if (msg.role === 'admin' && msg.token === ADMIN_TOKEN) {
        clearTimeout(authTimeout);
        ws.authenticated = true;
        ws.role = 'admin';
        const admin = { socket: ws, connectedAt: now() };
        admins.add(admin);
        ws.adminRef = admin;
        safeSend(ws, { type: 'auth:ok', role: 'admin' });
        safeSend(ws, {
          type: 'device:list',
          devices: Array.from(devices.values()).map(deviceSummary)
        });
        broadcastLog('Dashboard quản trị đã kết nối');
        return;
      }

      if (msg.role === 'agent' && msg.token === AGENT_TOKEN) {
        const deviceId = String(msg.deviceId || '').trim();
        if (!deviceId) {
          closeWith(ws, 4002, 'Missing deviceId');
          return;
        }

        clearTimeout(authTimeout);
        ws.authenticated = true;
        ws.role = 'agent';
        ws.deviceId = deviceId;

        const existing = devices.get(deviceId);
        if (existing?.socket && existing.socket.readyState === WebSocket.OPEN) {
          closeWith(existing.socket, 4003, 'Replaced by newer agent connection');
        }

        const device = {
          id: deviceId,
          name: msg.name || deviceId,
          group: msg.group || 'Văn phòng',
          platform: msg.platform || 'Windows',
          username: msg.username || '',
          hostname: msg.hostname || '',
          screen: msg.screen || null,
          ip: req.socket.remoteAddress || '',
          cpu: null,
          ram: null,
          connectedAt: now(),
          lastSeen: now(),
          lastFrame: null,
          lastThumbAt: 0,
          socket: ws
        };
        devices.set(deviceId, device);
        safeSend(ws, { type: 'auth:ok', role: 'agent', deviceId });
        broadcastDeviceList();
        broadcastLog(`${device.name} đã online`, 'success', deviceId);
        return;
      }

      safeSend(ws, { type: 'auth:error', message: 'Token hoặc vai trò không hợp lệ' });
      closeWith(ws, 4004, 'Unauthorized');
      return;
    }

    if (ws.role === 'agent') {
      const device = devices.get(ws.deviceId);
      if (!device) return;
      device.lastSeen = now();

      if (msg.type === 'agent:status') {
        if (Number.isFinite(msg.cpu)) device.cpu = msg.cpu;
        if (Number.isFinite(msg.ram)) device.ram = msg.ram;
        if (msg.screen) device.screen = msg.screen;
        broadcastDeviceList();
        return;
      }

      if (msg.type === 'agent:frame' && typeof msg.data === 'string') {
        device.lastFrame = msg.data;
        const t = Date.now();

        for (const admin of admins) {
          const full = admin.socket.subscribedDeviceId === device.id;
          const canThumb = t - device.lastThumbAt >= 2200;
          if (full || canThumb) {
            safeSend(admin.socket, {
              type: full ? 'device:frame' : 'device:thumbnail',
              deviceId: device.id,
              data: msg.data,
              width: msg.width,
              height: msg.height,
              at: now()
            });
          }
        }
        if (t - device.lastThumbAt >= 2200) device.lastThumbAt = t;
        return;
      }

      if (msg.type === 'agent:event') {
        for (const admin of admins) {
          safeSend(admin.socket, {
            type: 'device:event',
            deviceId: device.id,
            event: msg.event,
            detail: msg.detail || '',
            at: now()
          });
        }
        broadcastLog(msg.detail || msg.event || 'Agent event', msg.ok === false ? 'error' : 'success', device.id);
      }
      return;
    }

    if (ws.role === 'admin') {
      if (msg.type === 'device:subscribe') {
        const device = devices.get(msg.deviceId);
        if (!device || device.socket.readyState !== WebSocket.OPEN) {
          safeSend(ws, { type: 'error', message: 'Thiết bị đang offline hoặc không tồn tại' });
          return;
        }
        ws.subscribedDeviceId = msg.deviceId;
        safeSend(ws, { type: 'device:subscribed', deviceId: msg.deviceId });
        if (device.lastFrame) {
          safeSend(ws, {
            type: 'device:frame',
            deviceId: device.id,
            data: device.lastFrame,
            width: device.screen?.width,
            height: device.screen?.height,
            at: now()
          });
        }
        return;
      }

      if (msg.type === 'device:unsubscribe') {
        ws.subscribedDeviceId = null;
        return;
      }

      if (msg.type === 'device:command') {
        const device = devices.get(msg.deviceId);
        if (!device || device.socket.readyState !== WebSocket.OPEN) {
          safeSend(ws, { type: 'error', message: 'Không thể gửi lệnh: thiết bị offline' });
          return;
        }

        const allowed = new Set([
          'mouseMove', 'mouseClick', 'mouseDoubleClick',
          'key', 'text', 'openUrl', 'screenshot', 'ping'
        ]);
        if (!allowed.has(msg.command)) {
          safeSend(ws, { type: 'error', message: 'Lệnh không được hỗ trợ' });
          return;
        }

        const commandId = crypto.randomUUID();
        safeSend(device.socket, {
          type: 'control:command',
          commandId,
          command: msg.command,
          args: msg.args || {}
        });
        safeSend(ws, { type: 'command:queued', commandId, deviceId: msg.deviceId, command: msg.command });
        return;
      }

      if (msg.type === 'device:list:request') {
        safeSend(ws, {
          type: 'device:list',
          devices: Array.from(devices.values()).map(deviceSummary)
        });
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (ws.role === 'admin' && ws.adminRef) {
      admins.delete(ws.adminRef);
    }

    if (ws.role === 'agent' && ws.deviceId) {
      const device = devices.get(ws.deviceId);
      if (device && device.socket === ws) {
        device.socket = null;
        device.lastSeen = now();
        broadcastDeviceList();
        broadcastLog(`${device.name} đã offline`, 'warning', device.id);
      }
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (_) {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[camera-pc] server listening on :${PORT}`);
  if (ADMIN_TOKEN === 'change-me' || AGENT_TOKEN === 'change-agent-token') {
    console.warn('[camera-pc] WARNING: using default tokens. Set ADMIN_TOKEN and AGENT_TOKEN before exposing to the Internet.');
  }
});
