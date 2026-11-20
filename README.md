# AnhTraiStore

AnhTraiStore là đồ án website thương mại điện tử bán điện thoại, máy tính, đồng hồ và phụ kiện công nghệ. Ứng dụng dùng Node.js/Express, MySQL và giao diện HTML/CSS/JavaScript thuần; có khu vực khách hàng, trang quản trị, chat hỗ trợ realtime và trợ lý mua sắm GPT.

> Đây là dự án phục vụ học tập. Luồng VNPay và MoMo chỉ mô phỏng kết quả thanh toán, không kết nối cổng thanh toán thật.

## Chức năng hiện có

### Khách hàng

- Đăng ký, đăng nhập bằng email/mật khẩu và đăng nhập Google OAuth (khi được cấu hình).
- Quên mật khẩu bằng OTP email; cập nhật hồ sơ, đổi mật khẩu và ảnh đại diện.
- Xem, tìm kiếm, phân trang, lọc và sắp xếp sản phẩm theo danh mục, thương hiệu, RAM, bộ nhớ và giá.
- Xem gallery, thông số theo danh mục, đánh giá và sản phẩm liên quan; chọn phiên bản RAM, bộ nhớ và màu sắc.
- So sánh tối đa 4 sản phẩm và yêu cầu AI đưa ra kết luận từ dữ liệu sản phẩm.
- Quản lý giỏ hàng, mua ngay, danh sách yêu thích và mã giảm giá.
- Chọn giao hàng tiêu chuẩn hoặc giao nhanh, xem thời gian giao dự kiến; thanh toán COD hoặc chạy luồng VNPay/MoMo mô phỏng.
- Xem lịch sử, chi tiết, tiến trình trạng thái theo thời gian, mã vận đơn và hủy đơn đang chờ xác nhận.
- Đánh giá sản phẩm trong đơn đã giao; người mua được sửa đánh giá và báo cáo đánh giá khác.
- Đặt nhiều câu hỏi trên trang sản phẩm sau khi đăng nhập; nhận trả lời về thông số, giá, tồn kho hoặc ưu đãi. Câu hỏi thiếu dữ liệu hoặc cần tư vấn thêm được đánh dấu để quản trị viên hỗ trợ.
- Yêu cầu đổi trả hoặc bảo hành từ sản phẩm trong đơn đã giao, đính kèm tối đa 4 ảnh và theo dõi trạng thái xử lý.
- Gửi liên hệ và chat hai chiều với quản trị viên qua Socket.IO.
- Chat với trợ lý AI để tìm/tư vấn sản phẩm, kiểm tra tồn kho, xem chính sách và tra cứu đơn của tài khoản đang đăng nhập.

### Quản trị viên

- Dashboard doanh thu, đơn hàng, khách hàng, cảnh báo tồn kho, biểu đồ và thông báo.
- Quản lý sản phẩm, phiên bản, giá, tồn kho và gallery ảnh; sắp xếp ảnh và chọn ảnh đại diện.
- Quản lý danh mục, ảnh danh mục, mẫu thông số kỹ thuật và thương hiệu; nhập thông số sản phẩm theo mẫu của danh mục.
- Xem đơn hàng, cập nhật trạng thái theo đúng luồng nghiệp vụ và nhập đơn vị/mã vận chuyển cùng ghi chú gửi khách.
- Xem, tạo, chỉnh sửa thông tin/vai trò/mật khẩu và xóa người dùng; có xác nhận trước khi xóa.
- Xem, phản hồi hoặc xóa đánh giá/câu hỏi; xem các báo cáo đánh giá và nội dung cần quản trị viên hỗ trợ.
- Xem liên hệ từ website và đánh dấu đã đọc.
- Tiếp nhận và trả lời hội thoại hỗ trợ realtime; đóng/mở lại hội thoại.
- Quản lý coupon.
- Xử lý yêu cầu đổi trả và bảo hành theo trạng thái.
- Cập nhật tồn kho qua quản lý sản phẩm và xem lịch sử tồn đầu, xuất kho, hoàn kho, điều chỉnh theo từng phiên bản.
- Quản lý banner trang chủ; banner chính hỗ trợ tối đa 10 ảnh.

## Công nghệ

- Backend: Node.js 20+, Express 4, MySQL2, Express Session với session lưu trong MySQL.
- Xác thực: bcryptjs, Passport, Google OAuth 2.0.
- Realtime: Socket.IO.
- Email: Nodemailer qua SMTP.
- Lưu ảnh: Multer và Cloudinary.
- AI: OpenAI Chat Completions API với function calling tới dữ liệu cửa hàng; hỗ trợ base URL riêng của dịch vụ tương thích OpenAI.
- Frontend: HTML5, CSS3, JavaScript thuần, Bootstrap Icons và Chart.js.
- Kiểm thử: Node.js `assert`, bộ hồi quy trong `tests/product-regressions.test.js` và E2E trên MySQL trong `tests/end-to-end.js`.

## Yêu cầu

- Node.js `>= 20` (dịch vụ AI sử dụng `fetch` và `AbortController` có sẵn trong Node).
- npm.
- MySQL/MariaDB; có thể dùng XAMPP và phpMyAdmin. CI hiện kiểm tra trên MySQL 8.0.
- Một database trống cho dữ liệu mẫu.
- Tài khoản Cloudinary nếu cần tải ảnh mới.
- Tài khoản SMTP, Google OAuth và OpenAI hoặc dịch vụ API tương thích chỉ khi muốn dùng các tính năng tương ứng.

## Cài đặt và chạy

### 1. Cài package

```bash
npm ci
```

Lệnh này cài đúng phiên bản dependency trong `package-lock.json`.

### 2. Cấu hình môi trường

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
SMTP_FROM=adminanhtrai@gmail.com
CONTACT_EMAIL=adminanhtrai@gmail.com
ORDER_NOTIFICATION_EMAIL=adminanhtrai@gmail.com

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Cloudinary: cần cấu hình khi tải ảnh mới lên
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_PRODUCT_FOLDER=anhtraisstore/products
CLOUDINARY_BANNER_FOLDER=anhtraisstore/banners
CLOUDINARY_AVATAR_FOLDER=anhtraisstore/avatars
CLOUDINARY_CATEGORY_FOLDER=anhtraisstore/categories
CLOUDINARY_SERVICE_REQUEST_FOLDER=anhtraisstore/service-requests

# Trợ lý AI GPT
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_API_TIMEOUT_MS=60000
```

Để email xác nhận đơn thực sự được gửi **từ** `adminanhtrai@gmail.com`, đặt `SMTP_USER` thành địa chỉ này và `SMTP_PASS` thành App Password của chính tài khoản đó. `ORDER_NOTIFICATION_EMAIL` là hộp thư nhận mọi thông báo đơn hàng mới; hai email khách/admin được đưa vào hai job riêng để retry độc lập.

`OPENAI_BASE_URL` là URL gốc của API, thường kết thúc bằng `/v1`; không thêm `/chat/completions` vì client tự nối endpoint này. `OPENAI_API_KEY` là khóa của dịch vụ tại base URL đó. `OPENAI_MODEL` phải là Model ID được dịch vụ và API key hỗ trợ; trợ lý cửa hàng cần Chat Completions và function calling (`tools`, `tool_calls`).

Với API key từ ModelAPI, mẫu cấu hình trong `.env.example` ghi base URL `https://modelapi.vn/v1`. Hãy dùng base URL và Model ID do dịch vụ cấp cho API key của bạn.

Giá trị mặc định trong mã nguồn và `.env.example` là `gpt-5.6-terra`; cần thay nếu dịch vụ của bạn không cung cấp Model ID này. Client hiện tự thêm `reasoning_effort: none` với tên model khớp GPT-5.4/GPT-5.6. Timeout mặc định là 60 giây, được giới hạn trong khoảng 10–120 giây.

Khóa API chỉ nằm trong `.env` ở máy chủ, không đưa vào HTML hoặc JavaScript phía trình duyệt. Khởi động lại server sau khi sửa cấu hình môi trường.

Không có SMTP hoặc Google OAuth thì server vẫn chạy, nhưng tính năng tương ứng chưa sử dụng được. Không có Cloudinary thì vẫn xem được ảnh sẵn có, nhưng các API upload trả lỗi `503`. Không có `OPENAI_API_KEY` thì chat AI và kết luận so sánh bằng AI không hoạt động; câu hỏi sản phẩm vẫn được lưu để admin hỗ trợ, còn chat hỗ trợ với admin vẫn dùng được.

### 3. Tạo và import database

Tạo database trống `anhtraisstore` với collation `utf8mb4_unicode_ci`, sau đó import [`database/anhtraistore.sql`](database/anhtraistore.sql). File SQL không tự tạo hoặc tự chọn database, vì vậy cần chọn đúng database trước khi import. Tên này phải khớp `DB_NAME` trong `.env`; nếu bỏ trống biến, mã nguồn mặc định dùng `dt`.

Với phpMyAdmin:

1. Mở `http://localhost/phpmyadmin/`.
2. Tạo và chọn database `anhtraisstore`.
3. Vào **Import**, chọn `database/anhtraistore.sql` và chạy import.

Hoặc dùng MySQL CLI trong Bash/cmd:

```bash
mysql -u root -p -e "CREATE DATABASE anhtraisstore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p anhtraisstore < database/anhtraistore.sql
```

PowerShell không hỗ trợ cú pháp chuyển hướng `<` như trên. Có thể mở `mysql -u root -p anhtraisstore`, rồi chạy lệnh sau trong MySQL client:

```sql
SOURCE database/anhtraistore.sql;
```

`database/anhtraistore.sql` là file SQL tổng, bao gồm schema, dữ liệu mẫu, các khối nâng cấp và lịch sử trong `schema_migrations`. Import toàn bộ chỉ dành cho cài mới vì file có các lệnh `TRUNCATE` để tạo lại dữ liệu demo.

Với database đã có dữ liệu, sao lưu rồi chạy:

```bash
npm run migrate
```

Runner chỉ thực thi các khối nâng cấp được đánh dấu trong SQL tổng, không import lại toàn bộ dữ liệu demo; các khối có thể bổ sung cấu trúc, ràng buộc và cập nhật dữ liệu theo từng migration. Lịch sử và checksum được theo dõi trong `schema_migrations`, thống nhất giữa Windows/Linux.

### 4. Khởi động

```bash
# Chạy thông thường
npm start

# Tự khởi động lại khi sửa mã nguồn
npm run dev
```

Mở `http://localhost:3000` (hoặc cổng đã đặt trong `PORT`). Trước khi mở cổng, server tự chạy migration còn thiếu, đồng bộ tồn kho sản phẩm theo phiên bản, bổ sung tiêu đề liên hệ trống và ghi sổ tồn kho ban đầu nếu cần. Database phải được tạo/import trước khi khởi động.

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
- `/admin/inventory` (hoặc `/admin/history`): lịch sử biến động tồn kho.
- `/admin/service-requests`: quản lý yêu cầu đổi trả và bảo hành.
- `/health`: kiểm tra tiến trình web.
- `/ready`: kiểm tra kết nối database; trả `503` nếu database chưa sẵn sàng.
- `/metrics`: thống kê request, lỗi, độ trễ và trạng thái queue.

API được chia theo các prefix `/api/auth`, `/api/products`, `/api/cart`, `/api/orders`, `/api/wishlist`, `/api/coupons`, `/api/messages`, `/api/chat` và `/api/service-requests`. Tìm kiếm, liên hệ, đánh giá/hỏi đáp, danh mục, thương hiệu và banner công khai nằm trực tiếp dưới `/api`.

API quản trị sản phẩm, đơn hàng, người dùng, đánh giá/câu hỏi, liên hệ, coupon và banner nằm dưới `/admin`. Quản trị danh mục/thương hiệu dùng `/api/categories` và `/api/brands`; xử lý hậu mãi dùng `/api/service-requests/admin/...`; chat hỗ trợ quản trị dùng `/api/messages/admin/...`. Các thao tác quản trị đều được kiểm tra quyền ở backend.

## Quy tắc nghiệp vụ đáng chú ý

- Backend lấy giá, tồn kho từ database và tự tính lại phí vận chuyển, số tiền giảm, tổng thanh toán.
- Phí vận chuyển tiêu chuẩn (`standard`) là `30.000đ`; giao nhanh (`express`) là `50.000đ`. Backend hiện không tự miễn phí vận chuyển theo giá trị đơn. Thời gian giao dự kiến được tính theo địa chỉ và hình thức giao hàng.
- Số lượng phải là số nguyên dương và không vượt quá tồn kho.
- COD tạo đơn `pending`, trừ kho và ghi nhận coupon ngay khi đặt hàng.
- VNPay/MoMo tạo đơn `pending` nhưng chưa trừ kho. Nút xác nhận thanh toán mô phỏng chuyển đơn sang `confirmed`, sau đó mới trừ kho và ghi nhận coupon.
- Luồng trạng thái quản trị: `pending -> confirmed -> shipping -> delivered`; trạng thái hợp lệ có thể chuyển sang `cancelled` theo quy tắc trong backend.
- Khách chỉ tự hủy được đơn `pending`. COD được hoàn kho khi hủy; coupon đã ghi nhận cũng được hoàn lượt.
- Đơn vị vận chuyển, mã vận đơn và thời gian giao là dữ liệu mô phỏng của ứng dụng; mã này không dùng để tra cứu tại hãng vận chuyển thật.
- Mỗi tài khoản chỉ dùng một coupon một lần. `WELCOME10` và `NEWUSER` chỉ dành cho đơn đầu tiên; `VIP20` yêu cầu tổng đơn đã giao từ 30 triệu đồng.
- Chỉ tài khoản đã có đơn `delivered` chứa sản phẩm mới được đánh giá sản phẩm đó, và mỗi sản phẩm chỉ được đánh giá một lần trên mỗi tài khoản.
- Hỏi đáp sản phẩm không yêu cầu đã mua hàng; người dùng phải đăng nhập và có thể gửi nhiều câu hỏi. Câu hỏi không có điểm sao, được lưu riêng loại nội dung trong bảng `reviews` và không tính vào điểm đánh giá.
- Sản phẩm đã xuất hiện trong đơn hàng không thể bị xóa, nhằm giữ lịch sử đơn.
- Không thể tự xóa tài khoản đang đăng nhập hoặc tự hạ quyền quản trị. Người dùng có đơn hàng, đánh giá, câu hỏi hoặc yêu cầu đổi trả/bảo hành không thể bị xóa để giữ lịch sử. Đổi email, vai trò hoặc mật khẩu sẽ kết thúc các phiên đăng nhập khác của người dùng.
- Dữ liệu “Mua ngay” được giữ trong session tối đa 15 phút.

Các coupon mẫu gồm `WELCOME10`, `FREESHIP`, `VIP20`, `SALE5TR`, `PHONE15` và `NEWUSER`. Ngày hết hạn và giới hạn sử dụng nằm trong dữ liệu SQL, vì vậy giao diện chỉ hiển thị những mã còn hiệu lực tại thời điểm chạy.

## Cấu trúc dự án

Các API đọc danh sách/chi tiết đơn hàng, thống kê tổng quan và quản trị người dùng sử dụng các lớp `controller -> service -> repository`; nhiều nghiệp vụ khác vẫn nằm trong route. Tích hợp GPT dùng client riêng tại `src/services/ai/openai-client.js`, trợ lý mua sắm tại `src/services/store-ai.js` và hỏi đáp sản phẩm tại `src/services/product-qa.js`. Backend tra cứu database và kiểm tra quyền sở hữu khi AI xem đơn hàng.

JavaScript dùng chung cho request/CSRF và hộp chat nằm trong `public/js/modules/`; logic checkout và quản trị người dùng nằm trong các file riêng tại `public/js/`.

```text
Website/
├── server.js                     # Entry point HTTP và Socket.IO
├── package.json                  # Dependencies và npm scripts
├── .env.example                  # Mẫu biến môi trường
├── .github/workflows/ci.yml       # Kiểm tra tự động với MySQL 8.0
├── database/
│   └── anhtraistore.sql          # Schema, dữ liệu demo và khối nâng cấp database cũ
├── public/
│   ├── assets/images/products/   # Ảnh sản phẩm local
│   ├── uploads/banners/          # Ảnh banner local
│   ├── css/                      # CSS khách hàng, admin, bộ lọc, chatbox
│   ├── images/                   # Fallback ảnh và QR demo
│   └── js/                       # Logic giao diện, module HTTP/CSRF, chat và Chart.js
├── scripts/                      # Kiểm tra cú pháp, format-check và backup MySQL
├── src/
│   ├── app.js                    # Khởi tạo Express và middleware
│   ├── config/                   # Database, runtime, SMTP, Google OAuth
│   ├── controllers/              # HTTP handlers cho các API đã tách lớp
│   ├── core/                     # Path, upload validation, review helpers
│   ├── middleware/               # Auth, rate limit, security, error handler
│   ├── realtime/                 # Socket.IO cho chat hỗ trợ
│   ├── repositories/             # Truy vấn cho đơn hàng và quản trị
│   ├── routes/                   # Page routes và API nghiệp vụ
│   └── services/                 # Nghiệp vụ, tồn kho, queue, session, Cloudinary và GPT
├── tests/
│   ├── product-regressions.test.js
│   └── end-to-end.js             # Kiểm tra tích hợp trên database tạm
└── views/
    ├── components/               # Chatbox dùng chung
    ├── admin/                    # 12 trang quản trị
    └── *.html                    # 16 trang khách hàng
```

Database gồm các bảng nghiệp vụ, trong đó `product_variants` lưu RAM, ROM, màu sắc, SKU, giá và tồn kho theo phiên bản; `inventory_movements` lưu lịch sử thay đổi kho; `service_requests` và `service_request_images` lưu yêu cầu hậu mãi cùng ảnh đính kèm; `review_reports` lưu báo cáo đánh giá. `categories.technical_specs_template` định nghĩa mẫu thông số, còn `products.technical_specs` lưu giá trị của từng sản phẩm. Session, rate limit và queue dùng các bảng `sessions`, `rate_limit_buckets` và `background_jobs`.

Khách chỉ đánh giá được sản phẩm có trong đơn đã giao. Với mỗi dòng sản phẩm trong đơn, khách có thể tạo tối đa một yêu cầu đổi trả và một yêu cầu bảo hành. Trạng thái xử lý gồm `submitted`, `reviewing`, `approved`, `rejected` và `resolved`.

## Kiểm tra dự án

```bash
# Kiểm tra cú pháp JavaScript backend, scripts và tests
npm run lint

# Chạy script format-check hiện tại, không tự sửa file
npm run format

# Chạy bộ kiểm tra hồi quy
npm test

# Chạy lint, format-check, kiểm tra cú pháp migration và test hồi quy
npm run check

# E2E trên MySQL: tạo và xóa database dùng tên ngẫu nhiên
npm run test:e2e

# Kiểm tra riêng quản trị người dùng trên MySQL
npm run test:e2e:users
```

Test hồi quy bao phủ các luồng như lọc sản phẩm, giỏ hàng, đặt/hủy đơn, coupon, banner, upload Cloudinary, phân quyền, giới hạn request, bảo mật lỗi API và function calling của trợ lý AI. `npm run check` không cần database MySQL đang chạy.

`npm run test:e2e` dùng kết nối MySQL trong `.env`, tự tạo database tạm tên `ats_e2e_...`, import dữ liệu rồi kiểm tra quản trị người dùng, đăng nhập/session, giỏ hàng, COD, thanh toán mô phỏng, trạng thái đơn, đánh giá, hậu mãi, chat, rate limit và queue. Email được stub, database tạm được xóa khi hoàn tất; tài khoản DB cần quyền `CREATE/DROP DATABASE`. CI chạy `npm ci`, lint, format-check, hồi quy và E2E trên MySQL riêng.

## Log, tác vụ nền và sao lưu

Các biến vận hành tùy chọn trong `.env.example`:

```env
ALERT_WEBHOOK_URL=
METRICS_TOKEN=
BACKUP_DIR=./backups
JOB_CONCURRENCY=2
```

Middleware ghi log request dạng JSON với `request_id`, phương thức, URL, status và thời gian xử lý. `GET /metrics` trả snapshot request/error/latency và queue; khi đặt `METRICS_TOKEN`, gửi `Authorization: Bearer <token>`. Nếu đặt `ALERT_WEBHOOK_URL`, bộ xử lý lỗi gửi cảnh báo JSON khi gặp lỗi 5xx.

Session, bộ đếm rate limit và queue nền được lưu trong MySQL, dùng chung giữa các tiến trình và tồn tại qua lần khởi động lại. Queue có retry/backoff, lease để phục hồi job bị bỏ dở và giữ kết quả 30 ngày. Một job có thể được xử lý lại nếu worker dừng sau khi dịch vụ ngoài nhận yêu cầu nhưng trước khi queue ghi nhận hoàn tất.

Email xác nhận đơn cho khách/admin, OTP, chào mừng, liên hệ và dọn ảnh đều chạy nền. `JOB_CONCURRENCY` quy định số job xử lý đồng thời trong mỗi tiến trình. Yêu cầu chat AI dài trên 600 ký tự hoặc có `async: true` trả HTTP `202` kèm `job_id`; client poll `GET /api/chat/ai/jobs/:id` bằng đúng session tạo job để lấy kết quả. Câu hỏi chat AI dài tối đa 1.000 ký tự.

Sao lưu database bằng:

```bash
npm run backup
```

Lệnh gọi `mysqldump` từ `PATH`, đọc `DB_*` trong `.env` và ghi file SQL có dấu thời gian vào `BACKUP_DIR` (mặc định `./backups`). Có thể dùng Task Scheduler/cron để chạy định kỳ và lưu bản sao ở nơi riêng.

## Ghi chú triển khai

- Khi `NODE_ENV=production`, `SESSION_SECRET` bắt buộc dài ít nhất 32 ký tự, cookie session bật `secure`, Express tin proxy cấp đầu tiên và HSTS được bật. Vì vậy production cần HTTPS và cấu hình reverse proxy đúng.
- `CORS_ORIGINS` nhận một hoặc nhiều origin, phân cách bằng dấu phẩy. Hãy khai báo origin frontend thật khi chạy production.
- Session, rate limit và queue được lưu trong MySQL. OTP đặt lại mật khẩu lưu dưới dạng HMAC-SHA-256 trong `reset_tokens`, hết hạn sau 5 phút và bị xóa sau khi dùng hoặc nhập sai 5 lần. Rate limit: toàn bộ `/api` tối đa 1.200 request/15 phút/IP khi production (5.000 khi development); đăng nhập tối đa 10 lần/15 phút/IP; yêu cầu/kiểm tra OTP tối đa 5 lần/15 phút/IP.
- Upload chấp nhận `jpg`, `jpeg`, `png`, `gif`, `webp`. Avatar tối đa 2 MB; mỗi ảnh sản phẩm, banner, danh mục hoặc hậu mãi tối đa 5 MB. Banner chính tối đa 10 ảnh; mỗi yêu cầu đổi trả/bảo hành tối đa 4 ảnh.
- Không commit `.env` hoặc khóa SMTP, Google, Cloudinary, OpenAI vào repository.

## Xử lý lỗi thường gặp

### Không kết nối được MySQL

- Kiểm tra MySQL đã chạy và đúng host/port.
- Kiểm tra `DB_USER`, `DB_PASS`, `DB_NAME` trong `.env`.
- Nếu server chưa mở cổng, xem log `server_start_failed` và kiểm tra database đã được import; migration chạy trước khi server lắng nghe.
- Nếu server đã chạy, mở `/ready` để kiểm tra kết nối database.

### Không gửi được OTP hoặc email đơn hàng

- Kiểm tra `SMTP_USER`, `SMTP_PASS`, host, port và `SMTP_SECURE`.
- Với cấu hình Gmail, dùng App Password của tài khoản SMTP.
- Kiểm tra log SMTP và trạng thái queue trong `/metrics`; email được xử lý nền nên có thể chờ retry khi gửi thất bại.

### Google OAuth quay lại trang đăng nhập

- Kiểm tra đủ `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`.
- Authorized redirect URI trên Google Cloud phải khớp chính xác `GOOGLE_CALLBACK_URL`.

### Không upload được ảnh

- Kiểm tra ba biến `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Kiểm tra định dạng và giới hạn dung lượng file.

### AI báo chưa được cấu hình

Điền `OPENAI_API_KEY`; đồng thời kiểm tra `OPENAI_BASE_URL` và `OPENAI_MODEL` thuộc cùng dịch vụ. Nếu dùng OpenAI chính thức, giữ base URL `https://api.openai.com/v1`. Nếu dùng dịch vụ trung gian, dùng URL gốc và Model ID do dịch vụ cung cấp. Model phải hỗ trợ function calling. Khởi động lại server sau khi sửa `.env`.

### Port 3000 đang được dùng trên Windows

Xem tiến trình đang lắng nghe và đổi `PORT` trong `.env` nếu cần:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Khi đổi cổng, cập nhật cả `SITE_URL`, `CORS_ORIGINS` và `GOOGLE_CALLBACK_URL` nếu đang dùng Google OAuth.

## Giấy phép

Dự án khai báo giấy phép MIT trong `package.json`.
