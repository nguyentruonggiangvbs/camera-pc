(() => {
  const devices = new Map();
  let latestVersion = '0.0.0';

  const style = document.createElement('style');
  style.textContent = `
    .agent-version-row{display:flex;align-items:center;gap:6px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(32,52,74,.45);font-size:8px;color:#8fa5ba}
    .agent-version-badge{padding:3px 6px;border-radius:99px;background:#102236;color:#a9bdd0;white-space:nowrap}
    .agent-version-badge.current{background:rgba(67,209,123,.1);color:#69de97}
    .agent-version-badge.old{background:rgba(255,179,74,.1);color:#ffc268}
    .agent-version-badge.pending{background:rgba(35,135,255,.12);color:#67acff}
    .agent-update-btn{margin-left:auto;border:1px solid #2e6ea8;background:#12365b;color:#dcecff;border-radius:5px;padding:4px 7px;font-size:8px;cursor:pointer}
    .agent-update-btn:disabled{opacity:.45;cursor:not-allowed}
    #updateAllAgentsBtn{border-color:#2e6ea8;background:#12365b;color:#eaf5ff}
  `;
  document.head.appendChild(style);

  function socket() { return window.__cameraPcSocket; }
  function send(payload) {
    const ws = socket();
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
  }

  function ensureGlobalButton() {
    const toolbar = document.querySelector('.device-panel .toolbar');
    if (!toolbar || document.getElementById('updateAllAgentsBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'updateAllAgentsBtn';
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = '↻ Cập nhật Agent';
    btn.title = 'Yêu cầu tất cả PC online cập nhật Agent lên bản mới nhất';
    btn.addEventListener('click', () => {
      if (!send({ type: 'device:update-all' })) return;
      btn.textContent = '✓ Đã gửi yêu cầu';
      setTimeout(() => { btn.textContent = '↻ Cập nhật Agent'; }, 2200);
    });
    toolbar.appendChild(btn);
  }

  function decorateCard(device) {
    const card = document.querySelector(`.device-card[data-device-id="${CSS.escape(device.id)}"]`);
    if (!card) return;
    const meta = card.querySelector('.device-meta');
    if (!meta) return;

    let row = meta.querySelector('.agent-version-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'agent-version-row';
      meta.appendChild(row);
    }
    row.innerHTML = '';

    const badge = document.createElement('span');
    const current = device.agentVersion || '0.0.0';
    const latest = device.latestAgentVersion || latestVersion || '0.0.0';
    const pending = Boolean(device.updateForced);
    badge.className = `agent-version-badge ${pending ? 'pending' : device.updateAvailable ? 'old' : 'current'}`;
    badge.textContent = pending ? `v${current} · đang chờ` : device.updateAvailable ? `v${current} → ${latest}` : `Agent v${current}`;
    row.appendChild(badge);

    if (device.updateAvailable || pending) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agent-update-btn';
      btn.disabled = !device.online || pending;
      btn.textContent = pending ? 'Đang cập nhật...' : 'Cập nhật';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (send({ type: 'device:update-agent', deviceId: device.id })) {
          btn.disabled = true;
          btn.textContent = 'Đã gửi';
        }
      });
      row.appendChild(btn);
    }
  }

  function decorateAll() {
    ensureGlobalButton();
    for (const device of devices.values()) decorateCard(device);
  }

  function hookSocket(ws) {
    if (!ws || ws.__agentUpdateUiHooked) return;
    ws.__agentUpdateUiHooked = true;
    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg.type === 'auth:ok' && msg.latestAgentVersion) latestVersion = msg.latestAgentVersion;
      if (msg.type === 'device:list' && Array.isArray(msg.devices)) {
        devices.clear();
        for (const d of msg.devices) {
          devices.set(d.id, d);
          if (d.latestAgentVersion) latestVersion = d.latestAgentVersion;
        }
        requestAnimationFrame(decorateAll);
        setTimeout(decorateAll, 80);
      }
    });
  }

  const watcher = setInterval(() => {
    ensureGlobalButton();
    const ws = socket();
    if (ws) hookSocket(ws);
  }, 300);

  window.addEventListener('beforeunload', () => clearInterval(watcher));
})();
