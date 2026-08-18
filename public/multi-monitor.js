(() => {
  const monitorFrames = new Map(); // deviceId -> Map(index -> frame)
  const deviceMeta = new Map();
  let selectedMonitorIndex = 0;
  let controlEnabled = false;

  const style = document.createElement('style');
  style.textContent = `
    .device-thumb.multi-monitor-thumb{display:grid;grid-template-columns:repeat(var(--cols,1),1fr);gap:2px;padding:2px;background:#050b12}
    .device-thumb.multi-monitor-thumb .monitor-thumb{position:relative;min-width:0;overflow:hidden;background:#081522;display:grid;place-items:center}
    .device-thumb.multi-monitor-thumb .monitor-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .device-thumb.multi-monitor-thumb .monitor-badge,.multi-monitor-cell .monitor-badge{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.68);color:#dcecff;border-radius:5px;padding:3px 6px;font-size:8px;z-index:2}
    .monitor-fullscreen-btn,.remote-fullscreen-btn{position:absolute;right:7px;top:7px;z-index:5;width:30px;height:30px;border:1px solid rgba(255,255,255,.18);border-radius:7px;background:rgba(0,0,0,.62);color:#fff;display:grid;place-items:center;padding:0;font-size:16px;line-height:1;cursor:pointer;backdrop-filter:blur(5px)}
    .monitor-fullscreen-btn:hover,.remote-fullscreen-btn:hover{background:rgba(35,135,255,.9);border-color:#5da8ff}
    .remote-surface.multi-monitor-active{display:block;aspect-ratio:auto;min-height:260px;padding:6px}
    .multi-monitor-remote-grid{width:100%;height:100%;display:grid;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr));gap:6px}
    .multi-monitor-cell{position:relative;min-height:180px;background:#03070c;border:2px solid transparent;border-radius:7px;overflow:hidden;display:grid;place-items:center;cursor:pointer}
    .multi-monitor-cell.selected{border-color:#2f92ff;box-shadow:0 0 0 1px rgba(47,146,255,.28) inset}
    .multi-monitor-cell img{width:100%;height:100%;object-fit:contain;display:block}
    .multi-monitor-cell .no-frame{color:#71889d;font-size:11px}
    .multi-monitor-cell:fullscreen{background:#000;border:0;border-radius:0;width:100vw;height:100vh;display:grid;place-items:center}
    .multi-monitor-cell:fullscreen img{width:100vw;height:100vh;object-fit:contain}
    .multi-monitor-cell:fullscreen .monitor-badge{font-size:12px;padding:6px 10px}
    .multi-monitor-cell:fullscreen .monitor-fullscreen-btn{position:fixed;right:18px;top:18px;width:42px;height:42px;font-size:22px}
    .remote-surface:fullscreen{background:#000;width:100vw;height:100vh;margin:0;border:0;border-radius:0;display:grid;place-items:center}
    .remote-surface:fullscreen>img{width:100vw!important;height:100vh!important;object-fit:contain!important}
    .remote-surface:fullscreen .remote-fullscreen-btn{position:fixed;right:18px;top:18px;width:42px;height:42px;font-size:22px}
    @media(max-width:900px){.multi-monitor-remote-grid{grid-template-columns:1fr!important}.multi-monitor-cell{min-height:200px}}
  `;
  document.head.appendChild(style);

  function toggleFullscreen(element) {
    if (!element) return;
    if (document.fullscreenElement === element) {
      document.exitFullscreen?.().catch(() => {});
      return;
    }
    element.requestFullscreen?.().catch(() => {});
  }

  function fullscreenButton(className = 'monitor-fullscreen-btn') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.title = 'Xem toàn màn hình';
    btn.setAttribute('aria-label', 'Xem toàn màn hình');
    btn.textContent = '⛶';
    return btn;
  }

  function mapFor(deviceId) {
    if (!monitorFrames.has(deviceId)) monitorFrames.set(deviceId, new Map());
    return monitorFrames.get(deviceId);
  }

  function selectedDeviceId() {
    return document.querySelector('.device-card.selected')?.dataset.deviceId || null;
  }

  function monitorCountFor(deviceId) {
    const meta = deviceMeta.get(deviceId);
    const frames = monitorFrames.get(deviceId);
    return Math.max(meta?.monitorCount || meta?.screens?.length || 0, frames?.size || 0, 1);
  }

  function decorateCard(deviceId) {
    const card = document.querySelector(`.device-card[data-device-id="${CSS.escape(deviceId)}"]`);
    if (!card) return;
    const thumb = card.querySelector('.device-thumb');
    if (!thumb) return;

    const count = monitorCountFor(deviceId);
    const frames = mapFor(deviceId);
    if (count <= 1 && frames.size <= 1) return;

    thumb.classList.add('multi-monitor-thumb');
    thumb.style.setProperty('--cols', count >= 2 ? Math.min(count, 2) : 1);
    thumb.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const cell = document.createElement('div');
      cell.className = 'monitor-thumb';
      const frame = frames.get(i);
      if (frame?.src) {
        const img = document.createElement('img');
        img.src = frame.src;
        img.alt = `Màn hình ${i + 1}`;
        cell.appendChild(img);
      }
      const badge = document.createElement('span');
      badge.className = 'monitor-badge';
      badge.textContent = `Màn ${i + 1}`;
      cell.appendChild(badge);
      thumb.appendChild(cell);
    }
  }

  function ensureSingleMonitorFullscreen() {
    const remote = document.getElementById('remoteSurface');
    if (!remote || remote.querySelector('.remote-fullscreen-btn')) return;
    const btn = fullscreenButton('remote-fullscreen-btn');
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFullscreen(remote);
    });
    remote.appendChild(btn);
  }

  function renderRemote(deviceId) {
    if (!deviceId) return;
    const count = monitorCountFor(deviceId);
    const frames = mapFor(deviceId);
    const remote = document.getElementById('remoteSurface');
    if (!remote) return;

    const infoScreen = document.getElementById('infoScreen');
    const meta = deviceMeta.get(deviceId);
    if (infoScreen && count > 1) {
      infoScreen.textContent = (meta?.screens || []).map((s, i) => `M${i + 1}: ${s.width}×${s.height}`).join(' · ') || `${count} màn hình`;
    }

    if (count <= 1) {
      remote.classList.remove('multi-monitor-active');
      remote.querySelector('.multi-monitor-remote-grid')?.remove();
      const img = document.getElementById('remoteImage');
      if (img && frames.get(0)?.src) img.src = frames.get(0).src;
      ensureSingleMonitorFullscreen();
      return;
    }

    remote.querySelector('.remote-fullscreen-btn')?.remove();
    remote.classList.add('multi-monitor-active');
    const originalImg = document.getElementById('remoteImage');
    const placeholder = document.getElementById('remotePlaceholder');
    if (originalImg) originalImg.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';

    let grid = remote.querySelector('.multi-monitor-remote-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'multi-monitor-remote-grid';
      const overlay = remote.querySelector('.remote-overlay');
      remote.insertBefore(grid, overlay || null);
    }
    grid.style.setProperty('--cols', Math.min(count, 2));
    grid.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const cell = document.createElement('div');
      cell.className = `multi-monitor-cell ${i === selectedMonitorIndex ? 'selected' : ''}`;
      cell.dataset.monitorIndex = String(i);
      const frame = frames.get(i);
      if (frame?.src) {
        const img = document.createElement('img');
        img.src = frame.src;
        img.alt = `Màn hình ${i + 1}`;
        cell.appendChild(img);
      } else {
        const empty = document.createElement('span');
        empty.className = 'no-frame';
        empty.textContent = 'Đang chờ hình ảnh...';
        cell.appendChild(empty);
      }
      const badge = document.createElement('span');
      badge.className = 'monitor-badge';
      badge.textContent = `Màn hình ${i + 1}${meta?.screens?.[i]?.primary ? ' · Chính' : ''}`;
      cell.appendChild(badge);

      const fullBtn = fullscreenButton();
      fullBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectedMonitorIndex = i;
        toggleFullscreen(cell);
      });
      cell.appendChild(fullBtn);
      grid.appendChild(cell);
    }
  }

  function scheduleRender(deviceId) {
    requestAnimationFrame(() => {
      decorateCard(deviceId);
      if (selectedDeviceId() === deviceId) renderRemote(deviceId);
    });
  }

  function hookSocket(socket) {
    if (!socket || socket.__multiMonitorHooked) return;
    socket.__multiMonitorHooked = true;
    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg.type === 'device:list' && Array.isArray(msg.devices)) {
        for (const d of msg.devices) deviceMeta.set(d.id, d);
        requestAnimationFrame(() => {
          for (const d of msg.devices) decorateCard(d.id);
          const id = selectedDeviceId();
          if (id) renderRemote(id);
        });
      }
      if ((msg.type === 'device:frame' || msg.type === 'device:thumbnail') && msg.deviceId) {
        const index = Number.isInteger(msg.monitorIndex) ? msg.monitorIndex : 0;
        mapFor(msg.deviceId).set(index, {
          src: `data:image/jpeg;base64,${msg.data}`,
          width: msg.width,
          height: msg.height,
          sourceWidth: msg.sourceWidth,
          sourceHeight: msg.sourceHeight,
          at: msg.at
        });
        scheduleRender(msg.deviceId);
      }
    });
  }

  const socketWatcher = setInterval(() => {
    const socket = window.__cameraPcSocket;
    if (socket) hookSocket(socket);
  }, 250);

  document.addEventListener('fullscreenchange', () => {
    document.querySelectorAll('.monitor-fullscreen-btn,.remote-fullscreen-btn').forEach(btn => {
      btn.textContent = document.fullscreenElement ? '✕' : '⛶';
      btn.title = document.fullscreenElement ? 'Thoát toàn màn hình' : 'Xem toàn màn hình';
    });
  });

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.device-card');
    if (card) {
      selectedMonitorIndex = 0;
      setTimeout(() => renderRemote(card.dataset.deviceId), 30);
    }
    const monitorCell = event.target.closest('.multi-monitor-cell');
    if (monitorCell && !event.target.closest('.monitor-fullscreen-btn')) {
      selectedMonitorIndex = Number(monitorCell.dataset.monitorIndex || 0);
      const id = selectedDeviceId();
      if (id) renderRemote(id);
      document.getElementById('remoteSurface')?.focus();
    }
    if (event.target.closest('#connectBtn')) controlEnabled = true;
    if (event.target.closest('#disconnectBtn') || event.target.closest('#closeRemoteBtn')) controlEnabled = false;
  }, true);

  function sendMonitorCommand(command, args = {}) {
    const deviceId = selectedDeviceId();
    const socket = window.__cameraPcSocket;
    if (!deviceId || !socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'device:command', deviceId, command, args: { ...args, monitorIndex: selectedMonitorIndex } }));
    return true;
  }

  const remote = document.getElementById('remoteSurface');
  if (remote) {
    ensureSingleMonitorFullscreen();

    remote.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.monitor-fullscreen-btn,.remote-fullscreen-btn')) return;
      const id = selectedDeviceId();
      if (!id || monitorCountFor(id) <= 1 || !controlEnabled) return;
      const cell = event.target.closest('.multi-monitor-cell');
      if (!cell) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectedMonitorIndex = Number(cell.dataset.monitorIndex || 0);
      const rect = cell.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      sendMonitorCommand('mouseClick', { x, y, button: event.button === 2 ? 'right' : 'left' });
      renderRemote(id);
      remote.focus();
    }, true);

    remote.addEventListener('dblclick', (event) => {
      if (event.target.closest('.monitor-fullscreen-btn,.remote-fullscreen-btn')) return;
      const id = selectedDeviceId();
      if (!id || monitorCountFor(id) <= 1 || !controlEnabled) return;
      const cell = event.target.closest('.multi-monitor-cell');
      if (!cell) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectedMonitorIndex = Number(cell.dataset.monitorIndex || 0);
      const rect = cell.getBoundingClientRect();
      sendMonitorCommand('mouseDoubleClick', {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        button: 'left'
      });
    }, true);

    remote.addEventListener('keydown', (event) => {
      const id = selectedDeviceId();
      if (!id || monitorCountFor(id) <= 1 || !controlEnabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sendMonitorCommand('key', { key: event.key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });
    }, true);
  }

  window.addEventListener('beforeunload', () => clearInterval(socketWatcher));
})();