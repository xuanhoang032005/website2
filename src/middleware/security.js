function securityHeaders(req, res, next) {
    const directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "img-src 'self' data: https://res.cloudinary.com https://www.gstatic.com",
        "frame-src 'self' https://www.google.com",
        "connect-src 'self' ws: wss:"
    ];
    if (process.env.NODE_ENV === 'production') directives.push('upgrade-insecure-requests');
    res.setHeader('Content-Security-Policy', directives.join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path === '/api' || req.path.startsWith('/api/') || req.path === '/admin' || req.path.startsWith('/admin/')) {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
}

module.exports = { securityHeaders };
