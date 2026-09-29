-- AnhTraiStore
-- Bổ sung cột product_images.alt_text cho database cũ.
--
-- Cách dùng:
--   1. Chọn đúng database của dự án (DB_NAME trong file .env).
--   2. Chạy toàn bộ file này bằng phpMyAdmin, MySQL Workbench hoặc mysql CLI.
--
-- Migration có thể chạy lại nhiều lần mà không làm mất dữ liệu.

SET @database_name = DATABASE();

SET @product_images_table_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'product_images'
);

SET @alt_text_column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'product_images'
      AND COLUMN_NAME = 'alt_text'
);

SET @migration_sql = IF(
    @product_images_table_exists = 0,
    'SELECT ''Không tìm thấy bảng product_images. Hãy chọn đúng database trước khi chạy migration.'' AS warning',
    IF(
        @alt_text_column_exists = 0,
        'ALTER TABLE product_images ADD COLUMN alt_text VARCHAR(255) NULL DEFAULT NULL AFTER image_url',
        'SELECT ''Cột product_images.alt_text đã tồn tại, không cần thay đổi.'' AS message'
    )
);

PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'product_images'
  AND COLUMN_NAME = 'alt_text';
