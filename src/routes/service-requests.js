const express = require('express');
const multer = require('multer');
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { isAllowedImage } = require('../core/image-upload');
const { serviceRequestCloudinaryStorage, destroyUploadedFiles } = require('../services/cloud-storage');

const router = express.Router();
const requestTypes = new Set(['return', 'warranty']);
const statusTransitions = {
    submitted: new Set(['reviewing']),
    reviewing: new Set(['approved', 'rejected']),
    approved: new Set(['resolved']),
    rejected: new Set(),
    resolved: new Set()
};
const imageUpload = multer({
    storage: serviceRequestCloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 4 },
    fileFilter: (req, file, callback) => {
        const allowed = isAllowedImage(file);
        callback(allowed ? null : new Error('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP.'), allowed);
    }
});

async function attachRequestImages(requests) {
    if (!requests.length) return requests;
    const ids = requests.map(request => Number(request.id));
    const [images] = await pool.query(
        'SELECT service_request_id, image_url FROM service_request_images WHERE service_request_id IN (?) ORDER BY id',
        [ids]
    );
    const grouped = new Map();
    for (const image of images) {
        const list = grouped.get(Number(image.service_request_id)) || [];
        list.push(image.image_url);
        grouped.set(Number(image.service_request_id), list);
    }
    return requests.map(request => ({ ...request, images: grouped.get(Number(request.id)) || [] }));
}

function requireLogin(req, res, next) {
    if (!req.session?.user_id) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập!' });
    next();
}

router.post('/', requireLogin, imageUpload.array('images', 4), async (req, res) => {
    const userId = Number(req.session?.user_id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        await destroyUploadedFiles(req.files);
        return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập!' });
    }

    const orderItemId = Number(req.body?.order_item_id);
    const type = String(req.body?.request_type || '');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (!Number.isSafeInteger(orderItemId) || orderItemId < 1 || !requestTypes.has(type) ||
        !reason || reason.length > 255 || description.length > 2000 || /[<>]/.test(reason + description)) {
        await destroyUploadedFiles(req.files);
        return res.status(400).json({ success: false, error: 'Thông tin yêu cầu đổi trả hoặc bảo hành không hợp lệ.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [items] = await connection.query(
            `SELECT oi.id, oi.order_id
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE oi.id = ? AND o.user_id = ? AND o.status = 'delivered'
             LIMIT 1`,
            [orderItemId, userId]
        );
        if (!items.length) {
            await connection.rollback();
            connection.release();
            connection = null;
            await destroyUploadedFiles(req.files);
            return res.status(404).json({ success: false, error: 'Chỉ có thể yêu cầu hỗ trợ cho sản phẩm trong đơn đã giao của bạn.' });
        }

        const [result] = await connection.query(
            `INSERT INTO service_requests
                (user_id, order_id, order_item_id, request_type, reason, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, items[0].order_id, orderItemId, type, reason, description || null]
        );
        if (req.files?.length) {
            await connection.query(
                'INSERT INTO service_request_images (service_request_id, image_url) VALUES ?',
                [req.files.map(file => [result.insertId, file.path])]
            );
        }
        await connection.commit();
        connection.release();
        connection = null;
        return res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
            connection.release();
        }
        await destroyUploadedFiles(req.files);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Bạn đã gửi yêu cầu cùng loại cho sản phẩm này.' });
        if (error.status) return res.status(error.status).json({ success: false, error: error.message });
        console.error('Create service request error:', error);
        return res.status(500).json({ success: false, error: 'Không thể gửi yêu cầu lúc này.' });
    }
});

router.get('/mine', async (req, res) => {
    const userId = Number(req.session?.user_id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập!' });
    }
    try {
        const [requests] = await pool.query(
            `SELECT sr.id, sr.order_id, sr.order_item_id, sr.request_type, sr.reason,
                    sr.description, sr.status, sr.admin_note, sr.resolved_at,
                    sr.created_at, sr.updated_at, o.payment_code, p.name AS product_name,
                    v.ram, v.storage, v.color,
                    NULL AS images
             FROM service_requests sr
             JOIN orders o ON o.id = sr.order_id
             JOIN order_items oi ON oi.id = sr.order_item_id
             JOIN products p ON p.id = oi.product_id
             LEFT JOIN product_variants v ON v.id = oi.variant_id
             WHERE sr.user_id = ?
             ORDER BY sr.created_at DESC`,
            [userId]
        );
        return res.json({ success: true, requests: await attachRequestImages(requests) });
    } catch (error) {
        console.error('List customer service requests error:', error);
        return res.status(500).json({ success: false, error: 'Không thể tải yêu cầu hậu mãi.' });
    }
});

router.get('/admin/list', requireAdmin, async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT sr.*, u.full_name AS customer_name, u.email AS customer_email,
                    o.payment_code, oi.quantity, p.name AS product_name,
                    v.ram, v.storage, v.color,
                    NULL AS images
             FROM service_requests sr
             JOIN users u ON u.id = sr.user_id
             JOIN orders o ON o.id = sr.order_id
             JOIN order_items oi ON oi.id = sr.order_item_id
             JOIN products p ON p.id = oi.product_id
             LEFT JOIN product_variants v ON v.id = oi.variant_id
             ORDER BY FIELD(sr.status, 'submitted', 'reviewing', 'approved', 'rejected', 'resolved'), sr.created_at DESC`
        );
        return res.json({ success: true, requests: await attachRequestImages(requests) });
    } catch (error) {
        console.error('List admin service requests error:', error);
        return res.status(500).json({ success: false, error: 'Không thể tải yêu cầu hậu mãi.' });
    }
});

router.put('/admin/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const nextStatus = String(req.body?.status || '');
    const note = typeof req.body?.admin_note === 'string' ? req.body.admin_note.trim() : '';
    if (!Number.isSafeInteger(id) || id < 1 || note.length > 1000 || /[<>]/.test(note)) {
        return res.status(400).json({ success: false, error: 'Thông tin cập nhật không hợp lệ.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [requests] = await connection.query('SELECT id, status FROM service_requests WHERE id = ? FOR UPDATE', [id]);
        if (!requests.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Không tìm thấy yêu cầu hậu mãi.' });
        }
        if (!statusTransitions[requests[0].status]?.has(nextStatus)) {
            await connection.rollback();
            return res.status(400).json({ success: false, error: 'Trạng thái yêu cầu không thể chuyển như đã chọn.' });
        }
        await connection.query(
            `UPDATE service_requests
             SET status = ?, admin_note = ?, resolved_at = CASE WHEN ? IN ('rejected', 'resolved') THEN NOW() ELSE NULL END
             WHERE id = ?`,
            [nextStatus, note || null, nextStatus, id]
        );
        await connection.commit();
        return res.json({ success: true });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error('Update service request error:', error);
        return res.status(500).json({ success: false, error: 'Không thể cập nhật yêu cầu hậu mãi.' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
