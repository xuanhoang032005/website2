const crypto = require('crypto');
const logger = require('../config/logger');

const jobs = new Map();
const handlers = new Map();
const pending = [];
const concurrency = Math.max(1, Number(process.env.JOB_CONCURRENCY) || 2);
let database = null;
let active = 0;
let pollTimer = null;
let maintenanceTimer = null;
let polling = false;

function register(type, handler) { handlers.set(type, handler); }

function configure(pool) { database = pool; }

function parseJson(value) {
    if (value == null || typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
}

async function enqueue(type, payload, options = {}) {
    if (!handlers.has(type)) throw new Error(`Unknown background job: ${type}`);
    const id = crypto.randomUUID();
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    const storage = options.connection || database;
    if (storage) {
        await storage.query(
            `INSERT INTO background_jobs (id, type, payload, status, max_attempts, owner_key)
             VALUES (?, ?, ?, 'queued', ?, ?)`,
            [id, type, JSON.stringify(payload), maxAttempts, options.ownerKey || null]
        );
        return id;
    }

    const record = { id, type, status: 'queued', attempts: 0, created_at: new Date().toISOString(), owner_key: options.ownerKey || null };
    jobs.set(id, record);
    pending.push({ id, type, payload, maxAttempts });
    drainMemoryQueue();
    return id;
}

async function get(id) {
    if (!database) return jobs.get(id) || null;
    const [rows] = await database.query(
        `SELECT id, type, status, attempts, max_attempts, payload, result,
                owner_key, last_error AS error, created_at, updated_at, completed_at
         FROM background_jobs WHERE id = ? LIMIT 1`,
        [id]
    );
    if (!rows.length) return null;
    return { ...rows[0], payload: parseJson(rows[0].payload), result: parseJson(rows[0].result) };
}

function drainMemoryQueue() {
    while (!database && active < concurrency && pending.length) {
        const job = pending.shift();
        active++;
        runMemoryJob(job).finally(() => { active--; drainMemoryQueue(); });
    }
}

async function runMemoryJob(job) {
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
            setTimeout(() => { pending.push(job); drainMemoryQueue(); }, Math.min(30000, 500 * 2 ** (record.attempts - 1))).unref?.();
        } else {
            record.status = 'failed';
            record.error = error.message;
            logger.error('background_job_failed', { job_id: job.id, type: job.type, error: error.message });
        }
    }
}

async function claimNextJob() {
    const [rows] = await database.query(
        `SELECT id, type, payload, attempts, max_attempts, worker_token
         FROM background_jobs
         WHERE (status IN ('queued', 'retrying') AND available_at <= NOW(3))
            OR (status = 'running' AND locked_until <= NOW(3))
         ORDER BY created_at ASC
         LIMIT 1`
    );
    if (!rows.length) return null;
    const row = rows[0];
    const workerToken = crypto.randomUUID();
    const [claim] = await database.query(
        `UPDATE background_jobs
         SET status = 'running', attempts = attempts + 1, worker_token = ?,
             locked_until = TIMESTAMPADD(MICROSECOND, 300000000, NOW(3)), updated_at = NOW(3)
         WHERE id = ? AND (
             (status IN ('queued', 'retrying') AND available_at <= NOW(3)) OR
             (status = 'running' AND locked_until <= NOW(3))
         )`,
        [workerToken, row.id]
    );
    if (claim.affectedRows !== 1) return null;
    return { ...row, payload: parseJson(row.payload), attempts: Number(row.attempts) + 1, workerToken };
}

async function runDatabaseJob(job) {
    const heartbeat = setInterval(() => {
        database.query(
            `UPDATE background_jobs SET locked_until = TIMESTAMPADD(MICROSECOND, 300000000, NOW(3))
             WHERE id = ? AND worker_token = ? AND status = 'running'`,
            [job.id, job.workerToken]
        ).catch(error => logger.error('background_job_lease_failed', { job_id: job.id, error: error.message }));
    }, 30000);
    heartbeat.unref?.();

    try {
        const result = await handlers.get(job.type)(job.payload);
        await database.query(
            `UPDATE background_jobs SET status = 'completed', result = ?, last_error = NULL,
                    completed_at = NOW(3), locked_until = NULL, worker_token = NULL, updated_at = NOW(3)
             WHERE id = ? AND worker_token = ?`,
            [JSON.stringify(result ?? null), job.id, job.workerToken]
        );
    } catch (error) {
        const message = String(error?.message || error).slice(0, 4000);
        if (job.attempts < Number(job.max_attempts)) {
            const delayMs = Math.min(30000, 500 * 2 ** (job.attempts - 1));
            await database.query(
                `UPDATE background_jobs SET status = 'retrying', last_error = ?,
                        available_at = TIMESTAMPADD(MICROSECOND, ?, NOW(3)),
                        locked_until = NULL, worker_token = NULL, updated_at = NOW(3)
                 WHERE id = ? AND worker_token = ?`,
                [message, delayMs * 1000, job.id, job.workerToken]
            );
        } else {
            await database.query(
                `UPDATE background_jobs SET status = 'failed', last_error = ?,
                        locked_until = NULL, worker_token = NULL, updated_at = NOW(3)
                 WHERE id = ? AND worker_token = ?`,
                [message, job.id, job.workerToken]
            );
            logger.error('background_job_failed', { job_id: job.id, type: job.type, error: message });
        }
    } finally {
        clearInterval(heartbeat);
    }
}

async function pollDatabaseQueue() {
    if (!database || polling) return;
    polling = true;
    try {
        while (active < concurrency) {
            const job = await claimNextJob();
            if (!job) break;
            active++;
            runDatabaseJob(job).catch(error => {
                logger.error('background_job_worker_error', { job_id: job.id, error: error.message });
            }).finally(() => {
                active--;
                pollDatabaseQueue().catch(error => logger.error('background_job_poll_failed', { error: error.message }));
            });
        }
    } finally {
        polling = false;
    }
}

async function cleanupExpiredState() {
    if (!database) return;
    await Promise.all([
        database.query('DELETE FROM sessions WHERE expires_at <= NOW(3)'),
        database.query('DELETE FROM rate_limit_buckets WHERE reset_at < TIMESTAMPADD(DAY, -1, NOW(3))'),
        database.query(`DELETE FROM background_jobs
                        WHERE status IN ('completed', 'failed')
                          AND updated_at < TIMESTAMPADD(DAY, -30, NOW(3))`)
    ]);
}

function start({ pollIntervalMs = 1000 } = {}) {
    if (!database) throw new Error('Background queue database is not configured.');
    if (pollTimer) return;
    pollTimer = setInterval(() => {
        pollDatabaseQueue().catch(error => logger.error('background_job_poll_failed', { error: error.message }));
    }, pollIntervalMs);
    pollTimer.unref?.();
    pollDatabaseQueue().catch(error => logger.error('background_job_poll_failed', { error: error.message }));
    cleanupExpiredState().catch(error => logger.error('runtime_state_cleanup_failed', { error: error.message }));
    maintenanceTimer = setInterval(() => {
        cleanupExpiredState().catch(error => logger.error('runtime_state_cleanup_failed', { error: error.message }));
    }, 60 * 60 * 1000);
    maintenanceTimer.unref?.();
}

async function stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = null;
    while (active > 0) await new Promise(resolve => setTimeout(resolve, 25));
}

async function snapshot() {
    if (!database) {
        return {
            queued: [...jobs.values()].filter(job => ['queued', 'retrying'].includes(job.status)).length,
            running: active,
            total: jobs.size
        };
    }
    const [[counts]] = await database.query(
        `SELECT COUNT(*) AS total,
                SUM(status IN ('queued', 'retrying')) AS queued,
                SUM(status = 'running') AS running
         FROM background_jobs`
    );
    return { queued: Number(counts.queued || 0), running: Number(counts.running || 0), total: Number(counts.total || 0) };
}

module.exports = { register, configure, enqueue, get, start, stop, snapshot };
