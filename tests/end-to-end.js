require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const databaseName = `ats_e2e_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
if (!/^ats_e2e_\d+_[a-f0-9]{6}$/.test(databaseName)) throw new Error('Unsafe E2E database name.');
process.env.DB_NAME = databaseName;
process.env.E2E_DISABLE_EMAILS = '1';
process.env.NODE_ENV = 'test';

const connectionOptions = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    charset: 'utf8mb4',
    multipleStatements: true
};

class CookieJar {
    constructor() { this.values = new Map(); }

    absorb(response) {
        const headers = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean);
        for (const header of headers) {
            const first = header.split(';', 1)[0];
            const index = first.indexOf('=');
            if (index >= 0) this.values.set(first.slice(0, index), first.slice(index + 1));
        }
    }

    header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; '); }
}

async function request(baseUrl, jar, method, path, body) {
    const response = await fetch(baseUrl + path, {
        method,
        headers: {
            ...(jar?.header() ? { Cookie: jar.header() } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    jar?.absorb(response);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    return { status: response.status, data };
}

async function listen(app) {
    const http = require('node:http');
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for the expected E2E state.');
}

async function expectStatus(result, expected, label) {
    assert.equal(result.status, expected, `${label}: ${JSON.stringify(result.data)}`);
    return result.data;
}

async function main() {
    const rootConnection = await mysql.createConnection(connectionOptions);
    let pool;
    let server;
    let secondServer;
    let customerJar;
    let adminJar;
    let customerId;
    let adminId;
    let testEmail;
    let customerPassword;
    let product;
    let originalProductStock;
    let originalVariantStock;
    const createdOrderIds = [];
    const createdQueueIds = [];

    try {
        await rootConnection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        const schema = await fs.readFile(require('node:path').join(__dirname, '..', 'database', 'anhtraistore.sql'), 'utf8');
        await rootConnection.query(`USE \`${databaseName}\``);
        await rootConnection.query(schema);

        const { migrate } = require('../src/config/migrate');
        await migrate();
        pool = require('../src/config/database');
        const { repairBusinessData } = require('../src/services/data-consistency');
        await repairBusinessData(pool);

        const [[productRow]] = await pool.query(
            `SELECT p.id, p.name, p.stock AS product_stock, v.id AS variant_id,
                    v.stock AS variant_stock, v.price
             FROM products p JOIN product_variants v ON v.product_id = p.id
             WHERE v.is_active = 1 AND v.stock > 3
             ORDER BY v.stock DESC, p.id DESC
             LIMIT 1`
        );
        if (!productRow) throw new Error('E2E fixture product/version is unavailable.');
        product = productRow;
        originalProductStock = Number(product.product_stock);
        originalVariantStock = Number(product.variant_stock);

        testEmail = `e2e-${crypto.randomUUID()}@example.invalid`;
        customerPassword = 'E2e-Test-Password-93!';
        const adminPassword = `E2e-Admin-${crypto.randomUUID()}!`;
        const [[adminRow]] = await pool.query('SELECT id FROM users WHERE role = \'admin\' ORDER BY id LIMIT 1');
        if (!adminRow) throw new Error('E2E seed admin is unavailable.');
        adminId = Number(adminRow.id);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(adminPassword, 10), adminId]);

        const { createApp } = require('../src/app');
        const queue = require('../src/services/job-queue');
        queue.configure(pool);
        queue.register('e2e_persisted_job', async payload => ({ echoed: payload.value }));
        queue.start({ pollIntervalMs: 25 });

        const [[adminUser]] = await pool.query('SELECT * FROM users WHERE id = ?', [adminId]);
        const { server: firstServer, baseUrl } = await listen(createApp().app);
        server = firstServer;

        const customer = new CookieJar();
        customerJar = customer;
        await expectStatus(await request(baseUrl, customer, 'GET', '/api/auth/me'), 200, 'csrf bootstrap');
        expectStatus(await request(baseUrl, customer, 'POST', '/api/auth/register', {
            full_name: 'E2E Customer', email: testEmail, phone: '0900000000', password: customerPassword
        }), 200, 'customer registration');
        const [[customerUser]] = await pool.query('SELECT * FROM users WHERE email = ?', [testEmail]);
        customerId = Number(customerUser.id);
        await expectStatus(await request(baseUrl, customer, 'POST', '/api/auth/login', {
            email: customerUser.email, password: customerPassword
        }), 200, 'customer login');
        await expectStatus(await request(baseUrl, customer, 'GET', '/api/auth/me'), 200, 'customer identity');

        const customerSid = customer.values.get('ats.sid');
        assert.ok(customerSid, 'login should issue a session cookie');
        await closeServer(server);
        server = null;
        const reopened = await listen(createApp().app);
        secondServer = reopened.server;
        const afterRestart = await request(reopened.baseUrl, customer, 'GET', '/api/auth/me');
        assert.equal(afterRestart.status, 200);
        assert.equal(Number(afterRestart.data.user.id), customerId, 'MySQL session should survive app restart');

        const cartAdded = await request(reopened.baseUrl, customer, 'POST', '/api/cart/add', {
            product_id: product.id, variant_id: product.variant_id, qty: 1
        });
        expectStatus(cartAdded, 200, 'add item to cart');
        const cart = await request(reopened.baseUrl, customer, 'GET', '/api/cart');
        expectStatus(cart, 200, 'read cart');
        const cartItem = cart.data.items.find(item => Number(item.product_id) === Number(product.id));
        assert.ok(cartItem, 'cart should contain the E2E product');

        const shipping = {
            shipping_name: 'E2E Customer', shipping_phone: '0900000000',
            shipping_address: '123 Test Street, Ho Chi Minh City'
        };
        const cod = await request(reopened.baseUrl, customer, 'POST', '/api/orders', {
            ...shipping, payment_method: 'cod', shipping_method: 'standard', item_ids: [cartItem.id]
        });
        expectStatus(cod, 200, 'COD checkout');
        createdOrderIds.push(Number(cod.data.order_id));
        assert.equal(cod.data.status, 'pending');
        assert.ok(Array.isArray(cod.data.email_job_ids));

        const adminCookies = new CookieJar();
        adminJar = adminCookies;
        await expectStatus(await request(reopened.baseUrl, adminCookies, 'GET', '/api/auth/me'), 200, 'admin csrf bootstrap');
        await expectStatus(await request(reopened.baseUrl, adminCookies, 'POST', '/api/auth/login', {
            email: adminUser.email, password: adminPassword
        }), 200, 'admin login');
        for (const status of ['confirmed', 'shipping', 'delivered']) {
            expectStatus(await request(reopened.baseUrl, adminCookies, 'PUT', `/admin/orders/${cod.data.order_id}/status`, {
                status,
                ...(status === 'shipping' ? { tracking_carrier: 'E2E Express', tracking_number: 'E2E-TRACK-001' } : {})
            }), 200, `admin order transition to ${status}`);
        }

        const orderDetail = await request(reopened.baseUrl, customer, 'GET', `/api/orders/${cod.data.order_id}`);
        expectStatus(orderDetail, 200, 'read delivered order');
        assert.equal(orderDetail.data.order.status, 'delivered');
        assert.equal(orderDetail.data.order.tracking_number, 'E2E-TRACK-001');
        assert.ok(Array.isArray(orderDetail.data.status_history), `order detail keys: ${Object.keys(orderDetail.data).join(', ')}`);
        assert.ok(orderDetail.data.status_history.length >= 4);
        const orderItemId = Number(orderDetail.data.items[0].id);

        expectStatus(await request(reopened.baseUrl, customer, 'POST', '/api/review', {
            product_id: product.id, rating: 5, comment: 'E2E delivered product review'
        }), 200, 'submit delivered-buyer review');
        assert.equal((await request(reopened.baseUrl, customer, 'POST', '/api/review', {
            product_id: product.id, rating: 4, comment: 'Duplicate E2E review'
        })).status, 400, 'second review must be rejected');

        const serviceRequest = await request(reopened.baseUrl, customer, 'POST', '/api/service-requests', {
            order_item_id: orderItemId, request_type: 'warranty', reason: 'E2E warranty check', description: 'Test warranty workflow'
        });
        expectStatus(serviceRequest, 201, 'submit warranty request');
        const adminRequests = await request(reopened.baseUrl, adminCookies, 'GET', '/api/service-requests/admin/list');
        expectStatus(adminRequests, 200, 'admin list warranty requests');
        assert.ok(adminRequests.data.requests.some(row => Number(row.id) === Number(serviceRequest.data.id)));
        for (const status of ['reviewing', 'approved', 'resolved']) {
            expectStatus(await request(reopened.baseUrl, adminCookies, 'PUT', `/api/service-requests/admin/${serviceRequest.data.id}`, {
                status, admin_note: `E2E ${status}`
            }), 200, `warranty transition to ${status}`);
        }
        const myRequests = await request(reopened.baseUrl, customer, 'GET', '/api/service-requests/mine');
        assert.equal(myRequests.data.requests.find(row => Number(row.id) === Number(serviceRequest.data.id)).status, 'resolved');

        const onlineCart = await request(reopened.baseUrl, customer, 'POST', '/api/cart/add', {
            product_id: product.id, variant_id: product.variant_id, qty: 1
        });
        expectStatus(onlineCart, 200, 'add simulated-payment item');
        const onlineCartItems = await request(reopened.baseUrl, customer, 'GET', '/api/cart');
        const onlineItem = onlineCartItems.data.items.find(item => Number(item.product_id) === Number(product.id));
        const initiated = await request(reopened.baseUrl, customer, 'POST', '/api/orders/initiate', {
            ...shipping, payment_method: 'momo', shipping_method: 'standard', item_ids: [onlineItem.id]
        });
        expectStatus(initiated, 200, 'initiate simulated MoMo');
        createdOrderIds.push(Number(initiated.data.order_id));
        assert.equal(initiated.data.simulated, true);
        const paymentState = await request(reopened.baseUrl, customer, 'GET', `/api/orders/${initiated.data.order_id}/check-payment`);
        assert.equal(paymentState.data.simulated, true);
        assert.equal(paymentState.data.paid, true);
        expectStatus(await request(reopened.baseUrl, customer, 'POST', `/api/orders/${initiated.data.order_id}/complete`, {}), 200, 'confirm simulated payment');
        expectStatus(await request(reopened.baseUrl, adminCookies, 'PUT', `/admin/orders/${initiated.data.order_id}/status`, {
            status: 'cancelled', status_note: 'E2E stock restoration'
        }), 200, 'cancel confirmed simulated order');

        const contact = await request(reopened.baseUrl, customer, 'POST', '/api/contact', {
            full_name: 'E2E Customer', email: testEmail, phone: '0900000000',
            subject: 'E2E support', message: 'Test support conversation creation'
        });
        expectStatus(contact, 200, 'submit contact and create support conversation');
        const conversations = await request(reopened.baseUrl, customer, 'GET', '/api/messages/conversations');
        expectStatus(conversations, 200, 'list support conversations');
        const conversation = conversations.data.conversations[0];
        assert.ok(conversation);
        expectStatus(await request(reopened.baseUrl, customer, 'POST', `/api/messages/${conversation.id}`, { content: 'E2E follow-up message' }), 200, 'send support message');
        const adminConversation = await request(reopened.baseUrl, adminCookies, 'GET', '/api/messages/admin/conversations');
        expectStatus(adminConversation, 200, 'admin support inbox');

        const { createRateLimiter } = require('../src/middleware/rate-limit');
        const rateNamespace = `e2e-${crypto.randomUUID()}`;
        const limited = createRateLimiter({ namespace: rateNamespace, windowMs: 60000, max: 1 });
        const req = { ip: '127.0.0.254', socket: {} };
        const res = () => ({
            headers: {}, statusCode: 200,
            setHeader(name, value) { this.headers[name] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; }
        });
        await new Promise((resolve, reject) => limited(req, res(), error => error ? reject(error) : resolve()));
        const limitedResponse = res();
        limited(req, limitedResponse, error => { if (error) throw error; });
        await new Promise(resolve => setTimeout(resolve, 25));
        assert.equal(limitedResponse.statusCode, 429, 'persisted rate-limit bucket should block over-limit request');
        await pool.query('DELETE FROM rate_limit_buckets WHERE bucket_key LIKE ?', [`${rateNamespace}:%`]);

        const emailJobs = await Promise.all(cod.data.email_job_ids.map(jobId => waitFor(async () => {
            const job = await queue.get(jobId);
            return job?.status === 'completed' ? job : null;
        })));
        assert.equal(emailJobs.length, 2);
        await queue.stop();
        const queueId = await queue.enqueue('e2e_persisted_job', { value: 'durable' }, { ownerKey: customerSid });
        createdQueueIds.push(queueId);
        queue.start({ pollIntervalMs: 25 });
        const completedJob = await waitFor(async () => {
            const job = await queue.get(queueId);
            return job?.status === 'completed' ? job : null;
        });
        assert.deepEqual(completedJob.result, { echoed: 'durable' });

        await expectStatus(await request(reopened.baseUrl, customer, 'POST', '/api/auth/logout', {}), 200, 'customer logout');
        await expectStatus(await request(reopened.baseUrl, adminCookies, 'POST', '/api/auth/logout', {}), 200, 'admin logout');

        console.log('E2E passed: registration, durable session, cart, COD, simulated payment, tracking, review, warranty, support chat, rate limit and queue restart.');
    } finally {
        await closeServer(secondServer).catch(() => {});
        await closeServer(server).catch(() => {});
        if (pool) {
            if (customerId) {
                const [orders] = await pool.query('SELECT id FROM orders WHERE user_id = ?', [customerId]).catch(() => [[]]);
                const orderIds = [...new Set([...createdOrderIds, ...orders.map(order => Number(order.id))])];
                if (orderIds.length) {
                    await pool.query('UPDATE product_variants SET stock = ? WHERE id = ?', [originalVariantStock, product.variant_id]).catch(() => {});
                    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [originalProductStock, product.id]).catch(() => {});
                    await pool.query("DELETE FROM inventory_movements WHERE reference_type = 'order' AND reference_id IN (?)", [orderIds]).catch(() => {});
                    await pool.query('DELETE FROM service_requests WHERE user_id = ?', [customerId]).catch(() => {});
                    await pool.query('DELETE FROM orders WHERE id IN (?)', [orderIds]).catch(() => {});
                }
                await pool.query('DELETE FROM reviews WHERE user_id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM cart WHERE user_id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM wishlists WHERE user_id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM conversations WHERE user_id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM contacts WHERE user_id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM user_coupons WHERE user_id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM users WHERE id = ?', [customerId]).catch(() => {});
                await pool.query('DELETE FROM sessions WHERE data LIKE ?', [`%"user_id":${customerId}%`]).catch(() => {});
            }
            if (adminId) {
                const adminPassword = await bcrypt.hash('admin123', 10).catch(() => null);
                if (adminPassword) await pool.query('UPDATE users SET password = ? WHERE id = ?', [adminPassword, adminId]).catch(() => {});
            }
            if (createdQueueIds.length) await pool.query('DELETE FROM background_jobs WHERE id IN (?)', [createdQueueIds]).catch(() => {});
            if (customerId) {
                await pool.query(
                    `DELETE FROM background_jobs WHERE type IN ('order_email', 'admin_order_email', 'contact_email')
                     AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.userId')) = ?`,
                    [String(customerId)]
                ).catch(() => {});
            }
            await pool.end().catch(() => {});
        }
        const queue = require('../src/services/job-queue');
        await queue.stop().catch(() => {});
        await rootConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await rootConnection.end().catch(() => {});
        delete process.env.E2E_DISABLE_EMAILS;
    }
}

main().catch(error => {
    console.error('E2E failed:', error);
    process.exitCode = 1;
});
