const express = require('express');
const router = express.Router();
const { validateBody, stringField, emailField, integerField, enumField } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rate-limit');
const { answerProductQuestion, isPromotionQuestion, reviewReply, ADMIN_ESCALATION_REPLY } = require('../services/product-qa');

const contactValidation = validateBody({
    full_name: stringField({ required: true, min: 1, max: 100, disallowHtml: true, label: 'Họ tên' }),
    email: emailField({ required: true }),
    phone: stringField({ max: 30, disallowHtml: true, label: 'Số điện thoại' }),
    subject: stringField({ max: 200, disallowHtml: true, label: 'Chủ đề' }),
    message: stringField({ required: true, min: 1, max: 3000, disallowHtml: true, label: 'Nội dung' })
});
const reviewSubmissionValidation = validateBody({
    product_id: integerField({ required: true, min: 1, label: 'Sản phẩm' }),
    entry_type: enumField(['review', 'question'], { label: 'Loại nội dung' }),
    comment: stringField({ required: true, min: 1, max: 2000, disallowHtml: true, label: 'Nội dung đánh giá' })
});
const reviewValidation = validateBody({
    product_id: integerField({ required: true, min: 1, label: 'Sản phẩm' }),
    rating: integerField({ required: true, min: 1, max: 5, label: 'Số sao' }),
    comment: stringField({ required: true, min: 1, max: 2000, disallowHtml: true, label: 'Nội dung đánh giá' })
});
const productQuestionRateLimit = createRateLimiter({
    namespace: 'product-question', windowMs: 15 * 60 * 1000, max: 10,
    message: 'Bạn đã gửi quá nhiều câu hỏi. Vui lòng thử lại sau!'
});
const multer = require('multer');
const pool = require('../config/database');
const { requireAdminApi: requireAdmin } = require('../middleware/auth');
const queue = require('../services/background-jobs');
const { isAllowedImage } = require('../core/image-upload');
const { categoryCloudinaryStorage } = require('../services/cloud-storage');
const { parseReviewComment, serializeReviewComment } = require('../core/review-comment');

function escapeMailHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

const categoryImageUpload = multer({
    storage: categoryCloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => isAllowedImage(file) ? cb(null, true) : cb(new Error('Chỉ chấp nhận file ảnh!'))
});

function normalizeActiveFlag(value, fallback = 1) {
    if (value === undefined) return fallback;
    if (value === true || value === 1 || value === '1') return 1;
    if (value === false || value === 0 || value === '0') return 0;
    return null;
}

function normalizeCategoryImage(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') return undefined;
    const image = value.trim();
    if (image.length > 255 || /^(?:data:|blob:)/i.test(image)) return undefined;
    try {
        const url = new URL(image);
        if (url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/')) {
            return url.toString();
        }
    } catch (error) {}
    return undefined;
}

function normalizeCategorySlug(value) {
    if (typeof value !== 'string') return '';
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

function normalizeTechnicalSpecsTemplate(value) {
    if (value === undefined || value === null || value === '') return null;
    let fields = value;
    if (typeof fields === 'string') {
        try { fields = JSON.parse(fields); } catch (error) { return undefined; }
    }
    if (!Array.isArray(fields) || fields.length > 60) return undefined;
    const labels = fields.map(field => typeof field === 'string' ? field : field?.label)
        .map(label => typeof label === 'string' ? label.trim() : '')
        .filter(Boolean);
    if (labels.some(label => label.length > 100)) return undefined;
    const unique = [...new Map(labels.map(label => [label.toLocaleLowerCase('vi'), label])).values()];
    return unique.length ? JSON.stringify(unique.map(label => ({ label }))) : null;
}

// Search suggestions
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string' || q.length < 2) {
            return res.json([]);
        }
        if (q.length > 100) return res.status(400).json({ error: 'Từ khóa tìm kiếm quá dài!' });

        const [products] = await pool.query(
            `SELECT id, name, price, thumbnail
             FROM products
             WHERE name LIKE ? OR description LIKE ?
             ORDER BY is_featured DESC, created_at DESC
             LIMIT 6`,
            [`%${q}%`, `%${q}%`]
        );

        res.json(products);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Get cart count for navbar
router.get('/cart-count', async (req, res) => {
    try {
        let count = 0;

        if (req.session.user_id) {
            const [result] = await pool.query(
                'SELECT SUM(quantity) AS total FROM cart WHERE user_id = ?',
                [req.session.user_id]
            );
            count = result[0].total || 0;
        }

        res.json({ count });
    } catch (error) {
        console.error('Get cart count error:', error);
        res.json({ count: 0 });
    }
});

// Contact form (lưu user_id nếu đã đăng nhập để admin có thể reply chat 2 chiều)
router.post('/contact', contactValidation, async (req, res) => {
    let connection;
    try {
        const { full_name, email, phone, subject, message } = req.body;
        const user_id = req.session?.user_id || null;

        if (!full_name || !email || !message) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        if (String(full_name).length > 100 || String(email).length > 255 || String(phone || '').length > 30 || String(message).length > 3000) {
            return res.status(400).json({ error: 'Nội dung liên hệ vượt quá độ dài cho phép!' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO contacts (user_id, full_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, full_name, email, phone || '', subject || 'Liên hệ từ website', message]
        );

        // Mỗi tài khoản chỉ dùng một conversation đại diện. Các conversation cũ
        // vẫn được giữ nguyên để admin có thể xem toàn bộ lịch sử.
        let conversation_id = null;
        let savedMessage = null;
        if (user_id) {
            const [existing] = await connection.query(
                `SELECT id FROM conversations
                 WHERE user_id = ?
                 ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
                 LIMIT 1 FOR UPDATE`,
                [user_id]
            );

            if (existing.length) {
                conversation_id = existing[0].id;
                await connection.query(
                    `UPDATE conversations
                     SET contact_id = ?, status = 'open', last_message_at = NOW()
                     WHERE id = ?`,
                    [result.insertId, conversation_id]
                );
            } else {
                const [conv] = await connection.query(
                    `INSERT INTO conversations (contact_id, user_id, status, last_message_at)
                     VALUES (?, ?, 'open', NOW())`,
                    [result.insertId, user_id]
                );
                conversation_id = conv.insertId;
            }

            const [messageResult] = await connection.query(
                `INSERT INTO messages (conversation_id, sender_type, sender_id, content)
                 VALUES (?, 'user', ?, ?)`,
                [conversation_id, user_id, String(message).trim()]
            );
            const [messages] = await connection.query('SELECT * FROM messages WHERE id = ?', [messageResult.insertId]);
            savedMessage = messages[0] || null;
        }

        const contactEmail = process.env.CONTACT_EMAIL || 'adminanhtrai@gmail.com';
        const safeName = escapeMailHtml(full_name);
        const safeEmail = escapeMailHtml(email);
        const safePhone = escapeMailHtml(phone || 'Không cung cấp');
        const safeSubject = escapeMailHtml(subject || 'Liên hệ từ website');
        const safeMessage = escapeMailHtml(message).replace(/\r?\n/g, '<br>');
        const emailJobId = await queue.enqueue('contact_email', {
            to: contactEmail,
            replyTo: email,
            subject: `[AnhTraiStore] ${subject || 'Liên hệ mới từ khách hàng'}`,
            text: `Họ tên: ${full_name}\nEmail: ${email}\nSố điện thoại: ${phone || 'Không cung cấp'}\nChủ đề: ${subject || 'Liên hệ từ website'}\n\n${message}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033">
                <div style="padding:20px 24px;background:#0b1b33;color:#fff"><h2 style="margin:0">Liên hệ mới từ AnhTraiStore</h2></div>
                <div style="padding:24px;border:1px solid #dce5ef">
                    <p><strong>Họ tên:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p>
                    <p><strong>Số điện thoại:</strong> ${safePhone}</p><p><strong>Chủ đề:</strong> ${safeSubject}</p>
                    <div style="margin-top:18px;padding:16px;background:#f5f8fc;border-radius:8px;line-height:1.6">${safeMessage}</div>
                </div></div>`
        }, { connection });

        await connection.commit();
        connection.release();
        connection = null;

        const io = req.app?.get?.('io');
        if (io && savedMessage) {
            io.to('admin_chat').emit('new_message', { conversation_id, message: savedMessage });
        }

        res.json({
            success: true,
            message: 'Gửi liên hệ thành công!',
            email_queued: true,
            email_job_id: emailJobId,
            conversation_id: conversation_id
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error('Contact error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    } finally {
        if (connection) connection.release();
    }
});

// Submit review
router.post('/review', productQuestionRateLimit, reviewSubmissionValidation, async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const productId = Number.parseInt(req.body.product_id, 10);
        const rawRating = req.body.rating;
        const parsedRating = rawRating == null || rawRating === '' ? null : Number(rawRating);
        const rating = Number.isInteger(parsedRating) && parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null;
        // A question has no rating; infer its type from the submitted fields so
        // stale clients cannot accidentally require a star selection.
        const entryType = rating == null ? 'question' : 'review';
        const comment = String(req.body.comment || '').trim();
        const user_id = req.session.user_id;

        if (!Number.isSafeInteger(productId) || productId < 1 || !['review', 'question'].includes(entryType)) {
            return res.status(400).json({ error: 'Thông tin gửi lên không hợp lệ!' });
        }
        if (comment.length < 5 || comment.length > 2000) return res.status(400).json({ error: 'Nội dung phải có từ 5 đến 2000 ký tự!' });
        if (comment.includes('[[ANHTRAISTORE_ADMIN_REPLY]]')) {
            return res.status(400).json({ error: 'Nội dung đánh giá chứa dấu phân cách không hợp lệ.' });
        }

        if (entryType === 'review') {
            const [deliveredPurchases] = await pool.query(
                `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
                 WHERE o.user_id = ? AND o.status = 'delivered' AND oi.product_id = ? LIMIT 1`,
                [user_id, productId]
            );
            if (!deliveredPurchases.length) {
                return res.status(403).json({ error: 'Chỉ khách đã nhận sản phẩm này mới được gửi đánh giá!' });
            }
        }

        if (entryType === 'review') {
            const [existing] = await pool.query(
                'SELECT id FROM reviews WHERE product_id = ? AND user_id = ? AND entry_type = ? LIMIT 1',
                [productId, user_id, entryType]
            );
            if (existing.length) return res.status(409).json({ error: 'Bạn đã đánh giá sản phẩm này rồi!' });
        }

        const [[product]] = await pool.query(
            `SELECT id, name, price, old_price, ram, storage, os, chipset, screen_size, screen_resolution, stock
             FROM products WHERE id = ?`,
            [productId]
        );
        if (!product) return res.status(404).json({ error: 'Sản phẩm không tồn tại!' });

        let aiReply;
        let needsAdmin;
        if (entryType === 'question') {
            let variants = [];
            try {
                [variants] = await pool.query(
                    `SELECT ram, storage, color, price, stock FROM product_variants
                     WHERE product_id = ? AND is_active = 1 ORDER BY is_default DESC, id LIMIT 40`,
                    [productId]
                );
            } catch (error) {
                if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
            }
            let promotions;
            if (isPromotionQuestion(comment)) {
                const [[coupons], [campaigns]] = await Promise.all([
                    pool.query(`SELECT code, description, discount_type, discount_value, min_order_value, max_discount
                                FROM coupons WHERE is_active = 1
                                  AND (start_date IS NULL OR start_date <= NOW())
                                  AND (expires_at IS NULL OR expires_at >= NOW())
                                  AND (usage_limit IS NULL OR used_count < usage_limit)
                                ORDER BY created_at DESC LIMIT 8`),
                    pool.query(`SELECT title, description FROM promotions
                                WHERE is_active = 1
                                  AND (start_date IS NULL OR start_date <= CURRENT_DATE())
                                  AND (end_date IS NULL OR end_date >= CURRENT_DATE())
                                ORDER BY start_date DESC, id DESC LIMIT 8`)
                ]);
                promotions = { coupons, campaigns };
            }
            try {
                ({ reply: aiReply, needsAdmin } = await answerProductQuestion({ question: comment, product, variants, promotions }));
            } catch (error) {
                console.error('Product question AI error:', error.code || error.name);
                aiReply = ADMIN_ESCALATION_REPLY;
                needsAdmin = true;
            }
        } else {
            ({ reply: aiReply, needsAdmin } = reviewReply(rating));
        }

        await pool.query(
            `INSERT INTO reviews (product_id, user_id, entry_type, rating, comment, ai_reply, needs_admin)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [productId, user_id, entryType, entryType === 'review' ? rating : null, comment, aiReply, needsAdmin ? 1 : 0]
        );

        res.json({
            success: true,
            entry_type: entryType,
            message: entryType === 'review' ? 'Đã gửi đánh giá.' : 'Đã gửi câu hỏi.',
            ai_reply: aiReply,
            needs_admin: needsAdmin
        });
    } catch (error) {
        console.error('Review error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Bạn đã gửi nội dung thuộc loại này về sản phẩm rồi.' });
        }
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.put('/review/:id', reviewValidation, async (req, res) => {
    const reviewId = Number(req.params.id);
    if (!req.session.user_id) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập!' });
    if (!Number.isSafeInteger(reviewId) || reviewId < 1) {
        return res.status(400).json({ success: false, error: 'Mã đánh giá không hợp lệ!' });
    }

    try {
        const productId = req.body.product_id;
        if (String(req.body.comment).includes('[[ANHTRAISTORE_ADMIN_REPLY]]')) {
            return res.status(400).json({ success: false, error: 'Nội dung đánh giá chứa dấu phân cách không hợp lệ.' });
        }
        const [reviews] = await pool.query(
            `SELECT id, comment FROM reviews WHERE id = ? AND product_id = ? AND user_id = ?
             AND entry_type = 'review' LIMIT 1`,
            [reviewId, productId, req.session.user_id]
        );
        if (!reviews.length) return res.status(404).json({ success: false, error: 'Không tìm thấy đánh giá của bạn.' });
        const [purchases] = await pool.query(
            `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.user_id = ? AND o.status = 'delivered' AND oi.product_id = ? LIMIT 1`,
            [req.session.user_id, productId]
        );
        if (!purchases.length) return res.status(403).json({ success: false, error: 'Không thể sửa đánh giá vì đơn hàng chưa được giao.' });
        const { admin_reply: existingReply } = parseReviewComment(reviews[0].comment);
        const updatedReply = reviewReply(req.body.rating);
        await pool.query(
            'UPDATE reviews SET rating = ?, comment = ?, ai_reply = ?, needs_admin = ? WHERE id = ? AND user_id = ?',
            [req.body.rating, serializeReviewComment(req.body.comment, existingReply), updatedReply.reply,
                updatedReply.needsAdmin ? 1 : 0, reviewId, req.session.user_id]
        );
        return res.json({ success: true });
    } catch (error) {
        console.error('Edit review error:', error);
        return res.status(500).json({ success: false, error: 'Không thể cập nhật đánh giá lúc này.' });
    }
});

router.post('/review/:id/report', async (req, res) => {
    if (!req.session.user_id) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập!' });
    const reviewId = Number(req.params.id);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isSafeInteger(reviewId) || reviewId < 1 || !reason || reason.length > 500 || /[<>]/.test(reason)) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập lý do báo cáo hợp lệ.' });
    }
    try {
        const [reviews] = await pool.query('SELECT user_id FROM reviews WHERE id = ? LIMIT 1', [reviewId]);
        if (!reviews.length) return res.status(404).json({ success: false, error: 'Không tìm thấy đánh giá.' });
        if (Number(reviews[0].user_id) === Number(req.session.user_id)) {
            return res.status(400).json({ success: false, error: 'Bạn không thể báo cáo đánh giá của chính mình.' });
        }
        await pool.query('INSERT INTO review_reports (review_id, user_id, reason) VALUES (?, ?, ?)',
            [reviewId, req.session.user_id, reason]);
        return res.status(201).json({ success: true });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Bạn đã báo cáo đánh giá này rồi.' });
        console.error('Report review error:', error);
        return res.status(500).json({ success: false, error: 'Không thể gửi báo cáo lúc này.' });
    }
});

// ============ CATEGORIES API ============

router.post('/categories/upload-image', requireAdmin, (req, res, next) => {
    categoryImageUpload.single('image')(req, res, error => {
        if (!error) return next();
        const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'Ảnh danh mục không được vượt quá 5MB!'
            : error.message || 'Ảnh danh mục không hợp lệ!';
        return res.status(error.status === 503 ? 503 : error.status === 502 ? 502 : 400).json({ error: message });
    });
}, (req, res) => {
    if (!req.file?.path) return res.status(400).json({ error: 'Vui lòng chọn ảnh danh mục!' });
    res.json({ image: req.file.path });
});

// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const visibility = req.session?.role === 'admin' ? '1=1' : 'c.is_active = 1';
        const [categories] = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.slug,
                c.image,
                c.technical_specs_template,
                c.is_active,
                COALESCE(product_totals.product_count, 0) AS product_count
            FROM categories c
            LEFT JOIN (
                SELECT category_id, COUNT(*) AS product_count
                FROM products
                GROUP BY category_id
            ) product_totals ON product_totals.category_id = c.id
            WHERE ${visibility}
            ORDER BY c.name ASC, c.id ASC
        `);
        res.json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Lỗi khi lấy danh mục!' });
    }
});

router.get('/categories/menu', async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT id, name, slug FROM categories WHERE is_active = 1 ORDER BY name, id'
        );
        const [brandRows] = await pool.query(`
            SELECT p.category_id, b.id, b.name, b.slug, COUNT(DISTINCT p.id) AS product_count
            FROM products p
            JOIN categories c ON c.id = p.category_id AND c.is_active = 1
            JOIN brands b ON b.id = p.brand_id AND b.is_active = 1
            WHERE p.stock >= 0
            GROUP BY p.category_id, b.id, b.name, b.slug
            ORDER BY b.name, b.id
        `);
        const brandsByCategory = new Map();
        for (const brand of brandRows) {
            const group = brandsByCategory.get(Number(brand.category_id)) || [];
            group.push({ id: brand.id, name: brand.name, slug: brand.slug, product_count: Number(brand.product_count) });
            brandsByCategory.set(Number(brand.category_id), group);
        }
        res.json({ categories: categories.map(category => ({
            ...category,
            brands: brandsByCategory.get(Number(category.id)) || []
        })) });
    } catch (error) {
        console.error('Get category menu error:', error);
        res.status(500).json({ error: 'Không thể tải menu danh mục!' });
    }
});

// Get single category
router.get('/categories/:id', async (req, res) => {
    try {
        const visibility = req.session?.role === 'admin' ? '' : ' AND is_active = 1';
        const [categories] = await pool.query(`SELECT id, name, slug, image, is_active, technical_specs_template FROM categories WHERE id = ?${visibility}`, [req.params.id]);
        if (categories.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy danh mục!' });
        }
        res.json(categories[0]);
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ error: 'Lỗi!' });
    }
});

// Create category
router.post('/categories', requireAdmin, async (req, res) => {
    try {
        const { name, slug, image = null, is_active = 1, technical_specs_template } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedSlug = normalizeCategorySlug(slug || normalizedName);
        const active = normalizeActiveFlag(is_active);
        const normalizedImage = normalizeCategoryImage(image);
        const normalizedTemplate = normalizeTechnicalSpecsTemplate(technical_specs_template);
        
        if (!normalizedName || normalizedName.length > 100 || !normalizedSlug || active === null || normalizedTemplate === undefined) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        if (normalizedImage === undefined) {
            return res.status(400).json({ error: 'Ảnh danh mục phải được tải lên Cloudinary!' });
        }
        
        // Check duplicate slug
        const [existing] = await pool.query('SELECT id FROM categories WHERE slug = ?', [normalizedSlug]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Slug danh mục đã tồn tại. Hãy đổi tên hoặc chỉnh slug.' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO categories (name, slug, image, is_active, technical_specs_template) VALUES (?, ?, ?, ?, ?) ',
            [normalizedName, normalizedSlug, normalizedImage, active, normalizedTemplate]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug danh mục đã tồn tại. Hãy đổi tên hoặc chỉnh slug.' });
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Lỗi khi tạo danh mục!' });
    }
});

// Update category
router.put('/categories/:id', requireAdmin, async (req, res) => {
    try {
        const { name, slug, image = null, is_active, technical_specs_template } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedSlug = normalizeCategorySlug(slug || normalizedName);
        const active = normalizeActiveFlag(is_active);
        const normalizedImage = normalizeCategoryImage(image);
        const normalizedTemplate = normalizeTechnicalSpecsTemplate(technical_specs_template);
        if (!normalizedName || normalizedName.length > 100 || !normalizedSlug || active === null || normalizedTemplate === undefined) {
            return res.status(400).json({ error: 'Thông tin danh mục không hợp lệ!' });
        }
        if (normalizedImage === undefined) {
            return res.status(400).json({ error: 'Ảnh danh mục phải được tải lên Cloudinary!' });
        }
        
        // Check duplicate slug (excluding current)
        const [existing] = await pool.query('SELECT id FROM categories WHERE slug = ? AND id != ?', [normalizedSlug, req.params.id]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Slug danh mục đã tồn tại. Hãy đổi tên hoặc chỉnh slug.' });
        }
        
        await pool.query(
            'UPDATE categories SET name = ?, slug = ?, image = ?, is_active = ?, technical_specs_template = ? WHERE id = ?',
            [normalizedName, normalizedSlug, normalizedImage, active, normalizedTemplate, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug danh mục đã tồn tại. Hãy đổi tên hoặc chỉnh slug.' });
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Lỗi khi cập nhật!' });
    }
});

// Delete category
router.delete('/categories/:id', requireAdmin, async (req, res) => {
    try {
        // Check if category has products
        const [products] = await pool.query('SELECT id FROM products WHERE category_id = ? LIMIT 1', [req.params.id]);
        if (products.length > 0) {
            return res.status(400).json({ error: 'Không thể xóa! Danh mục đang có sản phẩm.' });
        }
        
        await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Lỗi khi xóa!' });
    }
});

// ============ BRANDS API ============

// Get all brands
router.get('/brands', async (req, res) => {
    try {
        const visibility = req.session?.role === 'admin' ? '1=1' : 'b.is_active = 1';
        const [brands] = await pool.query(`
            SELECT b.*, COUNT(p.id) as product_count
            FROM brands b
            LEFT JOIN products p ON b.id = p.brand_id
            WHERE ${visibility}
            GROUP BY b.id
            ORDER BY b.name
        `);
        res.json({ brands });
    } catch (error) {
        console.error('Get brands error:', error);
        res.status(500).json({ error: 'Lỗi khi lấy thương hiệu!' });
    }
});

// Get single brand
router.get('/brands/:id', async (req, res) => {
    try {
        const visibility = req.session?.role === 'admin' ? '' : ' AND is_active = 1';
        const [brands] = await pool.query(`SELECT id, name, slug, is_active FROM brands WHERE id = ?${visibility}`, [req.params.id]);
        if (brands.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy thương hiệu!' });
        }
        res.json(brands[0]);
    } catch (error) {
        console.error('Get brand error:', error);
        res.status(500).json({ error: 'Lỗi!' });
    }
});

// Create brand
router.post('/brands', requireAdmin, async (req, res) => {
    try {
        const { name, slug, is_active = 1 } = req.body;
        const active = normalizeActiveFlag(is_active);
        
        if (!name || !slug || active === null) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        
        // Check duplicate slug
        const [existing] = await pool.query('SELECT id FROM brands WHERE slug = ?', [slug]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Slug đã tồn tại!' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO brands (name, slug, is_active) VALUES (?, ?, ?)',
            [name, slug, active]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Create brand error:', error);
        res.status(500).json({ error: 'Lỗi khi tạo thương hiệu!' });
    }
});

// Update brand
router.put('/brands/:id', requireAdmin, async (req, res) => {
    try {
        const { name, slug, is_active } = req.body;
        const active = normalizeActiveFlag(is_active);
        if (!name || !slug || active === null) {
            return res.status(400).json({ error: 'Thông tin thương hiệu không hợp lệ!' });
        }
        
        // Check duplicate slug (excluding current)
        const [existing] = await pool.query('SELECT id FROM brands WHERE slug = ? AND id != ?', [slug, req.params.id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Slug đã tồn tại!' });
        }
        
        await pool.query(
            'UPDATE brands SET name = ?, slug = ?, is_active = ? WHERE id = ?',
            [name, slug, active, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update brand error:', error);
        res.status(500).json({ error: 'Lỗi khi cập nhật!' });
    }
});

// Delete brand
router.delete('/brands/:id', requireAdmin, async (req, res) => {
    try {
        // Check if brand has products
        const [products] = await pool.query('SELECT id FROM products WHERE brand_id = ? LIMIT 1', [req.params.id]);
        if (products.length > 0) {
            return res.status(400).json({ error: 'Không thể xóa! Thương hiệu đang có sản phẩm.' });
        }
        
        await pool.query('DELETE FROM brands WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete brand error:', error);
        res.status(500).json({ error: 'Lỗi khi xóa!' });
    }
});

// Lấy banners đang hoạt động (public - cho trang chủ)
router.get('/banners/active', async (req, res) => {
    try {
        const [banners] = await pool.query(
            `SELECT id, position, title, subtitle, link, image_url, sort_order
             FROM banners
             WHERE is_active = 1
             ORDER BY position ASC, sort_order ASC`
        );
        res.json({ banners: banners.map(banner => {
            const positionMap = { '0': 'hero', '1': 'side', '2': 'quick' };
            let link = banner.link || '';
            try {
                const parsed = new URL(link);
                if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
                    link = parsed.pathname + parsed.search + parsed.hash;
                }
            } catch (error) {}
            return { ...banner, position: positionMap[String(banner.position)] || banner.position, link };
        }) });
    } catch (error) {
        console.error('Get active banners error:', error);
        res.status(500).json({ error: 'Lỗi khi tải banner!' });
    }
});


module.exports = router;
