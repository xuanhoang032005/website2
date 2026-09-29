const pool = require('../config/database');

async function dashboardStats(db = pool) {
    const [[products], [orders], [users], [revenue], [pending], [reviews], [contacts], [lowStock], [thisMonth], [lastMonth]] = await Promise.all([
        db.query('SELECT COUNT(*) AS c FROM products'),
        db.query('SELECT COUNT(*) AS c FROM orders'),
        db.query("SELECT COUNT(*) AS c FROM users WHERE role='customer'"),
        db.query("SELECT SUM(total_price) AS c FROM orders WHERE status='delivered'"),
        db.query("SELECT COUNT(*) AS c FROM orders WHERE status='pending'"),
        db.query('SELECT COUNT(*) AS c FROM reviews'),
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

module.exports = { dashboardStats };
