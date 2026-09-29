const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 60000;

function clampInteger(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cleanText(value, maxLength = 120) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function request(body) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        const error = new Error('AI chưa được cấu hình trên máy chủ.');
        error.code = 'AI_NOT_CONFIGURED';
        throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), clampInteger(
        process.env.GEMINI_API_TIMEOUT_MS || process.env.OPENAI_API_TIMEOUT_MS,
        10000, 120000, DEFAULT_TIMEOUT_MS
    ));
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

module.exports = { request };
