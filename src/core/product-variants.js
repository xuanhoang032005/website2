const { recordStockMovement } = require('../services/stock-ledger');

function nullableText(value, maximum = 100) {
    const text = value == null ? '' : String(value).trim();
    return text ? text.slice(0, maximum) : null;
}

function parseVariantPayload(raw) {
    if (raw == null || raw === '') return [];
    let source;
    try {
        source = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
        throw Object.assign(new Error('Danh sách phiên bản sản phẩm không hợp lệ!'), { status: 400 });
    }
    if (!Array.isArray(source) || source.length > 50) {
        throw Object.assign(new Error('Mỗi sản phẩm chỉ được có tối đa 50 phiên bản!'), { status: 400 });
    }

    const variants = source.map((item, index) => {
        const price = Number(item?.price);
        const oldPrice = item?.old_price === '' || item?.old_price == null ? null : Number(item.old_price);
        const stock = Number(item?.stock);
        const id = item?.id == null || item.id === '' ? null : Number(item.id);
        const variant = {
            id,
            sku: nullableText(item?.sku, 100),
            ram: nullableText(item?.ram, 50),
            storage: nullableText(item?.storage, 50),
            color: nullableText(item?.color, 100),
            price,
            old_price: oldPrice,
            stock,
            is_default: item?.is_default === true || item?.is_default === 1 || item?.is_default === '1',
            is_active: item?.is_active === false || item?.is_active === 0 || item?.is_active === '0' ? 0 : 1
        };
        if (id !== null && (!Number.isInteger(id) || id < 1)) {
            throw Object.assign(new Error(`Mã phiên bản ở dòng ${index + 1} không hợp lệ!`), { status: 400 });
        }
        if (!variant.ram && !variant.storage && !variant.color) {
            throw Object.assign(new Error(`Phiên bản ${index + 1} phải có RAM, ROM hoặc màu sắc!`), { status: 400 });
        }
        if (!Number.isSafeInteger(price) || price <= 0 ||
            (oldPrice !== null && (!Number.isSafeInteger(oldPrice) || oldPrice < price)) ||
            !Number.isSafeInteger(stock) || stock < 0) {
            throw Object.assign(new Error(`Giá hoặc tồn kho của phiên bản ${index + 1} không hợp lệ!`), { status: 400 });
        }
        return variant;
    });

    if (variants.length > 0) {
        const defaults = variants.filter(variant => variant.is_default);
        if (defaults.length > 1) {
            throw Object.assign(new Error('Chỉ được chọn một phiên bản mặc định!'), { status: 400 });
        }
        if (defaults.length === 0) variants[0].is_default = true;

        const combinations = new Set();
        const skus = new Set();
        for (const variant of variants) {
            const key = [variant.ram || '', variant.storage || '', variant.color || '']
                .map(value => value.toLocaleLowerCase('vi-VN')).join('|');
            if (combinations.has(key)) {
                throw Object.assign(new Error('Không được tạo hai phiên bản trùng RAM, ROM và màu sắc!'), { status: 400 });
            }
            combinations.add(key);

            if (variant.sku) {
                const skuKey = variant.sku.toLocaleLowerCase('vi-VN');
                if (skus.has(skuKey)) {
                    throw Object.assign(new Error(`SKU "${variant.sku}" đang được dùng cho nhiều phiên bản!`), { status: 400 });
                }
                skus.add(skuKey);
            }
        }
    }
    return variants;
}

function variantSummary(variants, fallback) {
    if (!variants.length) return fallback;
    const active = variants.filter(variant => variant.is_active);
    const pool = active.length ? active : variants;
    const primary = pool.find(variant => variant.is_default) || pool[0];
    return {
        price: primary.price,
        old_price: primary.old_price,
        discount_percent: primary.old_price > primary.price
            ? Math.round((1 - primary.price / primary.old_price) * 100) : 0,
        stock: active.reduce((sum, variant) => sum + variant.stock, 0),
        ram: primary.ram,
        storage: primary.storage
    };
}

async function saveProductVariants(db, productId, variants, performedBy = null, productName = '', previousProductStock = null) {
    if (!variants.length) return;
    const [existing] = await db.query(
        'SELECT id, stock, sku, ram, storage, color FROM product_variants WHERE product_id = ? FOR UPDATE',
        [productId]
    );
    const existingById = new Map(existing.map(row => [Number(row.id), row]));
    const existingIds = new Set(existingById.keys());
    const retainedIds = new Set();

    if (existing.length === 0 && Number(previousProductStock) > 0) {
        const stock = Number(previousProductStock);
        await recordStockMovement(db, {
            product_id: productId, product_name: productName || `Sản phẩm #${productId}`,
            movement_type: 'adjustment', quantity_change: -stock, stock_before: stock, stock_after: 0,
            reference_type: 'adjustment', note: 'Chuyển tồn kho sản phẩm sang quản lý theo phiên bản',
            performed_by: performedBy
        });
    }

    await db.query('UPDATE product_variants SET is_default = 0 WHERE product_id = ?', [productId]);
    for (const variant of variants) {
        if (variant.id) {
            if (!existingIds.has(variant.id)) {
                throw Object.assign(new Error('Phiên bản sản phẩm không thuộc sản phẩm này!'), { status: 400 });
            }
            retainedIds.add(variant.id);
            const oldVariant = existingById.get(variant.id);
            await db.query(
                `UPDATE product_variants
                 SET sku=?, ram=?, storage=?, color=?, price=?, old_price=?, stock=?, is_default=?, is_active=?
                 WHERE id=? AND product_id=?`,
                [variant.sku, variant.ram, variant.storage, variant.color, variant.price, variant.old_price,
                    variant.stock, variant.is_default ? 1 : 0, variant.is_active, variant.id, productId]
            );
            if (Number(oldVariant.stock) !== variant.stock) {
                await recordStockMovement(db, {
                    product_id: productId, variant_id: variant.id, product_name: productName || `Sản phẩm #${productId}`,
                    ...variant, movement_type: 'adjustment', quantity_change: variant.stock - Number(oldVariant.stock),
                    stock_before: Number(oldVariant.stock), stock_after: variant.stock,
                    reference_type: 'adjustment', note: 'Điều chỉnh tồn kho từ quản trị viên', performed_by: performedBy
                });
            }
        } else {
            const [result] = await db.query(
                `INSERT INTO product_variants
                    (product_id, sku, ram, storage, color, price, old_price, stock, is_default, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [productId, variant.sku, variant.ram, variant.storage, variant.color, variant.price,
                    variant.old_price, variant.stock, variant.is_default ? 1 : 0, variant.is_active]
            );
            retainedIds.add(Number(result.insertId));
            await recordStockMovement(db, {
                product_id: productId, variant_id: Number(result.insertId), product_name: productName || `Sản phẩm #${productId}`,
                ...variant, movement_type: 'opening', quantity_change: variant.stock,
                stock_before: 0, stock_after: variant.stock, reference_type: 'product', reference_id: productId,
                note: 'Thêm sản phẩm, tồn kho ban đầu của phiên bản', performed_by: performedBy
            });
        }
    }

    const removedIds = [...existingIds].filter(id => !retainedIds.has(id));
    if (removedIds.length) {
        await db.query(
            'UPDATE product_variants SET stock = 0, is_active = 0, is_default = 0 WHERE product_id = ? AND id IN (?)',
            [productId, removedIds]
        );
        for (const id of removedIds) {
            const oldVariant = existingById.get(id);
            if (Number(oldVariant.stock) > 0) {
                await recordStockMovement(db, {
                    product_id: productId, variant_id: id, product_name: productName || `Sản phẩm #${productId}`,
                    ...oldVariant, movement_type: 'adjustment', quantity_change: -Number(oldVariant.stock),
                    stock_before: Number(oldVariant.stock), stock_after: 0,
                    reference_type: 'adjustment', note: 'Ngừng bán phiên bản và loại khỏi tồn kho', performed_by: performedBy
                });
            }
        }
    }
    await syncProductStock(db, productId);
}

async function syncProductStock(db, productId) {
    await db.query(
        `UPDATE products p
         SET p.stock = CASE
             WHEN EXISTS (SELECT 1 FROM product_variants all_v WHERE all_v.product_id = p.id)
             THEN COALESCE((SELECT SUM(v.stock) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1), 0)
             ELSE p.stock
         END
         WHERE p.id = ?`,
        [productId]
    );
}

module.exports = { parseVariantPayload, variantSummary, saveProductVariants, syncProductStock };
