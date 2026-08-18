(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    ws: null,
    token: '',
    connected: false,
    demo: false,
    devices: [],
    selectedId: null,
    filter: 'all',
    query: '',
    logs: [],
    frames: new Map(),
    controlConnected: false,
    lastFrameAt: 0
  };

  const els = {
    loginOverlay: $('loginOverlay'),
    loginForm: $('loginForm'),
    adminToken: $('adminToken'),
    demoBtn: $('demoBtn'),
    loginError: $('loginError'),
    serverStatus: $('serverStatus'),
    gatewayLabel: $('gatewayLabel'),
    agentOnlineCount: $('agentOnlineCount'),
    totalCount: $('totalCount'),
    onlineCount: $('onlineCount'),
    offlineCount: $('offlineCount'),
    controlCount: $('controlCount'),
    deviceRatio: $('deviceRatio'),
    deviceGrid: $('deviceGrid'),
    emptyState: $('emptyState'),
    filterAll: $('filterAll'),
    filterOnline: $('filterOnline'),
    filterOffline: $('filterOffline'),
    searchInput: $('searchInput'),
    refreshBtn: $('refreshBtn'),
    remoteTitle: $('remoteTitle'),
    remoteOnline: $('remoteOnline'),
    remoteSurface: $('remoteSurface'),
    remoteImage: $('remoteImage'),
    remotePlaceholder: $('remotePlaceholder'),
    latencyLabel: $('latencyLabel'),
    resolutionLabel: $('resolutionLabel'),
    connectBtn: $('connectBtn'),
    disconnectBtn: $('disconnectBtn'),
    screenshotBtn: $('screenshotBtn'),
    closeRemoteBtn: $('closeRemoteBtn'),
    urlInput: $('urlInput'),
    openUrlBtn: $('openUrlBtn'),
    textInput: $('textInput'),
    sendTextBtn: $('sendTextBtn'),
    infoName: $('infoName'),
    infoIp: $('infoIp'),
    infoGroup: $('infoGroup'),
    infoPlatform: $('infoPlatform'),
    infoUser: $('infoUser'),
    infoScreen: $('infoScreen'),
    workflowDevice: $('workflowDevice'),
    runWorkflowBtn: $('runWorkflowBtn'),
    newWorkflowBtn: $('newWorkflowBtn'),
    logList: $('logList'),
    clearLogBtn: $('clearLogBtn'),
    toast: $('toast'),
    emptyDemoBtn: $('emptyDemoBtn'),
    addPcBtn: $('addPcBtn')
  };

  function svgDesktop(title, accent = '#2387ff') {
    const safe = title.replace(/[<>&]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#07162a"/><stop offset="1" stop-color="#173a67"/></linearGradient></defs>
      <rect width="1280" height="720" fill="url(#g)"/>
      <circle cx="880" cy="275" r="180" fill="${accent}" opacity=".15"/><circle cx="930" cy="300" r="120" fill="${accent}" opacity=".22"/>
      <path d="M0 650h1280v70H0z" fill="#07101b" opacity=".95"/>
      <rect x="22" y="22" width="58" height="58" rx="12" fill="${accent}" opacity=".75"/><rect x="22" y="105" width="58" height="58" rx="12" fill="#ffffff" opacity=".12"/>
      <rect x="22" y="188" width="58" height="58" rx="12" fill="#ffffff" opacity=".12"/><rect x="22" y="271" width="58" height="58" rx="12" fill="#ffffff" opacity=".12"/>
      <rect x="475" y="662" width="330" height="42" rx="16" fill="#142337"/><circle cx="520" cy="683" r="14" fill="${accent}"/><circle cx="566" cy="683" r="14" fill="#fff" opacity=".35"/><circle cx="612" cy="683" r="14" fill="#fff" opacity=".2"/>
      <text x="110" y="58" fill="#eaf5ff" font-family="Segoe UI,Arial" font-size="26">${safe}</text>
      <text x="110" y="88" fill="#91a8bc" font-family="Segoe UI,Arial" font-size="16">Windows desktop • Demo preview</text>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  const demoDevices = [
    { id:'demo-1', name:'PC-MARKETING-01', group:'Marketing', platform:'Windows 11 Pro', username:'giang.truong', ip:'192.168.1.101', cpu:32, ram:45, online:true, screen:{width:1920,height:1080}, demoImage:svgDesktop('PC-MARKETING-01','#2387ff') },
    { id:'demo-2', name:'PC-MARKETING-02', group:'Marketing', platform:'Windows 10 Pro', username:'marketing.02', ip:'192.168.1.102', cpu:28, ram:62, online:true, screen:{width:1920,height:1080}, demoImage:svgDesktop('PC-MARKETING-02','#9c63ff') },
    { id:'demo-3', name:'PC-LE-TAN', group:'Lễ tân', platform:'Windows 11', username:'letan', ip:'192.168.1.103', cpu:18, ram:33, online:true, screen:{width:1920,height:1080}, demoImage:svgDesktop('PC-LE-TAN','#43d17b') },
    { id:'demo-4', name:'PC-KE-TOAN', group:'Kế toán', platform:'Windows 10 Pro', username:'ketoan', ip:'192.168.1.104', cpu:41, ram:71, online:true, screen:{width:1600,height:900}, demoImage:svgDesktop('PC-KE-TOAN','#ffb34a') },
    { id:'demo-5', name:'PC-KINH-DOANH', group:'Kinh doanh', platform:'Windows 11 Pro', username:'sales', ip:'192.168.1.105', cpu:22, ram:40, online:true, screen:{width:1920,height:1080}, demoImage:svgDesktop('PC-KINH-DOANH','#40d7dc') },
    { id:'demo-6', name:'PC-DEVELOPER', group:'IT', platform:'Windows 11 Pro', username:'developer', ip:'192.168.1.106', cpu:15, ram:26, online:false, screen:{width:2560,height:1440}, demoImage:svgDesktop('PC-DEVELOPER','#f15ac0') }
  ];

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function timeOnly(iso = new Date().toISOString()) {
    try { return new Date(iso).toLocaleTimeString('vi-VN', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
    catch (_) { return '--:--:--'; }
  }

  function addLog(message, level = 'info', deviceId = null, at = new Date().toISOString()) {
    state.logs.unshift({ id: `${Date.now()}-${Math.random()}`, message, level, deviceId, at });
    state.logs = state.logs.slice(0, 80);
    renderLogs();
  }

  function renderLogs() {
    els.logList.innerHTML = '';
    if (!state.logs.length) {
      const div = document.createElement('div');
      div.className = 'empty-state';
      div.style.padding = '28px 10px';
      div.innerHTML = '<p>Chưa có hoạt động.</p>';
      els.logList.appendChild(div);
      return;
    }
    for (const item of state.logs) {
      const row = document.createElement('div');
      row.className = 'log-item';
      const cls = item.level === 'error' ? 'bad' : item.level === 'warning' ? 'warn' : item.level === 'success' ? 'ok' : '';
      row.innerHTML = `<time>${timeOnly(item.at)}</time><span class="log-message"></span><span class="${cls}">${item.level === 'error' ? '●' : item.level === 'warning' ? '▲' : '✓'}</span>`;
      row.querySelector('.log-message').textContent = item.message;
      els.logList.appendChild(row);
    }
  }

  function setServerConnected(value, label = '') {
    state.connected = value;
    els.serverStatus.textContent = value ? (state.demo ? 'Demo' : 'Online') : 'Offline';
    els.serverStatus.className = `status-pill ${value ? 'online' : 'offline'}`;
    els.gatewayLabel.textContent = label || (value ? location.host : 'Chưa kết nối');
  }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function connect(token) {
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
    }
    state.token = token;
    state.demo = false;
    els.loginError.textContent = 'Đang kết nối...';
    const ws = new WebSocket(wsUrl());
    state.ws = ws;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type:'auth', role:'admin', token }));
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (msg.type === 'auth:ok') {
        els.loginOverlay.classList.add('hidden');
        els.loginError.textContent = '';
        setServerConnected(true, location.host);
        addLog('Đã kết nối Control Server', 'success');
      }
      if (msg.type === 'auth:error') {
        els.loginError.textContent = msg.message || 'Đăng nhập thất bại';
      }
      if (msg.type === 'device:list') {
        state.devices = Array.isArray(msg.devices) ? msg.devices : [];
        if (state.selectedId && !state.devices.some(d => d.id === state.selectedId)) state.selectedId = null;
        renderAll();
      }
      if (msg.type === 'device:thumbnail' || msg.type === 'device:frame') {
        state.frames.set(msg.deviceId, `data:image/jpeg;base64,${msg.data}`);
        if (msg.type === 'device:frame' && msg.deviceId === state.selectedId) {
          state.lastFrameAt = Date.now();
          showRemoteFrame(state.frames.get(msg.deviceId), msg.width, msg.height);
        }
        renderDeviceCards();
      }
      if (msg.type === 'log') addLog(msg.message, msg.level, msg.deviceId, msg.at);
      if (msg.type === 'device:event') addLog(msg.detail || msg.event || 'Thiết bị phản hồi', 'success', msg.deviceId, msg.at);
      if (msg.type === 'error') toast(msg.message || 'Có lỗi xảy ra');
    });

    ws.addEventListener('close', (event) => {
      if (!state.demo) {
        setServerConnected(false);
        if (!els.loginOverlay.classList.contains('hidden')) {
          els.loginError.textContent = event.code === 4004 ? 'Token không hợp lệ.' : 'Không kết nối được server.';
        } else {
          addLog('Mất kết nối Control Server', 'error');
          toast('Mất kết nối server');
        }
      }
    });

    ws.addEventListener('error', () => {
      els.loginError.textContent = 'Không thể kết nối WebSocket.';
    });
  }

  function send(payload) {
    if (state.demo) return true;
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.connected) {
      toast('Control Server chưa kết nối');
      return false;
    }
    state.ws.send(JSON.stringify(payload));
    return true;
  }

  function command(command, args = {}) {
    if (!state.selectedId) { toast('Chọn một PC trước'); return false; }
    if (state.demo) {
      addLog(`[DEMO] ${command} → ${selectedDevice()?.name || state.selectedId}`, 'success', state.selectedId);
      return true;
    }
    return send({ type:'device:command', deviceId:state.selectedId, command, args });
  }

  function selectedDevice() {
    return state.devices.find(d => d.id === state.selectedId) || null;
  }

  function filteredDevices() {
    const q = state.query.trim().toLowerCase();
    return state.devices.filter((d) => {
      if (state.filter === 'online' && !d.online) return false;
      if (state.filter === 'offline' && d.online) return false;
      if (q && !`${d.name} ${d.group} ${d.username} ${d.ip}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderStats() {
    const total = state.devices.length;
    const online = state.devices.filter(d => d.online).length;
    const offline = total - online;
    els.totalCount.textContent = total;
    els.onlineCount.textContent = online;
    els.offlineCount.textContent = offline;
    els.controlCount.textContent = state.controlConnected ? 1 : 0;
    els.agentOnlineCount.textContent = online;
    els.deviceRatio.textContent = `(${online}/${total} ONLINE)`;
  }

  function renderDeviceCards() {
    const list = filteredDevices();
    els.deviceGrid.innerHTML = '';
    els.emptyState.classList.toggle('hidden', state.devices.length > 0);
    els.deviceGrid.classList.toggle('hidden', state.devices.length === 0);

    for (const device of list) {
      const card = document.createElement('article');
      card.className = `device-card ${state.selectedId === device.id ? 'selected' : ''}`;
      card.dataset.deviceId = device.id;

      const image = state.frames.get(device.id) || device.demoImage || '';
      const cpu = Number.isFinite(device.cpu) ? Math.round(device.cpu) : 0;
      const ram = Number.isFinite(device.ram) ? Math.round(device.ram) : 0;
      card.innerHTML = `
        <div class="device-thumb">${image ? `<img alt="${device.name}">` : '<span class="fallback">▰</span>'}</div>
        <div class="device-meta">
          <div class="device-title"><strong></strong><span class="dot ${device.online ? 'online' : ''}"></span></div>
          <div class="device-sub"></div>
          <div class="meters">
            <div class="meter-line"><span>CPU</span><div class="meter"><i style="width:${cpu}%"></i></div><span>${cpu}%</span></div>
            <div class="meter-line"><span>RAM</span><div class="meter"><i style="width:${ram}%"></i></div><span>${ram}%</span></div>
          </div>
        </div>`;
      if (image) card.querySelector('img').src = image;
      card.querySelector('.device-title strong').textContent = device.name;
      card.querySelector('.device-sub').textContent = `${device.ip || '--'} · Nhóm: ${device.group || '--'}`;
      card.addEventListener('click', () => selectDevice(device.id));
      els.deviceGrid.appendChild(card);
    }
  }

  function renderSelected() {
    const d = selectedDevice();
    els.remoteTitle.textContent = d ? d.name : 'CHỌN MỘT PC';
    els.remoteOnline.textContent = d?.online ? 'Online' : 'Offline';
    els.remoteOnline.className = `status-pill ${d?.online ? 'online' : 'offline'}`;
    els.infoName.textContent = d?.name || '--';
    els.infoIp.textContent = d?.ip || '--';
    els.infoGroup.textContent = d?.group || '--';
    els.infoPlatform.textContent = d?.platform || '--';
    els.infoUser.textContent = d?.username || '--';
    els.infoScreen.textContent = d?.screen ? `${d.screen.width} × ${d.screen.height}` : '--';
    els.workflowDevice.textContent = d?.name || 'Chọn PC';

    if (!d) {
      els.remoteImage.style.display = 'none';
      els.remotePlaceholder.style.display = 'block';
      els.resolutionLabel.textContent = '--';
    } else {
      const img = state.frames.get(d.id) || d.demoImage;
      if (img) showRemoteFrame(img, d.screen?.width, d.screen?.height);
      else {
        els.remoteImage.style.display = 'none';
        els.remotePlaceholder.style.display = 'block';
      }
    }
  }

  function renderFilters() {
    els.filterAll.classList.toggle('active', state.filter === 'all');
    els.filterOnline.classList.toggle('active', state.filter === 'online');
    els.filterOffline.classList.toggle('active', state.filter === 'offline');
  }

  function renderAll() {
    renderStats();
    renderFilters();
    renderDeviceCards();
    renderSelected();
    renderLogs();
  }

  function showRemoteFrame(src, width, height) {
    els.remoteImage.src = src;
    els.remoteImage.style.display = 'block';
    els.remotePlaceholder.style.display = 'none';
    els.resolutionLabel.textContent = width && height ? `${width} × ${height}` : (selectedDevice()?.screen ? `${selectedDevice().screen.width} × ${selectedDevice().screen.height}` : '--');
    const age = state.lastFrameAt ? Date.now() - state.lastFrameAt : 18;
    els.latencyLabel.textContent = state.demo ? '18 ms · DEMO' : `${Math.max(1, age)} ms`;
  }

  function selectDevice(id) {
    if (state.selectedId && state.selectedId !== id && !state.demo) {
      send({ type:'device:unsubscribe', deviceId:state.selectedId });
    }
    state.selectedId = id;
    state.controlConnected = false;
    renderAll();
    const d = selectedDevice();
    addLog(`Đã chọn ${d?.name || id}`, 'info', id);
  }

  function subscribeSelected() {
    const d = selectedDevice();
    if (!d) { toast('Chọn một PC trước'); return; }
    if (!d.online) { toast('PC đang offline'); return; }
    if (state.demo) {
      state.controlConnected = true;
      addLog(`[DEMO] Kết nối điều khiển ${d.name}`, 'success', d.id);
      showRemoteFrame(d.demoImage, d.screen?.width, d.screen?.height);
      renderStats();
      els.remoteSurface.focus();
      return;
    }
    if (send({ type:'device:subscribe', deviceId:d.id })) {
      state.controlConnected = true;
      addLog(`Yêu cầu điều khiển ${d.name}`, 'success', d.id);
      renderStats();
      els.remoteSurface.focus();
    }
  }

  function disconnectSelected() {
    if (state.selectedId && !state.demo) send({ type:'device:unsubscribe', deviceId:state.selectedId });
    state.controlConnected = false;
    renderStats();
    addLog('Đã ngắt phiên điều khiển', 'warning', state.selectedId);
  }

  function enableDemo() {
    state.demo = true;
    state.connected = true;
    state.devices = demoDevices.map(d => ({...d}));
    state.selectedId = demoDevices[0].id;
    state.logs = [];
    els.loginOverlay.classList.add('hidden');
    setServerConnected(true, 'Chế độ demo');
    addLog('Đã mở dữ liệu demo. Các thao tác chưa gửi tới PC thật.', 'warning');
    renderAll();
  }

  function runWorkflow() {
    const d = selectedDevice();
    if (!d) { toast('Chọn PC để chạy workflow'); return; }
    if (!d.online) { toast('PC đang offline'); return; }
    addLog(`Workflow bắt đầu trên ${d.name}`, 'success', d.id);
    setTimeout(() => {
      command('openUrl', { url:'https://facebook.com' });
      addLog('Mở Chrome / Facebook', 'success', d.id);
    }, 350);
    setTimeout(() => {
      command('screenshot');
      addLog('Chụp màn hình kết quả', 'success', d.id);
    }, 1100);
    setTimeout(() => addLog('Workflow hoàn tất', 'success', d.id), 1600);
  }

  els.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    connect(els.adminToken.value.trim());
  });
  els.demoBtn.addEventListener('click', enableDemo);
  els.emptyDemoBtn.addEventListener('click', enableDemo);

  els.filterAll.addEventListener('click', () => { state.filter = 'all'; renderAll(); });
  els.filterOnline.addEventListener('click', () => { state.filter = 'online'; renderAll(); });
  els.filterOffline.addEventListener('click', () => { state.filter = 'offline'; renderAll(); });
  els.searchInput.addEventListener('input', () => { state.query = els.searchInput.value; renderDeviceCards(); });
  els.refreshBtn.addEventListener('click', () => state.demo ? renderAll() : send({ type:'device:list:request' }));

  els.connectBtn.addEventListener('click', subscribeSelected);
  els.disconnectBtn.addEventListener('click', disconnectSelected);
  els.screenshotBtn.addEventListener('click', () => command('screenshot'));
  els.closeRemoteBtn.addEventListener('click', () => { disconnectSelected(); state.selectedId = null; renderAll(); });
  els.openUrlBtn.addEventListener('click', () => {
    const url = els.urlInput.value.trim();
    if (!/^https?:\/\//i.test(url)) { toast('URL phải bắt đầu bằng http:// hoặc https://'); return; }
    if (command('openUrl', { url })) addLog(`Mở URL: ${url}`, 'success', state.selectedId);
  });
  els.sendTextBtn.addEventListener('click', () => {
    const text = els.textInput.value;
    if (!text) return;
    if (command('text', { text })) {
      addLog(`Đã gửi ${text.length} ký tự`, 'success', state.selectedId);
      els.textInput.value = '';
    }
  });

  els.remoteSurface.addEventListener('pointerdown', (e) => {
    if (!state.controlConnected || !state.selectedId) return;
    const rect = els.remoteSurface.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const button = e.button === 2 ? 'right' : 'left';
    command('mouseClick', { x, y, button });
    els.remoteSurface.focus();
  });
  els.remoteSurface.addEventListener('dblclick', (e) => {
    if (!state.controlConnected) return;
    const rect = els.remoteSurface.getBoundingClientRect();
    command('mouseDoubleClick', { x:(e.clientX-rect.left)/rect.width, y:(e.clientY-rect.top)/rect.height, button:'left' });
  });
  els.remoteSurface.addEventListener('contextmenu', (e) => e.preventDefault());
  els.remoteSurface.addEventListener('keydown', (e) => {
    if (!state.controlConnected) return;
    const allowedBrowserKeys = new Set(['F5','F11','F12']);
    if (!allowedBrowserKeys.has(e.key)) e.preventDefault();
    command('key', { key:e.key, ctrl:e.ctrlKey, alt:e.altKey, shift:e.shiftKey, meta:e.metaKey });
  });

  els.runWorkflowBtn.addEventListener('click', runWorkflow);
  els.newWorkflowBtn.addEventListener('click', () => toast('MVP đã sẵn node mẫu. Bước tiếp theo sẽ thêm kéo-thả node.'));
  els.clearLogBtn.addEventListener('click', () => { state.logs = []; renderLogs(); });
  els.addPcBtn.addEventListener('click', () => toast('Cài agent/pc-agent.ps1 trên PC mới rồi cấu hình AGENT_TOKEN.'));

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.view === 'workflow') document.querySelector('.workflow-panel').scrollIntoView({ behavior:'smooth', block:'center' });
      if (btn.dataset.view === 'screen') document.querySelector('.remote-panel').scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });

  renderAll();
})();
