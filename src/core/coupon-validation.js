const MAX_MONEY = 1_000_000_000_000;

function numberField(value, label, { minimum = 0, maximum = MAX_MONEY, nullable = false, integer = false } = {}) {
    if (value === '' || value == null) {
        if (nullable) return null;
        return minimum;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isSafeInteger(number))) {
        throw Object.assign(new Error(`${label} không hợp lệ!`), { status: 400 });
    }
    return number;
}

function parseCouponPayload(body = {}, { requireDescription = true } = {}) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const discountType = body.discount_type || 'percent';

    if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
        throw Object.assign(new Error('Mã giảm giá phải có 3-50 ký tự chữ, số, gạch ngang hoặc gạch dưới!'), { status: 400 });
    }
    if ((requireDescription && !description) || description.length > 255) {
        throw Object.assign(new Error('Mô tả mã giảm giá phải có từ 1 đến 255 ký tự!'), { status: 400 });
    }
    if (!['percent', 'fixed'].includes(discountType)) {
        throw Object.assign(new Error('Loại giảm giá không hợp lệ!'), { status: 400 });
    }

    const discountValue = numberField(body.discount_value, 'Giá trị giảm', {
        minimum: 1,
        maximum: discountType === 'percent' ? 100 : MAX_MONEY
    });
    const minimumOrder = numberField(body.min_order_value, 'Giá trị đơn tối thiểu');
    const maximumDiscount = numberField(body.max_discount, 'Mức giảm tối đa', { minimum: 1, nullable: true });
    const usageLimit = numberField(body.usage_limit, 'Giới hạn lượt dùng', {
        minimum: 1,
        maximum: Number.MAX_SAFE_INTEGER,
        nullable: true,
        integer: true
    });

    let expiresAt = null;
    if (body.expires_at) {
        const rawDate = String(body.expires_at).trim();
        const date = new Date(rawDate.length === 10 ? `${rawDate}T23:59:59` : rawDate);
        if (Number.isNaN(date.getTime())) {
            throw Object.assign(new Error('Ngày hết hạn không hợp lệ!'), { status: 400 });
        }
        expiresAt = rawDate.length === 10 ? `${rawDate} 23:59:59` : rawDate;
    }

    return {
        code,
        description,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_value: minimumOrder,
        max_discount: maximumDiscount,
        usage_limit: usageLimit,
        expires_at: expiresAt,
        is_active: body.is_active === true || body.is_active === 1 || body.is_active === '1' ? 1 : 0
    };
}

module.exports = { parseCouponPayload };
