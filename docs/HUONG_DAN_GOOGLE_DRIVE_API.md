# Hướng Dẫn Thiết Lập Lưu Trữ Google Drive Riêng Cho Từng Giáo Viên

Tài liệu này hướng dẫn cấu hình **Google Drive API v3** (qua **Google Identity Services OAuth 2.0**) cho bản web tĩnh (GitHub Pages / trình duyệt cục bộ) của **ExamMatrix Studio**.

---

## 1. Kiến trúc "Drive của ai, người đó giữ"

- Khi giáo viên bấm **Đăng nhập Google**, ứng dụng chỉ xin quyền tối giản **`https://www.googleapis.com/auth/drive.file`**.
- Với quyền `drive.file`, ExamMatrix Studio **chỉ được phép đọc và ghi duy nhất thư mục/tệp do chính nó tạo ra** trong Google Drive của giáo viên đang đăng nhập:
  - Thư mục: `Google Drive của tôi / ExamMatrix Studio`
  - Tệp dữ liệu: `exammatrix-workspace.json`
- Ứng dụng **không thể xem hay sửa** các tệp riêng tư khác trên Drive của giáo viên, và dữ liệu của mỗi giáo viên hoàn toàn tách biệt (không lưu chung vào máy chủ hay Drive của quản trị viên).
- **Bảo mật phiên:** Token truy cập (`access_token`) chỉ lưu tạm trong `sessionStorage` của phiên mở tab hiện tại và tự xóa khi đăng xuất hoặc đóng trình duyệt; dữ liệu làm việc được ghi vào `localStorage` trước để chống mất bài khi rớt mạng, rồi đồng bộ lên Google Drive.

---

## 2. Tạo Google OAuth 2.0 Web Client ID (chỉ cần làm 1 lần)

Bạn có thể tạo mới hoặc dùng lại chính dự án Google Cloud đang gắn với Firebase (`exammatrix-studio`) tại [Google Cloud Console](https://console.cloud.google.com/):

### Bước 1: Bật Google Drive API
1. Chọn đúng project trên Google Cloud Console (ví dụ `exammatrix-studio`).
2. Vào **APIs & Services → Library**, tìm **Google Drive API** và bấm **Enable**.

### Bước 2: Cấu hình OAuth consent screen (Google Auth platform)
Vào **APIs & Services → OAuth consent screen** (hoặc **Google Auth platform → Audience / Branding**):

- **Trường hợp A — Giáo viên dùng email Google Workspace cùng tên miền trường** (ví dụ `@asianschool.edu.vn`):
  - Chọn User Type là **Internal** (Nội bộ).
  - Mọi giáo viên có tài khoản cùng tên miền đều đăng nhập dùng ngay, **không cần Google duyệt**.
- **Trường hợp B — Giáo viên dùng `@gmail.com` cá nhân:**
  - Chọn User Type là **External** (Bên ngoài).
  - Trong chế độ **Testing**, thêm danh sách email `@gmail.com` của các giáo viên sử dụng vào mục **Test users** (tối đa 100 tài khoản) để dùng ngay không cần đợi xét duyệt. Khi muốn mở rộng cho mọi Gmail công khai, gửi xác minh (App verification) cho scope `drive.file`.
- Ở mục **Scopes**, thêm các quyền:
  - `https://www.googleapis.com/auth/drive.file`
  - `openid`, `email`, `profile`

### Bước 3: Tạo OAuth Client ID (Web application)
1. Vào **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type chọn **Web application**.
3. Tại mục **Authorized JavaScript origins**, thêm đúng địa chỉ web sẽ mở ứng dụng (chú ý không có dấu `/` ở cuối):
   - Bản GitHub Pages: `https://trangiahuy8444.github.io`
   - Nếu có thử nghiệm trên máy local qua HTTP server tĩnh: `http://127.0.0.1:8000` và `http://localhost:8000`
4. Bấm **Create** và sao chép chuỗi **Client ID** có dạng `1234567890-xxxxxxxx.apps.googleusercontent.com` *(không cần dùng Client Secret vì đây là ứng dụng chạy trực tiếp trên trình duyệt)*.

### Bước 4: Gắn Client ID vào ExamMatrix Studio
1. Mở tệp [`public/google-drive-config.js`](../public/google-drive-config.js) và điền `clientId`:
   ```js
   window.GOOGLE_DRIVE_CONFIG = {
     clientId: '1234567890-xxxxxxxx.apps.googleusercontent.com',
     folderName: 'ExamMatrix Studio',
     fileName: 'exammatrix-workspace.json',
     scope: 'https://www.googleapis.com/auth/drive.file openid email profile'
   };
   ```
2. Commit và push lên nhánh `main` để GitHub Actions tự xuất bản bản mới lên GitHub Pages.
3. *(Mẹo thử nhanh trước khi sửa code)*: Bạn cũng có thể bấm **Đăng nhập Google** trên giao diện web → mở mục **"Cấu hình Google OAuth Client ID"** ngay trong hộp thoại → dán Client ID để thử trực tiếp trên trình duyệt hiện tại.

---

## 3. Chuyển dữ liệu từ bản Local lên Google Drive cá nhân

1. Mở bản Local (hoặc bản đang chứa dữ liệu cũ), bấm nút **💾 Sao lưu** ở thanh công cụ trên cùng → chọn **Xuất toàn bộ dữ liệu (JSON)** để tải tệp `.json` về máy.
2. Mở bản GitHub Pages và bấm **Đăng nhập Google** bằng tài khoản của bạn.
3. Sau khi đăng nhập xong, bấm **💾 Sao lưu → Khôi phục từ tệp JSON** và chọn tệp vừa tải.
4. Hệ thống sẽ nạp toàn bộ ngân hàng câu hỏi, PPCT, danh mục năng lực, ma trận, đề cương và đề thi vào phiên làm việc hiện tại và tự động đồng bộ lên `Google Drive / ExamMatrix Studio / exammatrix-workspace.json` của riêng bạn.

> **Lưu ý về tính năng xuất bản:** Bản GitHub Pages hỗ trợ xuất **DOCX**, tệp JSON an toàn cho học sinh và gói **ZIP** trực tiếp trên trình duyệt. Riêng chuyển **Word → PDF bằng Microsoft Word** hoặc các thao tác cần Python (KTTX, LaTeX) chỉ hoạt động trên bản máy cục bộ (`MO_EXAMMATRIX_STUDIO.command`).
