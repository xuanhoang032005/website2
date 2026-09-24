const express = require('express');
const { runStoreAssistant, isStoreDataUnavailable } = require('../services/store-ai');
const { createRateLimiter } = require('../middleware/rate-limit');

const router = express.Router();
const MAX_SESSION_HISTORY_MESSAGES = 100;
const aiRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Bạn đã gửi quá nhiều câu hỏi. Vui lòng thử lại sau!'
});

function sessionHistory(session) {
    if (!Array.isArray(session?.ai_chat_history)) return [];
    return session.ai_chat_history.slice(-MAX_SESSION_HISTORY_MESSAGES).flatMap(item => {
        if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return [];
        const content = item.content.trim().slice(0, 1000);
        if (!content) return [];
        const entry = { role: item.role, content };
        if (item.role === 'assistant' && Array.isArray(item.products)) {
            entry.products = item.products.slice(0, 6);
        }
        return [entry];
    });
}

function productsForHistory(products) {
    if (!Array.isArray(products)) return [];
    return products.slice(0, 6).map(product => ({
        id: Number(product.id),
        name: String(product.name || 'Sản phẩm').slice(0, 255),
        price: Number(product.price || 0),
        old_price: product.old_price == null ? null : Number(product.old_price),
        thumbnail: product.thumbnail || null
    }));
}

router.get('/ai/history', (req, res) => {
    res.json({ success: true, history: sessionHistory(req.session) });
});

router.post('/ai', aiRateLimit, async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ success: false, error: 'Vui lòng nhập câu hỏi!' });
    if (message.length > 1000) {
        return res.status(400).json({ success: false, error: 'Câu hỏi không được vượt quá 1000 ký tự!' });
    }
    try {
        const history = sessionHistory(req.session);
        const result = await runStoreAssistant({
            message,
            history: history.length ? history : req.body.history,
            userId: req.session?.user_id
        });
        req.session.ai_chat_history = [
            ...history,
            { role: 'user', content: message },
            {
                role: 'assistant',
                content: result.reply,
                products: productsForHistory(result.products)
            }
        ].slice(-MAX_SESSION_HISTORY_MESSAGES);
        return res.json({ success: true, ...result });
    } catch (error) {
        if (error.code === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ success: false, error: 'Trợ lý AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.' });
        }
        if (error.code === 'AI_TIMEOUT') {
            console.error('AI Chat error:', error.code, error.status || '');
            return res.status(504).json({ success: false, error: 'Trợ lý AI phản hồi quá chậm. Vui lòng thử lại.' });
        }
        if (isStoreDataUnavailable(error)) {
            console.error('AI Chat error: STORE_DATA_UNAVAILABLE', error.code || '');
            return res.status(503).json({ success: false, error: 'Dữ liệu cửa hàng đang tạm gián đoạn. Vui lòng thử lại sau.' });
        }
        console.error('AI Chat error:', error.code || error.name, error.status || '', error.upstreamCode || '');
        return res.status(502).json({ success: false, error: 'Trợ lý AI đang tạm gián đoạn. Vui lòng thử lại sau.' });
    }
});

module.exports = router;
module.exports.sessionHistory = sessionHistory;
module.exports.productsForHistory = productsForHistory;
