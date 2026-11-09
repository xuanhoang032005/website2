$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDir = Join-Path $workspace 'outputs'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$docxPath = Join-Path $outputDir 'Giai_thich_thuat_toan_cong_nghe_va_han_che_AnhTraiStore.docx'
$pdfPath = Join-Path $outputDir 'Giai_thich_thuat_toan_cong_nghe_va_han_che_AnhTraiStore_QA.pdf'

$script:html = New-Object System.Text.StringBuilder

function Html([object]$value) { return [System.Net.WebUtility]::HtmlEncode([string]$value) }

function Add-Paragraph([string]$text, [string]$style = 'Normal', [int]$alignment = 3) {
    $tag = switch ($style) { 'Heading 1' { 'h1' } 'Heading 2' { 'h2' } 'Heading 3' { 'h3' } default { 'p' } }
    $class = switch ($style) { 'Title' { 'title' } 'Subtitle' { 'subtitle' } default { if ($alignment -eq 1) { 'center' } else { '' } } }
    $null = $script:html.AppendLine("<$tag class='$class'>$(Html $text)</$tag>")
}

function Add-Bullet([string]$text, [int]$level = 1) {
    $null = $script:html.AppendLine("<p class='bullet level$level'>• $(Html $text)</p>")
}

function Add-Number([string]$text) {
    $null = $script:html.AppendLine("<p class='numbered'>$(Html $text)</p>")
}

function Add-Code([string]$text) {
    $null = $script:html.AppendLine("<pre>$(Html $text)</pre>")
}

function Add-Table([string[]]$headers, [object[]]$rows, [double[]]$widths = @()) {
    $null = $script:html.AppendLine('<table><thead><tr>')
    for ($c = 0; $c -lt $headers.Count; $c++) { $null = $script:html.Append("<th>$(Html $headers[$c])</th>") }
    $null = $script:html.AppendLine('</tr></thead><tbody>')
    for ($r = 0; $r -lt $rows.Count; $r++) {
        $null = $script:html.AppendLine('<tr>')
        for ($c = 0; $c -lt $headers.Count; $c++) {
            $null = $script:html.Append("<td>$(Html $rows[$r][$c])</td>")
        }
        $null = $script:html.AppendLine('</tr>')
    }
    $null = $script:html.AppendLine('</tbody></table>')
}

function Add-Algorithm([hashtable]$a) {
    Add-Paragraph $a.Name 'Heading 2' 0
    Add-Paragraph ("Mục đích: " + $a.Goal)
    Add-Paragraph ("Tệp liên quan: " + $a.Files) 'Normal' 0
    Add-Paragraph 'Cách hoạt động:' 'Heading 3' 0
    foreach ($step in $a.Steps) { Add-Number $step }
    Add-Paragraph ("Độ phức tạp/đặc tính: " + $a.Complexity)
    Add-Paragraph ("Điểm đúng và an toàn: " + $a.Safety)
    Add-Paragraph ("Hạn chế: " + $a.Limit)
}

try {
    $null = $script:html.AppendLine(@'
<!doctype html><html><head><meta charset="utf-8"><style>
@page { size:A4; margin:2.2cm 2cm 2cm 2.5cm; }
body { font-family:Aptos,Arial,sans-serif; font-size:11pt; line-height:1.3; color:#172033; }
p { text-align:justify; margin:0 0 7pt 0; text-indent:.75cm; }
p.center,.title,.subtitle { text-align:center; text-indent:0; }
.title { font-size:24pt; font-weight:bold; margin-top:90pt; color:#0b3d66; }
.subtitle { font-size:16pt; font-weight:bold; margin:14pt 0; }
h1 { font-size:18pt; color:#0b3d66; margin:18pt 0 9pt; page-break-after:avoid; }
h2 { font-size:14pt; color:#364f6b; margin:14pt 0 7pt; page-break-after:avoid; }
h3 { font-size:12pt; color:#364f6b; margin:10pt 0 5pt; page-break-after:avoid; }
.bullet { margin-left:.7cm; text-indent:-.35cm; text-align:left; }
.numbered { margin-left:.7cm; text-indent:-.35cm; text-align:left; }
.numbered:before { content:'– '; font-weight:bold; }
pre { font-family:Consolas,monospace; font-size:9pt; background:#eef2f6; padding:9pt; white-space:pre-wrap; }
table { width:100%; border-collapse:collapse; margin:8pt 0 12pt; font-size:8.5pt; }
th,td { border:1px solid #9aa7b5; padding:5pt; vertical-align:top; }
th { background:#d9e7f3; font-weight:bold; text-align:left; }
.page-break { page-break-after:always; }
</style></head><body>
'@)

    Add-Paragraph 'GIẢI THÍCH THUẬT TOÁN, CÔNG NGHỆ VÀ HẠN CHẾ' 'Title' 1
    Add-Paragraph 'Dự án website thương mại điện tử AnhTraiStore' 'Subtitle' 1
    Add-Paragraph 'Phân tích theo mã nguồn hiện tại tại commit a9cc314' 'Normal' 1
    Add-Paragraph 'Ngày lập tài liệu: 04/10/2026' 'Normal' 1
    Add-Paragraph 'Phạm vi: backend Node.js/Express, MySQL, frontend HTML/CSS/JavaScript, Socket.IO, Cloudinary, SMTP, AI và công cụ vận hành.' 'Normal' 1
    $null = $script:html.AppendLine('<div class="page-break"></div>')

    Add-Paragraph 'MỤC LỤC' 'Heading 1' 0
    Add-Paragraph '[TOC_PLACEHOLDER]' 'Normal' 0
    $null = $script:html.AppendLine('<div class="page-break"></div>')

    Add-Paragraph '1. Mục tiêu và phạm vi tài liệu' 'Heading 1' 0
    Add-Paragraph 'Tài liệu này giải thích các công nghệ và thuật toán xử lý đang thực sự tồn tại trong dự án, sau đó phân tích hạn chế theo nguyên nhân, tác động và hướng khắc phục. “Thuật toán” trong tài liệu bao gồm cả thuật toán tính toán, quy tắc nghiệp vụ, quy trình giao dịch và cơ chế bảo mật; không phải mọi mục đều là thuật toán kinh điển theo nghĩa cấu trúc dữ liệu.'
    Add-Paragraph 'Mã nguồn hiện tại có 122 khai báo route HTTP, 19 bảng nghiệp vụ cộng bảng schema_migrations, 52 tệp JavaScript được kiểm tra cú pháp và 76 bài kiểm thử hồi quy đang đạt. Dữ liệu này được lấy trực tiếp từ repository tại thời điểm lập tài liệu.'
    Add-Paragraph 'Mốc “final 8” không tồn tại dưới dạng commit hoặc tag. Lịch sử đi từ final 7 đến commit 8605006 mang tên final 9. Vì vậy tài liệu tập trung giải thích bản hiện tại; khi nhắc bản final cũ, 8605006 được dùng làm mốc gần nhất theo yêu cầu trước đó.'

    Add-Paragraph '2. Kiến trúc tổng thể' 'Heading 1' 0
    Add-Paragraph 'Ứng dụng dùng kiến trúc web nguyên khối (monolith). Một tiến trình Node.js phục vụ trang HTML tĩnh, REST API và Socket.IO. Express nhận request, middleware xử lý bảo mật/session/parse dữ liệu, router thực hiện nghiệp vụ, mysql2 truy cập MySQL, rồi phản hồi JSON hoặc file HTML. Một số luồng đơn hàng và dashboard đã bắt đầu tách theo controller → service → repository, nhưng phần lớn logic vẫn nằm trong route.'
    Add-Code 'Trình duyệt → Express middleware → Router/Controller → Service → Repository/mysql2 → MySQL
                    ↘ Socket.IO ↔ chat realtime
                    ↘ Job queue in-memory → SMTP / Cloudinary / AI
                    ↘ OpenAI-compatible Chat Completions API'
    Add-Paragraph 'Luồng khởi động' 'Heading 2' 0
    Add-Bullet 'server.js nạp biến môi trường, tạo Express app và HTTP server.'
    Add-Bullet 'Socket.IO được gắn vào HTTP server và dùng chung session middleware.'
    Add-Bullet 'Khi listen thành công, hệ thống sửa dữ liệu nghiệp vụ lệch và kiểm tra SMTP.'
    Add-Bullet 'SIGINT/SIGTERM đóng Socket.IO, HTTP server và MySQL pool theo thứ tự.'
    Add-Paragraph 'Luồng xử lý request' 'Heading 2' 0
    Add-Bullet 'Gắn request ID và bắt đầu đo thời gian.'
    Add-Bullet 'Thiết lập security headers; nạp session và Passport.'
    Add-Bullet 'Kiểm tra CORS, parse JSON/form, kiểm tra CSRF.'
    Add-Bullet 'Áp dụng rate limit cho /api, định tuyến nghiệp vụ, sau cùng là 404 và error handler.'

    Add-Paragraph '3. Các công nghệ sử dụng' 'Heading 1' 0
    $techRows = @(
        @('Node.js ≥ 20', 'Runtime JavaScript phía máy chủ; có fetch, AbortController, crypto và node:test.', 'Một event loop; tác vụ CPU nặng sẽ chặn toàn bộ tiến trình.'),
        @('Express 4', 'Routing, middleware, static files, parse JSON/form và API.', 'Route lớn; Express 4 không tự chuyển mọi lỗi async vào error middleware.'),
        @('MySQL/MariaDB', 'Lưu dữ liệu giao dịch, quan hệ và ràng buộc.', 'Cần server DB riêng, backup, migration và giám sát.'),
        @('mysql2/promise', 'Connection pool 10 kết nối, prepared parameters, transaction async/await.', 'Pool cố định; chưa có timeout/query tracing chi tiết.'),
        @('express-session', 'Cookie ats.sid và session đăng nhập 24 giờ.', 'MemoryStore mặc định mất dữ liệu khi restart và không chia sẻ nhiều instance.'),
        @('Passport + Google OAuth 2.0', 'Đăng nhập Google và liên kết tài khoản theo google_id/email.', 'Phụ thuộc cấu hình callback và dịch vụ Google.'),
        @('bcryptjs', 'Băm và so khớp mật khẩu với cost 10.', 'JS thuần chậm hơn bcrypt native; chính sách mật khẩu mới chỉ dựa độ dài.'),
        @('Socket.IO', 'Chat realtime, room theo user/conversation và tín hiệu typing.', 'Cần adapter Redis khi scale ngang; hiện theo dõi socket trong RAM.'),
        @('Multer', 'Nhận multipart upload, giới hạn kích thước, lọc MIME/đuôi file.', 'Không quét malware hay giải mã ảnh để xác minh nội dung thực.'),
        @('Cloudinary', 'Lưu ảnh sản phẩm, banner, avatar, danh mục; xóa theo public ID.', 'Phụ thuộc bên thứ ba; cleanup queue hiện không bền vững.'),
        @('Nodemailer/SMTP', 'Email OTP, xác nhận đơn, thông báo quản trị, liên hệ.', 'Khả năng gửi phụ thuộc SMTP; chưa có DLQ hoặc theo dõi delivery.'),
        @('OpenAI-compatible API', 'Chat Completions, tool/function calling và so sánh sản phẩm.', 'Chi phí/độ trễ/phụ thuộc model; dữ liệu đưa sang nhà cung cấp ngoài.'),
        @('Chart.js', 'Biểu đồ doanh thu và dashboard quản trị.', 'Dữ liệu tổng hợp do backend cung cấp; bundle vendor cần cập nhật.'),
        @('HTML5/CSS3/JavaScript thuần', 'Giao diện storefront/admin không cần framework.', 'Nhiều script inline, trùng lặp DOM/fetch và khó kiểm thử component.'),
        @('Fetch API', 'Gọi REST API, credentials include, JSON và upload FormData.', 'Cần chuẩn hóa retry, timeout và xử lý lỗi; module dùng chung mới áp dụng một phần.'),
        @('LocalStorage', 'Lưu danh sách so sánh sản phẩm trên trình duyệt.', 'Theo từng trình duyệt, không đồng bộ tài khoản và người dùng có thể sửa.'),
        @('dotenv', 'Nạp cấu hình DB, SMTP, OAuth, Cloudinary, AI.', 'Không phải secret manager; .env có nguy cơ rò rỉ nếu sao chép/commit.'),
        @('GitHub Actions', 'CI chạy npm ci, lint, format và test trên Node 20.', 'Lint/format hiện chỉ là kiểm tra cú pháp/đọc file.'),
        @('Node test runner/assert', '76 kiểm thử hồi quy, nhiều dependency được mock.', 'Chưa thay thế browser E2E và integration MySQL thật.'),
        @('Word/SQL migration checksum', 'Khối nâng cấp schema duy nhất, khóa GET_LOCK và SHA-256.', 'DDL MySQL có implicit commit nên rollback không bao phủ tuyệt đối.')
    )
    Add-Table @('Công nghệ', 'Vai trò trong dự án', 'Giới hạn chính') $techRows @(90, 245, 185)

    Add-Paragraph '4. Mô hình dữ liệu' 'Heading 1' 0
    $dbRows = @(
        @('users', 'Tài khoản, vai trò, hồ sơ, Google ID và avatar.'), @('reset_tokens', 'Thiết kế token reset cũ; luồng hiện tại chủ yếu dùng OTP trong RAM.'),
        @('categories / brands', 'Phân loại sản phẩm; trạng thái active được giữ nội bộ.'), @('products', 'Thông tin cơ sở, giá/tồn kho tổng hợp, cấu hình kỹ thuật.'),
        @('product_images', 'Gallery, thứ tự, ảnh chính và alt text.'), @('product_variants', 'SKU, RAM, ROM, màu, giá và tồn kho từng phiên bản.'),
        @('cart', 'Giỏ hàng theo user + product + variant; generated column hỗ trợ unique với NULL.'), @('orders', 'Snapshot giao hàng, thanh toán, coupon, phí và trạng thái.'),
        @('order_items', 'Dòng hàng, giá tại thời điểm mua và variant_id.'), @('reviews', 'Một đánh giá/user/sản phẩm; phản hồi quản trị nằm tách trong nội dung chuẩn hóa.'),
        @('wishlists', 'Sản phẩm yêu thích theo tài khoản.'), @('coupons', 'Loại giảm %, cố định, min/max, thời gian và usage limit.'),
        @('user_coupons', 'Ghi nhận người dùng đã dùng mã cho đơn nào.'), @('contacts', 'Form liên hệ gắn tùy chọn với user.'),
        @('conversations / messages', 'Hội thoại hỗ trợ và tin nhắn hai phía.'), @('promotions', 'Thông tin chương trình khuyến mãi.'),
        @('banners', 'Banner theo vị trí/thứ tự, link nội bộ và trạng thái.'), @('schema_migrations', 'Tên, checksum và thời điểm áp dụng nâng cấp schema.')
    )
    Add-Table @('Bảng/nhóm bảng', 'Ý nghĩa') $dbRows @(160, 360)

    Add-Paragraph '5. Giải thích các thuật toán và quy trình xử lý' 'Heading 1' 0
    $algorithms = @(
        @{Name='5.1 Đăng ký tài khoản'; Files='src/routes/auth.js, src/middleware/validate.js'; Goal='Tạo tài khoản local an toàn và chuẩn hóa dữ liệu đầu vào.'; Steps=@('Middleware kiểm tra tên, email, điện thoại, mật khẩu, ngày sinh và giới tính.','Email được trim và chuyển chữ thường; truy vấn kiểm tra trùng.','bcrypt.hash(password, 10) tạo password hash có salt.','INSERT user bằng parameterized query; session lưu user_id và role.'); Complexity='Một số thao tác chuỗi O(n); hai truy vấn DB điển hình O(log N) nếu email có index/unique.'; Safety='Không lưu mật khẩu rõ; SQL dùng placeholder; validation giới hạn độ dài.'; Limit='Mật khẩu tối thiểu 6 ký tự, chưa có kiểm tra breached password, xác minh email hay transaction cho toàn bộ luồng.'},
        @{Name='5.2 Đăng nhập local và session'; Files='src/routes/auth.js, src/config/runtime.js'; Goal='Xác minh thông tin và tạo phiên đăng nhập cookie.'; Steps=@('Chuẩn hóa email và áp dụng login rate limit.','SELECT user theo email.','bcrypt.compare so mật khẩu với hash.','Ghi user_id, role và mốc bắt đầu chat vào session; cookie HttpOnly, SameSite=Lax, Secure ở production.'); Complexity='bcrypt cố ý tốn CPU; truy vấn user O(log N) khi email được đánh index.'; Safety='Không trả hash; cookie HttpOnly; yêu cầu secret dài ở production.'; Limit='Session nằm MemoryStore; chưa rotate session ID rõ ràng sau login, chưa có MFA hay khóa tài khoản bền vững.'},
        @{Name='5.3 Google OAuth và liên kết tài khoản'; Files='src/config/passport.js, src/routes/pages.js'; Goal='Cho phép đăng nhập bằng Google mà không tạo tài khoản trùng.'; Steps=@('Google trả profile qua callback.','Chuẩn hóa email và làm sạch displayName.','Tìm user theo google_id hoặc email.','Nếu email đã có thì gắn google_id; nếu chưa có thì tạo user với mật khẩu ngẫu nhiên đã băm.','Passport serialize chỉ ID, deserialize đọc user mới từ DB.'); Complexity='Một SELECT và tối đa một INSERT/UPDATE.'; Safety='Không tin displayName thô; không lưu access token trong DB.'; Limit='Liên kết tự động theo email giả định email Google đáng tin; welcome email nằm queue RAM.'},
        @{Name='5.4 OTP đặt lại mật khẩu'; Files='src/routes/auth.js'; Goal='Xác minh quyền kiểm soát email trước khi đổi mật khẩu.'; Steps=@('crypto.randomInt tạo OTP 6 chữ số, hạn 5 phút.','Map otpStore lưu OTP, expiry, attempts và user_id theo email.','API luôn trả thông báo chung để chống dò email tồn tại.','Khi reset: kiểm tra tồn tại, hết hạn, tối đa 5 lần sai; băm mật khẩu mới rồi xóa OTP.'); Complexity='Tra cứu Map O(1), cập nhật DB O(log N).'; Safety='OTP dùng CSPRNG; chống enumeration; giới hạn số lần và rate limit.'; Limit='OTP lưu rõ trong RAM, mất khi restart, không dùng được đa instance; verify-otp không phát token một lần nên vẫn phải gửi OTP lần nữa khi reset.'},
        @{Name='5.5 RBAC quản trị'; Files='src/middleware/auth.js'; Goal='Ngăn khách gọi API/trang quản trị.'; Steps=@('isAdmin yêu cầu session.user_id và role=admin.','Request JSON/mutation trái phép nhận 401; request trang được chuyển tới login.','requireAdminApi dùng HttpError để chuẩn hóa mã lỗi.'); Complexity='O(1).'; Safety='Kiểm tra phía server, không dựa vào nút ẩn trên giao diện.'; Limit='Role lấy từ session có thể cũ nếu quyền thay đổi giữa phiên; chưa có permission chi tiết hơn admin/customer.'},
        @{Name='5.6 Validation dùng chung'; Files='src/middleware/validate.js'; Goal='Chuẩn hóa string/email/integer/enum và trả lỗi theo từng trường.'; Steps=@('Mỗi field có parser cấu hình required/min/max/pattern.','validateBody sao chép body, chạy parser cho từng trường.','Các lỗi được gom vào details.fields.','Nếu hợp lệ, req.body được thay bằng dữ liệu chuẩn hóa.'); Complexity='O(F + tổng độ dài chuỗi), F là số trường.'; Safety='Giới hạn độ dài và kiểu trước nghiệp vụ.'; Limit='Schema tự viết chưa bao phủ object lồng nhau, unknown field vẫn được giữ; validation vẫn bị lặp ở route cũ.'},
        @{Name='5.7 CSRF theo token và nguồn gửi'; Files='src/middleware/csrf.js, public/js/modules/http.js'; Goal='Chặn trình duyệt từ website lạ thực hiện request thay đổi bằng cookie phiên.'; Steps=@('Tạo token 32 byte hex trong cookie csrf_token.','GET/HEAD/OPTIONS được bỏ qua.','Nếu client gửi x-csrf-token/_csrf thì phải trùng cookie.','Nếu có Origin hoặc Referer thì phải thuộc allowlist/own origin; Sec-Fetch-Site=cross-site bị chặn.'); Complexity='O(K), K là số origin được phép.'; Safety='Có SameSite cookie, origin check và token mismatch check.'; Limit='Token không bắt buộc khi request không gửi token; client không có Origin/Referer vẫn được qua. Đây là origin-based protection có token hỗ trợ, chưa phải strict double-submit CSRF.'},
        @{Name='5.8 CORS và security headers'; Files='src/config/runtime.js, src/middleware/security.js'; Goal='Giới hạn nguồn frontend và giảm XSS/clickjacking/MIME sniffing.'; Steps=@('Production chỉ chấp nhận origin có trong CORS_ORIGINS/SITE_URL.','CSP giới hạn default/base/object/frame/form/connect/img.','Gắn nosniff, DENY, referrer policy, permissions policy và HSTS ở production.','API/admin nhận Cache-Control: no-store.'); Complexity='So origin tuyến tính O(K).'; Safety='Nhiều lớp phòng vệ trình duyệt.'; Limit='script-src và style-src còn unsafe-inline; CORS không phải cơ chế xác thực; cấu hình proxy/origin sai có thể khóa client hợp lệ.'},
        @{Name='5.9 Rate limiting fixed window'; Files='src/middleware/rate-limit.js'; Goal='Giảm brute-force và request quá mức theo IP.'; Steps=@('Map lưu count và resetAt theo IP.','Bản ghi hết hạn được tạo lại; count tăng mỗi request.','Trả header limit/remaining/reset; quá ngưỡng trả 429.','Dọn record cũ khi khoảng thời gian cleanup đã qua.'); Complexity='Tra cứu O(1); lần cleanup O(C) với C là số IP đang lưu.'; Safety='Login và password reset có ngưỡng riêng thấp hơn.'; Limit='Fixed window có burst ở ranh giới; IP sau proxy phụ thuộc trust proxy; Map RAM không chia sẻ instance và có thể tăng bộ nhớ.'},
        @{Name='5.10 Lọc, sắp xếp và phân trang sản phẩm'; Files='src/routes/products.js'; Goal='Trả danh sách đúng theo nhiều brand/RAM/ROM/giá/search/sort.'; Steps=@('Chuẩn hóa query thành mảng giá trị duy nhất.','Xây WHERE động nhưng giá trị luôn dùng placeholder.','Variant được xét qua EXISTS/subquery khi lọc cấu hình.','Sort chỉ lấy từ allowlist cột SQL.','LIMIT/OFFSET được giới hạn và trả metadata phân trang.'); Complexity='Phụ thuộc index; OFFSET lớn có xu hướng O(offset + limit).'; Safety='Không chèn trực tiếp sort tùy ý; giới hạn page/limit.'; Limit='LIKE %term% không dùng B-tree hiệu quả; OFFSET chậm với dữ liệu lớn; chưa có full-text/search engine.'},
        @{Name='5.11 Tìm kiếm gợi ý và debounce'; Files='public/js/app.js, src/routes/api.js'; Goal='Không gọi API ở mỗi phím bấm và hiển thị gợi ý nhanh.'; Steps=@('Sự kiện input hủy timer trước.','Đợi khoảng debounce rồi mới fetch query đã encode.','Backend giới hạn chuỗi và số kết quả.','Kết quả được escape trước khi chèn DOM.'); Complexity='Client O(1) timer; DB tìm LIKE theo dữ liệu.'; Safety='encodeURIComponent và escape HTML giảm injection DOM.'; Limit='Không dùng AbortController nên response cũ có thể về sau response mới; chưa có cache.'},
        @{Name='5.12 Sinh slug duy nhất'; Files='src/routes/admin.js'; Goal='Tạo URL thân thiện không trùng cho sản phẩm.'; Steps=@('Chuẩn hóa Unicode, bỏ dấu/ký tự đặc biệt, đổi khoảng trắng thành dấu gạch.','Kiểm tra slug cơ sở trong DB.','Nếu trùng, thêm hậu tố số và lặp tới khi trống.'); Complexity='O(k) truy vấn với k là số slug trùng.'; Safety='Unique constraint DB là lớp quyết định cuối.'; Limit='Có race giữa kiểm tra và insert; vòng lặp nhiều truy vấn khi tên phổ biến.'},
        @{Name='5.13 Xử lý biến thể sản phẩm'; Files='src/core/product-variants.js, src/routes/admin.js'; Goal='Quản lý SKU/RAM/ROM/màu/giá/tồn kho theo phiên bản.'; Steps=@('Parse JSON tối đa 50 biến thể và chuẩn hóa text/số.','Mỗi biến thể phải có ít nhất RAM/ROM/màu; giá và stock phải hợp lệ.','Set phát hiện trùng tổ hợp và SKU không phân biệt hoa thường.','Bảo đảm đúng một mặc định; nếu thiếu thì chọn phần tử đầu.','Trong transaction: khóa danh sách cũ FOR UPDATE, update/insert, biến thể bị bỏ được soft-disable.','Tổng stock sản phẩm = tổng stock biến thể active.'); Complexity='Validation O(V); lưu O(V) query, V ≤ 50.'; Safety='Kiểm tra ownership variant; transaction và unique SKU.'; Limit='Nhiều query tuần tự; aggregate stock là dữ liệu dẫn xuất dễ lệch nên cần repair; không có lịch sử giá/tồn kho.'},
        @{Name='5.14 Upload và quản lý ảnh'; Files='src/core/image-upload.js, src/services/cloud-storage.js, src/routes/admin.js'; Goal='Chỉ nhận ảnh hợp lệ, upload Cloudinary và dọn ảnh không dùng.'; Steps=@('Multer giới hạn số lượng/dung lượng.','isAllowedImage yêu cầu MIME và extension khớp allowlist.','CloudinaryStorage upload theo folder cấu hình.','Tách public ID từ URL để destroy; nhiều ảnh dùng Promise.allSettled.','Nếu transaction thất bại, ảnh vừa upload được rollback/dọn nền.'); Complexity='Upload O(tổng byte); cleanup O(I) request mạng.'; Safety='Không chỉ tin MIME; đường dẫn Cloudinary được parse.'; Limit='Chưa kiểm magic bytes/giải mã ảnh/quét malware; cleanup queue RAM có thể mất; phụ thuộc Cloudinary.'},
        @{Name='5.15 Giỏ hàng theo biến thể'; Files='src/routes/cart.js'; Goal='Lưu đúng sản phẩm và phiên bản, không vượt tồn kho.'; Steps=@('Kiểm tra đăng nhập, product_id, quantity và variant_id.','Nếu sản phẩm có variant, chọn variant yêu cầu hoặc mặc định active.','Tìm dòng cart bằng phép so sánh NULL-safe variant_id <=> ?.','Nếu đã có thì cộng số lượng; nếu chưa có thì INSERT.','Mọi update kiểm tra số lượng không vượt stock tương ứng.'); Complexity='O(log C) nhờ index/unique; truy vấn constant count.'; Safety='Giá không lấy từ client; kiểm tra stock server-side.'; Limit='Kiểm tra lúc thêm không giữ hàng; stock có thể đổi trước checkout, nên checkout phải kiểm tra lại.'},
        @{Name='5.16 Wishlist và so sánh'; Files='src/routes/wishlist.js, public/js/app.js, views/compare.html'; Goal='Lưu yêu thích theo tài khoản và so sánh nhanh phía client.'; Steps=@('Wishlist API xác thực user, kiểm tra product và insert/delete/toggle.','Compare list lưu ID duy nhất trong localStorage, giới hạn số sản phẩm.','Trang compare gửi ID lên API để lấy dữ liệu chuẩn từ DB.','AI compare chỉ nhận tối đa 4 ID và chỉ dùng bản ghi DB.'); Complexity='Wishlist O(log N); compare O(P), P nhỏ.'; Safety='Không tin thông số trong localStorage; server tải lại sản phẩm.'; Limit='Compare không đồng bộ thiết bị/tài khoản; localStorage có thể bị xóa hoặc sửa.'},
        @{Name='5.17 Xác thực và tính coupon'; Files='src/routes/coupons.js, src/routes/orders.js, src/core/coupon-validation.js'; Goal='Áp dụng mã đúng thời gian, giới hạn và đối tượng.'; Steps=@('Chuẩn hóa code uppercase; kiểm tra active/start/expiry/usage limit/min order.','Kiểm tra user chưa dùng qua user_coupons.','WELCOME10/NEWUSER yêu cầu chưa có đơn hợp lệ; VIP20 yêu cầu tổng delivered ≥ 30 triệu; PHONE15 yêu cầu toàn bộ item thuộc điện thoại.','Phần trăm: round(subtotal × value/100); cố định: value; sau đó áp max_discount và chặn trong [0, subtotal].','Trong transaction, UPDATE used_count có điều kiện rồi INSERT user_coupons.'); Complexity='Một nhóm truy vấn index; tính tiền O(1), kiểm tra item O(I).'; Safety='Atomic conditional update ngăn vượt usage limit; DB unique ngăn dùng lặp.'; Limit='Rule gắn cứng theo chuỗi code và category_id=1, khó cấu hình; phụ thuộc dữ liệu danh mục mẫu.'},
        @{Name='5.18 Tạo đơn hàng bằng transaction'; Files='src/routes/orders.js'; Goal='Tạo order, order_items, coupon và tồn kho theo nguyên tắc tất cả hoặc không.'; Steps=@('Lấy item thuộc user/buy-now từ DB; kiểm quantity, variant active và stock.','Tính subtotal từ giá DB, coupon, shipping fee và total.','Bắt đầu transaction; INSERT orders và từng order_item.','Giảm tồn kho bằng UPDATE có điều kiện stock >= quantity.','Đánh dấu coupon, xóa item cart đã mua, commit.','Sau commit mới enqueue email khách/admin; lỗi trước commit thì rollback.'); Complexity='O(I) query theo số item.'; Safety='Không tin giá client; ownership theo user; transaction bảo toàn dữ liệu.'; Limit='Insert item và giảm stock tuần tự; I lớn tăng thời gian giữ transaction. Email queue RAM có thể mất sau khi commit.'},
        @{Name='5.19 Chống overselling bằng cập nhật có điều kiện'; Files='src/routes/orders.js'; Goal='Ngăn hai checkout đồng thời làm tồn kho âm.'; Steps=@('Không chỉ SELECT stock trước.','UPDATE stock = stock - q WHERE stock >= q và đúng product/variant active.','Kiểm affectedRows phải bằng 1; nếu 0 thì ném lỗi.','Transaction rollback toàn đơn khi bất kỳ item nào thiếu.'); Complexity='O(I), mỗi update khóa row liên quan.'; Safety='Điều kiện nằm trong cùng câu UPDATE nên loại race check-then-update.'; Limit='Thứ tự khóa nhiều sản phẩm có thể gây deadlock; chưa có retry deadlock hoặc reservation/hold stock.'},
        @{Name='5.20 Hủy đơn và hoàn tồn/coupon'; Files='src/routes/orders.js, src/routes/admin.js'; Goal='Đảo ngược tài nguyên khi đơn hợp lệ bị hủy.'; Steps=@('Khóa/đọc order và xác minh chủ sở hữu hoặc admin.','Chỉ cho phép chuyển trạng thái hợp lệ.','Đọc order_items; cộng lại stock variant hoặc product.','Đồng bộ aggregate stock; xóa user_coupon theo order và giảm used_count bằng GREATEST.','Commit thay đổi trạng thái và tài nguyên.'); Complexity='O(I).'; Safety='Transaction giữ trạng thái, tồn kho và coupon đồng bộ.'; Limit='State machine phân tán trong nhiều route; cần bảng transition tập trung và audit log.'},
        @{Name='5.21 Ước lượng vận chuyển'; Files='src/routes/orders.js, public/js/checkout.js'; Goal='Tính phí và khoảng ngày giao dựa trên phương thức/khu vực.'; Steps=@('Bỏ dấu và lowercase địa chỉ.','Nhận diện nội thành TP.HCM, TP.HCM, tỉnh gần hoặc khu vực khác bằng từ khóa.','Chọn min/max ngày; express rút ngắn khoảng.','Cộng ngày lịch vào thời điểm hiện tại; standard 30.000đ, express 50.000đ.'); Complexity='O(L × K) theo độ dài địa chỉ và số từ khóa nhỏ.'; Safety='Backend tính lại, không tin phí từ client.'; Limit='So khớp chuỗi dễ sai địa danh, không bỏ cuối tuần/ngày lễ, không tích hợp hãng vận chuyển; phí không theo cân nặng/quãng đường.'},
        @{Name='5.22 Thanh toán mô phỏng'; Files='src/routes/orders.js, public/js/checkout.js'; Goal='Minh họa COD/VNPay/MoMo mà không giao dịch thật.'; Steps=@('COD tạo đơn pending trực tiếp.','VNPay/MoMo dùng initiate để tạo order pending và trả dữ liệu mô phỏng.','Client hiển thị QR/xác nhận demo.','complete cập nhật trạng thái theo luồng mô phỏng.'); Complexity='O(I) như tạo đơn.'; Safety='README nói rõ không phải cổng thật.'; Limit='Không có chữ ký webhook, idempotency key, reconciliation hay xác minh số tiền; tuyệt đối không dùng làm thanh toán production.'},
        @{Name='5.23 Đánh giá và phản hồi quản trị'; Files='src/routes/api.js, src/core/review-comment.js, src/routes/admin.js'; Goal='Mỗi user đánh giá một lần và lưu phản hồi admin tách biệt.'; Steps=@('Yêu cầu login, rating hợp lệ và product tồn tại.','Kiểm tra unique user/product.','Chuẩn hóa comment để phần khách và phản hồi admin không trộn nhau.','Admin đọc identity người đánh giá và cập nhật reply.'); Complexity='O(log R) với unique index.'; Safety='Validation và escape khi render.'; Limit='Chưa xác minh “đã mua hàng”; phản hồi admin ghép theo format thay vì cột riêng nên khó truy vấn.'},
        @{Name='5.24 Liên hệ và email'; Files='src/routes/api.js, src/config/mail.js'; Goal='Lưu liên hệ và chuyển tiếp tới hộp thư quản trị.'; Steps=@('Validate tên/email/phone/subject/message.','INSERT contacts gắn user_id nếu đăng nhập.','Escape nội dung khi tạo HTML email.','Enqueue contact_email với replyTo là email khách.'); Complexity='O(n) theo độ dài nội dung.'; Safety='Dữ liệu email được escape; job tách khỏi response.'; Limit='Không CAPTCHA/chống spam riêng; nếu worker RAM mất job thì DB vẫn có contact nhưng email không gửi.'},
        @{Name='5.25 Chat hỗ trợ qua HTTP'; Files='src/routes/messages.js'; Goal='Duy trì một hội thoại theo tài khoản/session và lưu tin nhắn.'; Steps=@('Tìm hoặc tạo conversation cho user.','Kiểm tra ownership khi đọc/gửi.','INSERT message và cập nhật last_message_at/status.','Emit Socket.IO vào room conversation/admin/user.'); Complexity='O(log M) với index conversation/time.'; Safety='Mọi truy cập khách lọc theo user_id; admin qua role.'; Limit='Route dài và logic lặp; chưa có phân trang cursor mạnh, attachment, moderation hoặc retention policy.'},
        @{Name='5.26 Socket.IO room authorization'; Files='src/realtime/chat-socket.js'; Goal='Chỉ cho socket hợp lệ vào room hội thoại.'; Steps=@('Socket.IO engine dùng chung Express session.','Map socket.id → user_id/role.','Admin join admin_chat; khách join user_ID.','join_conversation truy vấn DB để xác minh admin hoặc owner trước khi join conv_ID.','typing chỉ broadcast khi socket thật sự ở room; disconnect xóa Map.'); Complexity='Join cần một query; typing O(1) sau khi join.'; Safety='Không tin conversation ID do client gửi.'; Limit='Map và Socket.IO adapter RAM; nhiều process sẽ không thấy room nhau nếu không dùng Redis adapter.'},
        @{Name='5.27 Tìm kiếm/đề xuất cho AI'; Files='src/services/store-ai.js'; Goal='Cho model truy cập dữ liệu có giới hạn thay vì gửi toàn bộ catalog.'; Steps=@('Tool search_products xây WHERE từ query/brand/price/RAM/storage/stock.','recommend_products tách tối đa 5 từ khóa có nghĩa, lọc budget/brand.','ORDER BY từ allowlist; kết quả giới hạn tối đa 6.','Chuẩn hóa mỗi sản phẩm thành DTO an toàn.'); Complexity='DB LIKE phụ thuộc số sản phẩm; dữ liệu đưa model bị chặn ở lượng nhỏ.'; Safety='Parameterized SQL, giới hạn input/output, không đưa toàn catalog vào prompt.'; Limit='Đề xuất dựa heuristic từ khóa, chưa có ranking học máy/vector; LIKE có thể chậm và chất lượng tiếng Việt hạn chế.'},
        @{Name='5.28 Vòng lặp AI function calling'; Files='src/services/store-ai.js, src/services/ai/openai-client.js'; Goal='Buộc AI gọi công cụ DB để trả lời dựa dữ liệu cửa hàng.'; Steps=@('Tạo system instruction, giữ tối đa 8 message lịch sử, mỗi message tối đa 800 ký tự.','Gửi tools theo JSON schema và tool_choice=auto.','Kiểm tra tool call hợp lệ; parse arguments JSON, thực thi tool server-side.','Đưa kết quả tool trở lại messages và lặp tối đa 3 vòng.','Vòng cuối tắt tool; thu reply và tối đa 6 thẻ sản phẩm.'); Complexity='Tối đa 3 lần gọi AI cộng query của tool; độ trễ chủ yếu là mạng/model.'; Safety='User ID lấy từ session, không lấy từ model; tool allowlist; timeout/redirect error; ẩn lỗi upstream.'; Limit='Prompt injection vẫn có thể ảnh hưởng lời văn; queue/job ownership chưa gắn user; history session RAM; model mặc định phải thực sự tồn tại ở provider.'},
        @{Name='5.29 AI so sánh sản phẩm'; Files='src/services/store-ai.js, views/compare.html'; Goal='Đưa kết luận ngắn dựa trên thông số authoritative.'; Steps=@('Chuẩn hóa tối đa 4 ID duy nhất, yêu cầu ít nhất 2.','SELECT thông số từ DB theo ID và giữ thứ tự yêu cầu.','Gửi JSON sản phẩm cùng prompt bắt buộc chọn một sản phẩm.','Làm sạch Markdown/khoảng trắng trong kết luận.'); Complexity='Một query + một lần gọi AI.'; Safety='Không dùng thông số do browser tự khai; giới hạn dữ liệu/prompt.'; Limit='Kết luận không deterministic và thiếu tiêu chí cá nhân hóa; không cache; phụ thuộc chi phí API.'},
        @{Name='5.30 Job queue in-memory với retry'; Files='src/services/job-queue.js, src/services/background-jobs.js'; Goal='Đưa email, AI và cleanup ra khỏi thời gian phản hồi HTTP.'; Steps=@('register ánh xạ type → handler.','enqueue tạo UUID, record queued và đẩy pending.','drain chạy tối đa JOB_CONCURRENCY job.','Lỗi được retry tối đa mặc định 3 lần với exponential backoff 500ms × 2^(attempt-1), trần 30s.','Thành công/lỗi cập nhật record và metrics snapshot.'); Complexity='Queue array shift có thể O(Q); thao tác Map O(1).'; Safety='Handler allowlist và giới hạn concurrency.'; Limit='Không persistent, không multi-process, không DLQ, không timeout/job cleanup; restart mất tất cả job và Map tăng mãi.'},
        @{Name='5.31 Migration có checksum và khóa'; Files='src/config/migrate.js, database/anhtraistore.sql'; Goal='Nâng DB cũ đúng một lần mà không import lại dữ liệu mẫu.'; Steps=@('Đọc block giữa marker EXISTING DATABASE UPGRADE.','Chuẩn hóa CRLF→LF và tính SHA-256.','Từ chối block có TRUNCATE/DROP/DELETE/INSERT.','Lấy MySQL GET_LOCK; tạo schema_migrations.','Nếu name đã có, checksum phải khớp; nếu chưa thì chạy block và ghi lịch sử.','Release lock và đóng connection.'); Complexity='O(S) theo kích thước SQL; thời gian DB tùy DDL.'; Safety='Lock ngăn hai tiến trình migrate đồng thời; checksum phát hiện sửa migration đã áp dụng.'; Limit='Một migration gộp khó tiến hóa lâu dài; MySQL DDL implicit commit nên rollback transaction không hoàn toàn; blacklist SQL không phải parser SQL.'},
        @{Name='5.32 Sửa dữ liệu khi startup'; Files='src/services/data-consistency.js, server.js'; Goal='Khôi phục một số invariant nghiệp vụ sau nâng cấp.'; Steps=@('Backfill subject rỗng của contacts.','Tính tổng stock variant active theo product.','UPDATE products.stock nếu khác tổng.','Log số dòng đã sửa; lỗi không chặn server start.'); Complexity='Quét contacts/products/variants theo query cập nhật.'; Safety='Idempotent: chạy lại không đổi dữ liệu đã đúng.'; Limit='Chạy mỗi startup có thể tốn thời gian/lock bảng khi dữ liệu lớn; chỉ sửa hai invariant, không thay migration/data job chuẩn.'},
        @{Name='5.33 Metrics, request ID và cảnh báo'; Files='src/middleware/observability.js, src/config/metrics.js, src/config/logger.js'; Goal='Theo dõi request, lỗi và thời gian xử lý.'; Steps=@('Nhận x-request-id hoặc tạo UUID.','Đo thời gian bằng process.hrtime.bigint.','Khi response finish, tăng tổng request/error, cộng duration và counter method-path-status.','Log JSON; lỗi 5xx gửi webhook nếu cấu hình.','/metrics trả snapshot và trạng thái queue, tùy chọn bearer token.'); Complexity='O(1) mỗi request; số key route có thể tăng theo path.'; Safety='Lỗi 5xx không gửi message nội bộ cho client.'; Limit='Metrics RAM mất khi restart, path động có thể gây high cardinality, webhook không retry/persist, log chưa phủ mọi console.error.'},
        @{Name='5.34 Dashboard quản trị'; Files='src/repositories/admin-repository.js, src/routes/admin.js, views/admin/index.html'; Goal='Tổng hợp sản phẩm, đơn, khách, doanh thu, tồn thấp và biểu đồ.'; Steps=@('Promise.all chạy các COUNT/SUM độc lập song song.','Doanh thu chỉ tính delivered; so tháng hiện tại/tháng trước.','Chart data group theo thời gian và client render Chart.js.','Frontend refresh định kỳ stats/notification.'); Complexity='Nhiều aggregate query; phụ thuộc index status/created_at.'; Safety='Route yêu cầu admin.'; Limit='Không cache/materialized view; polling gây tải; truy vấn song song chiếm nhiều pool connection; khái niệm doanh thu chưa trừ hoàn tiền/chi phí.'},
        @{Name='5.35 Checkout phía trình duyệt'; Files='public/js/checkout.js, views/checkout.html'; Goal='Điều khiển quy trình nhiều bước và giữ tổng tiền đồng nhất với backend.'; Steps=@('State lưu items, phương thức giao, coupon và bước hiện tại.','Render tuần tự thông tin giao hàng → thanh toán → xác nhận/QR.','Coupon được kiểm tra qua API theo subtotal sản phẩm.','Summary tính tạm để hiển thị; khi submit backend tính lại toàn bộ.','Online payment poll/check theo luồng mô phỏng.'); Complexity='O(I) mỗi lần render tổng.'; Safety='Backend là nguồn sự thật về giá/phí/coupon/stock.'; Limit='State chỉ trong trang; reload có thể mất tiến trình; file vẫn lớn và chưa có test browser thực.'},
        @{Name='5.36 Escape HTML và phòng XSS'; Files='public/js/app.js, src/config/mail.js, nhiều view'; Goal='Không biến dữ liệu API/người dùng thành HTML thực thi.'; Steps=@('escapeHtml thay &, <, >, dấu nháy bằng entity.','Dùng textContent ở nơi có thể.','Email HTML escape dữ liệu khách/đơn.','CSP tạo lớp phòng vệ bổ sung.'); Complexity='O(n) theo chuỗi.'; Safety='Giảm stored/reflected DOM XSS ở các luồng đã áp dụng.'; Limit='Nhiều view dùng innerHTML/script inline; chỉ cần một chỗ quên escape là có lỗ hổng. Nên dùng DOM API/template auto-escape và CSP nonce.'},
        @{Name='5.37 Health, readiness và graceful shutdown'; Files='src/routes/health.js, server.js'; Goal='Phân biệt tiến trình sống với DB sẵn sàng và đóng tài nguyên sạch.'; Steps=@('/health trả liveness không phụ thuộc DB.','/ready chạy SELECT đơn giản để xác nhận DB.','SIGINT/SIGTERM đóng Socket.IO, dừng nhận HTTP, chờ callback rồi pool.end.'); Complexity='health O(1); ready một query.'; Safety='Hỗ trợ orchestrator biết lúc nào route traffic.'; Limit='Không có timeout shutdown cưỡng bức; không đợi/flush job queue; readiness chưa kiểm SMTP/Cloudinary/AI.'}
    )
    foreach ($algorithm in $algorithms) { Add-Algorithm $algorithm }

    Add-Paragraph '6. Phân tích rõ các điểm hạn chế' 'Heading 1' 0
    Add-Paragraph 'Mức ưu tiên được hiểu như sau: P0 là không được triển khai thật nếu chưa sửa; P1 ảnh hưởng lớn đến bảo mật/độ tin cậy; P2 ảnh hưởng khả năng mở rộng/bảo trì; P3 là chất lượng và trải nghiệm.'
    $limitRows = @(
        @('P0', 'Thanh toán chỉ mô phỏng', 'Không có gateway, chữ ký webhook, idempotency, reconciliation.', 'Có thể đánh dấu đã trả tiền mà không có giao dịch thật.', 'Tích hợp sandbox chính thức; xác minh server-to-server và webhook ký số.'),
        @('P1', 'Session MemoryStore', 'express-session không cấu hình store.', 'Restart logout toàn bộ; memory leak; không scale nhiều instance.', 'Redis/MySQL session store, TTL và rotation session ID.'),
        @('P1', 'Queue nằm trong RAM', 'Map + array trong tiến trình.', 'Mất email/cleanup/AI khi restart; không có worker độc lập.', 'BullMQ/Redis hoặc DB outbox; DLQ, timeout, retention, idempotency.'),
        @('P1', 'OTP nằm trong RAM', 'Map theo email, OTP lưu rõ.', 'Mất OTP khi restart; khác instance không thấy nhau.', 'Hash OTP trong Redis/DB với TTL, atomic attempts và token reset một lần.'),
        @('P1', 'CSRF chưa bắt buộc token', 'Same-origin request được qua dù thiếu token; non-browser thiếu header cũng qua.', 'Phòng vệ phụ thuộc header/SameSite và cấu hình origin.', 'Yêu cầu double-submit token cho mọi unsafe method dùng cookie; miễn trừ rõ API bearer.'),
        @('P1', 'CSP còn unsafe-inline', 'Nhiều script/style inline.', 'Nếu có injection, CSP khó chặn script inline.', 'Tách script; dùng nonce/hash; loại unsafe-inline.'),
        @('P1', 'AI job thiếu ownership', 'GET job tra theo UUID/type, record không lưu user_id.', 'UUID khó đoán nhưng không phải authorization đầy đủ.', 'Lưu owner/session ID và kiểm tra trước khi trả kết quả.'),
        @('P1', 'Không có kiểm thử payment/security E2E', 'Test chủ yếu mock/source regression.', 'Lỗi tích hợp thật có thể lọt CI.', 'Playwright/Supertest + MySQL container; test CSRF/session/upload/payment callback.'),
        @('P2', 'Route nguyên khối', 'admin.js khoảng 1.500 dòng, logic DB/HTTP/cleanup cùng chỗ.', 'Khó bảo trì, review và tái sử dụng; dễ xử lý lỗi không đồng nhất.', 'Hoàn tất controller-service-repository theo từng domain.'),
        @('P2', 'Migration gộp', 'Một merged_schema_upgrade và blacklist câu lệnh.', 'Khó thêm phiên bản tuần tự; DDL rollback không bảo đảm.', 'Migration bất biến 001,002…; tool chuẩn; backup và dry-run.'),
        @('P2', 'Aggregate stock trùng dữ liệu', 'products.stock và tổng variants cùng tồn tại.', 'Có thể lệch khi code path quên sync.', 'Chọn nguồn sự thật; trigger/event/outbox hoặc view; audit định kỳ.'),
        @('P2', 'Rate limit RAM/fixed-window', 'Map theo IP trong từng process.', 'Burst ranh giới, mất khi restart, không chia sẻ instance.', 'Redis sliding window/token bucket; key account + IP; chuẩn hóa proxy.'),
        @('P2', 'Metrics RAM/high cardinality', 'Counter key chứa req.path thực.', 'Mất lịch sử, path ID tạo vô số series.', 'Prometheus/OpenTelemetry; dùng route template, histogram và external collector.'),
        @('P2', 'Log chưa thống nhất', 'Nhiều console.error ngoài logger.', 'Thiếu request_id/context, khó tìm sự cố.', 'Logger dùng chung, redaction secret/PII, level và sink tập trung.'),
        @('P2', 'Search LIKE/OFFSET', 'LIKE %q% và phân trang offset.', 'Chậm khi catalog lớn; ranking đơn giản.', 'FULLTEXT/Elasticsearch/Meilisearch; keyset pagination.'),
        @('P2', 'Ước lượng giao hàng heuristic', 'So chuỗi địa chỉ và cộng ngày lịch.', 'Sai địa danh, lễ/cuối tuần và SLA thực.', 'Chuẩn hóa mã tỉnh/huyện; bảng zone/rate; API hãng vận chuyển.'),
        @('P2', 'Upload chưa kiểm nội dung sâu', 'MIME + extension, chưa magic byte/decode.', 'File giả ảnh hoặc payload độc hại có thể qua lớp đầu.', 'file-type/libmagic, decode/re-encode ảnh, virus scan, signed upload.'),
        @('P2', 'Không có audit log', 'Thay trạng thái/giá/quyền không ghi lịch sử tác nhân.', 'Khó truy vết và phục hồi sai thao tác.', 'Bảng audit_events immutable, actor/request ID/before-after.'),
        @('P2', 'Coupon gắn cứng code/ID', 'Rule PHONE15/VIP20/WELCOME10 nằm trong code.', 'Đổi marketing phải deploy; category_id=1 dễ sai.', 'Rule engine/cấu hình DB theo scope, segment và điều kiện.'),
        @('P2', 'Socket scale một tiến trình', 'Room adapter và session map trong RAM.', 'Nhiều instance không broadcast chung.', 'Redis adapter + shared session + sticky session nếu cần.'),
        @('P3', 'Lint/format chưa thực', 'lint=node --check; format chỉ đọc file.', 'Không bắt style, unused, bug pattern; CSS có trailing whitespace.', 'ESLint, Prettier, Stylelint và git diff --check trong CI.'),
        @('P3', 'README lệch test', 'Tài liệu ghi 47 nhưng hiện chạy 76.', 'Người đọc đánh giá sai phạm vi test.', 'Sinh badge/count tự động hoặc bỏ số cứng.'),
        @('P3', 'Frontend lặp và inline', 'Nhiều view tự viết fetch/toast/auth/escape.', 'Sửa một lỗi phải cập nhật nhiều nơi.', 'Module hóa UI/API, template component hoặc framework nhẹ.'),
        @('P3', 'Chưa có accessibility/performance budget', 'Không thấy kiểm Lighthouse/axe trong CI.', 'UX bàn phím/screen reader và tốc độ có thể thoái hóa.', 'axe/Playwright, Lighthouse CI, image sizing/lazy loading.'),
        @('P3', 'Dependency/version operations', 'Chưa thấy Dependabot/SCA và lock policy rõ.', 'Lỗ hổng package có thể tồn tại lâu.', 'npm audit có đánh giá, Dependabot/Renovate, SBOM và lịch cập nhật.')
    )
    Add-Table @('Ưu tiên', 'Hạn chế', 'Nguyên nhân', 'Tác động', 'Hướng khắc phục') $limitRows @(42, 92, 125, 132, 155)

    Add-Paragraph '7. Lộ trình cải tiến đề xuất' 'Heading 1' 0
    Add-Paragraph 'Giai đoạn 1 – bắt buộc trước production' 'Heading 2' 0
    Add-Number 'Giữ nhãn “thanh toán mô phỏng” hoặc tích hợp gateway thật đầy đủ webhook/idempotency.'
    Add-Number 'Chuyển session, OTP, rate limit và queue sang Redis/worker bền vững; thêm owner cho AI job.'
    Add-Number 'Bắt buộc CSRF token cho unsafe request dùng cookie; bỏ unsafe-inline bằng nonce hoặc script ngoài.'
    Add-Number 'Thêm integration test MySQL và E2E cho đăng nhập, checkout, coupon, hủy đơn, upload và phân quyền.'
    Add-Paragraph 'Giai đoạn 2 – độ tin cậy và vận hành' 'Heading 2' 0
    Add-Number 'Chuẩn hóa migration bất biến, outbox cho email/cleanup, audit log và retry deadlock.'
    Add-Number 'Đưa metrics/log ra hệ thống ngoài; route template thay path động; cảnh báo SLO.'
    Add-Number 'Thêm backup định kỳ, restore drill, secret manager và runbook sự cố.'
    Add-Paragraph 'Giai đoạn 3 – bảo trì và hiệu năng' 'Heading 2' 0
    Add-Number 'Tách domain service/repository khỏi admin.js, orders.js và messages.js.'
    Add-Number 'Dùng ESLint/Prettier/Stylelint thật; giảm script inline và module hóa frontend.'
    Add-Number 'Nâng search lên full-text/keyset khi dữ liệu tăng; cache dashboard và dữ liệu ít đổi.'

    Add-Paragraph '8. Cách đọc mã nguồn theo chức năng' 'Heading 1' 0
    $mapRows = @(
        @('Khởi động/pipeline', 'server.js; src/app.js; src/routes/index.js'),
        @('Cấu hình', 'src/config/database.js; runtime.js; passport.js; mail.js'),
        @('Bảo mật', 'src/middleware/security.js; csrf.js; auth.js; rate-limit.js; validate.js'),
        @('Sản phẩm/biến thể', 'src/routes/products.js; src/core/product-variants.js; src/routes/admin.js'),
        @('Giỏ/đơn/coupon', 'src/routes/cart.js; orders.js; coupons.js; src/core/coupon-validation.js'),
        @('AI', 'src/services/store-ai.js; src/services/ai/openai-client.js; src/routes/ai-chat.js'),
        @('Chat hỗ trợ', 'src/routes/messages.js; src/realtime/chat-socket.js; views/components/ai-chatbox.html'),
        @('Ảnh', 'src/core/image-upload.js; src/services/cloud-storage.js'),
        @('Vận hành', 'src/config/logger.js; metrics.js; migrate.js; scripts/backup.js; .github/workflows/ci.yml'),
        @('Frontend chung', 'public/js/app.js; public/js/modules/http.js; public/js/checkout.js'),
        @('Database', 'database/anhtraistore.sql'),
        @('Kiểm thử', 'tests/product-regressions.test.js')
    )
    Add-Table @('Chức năng', 'Tệp nên đọc') $mapRows @(150, 370)

    Add-Paragraph '9. Kết luận' 'Heading 1' 0
    Add-Paragraph 'AnhTraiStore hiện là một đồ án thương mại điện tử có phạm vi khá đầy đủ: danh mục, biến thể, tồn kho, giỏ hàng, đơn hàng, coupon, dashboard, email, chat realtime và trợ lý AI. Những điểm mạnh nhất là transaction khi đặt hàng, cập nhật tồn kho có điều kiện, giới hạn dữ liệu AI, validation/bảo mật nhiều lớp, migration có checksum và bộ regression test rộng.'
    Add-Paragraph 'Tuy nhiên, dự án vẫn ở mức demo nâng cao chứ chưa phải production-ready. Ranh giới quan trọng nhất là tính bền vững của state: session, OTP, rate limit, metrics và queue đều sống trong RAM. Tiếp theo là thanh toán mô phỏng, CSP/CSRF chưa siết tối đa, thiếu E2E/integration thật và kiến trúc route còn lớn. Nếu xử lý các mục P0/P1 trước, sau đó chuẩn hóa observability, migration và modularization, dự án sẽ tiến gần đáng kể tới khả năng triển khai thực tế.'

    $null = $script:html.AppendLine('</body></html>')
    $htmlPath = Join-Path $env:TEMP 'anhtraistore-project-guide.html'
    $staticToc = '<ol><li>Mục tiêu và phạm vi tài liệu</li><li>Kiến trúc tổng thể</li><li>Các công nghệ sử dụng</li><li>Mô hình dữ liệu</li><li>Giải thích các thuật toán và quy trình xử lý</li><li>Phân tích rõ các điểm hạn chế</li><li>Lộ trình cải tiến đề xuất</li><li>Cách đọc mã nguồn theo chức năng</li><li>Kết luận</li></ol>'
    $htmlContent = $script:html.ToString().Replace('[TOC_PLACEHOLDER]', $staticToc)
    [System.IO.File]::WriteAllText($htmlPath, $htmlContent, [System.Text.UTF8Encoding]::new($true))

    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.ScreenUpdating = $false
    $word.Options.CheckGrammarAsYouType = $false
    $word.Options.CheckSpellingAsYouType = $false
    $script:doc = $word.Documents.Open($htmlPath)
    $doc.PageSetup.TopMargin = $word.CentimetersToPoints(2.2)
    $doc.PageSetup.BottomMargin = $word.CentimetersToPoints(2.0)
    $doc.PageSetup.LeftMargin = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.RightMargin = $word.CentimetersToPoints(2.0)

    $doc.SaveAs2($docxPath, 12)
    $tableCount = $doc.Tables.Count
    $doc.Close($false)
    Write-Output "DOCX=$docxPath"
    Write-Output "TABLES=$tableCount"
}
finally {
    if ($script:doc -and $script:doc.Saved -eq $false) { $script:doc.Close($false) }
    if ($word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}
