# Camera PC — PC Control Center

MVP quản lý, xem màn hình và thao tác trên nhiều PC qua một giao diện web dạng dashboard/canvas.

## Kiến trúc

- **Web Control Center**: giao diện dashboard tối, danh sách PC, remote viewer, Canvas Workflow và activity log.
- **VPS / Control Server**: Node.js + Express + WebSocket, làm gateway giữa trình duyệt quản trị và PC Agent.
- **PC Agent**: PowerShell chạy trên Windows, gửi ảnh màn hình định kỳ và nhận lệnh chuột/bàn phím/mở URL.

> Thiết kế dành cho máy tính bạn sở hữu hoặc được phép quản trị. Agent hiển thị console và ghi log, không có cơ chế ẩn/stealth.

## Chạy server

```bash
npm install
ADMIN_TOKEN=change-me AGENT_TOKEN=change-agent-token npm start
```

Mặc định: `http://localhost:3000`

Trên Windows PowerShell:

```powershell
$env:CONTROL_SERVER = "ws://YOUR_SERVER:3000/ws"
$env:AGENT_TOKEN = "change-agent-token"
powershell -ExecutionPolicy Bypass -File .\agent\pc-agent.ps1
```

Sau đó mở web, nhập `ADMIN_TOKEN`, chọn PC và bấm **Kết nối điều khiển**.

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
   └─ config.example.json
```
