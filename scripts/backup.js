require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const outputDir = path.resolve(process.env.BACKUP_DIR || './backups');
fs.mkdirSync(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(outputDir, `${process.env.DB_NAME || 'database'}-${stamp}.sql`);
const args = ['--host', process.env.DB_HOST || 'localhost', '--port', String(process.env.DB_PORT || 3306), '--user', process.env.DB_USER || 'root', '--single-transaction', '--routines', '--events', process.env.DB_NAME || 'dt'];
const child = spawn('mysqldump', args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASS || '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const stream = fs.createWriteStream(output);
child.stdout.pipe(stream);
child.on('close', code => {
    if (code !== 0) { fs.rmSync(output, { force: true }); process.exitCode = code || 1; return; }
    console.log(`Backup written to ${output}`);
});
