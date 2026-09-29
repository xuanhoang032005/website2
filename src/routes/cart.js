const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get cart count (for badge)
router.get('/count', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.json({ count: 0 });
        }

        const [rows] = await pool.query(
            'SELECT SUM(quantity) as count FROM cart WHERE user_id = ?',
            [req.session.user_id]
        );

        res.json({ count: rows[0].count || 0 });
    } catch (error) {
        console.error('Cart count error:', error);
        res.json({ count: 0 });
    }
});

// Get cart
router.get('/', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.json({ items: [], total: 0 });
        }

        const [items] = await pool.query(
            `SELECT c.id, c.id AS cart_id, c.quantity,
                    c.variant_id, p.id AS product_id, p.name,
                    COALESCE(v.price, p.price) AS price,
                    COALESCE(v.old_price, p.old_price) AS old_price,
                    CASE WHEN COALESCE(v.old_price, p.old_price) > COALESCE(v.price, p.price)
                         THEN ROUND((1 - COALESCE(v.price, p.price) / COALESCE(v.old_price, p.old_price)) * 100)
                         ELSE 0 END AS discount_percent,
                    p.thumbnail, COALESCE(v.stock, p.stock) AS stock,
                    COALESCE(v.ram, p.ram) AS ram, COALESCE(v.storage, p.storage) AS storage,
                    v.color, v.sku,
                    b.name AS brand_name
             FROM cart c
             JOIN products p ON c.product_id = p.id
             LEFT JOIN product_variants v ON c.variant_id = v.id
             LEFT JOIN brands b ON p.brand_id = b.id
             WHERE c.user_id = ?
             ORDER BY c.id DESC`,
            [req.session.user_id]
        );

        const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

        res.json({ items, total });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Add to cart
router.post('/add', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const productId = Number.parseInt(req.body.product_id, 10);
        const requestedVariantId = req.body.variant_id == null || req.body.variant_id === ''
            ? null : Number.parseInt(req.body.variant_id, 10);
        const quantity = Number(req.body.qty ?? 1);
        const user_id = req.session.user_id;

        if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ error: 'Sản phẩm hoặc số lượng không hợp lệ!' });
        }

        const [products] = await pool.query(
            'SELECT id, stock, name FROM products WHERE id = ?',
            [productId]
        );

        if (products.length === 0) {
            return res.status(400).json({ error: 'Sản phẩm không tồn tại!' });
        }

        let selectedVariant = null;
        if (requestedVariantId !== null && (!Number.isInteger(requestedVariantId) || requestedVariantId < 1)) {
            return res.status(400).json({ error: 'Phiên bản sản phẩm không hợp lệ!' });
        }
        const [variants] = await pool.query(
            `SELECT id, stock, ram, storage, color FROM product_variants
             WHERE product_id = ? AND is_active = 1
             ORDER BY is_default DESC, id ASC`,
            [productId]
        );
        if (variants.length) {
            selectedVariant = requestedVariantId
                ? variants.find(variant => Number(variant.id) === requestedVariantId)
                : variants[0];
            if (!selectedVariant) return res.status(400).json({ error: 'Phiên bản sản phẩm không tồn tại hoặc đã ngừng bán!' });
        } else if (requestedVariantId !== null) {
            return res.status(400).json({ error: 'Sản phẩm này không có phiên bản đã chọn!' });
        }

        const stock = Number(selectedVariant ? selectedVariant.stock : products[0].stock);
        
        if (stock < 1) {
            return res.status(400).json({ error: 'Sản phẩm đã hết hàng!' });
        }

        if (quantity > stock) {
            return res.status(400).json({ error: 'Số lượng vượt quá kho (' + stock + '). Vui lòng nhập số lượng nhỏ hơn!' });
        }

        const [existing] = await pool.query(
            'SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ? AND variant_id <=> ?',
            [user_id, productId, selectedVariant?.id || null]
        );

        if (existing.length > 0) {
            const currentQty = existing[0].quantity;
            const newQty = currentQty + quantity;
            
            if (newQty > stock) {
                return res.status(400).json({ error: 'Tổng số lượng trong giỏ hàng (' + newQty + ') vượt quá kho (' + stock + '). Vui lòng giảm số lượng!' });
            }
            
            // Update quantity
            await pool.query(
                'UPDATE cart SET quantity = ? WHERE id = ?',
                [newQty, existing[0].id]
            );
            return res.json({ success: true, message: 'Đã cập nhật số lượng trong giỏ hàng!' });
        }

        // Insert new
        await pool.query(
            'INSERT INTO cart (user_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
            [user_id, productId, selectedVariant?.id || null, quantity]
        );

        res.json({ success: true, message: 'Đã thêm vào giỏ hàng!' });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Update quantity
router.put('/:id', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { id } = req.params;
        const quantity = Number(req.body.quantity);

        if (!Number.isInteger(quantity)) {
            return res.status(400).json({ error: 'Số lượng phải là số nguyên!' });
        }

        // Get cart item and product stock
        const [cartItems] = await pool.query(
            `SELECT c.*, COALESCE(v.stock, p.stock) AS stock, p.name
             FROM cart c 
             JOIN products p ON c.product_id = p.id
             LEFT JOIN product_variants v ON c.variant_id = v.id
             WHERE c.id = ? AND c.user_id = ?`,
            [id, req.session.user_id]
        );

        if (cartItems.length === 0) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại trong giỏ hàng!' });
        }

        const item = cartItems[0];

        // Validate quantity
        if (quantity < 1) {
            // Delete item if quantity is 0
            await pool.query('DELETE FROM cart WHERE id = ?', [id]);
            return res.json({ success: true, message: 'Đã xóa sản phẩm khỏi giỏ hàng!' });
        }

        if (quantity > item.stock) {
            return res.status(400).json({ error: 'Số lượng vượt quá kho (' + item.stock + '). Vui lòng nhập số lượng nhỏ hơn!' });
        }

        await pool.query(
            'UPDATE cart SET quantity = ? WHERE id = ?',
            [quantity, id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Clear cart (phải đặt TRƯỚC /:id để tránh bị bắt nhầm)
router.delete('/all', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        await pool.query('DELETE FROM cart WHERE user_id = ?', [req.session.user_id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Remove item
router.delete('/:id', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { id } = req.params;

        await pool.query(
            'DELETE FROM cart WHERE id = ? AND user_id = ?',
            [id, req.session.user_id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Buy now - tạo token tạm thời để mua 1 sản phẩm không ảnh hưởng giỏ hàng
router.post('/buy-now', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const productId = Number.parseInt(req.body.product_id, 10);
        const requestedVariantId = req.body.variant_id == null || req.body.variant_id === ''
            ? null : Number.parseInt(req.body.variant_id, 10);
        const quantity = Number(req.body.quantity);

        // Validate
        if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ error: 'Thông tin sản phẩm không hợp lệ!' });
        }

        // Check stock
        const [products] = await pool.query(
            'SELECT id, stock, name, price, old_price, ram, storage, thumbnail FROM products WHERE id = ?',
            [productId]
        );
        if (products.length === 0) {
            return res.status(400).json({ error: 'Sản phẩm không tồn tại!' });
        }

        if (requestedVariantId !== null && (!Number.isInteger(requestedVariantId) || requestedVariantId < 1)) {
            return res.status(400).json({ error: 'Phiên bản sản phẩm không hợp lệ!' });
        }
        const [variants] = await pool.query(
            `SELECT id, sku, ram, storage, color, price, old_price, stock
             FROM product_variants WHERE product_id = ? AND is_active = 1
             ORDER BY is_default DESC, id ASC`,
            [productId]
        );
        const selectedVariant = variants.length
            ? (requestedVariantId ? variants.find(variant => Number(variant.id) === requestedVariantId) : variants[0])
            : null;
        if (variants.length && !selectedVariant) {
            return res.status(400).json({ error: 'Phiên bản sản phẩm không tồn tại hoặc đã ngừng bán!' });
        }
        if (!variants.length && requestedVariantId !== null) {
            return res.status(400).json({ error: 'Sản phẩm này không có phiên bản đã chọn!' });
        }
        const chosen = selectedVariant || products[0];
        if (Number(chosen.stock) < quantity) {
            return res.status(400).json({ error: 'Số lượng vượt quá kho (' + chosen.stock + ')!' });
        }

        // Tạo token ngẫu nhiên
        const token = require('crypto').randomBytes(16).toString('hex');

        // Lưu vào session
        req.session.buyNow = {
            token: token,
            product_id: productId,
            variant_id: selectedVariant?.id || null,
            quantity,
            product_name: products[0].name,
            price: Number(chosen.price),
            old_price: chosen.old_price == null ? null : Number(chosen.old_price),
            ram: chosen.ram || null,
            storage: chosen.storage || null,
            color: chosen.color || null,
            sku: chosen.sku || null,
            thumbnail: products[0].thumbnail,
            stock: Number(chosen.stock),
            created_at: Date.now()
        };

        res.json({ success: true, token: token });
    } catch (error) {
        console.error('Buy now error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Get buy now data
router.get('/buy-now', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { token } = req.query;

        if (!req.session.buyNow || req.session.buyNow.token !== token) {
            return res.status(400).json({ error: 'Phiên mua ngay không hợp lệ!' });
        }

        // Kiểm tra token hết hạn (15 phút)
        if (Date.now() - req.session.buyNow.created_at > 15 * 60 * 1000) {
            delete req.session.buyNow;
            return res.status(400).json({ error: 'Phiên mua ngay đã hết hạn!' });
        }

        res.json({ success: true, buyNow: req.session.buyNow });
    } catch (error) {
        console.error('Get buy now error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

module.exports = router;
