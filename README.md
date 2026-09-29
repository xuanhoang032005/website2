# AnhTraiStore

AnhTraiStore là đồ án website thương mại điện tử bán điện thoại, máy tính, đồng hồ và phụ kiện công nghệ. Ứng dụng dùng Node.js/Express, MySQL và giao diện HTML/CSS/JavaScript thuần; có khu vực khách hàng, trang quản trị, chat hỗ trợ realtime và trợ lý mua sắm Gemini.

> Đây là dự án phục vụ học tập. Luồng VNPay và MoMo chỉ mô phỏng kết quả thanh toán, không kết nối cổng thanh toán thật.

## Chức năng hiện có

### Khách hàng

- Đăng ký, đăng nhập bằng email/mật khẩu và đăng nhập Google OAuth (khi được cấu hình).
- Quên mật khẩu bằng OTP email; cập nhật hồ sơ, đổi mật khẩu và ảnh đại diện.
- Xem, tìm kiếm, phân trang, lọc và sắp xếp sản phẩm theo danh mục, thương hiệu, RAM, bộ nhớ và giá.
- Xem gallery, thông số, đánh giá và sản phẩm liên quan; so sánh tối đa 4 sản phẩm.
- Quản lý giỏ hàng, mua ngay, danh sách yêu thích và mã giảm giá.
- Thanh toán COD hoặc chạy luồng VNPay/MoMo mô phỏng.
- Xem lịch sử, chi tiết, trạng thái và hủy đơn đang chờ xác nhận.
- Đánh giá sản phẩm đã mua và đã nhận hàng.
- Gửi liên hệ và chat hai chiều với quản trị viên qua Socket.IO.
- Chat với trợ lý AI để tìm/tư vấn sản phẩm, kiểm tra tồn kho, xem chính sách và tra cứu đơn của tài khoản đang đăng nhập.

### Quản trị viên

- Dashboard doanh thu, đơn hàng, khách hàng, cảnh báo tồn kho, biểu đồ và thông báo.
- Quản lý sản phẩm và gallery ảnh, danh mục, thương hiệu.
- Xem đơn hàng và cập nhật trạng thái theo đúng luồng nghiệp vụ.
- Xem người dùng và tạo tài khoản người dùng mới.
- Xem, phản hồi hoặc xóa đánh giá.
- Tiếp nhận và trả lời hội thoại hỗ trợ realtime; đóng/mở lại hội thoại.
- Quản lý coupon.
- Quản lý banner trang chủ; banner chính hỗ trợ tối đa 10 ảnh.

## Công nghệ

- Backend: Node.js 20+, Express 4, MySQL2, Express Session.
- Xác thực: bcryptjs, Passport, Google OAuth 2.0.
- Realtime: Socket.IO.
- Email: Nodemailer qua SMTP.
- Lưu ảnh: Multer và Cloudinary.
- AI: Gemini `generateContent` API với function calling tới dữ liệu cửa hàng.
- Frontend: HTML5, CSS3, JavaScript thuần và Bootstrap Icons.
- Kiểm thử: Node.js `assert` và test runner tự xây dựng trong `tests/product-regressions.test.js`.

## Yêu cầu

- Node.js `>= 20` (dịch vụ AI sử dụng `fetch` và `AbortController` có sẵn trong Node).
- npm.
- MySQL/MariaDB; có thể dùng MySQL trong XAMPP và phpMyAdmin.
- Một database trống cho dữ liệu mẫu.
- Tài khoản Cloudinary nếu cần tải ảnh mới.
- Tài khoản SMTP, Google OAuth và Gemini chỉ khi muốn dùng các tính năng tương ứng.

## Cài đặt và chạy

### 1. Cài package

```bash
npm install
```

### 2. Tạo và import database

Tạo database `anhtraisstore` với collation `utf8mb4_unicode_ci`, sau đó import file [`database/anhtraistore.sql`](database/anhtraistore.sql). File SQL không tự tạo hoặc tự chọn database, vì vậy cần chọn đúng database trước khi import.

Với phpMyAdmin:

1. Mở `http://localhost/phpmyadmin/`.
2. Tạo database `anhtraisstore`.
3. Chọn database vừa tạo, vào **Import**.
4. Chọn `database/anhtraistore.sql` và chạy import.

Hoặc dùng MySQL CLI trong Bash/cmd:

```bash
mysql -u root -p -e "CREATE DATABASE anhtraisstore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p anhtraisstore < database/anhtraistore.sql
```

#### Lưu ý tương thích schema liên hệ

Mã nguồn hiện tại gắn form liên hệ với tài khoản đăng nhập qua `contacts.user_id`, trong khi snapshot `database/anhtraistore.sql` chưa khai báo cột này. Sau khi import, chạy một lần:

```sql
ALTER TABLE contacts
    ADD COLUMN user_id INT NULL AFTER id,
    ADD INDEX idx_contacts_user_id (user_id),
    ADD CONSTRAINT fk_contacts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

Nếu database đã có `contacts.user_id`, bỏ qua bước này.

### 3. Cấu hình môi trường

Sao chép `.env.example` thành `.env`:

```powershell
Copy-Item .env.example .env
```

Hoặc trên Bash:

```bash
cp .env.example .env
```

Cấu hình tối thiểu để chạy ứng dụng:

```env
NODE_ENV=development
PORT=3000
SITE_NAME=AnhTraiStore
SITE_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
SESSION_SECRET=replace-with-a-long-random-secret

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=anhtraisstore
```

Các tích hợp tùy chọn:

```env
# Gmail hoặc SMTP tương thích: gửi OTP, xác nhận đơn và email chào mừng
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Cloudinary: bắt buộc cho thao tác upload sản phẩm, banner và avatar
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_PRODUCT_FOLDER=anhtraisstore/products
CLOUDINARY_BANNER_FOLDER=anhtraisstore/banners
CLOUDINARY_AVATAR_FOLDER=anhtraisstore/avatars

# Trợ lý AI Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
GEMINI_API_TIMEOUT_MS=60000
GEMINI_THINKING_LEVEL=minimal
```

Không có cấu hình SMTP hoặc Google OAuth thì server vẫn chạy và tự vô hiệu hóa tính năng tương ứng. Không có Cloudinary thì vẫn xem được ảnh sẵn có, nhưng các API upload trả lỗi `503`. Không có `GEMINI_API_KEY` thì chat AI không hoạt động; chat hỗ trợ với admin vẫn dùng được.

### 4. Khởi động

```bash
# Chạy thông thường
npm start

# Tự khởi động lại khi sửa mã nguồn
npm run dev
```

Mở `http://localhost:3000`.

## Tài khoản mẫu

File SQL tạo sẵn tài khoản quản trị:

- Email: `adminanhtrai@gmail.com`
- Mật khẩu: `admin123`
- Trang quản trị: `http://localhost:3000/admin`

Đây là thông tin demo; hãy đổi mật khẩu trước khi đưa ứng dụng lên môi trường công khai.

## Các URL chính

- `/`: trang chủ.
- `/products`, `/product/:id`: danh sách và chi tiết sản phẩm.
- `/cart`, `/checkout`: giỏ hàng và thanh toán.
- `/wishlist`, `/compare`: yêu thích và so sánh.
- `/orders`, `/order/:id`: danh sách và chi tiết đơn hàng.
- `/profile`: hồ sơ người dùng.
- `/promotions`, `/policy`, `/contact`: ưu đãi, chính sách và liên hệ.
- `/admin`: dashboard quản trị.
- `/health`: kiểm tra tiến trình web.
- `/ready`: kiểm tra kết nối database; trả `503` nếu database chưa sẵn sàng.

API được chia theo các prefix `/api/auth`, `/api/products`, `/api/cart`, `/api/orders`, `/api/wishlist`, `/api/coupons`, `/api/messages` và `/api/chat`. API quản trị sản phẩm, đơn hàng, người dùng, đánh giá, coupon và banner nằm dưới `/admin`.

## Quy tắc nghiệp vụ đáng chú ý

- Giá, tồn kho, phí vận chuyển và số tiền giảm được backend tính lại từ database.
- Phí vận chuyển là `30.000đ`; đơn có tạm tính từ `500.000đ` được miễn phí.
- Số lượng phải là số nguyên dương và không vượt quá tồn kho.
- COD tạo đơn `pending`, trừ kho và ghi nhận coupon ngay khi đặt hàng.
- VNPay/MoMo tạo đơn `pending` nhưng chưa trừ kho. Nút xác nhận thanh toán mô phỏng chuyển đơn sang `confirmed`, sau đó mới trừ kho và ghi nhận coupon.
- Luồng trạng thái quản trị: `pending -> confirmed -> shipping -> delivered`; trạng thái hợp lệ có thể chuyển sang `cancelled` theo quy tắc trong backend.
- Khách chỉ tự hủy được đơn `pending`. COD được hoàn kho khi hủy; coupon đã ghi nhận cũng được hoàn lượt.
- Mỗi tài khoản chỉ dùng một coupon một lần. `WELCOME10` và `NEWUSER` chỉ dành cho đơn đầu tiên; `VIP20` yêu cầu tổng đơn đã giao từ 30 triệu đồng.
- Chỉ tài khoản đã có đơn `delivered` chứa sản phẩm mới được đánh giá sản phẩm đó, và mỗi sản phẩm chỉ được đánh giá một lần trên mỗi tài khoản.
- Sản phẩm đã xuất hiện trong đơn hàng không thể bị xóa, nhằm giữ lịch sử đơn.
- Dữ liệu “Mua ngay” được giữ trong session tối đa 15 phút.

Các coupon mẫu gồm `WELCOME10`, `FREESHIP`, `VIP20`, `SALE5TR`, `PHONE15` và `NEWUSER`. Ngày hết hạn và giới hạn sử dụng nằm trong dữ liệu SQL, vì vậy giao diện chỉ hiển thị những mã còn hiệu lực tại thời điểm chạy.

## Cấu trúc dự án

```text
Website/
├── server.js                     # Entry point HTTP và Socket.IO
├── package.json                  # Dependencies và npm scripts
├── .env.example                  # Mẫu biến môi trường
├── database/
│   └── anhtraistore.sql          # Schema 19 bảng, phiên bản sản phẩm và dữ liệu demo
├── docs/
│   └── bao-cao-do-an.md          # Báo cáo, use case và tài liệu thiết kế
├── public/
│   ├── assets/images/products/   # Ảnh sản phẩm local
│   ├── uploads/banners/          # Ảnh banner local
│   ├── css/                      # CSS khách hàng, admin, bộ lọc, chatbox
│   ├── images/                   # Fallback ảnh và QR demo
│   └── js/                       # Logic giao diện dùng chung
├── src/
│   ├── app.js                    # Khởi tạo Express và middleware
│   ├── config/                   # Database, runtime, SMTP, Google OAuth
│   ├── core/                     # Path, upload validation, review helpers
│   ├── middleware/               # Auth, rate limit, security, error handler
│   ├── realtime/                 # Socket.IO cho chat hỗ trợ
│   ├── routes/                   # Page routes và API nghiệp vụ
│   └── services/                 # Cloudinary và trợ lý Gemini
├── tests/
│   └── product-regressions.test.js
└── views/
    ├── components/               # Chatbox dùng chung
    ├── admin/                    # 10 trang quản trị
    └── *.html                    # 16 trang khách hàng
```

Database gồm 19 bảng, trong đó `product_variants` lưu riêng RAM, ROM, màu sắc, SKU, giá và tồn kho của từng phiên bản sản phẩm.

## Kiểm tra dự án

```bash
# Chạy 42 bài kiểm tra hồi quy
npm test

# Kiểm tra cú pháp entry point rồi chạy test
npm run check
```

Test hiện bao phủ các luồng quan trọng như lọc sản phẩm, giỏ hàng, đặt/hủy đơn, coupon, banner, upload Cloudinary, phân quyền, giới hạn request, bảo mật lỗi API và function calling của trợ lý AI.

## Ghi chú triển khai

- Khi `NODE_ENV=production`, `SESSION_SECRET` bắt buộc dài ít nhất 32 ký tự, cookie session bật `secure`, Express tin proxy cấp đầu tiên và HSTS được bật. Vì vậy production cần HTTPS và cấu hình reverse proxy đúng.
- `CORS_ORIGINS` nhận một hoặc nhiều origin, phân cách bằng dấu phẩy. Hãy khai báo origin frontend thật khi chạy production.
- Session hiện dùng MemoryStore mặc định của `express-session`; phù hợp demo/local nhưng cần thay bằng Redis hoặc persistent store khi chạy nhiều tiến trình hay triển khai production lâu dài.
- API có rate limit trong bộ nhớ: toàn bộ `/api` tối đa 300 request/15 phút/IP; đăng nhập tối đa 10 lần/15 phút/IP; yêu cầu/kiểm tra OTP tối đa 5 lần/15 phút/IP.
- Upload chấp nhận `jpg`, `jpeg`, `png`, `gif`, `webp`. Avatar tối đa 2 MB; mỗi ảnh sản phẩm/banner tối đa 5 MB.
- Không commit `.env` hoặc khóa SMTP, Google, Cloudinary, Gemini vào repository.

## Xử lý lỗi thường gặp

### Không kết nối được MySQL

- Kiểm tra MySQL đã chạy và đúng host/port.
- Kiểm tra `DB_USER`, `DB_PASS`, `DB_NAME` trong `.env`.
- Mở `/ready` để phân biệt lỗi database với lỗi web server.

### `Unknown column 'user_id' in 'contacts'`

Chạy câu lệnh `ALTER TABLE contacts` ở phần **Lưu ý tương thích schema liên hệ**.

### Google OAuth quay lại trang đăng nhập

- Kiểm tra đủ `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`.
- Authorized redirect URI trên Google Cloud phải khớp chính xác `GOOGLE_CALLBACK_URL`.

### Không upload được ảnh

- Kiểm tra ba biến `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Kiểm tra định dạng và giới hạn dung lượng file.

### AI báo chưa được cấu hình

Điền `GEMINI_API_KEY`; đồng thời kiểm tra `GEMINI_MODEL` là model mà API key có quyền sử dụng.

### Port 3000 đang được dùng trên Windows

```powershell
Get-NetTCPConnection -LocalPort 3000
Stop-Process -Id <PID>
```

Hoặc đổi `PORT` trong `.env`.

## Tài liệu

- [Báo cáo đồ án](docs/bao-cao-do-an.md)

## Giấy phép

Dự án khai báo giấy phép MIT trong `package.json`.
