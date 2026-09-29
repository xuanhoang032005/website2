const originalFetch = window.fetch.bind(window);

function readCookie(name) {
    const prefix = `${name}=`;
    return document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(prefix))?.slice(prefix.length) || '';
}

export function apiFetch(input, init = {}) {
    const options = { credentials: 'include', ...init };
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        options.headers = new Headers(options.headers || {});
        const token = readCookie('csrf_token');
        if (token) options.headers.set('X-CSRF-Token', decodeURIComponent(token));
    }
    return originalFetch(input, options);
}

export function installFetch() {
    if (window.apiFetch) return;
    window.apiFetch = apiFetch;
    window.fetch = apiFetch;
}
