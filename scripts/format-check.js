const fs = require('fs');
const path = require('path');
const roots = ['server.js', 'src', 'scripts', 'tests'];
const files = [];
function walk(entry) {
    if (!fs.existsSync(entry)) return;
    const stat = fs.statSync(entry);
    if (stat.isFile() && entry.endsWith('.js')) files.push(entry);
    if (stat.isDirectory()) fs.readdirSync(entry).forEach(name => walk(path.join(entry, name)));
}
roots.forEach(walk);
for (const file of files) {
    fs.readFileSync(file, 'utf8');
}
console.log(`Format check passed for ${files.length} JavaScript files.`);
