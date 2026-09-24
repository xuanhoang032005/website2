const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const VIP_MIN_DELIVERED_SPEND = 30000000;
const FIRST_ORDER_COUPONS = new Set(['WELCOME10', 'NEWUSER']);

function couponDescription(coupon) {
    return coupon.code === 'FREESHIP' ? 'Giảm 30K cho đơn từ 500K' : coupon.description;
}

async function getCouponContext(db, userId, coupons) {
    const context = {
        usedCouponIds: new Set(),
        hasPriorOrder: false,
        deliveredSpend: 0
    };
    if (!userId) return context;

    const needsFirstOrderCheck = coupons.some(coupon => FIRST_ORDER_COUPONS.has(coupon.code));
    const needsVipCheck = coupons.some(coupon => coupon.code === 'VIP20');
    const queries = [
        db.query('SELECT coupon_id FROM user_coupons WHERE user_id = ?', [userId]),
        needsFirstOrderCheck
            ? db.query(
                `SELECT id FROM orders
                 WHERE user_id = ?
                   AND (status IN ('confirmed', 'shipping', 'delivered')
                        OR (payment_method = 'cod' AND status = 'pending'))
                 LIMIT 1`,
                [userId]
            )
            : Promise.resolve([[]]),
        needsVipCheck
            ? db.query(
                "SELECT COALESCE(SUM(total_price), 0) AS total FROM orders WHERE user_id = ? AND status = 'delivered'",
                [userId]
            )
            : Promise.resolve([[{ total: 0 }]])
    ];

    const [[usedRows], [orderRows], [vipRows]] = await Promise.all(queries);
    context.usedCouponIds = new Set(usedRows.map(row => Number(row.coupon_id)));
    context.hasPriorOrder = orderRows.length > 0;
    context.deliveredSpend = Number(vipRows[0]?.total || 0);
    return context;
}

function getCouponRestriction(coupon, total, userId, context) {
    if (coupon.usage_limit != null && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
        return { status: 400, error: 'Mã giảm giá đã hết lượt sử dụng!' };
    }

    const minimum = Number(coupon.min_order_value || 0);
    if (total < minimum) {
        return {
            status: 400,
            error: `Đơn hàng tối thiểu ${minimum.toLocaleString('vi-VN')}đ để dùng mã này!`
        };
    }

    if (userId && context.usedCouponIds.has(Number(coupon.id))) {
        return { status: 400, error: 'Bạn đã sử dụng mã giảm giá này!' };
    }
    if (userId && FIRST_ORDER_COUPONS.has(coupon.code) && context.hasPriorOrder) {
        return { status: 400, error: 'Mã này chỉ áp dụng cho đơn hàng đầu tiên!' };
    }
    if (coupon.code === 'VIP20' && context.deliveredSpend < VIP_MIN_DELIVERED_SPEND) {
        return { status: 403, error: 'VIP20 dành cho khách đã có tổng đơn giao thành công từ 30 triệu!' };
    }
    return null;
}

// ===========================================
// COUPONS - Mã giảm giá
// ===========================================

// Kiểm tra mã giảm giá (validate trước khi áp dụng)
router.post('/validate', async (req, res) => {
    try {
        const { code, order_total } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Vui lòng nhập mã giảm giá!' });
        }

        const [coupons] = await pool.query(
            `SELECT * FROM coupons
             WHERE code = ? AND is_active = 1
             AND (start_date IS NULL OR start_date <= NOW())
             AND (expires_at IS NULL OR expires_at >= NOW())`,
            [code.toUpperCase()]
        );

        if (coupons.length === 0) {
            return res.status(404).json({ error: 'Mã giảm giá không tồn tại hoặc đã hết hạn!' });
        }

        const coupon = coupons[0];

        const total = parseFloat(order_total) || 0;
        const userId = req.session?.user_id;
        const context = await getCouponContext(pool, userId, [coupon]);
        const restriction = getCouponRestriction(coupon, total, userId, context);
        if (restriction) return res.status(restriction.status).json({ error: restriction.error });

        // Tính số tiền được giảm
        let discountAmount = 0;
        if (coupon.discount_type === 'percent') {
            discountAmount = Math.round(total * parseFloat(coupon.discount_value) / 100);
            // Giới hạn số tiền giảm tối đa
            if (coupon.max_discount && discountAmount > parseFloat(coupon.max_discount)) {
                discountAmount = parseFloat(coupon.max_discount);
            }
        } else if (coupon.discount_type === 'fixed') {
            discountAmount = parseFloat(coupon.discount_value);
            if (discountAmount > total) discountAmount = total;
        }

        res.json({
            success: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                description: couponDescription(coupon),
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                discount_amount: discountAmount
            },
            message: `Áp dụng thành công! Giảm ${discountAmount.toLocaleString('vi-VN')}đ`
        });
    } catch (error) {
        console.error('Validate coupon error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Lấy danh sách coupon công khai (đang hoạt động)
router.get('/active', async (req, res) => {
    try {
        const [coupons] = await pool.query(
            `SELECT id, code, description, discount_type, discount_value,
                    min_order_value, max_discount, expires_at
             FROM coupons
             WHERE is_active = 1
             AND (start_date IS NULL OR start_date <= NOW())
             AND (expires_at IS NULL OR expires_at >= NOW())
             ORDER BY created_at DESC`
        );
        res.json({ coupons: coupons.map(coupon => ({ ...coupon, description: couponDescription(coupon) })) });
    } catch (error) {
        console.error('Get active coupons error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Chỉ trả về mã thực sự dùng được với giỏ hàng và tài khoản hiện tại.
router.get('/available', async (req, res) => {
    try {
        const total = Math.max(0, Number(req.query.order_total) || 0);
        const [coupons] = await pool.query(
            `SELECT id, code, description, discount_type, discount_value,
                    min_order_value, max_discount, usage_limit, used_count, expires_at
             FROM coupons
             WHERE is_active = 1
             AND (start_date IS NULL OR start_date <= NOW())
             AND (expires_at IS NULL OR expires_at >= NOW())
             ORDER BY created_at DESC`
        );
        const userId = req.session?.user_id;
        const context = await getCouponContext(pool, userId, coupons);
        const evaluated = coupons.map(coupon => ({
            coupon,
            restriction: getCouponRestriction(coupon, total, userId, context)
        }));
        const available = evaluated.filter(item => !item.restriction).map(item => item.coupon);
        const unavailable = evaluated.filter(item => item.restriction).map(item => ({
            id: item.coupon.id,
            code: item.coupon.code,
            reason: item.restriction.error
        }));
        res.json({ coupons: available.map(coupon => ({
            id: coupon.id,
            code: coupon.code,
            description: couponDescription(coupon),
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            min_order_value: coupon.min_order_value,
            max_discount: coupon.max_discount,
            expires_at: coupon.expires_at
        })), unavailable });
    } catch (error) {
        console.error('Get available coupons error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Admin: tạo coupon mới
router.post('/', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }
        // Check admin role
        const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [req.session.user_id]);
        if (!users.length || users[0].role !== 'admin') {
            return res.status(403).json({ error: 'Không có quyền!' });
        }

        const {
            code, description, discount_type, discount_value,
            min_order_value = 0, max_discount = null,
            usage_limit = null, start_date = null, expires_at = null
        } = req.body;

        if (!code || !discount_value) {
            return res.status(400).json({ error: 'Vui lòng nhập mã và giá trị giảm!' });
        }

        const [result] = await pool.query(
            `INSERT INTO coupons (code, description, discount_type, discount_value,
                min_order_value, max_discount, usage_limit, start_date, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [code.toUpperCase(), description || '', discount_type || 'percent',
             discount_value, min_order_value, max_discount, usage_limit, start_date, expires_at]
        );

        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Create coupon error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Mã coupon đã tồn tại!' });
        }
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

module.exports = router;
