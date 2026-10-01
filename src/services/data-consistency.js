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

    const result = {
        contacts_backfilled: Number(contacts.affectedRows || 0),
        product_stocks_synced: Number(products.affectedRows || 0)
    };
    if (result.contacts_backfilled || result.product_stocks_synced) {
        logger.info('business_data_repaired', result);
    }
    return result;
}

module.exports = { repairBusinessData };
