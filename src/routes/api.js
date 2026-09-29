const express = require('express');
const router = express.Router();
const { validateBody, stringField, emailField, integerField } = require('../middleware/validate');

const contactValidation = validateBody({
    full_name: stringField({ required: true, min: 1, max: 100, disallowHtml: true, label: 'Họ tên' }),
    email: emailField({ required: true }),
    phone: stringField({ max: 30, disallowHtml: true, label: 'Số điện thoại' }),
    message: stringField({ required: true, min: 1, max: 3000, disallowHtml: true, label: 'Nội dung' })
});
const reviewValidation = validateBody({
    product_id: integerField({ required: true, min: 1, label: 'Sản phẩm' }),
    rating: integerField({ required: true, min: 1, max: 5, label: 'Số sao' }),
    comment: stringField({ required: true, min: 1, max: 2000, disallowHtml: true, label: 'Nội dung đánh giá' })
});
const multer = require('multer');
const pool = require('../config/database');
const { requireAdminApi: requireAdmin } = require('../middleware/auth');
const { isAllowedImage } = require('../core/image-upload');
const { categoryCloudinaryStorage } = require('../services/cloud-storage');

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
        const { full_name, email, phone, message } = req.body;
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
            'INSERT INTO contacts (user_id, full_name, email, phone, message) VALUES (?, ?, ?, ?, ?)',
            [user_id, full_name, email, phone || '', message]
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

        await connection.commit();

        const io = req.app?.get?.('io');
        if (io && savedMessage) {
            io.to('admin_chat').emit('new_message', { conversation_id, message: savedMessage });
        }

        res.json({
            success: true,
            message: 'Gửi liên hệ thành công!',
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
router.post('/review', reviewValidation, async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const productId = Number.parseInt(req.body.product_id, 10);
        const rating = Number(req.body.rating);
        const comment = String(req.body.comment || '').trim();
        const user_id = req.session.user_id;

        if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Vui lòng chọn số sao!' });
        }

        if (!comment) {
            return res.status(400).json({ error: 'Vui lòng nhập nội dung đánh giá!' });
        }
        if (comment.length > 2000) return res.status(400).json({ error: 'Đánh giá không được vượt quá 2000 ký tự!' });

        const [purchases] = await pool.query(
            `SELECT o.id
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'
             LIMIT 1`,
            [user_id, productId]
        );
        if (purchases.length === 0) {
            return res.status(403).json({ error: 'Bạn chỉ có thể đánh giá sản phẩm đã mua và nhận hàng!' });
        }

        // Check if already reviewed
        const [existing] = await pool.query(
            'SELECT id FROM reviews WHERE product_id = ? AND user_id = ?',
            [productId, user_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Bạn đã đánh giá sản phẩm này rồi!' });
        }

        await pool.query(
            'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
            [productId, user_id, rating, comment]
        );

        res.json({ success: true, message: 'Cảm ơn bạn đã đánh giá!' });
    } catch (error) {
        console.error('Review error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Bạn đã đánh giá sản phẩm này rồi!' });
        }
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
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

// Get single category
router.get('/categories/:id', async (req, res) => {
    try {
        const visibility = req.session?.role === 'admin' ? '' : ' AND is_active = 1';
        const [categories] = await pool.query(`SELECT id, name, slug, image, is_active FROM categories WHERE id = ?${visibility}`, [req.params.id]);
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
        const { name, slug, image = null, is_active = 1 } = req.body;
        const active = normalizeActiveFlag(is_active);
        const normalizedImage = normalizeCategoryImage(image);
        
        if (!name || !slug || active === null) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        if (normalizedImage === undefined) {
            return res.status(400).json({ error: 'Ảnh danh mục phải được tải lên Cloudinary!' });
        }
        
        // Check duplicate slug
        const [existing] = await pool.query('SELECT id FROM categories WHERE slug = ?', [slug]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Slug đã tồn tại!' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO categories (name, slug, image, is_active) VALUES (?, ?, ?, ?)',
            [name, slug, normalizedImage, active]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Lỗi khi tạo danh mục!' });
    }
});

// Update category
router.put('/categories/:id', requireAdmin, async (req, res) => {
    try {
        const { name, slug, image = null, is_active } = req.body;
        const active = normalizeActiveFlag(is_active);
        const normalizedImage = normalizeCategoryImage(image);
        if (!name || !slug || active === null) {
            return res.status(400).json({ error: 'Thông tin danh mục không hợp lệ!' });
        }
        if (normalizedImage === undefined) {
            return res.status(400).json({ error: 'Ảnh danh mục phải được tải lên Cloudinary!' });
        }
        
        // Check duplicate slug (excluding current)
        const [existing] = await pool.query('SELECT id FROM categories WHERE slug = ? AND id != ?', [slug, req.params.id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Slug đã tồn tại!' });
        }
        
        await pool.query(
            'UPDATE categories SET name = ?, slug = ?, image = ?, is_active = ? WHERE id = ?',
            [name, slug, normalizedImage, active, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
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
