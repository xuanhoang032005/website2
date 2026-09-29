const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { parseReviewComment } = require('../core/review-comment');

function filterValues(value) {
    const values = value === undefined ? [] : (Array.isArray(value) ? value : [value]);
    if (values.some(v => typeof v !== 'string')) {
        const error = new Error('Bộ lọc không hợp lệ!');
        error.status = 400;
        throw error;
    }
    return [...new Set(values.map(v => v.trim()).filter(v => v && v !== 'undefined' && v !== 'null'))];
}

function normalizeCapacity(value) {
    const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    return /^\d+$/.test(normalized) ? normalized + 'GB' : normalized;
}

function priceValue(value) {
    const values = filterValues(value);
    if (values.length === 0) return null;
    const price = Number(values[0]);
    if (values.length !== 1 || !/^\d+$/.test(values[0]) || !Number.isSafeInteger(price) || price < 0) {
        const error = new Error('Khoảng giá phải là số nguyên không âm!');
        error.status = 400;
        throw error;
    }
    return price;
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

// Get all products
router.get('/', async (req, res) => {
    try {
        const {
            q, category, brand, price_min, price_max,
            ram, storage, sort = 'newest', featured,
            page = 1, limit = 12
        } = req.query;

        const search = filterValues(q)[0];
        const catValue = filterValues(category)[0];
        const brandValues = filterValues(brand).map(value => value.toLowerCase());
        const minPrice = priceValue(price_min);
        const maxPrice = priceValue(price_max);
        if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
            return res.status(400).json({ error: 'Giá từ không được lớn hơn giá đến!' });
        }
        const pageSize = positiveInteger(limit, 12, 200);

        let where = ['1=1'];
        let params = [];

        if (search) {
            where.push('(p.name LIKE ? OR b.name LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (catValue) {
            if (/^[1-9]\d*$/.test(catValue)) {
                where.push('p.category_id = ?');
                params.push(Number(catValue));
            } else {
                where.push('c.slug = ?');
                params.push(catValue);
            }
        }
        if (featured === '1') {
            where.push('p.is_featured = 1');
        }
        if (brandValues.length > 0) {
            const brandIds = brandValues.filter(value => /^[1-9]\d*$/.test(value)).map(Number);
            const brandSlugs = brandValues.filter(value => !/^[1-9]\d*$/.test(value));
            const brandConditions = [];
            if (brandIds.length > 0) {
                brandConditions.push(`p.brand_id IN (${brandIds.map(() => '?').join(',')})`);
                params.push(...brandIds);
            }
            if (brandSlugs.length > 0) {
                brandConditions.push(`b.slug IN (${brandSlugs.map(() => '?').join(',')})`);
                params.push(...brandSlugs);
            }
            where.push('(' + brandConditions.join(' OR ') + ')');
        }
        if (minPrice !== null) {
            where.push('p.price >= ?');
            params.push(minPrice);
        }
        if (maxPrice !== null) {
            where.push('p.price <= ?');
            params.push(maxPrice);
        }

        // OR trong cùng nhóm, AND giữa các nhóm; nhận cả "8", "8GB" và "8 GB".
        for (const [column, value] of [['ram', ram], ['storage', storage]]) {
            const values = [...new Set(filterValues(value).map(normalizeCapacity).map(v => v.replace(/GB/g, '')))];
            if (values.length > 0) {
                const placeholders = values.map(() => '?').join(',');
                where.push(`(REPLACE(UPPER(REPLACE(TRIM(p.${column}), ' ', '')), 'GB', '') IN (${placeholders})
                    OR EXISTS (
                        SELECT 1 FROM product_variants fv
                        WHERE fv.product_id = p.id AND fv.is_active = 1
                          AND REPLACE(UPPER(REPLACE(TRIM(fv.${column}), ' ', '')), 'GB', '') IN (${placeholders})
                    ))`);
                params.push(...values, ...values);
            }
        }

        const whereSQL = where.join(' AND ');

        // Sort
        let orderSQL;
        switch (sort) {
            case 'price_asc': orderSQL = 'p.price ASC'; break;
            case 'price_desc': orderSQL = 'p.price DESC'; break;
            case 'discount_desc': orderSQL = 'p.discount_percent DESC, p.price ASC'; break;
            case 'discount_asc': orderSQL = 'p.discount_percent ASC, p.price ASC'; break;
            case 'discount': orderSQL = 'p.discount_percent DESC'; break;
            default: orderSQL = 'p.created_at DESC';
        }
        orderSQL += ', p.id DESC';

        // Count total
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE ${whereSQL}`,
            params
        );
        const total = countResult[0].total;

        // Pagination
        const totalPages = Math.ceil(total / pageSize);
        const currentPage = Math.min(positiveInteger(page, 1), Math.max(1, totalPages));
        const offset = (currentPage - 1) * pageSize;

        // Get products
        const [products] = await pool.query(
            `SELECT p.*, b.name AS brand_name, c.name AS cat_name, c.slug AS cat_slug
             FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE ${whereSQL}
             ORDER BY ${orderSQL}
             LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        );

        // Get filters data
        const [brands] = await pool.query(
            'SELECT id, name, slug FROM brands WHERE is_active = 1 ORDER BY name'
        );
        const [categories] = await pool.query('SELECT id, name, slug FROM categories WHERE is_active = 1 ORDER BY name');
        const [rams] = await pool.query(
            `SELECT DISTINCT ram FROM (
                SELECT ram FROM products WHERE ram IS NOT NULL AND ram != ''
                UNION ALL
                SELECT ram FROM product_variants WHERE is_active = 1 AND ram IS NOT NULL AND ram != ''
             ) values_ram ORDER BY ram`
        );
        const [storages] = await pool.query(
            `SELECT DISTINCT storage FROM (
                SELECT storage FROM products WHERE storage IS NOT NULL AND storage != ''
                UNION ALL
                SELECT storage FROM product_variants WHERE is_active = 1 AND storage IS NOT NULL AND storage != ''
             ) values_storage ORDER BY storage`
        );

        res.json({
            products,
            total,
            page: currentPage,
            totalPages,
            filters: {
                brands,
                categories,
                rams: [...new Set(rams.flatMap(r => filterValues(r.ram)).map(normalizeCapacity))],
                storages: [...new Set(storages.flatMap(s => filterValues(s.storage)).map(normalizeCapacity))]
            }
        });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ error: error.message });
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Get single product
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [products] = await pool.query(
            `SELECT p.*, b.name AS brand_name, c.name AS cat_name, c.slug AS cat_slug
             FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ?`,
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại!' });
        }

        const product = products[0];

        // Get images
        const [images] = await pool.query(
            'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [id]
        );

        // Get variants (RAM/Storage options) - safe fallback if table not exists
        let variants = [];
        try {
            const [v] = await pool.query(
                `SELECT id, sku, ram, storage, color, price, old_price, stock, is_default
                 FROM product_variants
                 WHERE product_id = ? AND is_active = 1
                 ORDER BY is_default DESC, ram, storage, color, id`,
                [id]
            );
            variants = v;
        } catch (e) {
            // Table product_variants doesn't exist - use empty array
            variants = [];
        }

        // Get reviews
        const [reviews] = await pool.query(
            `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name
             FROM reviews r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.product_id = ?
             ORDER BY r.created_at DESC`,
            [id]
        );
        reviews.forEach(review => Object.assign(review, parseReviewComment(review.comment)));

        // Calculate rating stats
        let avgRating = 0;
        const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach(rv => {
            avgRating += rv.rating;
            starCounts[rv.rating]++;
        });
        if (reviews.length > 0) avgRating = (avgRating / reviews.length).toFixed(1);

        // Get related products
        let related = [];
        if (product.category_id) {
            const [relatedResult] = await pool.query(
                `SELECT p.*, b.name AS brand_name
                 FROM products p
                 LEFT JOIN brands b ON p.brand_id = b.id
                 WHERE p.category_id = ? AND p.id != ?
                 ORDER BY RAND()
                 LIMIT 4`,
                [product.category_id, id]
            );
            related = relatedResult;
        }

        res.json({
            product,
            images,
            variants,
            reviews,
            ratingStats: {
                avgRating,
                total: reviews.length,
                starCounts
            },
            related
        });
    } catch (error) {
        console.error('=== GET PRODUCT ERROR ===');
        console.error('Product ID:', req.params.id);
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Get featured products
router.get('/home/featured', async (req, res) => {
    try {
        // Featured products
        const [products] = await pool.query(
            `SELECT p.*, b.name AS brand_name
             FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             WHERE p.is_featured = 1
             ORDER BY p.created_at DESC
             LIMIT 10`
        );

        // New products
        const [newProducts] = await pool.query(
            `SELECT p.*, b.name AS brand_name
             FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             ORDER BY p.created_at DESC
             LIMIT 10`
        );

        // Promotion products (has discount)
        const [promoProducts] = await pool.query(
            `SELECT p.*, b.name AS brand_name
             FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             WHERE p.discount_percent > 0
             ORDER BY p.discount_percent DESC
             LIMIT 10`
        );

        const [categories] = await pool.query('SELECT id, name, slug FROM categories WHERE is_active = 1 ORDER BY id');

        const [promotions] = await pool.query(
            `SELECT * FROM promotions
             WHERE is_active = 1
             AND (start_date IS NULL OR start_date <= CURDATE())
             AND (end_date IS NULL OR end_date >= CURDATE())
             LIMIT 3`
        );

        res.json({ products, newProducts, promoProducts, categories, promotions });
    } catch (error) {
        console.error('Get featured error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Lấy thông tin nhiều sản phẩm theo IDs (cho chức năng so sánh)
router.post('/compare', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Vui lòng cung cấp danh sách ID sản phẩm!' });
        }

        if (ids.length > 4) {
            return res.status(400).json({ error: 'Chỉ có thể so sánh tối đa 4 sản phẩm!' });
        }

        const placeholders = ids.map(() => '?').join(',');
        const [products] = await pool.query(
            `SELECT p.id, p.name, p.price, p.old_price, p.discount_percent,
                    p.thumbnail, p.stock, p.description,
                    p.ram, p.storage, p.os, p.chipset, p.cpu, p.gpu,
                    p.screen_size, p.screen_resolution,
                    b.name AS brand_name,
                    c.name AS category_name
             FROM products p
             LEFT JOIN brands b ON p.brand_id = b.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id IN (${placeholders})`,
            ids
        );

        // Lấy images cho mỗi sản phẩm
        const productIds = products.map(p => p.id);
        let imagesMap = {};
        if (productIds.length > 0) {
            const [images] = await pool.query(
                `SELECT product_id, image_url, is_primary FROM product_images WHERE product_id IN (${placeholders}) ORDER BY sort_order`,
                productIds
            );
            // Group images by product_id
            images.forEach(img => {
                if (!imagesMap[img.product_id]) imagesMap[img.product_id] = [];
                imagesMap[img.product_id].push(img);
            });
        }

        // Attach images to products
        products.forEach(p => {
            p.images = imagesMap[p.id] || [];
        });

        res.json({ products });
    } catch (error) {
        console.error('Compare products error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

module.exports = router;
