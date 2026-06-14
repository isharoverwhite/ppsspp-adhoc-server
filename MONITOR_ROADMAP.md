# Kế hoạch phát triển Game Server Monitor (Roadmap)

Dưới đây là các nhóm chức năng cần thiết để biến Dashboard hiện tại thành một hệ thống quản lý server chuyên nghiệp cho cộng đồng PPSSPP.

## Nhóm 1: Giám sát Hệ thống (Infrastructure Monitoring)

Giúp admin biết server có đang bị quá tải hoặc gặp lỗi phần cứng không.

- **Tỉ lệ CPU/RAM:** Hiển thị biểu đồ sử dụng tài nguyên của process `AdhocServer`.
- **Băng thông (Network):** Theo dõi lưu lượng dữ liệu in/out để phát hiện tấn công DDoS hoặc lag.
- **Uptime:** Theo dõi thời gian server đã chạy liên tục và lịch sử các lần crash.

## Nhóm 2: Quản trị Người chơi (Admin Controls)

Cung cấp công cụ để admin can thiệp trực tiếp vào game.

- **Kick/Ban:** Chức năng đuổi hoặc cấm vĩnh viễn một người chơi dựa trên IP hoặc MAC.
- **Thông báo toàn server (Broadcast):** Gửi tin nhắn chat đến tất cả các phòng đang chơi (ví dụ: "Server sẽ bảo trì sau 5 phút").
- **Quản lý Group:** Admin có thể xóa các phòng ảo hoặc phòng có tên vi phạm quy tắc.

## Nhóm 3: Phân tích Dữ liệu & Lịch sử (Analytics)

Hiểu rõ hành vi người chơi để tối ưu hóa server.

- **Lịch sử hoạt động:** Lưu lại thời gian tham gia/rời đi của từng người chơi.
- **Retention (Tỉ lệ giữ chân):** Thống kê xem bao nhiêu người quay lại chơi vào ngày hôm sau.
- **Game Trend:** Biểu đồ xu hướng game nào đang "hot" theo tuần/tháng.
- **Geo-Location:** Bản đồ thế giới hiển thị vị trí của người chơi (dựa trên IP) để admin chọn đặt server ở region nào cho gần họ nhất.

## Nhóm 4: Tích hợp Cộng đồng (Social Integration)

Kết nối server với các nền tảng mạng xã hội.

- **Discord Webhook:** Tự động gửi tin nhắn vào Discord mỗi khi có người mới join hoặc khi server có biến cố.
- **Telegram Bot:** Cho phép admin kiểm tra trạng thái server bằng các lệnh chat đơn giản.
- **Public API:** Cung cấp API JSON để các website khác có thể lấy dữ liệu status server về hiển thị.

## Nhóm 5: Bảo mật & Ổn định (Security & Hardening)

- **Rate Limiting:** Giới hạn số lượng packet từ 1 IP để tránh spam login/chat.
- **Audit Logs:** Lưu lại toàn bộ các lệnh admin đã thực hiện để đối soát.
- **Auto-Backup:** Tự động sao lưu `database.db` định kỳ hàng ngày.

## Nhóm 6: Giao tiếp với cộng đồng

- **Game Chat:** Chia chat theo thể loại game người chơi đang chơi (vẫn phải hỗ trợ cross-chat qua các phiên bản game khác nhau như US hay JP mà vẫn cùng loại game đó)
- **Public Chat:** Chat toàn server
- **Admin chatting:** Admin vẫn có thể xem và theo dõi chat tổng và chat từng loại game, admin cũng có thể chat được.
- **UI design:** sẽ thiết kế như là một chatbox thực sự.
