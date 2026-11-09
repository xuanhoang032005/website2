require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { projectRoot } = require('../core/paths');

const schemaPath = path.join(projectRoot, 'database', 'anhtraistore.sql');
const upgradeName = 'merged_schema_upgrade';
const workflowUpgradeName = 'verified_reviews_inventory_service_requests';
const orderTrackingUpgradeName = 'order_tracking';
const durableRuntimeUpgradeName = 'durable_runtime';
const utf8mb4UpgradeName = 'utf8mb4_charset';
const productQuestionsUpgradeName = 'product_questions_ai';
const multipleProductQuestionsUpgradeName = 'multiple_product_questions';
const previousUpgradeChecksum = 'cf6ef5d2550189962f8756a5b8c42e75da301fd7150c5f7aa678dbbf21007226';
const previousDurableRuntimeChecksum = '691eddbb02df811ec016edd3c88617c53db857a9b4e9dc00fd9e6061d9955d7d';
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

async function loadSchemaUpgrades() {
    const schema = (await fs.readFile(schemaPath, 'utf8')).replace(/\r\n/g, '\n');
    const upgrade = await loadSchemaUpgrade();
    const block = schema.match(/^-- BEGIN VERIFIED REVIEWS, INVENTORY AND SERVICE REQUESTS UPGRADE\n([\s\S]*?)^-- END VERIFIED REVIEWS, INVENTORY AND SERVICE REQUESTS UPGRADE$/m);
    if (!block || !block[1].trim()) throw new Error('Không tìm thấy khối nâng cấp đánh giá, tồn kho và hậu mãi.');
    const sql = block[1].trim() + '\n';
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(sql)) {
        throw new Error('Khối nâng cấp đánh giá, tồn kho và hậu mãi chứa lệnh thay đổi dữ liệu.');
    }
    const trackingBlock = schema.match(/^-- BEGIN ORDER TRACKING UPGRADE\n([\s\S]*?)^-- END ORDER TRACKING UPGRADE$/m);
    if (!trackingBlock || !trackingBlock[1].trim()) throw new Error('Không tìm thấy khối nâng cấp theo dõi đơn hàng.');
    const trackingSql = trackingBlock[1].trim() + '\n';
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(trackingSql)) {
        throw new Error('Khối nâng cấp theo dõi đơn hàng chứa lệnh thay đổi dữ liệu.');
    }
    const runtimeBlock = schema.match(/^-- BEGIN DURABLE RUNTIME UPGRADE\n([\s\S]*?)^-- END DURABLE RUNTIME UPGRADE$/m);
    if (!runtimeBlock || !runtimeBlock[1].trim()) throw new Error('Không tìm thấy khối nâng cấp session, giới hạn truy cập và hàng đợi.');
    const runtimeSql = runtimeBlock[1].trim() + '\n';
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(runtimeSql)) {
        throw new Error('Khối nâng cấp runtime chứa lệnh thay đổi dữ liệu.');
    }
    const charsetBlock = schema.match(/^-- BEGIN UTF8MB4 UPGRADE\n([\s\S]*?)^-- END UTF8MB4 UPGRADE$/m);
    if (!charsetBlock || !charsetBlock[1].trim()) throw new Error('Không tìm thấy khối nâng cấp charset utf8mb4.');
    const charsetSql = charsetBlock[1].trim() + '\n';
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(charsetSql)) {
        throw new Error('Khối nâng cấp charset chứa lệnh thay đổi dữ liệu.');
    }
    const questionsBlock = schema.match(/^-- BEGIN PRODUCT QUESTIONS AND AI REPLIES UPGRADE\n([\s\S]*?)^-- END PRODUCT QUESTIONS AND AI REPLIES UPGRADE$/m);
    if (!questionsBlock || !questionsBlock[1].trim()) throw new Error('Không tìm thấy khối nâng cấp hỏi đáp sản phẩm.');
    const questionsSql = questionsBlock[1].trim() + '\n';
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(questionsSql)) {
        throw new Error('Khối nâng cấp hỏi đáp sản phẩm chứa lệnh thay đổi dữ liệu.');
    }
    const multipleQuestionsBlock = schema.match(/^-- BEGIN MULTIPLE PRODUCT QUESTIONS UPGRADE\n([\s\S]*?)^-- END MULTIPLE PRODUCT QUESTIONS UPGRADE$/m);
    if (!multipleQuestionsBlock || !multipleQuestionsBlock[1].trim()) throw new Error('Không tìm thấy khối nâng cấp cho nhiều câu hỏi sản phẩm.');
    const multipleQuestionsSql = multipleQuestionsBlock[1].trim() + '\n';
    if (/\b(?:TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(multipleQuestionsSql)) {
        throw new Error('Khối nâng cấp nhiều câu hỏi chứa lệnh thay đổi dữ liệu.');
    }
    return [
        upgrade,
        { name: workflowUpgradeName, sql, checksum: checksum(sql) },
        { name: orderTrackingUpgradeName, sql: trackingSql, checksum: checksum(trackingSql) },
        { name: durableRuntimeUpgradeName, sql: runtimeSql, checksum: checksum(runtimeSql) },
        { name: utf8mb4UpgradeName, sql: charsetSql, checksum: checksum(charsetSql) },
        { name: productQuestionsUpgradeName, sql: questionsSql, checksum: checksum(questionsSql) },
        { name: multipleProductQuestionsUpgradeName, sql: multipleQuestionsSql, checksum: checksum(multipleQuestionsSql) }
    ];
}

async function migrate({ createConnection = mysql.createConnection } = {}) {
    const upgrades = await loadSchemaUpgrades();
    const connection = await createConnection(databaseOptions());
    let locked = false;
    try {
        const [[lock]] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
        if (Number(lock.acquired) !== 1) throw new Error('Không thể lấy khóa chạy migration. Hãy thử lại sau.');
        locked = true;

        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(191) NOT NULL UNIQUE,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const [[migrationNameColumn]] = await connection.query(
            `SELECT CHARACTER_MAXIMUM_LENGTH AS max_length
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations' AND COLUMN_NAME = 'name'`
        );
        if (Number(migrationNameColumn?.max_length) > 191) {
            await connection.query('ALTER TABLE schema_migrations MODIFY name VARCHAR(191) NOT NULL');
        }

        const [appliedRows] = await connection.query('SELECT name, checksum FROM schema_migrations');
        const applied = new Map(appliedRows.map(row => [row.name, row.checksum]));
        let appliedCount = 0;
        for (const upgrade of upgrades) {
            const previousChecksum = upgrade.name === upgradeName
                ? previousUpgradeChecksum
                : upgrade.name === durableRuntimeUpgradeName ? previousDurableRuntimeChecksum : null;
            const existingChecksum = applied.get(upgrade.name);
            if (existingChecksum === upgrade.checksum) continue;
            if (existingChecksum && existingChecksum !== previousChecksum) {
                throw new Error(`Migration đã chạy nhưng checksum thay đổi: ${upgrade.name}`);
            }

            console.log(`Applying migration ${upgrade.name}...`);
            await connection.beginTransaction();
            try {
                await connection.query(upgrade.sql);
                if (existingChecksum) {
                    await connection.query('UPDATE schema_migrations SET checksum = ? WHERE name = ?', [upgrade.checksum, upgrade.name]);
                } else {
                    await connection.query(
                        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
                        [upgrade.name, upgrade.checksum]
                    );
                }
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

module.exports = { migrate, checksum, loadSchemaUpgrade, loadSchemaUpgrades };
