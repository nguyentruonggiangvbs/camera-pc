(() => {
  const style = document.createElement('style');
  style.textContent = `
    .device-title{position:relative}
    .device-rename-btn{margin-left:auto;margin-right:4px;width:22px;height:22px;border:1px solid #2a4663;border-radius:6px;background:#102236;color:#9cb4ca;display:grid;place-items:center;padding:0;font-size:11px;line-height:1}
    .device-rename-btn:hover{border-color:#2f92ff;color:#fff;background:#12365b}
    .device-id-line{font-size:8px;color:#6f879e;margin-top:3px}
  `;
  document.head.appendChild(style);

  function socketOpen() {
    const socket = window.__cameraPcSocket;
    return socket && socket.readyState === WebSocket.OPEN ? socket : null;
  }

  function enhanceCard(card) {
    if (!card || card.dataset.renameEnhanced === '1') return;
    const title = card.querySelector('.device-title');
    const strong = title?.querySelector('strong');
    if (!title || !strong) return;

    card.dataset.renameEnhanced = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'device-rename-btn';
    btn.title = 'Đổi tên máy';
    btn.setAttribute('aria-label', 'Đổi tên máy');
    btn.textContent = '✎';
    const dot = title.querySelector('.dot');
    title.insertBefore(btn, dot || null);

    const idLine = document.createElement('div');
    idLine.className = 'device-id-line';
    idLine.textContent = `ID: ${card.dataset.deviceId}`;
    const sub = card.querySelector('.device-sub');
    if (sub) sub.insertAdjacentElement('afterend', idLine);

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = strong.textContent.trim();
      const value = window.prompt('Đổi tên hiển thị của máy', current);
      if (value === null) return;
      const name = value.trim();
      if (!name || name.length > 80) {
        window.alert('Tên máy phải từ 1 đến 80 ký tự.');
        return;
      }
      const socket = socketOpen();
      if (!socket) {
        window.alert('Control Server đang mất kết nối. Vui lòng chờ tự kết nối lại.');
        return;
      }
      try {
        socket.send(JSON.stringify({ type: 'device:rename', deviceId: card.dataset.deviceId, name }));
      } catch (_) {
        window.alert('Không gửi được yêu cầu đổi tên.');
      }
    });
  }

  function enhanceAll() {
    document.querySelectorAll('.device-card').forEach(enhanceCard);
  }

  const grid = document.getElementById('deviceGrid');
  if (grid) {
    new MutationObserver(enhanceAll).observe(grid, { childList: true, subtree: true });
  }
  enhanceAll();
})();
