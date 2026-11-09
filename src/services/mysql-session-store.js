const session = require('express-session');

class MySQLSessionStore extends session.Store {
    constructor(pool, { ttlMs = 24 * 60 * 60 * 1000 } = {}) {
        super();
        this.pool = pool;
        this.ttlMs = ttlMs;
    }

    expiration(sessionData) {
        const expires = sessionData?.cookie?.expires ? new Date(sessionData.cookie.expires).getTime() : NaN;
        return Number.isFinite(expires) ? new Date(expires) : new Date(Date.now() + this.ttlMs);
    }

    get(sid, callback) {
        this.pool.query(
            'SELECT data FROM sessions WHERE sid = ? AND expires_at > NOW(3) LIMIT 1',
            [sid]
        ).then(([rows]) => {
            if (!rows.length) return callback(null, null);
            try {
                callback(null, JSON.parse(rows[0].data));
            } catch (error) {
                callback(error);
            }
        }).catch(callback);
    }

    set(sid, sessionData, callback = () => {}) {
        const expiresAt = this.expiration(sessionData);
        this.pool.query(
            `INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), data = VALUES(data)`,
            [sid, expiresAt, JSON.stringify(sessionData)]
        ).then(() => callback(null)).catch(callback);
    }

    touch(sid, sessionData, callback = () => {}) {
        this.pool.query('UPDATE sessions SET expires_at = ? WHERE sid = ?', [this.expiration(sessionData), sid])
            .then(() => callback(null)).catch(callback);
    }

    destroy(sid, callback = () => {}) {
        this.pool.query('DELETE FROM sessions WHERE sid = ?', [sid])
            .then(() => callback(null)).catch(callback);
    }

    clear(callback = () => {}) {
        this.pool.query('DELETE FROM sessions').then(() => callback(null)).catch(callback);
    }

    length(callback) {
        this.pool.query('SELECT COUNT(*) AS count FROM sessions WHERE expires_at > NOW(3)')
            .then(([rows]) => callback(null, Number(rows[0].count))).catch(callback);
    }
}

module.exports = MySQLSessionStore;
