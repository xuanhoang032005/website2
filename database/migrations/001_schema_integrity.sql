-- Safe, repeatable upgrade for databases created before schema constraints.

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'user_id'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE contacts ADD COLUMN user_id INT NULL AFTER id',
    'SELECT ''contacts.user_id already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart' AND COLUMN_NAME = 'variant_identity'
);
SET @ddl = IF(@ddl_exists = 0,
    'ALTER TABLE cart ADD COLUMN variant_identity INT GENERATED ALWAYS AS (COALESCE(variant_id, 0)) STORED AFTER variant_id',
    'SELECT ''cart.variant_identity already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_payment_code');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE orders ADD UNIQUE KEY uq_orders_payment_code (payment_code)', 'SELECT ''uq_orders_payment_code already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart' AND INDEX_NAME = 'uq_cart_user_product_variant');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE cart ADD UNIQUE KEY uq_cart_user_product_variant (user_id, product_id, variant_identity)', 'SELECT ''uq_cart_user_product_variant already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'uq_reviews_user_product');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE reviews ADD UNIQUE KEY uq_reviews_user_product (user_id, product_id)', 'SELECT ''uq_reviews_user_product already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_user_created');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE orders ADD INDEX idx_orders_user_created (user_id, created_at)', 'SELECT ''idx_orders_user_created already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_status_created');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE orders ADD INDEX idx_orders_status_created (status, created_at)', 'SELECT ''idx_orders_status_created already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'idx_reviews_product_created');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE reviews ADD INDEX idx_reviews_product_created (product_id, created_at)', 'SELECT ''idx_reviews_product_created already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_coupons' AND INDEX_NAME = 'idx_user_coupons_order');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE user_coupons ADD INDEX idx_user_coupons_order (order_id)', 'SELECT ''idx_user_coupons_order already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND INDEX_NAME = 'idx_contacts_user_created');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE contacts ADD INDEX idx_contacts_user_created (user_id, created_at)', 'SELECT ''idx_contacts_user_created already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND INDEX_NAME = 'idx_conversations_user_activity');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE conversations ADD INDEX idx_conversations_user_activity (user_id, last_message_at)', 'SELECT ''idx_conversations_user_activity already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND INDEX_NAME = 'idx_conversations_status_activity');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE conversations ADD INDEX idx_conversations_status_activity (status, last_message_at)', 'SELECT ''idx_conversations_status_activity already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_messages_conversation_created');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE messages ADD INDEX idx_messages_conversation_created (conversation_id, created_at, id)', 'SELECT ''idx_messages_conversation_created already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND CONSTRAINT_NAME = 'fk_contacts_user');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE contacts ADD CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL', 'SELECT ''fk_contacts_user already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_coupons' AND CONSTRAINT_NAME = 'fk_user_coupons_order');
SET @ddl = IF(@ddl_exists = 0, 'ALTER TABLE user_coupons ADD CONSTRAINT fk_user_coupons_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL', 'SELECT ''fk_user_coupons_order already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
