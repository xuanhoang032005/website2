const crypto = require('crypto');
const metrics = require('../config/metrics');
const logger = require('../config/logger');

function requestId(req, res, next) {
    const id = req.get('x-request-id') || crypto.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-ID', id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        metrics.observe(req.method, req.path, res.statusCode, durationMs);
        logger.info('http_request', { request_id: id, method: req.method, path: req.path, status: res.statusCode, duration_ms: Math.round(durationMs * 100) / 100 });
    });
    next();
}

module.exports = { requestId };
