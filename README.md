# PPSSPP Ad-hoc Server (Go Edition) & Analytics Dashboard

Lobby server hiệu năng cao dành cho giả lập PPSSPP, đã được chuyển đổi sang ngôn ngữ **Golang** để đạt độ ổn định và hiệu suất tối đa. Dự án đi kèm với một trang **Admin Dashboard** trực quan giúp bạn quản lý Server dễ dàng.

## Tính năng nổi bật
- **Core Server (Go)**: Kiến trúc đa luồng (Goroutines), cực nhẹ, xử lý kết nối mượt mà và chống treo server hiệu quả.
- **Admin Dashboard (Next.js)**: 
  - Xem Game Trends (biểu đồ donut thống kê thời lượng chơi của từng game).
  - Quản lý trạng thái Server thời gian thực (số người online, room đang mở).
  - Khả năng Ban/Kick trực tiếp các user ngay trên trình duyệt.
  - Tự động nhận diện tên chuẩn xác của hơn 4,300 tựa game PSP.
- **Docker Ready**: Triển khai siêu tốc chỉ với 1 lệnh duy nhất.

---

## 🚀 Hướng Dẫn Cài Đặt (Dành cho Admin)

### Cài đặt nhanh (One-liner)
Chạy lệnh duy nhất sau để tự động tải code, thiết lập môi trường và build hệ thống vào máy:

```bash
curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | sudo bash
```

*Lưu ý: Yêu cầu máy đã cài sẵn **Docker** và **Docker Compose**.*

### Sau khi cài đặt xong
Khởi động server bằng lệnh:
```bash
cd /opt/ppsspp-adhoc-server && docker compose up -d
```

### Quản lý Server
Hệ thống đi kèm công cụ CLI `ppsspp` để bạn dễ dàng cập nhật:
- `ppsspp update`: Tự động tải code mới nhất từ GitHub và build lại ảnh Docker trên máy.

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

## ⚙️ Tùy Chỉnh Nâng Cao (Environment Variables)

Bạn có thể chỉnh sửa các biến môi trường trong file `/opt/ppsspp-adhoc-server/.env`:

- `ADHOC_PORT`: Cổng kết nối game (mặc định: `27312`).
- `ADHOC_MAX_USERS`: Giới hạn người chơi tối đa (mặc định: `1024`).
- `ADHOC_TIMEOUT`: Thời gian chờ rớt mạng (mặc định: `15` giây).

---

## 💖 Vinh danh & Trích nguồn (Credits)
Dự án này được kế thừa và phát triển dựa trên nền tảng tuyệt vời của các tác giả đi trước:
- **[Souler](https://github.com/Souler/ppsspp-adhoc-server)**: Tác giả bản gốc AdhocServer bằng ngôn ngữ C - Nguồn cảm hứng chính cho dự án này.
- **[Kyhel](https://github.com/Kyhel)**: Đóng góp quan trọng cho kiến trúc server C ban đầu.
- **Kien Dinh Trung**: Chuyển đổi toàn bộ Core sang **Golang**, phát triển Dashboard và hệ thống Monitor.
