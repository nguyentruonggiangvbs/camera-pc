# Camera PC — PC Control Center

MVP quản lý, xem màn hình và thao tác trên nhiều PC qua một giao diện web dạng dashboard/canvas.

## Kiến trúc

- **Web Control Center**: giao diện dashboard tối, danh sách PC, remote viewer, Canvas Workflow và activity log.
- **VPS / Control Server**: Node.js + Express + WebSocket, làm gateway giữa trình duyệt quản trị và PC Agent.
- **PC Agent**: chạy trong phiên desktop Windows, gửi ảnh màn hình định kỳ và nhận lệnh chuột/bàn phím/mở URL.
- **Supervisor**: tự khởi động Agent lại nếu Agent thoát/crash. Bản Agent tự reconnect khi mất mạng, VPS restart hoặc WebSocket bị rớt.

> Chỉ dùng trên máy tính bạn sở hữu hoặc được phép quản trị.

## Chạy server

```bash
npm install
ADMIN_TOKEN=change-me AGENT_TOKEN=change-agent-token npm start
```

Mặc định: `http://localhost:3000`

## Cài Agent Windows một lần

Mở PowerShell trên PC Windows và chạy:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nguyentruonggiangvbs/camera-pc/main/agent/install-agent.ps1" -OutFile "$env:TEMP\camera-pc-install.ps1"
& "$env:TEMP\camera-pc-install.ps1" -Server "ws://YOUR_SERVER:3000/ws" -Token "YOUR_AGENT_TOKEN" -DeviceId "PC-01" -Group "VanPhong"
```

Installer sẽ:

1. Tải `pc-agent.ps1` và `supervisor.ps1` vào `C:\ProgramData\CameraPC`.
2. Lưu cấu hình vào `C:\ProgramData\CameraPC\config.json`.
3. Tạo launcher trong Startup của user Windows hiện tại.
4. Khởi động Supervisor ngay.
5. Khi Agent crash/thoát, Supervisor khởi động lại sau 3 giây.
6. Khi mất mạng/VPS/WebSocket, Agent tự retry kết nối lại liên tục.

Do capture màn hình/chuột/bàn phím phải chạy trong desktop session của người dùng, launcher chạy sau khi user đăng nhập Windows. Nếu máy bật và Windows được cấu hình auto-login, Agent sẽ tự share màn hình ngay sau khi boot mà không cần thao tác thủ công.

### Gỡ Agent

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nguyentruonggiangvbs/camera-pc/main/agent/uninstall-agent.ps1" -OutFile "$env:TEMP\camera-pc-uninstall.ps1"
& "$env:TEMP\camera-pc-uninstall.ps1"
```

## Biến môi trường

- `PORT`: cổng HTTP, mặc định `3000`
- `ADMIN_TOKEN`: token đăng nhập dashboard
- `AGENT_TOKEN`: token cho PC Agent
- `FRAME_INTERVAL_MS`: khoảng thời gian chụp màn hình, mặc định `800ms`

## Chức năng MVP

- Danh sách PC online/offline theo thời gian thực.
- Thumbnail màn hình và thông tin máy.
- Xem màn hình trực tiếp qua WebSocket JPEG frames.
- Click chuột trái/phải, double click, di chuyển chuột.
- Gửi phím và nhập chuỗi text.
- Mở Chrome/Edge với URL từ dashboard.
- Canvas Workflow: `PC → Mở trình duyệt → Mở URL → Chụp màn hình`.
- Nhật ký hoạt động.
- Token tách riêng admin/agent.
- Auto-start Agent sau khi Windows user đăng nhập.
- Tự reconnect vô hạn khi mất kết nối.
- Supervisor tự restart Agent nếu Agent thoát.

## Production checklist

Trước khi đưa lên Internet:

1. Đặt reverse proxy HTTPS (Caddy/Nginx/Cloudflare Tunnel).
2. Đổi cả `ADMIN_TOKEN` và `AGENT_TOKEN` thành chuỗi dài ngẫu nhiên.
3. Giới hạn IP/VPN nếu có thể.
4. Không mở trực tiếp cổng WebSocket ra Internet nếu chưa có TLS.
5. Chỉ cài Agent trên máy đã được chủ sở hữu cho phép.

## Cấu trúc

```text
camera-pc/
├─ server.js
├─ package.json
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
└─ agent/
   ├─ pc-agent.ps1
   ├─ supervisor.ps1
   ├─ install-agent.ps1
   ├─ uninstall-agent.ps1
   └─ config.example.json
```
