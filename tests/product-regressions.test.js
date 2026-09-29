// Run with: node tests/product-regressions.test.js (no database connection).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const cloudStorageStub = {
    productCloudinaryStorage: { _handleFile() {}, _removeFile() {} },
    bannerCloudinaryStorage: { _handleFile() {}, _removeFile() {} },
    avatarCloudinaryStorage: { _handleFile() {}, _removeFile() {} },
    async destroyCloudinaryUrls() {},
    async destroyUploadedFiles() {},
    async destroyUploadedProductFiles() {}
};

test('database schema includes ownership constraints and operational indexes', () => {
    const sql = fs.readFileSync(path.join(root, 'database', 'anhtraistore.sql'), 'utf8');
    const requiredDefinitions = [
        /CREATE TABLE IF NOT EXISTS contacts[\s\S]*?user_id INT DEFAULT NULL[\s\S]*?CONSTRAINT fk_contacts_user FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE SET NULL/,
        /variant_identity INT GENERATED ALWAYS AS \(COALESCE\(variant_id, 0\)\) STORED/,
        /UNIQUE KEY uq_cart_user_product_variant \(user_id, product_id, variant_identity\)/,
        /UNIQUE KEY uq_reviews_user_product \(user_id, product_id\)/,
        /UNIQUE KEY uq_user_coupons_user_coupon \(user_id, coupon_id\)/,
        /UNIQUE KEY uq_orders_payment_code \(payment_code\)/,
        /CONSTRAINT fk_user_coupons_order FOREIGN KEY \(order_id\) REFERENCES orders\(id\) ON DELETE SET NULL/,
        /INDEX idx_orders_user_created \(user_id, created_at\)/,
        /INDEX idx_orders_status_created \(status, created_at\)/,
        /INDEX idx_conversations_user_activity \(user_id, last_message_at\)/,
        /INDEX idx_conversations_status_activity \(status, last_message_at\)/,
        /INDEX idx_messages_conversation_created \(conversation_id, created_at, id\)/
    ];
    requiredDefinitions.forEach(pattern => assert.match(sql, pattern));
    assert.match(sql, /INFORMATION_SCHEMA\.COLUMNS[\s\S]*?TABLE_NAME = 'contacts'[\s\S]*?COLUMN_NAME = 'user_id'/);
    assert.match(sql, /ALTER TABLE contacts ADD COLUMN user_id INT NULL AFTER id/);
    assert.match(sql, /SET @duplicate_coupon_groups = \([\s\S]*?HAVING COUNT\(\*\) > 1/);
    assert.match(sql, /Skipped uq_user_coupons_user_coupon: duplicate coupon history must be resolved first/);
});

test('versioned migrations are ordered, checksummed and exposed through npm', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts.migrate, 'node src/config/migrate.js');
    const { checksum, migrationFiles } = require('../src/config/migrate');
    const files = await migrationFiles();
    assert.deepEqual(files, ['001_schema_integrity.sql', '002_unique_user_coupon.sql']);
    for (const file of files) {
        const sql = fs.readFileSync(path.join(root, 'database', 'migrations', file), 'utf8');
        assert.match(checksum(sql), /^[a-f0-9]{64}$/);
    }
    const runner = fs.readFileSync(path.join(root, 'src', 'config', 'migrate.js'), 'utf8');
    assert.match(runner, /CREATE TABLE IF NOT EXISTS schema_migrations/);
    assert.match(runner, /GET_LOCK/);
    assert.match(runner, /checksum thay đổi/);
});

test('shared request validation normalizes input and returns structured field errors', () => {
    const { validateBody, stringField, emailField, integerField } = require('../src/middleware/validate');
    const middleware = validateBody({
        name: stringField({ required: true, min: 2, max: 20, label: 'Tên' }),
        email: emailField({ required: true }),
        quantity: integerField({ required: true, min: 1, max: 5, label: 'Số lượng' })
    });
    const valid = { body: { name: '  An  ', email: ' USER@Example.COM ', quantity: '2' } };
    let validError;
    middleware(valid, {}, error => { validError = error; });
    assert.equal(validError, undefined);
    assert.deepEqual(valid.body, { name: 'An', email: 'user@example.com', quantity: 2 });

    const invalid = { body: { name: '', email: 'invalid', quantity: 9 } };
    let invalidError;
    middleware(invalid, {}, error => { invalidError = error; });
    assert.equal(invalidError.status, 400);
    assert.equal(invalidError.code, 'VALIDATION_ERROR');
    assert.equal(invalidError.details.fields.length, 3);
});

test('CSRF middleware rejects foreign browser writes and allows same-origin writes', () => {
    const { csrfProtection } = require('../src/middleware/csrf');
    function request(origin, fetchSite = 'same-origin') {
        const headers = { host: 'localhost:3000', origin, 'sec-fetch-site': fetchSite };
        return {
            method: 'POST',
            protocol: 'http',
            get(name) { return headers[String(name).toLowerCase()]; }
        };
    }
    let sameOriginError;
    csrfProtection(request('http://localhost:3000'), {}, error => { sameOriginError = error; });
    assert.equal(sameOriginError, undefined);

    let foreignError;
    csrfProtection(request('https://attacker.example', 'cross-site'), {}, error => { foreignError = error; });
    assert.equal(foreignError.status, 403);
    assert.equal(foreignError.code, 'CSRF_ORIGIN_REJECTED');
});

test('security headers include a restrictive content security policy', () => {
    const { securityHeaders } = require('../src/middleware/security');
    const headers = new Map();
    securityHeaders({ path: '/' }, { setHeader(name, value) { headers.set(name, value); } }, () => {});
    const policy = headers.get('Content-Security-Policy');
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /img-src 'self' data: https:\/\/res\.cloudinary\.com/);
});

test('every admin page uses only the rebuilt shared admin interface', () => {
    const adminDir = path.join(root, 'views', 'admin');
    const pages = fs.readdirSync(adminDir).filter(name => name.endsWith('.html'));
    assert.equal(pages.length, 10);
    for (const page of pages) {
        const html = fs.readFileSync(path.join(adminDir, page), 'utf8');
        assert.match(html, /<link rel="stylesheet" href="\/css\/admin\.css(?:\?[^\"]*)?">/);
        assert.match(html, /<script src="\/js\/admin-ui\.js(?:\?[^\"]*)?"><\/script>/);
        assert.match(html, /<body class="[^"]*\badmin-shell\b[^"]*">/);
        assert.doesNotMatch(html, /<style[\s>]/);
        assert.doesNotMatch(html, /admin-v3\.css/);
        assert.ok(html.indexOf('/css/admin.css') < html.indexOf('</head>'));
        assert.ok(html.indexOf('/js/admin-ui.js') < html.indexOf('</body>'));
    }
    const sharedScript = fs.readFileSync(path.join(root, 'public', 'js', 'admin-ui.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(sharedScript));
});

test('home product cards disable cart actions and show a badge when stock is depleted', () => {
    const html = fs.readFileSync(path.join(root, 'views', 'index.html'), 'utf8');
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .find(source => source.includes('function createProductCard'));
    const context = vm.createContext({
        console,
        document: { addEventListener() {}, getElementById() { return null; } },
        formatPrice(value) { return String(value); },
        fetch: async () => ({ json: async () => ({}) }),
        setInterval() {},
        clearInterval() {}
    });
    vm.runInContext(script, context);

    const soldOut = context.createProductCard({
        id: 1, name: 'Điện thoại hết hàng', price: 1000, old_price: null,
        discount_percent: 0, stock: '0', thumbnail: null, brand_name: 'Test'
    });
    assert.match(soldOut, /product-stock-badge[^>]*>Hết hàng</);
    assert.match(soldOut, /btn-out-of-stock" disabled/);
    assert.doesNotMatch(soldOut, /onclick="addToCart\(/);

    const available = context.createProductCard({
        id: 2, name: 'Điện thoại còn hàng', price: 1000, old_price: null,
        discount_percent: 0, stock: '3', thumbnail: null, brand_name: 'Test'
    });
    assert.match(available, /onclick="addToCart\(2\)"/);
    assert.doesNotMatch(available, /btn-out-of-stock|product-stock-badge/);

    const malicious = context.createProductCard({
        id: 3,
        name: '<img src=x onerror=alert(1)>',
        brand_name: '<script>alert(1)</script>',
        price: 1000,
        old_price: null,
        discount_percent: 0,
        stock: 1,
        thumbnail: 'phone.jpg'
    });
    assert.doesNotMatch(malicious, /<script>|<img src=x onerror/);
    assert.match(malicious, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('product descriptions and promotion fallbacks escape API-provided HTML', () => {
    const productDetail = fs.readFileSync(path.join(root, 'views', 'product-detail.html'), 'utf8');
    const home = fs.readFileSync(path.join(root, 'views', 'index.html'), 'utf8');
    assert.match(productDetail, /escapeHtml\(product\.description \|\| 'Chưa có mô tả/);
    assert.match(home, /escapeHtml\(mainPromo\.title \|\| ''\)/);
    assert.match(home, /escapeHtml\(p\.description \|\| ''\)/);
    assert.match(home, /safeInternalLink\(p\.link_url\)/);
});

function loadPage(name, search = '') {
    const html = fs.readFileSync(path.join(root, 'views', name + '.html'), 'utf8');
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map(m => m[1]).find(source => source.includes('let currentFilters ='));
    const elements = new Map();
    const groups = { brand: [], discount: [] };
    const element = () => ({ value: '', hidden: true, children: [], entries: [], style: {},
        addEventListener() {}, setAttribute() {},
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; }
    });
    const document = {
        addEventListener() {}, createElement: element,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        },
        querySelectorAll(selector) { return groups[selector.match(/name="(\w+)"/)[1]] || []; }
    };
    const location = { search, href: '' };
    const context = vm.createContext({ document, URLSearchParams, console,
        window: { location, addEventListener() {}, history: { replaceState(a, b, url) { location.href = url; } } },
        FormData: class {
            constructor(form) { this.params = new URLSearchParams(form.entries); }
            get(key) { return this.params.get(key); }
            getAll(key) { return this.params.getAll(key); }
        }
    });
    vm.runInContext(script, context);
    return { context, groups, document, location,
        run(source) { return vm.runInContext(source, context); },
        params() { return new URL(location.href, 'http://localhost').searchParams; },
        input(id, value) { document.getElementById(id).value = value; },
        form(entries) { document.getElementById('filterForm').entries = entries; }
    };
}

test('product URL keeps all selected brands/RAM/storage when paging', () => {
    const page = loadPage('products', '?brand=apple&brand=2&ram=8&ram=12GB&storage=256GB&storage=512GB&price_min=1000000&price_max=20000000&sort=price_desc&q=phone&page=2');
    page.run('parseURLParams(); goPage(3)');
    const params = page.params();
    assert.deepEqual(params.getAll('brand'), ['apple', '2']);
    assert.deepEqual(params.getAll('ram'), ['8GB', '12GB']);
    assert.deepEqual(params.getAll('storage'), ['256GB', '512GB']);
    assert.equal(params.get('sort'), 'price_desc');
    assert.equal(params.get('price_min'), '1000000');
    assert.equal(params.get('q'), 'phone');
    assert.equal(params.get('page'), '3');
});

test('checkbox change and submit retain price, search, sort and reset page', () => {
    const page = loadPage('products', '?page=5&featured=1');
    page.run('parseURLParams()');
    page.form([['category', 'dien-thoai'], ['brand', '1'], ['brand', '2'], ['ram', '8GB'], ['storage', '256GB'], ['q', 'Galaxy']]);
    page.input('priceMin', '5.000.000');
    page.input('priceMax', '30.000.000');
    page.input('sortSelect', 'price_asc');
    page.run('autoApplyFilter()');
    const params = page.params();
    assert.deepEqual(params.getAll('brand'), ['1', '2']);
    assert.equal(params.get('price_min'), '5000000');
    assert.equal(params.get('price_max'), '30000000');
    assert.equal(params.get('q'), 'Galaxy');
    assert.equal(params.get('sort'), 'price_asc');
    assert.equal(params.get('featured'), '1');
    assert.equal(params.get('page'), null);
});

test('removing tags does not restore old form values', () => {
    const page = loadPage('products', '?brand=1&brand=2&price_min=5000000&sort=discount');
    page.run('parseURLParams()');
    page.form([['brand', '1'], ['brand', '2']]);
    page.run("removeFilter('brand', '1'); removeFilter('price_min')");
    assert.deepEqual(page.params().getAll('brand'), ['2']);
    assert.equal(page.params().get('price_min'), null);
    assert.equal(page.params().get('sort'), 'discount');
});

test('invalid/reversed prices show an error instead of navigating', () => {
    for (const [min, max] of [['20000000', '1000000'], ['abc', ''], ['-1', ''], ['1,5', '']]) {
        const page = loadPage('products');
        page.input('priceMin', min);
        page.input('priceMax', max);
        page.run('applyFilters()');
        assert.equal(page.location.href, '');
        assert.equal(page.document.getElementById('filterError').hidden, false);
    }
});

test('RAM/brand checkboxes restore every URL choice, including slug links', () => {
    const page = loadPage('products', '?brand=apple&brand=2&ram=8&ram=12GB&storage=256GB&storage=512GB');
    page.run(`parseURLParams(); renderFilters({ categories: [],
        brands: [{id:1,name:'Apple',slug:'apple'},{id:2,name:'Samsung',slug:'samsung'}],
        rams:['8GB','12GB','16GB'], storages:['256GB','512GB'] })`);
    for (const [id, count] of [['brandFilters', 2], ['ramFilters', 2], ['storageFilters', 2]]) {
        assert.equal((page.document.getElementById(id).innerHTML.match(/ checked/g) || []).length, count);
    }
});

test('promotion filters combine multiple brands, price, discount and sort', () => {
    const page = loadPage('promotions', '?brand=apple&brand=2&discount=10&price_max=200&sort=price_desc');
    page.run(`allBrands = [{id:1,name:'Apple',slug:'apple'}, {id:2,name:'Samsung',slug:'samsung'}];
        allProducts = [
            {id:1,brand_id:1,price:100,discount_percent:15},
            {id:2,brand_id:2,price:200,discount_percent:20},
            {id:3,brand_id:3,price:100,discount_percent:30},
            {id:4,brand_id:1,price:300,discount_percent:15},
            {id:5,brand_id:1,price:100,discount_percent:5}];
        renderProducts = products => { globalThis.rendered = products.map(p => p.id); };
        parseURLParams(); applyFiltersAndRender(); buildUrlFromFilters();`);
    assert.deepEqual(plain(page.context.rendered), [2, 1]);
    assert.deepEqual(page.params().getAll('brand'), ['apple', '2']);
    page.run("removeFilter('brand', 'apple')");
    assert.deepEqual(plain(page.context.rendered), [2]);
});

test('removed promotion filters clear their checked form controls', () => {
    const page = loadPage('promotions', '?brand=1&discount=20');
    page.groups.brand.push({ value: '1', checked: true });
    page.groups.discount.push({ value: '0', checked: false }, { value: '20', checked: true });
    page.run("parseURLParams(); removeFilter('brand'); removeFilter('discount')");
    assert.equal(page.groups.brand[0].checked, false);
    assert.equal(page.groups.discount[0].checked, true);
    assert.equal(page.groups.discount[1].checked, false);
});

test('promotion loading includes results beyond the first 200 products', async () => {
    const page = loadPage('promotions');
    const calls = [];
    page.context.fetch = async url => {
        calls.push(url);
        const id = Number(new URL(url, 'http://localhost').searchParams.get('page'));
        return { ok: true, json: async () => ({ products: [{ id, discount_percent: 10 }], totalPages: 2 }) };
    };
    page.run('applyFiltersAndRender = () => {}');
    await page.run('loadPromotions()');
    assert.equal(calls.length, 2);
    assert.deepEqual(plain(page.run('allProducts.map(p => p.id)')), [1, 2]);
});

function adminDelete(query) {
    const filename = path.join(root, 'src', 'routes', 'admin.js');
    const localRequire = createRequire(filename);
    const context = vm.createContext({ module: { exports: {} }, __dirname: path.dirname(filename), console,
        require(name) {
            if (name === '../config/database') return { query };
            if (name === '../services/cloud-storage') return cloudStorageStub;
            return localRequire(name);
        }
    });
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
    return context.module.exports.stack.find(layer => layer.route?.path === '/products/:id' && layer.route.methods.delete).route;
}

async function callDelete(route, id, role = 'admin') {
    const req = { params: { id }, session: { user_id: 1, role }, method: 'DELETE', headers: {}, get() {} };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let authorized = false;
    route.stack[0].handle(req, res, () => { authorized = true; });
    if (authorized) await route.stack[1].handle(req, res);
    return res;
}

test('ordered product deletion preserves gallery and returns a clear conflict', async () => {
    const calls = [];
    const route = adminDelete(async sql => {
        calls.push(sql);
        if (sql.startsWith('SELECT image_url')) return [[]];
        const error = new Error('Referenced by order_items');
        error.code = 'ER_ROW_IS_REFERENCED_2';
        error.errno = 1451;
        throw error;
    });
    const res = await callDelete(route, '1');
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /đơn hàng/);
    assert.deepEqual(calls, [
        'SELECT image_url FROM product_images WHERE product_id = ?',
        'DELETE FROM products WHERE id = ?'
    ]);
});

test('unreferenced product deletion succeeds; missing products return 404', async () => {
    for (const [affectedRows, status] of [[1, 200], [0, 404]]) {
        const route = adminDelete(async sql => sql.startsWith('SELECT image_url') ? [[]] : [{ affectedRows }]);
        assert.equal((await callDelete(route, '1')).statusCode, status);
    }
});

test('invalid ID and non-admin requests cannot delete products', async () => {
    let calls = 0;
    const route = adminDelete(async () => { calls++; return [{ affectedRows: 1 }]; });
    assert.equal((await callDelete(route, '0')).statusCode, 400);
    assert.equal((await callDelete(route, 'abc')).statusCode, 400);
    assert.equal((await callDelete(route, '1', 'customer')).statusCode, 401);
    assert.equal(calls, 0);
});

test('admin product detail supports databases without product_images.alt_text', async () => {
    const missingColumn = Object.assign(new Error("Unknown column 'alt_text' in 'field list'"), {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'alt_text' in 'field list'"
    });
    const queries = [];
    const pool = { async query(sql) {
        queries.push(sql);
        if (sql.startsWith('SELECT * FROM products')) return [[{ id: 65, name: 'Phone' }]];
        if (sql.includes('image_url, alt_text')) throw missingColumn;
        if (sql.includes('FROM product_images')) return [[{
            id: 7, image_url: 'phone.jpg', is_primary: 1, sort_order: 1
        }]];
        if (sql.includes('FROM product_variants')) return [[]];
        throw new Error('Unexpected query: ' + sql);
    } };
    const filename = path.join(root, 'src', 'routes', 'admin.js');
    const route = loadRoute(filename, '/products/:id', 'get', pool);
    const res = jsonResponse();

    await route.stack.at(-1).handle({ params: { id: '65' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.images[0].alt_text, null);
    assert.ok(queries.some(sql => sql.includes('image_url, alt_text')));
    assert.ok(queries.some(sql => sql.includes('image_url, is_primary')));
});

test('product update keeps selected old images, adds new files and stores unchecked featured state', async () => {
    const filename = path.join(root, 'src', 'routes', 'admin.js');
    const localRequire = createRequire(filename);
    let updateParams;
    let galleryValues;
    const connection = {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async query(sql, params) {
            if (sql.startsWith('SELECT name, thumbnail')) return [[{ name: 'Phone', thumbnail: 'old-a.jpg' }]];
            if (sql.startsWith('SELECT id, image_url')) return [[
                { id: 10, image_url: 'old-a.jpg' },
                { id: 11, image_url: 'old-b.jpg' }
            ]];
            if (sql.startsWith('UPDATE products SET')) {
                updateParams = params;
                return [{ affectedRows: 1 }];
            }
            if (sql.startsWith('DELETE FROM product_images')) return [{ affectedRows: 2 }];
            if (sql.startsWith('INSERT INTO product_images')) {
                galleryValues = params[0];
                return [{ affectedRows: 2 }];
            }
            throw new Error('Unexpected connection query: ' + sql);
        }
    };
    const pool = {
        async query(sql) {
            if (sql.includes('FROM brands') || sql.includes('FROM categories')) return [[{ id: 1 }]];
            throw new Error('Unexpected pool query: ' + sql);
        },
        async getConnection() { return connection; }
    };
    const context = vm.createContext({ module: { exports: {} }, __dirname: path.dirname(filename), console,
        require(name) {
            if (name === '../config/database') return pool;
            if (name === '../services/cloud-storage') return cloudStorageStub;
            return localRequire(name);
        }
    });
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
    const route = context.module.exports.stack.find(layer => layer.route?.path === '/products/:id' && layer.route.methods.put).route;
    const req = {
        params: { id: '1' },
        body: {
            name: 'Phone', brand_id: '1', category_id: '1', price: '1000000', old_price: '1200000',
            discount_percent: '17', description: '', ram: '8GB', storage: '256GB', stock: '5',
            is_featured: 'false', os: '', chipset: '', cpu: '', gpu: '', screen_size: '', screen_resolution: '',
            galleryManifest: JSON.stringify([{ type: 'existing', id: 10 }, { type: 'new', uploadIndex: 0 }]),
            primaryImageIndex: '1'
        },
        files: [{
            filename: 'anhtraisstore/products/new',
            path: 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/new.png',
            cloudinaryPublicId: 'anhtraisstore/products/new'
        }]
    };
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };

    await route.stack[2].handle(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(updateParams[7], 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/new.png');
    assert.equal(updateParams[9], 0);
    assert.deepEqual(plain(galleryValues), [
        [1, 'old-a.jpg', null, 0, 1],
        [1, 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/new.png', null, 1, 2]
    ]);
});

test('admin product gallery compares database image IDs consistently and supports legacy thumbnails', () => {
    const html = fs.readFileSync(path.join(root, 'views', 'admin', 'products.html'), 'utf8');
    assert.match(html, /String\(img\.id\) !== String\(id\)/);
    assert.match(html, /String\(img\.id\) === String\(id\)/);
    assert.match(html, /type: 'current_thumbnail'/);
    assert.match(html, /hasStoredPrimary \? img\.is_primary == 1 : index === 0/);
});

test('all inline page scripts have valid JavaScript syntax', () => {
    let scriptCount = 0;
    function walk(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filename = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(filename);
            } else if (filename.endsWith('.html')) {
                const html = fs.readFileSync(filename, 'utf8');
                for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
                    if (!match[1].trim()) continue;
                    assert.doesNotThrow(() => new Function(match[1]), `Invalid inline script in ${filename}`);
                    scriptCount++;
                }
            }
        }
    }
    walk(path.join(root, 'views'));
    assert.ok(scriptCount > 0);
});

test('admin uses the storefront palette and banner toast starts hidden', () => {
    const css = fs.readFileSync(path.join(root, 'public', 'css', 'admin.css'), 'utf8');
    const banners = fs.readFileSync(path.join(root, 'views', 'admin', 'banners.html'), 'utf8');
    const dashboard = fs.readFileSync(path.join(root, 'views', 'admin', 'index.html'), 'utf8');
    assert.match(css, /--primary:\s*#1676D2/i);
    assert.match(css, /--primary-dark:\s*#0F5EAE/i);
    assert.match(css, /--primary-light:\s*#4597E7/i);
    assert.match(css, /--success:\s*#10B981/i);
    assert.match(css, /--warning:\s*#F59E0B/i);
    assert.match(css, /--danger:\s*#EF4444/i);
    assert.match(css, /\.stat-card:nth-child\(n\)[^{]*\{[^}]*background:\s*#fff;/s);
    assert.match(css, /\.toast\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/s);
    assert.match(banners, /let toastTimer = null/);
    assert.match(banners, /clearTimeout\(toastTimer\)/);
    assert.match(dashboard, /class="low-stock-alert collapsed"/);
    assert.match(dashboard, /message\.textContent = `\$\{totalItems\} mục cần xử lý`/);
    assert.doesNotMatch(dashboard, /message\.innerHTML = allParts\.join/);
    assert.match(dashboard, /id="operationsGrid"/);
    assert.match(dashboard, /id="primaryCharts"/);
    assert.match(dashboard, /id="topCustomersSection"/);
    assert.match(dashboard, /\^https:\\\/\\\/res\\\.cloudinary\\\.com/);
    assert.match(css, /#operationsGrid\s*\{\s*order:\s*4/);
    assert.match(css, /#topCustomersSection\s*\{\s*order:\s*7/);
    assert.match(dashboard, />\s*Top 5 sản phẩm bán chạy\s*</);
    assert.doesNotMatch(dashboard, />\s*Top sản phẩm\s*</);
    assert.doesNotMatch(dashboard, /id="topProductsList"/);
    assert.match(dashboard, /id="operationsGrid" class="dashboard-grid dashboard-grid-operations"/);
    assert.ok(dashboard.indexOf('id="operationsGrid"') < dashboard.indexOf('id="topCustomersSection"'));
    assert.match(dashboard, /orders\.slice\(0, 5\)/);
    assert.match(css, /\.dashboard-page \.stat-card \{ min-height: 122px/);
    assert.equal((dashboard.match(/document\.addEventListener\('DOMContentLoaded'/g) || []).length, 1);
});

test('review comments keep customer text separate from the admin reply', () => {
    const { parseReviewComment, serializeReviewComment } = require('../src/core/review-comment');
    const stored = serializeReviewComment('Sản phẩm tốt', 'Cảm ơn bạn đã đánh giá!');
    assert.deepEqual(parseReviewComment(stored), {
        comment: 'Sản phẩm tốt',
        admin_reply: 'Cảm ơn bạn đã đánh giá!'
    });
    assert.equal(serializeReviewComment(stored, 'Phản hồi đã sửa').match(/ANHTRAISTORE_ADMIN_REPLY/g).length, 1);
});

test('admin can see reviewer identity and persist a review reply without a schema change', async () => {
    const selected = [];
    const updated = [];
    const pool = {
        async query(sql, params) {
            if (sql.includes('LEFT JOIN users')) {
                selected.push(sql);
                return [[{
                    id: 7, user_name: 'Nguyễn Văn An', user_email: 'an@example.com',
                    product_name: 'Điện thoại A', comment: 'Rất tốt\n\n[[ANHTRAISTORE_ADMIN_REPLY]]\nCảm ơn bạn'
                }]];
            }
            if (sql.startsWith('SELECT comment FROM reviews')) return [[{ comment: 'Rất tốt' }]];
            if (sql.startsWith('UPDATE reviews SET comment')) {
                updated.push(params);
                return [{ affectedRows: 1 }];
            }
            throw new Error('Unexpected query: ' + sql);
        }
    };
    const listRoute = loadRoute(path.join(root, 'src', 'routes', 'admin.js'), '/reviews/list', 'get', pool);
    const listResponse = jsonResponse();
    await listRoute.stack[1].handle({}, listResponse);
    assert.match(selected[0], /u\.full_name AS user_name/);
    assert.equal(listResponse.body.reviews[0].user_name, 'Nguyễn Văn An');
    assert.equal(listResponse.body.reviews[0].admin_reply, 'Cảm ơn bạn');
    assert.equal(listResponse.body.reviews[0].comment, 'Rất tốt');

    const replyRoute = loadRoute(path.join(root, 'src', 'routes', 'admin.js'), '/reviews/:id/reply', 'put', pool);
    const replyResponse = jsonResponse();
    await replyRoute.stack[1].handle({ params: { id: '7' }, body: { reply: 'Shop cảm ơn bạn!' } }, replyResponse);
    assert.equal(replyResponse.body.success, true);
    assert.match(updated[0][0], /\[\[ANHTRAISTORE_ADMIN_REPLY\]\]/);
    assert.match(updated[0][0], /Shop cảm ơn bạn!/);
    assert.equal(updated[0][1], 7);
});

test('admin review page defines HTML escaping and reports loading failures', () => {
    const page = fs.readFileSync(path.join(root, 'views', 'admin', 'reviews.html'), 'utf8');
    assert.match(page, /function escapeHtml\(value\)/);
    assert.match(page, /if \(!res\.ok\) throw new Error\(data\.error/);
    assert.match(page, /console\.error\('Load reviews error:', e\)/);
});

test('support chat reuses one conversation per account and persists the first message', async () => {
    const calls = [];
    let committed = false;
    let released = false;
    const connection = {
        async beginTransaction() {},
        async commit() { committed = true; },
        async rollback() {},
        release() { released = true; },
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('INSERT INTO contacts')) return [{ insertId: 50 }];
            if (sql.includes('SELECT id FROM conversations')) return [[{ id: 7 }]];
            if (sql.includes('UPDATE conversations')) return [{ affectedRows: 1 }];
            if (sql.includes('INSERT INTO messages')) return [{ insertId: 90 }];
            if (sql.includes('SELECT * FROM messages')) {
                return [[{ id: 90, conversation_id: 7, sender_type: 'user', content: 'Cần hỗ trợ' }]];
            }
            throw new Error('Unexpected query: ' + sql);
        }
    };
    const pool = { async getConnection() { return connection; } };
    const route = loadRoute(path.join(root, 'src', 'routes', 'api.js'), '/contact', 'post', pool);
    const response = jsonResponse();
    const emitted = [];
    await route.stack.at(-1).handle({
        session: { user_id: 5 },
        body: { full_name: 'Khách', email: 'khach@example.com', phone: '', message: 'Cần hỗ trợ' },
        app: { get() { return { to() { return { emit(event, data) { emitted.push({ event, data }); } }; } }; } }
    }, response);

    assert.equal(response.body.conversation_id, 7);
    assert.equal(committed, true);
    assert.equal(released, true);
    assert.match(calls.find(call => call.sql.includes('SELECT id FROM conversations')).sql, /WHERE user_id = \?/);
    assert.deepEqual(Array.from(calls.find(call => call.sql.includes('INSERT INTO messages')).params), [7, 5, 'Cần hỗ trợ']);
    assert.equal(emitted[0].data.conversation_id, 7);
});

test('customer chat is session-scoped while admin history is grouped by account', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'routes', 'messages.js'), 'utf8');
    assert.match(source, /support_chat_started_at/);
    assert.match(source, /related\.user_id = \? AND m\.created_at >= \?/);
    assert.match(source, /SELECT current\.\*[\s\S]*JOIN conversations current ON current\.user_id = requested\.user_id/);
    assert.match(source, /WHERE c\.user_id IS NULL\s+OR NOT EXISTS/);
    assert.match(source, /FROM \(\s+SELECT m\.id[\s\S]*WHERE related\.user_id = \?[\s\S]*UNION ALL[\s\S]*existing\.content = ct\.message/);
    assert.match(source, /UPDATE conversations SET status = \? WHERE user_id = \?/);
    const widget = fs.readFileSync(path.join(root, 'views', 'components', 'ai-chatbox.html'), 'utf8');
    assert.match(widget, /currentConversationId = canonicalId/);
});

function loadRoute(filename, routePath, method, pool) {
    const localRequire = createRequire(filename);
    const context = vm.createContext({ module: { exports: {} }, __dirname: path.dirname(filename), console, URL,
        require(name) {
            if (name === '../config/database') return pool;
            if (name === '../services/cloud-storage') return cloudStorageStub;
            return localRequire(name);
        }
    });
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
    return context.module.exports.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]).route;
}

function jsonResponse() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('VIP20 rejects accounts below the delivered-spend requirement', async () => {
    const pool = { async query(sql) {
        if (sql.includes('SELECT * FROM coupons')) return [[{
            id: 3, code: 'VIP20', description: 'VIP', discount_type: 'percent', discount_value: 20,
            min_order_value: 3000000, max_discount: 1000000, usage_limit: 100, used_count: 0
        }]];
        if (sql.includes('FROM user_coupons')) return [[]];
        if (sql.includes('COALESCE(SUM(total_price)')) return [[{ total: 29999999 }]];
        throw new Error('Unexpected query: ' + sql);
    } };
    const route = loadRoute(path.join(root, 'src', 'routes', 'coupons.js'), '/validate', 'post', pool);
    const res = jsonResponse();
    await route.stack[0].handle({ body: { code: 'VIP20', order_total: 3000000 }, session: { user_id: 1 } }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /30 triệu/);
});

test('FREESHIP is consistently presented as a 30K order discount', async () => {
    const pool = { async query(sql) {
        if (sql.includes('SELECT * FROM coupons')) return [[{
            id: 2, code: 'FREESHIP', description: 'Giảm phí vận chuyển', discount_type: 'fixed',
            discount_value: 30000, min_order_value: 500000, max_discount: null, usage_limit: null, used_count: 0
        }]];
        if (sql.includes('FROM user_coupons')) return [[]];
        throw new Error('Unexpected query: ' + sql);
    } };
    const route = loadRoute(path.join(root, 'src', 'routes', 'coupons.js'), '/validate', 'post', pool);
    const res = jsonResponse();
    await route.stack[0].handle({ body: { code: 'FREESHIP', order_total: 500000 }, session: { user_id: 1 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.coupon.discount_amount, 30000);
    assert.equal(res.body.coupon.description, 'Giảm 30K cho đơn từ 500K');
});

test('available coupons exclude used, first-order-only and ineligible VIP codes', async () => {
    const pool = { async query(sql) {
        if (sql.includes('FROM coupons')) {
            assert.doesNotMatch(sql, /used_count < usage_limit/);
            assert.doesNotMatch(sql, /min_order_value, 0\) <= \?/);
            return [[
                { id: 1, code: 'PHONE15', discount_type: 'percent', discount_value: 15, min_order_value: 5000000, usage_limit: 50, used_count: 2 },
                { id: 2, code: 'WELCOME10', discount_type: 'percent', discount_value: 10, min_order_value: 1000000, usage_limit: 100, used_count: 3 },
                { id: 3, code: 'VIP20', discount_type: 'percent', discount_value: 20, min_order_value: 3000000, usage_limit: 100, used_count: 1 },
                { id: 4, code: 'FREESHIP', discount_type: 'fixed', discount_value: 30000, min_order_value: 500000, usage_limit: null, used_count: 8 },
                { id: 5, code: 'HIGHVALUE', discount_type: 'fixed', discount_value: 500000, min_order_value: 10000000, usage_limit: null, used_count: 0 },
                { id: 6, code: 'SOLDOUT', discount_type: 'fixed', discount_value: 100000, min_order_value: 0, usage_limit: 1, used_count: 1 }
            ]];
        }
        if (sql.includes('FROM user_coupons')) return [[{ coupon_id: 1 }]];
        if (sql.includes('SELECT id FROM orders')) return [[{ id: 9 }]];
        if (sql.includes('COALESCE(SUM(total_price)')) return [[{ total: 10000000 }]];
        throw new Error('Unexpected query: ' + sql);
    } };
    const route = loadRoute(path.join(root, 'src', 'routes', 'coupons.js'), '/available', 'get', pool);
    const res = jsonResponse();
    await route.stack[0].handle({ query: { order_total: '5000000' }, session: { user_id: 7 } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(plain(res.body.coupons.map(coupon => coupon.code)), ['FREESHIP']);
    assert.deepEqual(plain(res.body.unavailable.map(coupon => coupon.code)), [
        'PHONE15', 'WELCOME10', 'VIP20', 'HIGHVALUE', 'SOLDOUT'
    ]);
    assert.match(res.body.unavailable.find(coupon => coupon.code === 'PHONE15').reason, /đã sử dụng/);
    assert.match(res.body.unavailable.find(coupon => coupon.code === 'WELCOME10').reason, /đơn hàng đầu tiên/);
    assert.match(res.body.unavailable.find(coupon => coupon.code === 'VIP20').reason, /30 triệu/);
    assert.match(res.body.unavailable.find(coupon => coupon.code === 'HIGHVALUE').reason, /10\.000\.000/);
    assert.match(res.body.unavailable.find(coupon => coupon.code === 'SOLDOUT').reason, /hết lượt/);
});

test('checkout requests eligible coupons and validates minimum value from product subtotal', () => {
    const html = fs.readFileSync(path.join(root, 'views', 'checkout.html'), 'utf8');
    assert.match(html, /coupons\/available\?order_total=' \+ encodeURIComponent\(subtotal\)/);
    assert.match(html, /JSON\.stringify\(\{ code, order_total: subtotal \}\)/);
    assert.match(html, /unavailableCoupons = Array\.isArray\(data\.unavailable\)/);
    assert.match(html, /Hiện không có mã nào dùng được cho đơn hàng này/);
    assert.match(html, /Không thể tải danh sách mã giảm giá/);
    assert.match(html, /function removeCoupon\(\)\s*\{[\s\S]*?appliedCoupon = null;[\s\S]*?renderOrderSummary\(\);[\s\S]*?updateQRAmount\(\);[\s\S]*?\}/);
    assert.doesNotMatch(html, /order_total: totalBeforeDiscount/);
});

test('banner API normalizes numeric positions and localhost links', async () => {
    const pool = { async query() { return [[{
        id: 1, position: '0', link: 'http://localhost:3000/product/53', image_url: '/banner.jpg'
    }]]; } };
    const route = loadRoute(path.join(root, 'src', 'routes', 'api.js'), '/banners/active', 'get', pool);
    const res = jsonResponse();
    await route.stack[0].handle({ session: {} }, res);
    assert.equal(res.body.banners[0].position, 'hero');
    assert.equal(res.body.banners[0].link, '/product/53');
});

test('main banner supports ten Cloudinary images and rotates every two seconds without cropping', async () => {
    let insertedValues;
    const connection = {
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
        async query(sql, params) {
            if (sql.startsWith('SELECT image_url FROM banners')) return [[{ image_url: '/uploads/banners/old.jpg' }]];
            if (sql.startsWith('DELETE FROM banners')) return [{ affectedRows: 1 }];
            if (sql.startsWith('INSERT INTO banners')) {
                insertedValues = params[0];
                return [{ affectedRows: insertedValues.length }];
            }
            throw new Error('Unexpected query: ' + sql);
        }
    };
    const pool = { async getConnection() { return connection; } };
    const route = loadRoute(path.join(root, 'src', 'routes', 'admin.js'), '/banners/hero-set', 'put', pool);
    const res = jsonResponse();
    const urls = Array.from({ length: 10 }, (_, index) => `https://res.cloudinary.com/demo/image/upload/v1/banner-${index}.jpg`);
    await route.stack[1].handle({ body: {
        image_urls: urls, title: 'Khuyến mãi', subtitle: 'Banner', link: '/products', is_active: true
    } }, res);
    assert.equal(res.body.count, 10);
    assert.equal(insertedValues.length, 10);
    assert.deepEqual(plain(insertedValues.map(row => row[6])), [0,1,2,3,4,5,6,7,8,9]);

    const home = fs.readFileSync(path.join(root, 'views', 'index.html'), 'utf8');
    const admin = fs.readFileSync(path.join(root, 'views', 'admin', 'banners.html'), 'utf8');
    assert.match(home, /setInterval\([\s\S]*?,\s*2000\)/);
    assert.match(home, /\.filter\([\s\S]*?position[\s\S]*?\)\.slice\(0, 10\)/);
    assert.match(fs.readFileSync(path.join(root, 'public', 'css', 'pages', 'index.css'), 'utf8'), /object-fit:\s*contain/);
    assert.match(home, /id="homeHeroControls"[^>]*aria-label="Chọn banner"/);
    assert.match(home, /dot\.className = 'home-hero-dot'/);
    assert.match(home, /dot\.addEventListener\('click', \(\) => renderHomeBannerSlide\(slideIndex\)\)/);
    assert.match(home, /link\.href = !banner\.link[\s\S]*?'\/products'/);
    assert.doesNotMatch(home, /controls\.innerHTML\s*=/);
    assert.match(admin, /id="imageInput"[^>]*accept="image\/\*"/);
});

test('main banner copy stays compact and admin orders has no online-only status filter', () => {
    const home = fs.readFileSync(path.join(root, 'views', 'index.html'), 'utf8');
    const homeCss = fs.readFileSync(path.join(root, 'public', 'css', 'pages', 'index.css'), 'utf8');
    const orders = fs.readFileSync(path.join(root, 'views', 'admin', 'orders.html'), 'utf8');
    assert.match(homeCss, /\.banner-title\s*\{[\s\S]*?font-size:\s*2rem;/);
    assert.match(homeCss, /\.banner-title span\s*\{[^}]*font-size:\s*1rem;/);
    assert.match(homeCss, /\.btn-banner\s*\{[\s\S]*?padding:\s*10px 18px;[\s\S]*?font-size:\s*0\.82rem;/);
    assert.match(homeCss, /\.main-banner\s*\{[\s\S]*?align-items:\s*flex-start;[\s\S]*?justify-content:\s*flex-end;/);
    assert.match(home, /class="home-hero-title"/);
    assert.doesNotMatch(orders, /online_paid|>\s*✅ Online\s*</);
});

test('customer account pages use the shared flat light page header', () => {
    for (const name of ['orders.html', 'checkout.html', 'profile.html']) {
        const page = fs.readFileSync(path.join(root, 'views', name), 'utf8');
        const cssName = name.replace(/\.html$/, '.css');
        const css = fs.readFileSync(path.join(root, 'public', 'css', 'pages', cssName), 'utf8');
        assert.match(page, new RegExp(`/css/pages/${cssName.replace('.', '\\.')}`));
        assert.match(css, /\.page-header\s*\{[^}]*background:\s*var\(--white\)/s);
        assert.match(css, /\.page-title h1\s*\{[^}]*color:\s*var\(--dark\)/s);
        assert.match(css, /\.page-header\s*\{[^}]*padding:\s*20px 0/s);
        assert.doesNotMatch(css, /\.page-header \{ padding: 32px 0; \}/);
        assert.doesNotMatch(css, /\.page-header\s*\{[^}]*#0f172a/s);
    }
});

test('category and brand status remains internal and is hidden from admin pages', async () => {
    for (const entity of ['categories', 'brands']) {
        let updateParams;
        const pool = { async query(sql, params) {
            if (sql.includes('WHERE slug = ? AND id != ?')) return [[]];
            if (sql.startsWith(`UPDATE ${entity} SET`)) {
                updateParams = params;
                return [{ affectedRows: 1 }];
            }
            throw new Error('Unexpected query: ' + sql);
        } };
        const route = loadRoute(path.join(root, 'src', 'routes', 'api.js'), `/${entity}/:id`, 'put', pool);
        const res = jsonResponse();
        await route.stack[1].handle({
            params: { id: '5' },
            body: { name: 'Tên kiểm tra', slug: 'ten-kiem-tra', is_active: 0 },
            session: { user_id: 1, role: 'admin' }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(updateParams[entity === 'categories' ? 3 : 2], 0);

        const page = fs.readFileSync(path.join(root, 'views', 'admin', `${entity}.html`), 'utf8');
        assert.doesNotMatch(page, /<th>Trạng thái<\/th>/);
        assert.doesNotMatch(page, /entity-status-control|Active"|toggle(?:Category|Brand)Status/);
        assert.match(page, /Number\(current(?:Category|Brand)\.is_active\) === 0 \? 0 : 1/);
    }
});

test('admin destructive actions use the shared website confirmation dialog', () => {
    const adminUi = fs.readFileSync(path.join(root, 'public', 'js', 'admin-ui.js'), 'utf8');
    assert.match(adminUi, /function adminConfirm\(options\)/);
    assert.match(adminUi, /role', 'alertdialog'/);
    assert.match(adminUi, /window\.showConfirm/);

    for (const name of fs.readdirSync(path.join(root, 'views', 'admin'))) {
        if (!name.endsWith('.html')) continue;
        const page = fs.readFileSync(path.join(root, 'views', 'admin', name), 'utf8');
        assert.doesNotMatch(page, /\bconfirm\(/, `${name} still uses the browser confirm dialog`);
        assert.doesNotMatch(page, /function showConfirm\(/, `${name} still duplicates the confirmation dialog`);
    }

    const orders = fs.readFileSync(path.join(root, 'views', 'admin', 'orders.html'), 'utf8');
    assert.match(orders, /newStatus === 'cancelled'[\s\S]*await adminConfirm/);
});

test('admin product creation accepts uploaded images and commits valid numeric data', async () => {
    let committed = false;
    let insertedProduct;
    let insertedGallery;
    const connection = {
        async beginTransaction() {},
        async commit() { committed = true; },
        async rollback() {},
        release() {},
        async query(sql, params) {
            if (sql.startsWith('INSERT INTO products')) {
                insertedProduct = params;
                return [{ insertId: 99 }];
            }
            if (sql.startsWith('INSERT INTO product_images')) {
                insertedGallery = params[0];
                return [{ affectedRows: 2 }];
            }
            throw new Error('Unexpected connection query: ' + sql);
        }
    };
    const pool = {
        async query(sql) {
            if (sql.includes('WHERE slug =')) return [[]];
            if (sql.includes('FROM brands') || sql.includes('FROM categories')) return [[{ id: 1 }]];
            throw new Error('Unexpected pool query: ' + sql);
        },
        async getConnection() { return connection; }
    };
    const route = loadRoute(path.join(root, 'src', 'routes', 'admin.js'), '/products', 'post', pool);
    const req = {
        body: {
            name: 'Phone mới', brand_id: '1', category_id: '1', price: '900000', old_price: '1000000',
            discount_percent: '10', description: '', ram: '8GB', storage: '128GB', stock: '4',
            is_featured: 'false', primaryImageIndex: '1'
        },
        files: [
            {
                filename: 'anhtraisstore/products/front',
                path: 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/front.png',
                cloudinaryPublicId: 'anhtraisstore/products/front'
            },
            {
                filename: 'anhtraisstore/products/back',
                path: 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/back.webp',
                cloudinaryPublicId: 'anhtraisstore/products/back'
            }
        ]
    };
    const res = jsonResponse();
    await route.stack[2].handle(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, 99);
    assert.equal(committed, true);
    assert.equal(insertedProduct[8], 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/back.webp');
    assert.equal(insertedProduct[12], 0);
    assert.deepEqual(plain(insertedGallery), [
        [99, 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/front.png', null, 0, 1],
        [99, 'https://res.cloudinary.com/demo/image/upload/v1/anhtraisstore/products/back.webp', null, 1, 2]
    ]);
});

test('Cloudinary product URLs retain their folder public ID', () => {
    const { publicIdFromCloudinaryUrl } = require('../src/services/cloud-storage');
    assert.equal(
        publicIdFromCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v1789000000/anhtraisstore/products/phone-front.webp'),
        'anhtraisstore/products/phone-front'
    );
    assert.equal(publicIdFromCloudinaryUrl('/assets/images/products/phone.jpg'), null);
    assert.equal(publicIdFromCloudinaryUrl('https://example.com/phone.jpg'), null);
});

test('admin order list includes product names and passes detail items to the modal', async () => {
    let selectedSql = '';
    const pool = {
        async query(sql) {
            selectedSql = sql;
            return [[{ id: 29, items: 'Điện thoại A ×2, Tai nghe B ×1' }]];
        }
    };
    const route = loadRoute(path.join(root, 'src', 'routes', 'admin.js'), '/orders/list', 'get', pool);
    const res = jsonResponse();
    await route.stack[1].handle({ query: {}, session: { user_id: 1, role: 'admin' } }, res);

    assert.match(selectedSql, /GROUP_CONCAT\(CONCAT\(p\.name/);
    assert.equal(res.body.orders[0].items, 'Điện thoại A ×2, Tai nghe B ×1');

    const page = fs.readFileSync(path.join(root, 'views', 'admin', 'orders.html'), 'utf8');
    assert.match(page, /showOrderModal\(data\.order, data\.items \|\| \[\]\)/);
    assert.match(page, /escapeHtml\(productSummary\)/);
    assert.match(page, /item\.product_name/);
});

test('API error handler does not expose internal error details', () => {
    const { errorHandler } = require('../src/middleware/error-handler');
    const res = jsonResponse();
    res.headersSent = false;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        errorHandler(new Error('ER_BAD_FIELD_ERROR: secret_table.internal_column'), {}, res, () => {});
    } finally {
        console.error = originalConsoleError;
    }
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
        success: false,
        error: 'Đã xảy ra lỗi trên máy chủ!',
        code: 'INTERNAL_ERROR'
    });
});

test('rate limiter returns 429 without exposing implementation details', () => {
    const { createRateLimiter } = require('../src/middleware/rate-limit');
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
    const request = { ip: '127.0.0.99', socket: {} };
    const response = () => ({
        headers: {}, statusCode: 200,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    });
    let nextCalls = 0;
    limiter(request, response(), () => nextCalls++);
    const blocked = response();
    limiter(request, blocked, () => nextCalls++);
    assert.equal(nextCalls, 1);
    assert.equal(blocked.statusCode, 429);
    assert.equal(typeof blocked.body.error, 'string');
});

test('image upload validation requires a matching safe extension and MIME type', () => {
    const { isAllowedImage } = require('../src/core/image-upload');
    assert.equal(isAllowedImage({ originalname: 'photo.jpg', mimetype: 'image/jpeg' }), true);
    assert.equal(isAllowedImage({ originalname: 'payload.html', mimetype: 'image/png' }), false);
    assert.equal(isAllowedImage({ originalname: 'payload.jpg.exe', mimetype: 'image/jpeg' }), false);
    assert.equal(isAllowedImage({ originalname: 'photo.png', mimetype: 'text/html' }), false);
});

test('AI product search queries only a bounded result set instead of loading the catalog into the prompt', async () => {
    const { executeStoreTool } = require('../src/services/store-ai');
    let capturedSql = '';
    let capturedParams = [];
    const db = {
        async query(sql, params) {
            capturedSql = sql;
            capturedParams = params;
            return [[{ id: 1, name: 'Phone A', price: 9000000, stock: 3 }]];
        }
    };
    const result = await executeStoreTool('search_products', {
        query: 'Phone', brand: null, min_price: null, max_price: 10000000,
        ram: null, storage: null, in_stock: true, sort: 'price_asc', limit: 99
    }, { db });
    assert.match(capturedSql, /LIMIT \?/);
    assert.doesNotMatch(capturedSql, /SELECT\s+\*/i);
    assert.equal(capturedParams.at(-1), 6);
    assert.equal(result.products.length, 1);
});

test('AI order lookup requires login and never accepts a model-provided user id', async () => {
    const { executeStoreTool } = require('../src/services/store-ai');
    let databaseCalled = false;
    const result = await executeStoreTool('get_order_status', {
        order_id: 5, payment_code: null, latest: false, user_id: 999
    }, { db: { async query() { databaseCalled = true; return [[]]; } } });
    assert.equal(result.requires_login, true);
    assert.equal(databaseCalled, false);
});

test('AI assistant calls a product function before answering and sends no catalog in its initial prompt', async () => {
    const { runStoreAssistant } = require('../src/services/store-ai');
    const requests = [];
    const requestAI = async body => {
        requests.push(body);
        if (requests.length === 1) {
            return { candidates: [{ content: { role: 'model', parts: [{ functionCall: {
                name: 'search_products', id: 'call_1',
                args: { query: 'Samsung', brand: 'Samsung', min_price: null, max_price: 15000000, ram: null, storage: null, in_stock: true, sort: 'relevance', limit: 4 }
            } }] } }] };
        }
        return { candidates: [{ content: { role: 'model', parts: [{ text: 'Tôi tìm thấy một mẫu phù hợp.' }] } }] };
    };
    const db = { async query() { return [[{ id: 7, name: 'Samsung A', price: 12000000, stock: 2 }]]; } };
    const result = await runStoreAssistant({ message: 'Tìm Samsung dưới 15 triệu', db, requestAI });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].contents.length, 1);
    assert.equal(requests[0].contents[0].parts[0].text, 'Tìm Samsung dưới 15 triệu');
    assert.equal(requests[0].tools[0].functionDeclarations[0].parameters.additionalProperties, undefined);
    assert.equal(requests[0].generationConfig.thinkingConfig.thinkingLevel, 'minimal');
    assert.equal(requests[0].generationConfig.maxOutputTokens, 1000);
    assert.equal(requests[0].generationConfig.temperature, undefined);
    assert.equal(result.products[0].id, 7);
    assert.deepEqual(result.tools_used, ['search_products']);
    assert.match(result.reply, /1 sản phẩm phù hợp/);
});

test('AI product thumbnails use the public product image route', () => {
    const { normalizeProductThumbnail, geminiThinkingLevel, isStoreDataUnavailable } = require('../src/services/store-ai');
    assert.equal(normalizeProductThumbnail('product-123.jpg'), '/assets/images/products/product-123.jpg');
    assert.equal(normalizeProductThumbnail('/uploads/products/product-123.jpg'), '/uploads/products/product-123.jpg');
    assert.equal(normalizeProductThumbnail('https://cdn.example.com/product.jpg'), 'https://cdn.example.com/product.jpg');
    assert.equal(geminiThinkingLevel('LOW'), 'low');
    assert.equal(geminiThinkingLevel('invalid'), 'minimal');
    assert.equal(isStoreDataUnavailable({ code: 'ECONNREFUSED' }), true);
    assert.equal(isStoreDataUnavailable({ code: 'ER_PARSE_ERROR' }), false);
    assert.equal(isStoreDataUnavailable({ errors: [{ code: 'ETIMEDOUT' }] }), true);
});

test('AI chat history is retained in the current Express session', () => {
    const { sessionHistory, productsForHistory } = require('../src/routes/ai-chat');
    const history = sessionHistory({ ai_chat_history: [
        { role: 'user', content: '  Xin chào  ' },
        { role: 'assistant', content: 'Chào bạn', products: [{ id: 1 }] },
        { role: 'system', content: 'not allowed' }
    ] });
    assert.equal(history.length, 2);
    assert.equal(history[0].content, 'Xin chào');
    assert.equal(history[1].products[0].id, 1);
    assert.deepEqual(productsForHistory([{ id: '2', name: 'Phone', price: '1000', thumbnail: '/phone.jpg' }]), [{
        id: 2, name: 'Phone', price: 1000, old_price: null, thumbnail: '/phone.jpg'
    }]);
});

test('product variants validate combinations and derive the default catalog values', () => {
    const { parseVariantPayload, variantSummary } = require('../src/core/product-variants');
    const variants = parseVariantPayload(JSON.stringify([
        { ram: '8GB', storage: '256GB', color: 'Đen', price: 20000000, old_price: 22000000, stock: 3 },
        { ram: '12GB', storage: '512GB', color: 'Trắng', price: 25000000, old_price: 27000000, stock: 2, is_default: true }
    ]));
    assert.equal(variants[1].is_default, true);
    assert.deepEqual(plain(variantSummary(variants, null)), {
        price: 25000000,
        old_price: 27000000,
        discount_percent: 7,
        stock: 5,
        ram: '12GB',
        storage: '512GB'
    });
    assert.throws(() => parseVariantPayload([
        { ram: '8GB', storage: '256GB', color: 'Đen', price: 1, stock: 1 },
        { ram: '8GB', storage: '256GB', color: 'Đen', price: 2, stock: 1 }
    ]), /trùng RAM, ROM và màu sắc/);
    assert.throws(() => parseVariantPayload([
        { sku: 'PHONE-256-BLACK', storage: '256GB', color: 'Đen', price: 1, stock: 1 },
        { sku: 'phone-256-black', storage: '256GB', color: 'Trắng', price: 2, stock: 1 }
    ]), /SKU .* đang được dùng cho nhiều phiên bản/);
});

test('variant selection is connected from admin and product detail through cart and orders', () => {
    const adminPage = fs.readFileSync(path.join(root, 'views', 'admin', 'products.html'), 'utf8');
    const detailPage = fs.readFileSync(path.join(root, 'views', 'product-detail.html'), 'utf8');
    const cartRoute = fs.readFileSync(path.join(root, 'src', 'routes', 'cart.js'), 'utf8');
    const orderRoute = fs.readFileSync(path.join(root, 'src', 'routes', 'orders.js'), 'utf8');
    assert.match(adminPage, /formData\.append\('variants', JSON\.stringify\(variants\)\)/);
    assert.match(adminPage, /data-field="color"/);
    assert.match(adminPage, /if \(savingProduct\) return/);
    assert.match(detailPage, /variant_id: selectedVariant \? selectedVariant\.id : null/);
    assert.match(detailPage, /updateVariantPriceAndStock\(selectedVariant\)/);
    assert.match(detailPage, /const displayName = sku \? `\$\{baseName\} – \$\{sku\}` : baseName/);
    assert.match(detailPage, /document\.getElementById\('productName'\)\.textContent = displayName/);
    assert.match(detailPage, /id="deliveryProvince"/);
    assert.match(detailPage, /function updateDeliveryEstimate\(item\)/);
    assert.match(detailPage, /id="mobilePurchaseBar"/);
    assert.match(detailPage, /addToCart\(productData\.product\.id, quantity, selectedVariant\?\.id \|\| null\)/);
    assert.match(detailPage, /id="imageViewer"/);
    assert.match(detailPage, /function changeViewerImage\(delta\)/);
    assert.match(cartRoute, /INSERT INTO cart \(user_id, product_id, variant_id, quantity\)/);
    assert.match(orderRoute, /INSERT INTO order_items \(order_id, product_id, variant_id, quantity, price\)/);
});
