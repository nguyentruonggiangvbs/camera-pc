(() => {
  const style = document.createElement('style');
  style.textContent = `
    .device-edit-btn{border:0;background:transparent;color:#8fa5ba;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;font-size:13px;line-height:1;flex:0 0 auto}
    .device-edit-btn:hover{background:#12365b;color:#fff}
    .device-title-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
    .device-edit-overlay{position:fixed;inset:0;z-index:2000;background:rgba(2,8,14,.72);backdrop-filter:blur(7px);display:none;align-items:center;justify-content:center;padding:20px}
    .device-edit-overlay.show{display:flex}
    .device-edit-modal{width:min(420px,100%);background:#0b1726;border:1px solid #29445e;border-radius:14px;box-shadow:0 30px 100px rgba(0,0,0,.45);overflow:hidden}
    .device-edit-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #20344a}
    .device-edit-head strong{font-size:14px}.device-edit-head small{display:block;color:#8fa5ba;font-size:10px;margin-top:3px}
    .device-edit-close{border:1px solid #20344a;background:#102236;color:#b8c9d8;border-radius:7px;width:30px;height:30px}
    .device-edit-body{padding:18px;display:grid;gap:13px}
    .device-edit-body label{display:grid;gap:6px;color:#9eb1c3;font-size:10px}
    .device-edit-body input{width:100%;border:1px solid #20344a;background:#071421;color:#eef6ff;border-radius:8px;padding:10px 11px;outline:0}
    .device-edit-body input:focus{border-color:#2f92ff;box-shadow:0 0 0 2px rgba(47,146,255,.12)}
    .device-edit-id{font-size:10px;color:#6f879e;background:#081522;border:1px solid #172c41;border-radius:7px;padding:9px 10px}
    .device-edit-actions{display:flex;justify-content:flex-end;gap:8px;padding:0 18px 18px}
    .device-edit-actions button{border:1px solid #20344a;border-radius:7px;padding:9px 14px;font-size:10px}
    .device-edit-cancel{background:#102236;color:#c8d6e2}.device-edit-save{background:#217be8;border-color:#2f92ff!important;color:#fff}
    .remote-edit-btn{border:1px solid #20344a;background:#102236;color:#b8c9d8;border-radius:7px;padding:6px 9px;font-size:10px;margin-left:4px}
    .remote-edit-btn:hover{border-color:#347fc5;color:#fff}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'device-edit-overlay';
  overlay.innerHTML = `
    <div class="device-edit-modal" role="dialog" aria-modal="true" aria-label="Sửa thiết bị">
      <div class="device-edit-head">
        <div><strong>Sửa thiết bị</strong><small>Đổi tên hiển thị và nhóm ngay trên VPS</small></div>
        <button class="device-edit-close" type="button">×</button>
      </div>
      <div class="device-edit-body">
        <div class="device-edit-id"></div>
        <label>Tên hiển thị<input class="device-edit-name" maxlength="80" placeholder="Ví dụ: Máy CSKH 01"></label>
        <label>Nhóm<input class="device-edit-group" maxlength="80" placeholder="VN UTI"></label>
      </div>
      <div class="device-edit-actions">
        <button class="device-edit-cancel" type="button">Hủy</button>
        <button class="device-edit-save" type="button">Lưu thay đổi</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const idBox = overlay.querySelector('.device-edit-id');
  const nameInput = overlay.querySelector('.device-edit-name');
  const groupInput = overlay.querySelector('.device-edit-group');
  let editingDeviceId = null;

  function socketSend(payload) {
    const socket = window.__cameraPcSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
  }

  function parseCard(card) {
    const id = card?.dataset?.deviceId || '';
    const name = card?.querySelector('.device-title strong')?.textContent?.trim() || id;
    const sub = card?.querySelector('.device-sub')?.textContent || '';
    const match = sub.match(/Nhóm:\s*(.+)$/i);
    const group = match ? match[1].trim() : 'VN UTI';
    return { id, name, group };
  }

  function openEditor(card) {
    if (!card) return;
    const d = parseCard(card);
    if (!d.id) return;
    editingDeviceId = d.id;
    idBox.textContent = `Device ID: ${d.id}`;
    nameInput.value = d.name;
    groupInput.value = d.group || 'VN UTI';
    overlay.classList.add('show');
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 30);
  }

  function closeEditor() {
    overlay.classList.remove('show');
    editingDeviceId = null;
  }

  function saveEditor() {
    if (!editingDeviceId) return;
    const name = nameInput.value.trim();
    const group = groupInput.value.trim() || 'VN UTI';
    if (!name) { nameInput.focus(); return; }
    const ok1 = socketSend({ type:'device:rename', deviceId:editingDeviceId, name });
    const ok2 = socketSend({ type:'device:set-group', deviceId:editingDeviceId, group });
    if (ok1 && ok2) closeEditor();
  }

  overlay.querySelector('.device-edit-close').addEventListener('click', closeEditor);
  overlay.querySelector('.device-edit-cancel').addEventListener('click', closeEditor);
  overlay.querySelector('.device-edit-save').addEventListener('click', saveEditor);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEditor(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditor();
    if (e.key === 'Enter' && (e.target === nameInput || e.target === groupInput)) saveEditor();
  });

  function decorateCards() {
    document.querySelectorAll('.device-card').forEach(card => {
      if (card.querySelector('.device-edit-btn')) return;
      const title = card.querySelector('.device-title');
      const dot = title?.querySelector('.dot');
      if (!title) return;
      const actions = document.createElement('span');
      actions.className = 'device-title-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'device-edit-btn';
      btn.title = 'Đổi tên / nhóm';
      btn.setAttribute('aria-label','Đổi tên thiết bị');
      btn.textContent = '✎';
      btn.addEventListener('click', e => { e.stopPropagation(); openEditor(card); });
      if (dot) {
        dot.remove();
        actions.appendChild(btn);
        actions.appendChild(dot);
      } else actions.appendChild(btn);
      title.appendChild(actions);
    });
  }

  function decorateRemoteHeader() {
    const head = document.querySelector('.remote-head > div');
    if (!head || head.querySelector('.remote-edit-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remote-edit-btn';
    btn.textContent = '✎ Sửa tên';
    btn.addEventListener('click', () => openEditor(document.querySelector('.device-card.selected')));
    head.appendChild(btn);
  }

  const observer = new MutationObserver(() => { decorateCards(); decorateRemoteHeader(); });
  observer.observe(document.body, { childList:true, subtree:true });
  decorateCards();
  decorateRemoteHeader();
})();