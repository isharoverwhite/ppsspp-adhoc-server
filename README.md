# PPSSPP Ad-hoc Server & Analytics Dashboard

Lobby server hiệu năng cao dành cho giả lập PPSSPP, hỗ trợ đầy đủ giao thức PRO ONLINE. Dự án đi kèm với một trang **Admin Dashboard** cực kỳ trực quan giúp bạn quản lý Server dễ dàng.

## Tính năng nổi bật
- **Core Server (C)**: Single-threaded, non-blocking TCP lobby cực nhẹ, xử lý kết nối mượt mà cho hàng trăm người chơi.
- **Admin Dashboard (Next.js)**: 
  - Xem Game Trends (biểu đồ thống kê thời lượng & người chơi).
  - Quản lý trạng thái Server thời gian thực (số người online, room đang mở).
  - Khả năng Ban/Kick trực tiếp các user quậy phá.
  - Tự động nhận diện tên chuẩn xác của hơn 4,300 tựa game PSP.

---

## 🚀 Hướng Dẫn Cài Đặt

### Cách 1: Chạy bằng Docker Image (Khuyên dùng)
Mỗi khi có cập nhật, hệ thống tự động build Docker Image đa nền tảng (amd64 + arm64) lên GitHub Container Registry. Bạn chỉ cần chạy lệnh `docker run` sau (yêu cầu máy đã cài Docker):

```bash
docker run -d \
  --name ppsspp-adhoc \
  -p 27312:27312 \
  -p 3000:3000 \
  -v $(pwd)/database.db:/app/database.db \
  -v $(pwd)/www:/app/www \
  --restart unless-stopped \
  ghcr.io/isharoverwhite/ppsspp-adhoc-server:latest
```

### Cách 2: Cài đặt tự động thành System Service (Native Build)
Nếu bạn chạy trên Linux VPS (ví dụ Ubuntu/Debian) và muốn biên dịch trực tiếp từ mã nguồn, hãy dùng One-liner script sau. Lệnh này sẽ tự động tải code, dùng `make` để build C Server, dùng `npm run build` để build Dashboard, và tự cài đặt thành một service chạy ngầm (Systemd).

```bash
curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | bash
```

### Cách 3: Biên dịch thủ công (Manual Make & NPM)
Dành cho lập trình viên muốn tự biên dịch và chạy trên môi trường cục bộ (Mac/Linux). Yêu cầu đã cài đặt `gcc`, `make` và `Node.js`.

**1. Biên dịch máy chủ game (C):**
```bash
make clean
make
./AdhocServer
```

**2. Biên dịch & chạy Dashboard (Next.js):**
Mở một Terminal khác, di chuyển vào thư mục `webapp` và chạy:
```bash
cd webapp
npm install --legacy-peer-deps
npx prisma generate
npm run build
npm start
```

---

## 🎮 Cách Kết Nối (Dành cho người chơi)

Để kết nối máy chơi game của bạn (PSP thực hoặc Emulator) vào Server này:

1. Tìm IP của máy đang chạy Server (ví dụ: `192.168.1.10` hoặc IP Public của VPS).
2. Mở ứng dụng **PPSSPP** -> **Settings** -> **Networking**:
   - **Enable networking/WLAN**: Bật (Check)
   - **Change PRO ad hoc server IP address**: Nhập vào IP của bạn.
   - **Enable built-in PRO ad hoc server**: TẮT (Uncheck) - Vì bạn đang dùng server riêng này!

---

## 📊 Truy cập Admin Dashboard

Sau khi Server khởi động thành công, bạn có thể truy cập ngay bảng điều khiển tại:

**👉 http://localhost:3000**

*(Lưu ý thay `localhost` bằng IP của VPS nếu bạn cài đặt trên máy chủ đám mây).*

---

## ⚙️ Tùy Chỉnh Nâng Cao (Environment Variables)

Bạn có thể truyền thêm các biến môi trường để tuỳ biến Server:

- `ADHOC_PORT`: Cổng kết nối game (mặc định: `27312`).
- `ADHOC_MAX_USERS`: Giới hạn người chơi tối đa (mặc định: `1024`).
- `ADHOC_TIMEOUT`: Thời gian chờ rớt mạng (mặc định: `15` giây).

Ví dụ (Dành cho Docker): Thêm tham số `-e ADHOC_MAX_USERS=500` vào lệnh `docker run`.

---

## Contributors
- Kien Dinh Trung (Duy trì & Dashboard)
- [Kyhel](https://github.com/Kyhel) (Bản gốc PPSSPP AdhocServer bằng C)
