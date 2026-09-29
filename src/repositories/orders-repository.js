const pool = require('../config/database');

async function listByUser(userId, db = pool) {
    const [orders] = await db.query(
        `SELECT o.*,
         (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
         (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS total_items
         FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`,
        [userId]
    );
    return orders;
}

async function findOwnedWithItems(orderId, userId, db = pool) {
    const [orders] = await db.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (!orders.length) return null;
    const [items] = await db.query(
        `SELECT oi.*, p.name, p.thumbnail,
                COALESCE(v.ram, p.ram) AS ram, COALESCE(v.storage, p.storage) AS storage,
                v.color, v.sku
         FROM order_items oi JOIN products p ON oi.product_id = p.id
         LEFT JOIN product_variants v ON oi.variant_id = v.id
         WHERE oi.order_id = ?`,
        [orderId]
    );
    return { order: orders[0], items };
}

module.exports = { listByUser, findOwnedWithItems };
