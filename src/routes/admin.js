const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { projectRoot, viewsDir } = require('../core/paths');
const { isAllowedImage } = require('../core/image-upload');
const { parseReviewComment, serializeReviewComment } = require('../core/review-comment');
const { parseVariantPayload, variantSummary, saveProductVariants, syncProductStock } = require('../core/product-variants');
const { requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/admin-controller');
const {
    productCloudinaryStorage,
    bannerCloudinaryStorage,
    destroyCloudinaryUrls,
    destroyUploadedProductFiles
} = require('../services/cloud-storage');

function normalizeBannerPosition(position) {
    const positions = { '0': 'hero', '1': 'side', '2': 'quick', hero: 'hero', side: 'side', quick: 'quick' };
    return positions[String(position)] || 'hero';
}

function normalizeInternalLink(link) {
    if (!link || typeof link !== 'string') return link || '';
    try {
        const parsed = new URL(link);
        if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
            return parsed.pathname + parsed.search + parsed.hash;
        }
    } catch (error) {}
    return link;
}

async function removeStoredBanner(imageUrl) {
    if (!imageUrl) return;
    if (/^https:\/\/res\.cloudinary\.com\//i.test(String(imageUrl))) {
        await destroyCloudinaryUrls([imageUrl]);
        return;
    }
    if (!String(imageUrl).startsWith('/uploads/banners/')) return;
    const filePath = path.join(projectRoot, 'public', 'uploads', 'banners', path.basename(imageUrl));
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (error) {}
}

const uploadBanner = multer({ 
    storage: bannerCloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (isAllowedImage(file)) cb(null, true);
        else cb(new Error('Chỉ chấp nhận file ảnh!'));
    }
});

const bannerUpload = (req, res, next) => uploadBanner.single('image')(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'Ảnh banner không được vượt quá 5MB!'
        : error.message || 'Ảnh banner không hợp lệ!';
    return res.status(error.status === 503 ? 503 : error.status === 502 ? 502 : 400).json({ error: message });
});

const bannerUploads = (req, res, next) => uploadBanner.array('images', 10)(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'Mỗi ảnh banner không được vượt quá 5MB!'
        : error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Banner chính chỉ được tải tối đa 10 ảnh!'
            : error.message || 'Ảnh banner không hợp lệ!';
    return res.status(error.status === 503 ? 503 : error.status === 502 ? 502 : 400).json({ error: message });
});

const uploadProductImage = multer({ 
    storage: productCloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (isAllowedImage(file)) cb(null, true);
        else cb(new Error('Chỉ chấp nhận file ảnh!'));
    }
});

async function productValidationError(req, res, message) {
    await destroyUploadedProductFiles(req.files);
    return res.status(400).json({ error: message });
}

function parseProductNumbers(body) {
    const brandId = Number(body.brand_id);
    const categoryId = Number(body.category_id);
    const salePrice = Number(body.price);
    const oldPrice = body.old_price === '' || body.old_price === undefined ? null : Number(body.old_price);
    const stockValue = Number(body.stock);
    const discountValue = Number(body.discount_percent || 0);
    return { brandId, categoryId, salePrice, oldPrice, stockValue, discountValue };
}

function validateProductNumbers(values) {
    const { brandId, categoryId, salePrice, oldPrice, stockValue, discountValue } = values;
    if (!Number.isInteger(brandId) || brandId < 1 || !Number.isInteger(categoryId) || categoryId < 1) {
        return 'Vui lòng chọn thương hiệu và danh mục hợp lệ!';
    }
    if (!Number.isSafeInteger(salePrice) || salePrice <= 0 || (oldPrice !== null && (!Number.isSafeInteger(oldPrice) || oldPrice < 0))) {
        return 'Giá sản phẩm không hợp lệ!';
    }
    if (!Number.isSafeInteger(stockValue) || stockValue < 0 || !Number.isSafeInteger(discountValue) || discountValue < 0 || discountValue > 100) {
        return 'Tồn kho hoặc phần trăm giảm giá không hợp lệ!';
    }
    return null;
}

function isMissingProductImageAltText(error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') return false;
    const details = `${error.sqlMessage || ''} ${error.message || ''}`;
    return /\balt_text\b/i.test(details);
}

async function loadProductImages(database, productId) {
    try {
        const [images] = await database.query(
            'SELECT id, image_url, alt_text, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [productId]
        );
        return images;
    } catch (error) {
        if (!isMissingProductImageAltText(error)) throw error;
        const [images] = await database.query(
            'SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [productId]
        );
        return images.map(image => ({ ...image, alt_text: null }));
    }
}

async function insertProductImages(database, galleryValues) {
    try {
        return await database.query(
            'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES ?',
            [galleryValues]
        );
    } catch (error) {
        if (!isMissingProductImageAltText(error)) throw error;
        const legacyValues = galleryValues.map(([productId, imageUrl, , isPrimary, sortOrder]) => [
            productId,
            imageUrl,
            isPrimary,
            sortOrder
        ]);
        return database.query(
            'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES ?',
            [legacyValues]
        );
    }
}

// Multer chạy trước handler nên lỗi file sẽ không đi qua try/catch bên dưới.
// Trả về 400 rõ ràng để giao diện không hiển thị lỗi 500 mơ hồ.
const productUpload = (req, res, next) => uploadProductImage.array('galleryFiles', 20)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Mỗi ảnh sản phẩm không được vượt quá 5MB!'
            : error.code === 'LIMIT_UNEXPECTED_FILE'
                ? 'Bạn chỉ có thể tải tối đa 20 ảnh sản phẩm!'
                : 'Dữ liệu ảnh tải lên không hợp lệ!';
        return res.status(400).json({ error: message });
    }
    const status = error.status === 503 ? 503 : 502;
    const message = status === 503 ? error.message : 'Không thể tải ảnh sản phẩm lên cloud!';
    return res.status(status).json({ error: message });
});

// Helper function to create URL-friendly slug
function createSlug(text) {
    if (!text || typeof text !== 'string') return '';
    
    let slug = text.trim().toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
        .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
        .replace(/[ìíịỉĩ]/g, 'i')
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
        .replace(/[ùúụủũưừứựửữ]/g, 'u')
        .replace(/[ỳýỵỷỹ]/g, 'y')
        .replace(/[đ]/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug;
}

// Generate unique slug
async function generateUniqueSlug(name) {
    // Defensive: name có thể undefined từ req.body bị destructuring thiếu
    if (!name || typeof name !== 'string') {
        return 'product-' + Date.now();
    }
    let baseSlug = createSlug(name);
    if (!baseSlug) baseSlug = 'product-' + Date.now();
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
        const [existing] = await pool.query('SELECT id FROM products WHERE slug = ?', [slug]);
        if (existing.length === 0) {
            return slug;
        }
        slug = baseSlug + '-' + counter;
        counter++;
    }
}

// Dashboard stats
router.get('/stats', requireAdmin, async (req, res, next) => {
    try { return await adminController.stats(req, res); } catch (error) { return next(error); }
});
/*
    try {
        const [products] = await pool.query('SELECT COUNT(*) as c FROM products');
        const [orders] = await pool.query('SELECT COUNT(*) as c FROM orders');
        const [users] = await pool.query("SELECT COUNT(*) as c FROM users WHERE role='customer'");
        const [revenue] = await pool.query("SELECT SUM(total_price) as c FROM orders WHERE status='delivered'");
        const [pending] = await pool.query("SELECT COUNT(*) as c FROM orders WHERE status='pending'");
        const [reviews] = await pool.query('SELECT COUNT(*) as c FROM reviews');
        const [contacts] = await pool.query('SELECT COUNT(*) as c FROM contacts WHERE is_read=0');
        const [lowStock] = await pool.query('SELECT COUNT(*) as c FROM products WHERE stock < 20');

        // So sánh tháng này vs tháng trước
        const [thisMonth] = await pool.query(`
            SELECT COALESCE(SUM(total_price), 0) as revenue, COUNT(*) as orders
            FROM orders 
            WHERE status = 'delivered' 
            AND YEAR(created_at) = YEAR(CURRENT_DATE) 
            AND MONTH(created_at) = MONTH(CURRENT_DATE)
        `);
        const [lastMonth] = await pool.query(`
            SELECT COALESCE(SUM(total_price), 0) as revenue, COUNT(*) as orders
            FROM orders 
            WHERE status = 'delivered' 
            AND YEAR(created_at) = YEAR(CURRENT_DATE - INTERVAL 1 MONTH) 
            AND MONTH(created_at) = MONTH(CURRENT_DATE - INTERVAL 1 MONTH)
        `);
        
        const thisRevenue = Number(thisMonth[0].revenue) || 0;
        const lastRevenue = Number(lastMonth[0].revenue) || 0;
        const revenueChange = lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue * 100).toFixed(1) : 0;

        res.json({
            total_products: products[0].c,
            total_orders: orders[0].c,
            total_users: users[0].c,
            total_revenue: revenue[0].c || 0,
            pending_orders: pending[0].c,
            total_reviews: reviews[0].c,
            unread_contacts: contacts[0].c,
            low_stock: lowStock[0].c,
            this_month_revenue: thisRevenue,
            last_month_revenue: lastRevenue,
            revenue_change: revenueChange
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});*/

// Notifications for admin dashboard
router.get('/notifications', requireAdmin, async (req, res) => {
    try {
        // Đơn hàng mới/chờ xác nhận (trong 7 ngày gần nhất)
        const [pendingOrders] = await pool.query(`
            SELECT o.id, o.payment_code, o.total_price, o.shipping_name, o.created_at
            FROM orders o
            WHERE o.status = 'pending' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY o.created_at DESC
            LIMIT 5
        `);
        
        // Đơn hàng mới đã xác nhận (trong 24h)
        const [newOrders] = await pool.query(`
            SELECT o.id, o.payment_code, o.total_price, o.shipping_name, o.created_at
            FROM orders o
            WHERE o.status IN ('confirmed', 'shipping') 
            AND o.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY o.created_at DESC
            LIMIT 5
        `);
        
        // Sản phẩm sắp hết hàng (dưới 20 sản phẩm)
        const [lowStockProducts] = await pool.query(`
            SELECT id, name, stock, thumbnail
            FROM products
            WHERE stock < 20
            ORDER BY stock ASC
            LIMIT 10
        `);
        
        // Liên hệ/yêu cầu hỗ trợ chưa đọc
        const [unreadContacts] = await pool.query(`
            SELECT id, full_name, email, message, created_at
            FROM contacts
            WHERE is_read = 0
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        // Đánh giá mới (trong 7 ngày)
        const [newReviews] = await pool.query(`
            SELECT r.id, r.rating, r.comment, r.created_at,
                   u.full_name AS user_name,
                   p.name AS product_name
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY r.created_at DESC
            LIMIT 5
        `);
        
        // Tổng số thông báo
        const totalAlerts = pendingOrders.length + newOrders.length + 
                           lowStockProducts.length + unreadContacts.length + 
                           newReviews.length;
        
        res.json({
            // Thông báo quan trọng (cần xử lý ngay)
            pending_orders: pendingOrders,
            new_orders: newOrders,
            // Cảnh báo
            low_stock_products: lowStockProducts,
            unread_contacts: unreadContacts,
            new_reviews: newReviews.map(review => ({ ...review, ...parseReviewComment(review.comment) })),
            // Tổng hợp
            total_alerts: totalAlerts,
            has_critical: totalAlerts > 0,
            // Chi tiết từng loại
            counts: {
                pending_orders: pendingOrders.length,
                new_orders: newOrders.length,
                low_stock: lowStockProducts.length,
                contacts: unreadContacts.length,
                reviews: newReviews.length
            }
        });
    } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ error: 'Lỗi khi tải thông báo!' });
    }
});

// Top khách hàng
router.get('/top-customers', requireAdmin, async (req, res) => {
    try {
        const [topCustomers] = await pool.query(`
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.phone,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.total_price), 0) as total_spent,
                MAX(o.created_at) as last_order_date
            FROM users u
            LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'delivered'
            WHERE u.role = 'customer'
            GROUP BY u.id, u.full_name, u.email, u.phone
            HAVING total_orders > 0
            ORDER BY total_spent DESC
            LIMIT 10
        `);
        
        res.json({ top_customers: topCustomers });
    } catch (error) {
        console.error('Top customers error:', error);
        res.status(500).json({ error: 'Lỗi khi tải top khách hàng!' });
    }
});

// Chart data for dashboard
router.get('/chart-data', requireAdmin, async (req, res) => {
    try {
        // 1. Doanh thu 12 tháng gần nhất
        const [revenueByMonth] = await pool.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COALESCE(SUM(total_price), 0) as revenue,
                COUNT(*) as order_count
            FROM orders 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                AND status != 'cancelled'
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month ASC
        `);

        // Bổ sung tháng thiếu với revenue = 0
        const monthLabels = [];
        const revenueData = [];
        const orderCountData = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            const label = 'T' + (d.getMonth() + 1);
            monthLabels.push(label);
            const found = revenueByMonth.find(r => r.month === key);
            revenueData.push(found ? Number(found.revenue) : 0);
            orderCountData.push(found ? Number(found.order_count) : 0);
        }

        // 2. Số đơn hàng theo trạng thái
        const [ordersByStatus] = await pool.query(`
            SELECT status, COUNT(*) as count
            FROM orders
            GROUP BY status
        `);
        const statusMap = {
            'pending': 'Chờ xác nhận',
            'confirmed': 'Đã xác nhận',
            'shipping': 'Đang giao',
            'delivered': 'Đã giao',
            'cancelled': 'Đã hủy'
        };
        const statusLabels = [];
        const statusCounts = [];
        const statusColors = {
            'pending': '#f59e0b',
            'confirmed': '#3b82f6',
            'shipping': '#8b5cf6',
            'delivered': '#10b981',
            'cancelled': '#ef4444'
        };
        const statusColorsArr = [];
        ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled'].forEach(s => {
            const found = ordersByStatus.find(o => o.status === s);
            statusLabels.push(statusMap[s]);
            statusCounts.push(found ? Number(found.count) : 0);
            statusColorsArr.push(statusColors[s]);
        });

        // 3. Top 5 sản phẩm bán chạy
        const [topProducts] = await pool.query(`
            SELECT 
                p.name,
                p.thumbnail,
                COALESCE(SUM(oi.quantity), 0) as total_sold,
                COALESCE(SUM(oi.quantity * oi.price), 0) as total_revenue
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
            GROUP BY p.id, p.name, p.thumbnail
            HAVING total_sold > 0
            ORDER BY total_sold DESC
            LIMIT 5
        `);

        // 4. Doanh thu 7 ngày gần nhất (bonus)
        const [revenueByDay] = await pool.query(`
            SELECT 
                DATE(created_at) as day,
                COALESCE(SUM(total_price), 0) as revenue
            FROM orders 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                AND status = 'delivered'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        `);
        const dayLabels = [];
        const dayData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            const label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
            dayLabels.push(label);
            const found = revenueByDay.find(r => {
                const rd = new Date(r.day);
                const rk = rd.getFullYear() + '-' + String(rd.getMonth() + 1).padStart(2, '0') + '-' + String(rd.getDate()).padStart(2, '0');
                return rk === key;
            });
            dayData.push(found ? Number(found.revenue) : 0);
        }

        res.json({
            revenueByMonth: {
                labels: monthLabels,
                revenue: revenueData,
                orders: orderCountData
            },
            ordersByStatus: {
                labels: statusLabels,
                counts: statusCounts,
                colors: statusColorsArr
            },
            topProducts: topProducts.map(p => ({
                name: p.name,
                thumbnail: p.thumbnail,
                total_sold: Number(p.total_sold),
                total_revenue: Number(p.total_revenue)
            })),
            revenueByDay: {
                labels: dayLabels,
                revenue: dayData
            }
        });
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ error: 'Lỗi khi tải dữ liệu biểu đồ!' });
    }
});

// Admin dashboard page
router.get('/', (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') {
        return res.redirect('/login');
    }
    res.sendFile(path.join(viewsDir, 'admin', 'index.html'));
});

// Products management
router.get('/products', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'products.html'));
});

router.get('/categories', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'categories.html'));
});

router.get('/brands', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'brands.html'));
});

router.get('/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [products] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
        if (products.length === 0) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại!' });
        }
        // Lấy gallery images
        const images = await loadProductImages(pool, id);
        let variants = [];
        try {
            [variants] = await pool.query(
                `SELECT id, sku, ram, storage, color, price, old_price, stock, is_default, is_active
                 FROM product_variants WHERE product_id = ?
                 ORDER BY is_default DESC, id ASC`,
                [id]
            );
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        }
        res.json({ product: products[0], images, variants });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.post('/products', requireAdmin, productUpload, async (req, res) => {
    try {
        const {
            name, brand_id, category_id, price, old_price, discount_percent,
            description, ram, storage, stock, is_featured,
            os, chipset, cpu, gpu, screen_size, screen_resolution
        } = req.body;

        // Validate required fields
        if (!name || !name.trim()) {
            return productValidationError(req, res, 'Tên sản phẩm không được trống!');
        }
        const variants = parseVariantPayload(req.body.variants);
        const numbers = parseProductNumbers(req.body);
        if (variants.length) {
            const summary = variantSummary(variants, null);
            numbers.salePrice = summary.price;
            numbers.oldPrice = summary.old_price;
            numbers.stockValue = summary.stock;
            numbers.discountValue = summary.discount_percent;
        }
        const validationError = validateProductNumbers(numbers);
        if (validationError) return productValidationError(req, res, validationError);
        const { brandId, categoryId, salePrice, oldPrice, stockValue, discountValue } = numbers;
        const variantBase = variants.length ? variantSummary(variants, null) : null;
        const effectiveRam = variantBase ? variantBase.ram : (ram === 'null' ? null : (ram || null));
        const effectiveStorage = variantBase ? variantBase.storage : (storage === 'null' ? null : (storage || null));

        // Generate unique slug from name
        const slug = await generateUniqueSlug(name);

        // Get primary image index (default to 0 = first image)
        const requestedPrimary = Number.parseInt(req.body.primaryImageIndex, 10);
        const primaryImageIndex = Number.isInteger(requestedPrimary) && requestedPrimary >= 0 && requestedPrimary < (req.files || []).length
            ? requestedPrimary : 0;
        const thumbnail = req.files && req.files.length > 0 ? req.files[primaryImageIndex].path : null;

        // Kiểm tra FK trước để trả lỗi dễ hiểu thay vì lỗi 500 từ MySQL.
        const [brandRows] = await pool.query('SELECT id FROM brands WHERE id = ? AND is_active = 1', [brandId]);
        const [categoryRows] = await pool.query('SELECT id FROM categories WHERE id = ? AND is_active = 1', [categoryId]);
        if (brandRows.length === 0) return productValidationError(req, res, 'Thương hiệu không tồn tại hoặc đã bị ẩn!');
        if (categoryRows.length === 0) return productValidationError(req, res, 'Danh mục không tồn tại hoặc đã bị ẩn!');

        const connection = await pool.getConnection();
        let result;
        try {
            await connection.beginTransaction();
            [result] = await connection.query(
            `INSERT INTO products (name, slug, brand_id, category_id, price, old_price, discount_percent, description, thumbnail, ram, storage, stock, is_featured, os, chipset, cpu, gpu, screen_size, screen_resolution)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name.trim(), slug, brandId, categoryId, salePrice, oldPrice, discountValue, description === 'null' ? null : (description || null), thumbnail, effectiveRam, effectiveStorage, stockValue, is_featured === 'true' || is_featured === '1' ? 1 : 0, os === 'null' ? null : (os || null), chipset === 'null' ? null : (chipset || null), cpu === 'null' ? null : (cpu || null), gpu === 'null' ? null : (gpu || null), screen_size === 'null' ? null : (screen_size || null), screen_resolution === 'null' ? null : (screen_resolution || null)]
            );

            const productId = result.insertId;

            await saveProductVariants(connection, productId, variants);

        // Insert gallery images
        let galleryColors = [];
        try { galleryColors = JSON.parse(req.body.galleryColors || '[]'); } catch (error) { galleryColors = []; }
        if (!Array.isArray(galleryColors)) galleryColors = [];
        if (req.files && req.files.length > 0) {
            const galleryValues = req.files.map((file, index) => [
                productId,
                file.path,
                typeof galleryColors[index] === 'string' ? galleryColors[index].slice(0, 255) || null : null,
                index === primaryImageIndex ? 1 : 0, // is_primary
                index + 1 // sort_order
            ]);
            
            if (galleryValues.length > 0) {
                await insertProductImages(connection, galleryValues);
            }
            }
            await connection.commit();
            res.json({ success: true, id: productId });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        await destroyUploadedProductFiles(req.files);
        console.error('Create product error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            const isSkuConflict = /(?:product_variants\.)?sku/i.test(error.sqlMessage || error.message || '');
            return res.status(409).json({
                error: isSkuConflict
                    ? 'SKU đã được sử dụng cho một phiên bản khác. Vui lòng nhập SKU duy nhất hoặc để trống!'
                    : 'Đường dẫn sản phẩm bị trùng. Vui lòng đổi tên sản phẩm và thử lại!'
            });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.errno === 1452) return res.status(400).json({ error: 'Thương hiệu hoặc danh mục không tồn tại!' });
        res.status(500).json({ error: 'Không thể lưu sản phẩm!' });
    }
});

router.put('/products/:id', requireAdmin, productUpload, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const {
            name, brand_id, category_id, price, old_price, discount_percent,
            description, ram, storage, stock, is_featured,
            os, chipset, cpu, gpu, screen_size, screen_resolution
        } = req.body;

        // Validate
        const productId = Number(id);
        if (!Number.isInteger(productId) || productId < 1) return productValidationError(req, res, 'Mã sản phẩm không hợp lệ!');
        if (!name || !name.trim()) return productValidationError(req, res, 'Tên sản phẩm không được trống!');

        const variants = parseVariantPayload(req.body.variants);
        const numbers = parseProductNumbers(req.body);
        if (variants.length) {
            const summary = variantSummary(variants, null);
            numbers.salePrice = summary.price;
            numbers.oldPrice = summary.old_price;
            numbers.stockValue = summary.stock;
            numbers.discountValue = summary.discount_percent;
        }
        const validationError = validateProductNumbers(numbers);
        if (validationError) return productValidationError(req, res, validationError);
        const { brandId, categoryId, salePrice, oldPrice, stockValue, discountValue } = numbers;
        const variantBase = variants.length ? variantSummary(variants, null) : null;
        const effectiveRam = variantBase ? variantBase.ram : (ram === 'null' ? null : (ram || null));
        const effectiveStorage = variantBase ? variantBase.storage : (storage === 'null' ? null : (storage || null));

        const [brandRows] = await pool.query('SELECT id FROM brands WHERE id = ? AND is_active = 1', [brandId]);
        const [categoryRows] = await pool.query('SELECT id FROM categories WHERE id = ? AND is_active = 1', [categoryId]);
        if (brandRows.length === 0) return productValidationError(req, res, 'Thương hiệu không tồn tại hoặc đã bị ẩn!');
        if (categoryRows.length === 0) return productValidationError(req, res, 'Danh mục không tồn tại hoặc đã bị ẩn!');

        let manifest;
        try {
            manifest = JSON.parse(req.body.galleryManifest || '[]');
        } catch (error) {
            return productValidationError(req, res, 'Danh sách ảnh sản phẩm không hợp lệ!');
        }
        if (!Array.isArray(manifest) || manifest.length > 20) {
            return productValidationError(req, res, 'Danh sách ảnh sản phẩm không hợp lệ!');
        }
        let galleryColors;
        try { galleryColors = JSON.parse(req.body.galleryColors || '[]'); } catch (error) {
            return productValidationError(req, res, 'Liên kết màu sắc của ảnh không hợp lệ!');
        }
        if (!Array.isArray(galleryColors) || (galleryColors.length && galleryColors.length !== manifest.length)) {
            return productValidationError(req, res, 'Liên kết màu sắc của ảnh không hợp lệ!');
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [current] = await connection.query('SELECT name, thumbnail FROM products WHERE id = ? FOR UPDATE', [productId]);
        if (current.length === 0) {
            await connection.rollback();
            connection.release();
            connection = null;
            await destroyUploadedProductFiles(req.files);
            return res.status(404).json({ error: 'Sản phẩm không tồn tại!' });
        }
        const [oldImages] = await connection.query(
            'SELECT id, image_url FROM product_images WHERE product_id = ? ORDER BY sort_order FOR UPDATE',
            [productId]
        );
        const oldById = new Map(oldImages.map(image => [Number(image.id), image]));
        const usedExistingIds = new Set();
        const usedUploadIndexes = new Set();
        let usedCurrentThumbnail = false;
        const finalGallery = [];
        for (const item of manifest) {
            if (item && item.type === 'existing') {
                const imageId = Number(item.id);
                if (!Number.isInteger(imageId) || !oldById.has(imageId) || usedExistingIds.has(imageId)) {
                    throw Object.assign(new Error('Danh sách ảnh cũ không hợp lệ!'), { status: 400 });
                }
                usedExistingIds.add(imageId);
                finalGallery.push({ url: oldById.get(imageId).image_url, color: galleryColors[finalGallery.length] || null });
            } else if (item && item.type === 'new') {
                const uploadIndex = Number(item.uploadIndex);
                if (!Number.isInteger(uploadIndex) || !req.files?.[uploadIndex] || usedUploadIndexes.has(uploadIndex)) {
                    throw Object.assign(new Error('Danh sách ảnh mới không hợp lệ!'), { status: 400 });
                }
                usedUploadIndexes.add(uploadIndex);
                finalGallery.push({ url: req.files[uploadIndex].path, color: galleryColors[finalGallery.length] || null });
            } else if (item && item.type === 'current_thumbnail') {
                if (usedCurrentThumbnail || !current[0].thumbnail) {
                    throw Object.assign(new Error('Ảnh đại diện cũ không hợp lệ!'), { status: 400 });
                }
                usedCurrentThumbnail = true;
                finalGallery.push({ url: current[0].thumbnail, color: galleryColors[finalGallery.length] || null });
            } else {
                throw Object.assign(new Error('Danh sách ảnh sản phẩm không hợp lệ!'), { status: 400 });
            }
        }
        if ((req.files || []).length !== usedUploadIndexes.size) {
            throw Object.assign(new Error('Có ảnh tải lên không thuộc gallery!'), { status: 400 });
        }

        const requestedPrimary = Number.parseInt(req.body.primaryImageIndex, 10);
        const primaryImageIndex = Number.isInteger(requestedPrimary) && requestedPrimary >= 0 && requestedPrimary < finalGallery.length
            ? requestedPrimary : 0;
        const thumbnail = finalGallery.length > 0 ? finalGallery[primaryImageIndex].url : null;

        // Update slug only if name changed
        let newSlug = null;
        if (current.length > 0 && current[0].name !== name) {
            newSlug = await generateUniqueSlug(name.trim());
        }

        let query, params;
        if (newSlug) {
            query = `UPDATE products SET name=?, slug=?, brand_id=?, category_id=?, price=?, old_price=?, discount_percent=?, description=?, thumbnail=?, stock=?, is_featured=?, os=?, chipset=?, cpu=?, gpu=?, screen_size=?, screen_resolution=?, ram=?, storage=? WHERE id=?`;
            params = [name.trim(), newSlug, brandId, categoryId, salePrice, oldPrice, discountValue, description === 'null' ? null : (description || null), thumbnail, stockValue, is_featured === 'true' || is_featured === '1' ? 1 : 0, os === 'null' ? null : (os || null), chipset === 'null' ? null : (chipset || null), cpu === 'null' ? null : (cpu || null), gpu === 'null' ? null : (gpu || null), screen_size === 'null' ? null : (screen_size || null), screen_resolution === 'null' ? null : (screen_resolution || null), effectiveRam, effectiveStorage, productId];
        } else {
            query = `UPDATE products SET name=?, brand_id=?, category_id=?, price=?, old_price=?, discount_percent=?, description=?, thumbnail=?, stock=?, is_featured=?, os=?, chipset=?, cpu=?, gpu=?, screen_size=?, screen_resolution=?, ram=?, storage=? WHERE id=?`;
            params = [name.trim(), brandId, categoryId, salePrice, oldPrice, discountValue, description === 'null' ? null : (description || null), thumbnail, stockValue, is_featured === 'true' || is_featured === '1' ? 1 : 0, os === 'null' ? null : (os || null), chipset === 'null' ? null : (chipset || null), cpu === 'null' ? null : (cpu || null), gpu === 'null' ? null : (gpu || null), screen_size === 'null' ? null : (screen_size || null), screen_resolution === 'null' ? null : (screen_resolution || null), effectiveRam, effectiveStorage, productId];
        }

        await connection.query(query, params);
        await saveProductVariants(connection, productId, variants);
        await connection.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
        if (finalGallery.length > 0) {
            const galleryValues = finalGallery.map((image, index) => [
                productId, image.url, image.color, index === primaryImageIndex ? 1 : 0, index + 1
            ]);
            await insertProductImages(connection, galleryValues);
        }

        await connection.commit();
        connection.release();
        connection = null;

        const retainedUrls = new Set(finalGallery.map(image => image.url));
        const previousImageUrls = new Set([
            current[0].thumbnail,
            ...oldImages.map(image => image.image_url)
        ].filter(Boolean));
        const removedCloudUrls = [];
        for (const imageUrl of previousImageUrls) {
            if (retainedUrls.has(imageUrl)) continue;
            if (/^https?:\/\//i.test(imageUrl)) {
                removedCloudUrls.push(imageUrl);
                continue;
            }
            const oldPath = path.join(projectRoot, 'public', 'assets', 'images', 'products', path.basename(imageUrl));
            try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (error) {}
        }
        await destroyCloudinaryUrls(removedCloudUrls);
        res.json({ success: true });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {}
            connection.release();
        }
        await destroyUploadedProductFiles(req.files);
        console.error('Update product error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            const isSkuConflict = /(?:product_variants\.)?sku/i.test(error.sqlMessage || error.message || '');
            return res.status(409).json({
                error: isSkuConflict
                    ? 'SKU đã được sử dụng cho một phiên bản khác. Vui lòng nhập SKU duy nhất hoặc để trống!'
                    : 'Đường dẫn sản phẩm bị trùng. Vui lòng đổi tên sản phẩm và thử lại!'
            });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.errno === 1452) return res.status(400).json({ error: 'Thương hiệu hoặc danh mục không tồn tại!' });
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Không thể cập nhật sản phẩm!' });
    }
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({ error: 'ID sản phẩm không hợp lệ!' });
        }
        const [images] = await pool.query(
            'SELECT image_url FROM product_images WHERE product_id = ?',
            [id]
        );
        const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại!' });
        }
        const cloudUrls = images.map(image => image.image_url).filter(url => /^https?:\/\//i.test(url));
        await destroyCloudinaryUrls(cloudUrls);
        res.json({ success: true });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
            return res.status(409).json({ error: 'Không thể xóa sản phẩm đã có trong đơn hàng. Cần giữ sản phẩm và hình ảnh để bảo toàn lịch sử mua hàng.' });
        }
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Orders management
router.get('/orders', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'orders.html'));
});

router.get('/orders/list', requireAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let query = `SELECT o.*, u.full_name AS customer_name,
                    COALESCE((
                        SELECT GROUP_CONCAT(CONCAT(p.name,
                            CASE WHEN v.id IS NULL THEN '' ELSE CONCAT(' (', CONCAT_WS(' / ', v.ram, v.storage, v.color), ')') END,
                            ' ×', oi.quantity) ORDER BY oi.id SEPARATOR ', ')
                         FROM order_items oi
                         LEFT JOIN products p ON p.id = oi.product_id
                         LEFT JOIN product_variants v ON v.id = oi.variant_id
                        WHERE oi.order_id = o.id
                    ), '') AS items
                    FROM orders o
                    LEFT JOIN users u ON o.user_id = u.id`;
        let params = [];

        if (status) {
            query += ' WHERE o.status = ?';
            params.push(status);
        }

        query += ' ORDER BY o.created_at DESC';

        const [orders] = await pool.query(query, params);
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.get('/orders/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [orders] = await pool.query(
            `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone 
             FROM orders o 
             LEFT JOIN users u ON o.user_id = u.id 
             WHERE o.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Đơn hàng không tồn tại!' });
        }

        const [items] = await pool.query(
            `SELECT oi.*, p.name AS product_name, p.thumbnail AS product_image,
                    COALESCE(v.ram, p.ram) AS ram, COALESCE(v.storage, p.storage) AS storage,
                    v.color, v.sku
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             LEFT JOIN product_variants v ON oi.variant_id = v.id
             WHERE oi.order_id = ?`,
            [id]
        );

        res.json({ order: orders[0], items });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.put('/orders/:id/status', requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { status } = req.body;

        const transitions = {
            pending: ['confirmed', 'cancelled'],
            confirmed: ['shipping', 'cancelled'],
            shipping: ['delivered', 'cancelled'],
            delivered: [],
            cancelled: []
        };

        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Đơn hàng không tồn tại!' });
        }

        const order = orders[0];
        if (!transitions[order.status]?.includes(status)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: `Không thể chuyển đơn từ ${order.status} sang ${status}!` });
        }

        const [items] = await connection.query(
            `SELECT oi.product_id, oi.variant_id, oi.quantity, p.name
             FROM order_items oi JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ?`,
            [id]
        );

        // Đơn online chỉ trừ kho khi được xác nhận; COD đã trừ kho lúc đặt hàng.
        if (order.status === 'pending' && status === 'confirmed' && ['momo', 'vnpay'].includes(order.payment_method)) {
            for (const item of items) {
                const [updated] = item.variant_id
                    ? await connection.query(
                        'UPDATE product_variants SET stock = stock - ? WHERE id = ? AND product_id = ? AND is_active = 1 AND stock >= ?',
                        [item.quantity, item.variant_id, item.product_id, item.quantity]
                    )
                    : await connection.query(
                        'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
                        [item.quantity, item.product_id, item.quantity]
                    );
                if (updated.affectedRows !== 1) {
                    const error = new Error(`Sản phẩm "${item.name}" không đủ hàng!`);
                    error.status = 400;
                    throw error;
                }
                if (item.variant_id) await syncProductStock(connection, item.product_id);
            }

            if (order.coupon_code && Number(order.discount_amount) > 0) {
                const [coupons] = await connection.query('SELECT id FROM coupons WHERE code = ?', [order.coupon_code]);
                if (coupons.length > 0) {
                    const [used] = await connection.query(
                        'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? LIMIT 1',
                        [order.user_id, coupons[0].id]
                    );
                    if (used.length > 0) {
                        const error = new Error('Khách hàng đã sử dụng mã giảm giá này!');
                        error.status = 400;
                        throw error;
                    }
                    const [updatedCoupon] = await connection.query(
                        `UPDATE coupons SET used_count = used_count + 1
                         WHERE id = ? AND (usage_limit IS NULL OR used_count < usage_limit)`,
                        [coupons[0].id]
                    );
                    if (updatedCoupon.affectedRows !== 1) {
                        const error = new Error('Mã giảm giá đã hết lượt sử dụng!');
                        error.status = 400;
                        throw error;
                    }
                    await connection.query(
                        'INSERT INTO user_coupons (user_id, coupon_id, order_id, discount_amount) VALUES (?, ?, ?, ?)',
                        [order.user_id, coupons[0].id, id, order.discount_amount]
                    );
                }
            }

            if (order.cart_item_ids) {
                const cartIds = order.cart_item_ids.split(',')
                    .map(value => Number.parseInt(value, 10))
                    .filter(value => Number.isInteger(value) && value > 0);
                if (cartIds.length > 0) {
                    await connection.query('DELETE FROM cart WHERE id IN (?) AND user_id = ?', [cartIds, order.user_id]);
                }
            }
        }

        // Pending online chưa giữ hàng; các trường hợp còn lại đã trừ kho.
        const shouldRestoreStock = status === 'cancelled'
            && (order.status !== 'pending' || order.payment_method === 'cod');
        if (shouldRestoreStock) {
            for (const item of items) {
                if (item.variant_id) {
                    await connection.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [item.quantity, item.variant_id]);
                    await syncProductStock(connection, item.product_id);
                } else {
                    await connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
                }
            }

            if (order.coupon_code) {
                const [deleted] = await connection.query('DELETE FROM user_coupons WHERE order_id = ?', [id]);
                if (deleted.affectedRows > 0) {
                    await connection.query(
                        'UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = ?',
                        [order.coupon_code]
                    );
                }
            }
        }

        await connection.query(
            `UPDATE orders
             SET status = ?,
                 paid_at = CASE WHEN ? = 'confirmed' AND payment_method IN ('momo', 'vnpay') THEN NOW() ELSE paid_at END,
                 cancelled_at = CASE WHEN ? = 'cancelled' THEN NOW() ELSE cancelled_at END
             WHERE id = ?`,
            [status, status, status, id]
        );
        await connection.commit();
        connection.release();
        connection = null;
        res.json({ success: true });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Đã xảy ra lỗi!' });
    }
});

// Users management
router.get('/users', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'users.html'));
});

router.get('/users/list', requireAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.post('/users', requireAdmin, async (req, res) => {
    try {
        const { full_name, email, phone, password, role } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const normalizedName = typeof full_name === 'string' ? full_name.trim() : '';
        const normalizedPhone = phone == null ? '' : String(phone).trim();
        const normalizedRole = role || 'customer';

        if (!normalizedName || !normalizedEmail || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        if (normalizedName.length > 100 || normalizedPhone.length > 30 || normalizedEmail.length > 255 || /[<>]/.test(normalizedName + normalizedPhone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ error: 'Thông tin người dùng không hợp lệ!' });
        }
        if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
            return res.status(400).json({ error: 'Mật khẩu phải có từ 6 đến 128 ký tự!' });
        }
        if (!['customer', 'admin'].includes(normalizedRole)) {
            return res.status(400).json({ error: 'Vai trò người dùng không hợp lệ!' });
        }

        // Check existing email
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email này đã được đăng ký!' });
        }

        // Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            [normalizedName, normalizedEmail, normalizedPhone, hashedPassword, normalizedRole]
        );

        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Reviews management
router.get('/reviews', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'reviews.html'));
});

router.get('/reviews/list', requireAdmin, async (req, res) => {
    try {
        const [reviews] = await pool.query(
            `SELECT r.*, u.full_name AS user_name, u.email AS user_email, p.name AS product_name
             FROM reviews r
             LEFT JOIN users u ON r.user_id = u.id
             LEFT JOIN products p ON r.product_id = p.id
             ORDER BY r.created_at DESC`
        );
        res.json({ reviews: reviews.map(review => ({ ...review, ...parseReviewComment(review.comment) })) });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.put('/reviews/:id/reply', requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const reply = typeof req.body.reply === 'string' ? req.body.reply.trim() : '';
        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Mã đánh giá không hợp lệ!' });
        }
        if (!reply || reply.length > 2000) {
            return res.status(400).json({ error: 'Phản hồi phải có từ 1 đến 2000 ký tự!' });
        }

        const [reviews] = await pool.query('SELECT comment FROM reviews WHERE id = ?', [id]);
        if (!reviews.length) return res.status(404).json({ error: 'Không tìm thấy đánh giá!' });

        const storedComment = serializeReviewComment(reviews[0].comment, reply);
        await pool.query('UPDATE reviews SET comment = ? WHERE id = ?', [storedComment, id]);
        res.json({ success: true, reply });
    } catch (error) {
        console.error('Reply review error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.delete('/reviews/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM reviews WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Contacts management
router.get('/contacts', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'contacts.html'));
});

router.get('/contacts/list', requireAdmin, async (req, res) => {
    try {
        const [contacts] = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json({ contacts });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.get('/contacts/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM contacts WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy liên hệ!' });
        res.json({ contact: rows[0] });
    } catch (error) {
        console.error('Get contact error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.put('/contacts/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE contacts SET is_read = 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Mark contact read error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.put('/contacts/:id/read', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE contacts SET is_read = 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

        // ==================== BANNERS MANAGEMENT ====================
router.get('/banners', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'banners.html'));
});

// ==================== PROMOTIONS MANAGEMENT ====================
router.get('/promotions', requireAdmin, (req, res) => {
    res.sendFile(path.join(viewsDir, 'admin', 'promotions.html'));
});

// API: Lấy tất cả coupons (admin)
router.get('/api/coupons', requireAdmin, async (req, res) => {
    try {
        const [coupons] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
        res.json({ coupons: coupons.map(coupon => ({
            ...coupon,
            description: coupon.code === 'FREESHIP' ? 'Giảm 30K cho đơn từ 500K' : coupon.description
        })) });
    } catch (error) {
        console.error('Get coupons error:', error);
        res.status(500).json({ error: 'Lỗi khi tải coupons!' });
    }
});

// API: Tạo coupon mới
router.post('/api/coupons', requireAdmin, async (req, res) => {
    try {
        const { code, description, discount_type, discount_value, min_order_value, max_discount, usage_limit, expires_at, is_active } = req.body;
        
        if (!code || !description || !discount_value) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }

        // Check trùng code
        const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ?', [code.toUpperCase()]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Mã giảm giá đã tồn tại!' });
        }

        await pool.query(
            `INSERT INTO coupons (code, description, discount_type, discount_value, min_order_value, max_discount, usage_limit, expires_at, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [code.toUpperCase(), description, discount_type || 'percent', discount_value, 
             min_order_value || 0, max_discount || null, usage_limit || null, 
             expires_at || null, is_active ? 1 : 0]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Create coupon error:', error);
        res.status(500).json({ error: 'Lỗi khi tạo coupon!' });
    }
});

// API: Cập nhật coupon
router.put('/api/coupons/:id', requireAdmin, async (req, res) => {
    try {
        const { code, description, discount_type, discount_value, min_order_value, max_discount, usage_limit, expires_at, is_active } = req.body;
        const { id } = req.params;

        await pool.query(
            `UPDATE coupons SET code=?, description=?, discount_type=?, discount_value=?, min_order_value=?, max_discount=?, usage_limit=?, expires_at=?, is_active=? WHERE id=?`,
            [code.toUpperCase(), description, discount_type, discount_value, 
             min_order_value || 0, max_discount || null, usage_limit || null, 
             expires_at || null, is_active ? 1 : 0, id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Update coupon error:', error);
        res.status(500).json({ error: 'Lỗi khi cập nhật!' });
    }
});

// API: Xóa coupon
router.delete('/api/coupons/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete coupon error:', error);
        res.status(500).json({ error: 'Lỗi khi xóa!' });
    }
});

// Lấy danh sách sản phẩm sắp hết hàng (dưới 20)
router.get('/low-stock-products', requireAdmin, async (req, res) => {
    try {
        const [products] = await pool.query(
            `SELECT id, name, stock, thumbnail
             FROM products
             WHERE stock < 20
             ORDER BY stock ASC
             LIMIT 12`
        );
        res.json({ products });
    } catch (error) {
        console.error('Low stock error:', error);
        res.status(500).json({ error: 'Lỗi khi tải!' });
    }
});

// Lấy tất cả banners
router.get('/banners/list', requireAdmin, async (req, res) => {
    try {
        const [banners] = await pool.query(
            'SELECT * FROM banners ORDER BY position ASC, sort_order ASC'
        );
        res.json({ banners: banners.map(banner => ({
            ...banner,
            position: normalizeBannerPosition(banner.position),
            link: normalizeInternalLink(banner.link)
        })) });
    } catch (error) {
        console.error('Get banners error:', error);
        res.status(500).json({ error: 'Lỗi khi tải banner!' });
    }
});

// Lấy 1 banner
router.get('/banners/item/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [banners] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);
        if (banners.length === 0) {
            return res.status(404).json({ error: 'Banner không tồn tại!' });
        }
        res.json({ banner: {
            ...banners[0],
            position: normalizeBannerPosition(banners[0].position),
            link: normalizeInternalLink(banners[0].link)
        } });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Tạo banner mới
router.post('/banners', requireAdmin, async (req, res) => {
    try {
        const { position, title, subtitle, link, image_url, is_active, sort_order } = req.body;
        
        if (!image_url) {
            return res.status(400).json({ error: 'Vui lòng cung cấp ảnh banner!' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO banners (position, title, subtitle, link, image_url, is_active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [normalizeBannerPosition(position), title, subtitle, normalizeInternalLink(link), image_url, is_active ? 1 : 0, sort_order || 0]
        );
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Create banner error:', error);
        res.status(500).json({ error: 'Lỗi khi tạo banner!' });
    }
});

// Upload banner image
router.post('/banners/upload', requireAdmin, bannerUpload, (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file ảnh!' });
        }
        res.json({ success: true, url: req.file.path });
    } catch (error) {
        console.error('Upload banner error:', error);
        res.status(500).json({ error: 'Lỗi khi upload ảnh!' });
    }
});

// Upload tối đa 10 ảnh cho carousel banner chính.
router.post('/banners/upload-many', requireAdmin, bannerUploads, (req, res) => {
    if (!req.files?.length) {
        return res.status(400).json({ error: 'Không có file ảnh!' });
    }
    res.json({ success: true, urls: req.files.map(file => file.path) });
});

// Thay toàn bộ tập ảnh banner chính bằng một transaction.
router.put('/banners/hero-set', requireAdmin, async (req, res) => {
    const imageUrls = Array.isArray(req.body.image_urls)
        ? req.body.image_urls.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    if (imageUrls.length < 1 || imageUrls.length > 10 || imageUrls.some(url => url.length > 500)) {
        return res.status(400).json({ error: 'Banner chính cần từ 1 đến 10 ảnh hợp lệ!' });
    }

    const { title, subtitle, link, is_active } = req.body;
    let connection;
    let oldBanners = [];
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        [oldBanners] = await connection.query(
            "SELECT image_url FROM banners WHERE position IN ('hero', '0') FOR UPDATE"
        );
        await connection.query("DELETE FROM banners WHERE position IN ('hero', '0')");
        const values = imageUrls.map((imageUrl, index) => [
            'hero', title || '', subtitle || '', normalizeInternalLink(link), imageUrl, is_active ? 1 : 0, index
        ]);
        await connection.query(
            `INSERT INTO banners (position, title, subtitle, link, image_url, is_active, sort_order) VALUES ?`,
            [values]
        );
        await connection.commit();
        connection.release();
        connection = null;

        const retained = new Set(imageUrls);
        for (const banner of oldBanners) {
            if (!retained.has(banner.image_url)) await removeStoredBanner(banner.image_url);
        }
        res.json({ success: true, count: imageUrls.length });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {}
            connection.release();
        }
        console.error('Update hero banners error:', error);
        res.status(500).json({ error: 'Lỗi khi cập nhật banner chính!' });
    }
});

// Cập nhật thông tin banner
router.put('/banners/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, link, image_url, is_active, sort_order } = req.body;

        if (!image_url) {
            return res.status(400).json({ error: 'Vui lòng cung cấp ảnh banner!' });
        }
        const [banners] = await pool.query('SELECT image_url FROM banners WHERE id = ?', [id]);
        if (banners.length === 0) {
            return res.status(404).json({ error: 'Banner không tồn tại!' });
        }
        await pool.query(
            `UPDATE banners SET title=?, subtitle=?, link=?, image_url=?, is_active=?, sort_order=? WHERE id=?`,
            [title, subtitle, normalizeInternalLink(link), image_url, is_active ? 1 : 0, sort_order || 0, id]
        );
        if (banners[0].image_url && banners[0].image_url !== image_url) {
            await removeStoredBanner(banners[0].image_url);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Update banner error:', error);
        res.status(500).json({ error: 'Lỗi khi cập nhật banner!' });
    }
});

router.delete('/banners/:id', requireAdmin, async (req, res) => {
    try {
        const [banners] = await pool.query('SELECT image_url FROM banners WHERE id = ?', [req.params.id]);
        if (!banners.length) return res.status(404).json({ error: 'Banner không tồn tại!' });
        await pool.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
        const [references] = await pool.query(
            'SELECT (SELECT COUNT(*) FROM banners WHERE image_url = ?) + (SELECT COUNT(*) FROM product_images WHERE image_url = ?) AS total',
            [banners[0].image_url, banners[0].image_url]
        );
        if (!Number(references[0]?.total)) await removeStoredBanner(banners[0].image_url);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete banner error:', error);
        res.status(500).json({ error: 'Lỗi khi xóa banner!' });
    }
});

// Toggle trạng thái active
router.put('/banners/:id/toggle', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await pool.query('UPDATE banners SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi cập nhật!' });
    }
});

module.exports = router;
