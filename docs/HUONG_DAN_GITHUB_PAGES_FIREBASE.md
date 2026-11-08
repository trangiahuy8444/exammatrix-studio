# HƯỚNG DẪN TRIỂN KHAI GITHUB PAGES + FIREBASE
### Hệ thống Ngân hàng Đề & Khảo thí Đa môn (ExamMatrix Studio)

---

## 1. GỢI Ý ĐẶT TÊN REPOSITORY TRÊN GITHUB

Thầy có thể chọn một trong các tên chuyên nghiệp dưới đây tùy theo mục đích sử dụng của tổ bộ môn:

| Tên gợi ý | Định hướng phù hợp | Ưu điểm & Ý nghĩa |
| :--- | :--- | :--- |
| **`exammatrix-studio`** | **(Khuyên dùng)** | Đúng tên nhận diện thương hiệu của hệ thống, chuẩn quốc tế, ngắn gọn, sang trọng. |
| **`ahs-exam-bank`** | Nội bộ Asian School | Thể hiện rõ hệ thống ngân hàng đề dành riêng cho trường Á Châu (AHS). |
| **`khao-thi-ngan-hang-de`** | Thuần Việt cho Tổ bộ môn | Thân thiện, trực quan, dễ nhớ cho giáo viên các môn (Tin học, Toán, Vật lí,...). |
| **`exam-matrix-builder`** | Công cụ chuyên môn | Nhấn mạnh tính năng xây dựng Ma trận - Đặc tả - Đề thi chuẩn GDPT 2018. |

---

## 2. BƯỚC 1: CẤU HÌNH FIREBASE (MIỄN PHÍ & BẢO MẬT DỮ LIỆU)

Firebase đóng vai trò làm Backend Serverless: quản lý tài khoản giáo viên và lưu trữ dữ liệu riêng tư cho từng người.

### 2.1. Tạo Dự án Firebase
1. Truy cập [https://console.firebase.google.com/](https://console.firebase.google.com/) và đăng nhập tài khoản Google của Thầy.
2. Bấm **"Add project"** (Thêm dự án), đặt tên (ví dụ: `exammatrix-studio`), bấm Tiếp tục và chọn gói **Spark Plan (Miễn phí)**.

### 2.2. Bật Authentication (Đăng nhập cho Giáo viên)
1. Trong menu bên trái, chọn **Build** > **Authentication** > bấm **Get started**.
2. Chọn thẻ **Sign-in method**, bấm vào **Email/Password** > bật công tắc **Enable** > bấm **Save**.

### 2.3. Tạo Cloud Firestore (Cơ sở dữ liệu)
1. Chọn **Build** > **Firestore Database** > bấm **Create database**.
2. Chọn vị trí máy chủ gần Việt Nam nhất (ví dụ: `asia-southeast1` - Singapore) > bấm Next.
3. Chọn chế độ **Start in production mode** > bấm Create.
4. Chuyển sang thẻ **Rules**, dán toàn bộ nội dung trong tệp [firestore.rules](file:///Users/huytran/Library/CloudStorage/GoogleDrive-trangiahuy8444@gmail.com/My%20Drive/01_Giang_day/2026-2027/Workspace%20Tin%20ho%CC%A3c%202026-2027/ngan-hang-de-web/firestore.rules) vào rồi bấm **Publish**:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Dữ liệu của giáo viên nào thì CHỈ giáo viên đó đọc/ghi
       match /workspaces/{userId}/{allDocuments=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### 2.4. Lấy thông số cấu hình Web App
1. Vào biểu tượng **Bánh răng (Project settings)** ở góc trên bên trái.
2. Cuộn xuống phần **Your apps**, bấm vào biểu tượng Web **`</>`**.
3. Đặt App nickname (ví dụ: `ExamMatrix Web`) > bấm **Register app**.
4. Sao chép các dòng trong `firebaseConfig` và dán thay thế vào tệp [public/firebase-config.js](file:///Users/huytran/Library/CloudStorage/GoogleDrive-trangiahuy8444@gmail.com/My%20Drive/01_Giang_day/2026-2027/Workspace%20Tin%20ho%CC%A3c%202026-2027/ngan-hang-de-web/public/firebase-config.js):
   ```javascript
   window.FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "exammatrix-studio.firebaseapp.com",
     projectId: "exammatrix-studio",
     storageBucket: "exammatrix-studio.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef..."
   };
   ```

---

## 3. BƯỚC 2: CHUẨN BỊ GITHUB REPOSITORY & GITHUB PAGES

1. Truy cập [https://github.com/new](https://github.com/new).
2. Đặt tên Repository (ví dụ: `exammatrix-studio`).
3. Chọn chế độ: **Public** (để dùng GitHub Pages miễn phí) hoặc **Private** (nếu tài khoản GitHub có GitHub Pro/Education).
4. **Không tích chọn** "Add a README file" hay ".gitignore" (vì trong máy tính đã có sẵn). Bấm **Create repository**.
5. Trong trang Repository trên GitHub, vào **Settings** > mục **Pages** (ở cột trái):
   - Tại mục **Build and deployment** > **Source**: chọn **GitHub Actions**.

---

## 4. BƯỚC 3: CÁC LỆNH TERMINAL ĐỂ ĐẨY LÊN GITHUB

Mở Terminal trên máy Mac của Thầy và chạy lần lượt các lệnh sau:

```bash
# 1. Di chuyển vào thư mục dự án web
cd "/Users/huytran/Library/CloudStorage/GoogleDrive-trangiahuy8444@gmail.com/My Drive/01_Giang_day/2026-2027/Workspace Tin học 2026-2027/ngan-hang-de-web"

# 2. Đổi tên nhánh mặc định sang main
git branch -M main

# 3. Thêm link remote GitHub của Thầy (thay <ten-tai-khoan-github> bằng username của Thầy)
git remote add origin https://github.com/<ten-tai-khoan-github>/exammatrix-studio.git

# Hoặc nếu đã có origin cũ, cập nhật URL:
# git remote set-url origin https://github.com/<ten-tai-khoan-github>/exammatrix-studio.git

# 4. Thêm tệp và commit
git add .
git commit -m "Trien khai ExamMatrix Studio tren GitHub Pages va Firebase Auth/Firestore"

# 5. Đẩy lên GitHub
git push -u origin main
```

Ngay sau khi push, GitHub Actions sẽ tự động kích hoạt workflow `.github/workflows/deploy-pages.yml` để xuất bản website lên địa chỉ:
`https://<ten-tai-khoan-github>.github.io/exammatrix-studio/`

---

## 5. QUY TRÌNH SỬ DỤNG DÀNH CHO GIÁO VIÊN

1. **Đăng nhập / Tạo tài khoản**:
   - Khi vào trang web, giáo viên bấm nút **"Đăng nhập"** ở góc phải trên cùng.
   - Nhập Email và Mật khẩu cá nhân để đăng ký/đăng nhập.
2. **Cách ly dữ liệu tự động**:
   - Ngay khi đăng nhập, hệ thống tạo riêng một phân vùng trên Firestore: `workspaces/{MÃ_UID_GIÁO_VIÊN}`.
   - Mọi câu hỏi được thêm mới, đề thi được tạo hay chỉnh sửa sẽ được lưu độc quyền vào phân vùng này. Giáo viên khác không thể xem hoặc sửa đổi.
3. **Nạp câu hỏi từ AI Chat vào Web**:
   - Giáo viên copy Prompt mẫu yêu cầu AI (Gemini, ChatGPT) tạo câu hỏi dạng JSON.
   - Lưu đoạn JSON thành tệp `.json` trên máy tính.
   - Trên web, vào mục **Ngân hàng câu hỏi** > bấm nút **"Nhập JSON"** > chọn tệp vừa lưu. Câu hỏi sẽ lập tức xuất hiện trong danh mục cá nhân của giáo viên!
