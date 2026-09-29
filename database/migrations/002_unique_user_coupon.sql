-- This migration intentionally fails when legacy duplicate redemptions exist.
-- Resolve those rows explicitly before retrying; the runner will not mark a
-- failed migration as applied.

SET @ddl_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_coupons'
      AND INDEX_NAME = 'uq_user_coupons_user_coupon'
);
SET @ddl = IF(
    @ddl_exists = 0,
    'ALTER TABLE user_coupons ADD UNIQUE KEY uq_user_coupons_user_coupon (user_id, coupon_id)',
    'SELECT ''uq_user_coupons_user_coupon already exists'' AS message'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
