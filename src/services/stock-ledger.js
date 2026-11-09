function variantLabel(item = {}) {
    return [item.ram, item.storage, item.color].filter(Boolean).join(' / ') || null;
}

async function recordStockMovement(db, movement) {
    const delta = Number(movement.quantity_change);
    const before = Number(movement.stock_before);
    const after = Number(movement.stock_after);
    if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(before) || !Number.isSafeInteger(after)) {
        throw new Error('Thông tin biến động tồn kho không hợp lệ.');
    }

    await db.query(
        `INSERT INTO inventory_movements
            (product_id, variant_id, product_name, variant_label, movement_type,
             quantity_change, stock_before, stock_after, reference_type, reference_id,
             note, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [movement.product_id, movement.variant_id || null, movement.product_name,
            variantLabel(movement), movement.movement_type, delta, before, after,
            movement.reference_type || null, movement.reference_id || null,
            movement.note || null, movement.performed_by || null]
    );
}

async function recordOpeningStock(db, product, variants = [], userId = null) {
    if (variants.length) {
        for (const variant of variants) {
            await recordStockMovement(db, {
                product_id: product.id,
                variant_id: variant.id,
                product_name: product.name,
                ...variant,
                movement_type: 'opening',
                quantity_change: variant.stock,
                stock_before: 0,
                stock_after: variant.stock,
                reference_type: 'product',
                reference_id: product.id,
                note: 'Thêm sản phẩm, tồn kho ban đầu',
                performed_by: userId
            });
        }
        return;
    }

    const stock = Number(product.stock) || 0;
    await recordStockMovement(db, {
        product_id: product.id,
        product_name: product.name,
        movement_type: 'opening',
        quantity_change: stock,
        stock_before: 0,
        stock_after: stock,
        reference_type: 'product',
        reference_id: product.id,
        note: 'Thêm sản phẩm, tồn kho ban đầu',
        performed_by: userId
    });
}

module.exports = { recordStockMovement, recordOpeningStock };
