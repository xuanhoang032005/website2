async function recordOrderStatus(db, { orderId, status, note = null, changedBy = null }) {
    await db.query(
        `INSERT INTO order_status_history (order_id, status, note, changed_by)
         VALUES (?, ?, ?, ?)`,
        [orderId, status, note || null, changedBy || null]
    );
}

async function getOrderStatusHistory(db, orderId) {
    const [history] = await db.query(
        `SELECT h.id, h.status, h.note, h.created_at, u.full_name AS changed_by_name
         FROM order_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.order_id = ?
         ORDER BY h.created_at ASC, h.id ASC`,
        [orderId]
    );
    return history;
}

module.exports = { recordOrderStatus, getOrderStatusHistory };
