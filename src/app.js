const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const configureGoogleOAuth = require('./config/passport');
const { corsOrigin, isProduction, sessionOptions } = require('./config/runtime');
const { publicDir, viewsDir } = require('./core/paths');
const registerRoutes = require('./routes');
const createPageRouter = require('./routes/pages');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');
const { apiRateLimit } = require('./middleware/rate-limit');
const { securityHeaders } = require('./middleware/security');
const { csrfProtection } = require('./middleware/csrf');
const { requestId } = require('./middleware/observability');
const { snapshot } = require('./config/metrics');
const queue = require('./services/background-jobs');

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(requestId);
    if (isProduction) app.set('trust proxy', 1);
    app.use(securityHeaders);

    const sessionMiddleware = session(sessionOptions());
    app.use(sessionMiddleware);
    const googleOAuthEnabled = configureGoogleOAuth(passport);
    app.use(passport.initialize());
    app.use(passport.session());
    app.use((req, res, next) => {
        if (req.user?.id) {
            req.session.user_id = req.user.id;
            req.session.role = req.user.role || 'customer';
            if (!req.session.support_chat_started_at) {
                req.session.support_chat_started_at = new Date().toISOString();
            }
        }
        next();
    });

    app.use(cors({ origin: corsOrigin, credentials: true }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(csrfProtection);

    app.use('/components', express.static(path.join(viewsDir, 'components')));
    app.use(express.static(publicDir));
    app.use('/images/products', express.static(path.join(publicDir, 'assets', 'images', 'products')));
    app.use('/uploads/products', express.static(path.join(publicDir, 'assets', 'images', 'products')));
    app.use('/images/banners', express.static(path.join(publicDir, 'uploads', 'banners')));
    app.get(['/assets/images/products/:filename', '/images/products/:filename', '/uploads/products/:filename', '/images/banners/:filename'], (req, res) => {
        res.sendFile(path.join(publicDir, 'images', 'no-image.svg'));
    });
    app.get(['/favicon.ico', '/favicon.svg'], (req, res) => res.sendFile(path.join(publicDir, 'favicon.svg')));

    app.use('/api', apiRateLimit);
    app.get('/metrics', (req, res) => {
        const configuredToken = process.env.METRICS_TOKEN;
        if (configuredToken && req.get('authorization') !== `Bearer ${configuredToken}`) {
            return res.status(401).json({ success: false, code: 'METRICS_AUTH_REQUIRED', error: 'Unauthorized' });
        }
        res.json({ ...snapshot(), jobs: queue.snapshot() });
    });
    registerRoutes(app);
    app.use(createPageRouter(passport, googleOAuthEnabled));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, sessionMiddleware };
}

module.exports = { createApp };
