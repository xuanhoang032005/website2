const startedAt = Date.now();
const counters = new Map();
let requests = 0;
let errors = 0;
let totalDurationMs = 0;

function observe(method, path, status, durationMs) {
    requests++;
    totalDurationMs += durationMs;
    if (status >= 500) errors++;
    const key = `${method} ${path} ${status}`;
    counters.set(key, (counters.get(key) || 0) + 1);
}

function snapshot() {
    return {
        uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
        requests_total: requests,
        errors_total: errors,
        average_duration_ms: requests ? Math.round(totalDurationMs / requests * 100) / 100 : 0,
        routes: Object.fromEntries(counters)
    };
}

module.exports = { observe, snapshot };
