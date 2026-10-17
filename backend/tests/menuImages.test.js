const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { normalizeMenuImage, MAX_IMAGE_BYTES } = require('../services/menuImages');

const image = () => sharp({ create: { width: 4, height: 2, channels: 4, background: '#aabbcc88' } });

test('JPEG, PNG and WebP are fully decoded and encoded as static WebP', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const input = await image().toFormat(format).toBuffer();
    const output = await normalizeMenuImage(input);
    const meta = await sharp(output).metadata();
    assert.equal(meta.format, 'webp'); assert.equal(meta.width, 4); assert.equal(meta.height, 2);
    assert.equal(meta.exif, undefined); assert.equal(meta.icc, undefined);
  }
});

test('decode rejects HTML, SVG, unsupported formats, signature-only files and truncated images', async () => {
  const png = await image().png().toBuffer();
  const jpeg = await image().jpeg().toBuffer();
  const gif = await image().gif().toBuffer();
  for (const data of [Buffer.from('<html><script>audit()</script></html>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), Buffer.from('PK archive'), Buffer.alloc(0), png.subarray(0, 24), jpeg.subarray(0, Math.floor(jpeg.length / 2)), gif]) {
    await assert.rejects(normalizeMenuImage(data), { statusCode: 400 });
  }
});

test('re-encoding removes trailing payload and metadata while applying EXIF orientation', async () => {
  const png = await image().png().toBuffer();
  const marker = '<script>UPLOAD_AUDIT_MARKER</script>';
  const output = await normalizeMenuImage(Buffer.concat([png, Buffer.from(marker)]));
  assert.equal(output.includes(Buffer.from(marker)), false);
  const oriented = await image().jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await sharp(oriented).metadata()).orientation, 6);
  const meta = await sharp(await normalizeMenuImage(oriented)).metadata();
  assert.equal(meta.width, 2); assert.equal(meta.height, 4);
  assert.equal(meta.orientation, undefined); assert.equal(meta.exif, undefined); assert.equal(meta.icc, undefined);
});

test('input bytes, decoded pixels and animation are bounded and wide photos preserve aspect ratio', async () => {
  const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1); oversized.set([255, 216, 255]);
  await assert.rejects(normalizeMenuImage(oversized), { statusCode: 400 });
  const huge = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: 'white' } }).png().toBuffer();
  assert.ok(huge.length < MAX_IMAGE_BYTES);
  await assert.rejects(normalizeMenuImage(huge), { statusCode: 400 });
  const first = await image().png().toBuffer();
  const second = await sharp({ create: { width: 4, height: 2, channels: 4, background: 'red' } }).png().toBuffer();
  const animated = await sharp([first, second], { join: { animated: true } }).webp({ delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(normalizeMenuImage(animated), { statusCode: 400 });
  const wide = await sharp({ create: { width: 2400, height: 12, channels: 3, background: 'white' } }).png().toBuffer();
  const resized = await sharp(await normalizeMenuImage(wide)).metadata();
  assert.equal(resized.width, 2000); assert.equal(resized.height, 10);
});
