const crypto = require('crypto');
const logger = require('../config/logger');

const jobs = new Map();
const handlers = new Map();
const pending = [];
let active = 0;
const concurrency = Math.max(1, Number(process.env.JOB_CONCURRENCY) || 2);

function register(type, handler) { handlers.set(type, handler); }

function enqueue(type, payload, options = {}) {
    if (!handlers.has(type)) throw new Error(`Unknown background job: ${type}`);
    const id = crypto.randomUUID();
    jobs.set(id, { id, type, status: 'queued', attempts: 0, created_at: new Date().toISOString() });
    pending.push({ id, type, payload, maxAttempts: options.maxAttempts || 3 });
    drain();
    return id;
}

function get(id) { return jobs.get(id) || null; }

async function drain() {
    while (active < concurrency && pending.length) {
        const job = pending.shift();
        active++;
        run(job).finally(() => { active--; drain(); });
    }
}

async function run(job) {
    const record = jobs.get(job.id);
    record.status = 'running';
    record.attempts++;
    try {
        record.result = await handlers.get(job.type)(job.payload);
        record.status = 'completed';
        record.completed_at = new Date().toISOString();
    } catch (error) {
        if (record.attempts < job.maxAttempts) {
            record.status = 'retrying';
            setTimeout(() => { pending.push(job); drain(); }, Math.min(30000, 500 * 2 ** (record.attempts - 1)));
        } else {
            record.status = 'failed';
            record.error = error.message;
            logger.error('background_job_failed', { job_id: job.id, type: job.type, error: error.message });
        }
    }
}

function snapshot() {
    return { queued: [...jobs.values()].filter(job => job.status === 'queued').length, running: active, total: jobs.size };
}

module.exports = { register, enqueue, get, snapshot };
