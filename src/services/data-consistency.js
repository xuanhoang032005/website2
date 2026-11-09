const logger = require('../config/logger');

async function repairBusinessData(db) {
    const [contacts] = await db.query(
        `UPDATE contacts
         SET subject = 'Liên hệ từ website'
         WHERE subject IS NULL OR TRIM(subject) = ''`
    );
    const [products] = await db.query(
        `UPDATE products p
         JOIN (
             SELECT product_id, COALESCE(SUM(CASE WHEN is_active = 1 THEN stock ELSE 0 END), 0) AS variant_stock
             FROM product_variants
             GROUP BY product_id
         ) totals ON totals.product_id = p.id
         SET p.stock = totals.variant_stock
         WHERE p.stock <> totals.variant_stock`
    );
    const [variantOpening] = await db.query(
        `INSERT INTO inventory_movements
            (product_id, variant_id, product_name, variant_label, movement_type,
             quantity_change, stock_before, stock_after, reference_type, reference_id, note)
         SELECT p.id, v.id, p.name, NULLIF(CONCAT_WS(' / ', v.ram, v.storage, v.color), ''),
                'opening', v.stock, 0, v.stock, 'product', p.id, 'Tồn kho ban đầu từ dữ liệu hiện có'
         FROM products p JOIN product_variants v ON v.product_id = p.id
         WHERE v.stock > 0
           AND NOT EXISTS (
               SELECT 1 FROM inventory_movements m
               WHERE m.product_id = p.id AND m.variant_id = v.id
                 AND m.movement_type = 'opening' AND m.reference_type = 'product'
                 AND m.reference_id = p.id
           )`
    );
    const [productOpening] = await db.query(
        `INSERT INTO inventory_movements
            (product_id, product_name, movement_type, quantity_change,
             stock_before, stock_after, reference_type, reference_id, note)
         SELECT p.id, p.name, 'opening', p.stock, 0, p.stock, 'product', p.id,
                'Tồn kho ban đầu từ dữ liệu hiện có'
         FROM products p
         WHERE p.stock > 0
           AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
           AND NOT EXISTS (
               SELECT 1 FROM inventory_movements m
               WHERE m.product_id = p.id AND m.variant_id IS NULL
                 AND m.movement_type = 'opening' AND m.reference_type = 'product'
                 AND m.reference_id = p.id
           )`
    );

    const result = {
        contacts_backfilled: Number(contacts.affectedRows || 0),
        product_stocks_synced: Number(products.affectedRows || 0),
        inventory_opening_rows_added: Number(variantOpening.affectedRows || 0) + Number(productOpening.affectedRows || 0)
    };
    if (result.contacts_backfilled || result.product_stocks_synced || result.inventory_opening_rows_added) {
        logger.info('business_data_repaired', result);
    }
    return result;
}

module.exports = { repairBusinessData };
