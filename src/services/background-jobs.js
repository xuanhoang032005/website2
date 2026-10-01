const pool = require('../config/database');
const mail = require('../config/mail');
const queue = require('./job-queue');

async function loadOrderEmailData(orderId, userId) {
    const [[orders], [users], [items]] = await Promise.all([
        pool.query('SELECT * FROM orders WHERE id = ?', [orderId]),
        pool.query('SELECT id, full_name, email FROM users WHERE id = ?', [userId]),
        pool.query(`SELECT oi.*, p.name, v.ram, v.storage, v.color FROM order_items oi JOIN products p ON p.id = oi.product_id LEFT JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = ?`, [orderId])
    ]);
    if (!orders[0] || !users[0]) {
        throw new Error(`Không tìm thấy dữ liệu email cho đơn hàng ${orderId}.`);
    }
    return { order: orders[0], user: users[0], items };
}

queue.register('order_email', async payload => {
    const data = await loadOrderEmailData(payload.orderId, payload.userId);
    await mail.sendOrderEmail(data.order, data.user, data.items);
});

queue.register('admin_order_email', async payload => {
    const data = await loadOrderEmailData(payload.orderId, payload.userId);
    await mail.sendAdminOrderNotification(data.order, data.user, data.items);
});

queue.register('password_reset_email', payload => mail.sendPasswordResetOTP(payload.email, payload.otp, payload.expiresIn));
queue.register('welcome_email', payload => mail.sendWelcomeEmail(payload.user));
queue.register('contact_email', payload => mail.sendEmail(payload));
queue.register('image_cleanup', async ({ urls }) => {
    const storage = require('./cloud-storage');
    return storage.destroyCloudinaryUrlsNow(urls);
});
queue.register('ai_request', async ({ runStoreAssistant, ...payload }) => {
    const { runStoreAssistant: run } = require('./store-ai');
    return run(payload);
});

module.exports = queue;
