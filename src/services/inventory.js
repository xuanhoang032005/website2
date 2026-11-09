const { recordStockMovement } = require('./stock-ledger');
const { syncProductStock } = require('../core/product-variants');

function inventoryError(status, message) {
    return Object.assign(new Error(message), { status });
}

async function adjustStock(db, item, change) {
    const productId = Number(item.product_id);
    const variantId = item.variant_id == null ? null : Number(item.variant_id);
    const delta = Number(change.delta);
    if (!Number.isSafeInteger(productId) || productId < 1 ||
        (variantId !== null && (!Number.isSafeInteger(variantId) || variantId < 1)) ||
        !Number.isSafeInteger(delta) || delta === 0) {
        throw inventoryError(400, 'Thông tin điều chỉnh tồn kho không hợp lệ.');
    }

    const [products] = await db.query('SELECT id, name FROM products WHERE id = ? FOR UPDATE', [productId]);
    if (!products.length) throw inventoryError(404, 'Sản phẩm không tồn tại.');

    let currentStock;
    let details = {};
    if (variantId !== null) {
        const [variants] = await db.query(
            `SELECT id, stock, ram, storage, color FROM product_variants
             WHERE id = ? AND product_id = ? AND (is_active = 1 OR ? = 1) FOR UPDATE`,
            [variantId, productId, change.allowInactive ? 1 : 0]
        );
        if (!variants.length) throw inventoryError(404, 'Phiên bản không tồn tại hoặc đã ngừng bán.');
        currentStock = Number(variants[0].stock);
        details = variants[0];
    } else {
        const [variants] = await db.query(
            'SELECT id FROM product_variants WHERE product_id = ? LIMIT 1 FOR UPDATE',
            [productId]
        );
        if (variants.length) {
            throw inventoryError(400, 'Sản phẩm được quản lý theo phiên bản. Hãy chọn một phiên bản đang bán.');
        }
        const [rows] = await db.query('SELECT stock FROM products WHERE id = ? FOR UPDATE', [productId]);
        currentStock = Number(rows[0].stock);
    }

    const nextStock = currentStock + delta;
    if (nextStock < 0) throw inventoryError(400, 'Số lượng điều chỉnh không được làm tồn kho âm.');

    const [updated] = variantId !== null
        ? await db.query('UPDATE product_variants SET stock = ? WHERE id = ? AND product_id = ?', [nextStock, variantId, productId])
        : await db.query('UPDATE products SET stock = ? WHERE id = ?', [nextStock, productId]);
    if (updated.affectedRows !== 1) throw inventoryError(409, 'Tồn kho vừa thay đổi. Hãy tải lại rồi thử lại.');
    if (variantId !== null) await syncProductStock(db, productId);

    await recordStockMovement(db, {
        product_id: productId,
        variant_id: variantId,
        product_name: products[0].name,
        ...details,
        movement_type: change.movement_type,
        quantity_change: delta,
        stock_before: currentStock,
        stock_after: nextStock,
        reference_type: change.reference_type,
        reference_id: change.reference_id,
        note: change.note,
        performed_by: change.performed_by
    });
    return { stock_before: currentStock, stock_after: nextStock };
}

async function adjustOrderStock(db, items, { orderId, userId, movementType, note }) {
    for (const item of items) {
        await adjustStock(db, item, {
            delta: movementType === 'sale' ? -Number(item.quantity) : Number(item.quantity),
            movement_type: movementType,
            reference_type: 'order',
            reference_id: Number(orderId),
            note: `${note}: ${item.name || item.product_id}`,
            performed_by: userId,
            allowInactive: movementType === 'cancellation'
        });
    }
}

module.exports = { adjustStock, adjustOrderStock };
