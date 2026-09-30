require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { projectRoot } = require('../core/paths');

const migrationsDir = path.join(projectRoot, 'database', 'migrations');
const lockName = 'anhtraistore_schema_migrations';
const embeddedMigrations = new Set([
    '001_schema_integrity.sql',
    '002_unique_user_coupon.sql',
    '003_checkout_delivery.sql'
]);

function databaseOptions() {
    return {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'dt',
        charset: 'utf8mb4',
        multipleStatements: true
    };
}

function checksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function migrationFiles() {
    let entries;
    try { entries = await fs.readdir(migrationsDir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return entries
        .filter(entry => entry.isFile() && /^\d{3}_[a-z0-9_-]+\.sql$/i.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

async function migrate() {
    const connection = await mysql.createConnection(databaseOptions());
    let locked = false;
    try {
        const [[lock]] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
        if (Number(lock.acquired) !== 1) throw new Error('Không thể lấy khóa chạy migration. Hãy thử lại sau.');
        locked = true;

        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL UNIQUE,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [appliedRows] = await connection.query('SELECT name, checksum FROM schema_migrations');
        const applied = new Map(appliedRows.map(row => [row.name, row.checksum]));
        const files = await migrationFiles();
        const fileSet = new Set(files);
        for (const name of applied.keys()) {
            if (!fileSet.has(name) && !embeddedMigrations.has(name)) {
                throw new Error(`Migration đã ghi nhận nhưng file không còn tồn tại: ${name}`);
            }
        }
        let appliedCount = 0;

        for (const name of files) {
            const sql = await fs.readFile(path.join(migrationsDir, name), 'utf8');
            const digest = checksum(sql);
            if (applied.has(name)) {
                if (applied.get(name) !== digest) {
                    throw new Error(`Migration đã chạy nhưng checksum thay đổi: ${name}`);
                }
                continue;
            }

            console.log(`Applying migration ${name}...`);
            await connection.beginTransaction();
            try {
                await connection.query(sql);
                await connection.query(
                    'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
                    [name, digest]
                );
                await connection.commit();
            } catch (error) {
                await connection.rollback().catch(() => {});
                throw error;
            }
            appliedCount++;
        }

        console.log(appliedCount ? `Applied ${appliedCount} migration(s).` : 'Database schema is up to date.');
    } finally {
        if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
        await connection.end();
    }
}

if (require.main === module) {
    migrate().catch(error => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { migrate, checksum, migrationFiles };
