require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { projectRoot } = require('../core/paths');

const schemaPath = path.join(projectRoot, 'database', 'anhtraistore.sql');
const upgradeName = 'merged_schema_upgrade';
const lockName = 'anhtraistore_schema_migrations';

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
    return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

async function loadSchemaUpgrade() {
    const schema = (await fs.readFile(schemaPath, 'utf8')).replace(/\r\n/g, '\n');
    const block = schema.match(/^-- BEGIN EXISTING DATABASE UPGRADE\n([\s\S]*?)^-- END EXISTING DATABASE UPGRADE$/m);
    if (!block || !block[1].trim()) throw new Error('Không tìm thấy khối nâng cấp trong database/anhtraistore.sql.');
    const sql = block[1].trim() + '\n';
    // Full imports reset demo data; upgrades must never run those statements.
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(sql)) {
        throw new Error('Khối nâng cấp chứa lệnh thay đổi dữ liệu mẫu không được phép.');
    }
    return { name: upgradeName, sql, checksum: checksum(sql) };
}

async function migrate({ createConnection = mysql.createConnection } = {}) {
    const upgrade = await loadSchemaUpgrade();
    const connection = await createConnection(databaseOptions());
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
        if (applied.has(upgrade.name)) {
            if (applied.get(upgrade.name) !== upgrade.checksum) {
                throw new Error(`Migration đã chạy nhưng checksum thay đổi: ${upgrade.name}`);
            }
            console.log('Database schema is up to date.');
            return;
        }

        console.log(`Applying migration ${upgrade.name}...`);
        await connection.beginTransaction();
        try {
            await connection.query(upgrade.sql);
            await connection.query(
                'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
                [upgrade.name, upgrade.checksum]
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback().catch(() => {});
            throw error;
        }
        console.log('Applied 1 migration(s).');
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

module.exports = { migrate, checksum, loadSchemaUpgrade };
