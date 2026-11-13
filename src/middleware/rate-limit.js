const pool = require('../config/database');

async function incrementDatabaseBucket(database, key, windowMs) {
    const windowMicros = Math.max(1, Math.floor(windowMs * 1000));
    await database.query(
        `INSERT INTO rate_limit_buckets (bucket_key, window_started_at, reset_at, request_count)
         VALUES (?, NOW(3), TIMESTAMPADD(MICROSECOND, ?, NOW(3)), 1)
         ON DUPLICATE KEY UPDATE
            request_count = IF(reset_at <= NOW(3), 1, request_count + 1),
            window_started_at = IF(reset_at <= NOW(3), NOW(3), window_started_at),
            reset_at = IF(reset_at <= NOW(3), TIMESTAMPADD(MICROSECOND, ?, NOW(3)), reset_at)`,
        [key, windowMicros, windowMicros]
    );
    const [[bucket]] = await database.query(
        'SELECT request_count, reset_at FROM rate_limit_buckets WHERE bucket_key = ?',
        [key]
    );
    if (!bucket) throw new Error('Rate limit bucket was not persisted.');
    return { count: Number(bucket.request_count), resetAt: new Date(bucket.reset_at).getTime() };
}

function createRateLimiter({
    windowMs,
    max,
    namespace = 'api',
    keyGenerator = req => req.ip || req.socket?.remoteAddress || 'unknown',
    message = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau!',
    database = pool,
    increment = incrementDatabaseBucket
}) {
    return function rateLimit(req, res, next) {
        const identity = keyGenerator(req);
        const key = `${namespace}:${identity}`;
        increment(database, key, windowMs).then(bucket => {
            const remaining = Math.max(0, max - bucket.count);
            res.setHeader('RateLimit-Limit', max);
            res.setHeader('RateLimit-Remaining', remaining);
            res.setHeader('RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
            if (bucket.count > max) {
                res.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)));
                return res.status(429).json({ success: false, code: 'RATE_LIMITED', error: message });
            }
            return next();
        }).catch(next);
    };
}

const apiRateLimit = createRateLimiter({
    namespace: 'api',
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 1200 : 5000
});
const loginRateLimit = createRateLimiter({
    namespace: 'login',
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau!'
});
const passwordResetRateLimit = createRateLimiter({
    namespace: 'password-reset',
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Bạn đã yêu cầu quá nhiều mã xác nhận. Vui lòng thử lại sau!'
});

module.exports = { createRateLimiter, incrementDatabaseBucket, apiRateLimit, loginRateLimit, passwordResetRateLimit };
