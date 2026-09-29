function write(level, message, fields = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...fields
    };
    const output = JSON.stringify(entry);
    if (level === 'error') console.error(output);
    else console.log(output);
}

function info(message, fields) { write('info', message, fields); }
function warn(message, fields) { write('warn', message, fields); }
function error(message, fields) { write('error', message, fields); }

async function alertError(error, context = {}) {
    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (!webhook) return;
    try {
        await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `[${process.env.SITE_NAME || 'Website'}] ${error.message}`, ...context })
        });
    } catch (alertFailure) {
        warn('error_alert_failed', { error: alertFailure.message });
    }
}

module.exports = { write, info, warn, error, alertError };
