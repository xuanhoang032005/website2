const multer = require('multer');
const { HttpError } = require('../core/http-error');
const logger = require('../config/logger');

function errorPayload(code, message, details) {
    const payload = { success: false, error: message, code };
    if (details !== undefined) payload.details = details;
    return payload;
}

function notFoundHandler(req, res) {
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
        return res.status(404).json(errorPayload('NOT_FOUND', 'Không tìm thấy tài nguyên!'));
    }
    res.status(404).send('Không tìm thấy trang!');
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
        return res.status(400).json(errorPayload(
            'INVALID_UPLOAD',
            'File tải lên không hợp lệ hoặc vượt quá dung lượng cho phép!'
        ));
    }
    if (error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed') {
        return res.status(400).json(errorPayload('INVALID_JSON', 'Dữ liệu JSON không hợp lệ.'));
    }
    if (error && error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json(errorPayload('CONFLICT', 'Dữ liệu đã tồn tại hoặc bị trùng.'));
    }
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) {
        logger.error('request_failed', { request_id: req.requestId, error: error.stack || error.message, path: req.path });
        logger.alertError(error, { request_id: req.requestId, path: req.path }).catch(() => {});
    }
    const message = status < 500 && error.message ? error.message : 'Đã xảy ra lỗi trên máy chủ!';
    const code = error instanceof HttpError && error.code
        ? error.code
        : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    res.status(status).json(errorPayload(code, message, error instanceof HttpError ? error.details : undefined));
}

module.exports = { notFoundHandler, errorHandler, errorPayload };
