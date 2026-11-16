const pool = require('../config/database');

async function dashboardStats(db = pool) {
    const [[products], [orders], [users], [revenue], [pending], [reviews], [contacts], [lowStock], [thisMonth], [lastMonth]] = await Promise.all([
        db.query('SELECT COUNT(*) AS c FROM products'),
        db.query('SELECT COUNT(*) AS c FROM orders'),
        db.query("SELECT COUNT(*) AS c FROM users WHERE role='customer'"),
        db.query("SELECT SUM(total_price) AS c FROM orders WHERE status='delivered'"),
        db.query("SELECT COUNT(*) AS c FROM orders WHERE status='pending'"),
        db.query("SELECT COUNT(*) AS c FROM reviews WHERE entry_type = 'review'"),
        db.query('SELECT COUNT(*) AS c FROM contacts WHERE is_read=0'),
        db.query('SELECT COUNT(*) AS c FROM products WHERE stock < 20'),
        db.query(`SELECT COALESCE(SUM(total_price), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE status='delivered' AND YEAR(created_at)=YEAR(CURRENT_DATE) AND MONTH(created_at)=MONTH(CURRENT_DATE)`),
        db.query(`SELECT COALESCE(SUM(total_price), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE status='delivered' AND YEAR(created_at)=YEAR(CURRENT_DATE - INTERVAL 1 MONTH) AND MONTH(created_at)=MONTH(CURRENT_DATE - INTERVAL 1 MONTH)`)
    ]);
    const thisRevenue = Number(thisMonth[0].revenue) || 0;
    const lastRevenue = Number(lastMonth[0].revenue) || 0;
    return {
        total_products: products[0].c, total_orders: orders[0].c, total_users: users[0].c,
        total_revenue: revenue[0].c || 0, pending_orders: pending[0].c, total_reviews: reviews[0].c,
        unread_contacts: contacts[0].c, low_stock: lowStock[0].c, this_month_revenue: thisRevenue,
        last_month_revenue: lastRevenue,
        revenue_change: lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue * 100).toFixed(1) : 0
    };
}

async function listUsers(db = pool) {
    const [users] = await db.query(
        'SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC, id DESC'
    );
    return users;
}

async function createUser(user, db = pool) {
    const [result] = await db.query(
        'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        [user.full_name, user.email, user.phone, user.password, user.role]
    );
    return result.insertId;
}

async function lockAdmins(db) {
    const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id FOR UPDATE");
    return admins;
}

async function lockUser(id, db) {
    const [users] = await db.query(
        'SELECT id, full_name, email, phone, role FROM users WHERE id = ? FOR UPDATE', [id]
    );
    return users[0];
}

async function updateUser(id, user, db) {
    const params = [user.full_name, user.email, user.phone, user.role];
    const passwordSql = user.password ? ', password = ?' : '';
    if (user.password) params.push(user.password);
    params.push(id);
    await db.query(`UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?${passwordSql} WHERE id = ?`, params);
}

async function hasUserHistory(id, db) {
    const [[history]] = await db.query(
        `SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = ?) AS orders,
                EXISTS(SELECT 1 FROM reviews WHERE user_id = ?) AS reviews,
                EXISTS(SELECT 1 FROM service_requests WHERE user_id = ?) AS service_requests`,
        [id, id, id]
    );
    return Boolean(Number(history.orders) || Number(history.reviews) || Number(history.service_requests));
}

async function deleteUser(id, db) {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
}

async function revokeUserSessions(id, exceptSid, db) {
    // Passport stores the account ID separately until the first authenticated request.
    await db.query(
        `DELETE FROM sessions
         WHERE (JSON_UNQUOTE(JSON_EXTRACT(data, '$.user_id')) = ?
             OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.passport.user')) = ?)
           AND sid <> ?`,
        [String(id), String(id), exceptSid || '']
    );
}

module.exports = {
    dashboardStats, listUsers, createUser, lockAdmins, lockUser, updateUser,
    hasUserHistory, deleteUser, revokeUserSessions
};
