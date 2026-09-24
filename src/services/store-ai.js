const pool = require('../config/database');

const MAX_HISTORY_MESSAGES = 8;
const MAX_TOOL_ROUNDS = 3;
const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 60000;
const GEMINI_THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high']);
const DATABASE_UNAVAILABLE_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'PROTOCOL_CONNECTION_LOST',
    'ER_CON_COUNT_ERROR'
]);

const nullableString = { type: ['string', 'null'] };
const nullableInteger = { type: ['integer', 'null'] };

const TOOL_DEFINITIONS = [
    {
        type: 'function',
        name: 'search_products',
        description: 'Tìm điện thoại hoặc sản phẩm theo tên, thương hiệu, khoảng giá, RAM, bộ nhớ và tình trạng còn hàng.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                query: nullableString,
                brand: nullableString,
                min_price: nullableInteger,
                max_price: nullableInteger,
                ram: nullableString,
                storage: nullableString,
                in_stock: { type: 'boolean' },
                sort: { type: 'string', enum: ['relevance', 'price_asc', 'price_desc', 'discount', 'newest'] },
                limit: { type: 'integer', minimum: 1, maximum: 6 }
            },
            required: ['query', 'brand', 'min_price', 'max_price', 'ram', 'storage', 'in_stock', 'sort', 'limit'],
            additionalProperties: false
        }
    },
    {
        type: 'function',
        name: 'get_product_details',
        description: 'Lấy thông tin và cấu hình chi tiết của đúng một sản phẩm từ cơ sở dữ liệu.',
        strict: true,
        parameters: {
            type: 'object',
            properties: { product_id: nullableInteger, product_name: nullableString },
            required: ['product_id', 'product_name'],
            additionalProperties: false
        }
    },
    {
        type: 'function',
        name: 'check_stock',
        description: 'Kiểm tra tồn kho hiện tại của một sản phẩm. Phải dùng tool này trước khi khẳng định còn hoặc hết hàng.',
        strict: true,
        parameters: {
            type: 'object',
            properties: { product_id: nullableInteger, product_name: nullableString },
            required: ['product_id', 'product_name'],
            additionalProperties: false
        }
    },
    {
        type: 'function',
        name: 'recommend_products',
        description: 'Tư vấn một nhóm sản phẩm phù hợp với nhu cầu, ngân sách và thương hiệu khách mong muốn.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                need: { type: 'string' },
                budget: nullableInteger,
                brand: nullableString,
                max_results: { type: 'integer', minimum: 1, maximum: 6 }
            },
            required: ['need', 'budget', 'brand', 'max_results'],
            additionalProperties: false
        }
    },
    {
        type: 'function',
        name: 'get_order_status',
        description: 'Tra cứu đơn hàng của chính khách đang đăng nhập bằng mã đơn, mã thanh toán hoặc lấy đơn gần nhất.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                order_id: nullableInteger,
                payment_code: nullableString,
                latest: { type: 'boolean' }
            },
            required: ['order_id', 'payment_code', 'latest'],
            additionalProperties: false
        }
    },
    {
        type: 'function',
        name: 'prepare_purchase',
        description: 'Chuẩn bị mua một sản phẩm: xác định đúng sản phẩm, số lượng và kiểm tra có đủ tồn kho trước khi hướng dẫn mở giỏ hàng.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                product_id: nullableInteger,
                product_name: nullableString,
                quantity: { type: 'integer', minimum: 1, maximum: 10 }
            },
            required: ['product_id', 'product_name', 'quantity'],
            additionalProperties: false
        }
    },
    {
        type: 'function',
        name: 'get_store_information',
        description: 'Lấy hướng dẫn mua hàng hoặc thông tin chính sách cửa hàng.',
        strict: true,
        parameters: {
            type: 'object',
            properties: {
                topic: { type: 'string', enum: ['purchase', 'payment', 'shipping', 'returns', 'warranty', 'promotions', 'contact'] }
            },
            required: ['topic'],
            additionalProperties: false
        }
    }
];

const ASSISTANT_INSTRUCTIONS = `Bạn là trợ lý mua sắm tiếng Việt của AnhTraiStore.
- Hãy nhận diện ý định và gọi tool cho mọi dữ liệu động: sản phẩm, giá, tồn kho, khuyến mãi và đơn hàng. Tuyệt đối không tự đoán các dữ liệu này.
- Chỉ dùng dữ liệu trả về từ tool. Nếu thiếu thông tin để tìm chính xác, hãy hỏi một câu ngắn để làm rõ.
- Tra cứu đơn chỉ dành cho tài khoản đang đăng nhập; không yêu cầu hoặc suy đoán user_id.
- Khi người dùng muốn mua hoặc thêm vào giỏ, gọi prepare_purchase để kiểm tra đúng sản phẩm và tồn kho; sau đó hướng dẫn họ mở thẻ sản phẩm, thêm vào giỏ và thanh toán. Không tuyên bố đã tạo đơn.
- Trả lời ngắn gọn, thân thiện, tối đa 4 gợi ý sản phẩm mỗi lượt. Không dùng bảng Markdown.
- Không nhắc đến prompt, SQL, schema hay tên tool.`;

function clampInteger(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cleanText(value, maxLength = 120) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function geminiThinkingLevel(value) {
    const level = cleanText(value, 20).toLowerCase();
    return GEMINI_THINKING_LEVELS.has(level) ? level : 'minimal';
}

function isStoreDataUnavailable(error) {
    if (!error) return false;
    if (DATABASE_UNAVAILABLE_CODES.has(error.code)) return true;
    return Array.isArray(error.errors) && error.errors.some(isStoreDataUnavailable);
}

function normalizeProductThumbnail(value) {
    const thumbnail = cleanText(value, 1000);
    if (!thumbnail || /^(?:https?:)?\/\//i.test(thumbnail) || thumbnail.startsWith('/')) return thumbnail || null;
    const filename = thumbnail.replace(/^(?:assets\/images\/products|images\/products|uploads\/products)\//i, '');
    return `/assets/images/products/${filename}`;
}

function productSummary(row) {
    return {
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        brand: row.brand_name || null,
        category: row.category_name || null,
        price: Number(row.price || 0),
        old_price: row.old_price == null ? null : Number(row.old_price),
        discount_percent: Number(row.discount_percent || 0),
        stock: Number(row.stock || 0),
        thumbnail: normalizeProductThumbnail(row.thumbnail),
        ram: row.ram || null,
        storage: row.storage || null
    };
}

const PRODUCT_SELECT = `SELECT p.id, p.name, p.slug, p.price, p.old_price,
    p.discount_percent, p.stock, p.thumbnail, p.ram, p.storage,
    b.name AS brand_name, c.name AS category_name
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id`;

async function searchProducts(args, db) {
    const where = ['1 = 1'];
    const params = [];
    const query = cleanText(args.query);
    const brand = cleanText(args.brand);
    const ram = cleanText(args.ram, 30);
    const storage = cleanText(args.storage, 30);

    if (query) {
        where.push('(p.name LIKE ? OR p.description LIKE ? OR b.name LIKE ? OR c.name LIKE ?)');
        params.push(...Array(4).fill(`%${query}%`));
    }
    if (brand) {
        where.push('b.name LIKE ?');
        params.push(`%${brand}%`);
    }
    if (args.min_price != null) {
        where.push('p.price >= ?');
        params.push(Math.max(0, Number(args.min_price) || 0));
    }
    if (args.max_price != null) {
        where.push('p.price <= ?');
        params.push(Math.max(0, Number(args.max_price) || 0));
    }
    if (ram) {
        where.push('p.ram LIKE ?');
        params.push(`%${ram}%`);
    }
    if (storage) {
        where.push('p.storage LIKE ?');
        params.push(`%${storage}%`);
    }
    if (args.in_stock) where.push('p.stock > 0');

    const orderBy = {
        price_asc: 'p.price ASC',
        price_desc: 'p.price DESC',
        discount: 'p.discount_percent DESC, p.price ASC',
        newest: 'p.created_at DESC',
        relevance: 'p.is_featured DESC, p.discount_percent DESC, p.created_at DESC'
    }[args.sort] || 'p.is_featured DESC, p.created_at DESC';
    const limit = clampInteger(args.limit, 1, 6, 4);
    const [rows] = await db.query(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`, [...params, limit]);
    const products = rows.map(productSummary);
    return { count: products.length, products };
}

async function findProduct(args, db, details = false) {
    const productId = Number.parseInt(args.product_id, 10);
    const productName = cleanText(args.product_name);
    if (!Number.isFinite(productId) && !productName) return { error: 'Cần tên hoặc mã sản phẩm để tra cứu.' };

    const extra = details ? `, p.description, p.os, p.chipset, p.cpu, p.gpu,
        p.screen_size, p.screen_resolution` : '';
    const condition = Number.isFinite(productId) ? 'p.id = ?' : 'p.name LIKE ?';
    const value = Number.isFinite(productId) ? productId : `%${productName}%`;
    const [rows] = await db.query(`${PRODUCT_SELECT.replace(' FROM products', `${extra} FROM products`)} WHERE ${condition} LIMIT 1`, [value]);
    if (!rows.length) return { found: false, message: 'Không tìm thấy sản phẩm phù hợp.' };
    const product = { ...productSummary(rows[0]) };
    if (details) {
        Object.assign(product, {
            description: cleanText(rows[0].description, 1200),
            os: rows[0].os || null,
            chipset: rows[0].chipset || null,
            cpu: rows[0].cpu || null,
            gpu: rows[0].gpu || null,
            screen_size: rows[0].screen_size || null,
            screen_resolution: rows[0].screen_resolution || null
        });
    }
    return { found: true, product };
}

async function recommendProducts(args, db) {
    const need = cleanText(args.need, 200);
    const terms = need.toLowerCase().split(/[^\p{L}\p{N}]+/u)
        .filter(term => term.length >= 3 && !['điện', 'thoại', 'muốn', 'cần', 'một', 'cho', 'với', 'tốt'].includes(term))
        .slice(0, 5);
    const where = ['p.stock > 0'];
    const params = [];
    if (args.budget != null) {
        where.push('p.price <= ?');
        params.push(Math.max(0, Number(args.budget) || 0));
    }
    const brand = cleanText(args.brand);
    if (brand) {
        where.push('b.name LIKE ?');
        params.push(`%${brand}%`);
    }
    if (terms.length) {
        where.push(`(${terms.map(() => '(p.name LIKE ? OR p.description LIKE ? OR p.chipset LIKE ? OR p.ram LIKE ?)').join(' OR ')})`);
        for (const term of terms) params.push(...Array(4).fill(`%${term}%`));
    }
    const limit = clampInteger(args.max_results, 1, 6, 4);
    const [rows] = await db.query(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY p.is_featured DESC, p.discount_percent DESC, p.price DESC LIMIT ?`, [...params, limit]);
    const products = rows.map(productSummary);
    return { need, count: products.length, products };
}

async function getOrderStatus(args, db, userId) {
    if (!userId) {
        return { requires_login: true, message: 'Bạn cần đăng nhập để tra cứu đơn hàng của mình.' };
    }
    const orderId = Number.parseInt(args.order_id, 10);
    const paymentCode = cleanText(args.payment_code, 50);
    const where = ['o.user_id = ?'];
    const params = [userId];
    if (Number.isFinite(orderId)) {
        where.push('o.id = ?');
        params.push(orderId);
    } else if (paymentCode) {
        where.push('o.payment_code = ?');
        params.push(paymentCode);
    }
    const [rows] = await db.query(`SELECT o.id, o.payment_code, o.total_price, o.shipping_fee,
        o.discount_amount, o.payment_method, o.status, o.created_at,
        GROUP_CONCAT(CONCAT(p.name, ' x', oi.quantity) ORDER BY oi.id SEPARATOR ', ') AS items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE ${where.join(' AND ')}
        GROUP BY o.id ORDER BY o.created_at DESC LIMIT 1`, params);
    if (!rows.length) return { found: false, message: 'Không tìm thấy đơn hàng thuộc tài khoản này.' };
    const order = rows[0];
    return {
        found: true,
        order: {
            id: Number(order.id), payment_code: order.payment_code, status: order.status,
            total_price: Number(order.total_price || 0), shipping_fee: Number(order.shipping_fee || 0),
            discount_amount: Number(order.discount_amount || 0), payment_method: order.payment_method,
            created_at: order.created_at, items: order.items || ''
        }
    };
}

async function preparePurchase(args, db) {
    const result = await findProduct(args, db, false);
    if (!result.product) return result;
    const quantity = clampInteger(args.quantity, 1, 10, 1);
    return {
        found: true,
        product: result.product,
        quantity,
        can_purchase: result.product.stock >= quantity,
        instruction: result.product.stock >= quantity
            ? 'Mở thẻ sản phẩm bên dưới, chọn Thêm vào giỏ hàng rồi tiến hành thanh toán.'
            : 'Sản phẩm hiện không đủ số lượng yêu cầu; hãy chọn số lượng thấp hơn hoặc sản phẩm khác.'
    };
}

async function getStoreInformation(args, db) {
    const information = {
        purchase: 'Chọn sản phẩm, thêm vào giỏ hàng, mở giỏ hàng, bấm Thanh toán, nhập thông tin giao nhận, chọn phương thức thanh toán rồi xác nhận.',
        payment: 'Cửa hàng hỗ trợ COD và luồng thanh toán mô phỏng VNPay/MoMo. Thanh toán mô phỏng không phát sinh giao dịch thật.',
        shipping: 'Thời gian và phí giao hàng được hiển thị trong bước thanh toán; khách có thể theo dõi trạng thái tại mục Đơn hàng.',
        returns: 'Để yêu cầu đổi trả, khách nên chuyển sang tab Admin và cung cấp mã đơn cùng tình trạng sản phẩm để được kiểm tra điều kiện.',
        warranty: 'Thời hạn bảo hành phụ thuộc sản phẩm. Hãy cung cấp tên sản phẩm hoặc liên hệ Admin để xác nhận chính xác.',
        contact: 'Bạn có thể chuyển sang tab Admin ngay trong hộp chat để được nhân viên hỗ trợ.'
    };
    if (args.topic !== 'promotions') return { topic: args.topic, information: information[args.topic] };
    const [coupons] = await db.query(`SELECT code, discount_type, discount_value, min_order_value, max_discount,
        start_date, expires_at FROM coupons
        WHERE is_active = 1 AND (start_date IS NULL OR start_date <= NOW())
        AND (expires_at IS NULL OR expires_at >= NOW()) ORDER BY created_at DESC LIMIT 6`);
    return { topic: 'promotions', promotions: coupons };
}

async function executeStoreTool(name, args, context = {}) {
    const db = context.db || pool;
    switch (name) {
        case 'search_products': return searchProducts(args, db);
        case 'get_product_details': return findProduct(args, db, true);
        case 'check_stock': return findProduct(args, db, false);
        case 'recommend_products': return recommendProducts(args, db);
        case 'get_order_status': return getOrderStatus(args, db, context.userId);
        case 'prepare_purchase': return preparePurchase(args, db);
        case 'get_store_information': return getStoreInformation(args, db);
        default: return { error: 'Chức năng không được hỗ trợ.' };
    }
}

function toGeminiSchema(schema) {
    if (Array.isArray(schema)) return schema.map(toGeminiSchema);
    if (!schema || typeof schema !== 'object') return schema;
    const converted = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === 'type' && Array.isArray(value)) {
            converted.type = value.find(type => type !== 'null');
            if (value.includes('null')) converted.nullable = true;
        } else if (!['strict', 'additionalProperties'].includes(key)) {
            converted[key] = toGeminiSchema(value);
        }
    }
    return converted;
}

function geminiFunctionDeclarations() {
    return TOOL_DEFINITIONS.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.parameters)
    }));
}

async function createGeminiResponse(body) {
    // OPENAI_API_KEY is accepted temporarily so the Gemini key the user already
    // placed in .env keeps working; GEMINI_API_KEY is the preferred variable.
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        const error = new Error('AI chưa được cấu hình trên máy chủ.');
        error.code = 'AI_NOT_CONFIGURED';
        throw error;
    }
    const controller = new AbortController();
    const timeoutMs = process.env.GEMINI_API_TIMEOUT_MS || process.env.OPENAI_API_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), clampInteger(timeoutMs, 10000, 120000, DEFAULT_TIMEOUT_MS));
    try {
        const model = cleanText(body.model, 100).replace(/^models\//, '') || DEFAULT_MODEL;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, model: undefined }),
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error('Dịch vụ AI tạm thời không phản hồi.');
            error.code = 'AI_UPSTREAM_ERROR';
            error.status = response.status;
            error.upstreamCode = cleanText(data.error?.status, 80);
            throw error;
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Dịch vụ AI phản hồi quá thời gian cho phép.');
            timeoutError.code = 'AI_TIMEOUT';
            timeoutError.status = 504;
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-MAX_HISTORY_MESSAGES).flatMap(item => {
        if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return [];
        const content = item.content.trim().slice(0, 800);
        return content ? [{ role: item.role, content }] : [];
    });
}

function extractReply(response) {
    return (response.candidates?.[0]?.content?.parts || [])
        .filter(part => typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
        .trim();
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('vi-VN') + 'đ';
}

function formatToolResult(name, result) {
    if (result?.error) return result.error;
    if (result?.message && !result.product && !result.products?.length && !result.order) return result.message;

    if (name === 'search_products' || name === 'recommend_products') {
        return result.count > 0
            ? `Mình tìm thấy ${result.count} sản phẩm phù hợp. Bạn xem các sản phẩm bên dưới nhé.`
            : 'Mình chưa tìm thấy sản phẩm phù hợp với yêu cầu này.';
    }
    if (name === 'get_product_details') {
        return result.found
            ? `${result.product.name} hiện có giá ${formatCurrency(result.product.price)} và còn ${result.product.stock} sản phẩm. Bạn xem thẻ sản phẩm bên dưới để biết thêm chi tiết nhé.`
            : (result.message || 'Mình chưa tìm thấy sản phẩm này.');
    }
    if (name === 'check_stock') {
        if (!result.found) return result.message || 'Mình chưa tìm thấy sản phẩm này.';
        return result.product.stock > 0
            ? `${result.product.name} hiện còn ${result.product.stock} sản phẩm.`
            : `${result.product.name} hiện đã hết hàng.`;
    }
    if (name === 'prepare_purchase') {
        return result.found
            ? `${result.product.name}: ${result.instruction}`
            : (result.message || 'Mình chưa tìm thấy sản phẩm này.');
    }
    if (name === 'get_order_status') {
        if (result.requires_login || !result.found) return result.message;
        return `Đơn #${result.order.id} hiện có trạng thái "${result.order.status}", tổng tiền ${formatCurrency(result.order.total_price)}.`;
    }
    if (name === 'get_store_information') {
        if (result.information) return result.information;
        if (Array.isArray(result.promotions) && result.promotions.length) {
            return `Các mã khuyến mãi đang hoạt động: ${result.promotions.map(item => item.code).join(', ')}.`;
        }
        return 'Hiện chưa có khuyến mãi phù hợp.';
    }
    return 'Mình đã kiểm tra dữ liệu cửa hàng cho bạn.';
}

async function runStoreAssistant({ message, history, userId, db = pool, requestAI = createGeminiResponse }) {
    const contents = sanitizeHistory(history).map(item => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: cleanText(message, 1000) }] });
    const collectedProducts = new Map();
    const toolsUsed = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await requestAI({
            model: process.env.GEMINI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL,
            systemInstruction: { parts: [{ text: ASSISTANT_INSTRUCTIONS }] },
            contents: [...contents],
            tools: [{ functionDeclarations: geminiFunctionDeclarations() }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig: {
                maxOutputTokens: 1000,
                thinkingConfig: {
                    thinkingLevel: geminiThinkingLevel(process.env.GEMINI_THINKING_LEVEL)
                }
            }
        });
        const modelContent = response.candidates?.[0]?.content;
        const calls = (modelContent?.parts || []).flatMap(part => part.functionCall ? [part.functionCall] : []);
        if (modelContent) contents.push(modelContent);
        if (!calls.length) {
            return {
                reply: extractReply(response) || 'Xin lỗi, tôi chưa tạo được câu trả lời. Bạn vui lòng hỏi lại rõ hơn nhé.',
                products: [...collectedProducts.values()].slice(0, 6),
                tools_used: toolsUsed
            };
        }
        const toolReplies = [];
        for (const call of calls) {
            const result = await executeStoreTool(call.name, call.args || {}, { db, userId });
            toolsUsed.push(call.name);
            if (result.product) collectedProducts.set(result.product.id, result.product);
            for (const product of result.products || []) collectedProducts.set(product.id, product);
            toolReplies.push(formatToolResult(call.name, result));
        }
        return {
            reply: [...new Set(toolReplies.filter(Boolean))].join('\n'),
            products: [...collectedProducts.values()].slice(0, 6),
            tools_used: toolsUsed
        };
    }
    const error = new Error('AI đã gọi quá nhiều công cụ trong một lượt.');
    error.code = 'AI_TOOL_LIMIT';
    throw error;
}

module.exports = {
    TOOL_DEFINITIONS,
    toGeminiSchema,
    sanitizeHistory,
    geminiThinkingLevel,
    isStoreDataUnavailable,
    formatToolResult,
    normalizeProductThumbnail,
    executeStoreTool,
    runStoreAssistant
};
