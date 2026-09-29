-- 
-- DATABASE: ndukmlaxhosting_anhtraisstore
-- Phiên bản: 2026-09-11
-- Các tính năng: Sản phẩm, Giỏ hàng, Đơn hàng, Yêu thích, So sánh, 
--                Coupon, Chat, Liên hệ, Banner, Khuyến mãi

-- 1. USERS TABLE (khách hàng + admin)
-- 
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255),
    phone VARCHAR(15),
    address TEXT,
    birthdate DATE,
    gender ENUM('male', 'female', 'other') DEFAULT NULL,
    role ENUM('customer', 'admin') DEFAULT 'customer',
    avatar VARCHAR(255) DEFAULT NULL,
    google_id VARCHAR(255) NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 
-- 2. RESET_TOKENS TABLE (quên mật khẩu)
-- 
CREATE TABLE IF NOT EXISTS reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 
-- 3. CATEGORIES TABLE (danh mục: điện thoại, đồng hồ...)
-- 
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    image VARCHAR(255),
    is_active TINYINT(1) DEFAULT 1
);

-- 
-- 4. BRANDS TABLE (hãng: Apple, Samsung, Xiaomi...)
-- 
CREATE TABLE IF NOT EXISTS brands (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    logo VARCHAR(255),
    is_active TINYINT(1) DEFAULT 1
);

-- 
-- 5. PRODUCTS TABLE (sản phẩm)
-- 
CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    category_id INT,
    brand_id INT,
    price DECIMAL(15,0) NOT NULL,
    old_price DECIMAL(15,0),
    discount_percent INT DEFAULT 0,
    stock INT DEFAULT 0,
    description TEXT,
    ram VARCHAR(20),
    storage VARCHAR(20),
    os VARCHAR(100),
    chipset VARCHAR(100),
    cpu VARCHAR(150),
    gpu VARCHAR(150),
    screen_size VARCHAR(20),
    screen_resolution VARCHAR(50),
    thumbnail VARCHAR(255),
    is_featured TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (brand_id) REFERENCES brands(id)
);

-- 
-- 6. PRODUCT_IMAGES TABLE (nhiều ảnh cho 1 sản phẩm)
-- 
CREATE TABLE IF NOT EXISTS product_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    alt_text VARCHAR(255) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_primary TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Đồng bộ cấu trúc cho database cũ trước khi chèn dữ liệu mẫu.
SET @column_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_images' AND COLUMN_NAME = 'alt_text'
);
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE product_images ADD COLUMN alt_text VARCHAR(255) DEFAULT NULL AFTER image_url',
    'SELECT ''Column alt_text already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_images' AND COLUMN_NAME = 'is_primary'
);
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE product_images ADD COLUMN is_primary TINYINT(1) DEFAULT 0 AFTER sort_order',
    'SELECT ''Column is_primary already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Các phiên bản RAM / ROM / màu sắc của sản phẩm
CREATE TABLE IF NOT EXISTS product_variants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    sku VARCHAR(100) NULL UNIQUE,
    ram VARCHAR(50) NULL,
    storage VARCHAR(50) NULL,
    color VARCHAR(100) NULL,
    price DECIMAL(15,0) NOT NULL,
    old_price DECIMAL(15,0) NULL,
    stock INT NOT NULL DEFAULT 0,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_variants_product (product_id, is_active),
    INDEX idx_product_variants_options (ram, storage, color),
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 
-- 7. ORDERS TABLE (đơn hàng)
-- 
CREATE TABLE IF NOT EXISTS orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    payment_code VARCHAR(50),
    total_price DECIMAL(15,0) NOT NULL,
    shipping_fee DECIMAL(15,0) DEFAULT 0,
    shipping_name VARCHAR(100) NOT NULL,
    shipping_phone VARCHAR(15) NOT NULL,
    shipping_address TEXT NOT NULL,
    notes TEXT,
    payment_method ENUM('cod', 'vnpay', 'momo') DEFAULT 'cod',
    status ENUM('pending','confirmed','shipping','delivered','cancelled') DEFAULT 'pending',
    discount_amount DECIMAL(15,0) DEFAULT 0,
    coupon_code VARCHAR(50) NULL,
    cancel_reason VARCHAR(255) NULL,
    cancelled_at DATETIME NULL,
    paid_at DATETIME NULL,
    cart_item_ids VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_orders_payment_code (payment_code),
    INDEX idx_orders_user_created (user_id, created_at),
    INDEX idx_orders_status_created (status, created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 
-- 8. ORDER_ITEMS TABLE (chi tiết từng sản phẩm trong đơn)
-- 
CREATE TABLE IF NOT EXISTS order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,
    quantity INT NOT NULL,
    price DECIMAL(15,0) NOT NULL,
    INDEX idx_order_items_variant (variant_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

-- 
-- 9. CART TABLE (giỏ hàng tạm)
-- 
CREATE TABLE IF NOT EXISTS cart (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,
    variant_identity INT GENERATED ALWAYS AS (COALESCE(variant_id, 0)) STORED,
    quantity INT DEFAULT 1,
    INDEX idx_cart_variant (variant_id),
    UNIQUE KEY uq_cart_user_product_variant (user_id, product_id, variant_identity),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

-- 
-- 10. REVIEWS TABLE (đánh giá sản phẩm)
-- 
CREATE TABLE IF NOT EXISTS reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reviews_user_product (user_id, product_id),
    INDEX idx_reviews_product_created (product_id, created_at),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 
-- 11. WISHLISTS TABLE (sản phẩm yêu thích)
-- 
CREATE TABLE IF NOT EXISTS wishlists (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_product (user_id, product_id),
    INDEX idx_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 
-- 12. COUPONS TABLE (mã giảm giá / voucher)
-- 
CREATE TABLE IF NOT EXISTS coupons (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    discount_type ENUM('percent', 'fixed') DEFAULT 'percent',
    discount_value DECIMAL(15,0) NOT NULL,
    min_order_value DECIMAL(15,0) DEFAULT 0,
    max_discount DECIMAL(15,0) DEFAULT NULL,
    usage_limit INT DEFAULT NULL,
    used_count INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    start_date DATETIME DEFAULT NULL,
    expires_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 
-- 13. USER_COUPONS TABLE (lịch sử dùng coupon)
-- 
CREATE TABLE IF NOT EXISTS user_coupons (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    coupon_id INT NOT NULL,
    order_id INT DEFAULT NULL,
    discount_amount DECIMAL(15,0) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_user_coupons_order (order_id),
    UNIQUE KEY uq_user_coupons_user_coupon (user_id, coupon_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_coupons_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- 
-- 14. CONTACTS TABLE (form liên hệ)
-- 
CREATE TABLE IF NOT EXISTS contacts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT DEFAULT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    subject VARCHAR(200),
    message TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contacts_user_created (user_id, created_at),
    CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 
-- 15. CONVERSATIONS TABLE (hội thoại chat giữa user và admin)
-- 
CREATE TABLE IF NOT EXISTS conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contact_id INT DEFAULT NULL,
    user_id INT DEFAULT NULL,
    status ENUM('open', 'closed') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at DATETIME DEFAULT NULL,
    INDEX idx_conversations_user_activity (user_id, last_message_at),
    INDEX idx_conversations_status_activity (status, last_message_at),
    INDEX idx_contact_id (contact_id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 
-- 16. MESSAGES TABLE (tin nhắn trong hội thoại)
-- 
CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    sender_type ENUM('user', 'admin', 'system') NOT NULL,
    sender_id INT DEFAULT NULL,
    content TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_messages_conversation_created (conversation_id, created_at, id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 
-- 17. PROMOTIONS TABLE (khuyến mãi)
-- 
CREATE TABLE IF NOT EXISTS promotions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    image VARCHAR(255),
    start_date DATE,
    end_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    link_url VARCHAR(255) DEFAULT NULL,
    banner_type ENUM('main','side') DEFAULT 'main'
);

-- 
-- 18. BANNERS TABLE (banner trang chủ)
-- 
CREATE TABLE IF NOT EXISTS banners (
    id INT PRIMARY KEY AUTO_INCREMENT,
    position VARCHAR(20) DEFAULT 'hero' COMMENT 'hero, side, quick',
    title VARCHAR(200) DEFAULT NULL,
    subtitle VARCHAR(300) DEFAULT NULL,
    link VARCHAR(500) DEFAULT NULL,
    image_url VARCHAR(500) NOT NULL,
    sort_order INT(11) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- BEGIN EXISTING DATABASE UPGRADE
-- ĐỒNG BỘ RÀNG BUỘC CHO DATABASE CŨ
-- Các lệnh dưới đây có thể chạy lại. Nếu database cũ có dữ liệu trùng, việc
-- tạo UNIQUE sẽ dừng để dữ liệu được kiểm tra thay vì tự động xóa bản ghi.
--

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'user_id'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE contacts ADD COLUMN user_id INT NULL AFTER id',
    'SELECT ''contacts.user_id already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart' AND COLUMN_NAME = 'variant_identity'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE cart ADD COLUMN variant_identity INT GENERATED ALWAYS AS (COALESCE(variant_id, 0)) STORED AFTER variant_id',
    'SELECT ''cart.variant_identity already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_payment_code'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE orders ADD UNIQUE KEY uq_orders_payment_code (payment_code)',
    'SELECT ''uq_orders_payment_code already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart' AND INDEX_NAME = 'uq_cart_user_product_variant'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE cart ADD UNIQUE KEY uq_cart_user_product_variant (user_id, product_id, variant_identity)',
    'SELECT ''uq_cart_user_product_variant already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'uq_reviews_user_product'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE reviews ADD UNIQUE KEY uq_reviews_user_product (user_id, product_id)',
    'SELECT ''uq_reviews_user_product already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_coupons' AND INDEX_NAME = 'uq_user_coupons_user_coupon'
);
SET @duplicate_coupon_groups = (
    SELECT COUNT(*) FROM (
        SELECT user_id, coupon_id
        FROM user_coupons
        GROUP BY user_id, coupon_id
        HAVING COUNT(*) > 1
    ) AS duplicate_groups
);
SET @ddl = IF(@ddl_exists > 0,
    'SELECT ''uq_user_coupons_user_coupon already exists'' AS message',
    IF(@duplicate_coupon_groups = 0,
        'ALTER TABLE user_coupons ADD UNIQUE KEY uq_user_coupons_user_coupon (user_id, coupon_id)',
        'SELECT ''Skipped uq_user_coupons_user_coupon: duplicate coupon history must be resolved first'' AS warning'
    )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_user_created'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE orders ADD INDEX idx_orders_user_created (user_id, created_at)',
    'SELECT ''idx_orders_user_created already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_status_created'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE orders ADD INDEX idx_orders_status_created (status, created_at)',
    'SELECT ''idx_orders_status_created already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'idx_reviews_product_created'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE reviews ADD INDEX idx_reviews_product_created (product_id, created_at)',
    'SELECT ''idx_reviews_product_created already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_coupons' AND INDEX_NAME = 'idx_user_coupons_order'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE user_coupons ADD INDEX idx_user_coupons_order (order_id)',
    'SELECT ''idx_user_coupons_order already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND INDEX_NAME = 'idx_contacts_user_created'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE contacts ADD INDEX idx_contacts_user_created (user_id, created_at)',
    'SELECT ''idx_contacts_user_created already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND INDEX_NAME = 'idx_conversations_user_activity'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE conversations ADD INDEX idx_conversations_user_activity (user_id, last_message_at)',
    'SELECT ''idx_conversations_user_activity already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND INDEX_NAME = 'idx_conversations_status_activity'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE conversations ADD INDEX idx_conversations_status_activity (status, last_message_at)',
    'SELECT ''idx_conversations_status_activity already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_messages_conversation_created'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE messages ADD INDEX idx_messages_conversation_created (conversation_id, created_at, id)',
    'SELECT ''idx_messages_conversation_created already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND CONSTRAINT_NAME = 'fk_contacts_user'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE contacts ADD CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
    'SELECT ''fk_contacts_user already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_coupons' AND CONSTRAINT_NAME = 'fk_user_coupons_order'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE user_coupons ADD CONSTRAINT fk_user_coupons_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL',
    'SELECT ''fk_user_coupons_order already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- END EXISTING DATABASE UPGRADE

-- 
-- DỮ LIỆU MẪU - BRANDS
-- 
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE brands;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO brands (id, name, slug, logo) VALUES
(1, 'Apple', 'apple', NULL),
(2, 'Samsung', 'samsung', NULL),
(3, 'Xiaomi', 'xiaomi', NULL),
(4, 'Oppo', 'oppo', NULL),
(5, 'Vivo', 'vivo', NULL),
(6, 'Realme', 'realme', NULL),
(7, 'Nokia', 'nokia', NULL),
(8, 'Huawei', 'huawei', NULL),
(9, 'Lenovo', 'lenovo', NULL),
(10, 'Asus', 'asus', NULL),
(11, 'Casio', 'casio', NULL),
(12, 'Rolex', 'rolex', NULL),
(13, 'Omega', 'omega', NULL),
(14, 'Fossil', 'fossil', NULL),
(15, 'Seiko', 'seiko', NULL),
(16, 'Garmin', 'garmin', NULL);

-- 
-- DỮ LIỆU MẪU - CATEGORIES
-- 
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE categories;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO categories (id, name, slug, image) VALUES
(1, 'Điện thoại', 'dien-thoai', NULL),
(2, 'Tai nghe', 'tai-nghe', NULL),
(3, 'Sạc', 'sac', NULL),
(4, 'Ốp lưng', 'op-lung', NULL),
(5, 'Phụ kiện', 'phu-kien', NULL),
(6, 'Máy tính bảng', 'may-tinh-bang', NULL),
(7, 'Máy tính bàn', 'may-tinh-ban', NULL),
(8, 'Máy tính xách tay', 'may-tinh-xach-tay', NULL),
(9, 'Đồng hồ', 'dong-ho', NULL);

-- DỮ LIỆU MẪU - USERS

-- Default Admin Account:
-- Email: adminanhtrai@gmail.com
-- Password: admin123

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO users (id, full_name, email, password, phone, address, birthdate, gender, role, created_at) VALUES
(1, 'Quản Trị Viên', 'adminanhtrai@gmail.com', '$2a$10$YldNdMvi5yhdOCukOn/lW.e2LgEuP29tLkbefv53y0G7gC1bZhDYW', '0909123456', '123 Nguyễn Huệ, Q.1, TP.HCM', '1990-01-15', 'male', 'admin', '2026-03-30 13:39:13');

-- DỮ LIỆU MẪU - PRODUCTS (iPhone series)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE products;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO products (id, name, slug, category_id, brand_id, price, old_price, discount_percent, stock, description, ram, storage, thumbnail, is_featured, created_at) VALUES
-- iPhone Series
(1, 'iPhone 15 Pro Max', 'iphone-15-pro-max', 1, 1, 28990000, 32990000, 12, 48, 'iPhone 15 Pro Max chip A17 Pro, camera 48MP, màn hình 6.7 inch Super Retina XDR. Khung titanium cao cấp, cổng USB-C, Action Button.', '8GB', '256GB', 'iphone-15-pro-max-256gb-1775315484.jpg', 1, '2026-03-30 13:45:41'),
(2, 'iPhone 16', 'iphone-16', 1, 1, 18900000, 22235294, 15, 10, 'iPhone 16 với chip A18 mới, xử lý nhanh và tiết kiệm pin hơn thế hệ trước. Camera Fusion 48MP, nút Camera Control mới.', '8GB', '128GB', 'iphone-16-1775484985.jpg', 1, '2026-04-06 14:16:25'),
(3, 'iPhone 14 Pro', 'iphone-14-pro', 1, 1, 19990000, 22990000, 13, 15, 'iPhone 14 Pro - Chip A16 Bionic, Dynamic Island, camera 48MP', '6GB', '128GB', 'iphone-14-pro-128gb-ch-inh-h-ang-vn-a-1775999385.webp', 1, '2026-04-10 10:00:00'),
(4, 'iPhone 15 Pro', 'iphone-15-pro', 1, 1, 27990000, 30990000, 10, 20, 'iPhone 15 Pro - Chip A17 Pro, khung titanium, camera 48MP', '8GB', '256GB', 'iphone-15-pro-256gb-ch-inh-h-ang-vn-a-1775999446.webp', 1, '2026-04-10 10:00:00'),
(5, 'iPhone 16 Pro', 'iphone-16-pro', 1, 1, 29990000, 34990000, 14, 12, 'iPhone 16 Pro - Chip A18 Pro, màn hình 6.3 inch, camera 48MP', '8GB', '128GB', 'iphone-16-pro-128gb-ch-inh-h-ang-vn-a-1775999763.webp', 1, '2026-04-10 10:00:00'),
(6, 'iPhone 16 Pro Max', 'iphone-16-pro-max', 1, 1, 33990000, 38990000, 13, 8, 'iPhone 16 Pro Max - Chip A18 Pro, màn hình 6.9 inch', '8GB', '256GB', 'iphone-16-pro-max-256gb-1775999806.webp', 1, '2026-04-10 10:00:00'),
(7, 'iPhone 16 Plus', 'iphone-16-plus', 1, 1, 22990000, 25990000, 12, 18, 'iPhone 16 Plus - Chip A18, màn hình 6.7 inch', '8GB', '128GB', 'iphone-16-plus-128gb-1776000232.webp', 0, '2026-04-10 10:00:00'),
(8, 'iPhone 16e', 'iphone-16e', 1, 1, 14990000, 16990000, 12, 25, 'iPhone 16e - Chip A18, camera 48MP, giá hấp dẫn', '8GB', '128GB', 'iphone-16e-128gb-ch-inh-h-ang-vn-a-1775999716.webp', 0, '2026-04-10 10:00:00'),
(9, 'iPhone 17 Pro', 'iphone-17-pro', 1, 1, 34990000, 38990000, 10, 5, 'iPhone 17 Pro - Chip A19 Pro, camera 48MP, thiết kế mới', '12GB', '256GB', 'iphone-17-pro-256gb-1776000031.webp', 1, '2026-04-15 10:00:00'),
(10, 'iPhone 17 Pro Max', 'iphone-17-pro-max', 1, 1, 38990000, 42990000, 9, 3, 'iPhone 17 Pro Max - Chip A19 Pro, màn hình 6.9 inch', '12GB', '256GB', 'iphone-17-pro-max-256gb-1776000081.webp', 1, '2026-04-15 10:00:00'),
(11, 'iPhone 17 Air', 'iphone-17-air', 1, 1, 31990000, 34990000, 9, 7, 'iPhone 17 Air - Siêu mỏng 5.5mm, chip A19', '8GB', '256GB', 'iphone-air-256gb-1775999862.webp', 1, '2026-04-15 10:00:00'),
(12, 'iPhone 17e', 'iphone-17e', 1, 1, 17990000, 19990000, 10, 12, 'iPhone 17e - Chip A18, camera 48MP, giá tốt', '8GB', '256GB', 'iphone-17e-256gb-1775999908.webp', 0, '2026-04-15 10:00:00'),

-- Samsung Galaxy S Series
(20, 'Samsung Galaxy S24 Ultra', 'samsung-galaxy-s24-ultra', 1, 2, 26990000, 29990000, 10, 30, 'Samsung Galaxy S24 Ultra bút S Pen tích hợp, camera 200MP, màn hình 6.8 inch Dynamic AMOLED 2X.', '12GB', '256GB', 'samsung-galaxy-s24-ultra-1775315494.jpg', 1, '2026-03-30 13:45:41'),
(21, 'Samsung Galaxy S25 Ultra', 'samsung-galaxy-s25-ultra', 1, 2, 27490000, 33380000, 18, 10, 'Samsung Galaxy S25 Ultra – Flagship toàn diện, đỉnh cao công nghệ', '12GB', '256GB', 'samsung-galaxy-s25-ultra-12gb-256gb-1775914362.webp', 1, '2026-04-11 13:32:42'),
(22, 'Samsung Galaxy S26 Ultra', 'samsung-galaxy-s26-ultra', 1, 2, 32990000, 36990000, 11, 20, 'Samsung Galaxy S26 Ultra – Siêu phẩm đỉnh nhất 2026', '12GB', '256GB', 'samsung-galaxy-s26-ultra-12gb-256gb-1775912441.webp', 1, '2026-04-11 13:00:41'),
(23, 'Samsung Galaxy S25', 'samsung-galaxy-s25', 1, 2, 19990000, 22990000, 13, 15, 'Samsung Galaxy S25 – Flagship nhỏ gọn, chip thế hệ mới', '12GB', '256GB', 'samsung-galaxy-s25-256gb-1775918327.webp', 1, '2026-04-11 14:00:00'),
(24, 'Samsung Galaxy S26', 'samsung-galaxy-s26', 1, 2, 22990000, 25990000, 12, 20, 'Samsung Galaxy S26 – Flagship nhỏ gọn, chip thế hệ mới', '12GB', '256GB', 'samsung-galaxy-s26-12gb-256gb-1775917176.webp', 0, '2026-04-11 14:19:36'),

-- Samsung Galaxy A Series
(30, 'Samsung Galaxy A07', 'samsung-galaxy-a07', 1, 2, 3990000, 4490000, 11, 50, 'Samsung Galaxy A07 – Giá rẻ, pin 5000mAh, camera 50MP', '4GB', '128GB', 'samsung-galaxy-a07-4gb-128gb-1775917730.webp', 0, '2026-04-11 14:25:00'),
(31, 'Samsung Galaxy A16 5G', 'samsung-galaxy-a16-5g', 1, 2, 5490000, 5990000, 8, 40, 'Samsung Galaxy A16 5G – Màn AMOLED 6.7 inch, pin 5000mAh', '4GB', '128GB', 'samsung-galaxy-a16-lte-4gb-128gb-1775918232.webp', 0, '2026-04-11 14:26:00'),
(32, 'Samsung Galaxy A17 5G', 'samsung-galaxy-a17-5g', 1, 2, 6090000, 6390000, 5, 30, 'Samsung Galaxy A17 5G – 5G giá rẻ, pin trâu, màn AMOLED lớn', '8GB', '128GB', 'samsung-galaxy-a17-5g-8gb-128gb-1775917237.webp', 0, '2026-04-11 14:20:37'),
(33, 'Samsung Galaxy A26 5G', 'samsung-galaxy-a26-5g', 1, 2, 7490000, 7990000, 6, 25, 'Samsung Galaxy A26 5G – Chip Exynos, màn AMOLED 120Hz', '8GB', '128GB', 'samsung-galaxy-a26-5g-8gb-128gb-1775917944.webp', 0, '2026-04-11 14:22:00'),
(34, 'Samsung Galaxy A36 5G', 'samsung-galaxy-a36-5g', 1, 2, 9490000, 9990000, 5, 20, 'Samsung Galaxy A36 5G – Thiết kế đẹp, chip Snapdragon 6s Gen 3', '8GB', '128GB', 'samsung-galaxy-a36-5g-8gb-128gb-1775918179.webp', 0, '2026-04-11 14:23:00'),
(35, 'Samsung Galaxy A37 5G', 'samsung-galaxy-a37-5g', 1, 2, 8990000, 9490000, 5, 22, 'Samsung Galaxy A37 5G – Camera 50MP OIS, pin 5000mAh', '8GB', '128GB', 'samsung-galaxy-a37-5g-8gb-128gb-1775918125.webp', 0, '2026-04-11 14:23:30'),
(36, 'Samsung Galaxy A56 5G', 'samsung-galaxy-a56-5g', 1, 2, 9190000, 9810000, 6, 12, 'Samsung Galaxy A56 5G – Tầm trung vượt trội, thiết kế đẹp', '8GB', '128GB', 'samsung-galaxy-a56-5g-8gb-128gb-1775917465.webp', 0, '2026-04-11 14:24:25'),
(37, 'Samsung Galaxy A57 5G', 'samsung-galaxy-a57-5g', 1, 2, 9990000, 10990000, 9, 15, 'Samsung Galaxy A57 5G – Camera 50MP OIS, chip MediaTek', '8GB', '128GB', 'samsung-galaxy-a57-5g-8gb-128gb-1775917851.webp', 0, '2026-04-11 14:25:00'),

-- Samsung Galaxy Z Series
(40, 'Samsung Galaxy Z Fold7', 'samsung-galaxy-z-fold7', 1, 2, 41990000, 46990000, 11, 24, 'Samsung Galaxy Z Fold7 – Màn hình gập 8 inch, tablet bỏ túi đỉnh cao', '12GB', '256GB', 'samsung-galaxy-z-fold7-12gb-256gb-1775917309.webp', 1, '2026-04-11 14:21:49'),
(41, 'Samsung Galaxy Z Flip7', 'samsung-galaxy-z-flip7', 1, 2, 23990000, 28990000, 17, 19, 'Samsung Galaxy Z Flip7 – Gập cá tính, thời trang, bỏ túi siêu gọn', '12GB', '256GB', 'samsung-galaxy-z-flip7-12gb-256gb-1775917584.webp', 1, '2026-04-11 14:26:24'),

-- Samsung Galaxy S Plus series
(42, 'Samsung Galaxy S24 Plus', 'samsung-galaxy-s24-plus', 1, 2, 22990000, 25990000, 12, 18, 'Samsung Galaxy S24 Plus – Màn hình lớn 6.7 inch, pin 4900mAh', '12GB', '256GB', 'samsung-galaxy-s24-plus-12gb-256gb-1775918006.webp', 1, '2026-04-11 14:18:00'),
(43, 'Samsung Galaxy S25 FE', 'samsung-galaxy-s25-fe', 1, 2, 15990000, 17990000, 11, 25, 'Samsung Galaxy S25 FE – Fan Edition, chip Exynos, giá tốt', '8GB', '128GB', 'samsung-galaxy-s25-fe-8gb-128gb-1775917789.webp', 0, '2026-04-11 14:19:00'),

-- Xiaomi Series
(50, 'Xiaomi 13 Lite', 'xiaomi-13-lite', 1, 3, 7990000, 8990000, 11, 30, 'Xiaomi 13 Lite – Snapdragon 7 Gen 1, camera 50MP, mỏng nhẹ', '8GB', '128GB', 'xiaomi-13-lite-1775982915.webp', 0, '2026-04-11 15:00:00'),
(51, 'Xiaomi 13 Pro', 'xiaomi-13-pro', 1, 3, 17990000, 19990000, 10, 15, 'Xiaomi 13 Pro – Snapdragon 8 Gen 2, Leica camera', '12GB', '256GB', 'xiaomi-13-pro-12gb-256gb-1775982868.webp', 1, '2026-04-11 15:01:00'),
(52, 'Xiaomi 14T', 'xiaomi-14t', 1, 3, 12990000, 14990000, 13, 20, 'Xiaomi 14T – Leica optics, chip Dimensity 8300', '12GB', '512GB', 'xiaomi-14t-12gb-512gb-1775982679.webp', 1, '2026-04-11 15:02:00'),
(53, 'Xiaomi 15', 'xiaomi-15', 1, 3, 16990000, 18990000, 11, 18, 'Xiaomi 15 – Snapdragon 8 Elite, Leica camera', '12GB', '256GB', 'xiaomi-15-5g-12gb-256gb-1775982818.webp', 1, '2026-04-11 15:03:00'),
(54, 'Xiaomi 15 512GB', 'xiaomi-15-512gb', 1, 3, 19990000, 21990000, 9, 12, 'Xiaomi 15 512GB – Dung lượng lớn, Leica camera', '12GB', '512GB', 'xiaomi-15-5g-12gb-512gb-1775982397.webp', 1, '2026-04-11 15:04:00'),
(55, 'Xiaomi 15 Ultra', 'xiaomi-15-ultra', 1, 3, 29990000, 32990000, 9, 8, 'Xiaomi 15 Ultra – Camera 1 inch, Snapdragon 8 Elite', '16GB', '512GB', 'xiaomi-15-ultra-5g-16gb-512gb-1775982606.webp', 1, '2026-04-11 15:05:00'),
(56, 'Xiaomi 15T', 'xiaomi-15t', 1, 3, 13990000, 15990000, 13, 16, 'Xiaomi 15T – Dimensity 9300+, Leica camera', '12GB', '512GB', 'xiaomi-15t-5g-12gb-512gb-1775982152.webp', 0, '2026-04-11 15:06:00'),
(57, 'Xiaomi 17 Ultra', 'xiaomi-17-ultra', 1, 3, 32990000, 35990000, 8, 5, 'Xiaomi 17 Ultra – Camera 200MP, chip mới nhất', '16GB', '512GB', 'xiaomi-17-ultra-5g-16gb-512gb-1775981942.webp', 1, '2026-04-11 15:07:00'),
(58, 'Xiaomi Redmi Note 15', 'xiaomi-redmi-note-15', 1, 3, 4990000, 5490000, 9, 35, 'Xiaomi Redmi Note 15 – Giá rẻ, pin 5500mAh', '6GB', '128GB', 'xiaomi-redmi-note-15-6gb-128gb-1775982072.webp', 0, '2026-04-11 15:08:00'),
(59, 'Xiaomi Redmi Note 15 Pro', 'xiaomi-redmi-note-15-pro', 1, 3, 7990000, 8990000, 11, 25, 'Xiaomi Redmi Note 15 Pro – AMOLED 120Hz, chip Dimensity', '12GB', '256GB', 'xiaomi-redmi-note-15-pro-12gb-256gb-1775982475.webp', 0, '2026-04-11 15:09:00'),
(60, 'Xiaomi Redmi Note 14 Pro Plus', 'xiaomi-redmi-note-14-pro-plus', 1, 3, 6990000, 7990000, 13, 28, 'Xiaomi Redmi Note 14 Pro Plus – 200MP camera, sạc 120W', '8GB', '256GB', 'xiaomi-redmi-note-14-pro-plus-5g-8gb-1775982019.webp', 0, '2026-04-11 15:10:00'),
(61, 'Xiaomi Redmi 15C', 'xiaomi-redmi-15c', 1, 3, 3490000, 3990000, 13, 45, 'Xiaomi Redmi 15C – Giá siêu rẻ, pin 5000mAh, NFC', '8GB', '256GB', 'xiaomi-redmi-15c-8gb-256gb-nfc-1775982727.webp', 0, '2026-04-11 15:11:00'),
(62, 'Xiaomi Poco F8 Pro', 'xiaomi-poco-f8-pro', 1, 3, 11990000, 13990000, 14, 22, 'Xiaomi Poco F8 Pro – Snapdragon 8s Gen 3, sạc 90W', '12GB', '256GB', 'xiaomi-poco-f8-pro-5g-12gb-256gb-1775982293.webp', 1, '2026-04-11 15:12:00'),
(63, 'Xiaomi Poco X7 Pro', 'xiaomi-poco-x7-pro', 1, 3, 8990000, 9990000, 10, 30, 'Xiaomi Poco X7 Pro – Dimensity 8400, AMOLED 120Hz', '12GB', '256GB', 'xiaomi-poco-x7-pro-5g-12gb-256gb-1775982235.webp', 0, '2026-04-11 15:13:00'),

-- Apple Watch (Đồng hồ)
(70, 'Apple Watch Series 9', 'apple-watch-series-9', 9, 1, 11990000, 13990000, 14, 25, 'Apple Watch Series 9 màn hình Always-On Retina, chip S9, theo dõi sức khỏe toàn diện.', NULL, NULL, 'apple-watch-s9.jpg', 1, '2026-04-19 12:20:00'),
(71, 'Apple Watch Ultra 2', 'apple-watch-ultra-2', 9, 1, 22990000, 24990000, 8, 12, 'Apple Watch Ultra 2 – Titanium case, GPS chính xác, pin 36h', NULL, NULL, 'apple-watch-ultra-2.jpg', 1, '2026-04-19 12:21:00'),
(72, 'Apple Watch SE 2024', 'apple-watch-se-2024', 9, 1, 6990000, 7990000, 13, 30, 'Apple Watch SE – Giá tốt, đủ tính năng cơ bản', NULL, NULL, 'apple-watch-se.jpg', 0, '2026-04-19 12:22:00'),

-- Samsung Watch
(73, 'Samsung Galaxy Watch 7', 'samsung-galaxy-watch-7', 9, 2, 5990000, 6990000, 14, 30, 'Samsung Galaxy Watch 7 thiết kế sang trọng, pin 40 giờ, nhiều tính năng health tracking.', NULL, NULL, 'galaxy-watch-7.jpg', 1, '2026-04-19 12:21:00'),
(74, 'Samsung Galaxy Watch Ultra', 'samsung-galaxy-watch-ultra', 9, 2, 14990000, 16990000, 12, 15, 'Samsung Galaxy Watch Ultra – Titanium, GPS kép, chịu nước 100m', NULL, NULL, 'galaxy-watch-ultra.jpg', 1, '2026-04-19 12:22:00'),

-- Garmin
(75, 'Garmin Venu 3', 'garmin-venu-3', 9, 16, 14990000, 16990000, 12, 15, 'Garmin Venu 3 - Đồng hồ thể thao cao cấp, GPS tích hợp, pin 14 ngày.', NULL, NULL, 'garmin-venu-3.jpg', 1, '2026-04-19 12:22:00'),
(76, 'Garmin Forerunner 965', 'garmin-forerunner-965', 9, 16, 19990000, 21990000, 9, 10, 'Garmin Forerunner 965 – Đồng hồ chạy bộ cao cấp, AMOLED', NULL, NULL, 'garmin-forerunner-965.jpg', 0, '2026-04-19 12:23:00'),

-- Xiaomi Watch
(77, 'Xiaomi Watch S3', 'xiaomi-watch-s3', 9, 3, 2990000, 3490000, 14, 40, 'Xiaomi Watch S3 màn hình AMOLED 1.43 inch, pin 15 ngày, hơn 100 chế độ thể thao.', NULL, NULL, 'xiaomi-watch-s3.jpg', 0, '2026-04-19 12:23:00'),
(78, 'Xiaomi Watch S4', 'xiaomi-watch-s4', 9, 3, 3990000, 4490000, 11, 25, 'Xiaomi Watch S4 – AMOLED 1.97 inch, pin 18 ngày', NULL, NULL, 'xiaomi-watch-s4.jpg', 0, '2026-04-19 12:24:00'),

-- Casio
(79, 'Casio G-Shock GA-2100', 'casio-g-shock-ga-2100', 9, 11, 3590000, 3990000, 10, 50, 'Casio G-Shock GA-2100 thiết kế mỏng nhẹ, chống va đập, chống nước 200m.', NULL, NULL, 'casio-g-shock.jpg', 0, '2026-04-19 12:24:00'),
(80, 'Casio Edifice EQB-600D', 'casio-edifice-eqb-600d', 9, 11, 8990000, 9990000, 10, 20, 'Casio Edifice EQB-600D – Kết nối smartphone, auto time', NULL, NULL, 'casio-edifice.jpg', 0, '2026-04-19 12:25:00');

-- Tạo một phiên bản mặc định cho toàn bộ sản phẩm mẫu. Admin có thể thêm
-- RAM / ROM / màu và mức giá riêng sau khi import.
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE product_variants;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO product_variants (product_id, ram, storage, price, old_price, stock, is_default, is_active)
SELECT id, ram, storage, price, old_price, stock, 1, 1 FROM products;

-- 
-- DỮ LIỆU MẪU - PRODUCT_IMAGES (gallery cho sản phẩm)
-- 
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE product_images;
SET FOREIGN_KEY_CHECKS = 1;
-- iPhone 15 Pro Max gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(1, 'iphone-15-pro-max-256gb-1775315484.jpg', 'iPhone 15 Pro Max mặt trước', 1, 1),
(1, 'iphone-15-pro-max-back.jpg', 'iPhone 15 Pro Max mặt sau', 2, 0),
(1, 'iphone-15-pro-max-camera.jpg', 'iPhone 15 Pro Max camera', 3, 0),
(1, 'iphone-15-pro-max-colors.jpg', 'iPhone 15 Pro Max các màu', 4, 0);

-- iPhone 16 gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(2, 'iphone-16-1775484985.jpg', 'iPhone 16 mặt trước', 1, 1),
(2, 'iphone-16-back.jpg', 'iPhone 16 mặt sau', 2, 0),
(2, 'iphone-16-camera-control.jpg', 'iPhone 16 Camera Control', 3, 0),
(2, 'iphone-16-colors.jpg', 'iPhone 16 các màu sắc', 4, 0);

-- Samsung Galaxy S24 Ultra gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(20, 'samsung-galaxy-s24-ultra-1775315494.jpg', 'Galaxy S24 Ultra mặt trước', 1, 1),
(20, 'samsung-galaxy-s24-ultra-spen.jpg', 'Galaxy S24 Ultra với S Pen', 2, 0),
(20, 'samsung-galaxy-s24-ultra-camera.jpg', 'Galaxy S24 Ultra camera 200MP', 3, 0),
(20, 'samsung-galaxy-s24-ultra-colors.jpg', 'Galaxy S24 Ultra các màu', 4, 0);

-- Samsung Galaxy S25 Ultra gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(21, 'samsung-galaxy-s25-ultra-12gb-256gb-1775914362.webp', 'Galaxy S25 Ultra mặt trước', 1, 1),
(21, 'samsung-galaxy-s25-ultra-camera.jpg', 'Galaxy S25 Ultra camera', 2, 0),
(21, 'samsung-galaxy-s25-ultra-spen.jpg', 'Galaxy S25 Ultra S Pen', 3, 0);

-- Samsung Galaxy Z Fold7 gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(40, 'samsung-galaxy-z-fold7-12gb-256gb-1775917309.webp', 'Galaxy Z Fold7 mặt trước', 1, 1),
(40, 'samsung-galaxy-z-fold7-unfolded.jpg', 'Galaxy Z Fold7 mở gập', 2, 0),
(40, 'samsung-galaxy-z-fold7-camera.jpg', 'Galaxy Z Fold7 camera', 3, 0);

-- Xiaomi 15 gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(53, 'xiaomi-15-5g-12gb-256gb-1775982818.webp', 'Xiaomi 15 mặt trước', 1, 1),
(53, 'xiaomi-15-leica-camera.jpg', 'Xiaomi 15 Leica camera', 2, 0),
(53, 'xiaomi-15-colors.jpg', 'Xiaomi 15 các màu', 3, 0);

-- Xiaomi 15 Ultra gallery
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary) VALUES
(55, 'xiaomi-15-ultra-5g-16gb-512gb-1775982606.webp', 'Xiaomi 15 Ultra mặt trước', 1, 1),
(55, 'xiaomi-15-ultra-camera.jpg', 'Xiaomi 15 Ultra camera 1 inch', 2, 0),
(55, 'xiaomi-15-ultra-back.jpg', 'Xiaomi 15 Ultra mặt sau', 3, 0);


-- DỮ LIỆU MẪU - REVIEWS
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE reviews;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO reviews (id, product_id, user_id, rating, comment, created_at) VALUES
(1, 22, 1, 5, 'Shop uy tín nhiều ưu đãi', '2026-04-11 13:56:05'),
(2, 21, 1, 5, 'Máy đẹp, chụp ảnh đẹp, giao hàng nhanh!', '2026-04-12 10:30:00'),
(3, 1, 1, 4, 'Sản phẩm tốt, đóng gói cẩn thận', '2026-04-13 15:20:00'),
(4, 53, 1, 5, 'Xiaomi 15 chụp ảnh đẹp, pin trâu', '2026-04-14 09:15:00'),
(5, 40, 1, 5, 'Z Fold7 màn hình gập tuyệt vời!', '2026-04-15 14:45:00');

-- DỮ LIỆU MẪU - COUPONS
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE coupons;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO coupons (code, description, discount_type, discount_value, min_order_value, max_discount, usage_limit, is_active, expires_at) VALUES
('WELCOME10', 'Giảm 10% cho đơn hàng đầu tiên', 'percent', 10, 1000000, 500000, NULL, 1, '2027-12-31 23:59:59'),
('FREESHIP', 'Giảm 30K phí vận chuyển', 'fixed', 30000, 500000, NULL, NULL, 1, '2027-12-31 23:59:59'),
('VIP20', 'Giảm 20% cho khách VIP', 'percent', 20, 3000000, 1000000, 100, 1, '2027-12-31 23:59:59'),
('SALE5TR', 'Giảm 5.000.000đ cho đơn từ 30 triệu', 'fixed', 5000000, 30000000, NULL, 50, 1, '2027-12-31 23:59:59'),
('PHONE15', 'Giảm 15% điện thoại', 'percent', 15, 5000000, 2000000, 200, 1, '2027-06-30 23:59:59'),
('NEWUSER', 'Giảm 100K cho khách mới', 'fixed', 100000, 0, NULL, NULL, 1, '2027-12-31 23:59:59');

-- DỮ LIỆU MẪU - CONTACTS
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE contacts;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO contacts (id, full_name, email, phone, subject, message, is_read, created_at) VALUES
(1, 'Nguyễn Văn A', 'nguyenvana@email.com', '0909123456', 'Hỏi về iPhone 16', 'Cho tôi hỏi iPhone 16 có màu nào không?', 1, '2026-04-10 10:00:00'),
(2, 'Trần Thị B', 'tranthib@email.com', '0912345678', 'Mua sỉ', 'Tôi muốn mua sỉ điện thoại, liên hệ tôi', 0, '2026-04-11 14:00:00');

-- DỮ LIỆU MẪU - PROMOTIONS
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE promotions;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO promotions (id, title, description, image, start_date, end_date, is_active, link_url, banner_type) VALUES
(1, 'iPhone 15 Series', 'Giảm đến 15% iPhone 15', 'banner-1774878536.jpg', '2026-03-30', '2026-06-30', 1, '/products?category=dien-thoai&brand=apple', 'main'),
(2, 'Samsung Galaxy S24 Ultra', 'Ngon bổ rẻ', 'banner-1775317551-e8211a4e.jpg', '2026-04-04', '2026-06-30', 1, '/products?brand=samsung', 'side'),
(3, 'Xiaomi Summer Sale', 'Giảm đến 20% Xiaomi', 'banner-summer-sale.jpg', '2026-05-01', '2026-06-30', 1, '/products?brand=xiaomi', 'main');

-- DỮ LIỆU MẪU - BANNERS
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE banners;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO banners (position, title, subtitle, link, image_url, sort_order, is_active) VALUES
('hero', 'iPhone 17 Pro Max', 'Siêu phẩm công nghệ 2026 - Zoom 8x', '/products?brand=apple', '/images/banners/banner-1788990990201-330678853.jpg', 1, 1),
('hero', 'Samsung Galaxy S26 Ultra', 'Flagship đỉnh nhất 2026', '/products?brand=samsung', '/images/banners/banner-1788991089511-348985043.jpg', 2, 1),
('hero', 'Khuyến mãi mùa hè', 'Giảm đến 30% toàn bộ sản phẩm', '/products?sort=discount', '/images/banners/banner-1788991108073-743556226.jpg', 3, 1),
('side', 'Xiaomi 15 Ultra', 'Camera 200MP - Chip Snapdragon 8 Elite', '/products?brand=xiaomi', '/images/banners/banner-1788991113144-510192680.jpg', 1, 1),
('side', 'Apple Watch Ultra 2', 'Titanium - Pin 36 giờ', '/products?category=dong-ho', '/images/banners/banner-1788991118871-222511413.jpg', 2, 1),
('quick', 'Giảm 15% iPhone', 'Chỉ áp dụng đến 30/06', '/coupons/PHONE15', '/images/banner-quick-iphone.jpg', 1, 1);

-- DỮ LIỆU MẪU - CONVERSATIONS & MESSAGES (Chat)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE messages;
TRUNCATE TABLE conversations;
SET FOREIGN_KEY_CHECKS = 1;
INSERT INTO conversations (id, contact_id, user_id, status, created_at, last_message_at) VALUES
(1, 1, NULL, 'closed', '2026-04-10 10:05:00', '2026-04-10 11:00:00'),
(2, 2, NULL, 'open', '2026-04-11 14:05:00', '2026-04-11 15:30:00');

INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, is_read, created_at) VALUES
(1, 1, 'system', NULL, 'Hệ thống: Hội thoại được tạo từ liên hệ của Nguyễn Văn A', 1, '2026-04-10 10:05:00'),
(2, 1, 'user', NULL, 'Cho tôi hỏi iPhone 16 có màu nào không?', 1, '2026-04-10 10:10:00'),
(3, 1, 'admin', 1, 'Xin chào! iPhone 16 có các màu: Đen, Trắng, Hồng, Xanh lá, Xanh dương. Bạn quan tâm màu nào ạ?', 1, '2026-04-10 10:30:00'),
(4, 1, 'user', NULL, 'Cảm ơn shop, để tôi suy nghĩ thêm', 1, '2026-04-10 10:45:00'),
(5, 1, 'admin', 1, 'Dạ không có gì ạ! Shop có gì cần hỗ trợ cứ nhắn lại nhé.', 1, '2026-04-10 11:00:00'),
(6, 2, 'system', NULL, 'Hệ thống: Hội thoại được tạo từ liên hệ của Trần Thị B', 1, '2026-04-11 14:05:00'),
(7, 2, 'user', NULL, 'Tôi muốn mua sỉ điện thoại, liên hệ tôi', 1, '2026-04-11 14:10:00'),
(8, 2, 'admin', 1, 'Dạ xin chào! Cảm ơn bạn đã quan tâm. Bạn muốn mua sỉ bao nhiêu máy và thương hiệu nào ạ? Shop sẽ báo giá tốt nhất.', 0, '2026-04-11 14:30:00'),
(9, 2, 'user', NULL, 'Tôi muốn mua khoảng 50 máy iPhone các loại', 0, '2026-04-11 15:00:00'),
(10, 2, 'admin', 1, 'Dạ shop sẽ gửi báo giá qua email trong 30 phút. Bạn cho shop xin thông tin đầy đủ không?', 0, '2026-04-11 15:30:00');

-- CẬP NHẬT AUTO_INCREMENT
ALTER TABLE brands MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;
ALTER TABLE categories MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE users MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE products MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=81;
ALTER TABLE product_images MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=50;
ALTER TABLE orders MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;
ALTER TABLE order_items MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;
ALTER TABLE reviews MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE coupons MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE contacts MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE promotions MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE banners MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE conversations MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;
ALTER TABLE messages MODIFY id INT(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

-- 
-- HOÀN TẤT
-- 
SELECT '========================================' AS '';
SELECT 'Database setup completed!' AS status;
SELECT 'New features:' AS '';
SELECT '  - product_images: Gallery nhiều ảnh/sản phẩm' AS '';
SELECT '  - product_variants: RAM / ROM / màu / SKU theo phiên bản' AS '';
SELECT '========================================' AS '';
SELECT 'Admin Account:' AS '';
SELECT 'Email: adminanhtrai@gmail.com' AS '';
SELECT 'Password: admin123' AS '';
SELECT '========================================' AS '';
