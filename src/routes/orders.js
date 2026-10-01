const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const queue = require('../services/job-queue');
const { syncProductStock } = require('../core/product-variants');
const ordersController = require('../controllers/orders-controller');

const ONLINE_PAYMENT_METHODS = ['vnpay', 'momo'];
const VIP_MIN_DELIVERED_SPEND = 30000000;
const SHIPPING_METHODS = new Set(['standard', 'express']);

function normalizeLocation(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function deliveryEstimate(address, shippingMethod = 'standard', now = new Date()) {
    const location = normalizeLocation(address);
    const isHcm = location.includes('ho chi minh') || location.includes('tp.hcm') || location.includes('tphcm');
    const isInnerHcm = isHcm && ['quan 1', 'quan 3', 'quan 4', 'quan 5', 'quan 10', 'binh thanh', 'phu nhuan']
        .some(district => location.includes(district));
    const isNearHcm = ['binh duong', 'dong nai', 'long an', 'tay ninh', 'ba ria'].some(province => location.includes(province));

    let minDays = isInnerHcm ? 1 : isHcm ? 2 : isNearHcm ? 2 : 3;
    let maxDays = isInnerHcm ? 2 : isHcm ? 3 : isNearHcm ? 4 : 6;
    if (shippingMethod === 'express') {
        minDays = isInnerHcm ? 1 : 1;
        maxDays = isInnerHcm ? 1 : isHcm || isNearHcm ? 2 : 3;
    }

    const dateAfter = days => {
        const date = new Date(now);
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    };

    return {
        minDays,
        maxDays,
        from: dateAfter(minDays),
        to: dateAfter(maxDays)
    };
}

function shippingFeeFor(method) {
    return method === 'express' ? 50000 : 30000;
}

function toCustomerOrder(order) {
    const { cart_item_ids, ...customerOrder } = order;
    return customerOrder;
}

function validateShippingInput({ shipping_name, shipping_phone, shipping_address, notes }) {
    const name = typeof shipping_name === 'string' ? shipping_name.trim() : '';
    const phone = typeof shipping_phone === 'string' ? shipping_phone.trim() : '';
    const address = typeof shipping_address === 'string' ? shipping_address.trim() : '';
    const note = notes == null ? '' : String(notes).trim();
    if (!name || !phone || !address) return 'Vui lòng nhập đầy đủ thông tin giao hàng!';
    if (name.length > 100 || phone.length > 15 || address.length > 1000 || note.length > 2000) return 'Thông tin giao hàng vượt quá độ dài cho phép!';
    if (/[<>]/.test(name + phone + address + note) || !/^[0-9+().\s-]+$/.test(phone)) return 'Thông tin giao hàng chứa ký tự không hợp lệ!';
    return null;
}

function parseItemIds(itemIds) {
    if (!Array.isArray(itemIds)) return [];
    return [...new Set(itemIds
        .map(id => Number.parseInt(id, 10))
        .filter(id => Number.isInteger(id) && id > 0))];
}

async function getCheckoutItems(db, userId, itemIds, buyNow) {
    let items;

    if (itemIds.length > 0) {
        [items] = await db.query(
            `SELECT c.id AS cart_id, c.product_id, c.variant_id, v.id AS active_variant_id, c.quantity,
                    COALESCE(v.price, p.price) AS price, COALESCE(v.stock, p.stock) AS stock,
                    COALESCE(v.ram, p.ram) AS ram, COALESCE(v.storage, p.storage) AS storage,
                    v.color, p.name, p.category_id
             FROM cart c
             JOIN products p ON c.product_id = p.id
             LEFT JOIN product_variants v ON c.variant_id = v.id AND v.is_active = 1
             WHERE c.user_id = ? AND c.id IN (?)`,
            [userId, itemIds]
        );
    } else if (buyNow) {
        const [products] = buyNow.variant_id
            ? await db.query(
                `SELECT p.id AS product_id, p.name, p.category_id, v.id AS variant_id, v.id AS active_variant_id, v.price, v.stock,
                        v.ram, v.storage, v.color
                 FROM products p JOIN product_variants v ON v.product_id = p.id
                 WHERE p.id = ? AND v.id = ? AND v.is_active = 1`,
                [buyNow.product_id, buyNow.variant_id]
            )
            : await db.query(
                'SELECT id AS product_id, name, category_id, price, stock, ram, storage, NULL AS variant_id, NULL AS color FROM products WHERE id = ?',
                [buyNow.product_id]
            );
        items = products.map(product => ({ ...product, quantity: Number(buyNow.quantity), cart_id: 'buy_now' }));
    } else {
        [items] = await db.query(
            `SELECT c.id AS cart_id, c.product_id, c.variant_id, v.id AS active_variant_id, c.quantity,
                    COALESCE(v.price, p.price) AS price, COALESCE(v.stock, p.stock) AS stock,
                    COALESCE(v.ram, p.ram) AS ram, COALESCE(v.storage, p.storage) AS storage,
                    v.color, p.name, p.category_id
             FROM cart c
             JOIN products p ON c.product_id = p.id
             LEFT JOIN product_variants v ON c.variant_id = v.id AND v.is_active = 1
             WHERE c.user_id = ?`,
            [userId]
        );
    }

    if (items.length === 0) {
        const error = new Error('Giỏ hàng trống hoặc sản phẩm không hợp lệ!');
        error.status = 400;
        throw error;
    }

    for (const item of items) {
        if (item.variant_id && !item.active_variant_id) {
            const error = new Error(`Phiên bản của sản phẩm "${item.name}" đã ngừng bán!`);
            error.status = 400;
            throw error;
        }
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            const error = new Error(`Số lượng của sản phẩm "${item.name}" không hợp lệ!`);
            error.status = 400;
            throw error;
        }
        if (Number(item.stock) < quantity) {
            const error = new Error(`Sản phẩm "${item.name}" không đủ hàng!`);
            error.status = 400;
            throw error;
        }
        item.quantity = quantity;
        item.price = Number(item.price);
    }

    return items;
}

async function calculateCoupon(db, userId, code, subtotal, items = []) {
    if (!code) return { coupon: null, discount: 0 };

    const normalizedCode = String(code).trim().toUpperCase();
    const [rows] = await db.query(
        `SELECT * FROM coupons
         WHERE code = ? AND is_active = 1
           AND (start_date IS NULL OR start_date <= NOW())
           AND (expires_at IS NULL OR expires_at >= NOW())`,
        [normalizedCode]
    );

    const coupon = rows[0];
    if (!coupon) {
        const error = new Error('Mã giảm giá không tồn tại hoặc đã hết hạn!');
        error.status = 400;
        throw error;
    }
    if (coupon.usage_limit && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
        const error = new Error('Mã giảm giá đã hết lượt sử dụng!');
        error.status = 400;
        throw error;
    }
    if (subtotal < Number(coupon.min_order_value || 0)) {
        const error = new Error(`Đơn hàng chưa đạt giá trị tối thiểu để dùng mã ${normalizedCode}!`);
        error.status = 400;
        throw error;
    }

    const [used] = await db.query(
        'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? LIMIT 1',
        [userId, coupon.id]
    );
    if (used.length > 0) {
        const error = new Error('Bạn đã sử dụng mã giảm giá này!');
        error.status = 400;
        throw error;
    }

    if (normalizedCode === 'PHONE15' && (items.length === 0 || items.some(item => Number(item.category_id) !== 1))) {
        const error = new Error('Mã PHONE15 chỉ áp dụng cho sản phẩm thuộc danh mục Điện thoại!');
        error.status = 400;
        throw error;
    }

    if (normalizedCode === 'WELCOME10' || normalizedCode === 'NEWUSER') {
        const [orders] = await db.query(
            `SELECT id FROM orders
             WHERE user_id = ?
               AND (status IN ('confirmed', 'shipping', 'delivered')
                    OR (payment_method = 'cod' AND status = 'pending'))
             LIMIT 1`,
            [userId]
        );
        if (orders.length > 0) {
            const error = new Error('Mã này chỉ áp dụng cho đơn hàng đầu tiên!');
            error.status = 400;
            throw error;
        }
    }

    if (normalizedCode === 'VIP20') {
        const [vipRows] = await db.query(
            "SELECT COALESCE(SUM(total_price), 0) AS total FROM orders WHERE user_id = ? AND status = 'delivered'",
            [userId]
        );
        if (Number(vipRows[0]?.total || 0) < VIP_MIN_DELIVERED_SPEND) {
            const error = new Error('VIP20 dành cho khách đã có tổng đơn giao thành công từ 30 triệu!');
            error.status = 403;
            throw error;
        }
    }

    let discount = coupon.discount_type === 'percent'
        ? Math.round(subtotal * Number(coupon.discount_value) / 100)
        : Number(coupon.discount_value);
    if (coupon.max_discount) discount = Math.min(discount, Number(coupon.max_discount));
    discount = Math.max(0, Math.min(discount, subtotal));

    return { coupon, discount };
}

async function useCoupon(db, userId, coupon, orderId, discount) {
    if (!coupon || discount <= 0) return;

    const [used] = await db.query(
        'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? LIMIT 1',
        [userId, coupon.id]
    );
    if (used.length > 0) {
        const error = new Error('Bạn đã sử dụng mã giảm giá này!');
        error.status = 400;
        throw error;
    }

    const [updated] = await db.query(
        `UPDATE coupons SET used_count = used_count + 1
         WHERE id = ? AND (usage_limit IS NULL OR used_count < usage_limit)`,
        [coupon.id]
    );
    if (updated.affectedRows !== 1) {
        const error = new Error('Mã giảm giá đã hết lượt sử dụng!');
        error.status = 400;
        throw error;
    }
    await db.query(
        'INSERT INTO user_coupons (user_id, coupon_id, order_id, discount_amount) VALUES (?, ?, ?, ?)',
        [userId, coupon.id, orderId, discount]
    );
}

async function releaseCoupon(db, order) {
    if (!order.coupon_code) return;
    const [deleted] = await db.query('DELETE FROM user_coupons WHERE order_id = ?', [order.id]);
    if (deleted.affectedRows > 0) {
        await db.query(
            'UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = ?',
            [order.coupon_code]
        );
    }
}

async function decreaseStock(db, items) {
    for (const item of items) {
        const [updated] = item.variant_id
            ? await db.query(
                'UPDATE product_variants SET stock = stock - ? WHERE id = ? AND product_id = ? AND is_active = 1 AND stock >= ?',
                [item.quantity, item.variant_id, item.product_id, item.quantity]
            )
            : await db.query(
                'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
                [item.quantity, item.product_id, item.quantity]
            );
        if (updated.affectedRows !== 1) {
            const error = new Error(`Sản phẩm "${item.name || item.product_id}" không đủ hàng!`);
            error.status = 400;
            throw error;
        }
        if (item.variant_id) await syncProductStock(db, item.product_id);
    }
}

function sendConfirmationEmail(orderId, userId) {
    return {
        customerJobId: queue.enqueue('order_email', { orderId, userId }),
        adminJobId: queue.enqueue('admin_order_email', { orderId, userId })
    };
}

// Create order
router.post('/', async (req, res) => {
    let connection;
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { shipping_name, shipping_phone, shipping_address, notes, coupon_code, item_ids } = req.body;
        const paymentMethod = req.body.payment_method || 'cod';
        const shippingMethod = req.body.shipping_method || 'standard';
        const userId = req.session.user_id;

        const shippingError = validateShippingInput({ shipping_name, shipping_phone, shipping_address, notes });
        if (shippingError) return res.status(400).json({ error: shippingError });
        if (paymentMethod !== 'cod') {
            return res.status(400).json({ error: 'Thanh toán MoMo/VNPay phải dùng luồng thanh toán mô phỏng!' });
        }
        if (!SHIPPING_METHODS.has(shippingMethod)) {
            return res.status(400).json({ error: 'Hình thức giao hàng không hợp lệ!' });
        }

        const itemIds = parseItemIds(item_ids);
        const cartItems = await getCheckoutItems(pool, userId, itemIds, req.session.buyNow);
        const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const shippingFee = shippingFeeFor(shippingMethod);
        const delivery = deliveryEstimate(shipping_address, shippingMethod);
        const { coupon, discount } = await calculateCoupon(pool, userId, coupon_code, subtotal, cartItems);
        const finalTotal = subtotal + shippingFee - discount;
        const paymentCode = 'PS' + Date.now();

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orderResult] = await connection.query(
            `INSERT INTO orders (user_id, payment_code, total_price, shipping_fee, shipping_method, delivery_min_days, delivery_max_days, estimated_delivery_from, estimated_delivery_to, shipping_name, shipping_phone, shipping_address, notes, payment_method, status, discount_amount, coupon_code, cart_item_ids)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cod', 'pending', ?, ?, ?)`,
            [userId, paymentCode, finalTotal, shippingFee, shippingMethod, delivery.minDays, delivery.maxDays, delivery.from, delivery.to, shipping_name, shipping_phone, shipping_address,
                notes || '', discount, coupon ? coupon.code : null, itemIds.length > 0 ? itemIds.join(',') : null]
        );
        const orderId = orderResult.insertId;

        for (const item of cartItems) {
            await connection.query(
                'INSERT INTO order_items (order_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.product_id, item.variant_id || null, item.quantity, item.price]
            );
        }
        await decreaseStock(connection, cartItems);
        await useCoupon(connection, userId, coupon, orderId, discount);

        if (itemIds.length > 0) {
            await connection.query('DELETE FROM cart WHERE id IN (?) AND user_id = ?', [itemIds, userId]);
        } else if (!req.session.buyNow) {
            await connection.query('DELETE FROM cart WHERE user_id = ?', [userId]);
        }
        delete req.session.buyNow;

        await connection.commit();
        connection.release();
        connection = null;

        sendConfirmationEmail(orderId, userId);

        res.json({
            success: true,
            order_id: orderId,
            payment_code: paymentCode,
            subtotal,
            shipping_fee: shippingFee,
            shipping_method: shippingMethod,
            estimated_delivery_from: delivery.from,
            estimated_delivery_to: delivery.to,
            discount_amount: discount,
            coupon_code: coupon ? coupon.code : null,
            total: finalTotal,
            status: 'pending'
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Create order error:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Đã xảy ra lỗi!' });
    }
});

// Get user's orders
router.get('/', async (req, res, next) => {
    if (!req.session.user_id) return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
    try { return await ordersController.list(req, res); } catch (error) { return next(error); }
});
/*
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const [orders] = await pool.query(
            `SELECT o.*, 
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
             (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) as total_items
             FROM orders o 
             WHERE o.user_id = ? 
             ORDER BY o.created_at DESC`,
            [req.session.user_id]
        );

        res.json({ orders: orders.map(toCustomerOrder) });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});*/

// Get single order
router.get('/:id', async (req, res, next) => {
    if (!req.session.user_id) return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
    try { return await ordersController.detail(req, res); } catch (error) { return next(error); }
});
/*
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { id } = req.params;

        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [id, req.session.user_id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Đơn hàng không tồn tại!' });
        }

        const [items] = await pool.query(
            `SELECT oi.*, p.name, p.thumbnail,
                    COALESCE(v.ram, p.ram) AS ram, COALESCE(v.storage, p.storage) AS storage,
                    v.color, v.sku
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             LEFT JOIN product_variants v ON oi.variant_id = v.id
             WHERE oi.order_id = ?`,
            [id]
        );

        res.json({ order: toCustomerOrder(orders[0]), items });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});*/

// Cancel order
router.put('/:id/cancel', async (req, res) => {
    let connection;
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { id } = req.params;
        const { reason } = req.body;
        if (reason != null && String(reason).length > 255) {
            return res.status(400).json({ error: 'Lý do hủy không được vượt quá 255 ký tự!' });
        }
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
            [id, req.session.user_id]
        );
        if (orders.length === 0) {
            const error = new Error('Đơn hàng không tồn tại!');
            error.status = 404;
            throw error;
        }

        const order = orders[0];
        if (order.status !== 'pending') {
            const error = new Error('Chỉ có thể hủy đơn hàng đang chờ xác nhận!');
            error.status = 400;
            throw error;
        }

        await connection.query(
            'UPDATE orders SET status = ?, cancel_reason = ?, cancelled_at = NOW() WHERE id = ?',
            ['cancelled', reason || '', id]
        );

        // COD giữ hàng ngay khi đặt; đơn online pending chưa trừ kho.
        if (order.payment_method === 'cod') {
            const [orderItems] = await connection.query(
                'SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?',
                [id]
            );
            for (const item of orderItems) {
                if (item.variant_id) {
                    await connection.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [item.quantity, item.variant_id]);
                    await syncProductStock(connection, item.product_id);
                } else {
                    await connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
                }
            }

        }
        await releaseCoupon(connection, order);

        await connection.commit();
        connection.release();
        connection = null;
        res.json({ success: true, message: 'Đơn hàng đã được hủy thành công!' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Cancel order error:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Đã xảy ra lỗi!' });
    }
});

// Initiate order for online payment (MoMo/VNPay)
router.post('/initiate', async (req, res) => {
    let connection;
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { shipping_name, shipping_phone, shipping_address, payment_method, notes, coupon_code, item_ids } = req.body;
        const shippingMethod = req.body.shipping_method || 'standard';
        const userId = req.session.user_id;

        const shippingError = validateShippingInput({ shipping_name, shipping_phone, shipping_address, notes });
        if (shippingError) return res.status(400).json({ error: shippingError });
        if (!ONLINE_PAYMENT_METHODS.includes(payment_method)) {
            return res.status(400).json({ error: 'Phương thức thanh toán mô phỏng không hợp lệ!' });
        }
        if (!SHIPPING_METHODS.has(shippingMethod)) {
            return res.status(400).json({ error: 'Hình thức giao hàng không hợp lệ!' });
        }

        const itemIds = parseItemIds(item_ids);
        const cartItems = await getCheckoutItems(pool, userId, itemIds, req.session.buyNow);
        const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const shippingFee = shippingFeeFor(shippingMethod);
        const delivery = deliveryEstimate(shipping_address, shippingMethod);
        const { coupon, discount } = await calculateCoupon(pool, userId, coupon_code, subtotal, cartItems);
        const finalTotal = subtotal + shippingFee - discount;
        const paymentCode = 'PS' + Date.now();

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orderResult] = await connection.query(
            `INSERT INTO orders (user_id, payment_code, total_price, shipping_fee, shipping_method, delivery_min_days, delivery_max_days, estimated_delivery_from, estimated_delivery_to, shipping_name, shipping_phone, shipping_address, notes, payment_method, status, discount_amount, coupon_code, cart_item_ids)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
            [userId, paymentCode, finalTotal, shippingFee, shippingMethod, delivery.minDays, delivery.maxDays, delivery.from, delivery.to, shipping_name, shipping_phone, shipping_address,
                notes || '', payment_method, discount, coupon ? coupon.code : null, itemIds.length > 0 ? itemIds.join(',') : null]
        );
        const orderId = orderResult.insertId;

        for (const item of cartItems) {
            await connection.query(
                'INSERT INTO order_items (order_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.product_id, item.variant_id || null, item.quantity, item.price]
            );
        }

        // Lưu phiên mua ngay đến khi người dùng xác nhận thanh toán mô phỏng.
        await connection.commit();
        connection.release();
        connection = null;

        res.json({
            success: true,
            order_id: orderId,
            payment_code: paymentCode,
            subtotal,
            shipping_fee: shippingFee,
            shipping_method: shippingMethod,
            estimated_delivery_from: delivery.from,
            estimated_delivery_to: delivery.to,
            discount_amount: discount,
            total: finalTotal,
            simulated: true
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Initiate order error:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Đã xảy ra lỗi!' });
    }
});

// Check payment status for online payments
router.get('/:id/check-payment', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { id } = req.params;

        // Lấy đơn hàng
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [id, req.session.user_id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Đơn hàng không tồn tại!' });
        }

        const order = orders[0];

        // Đồ án mô phỏng: nút xác nhận của người dùng đóng vai trò kết quả thanh toán.
        const canConfirmDemoPayment = ONLINE_PAYMENT_METHODS.includes(order.payment_method)
            && order.status === 'pending';
        
        res.json({
            order_id: order.id,
            status: order.status,
            paid: canConfirmDemoPayment,
            payment_method: order.payment_method,
            simulated: true
        });
    } catch (error) {
        console.error('Check payment error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Complete order after payment verification
router.post('/:id/complete', async (req, res) => {
    let connection;
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { id } = req.params;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
            [id, req.session.user_id]
        );
        if (orders.length === 0) {
            const error = new Error('Đơn hàng không tồn tại!');
            error.status = 404;
            throw error;
        }

        const order = orders[0];
        if (order.status !== 'pending') {
            const error = new Error('Đơn hàng không ở trạng thái chờ thanh toán!');
            error.status = 400;
            throw error;
        }
        if (!ONLINE_PAYMENT_METHODS.includes(order.payment_method)) {
            const error = new Error('Chỉ đơn MoMo/VNPay mới dùng xác nhận thanh toán mô phỏng!');
            error.status = 400;
            throw error;
        }

        const [orderItems] = await connection.query(
            `SELECT oi.product_id, oi.variant_id, oi.quantity, oi.price, p.name
             FROM order_items oi JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ?`,
            [id]
        );
        await decreaseStock(connection, orderItems);

        if (order.coupon_code && Number(order.discount_amount) > 0) {
            const [coupons] = await connection.query('SELECT * FROM coupons WHERE code = ?', [order.coupon_code]);
            if (coupons.length === 0) {
                const error = new Error('Mã giảm giá của đơn hàng không còn tồn tại!');
                error.status = 400;
                throw error;
            }
            await useCoupon(connection, req.session.user_id, coupons[0], id, Number(order.discount_amount));
        }

        await connection.query(
            "UPDATE orders SET status = 'confirmed', paid_at = NOW() WHERE id = ?",
            [id]
        );

        if (order.cart_item_ids) {
            const idsToDelete = parseItemIds(order.cart_item_ids.split(','));
            if (idsToDelete.length > 0) {
                await connection.query('DELETE FROM cart WHERE id IN (?) AND user_id = ?', [idsToDelete, req.session.user_id]);
            }
        } else if (!req.session.buyNow) {
            await connection.query('DELETE FROM cart WHERE user_id = ?', [req.session.user_id]);
        }
        delete req.session.buyNow;

        await connection.commit();
        connection.release();
        connection = null;

        sendConfirmationEmail(id, req.session.user_id);

        res.json({
            success: true,
            order_id: id,
            simulated: true,
            message: 'Thanh toán mô phỏng thành công! Đơn hàng đã được xác nhận.'
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Complete order error:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Đã xảy ra lỗi!' });
    }
});

module.exports = router;
