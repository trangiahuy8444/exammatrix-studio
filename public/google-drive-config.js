// public/google-drive-config.js
// Cấu hình Google Drive API (OAuth 2.0 Web Client ID) cho bản GitHub Pages / ngoại tuyến.
// Lưu ý bảo mật: Web OAuth Client ID là thông tin công khai dành cho trình duyệt; tuyệt đối không đặt Client Secret vào tệp này.
// Phạm vi quyền `drive.file` chỉ cho phép ứng dụng đọc/ghi thư mục và tệp do chính ExamMatrix Studio tạo ra trong Google Drive riêng của từng giáo viên.
window.GOOGLE_DRIVE_CONFIG = {
  clientId: '', // Dán Google OAuth 2.0 Web Client ID (dạng "...apps.googleusercontent.com")
  folderName: 'ExamMatrix Studio',
  fileName: 'exammatrix-workspace.json',
  scope: 'https://www.googleapis.com/auth/drive.file openid email profile'
};
