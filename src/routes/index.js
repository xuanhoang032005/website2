const authRoutes = require('./auth');
const productsRoutes = require('./products');
const cartRoutes = require('./cart');
const ordersRoutes = require('./orders');
const apiRoutes = require('./api');
const adminRoutes = require('./admin');
const wishlistRoutes = require('./wishlist');
const couponsRoutes = require('./coupons');
const messagesRoutes = require('./messages');
const healthRoutes = require('./health');
const aiChatRoutes = require('./ai-chat');
const serviceRequestRoutes = require('./service-requests');

function registerRoutes(app) {
    app.use(healthRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/products', productsRoutes);
    app.use('/api/cart', cartRoutes);
    app.use('/api/orders', ordersRoutes);
    app.use('/api/wishlist', wishlistRoutes);
    app.use('/api/coupons', couponsRoutes);
    app.use('/api/messages', messagesRoutes);
    app.use('/api/chat', aiChatRoutes);
    app.use('/api/service-requests', serviceRequestRoutes);
    app.use('/api', apiRoutes);
    app.use('/admin', adminRoutes);
}

module.exports = registerRoutes;
