const isProduction = process.env.NODE_ENV === 'production';
const port = Number.parseInt(process.env.PORT, 10) || 3000;

function allowedOrigins() {
    return String(process.env.CORS_ORIGINS || process.env.SITE_URL || '')
        .split(',')
        .map(origin => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);
}

function corsOrigin(origin, callback) {
    const origins = allowedOrigins();
    if (!origin || !isProduction || origins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true);
    }
    const error = new Error('Origin không được phép truy cập!');
    error.status = 403;
    callback(error);
}

function sessionOptions() {
    if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
        throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự khi chạy production.');
    }
    return {
        secret: process.env.SESSION_SECRET || 'development-only-secret',
        name: 'ats.sid',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        }
    };
}

module.exports = { isProduction, port, allowedOrigins, corsOrigin, sessionOptions };
