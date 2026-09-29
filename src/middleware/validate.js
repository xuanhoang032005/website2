const { HttpError } = require('../core/http-error');

function stringField(options = {}) {
    const {
        required = false,
        min = 0,
        max = 255,
        trim = true,
        pattern,
        disallowHtml = false,
        label = 'Giá trị'
    } = options;
    return value => {
        if (value == null || value === '') {
            if (required) throw new Error(`${label} là bắt buộc.`);
            return value == null ? undefined : '';
        }
        if (typeof value !== 'string') throw new Error(`${label} phải là chuỗi.`);
        const normalized = trim ? value.trim() : value;
        if (required && !normalized) throw new Error(`${label} là bắt buộc.`);
        if (normalized.length < min || normalized.length > max) {
            throw new Error(`${label} phải có từ ${min} đến ${max} ký tự.`);
        }
        if (disallowHtml && /[<>]/.test(normalized)) throw new Error(`${label} chứa ký tự không hợp lệ.`);
        if (pattern && !pattern.test(normalized)) throw new Error(`${label} không hợp lệ.`);
        return normalized;
    };
}

function emailField(options = {}) {
    const parse = stringField({ required: options.required, max: 255, label: options.label || 'Email' });
    return value => {
        const normalized = parse(value);
        if (normalized === undefined || normalized === '') return normalized;
        const email = normalized.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email không hợp lệ.');
        return email;
    };
}

function integerField(options = {}) {
    const { required = false, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, label = 'Giá trị' } = options;
    return value => {
        if (value == null || value === '') {
            if (required) throw new Error(`${label} là bắt buộc.`);
            return undefined;
        }
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} không hợp lệ.`);
        return number;
    };
}

function enumField(values, options = {}) {
    const allowed = new Set(values);
    return value => {
        if (value == null || value === '') {
            if (options.required) throw new Error(`${options.label || 'Giá trị'} là bắt buộc.`);
            return undefined;
        }
        if (!allowed.has(value)) throw new Error(`${options.label || 'Giá trị'} không hợp lệ.`);
        return value;
    };
}

function validateBody(schema) {
    return function bodyValidation(req, res, next) {
        const source = req.body && typeof req.body === 'object' ? req.body : {};
        const normalized = { ...source };
        const fields = [];

        for (const [name, parse] of Object.entries(schema)) {
            try {
                const value = parse(source[name]);
                if (value === undefined) delete normalized[name];
                else normalized[name] = value;
            } catch (error) {
                fields.push({ field: name, message: error.message });
            }
        }

        if (fields.length) {
            return next(new HttpError(400, 'VALIDATION_ERROR', fields[0].message, { fields }));
        }
        req.body = normalized;
        next();
    };
}

module.exports = { validateBody, stringField, emailField, integerField, enumField };
