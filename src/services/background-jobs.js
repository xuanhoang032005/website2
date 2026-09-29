const pool = require('../config/database');
const mail = require('../config/mail');
const queue = require('./job-queue');

queue.register('order_email', async ({ orderId, userId }) => {
    const [[orders], [users], [items]] = await Promise.all([
        pool.query('SELECT * FROM orders WHERE id = ?', [orderId]),
        pool.query('SELECT id, full_name, email FROM users WHERE id = ?', [userId]),
        pool.query(`SELECT oi.*, p.name, v.ram, v.storage, v.color FROM order_items oi JOIN products p ON p.id = oi.product_id LEFT JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = ?`, [orderId])
    ]);
    if (orders[0] && users[0]) await mail.sendOrderEmail(orders[0], users[0], items);
});

queue.register('password_reset_email', payload => mail.sendPasswordResetOTP(payload.email, payload.otp, payload.expiresIn));
queue.register('welcome_email', payload => mail.sendWelcomeEmail(payload.user));
queue.register('image_cleanup', async ({ urls }) => {
    const storage = require('./cloud-storage');
    return storage.destroyCloudinaryUrlsNow(urls);
});
queue.register('ai_request', async ({ runStoreAssistant, ...payload }) => {
    const { runStoreAssistant: run } = require('./store-ai');
    return run(payload);
});

module.exports = queue;
