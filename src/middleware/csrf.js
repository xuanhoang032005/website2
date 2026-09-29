const { allowedOrigins, isProduction } = require('../config/runtime');
const { HttpError } = require('../core/http-error');

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const tokenCookie = 'csrf_token';
const tokenHeader = 'x-csrf-token';

function csrfToken(req, res) {
    const cookies = Object.fromEntries((req.get('cookie') || '').split(';').map(part => {
        const index = part.indexOf('=');
        if (index < 0) return ['', ''];
        let value = part.slice(index + 1).trim();
        try { value = decodeURIComponent(value); } catch (_) { return ['', '']; }
        return [part.slice(0, index).trim(), value];
    }).filter(([name]) => name));
    const existing = cookies[tokenCookie];
    if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
    const token = require('crypto').randomBytes(32).toString('hex');
    const attributes = [`${tokenCookie}=${token}`, 'Path=/', 'SameSite=Lax'];
    if (isProduction) attributes.push('Secure');
    if (typeof res.append === 'function') res.append('Set-Cookie', attributes.join('; '));
    else if (typeof res.setHeader === 'function') res.setHeader('Set-Cookie', attributes.join('; '));
    return token;
}

function normalizeOrigin(value) {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch (error) {
        return null;
    }
}

function requestOrigins(req) {
    const origins = new Set(allowedOrigins().map(normalizeOrigin).filter(Boolean));
    const ownOrigin = normalizeOrigin(`${req.protocol}://${req.get('host') || ''}`);
    if (ownOrigin) origins.add(ownOrigin);
    if (!isProduction) {
        origins.add('http://localhost:3000');
        origins.add('http://127.0.0.1:3000');
    }
    return origins;
}

function csrfProtection(req, res, next) {
    const token = csrfToken(req, res);
    if (typeof res.setHeader === 'function') res.setHeader('X-CSRF-Token', token);
    if (safeMethods.has(req.method)) return next();

    const suppliedToken = req.get(tokenHeader) || req.body?._csrf;
    if (suppliedToken && suppliedToken !== token) {
        return next(new HttpError(403, 'CSRF_TOKEN_INVALID', 'Mã CSRF không hợp lệ.'));
    }

    const allowed = requestOrigins(req);
    const origin = normalizeOrigin(req.get('origin'));
    if (origin) {
        if (allowed.has(origin)) return next();
        return next(new HttpError(403, 'CSRF_ORIGIN_REJECTED', 'Nguồn gửi yêu cầu không hợp lệ.'));
    }

    const referer = normalizeOrigin(req.get('referer'));
    if (referer) {
        if (allowed.has(referer)) return next();
        return next(new HttpError(403, 'CSRF_REFERER_REJECTED', 'Nguồn gửi yêu cầu không hợp lệ.'));
    }

    if (req.get('sec-fetch-site') === 'cross-site') {
        return next(new HttpError(403, 'CSRF_CROSS_SITE_REJECTED', 'Yêu cầu khác nguồn đã bị từ chối.'));
    }

    // Non-browser clients do not send Origin/Referer/Sec-Fetch-Site. They are
    // still subject to authentication and rate limits, while browsers receive
    // strict origin checks for every state-changing request.
    next();
}

module.exports = { csrfProtection, csrfToken, normalizeOrigin, requestOrigins };
