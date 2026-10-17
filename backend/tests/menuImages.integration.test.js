const test = require('node:test');
const assert = require('node:assert/strict');

test('menu image uploads validate bytes, normalize public files and preserve images on failed saves', { skip: process.env.KITKOP_OPTIONS_DB_TEST !== 'true' }, async t => {
  require('dotenv').config();
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Use a local test database only');
  process.env.JWT_SECRET = 'menu-images-test';
  const fs = require('node:fs/promises'); const path = require('node:path'); const os = require('node:os');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitkop-menu-images-test-'));
  process.env.MENU_UPLOAD_DIR = path.join(root, 'menus');
  const mysql = require('mysql2/promise');
  const database = `kitkop_menu_images_test_${process.pid}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query(`CREATE DATABASE \`${database}\``); process.env.DB_NAME = database;
  const { sequelize } = require('../config/database');
  const { User, MenuCategory, Menu } = require('../models');
  const { uploadDir, MAX_IMAGE_BYTES } = require('../services/menuImages');
  const sharp = require('sharp'); let server;
  try {
    await sequelize.sync();
    await fs.mkdir(uploadDir);
    const users = {};
    for (const role of ['owner', 'manajer', 'kasir']) users[role] = await User.create({ name: role, username: role, email: `${role}@example.test`, role, password_hash: 'test' });
    const category = await MenuCategory.create({ name: 'Coffee' });
    const express = require('express'); const app = express(); app.use(express.json()); app.use(require('helmet')());
    app.use('/api/menus', require('../routes/menuRoutes'));
    app.use('/uploads/menus', require('../middleware/menuImageStatic'));
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const jwt = require('jsonwebtoken'); const token = user => jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const files = async () => (await fs.readdir(uploadDir)).sort();
    const makeImage = format => sharp({ create: { width: 8, height: 6, channels: 3, background: 'green' } }).toFormat(format).toBuffer();
    const upload = async ({ image, filename = 'photo.png', mime = 'image/png', fields = {}, id, user = users.owner, expected = id ? 200 : 201, secondFile = false, fileField = 'image' }) => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ name: 'Photo menu', price: '10000', category_id: category.id, ...fields })) form.set(key, String(value));
      if (image) form.append(fileField, new Blob([image], { type: mime }), filename);
      if (secondFile) form.append('image', new Blob([image], { type: mime }), 'second.png');
      const response = await fetch(`${base}/api/menus${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', headers: user ? { Authorization: `Bearer ${token(user)}` } : {}, body: form });
      const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body.data;
    };
    const readImage = async url => {
      assert.match(url, /^\/uploads\/menus\/menu-[a-f0-9-]+\.webp$/);
      const response = await fetch(base + url); assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^image\/webp/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      const buffer = Buffer.from(await response.arrayBuffer()); assert.equal((await sharp(buffer).metadata()).format, 'webp'); return buffer;
    };

    await t.test('real HTML with forged image MIME and broken/unsupported bytes never reach public storage', async () => {
      const png = await makeImage('png');
      for (const [image, filename, mime] of [
        [Buffer.from('<html><script>UPLOAD_AUDIT</script></html>'), 'audit.html', 'image/png'],
        [Buffer.from('<html>not a photo</html>'), 'audit.png', 'image/png'],
        [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'photo.svg', 'image/png'],
        [png.subarray(0, 24), 'broken.png', 'image/png'],
      ]) {
        const count = await Menu.count(), before = await files();
        await upload({ image, filename, mime, expected: 400 });
        assert.equal(await Menu.count(), count); assert.deepEqual(await files(), before);
      }
      assert.equal((await fetch(base + '/uploads/menus/audit.html')).status, 404);
    });

    let saved;
    await t.test('valid bytes win over misleading filename/MIME and only normalized WebP is served', async () => {
      for (const [format, filename, mime, user] of [
        ['png', '../../audit.html', 'text/html', users.owner],
        ['jpeg', 'photo.png', 'image/png', users.manajer],
        ['webp', 'photo.jpg', 'application/octet-stream', users.owner],
      ]) {
        saved = await upload({ image: await makeImage(format), filename, mime, user });
        await readImage(saved.image); assert.equal(path.extname(saved.image), '.webp');
      }
      const plain = await upload({ image: null }); assert.equal(plain.image, null);
    });

    await t.test('size limits, extra file fields and role checks reject uploads without writing files', async () => {
      const png = await makeImage('png'), before = await files(), count = await Menu.count();
      await upload({ image: Buffer.alloc(MAX_IMAGE_BYTES + 1), expected: 400 });
      await upload({ image: png, secondFile: true, expected: 400 });
      await upload({ image: png, fileField: 'other', expected: 400 });
      await upload({ image: png, user: null, expected: 401 });
      await upload({ image: png, user: users.kasir, expected: 403 });
      assert.deepEqual(await files(), before); assert.equal(await Menu.count(), count);
    });

    const invalidOptions = JSON.stringify([{ name: 'Extra', min_choices: 0, max_choices: 1, choices: [{ id: 'extra-missing-material', name: 'Extra', price: 0, ingredients: [{ raw_material_id: 2147483647, quantity_used: 1 }] }] }]);
    await t.test('failed validation/create and missing menu clean up new files and preserve database state', async () => {
      const png = await makeImage('png'), before = await files(), count = await Menu.count();
      await upload({ image: png, fields: { price: '-100' }, expected: 400 });
      await upload({ image: png, fields: { option_groups: invalidOptions }, expected: 400 });
      await upload({ image: png, id: 2147483647, expected: 404 });
      assert.deepEqual(await files(), before); assert.equal(await Menu.count(), count);
    });

    await t.test('failed option or SQL updates keep the previous photo and remove the new file', async () => {
      const before = await files(), original = (await Menu.findByPk(saved.id)).toJSON();
      await upload({ image: await makeImage('png'), id: saved.id, fields: { option_groups: invalidOptions }, expected: 400 });
      assert.equal((await Menu.findByPk(saved.id)).image, original.image); await readImage(original.image);
      await sequelize.query("CREATE TRIGGER audit_fail_menu_image BEFORE UPDATE ON menus FOR EACH ROW BEGIN IF NEW.name = 'audit-fail' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test image update failure'; END IF; END");
      try { await upload({ image: await makeImage('png'), id: saved.id, fields: { name: 'audit-fail' }, expected: 500 }); }
      finally { await sequelize.query('DROP TRIGGER audit_fail_menu_image'); }
      assert.deepEqual((await Menu.findByPk(saved.id)).toJSON(), original);
      assert.deepEqual(await files(), before); await readImage(original.image);
    });

    await t.test('successful replacement removes only unreferenced old photos after commit', async () => {
      const old = saved.image;
      saved = await upload({ image: await makeImage('png'), id: saved.id });
      await readImage(saved.image); assert.notEqual(saved.image, old);
      assert.equal((await fetch(base + old)).status, 404);
      const shared = await Menu.create({ name: 'Shared photo', category_id: category.id, price: 5000, image: saved.image });
      const sharedUrl = saved.image;
      saved = await upload({ image: await makeImage('png'), id: saved.id });
      await readImage(sharedUrl);
      const response = await fetch(`${base}/api/menus/${shared.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token(users.owner)}` } });
      assert.equal(response.status, 200); assert.equal((await fetch(base + sharedUrl)).status, 404);
    });

    await t.test('concurrent replacements leave one valid current photo without orphaned replacements', async () => {
      const before = (await files()).filter(file => file !== path.basename(saved.image));
      const png = await makeImage('png');
      await Promise.all([upload({ image: png, id: saved.id }), upload({ image: png, id: saved.id })]);
      const current = await Menu.findByPk(saved.id); await readImage(current.image);
      assert.deepEqual(await files(), [...before, path.basename(current.image)].sort());
    });

    await t.test('non-image files left by older versions are not served from the menu image URL', async () => {
      await fs.writeFile(path.join(uploadDir, 'menu-old.html'), '<html>old upload</html>');
      assert.equal((await fetch(base + '/uploads/menus/menu-old.html')).status, 404);
      assert.equal((await fetch(base + '/uploads/menus/menu-old%2ehtml')).status, 404);
    });

    await t.test('cleanup cannot follow a stored path outside the menu upload directory', async () => {
      const outside = path.join(root, 'outside.txt'); await fs.writeFile(outside, 'keep');
      await Menu.update({ image: '/uploads/menus/../outside.txt' }, { where: { id: saved.id } });
      await upload({ image: await makeImage('png'), id: saved.id });
      assert.equal(await fs.readFile(outside, 'utf8'), 'keep');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await sequelize.close(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end();
    if (!root.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('kitkop-menu-images-test-')) throw new Error('Unexpected image test directory');
    await fs.rm(root, { recursive: true, force: true });
  }
});
