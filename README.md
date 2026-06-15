# PPSSPP Ad-hoc Server (Go Edition) & Analytics Dashboard

Lobby server hiệu năng cao dành cho giả lập PPSSPP, đã được chuyển đổi hoàn toàn sang **Golang** để đạt độ ổn định và hiệu suất tối đa. Dự án đi kèm với một trang **Admin Dashboard** trực quan giúp bạn quản lý Server dễ dàng.

## Tính năng nổi bật
- **Core Server (Go)**: Kiến trúc đa luồng (Goroutines), cực nhẹ, xử lý kết nối mượt mà và chống treo server hiệu quả.
- **Admin Dashboard (Next.js)**: 
  - Xem Game Trends (biểu đồ donut thống kê thời lượng chơi của từng game).
  - Quản lý trạng thái Server thời gian thực (số người online, room đang mở).
  - Khả năng Ban/Kick trực tiếp các user ngay trên trình duyệt.
  - Tự động nhận diện tên chuẩn xác của hơn 4,300 tựa game PSP.
- **CI/CD Ready**: Tự động build và phát hành Docker Image lên GitHub Packages.

---

## 🚀 Hướng Dẫn Cài Đặt (Dành cho Admin)

Có 2 cách chính để triển khai Server này:

### Cách 1: Sử dụng Docker (Nhanh nhất & Khuyên dùng)
Dự án được tự động build và lưu trữ tại GitHub Container Registry (GHCR). Bạn không cần tải code hay build thủ công.

1. Tạo file `docker-compose.yaml` với nội dung:
```yaml
services:
  ppsspp-adhoc:
    image: ghcr.io/isharoverwhite/ppsspp-adhoc-server:latest
    container_name: ppsspp-adhoc
    ports:
      - "27312:27312"
      - "3000:3000"
    environment:
      - ADHOC_PORT=27312
      - ADHOC_MAX_USERS=1024
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

2. Khởi động server:
```bash
docker compose up -d
```

### Cách 2: Cài đặt trực tiếp vào hệ thống (Native Install)
Sử dụng script để tự động tải mã nguồn, biên dịch (Go & Node.js) và cài đặt thành một **System Service**.

```bash
curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | sudo bash
```

Sau khi cài đặt xong, bạn có thể quản lý bằng lệnh:
- `ppsspp start / stop / restart`
- `ppsspp logs`
- `ppsspp update` (Tự động pull code mới và rebuild lại hệ thống)

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

---

## 💖 Vinh danh & Trích nguồn (Credits)
Dự án này được phát triển dựa trên nền tảng tuyệt vời của các tác giả đi trước:
- **[Souler](https://github.com/Souler/ppsspp-adhoc-server)**: Tác giả bản gốc AdhocServer bằng ngôn ngữ C - Nguồn cảm hứng chính cho dự án này.
- **[Kyhel](https://github.com/Kyhel)**: Đóng góp quan trọng cho kiến trúc server C ban đầu.
- **Kien Dinh Trung**: Chuyển đổi toàn bộ sang **Golang**, phát triển Dashboard và hệ thống Monitor.
