const { HttpError } = require('../core/http-error');

function isAdmin(req) {
    return Boolean(req.session?.user_id && req.session.role === 'admin');
}

function requireAdminApi(req, res, next) {
    if (!req.session?.user_id) return next(new HttpError(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập!'));
    if (!isAdmin(req)) return next(new HttpError(403, 'ADMIN_REQUIRED', 'Chỉ quản trị viên được thực hiện thao tác này!'));
    next();
}

function requireAdmin(req, res, next) {
    if (isAdmin(req)) return next();
    const acceptsJson = req.xhr
        || req.method !== 'GET'
        || (req.headers['x-requested-with'] || '') === 'XMLHttpRequest'
        || (req.headers['content-type'] || '').includes('json')
        || (req.headers['content-type'] || '').includes('multipart/form-data')
        || (req.get('accept') || '').includes('application/json');
    if (acceptsJson) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!',
            requireLogin: true
        });
    }
    res.redirect('/login');
}

module.exports = { requireAdmin, requireAdminApi };
