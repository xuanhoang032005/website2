const DEFAULT_MODEL = 'gpt-5.6-terra';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 60000;

function completionUrl() {
    const baseUrl = String(process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).trim();
    try {
        const url = new URL(baseUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error('Invalid base URL');
        }
        return url.toString().replace(/\/+$/, '') + '/chat/completions';
    } catch (_) {
        const error = new Error('OPENAI_BASE_URL không hợp lệ.');
        error.code = 'AI_INVALID_CONFIG';
        throw error;
    }
}

async function request(body, { fetchImpl = globalThis.fetch } = {}) {
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
        const error = new Error('AI chưa được cấu hình trên máy chủ.');
        error.code = 'AI_NOT_CONFIGURED';
        throw error;
    }
    const url = completionUrl();
    const model = String(body.model || process.env.OPENAI_MODEL || DEFAULT_MODEL).trim();
    const payload = { ...body, model };
    // GPT-5.4/5.6 dùng Chat Completions chỉ gọi function tools khi reasoning = none.
    if (/^gpt-5\.(?:4|6)(?:-|$)/.test(model) && payload.reasoning_effort === undefined) {
        payload.reasoning_effort = 'none';
    }
    const controller = new AbortController();
    const configuredTimeout = Number.parseInt(process.env.OPENAI_API_TIMEOUT_MS, 10);
    const timeoutMs = Number.isFinite(configuredTimeout)
        ? Math.min(120000, Math.max(10000, configuredTimeout)) : DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
            redirect: 'error'
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error('Dịch vụ AI tạm thời không phản hồi.');
            error.code = 'AI_UPSTREAM_ERROR';
            error.status = response.status;
            throw error;
        }
        if (!data?.choices?.[0]?.message) {
            const error = new Error('Dịch vụ AI trả về dữ liệu không hợp lệ.');
            error.code = 'AI_INVALID_RESPONSE';
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

module.exports = { request, DEFAULT_MODEL };
