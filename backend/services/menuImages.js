const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

const uploadDir = path.resolve(process.env.MENU_UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'menus'));
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25000000;
const invalidImage = () => Object.assign(new Error('Isi file harus berupa gambar JPEG, PNG, atau WebP yang valid dan tidak rusak (maksimal 25 megapiksel).'), { statusCode: 400 });

const imageFormat = buffer => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
};

const normalizeMenuImage = async buffer => {
  const format = imageFormat(buffer);
  if (!format || buffer.length > MAX_IMAGE_BYTES) throw invalidImage();
  try {
    const image = sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw invalidImage();
    // toBuffer forces complete decoding; metadata/signatures alone are insufficient.
    // Default output strips EXIF/ICC/XMP and never forwards original trailing bytes.
    return await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch {
    throw invalidImage();
  }
};

const storeMenuImage = async buffer => {
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `menu-${randomUUID()}.webp`;
  const filePath = path.join(uploadDir, filename);
  try { await fs.writeFile(filePath, buffer, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') await fs.unlink(filePath).catch(() => {});
    throw error;
  }
  return `/uploads/menus/${filename}`;
};

const removeMenuImage = async url => {
  // Only generated menu filenames within this directory can be removed.
  const filename = typeof url === 'string' && /^\/uploads\/menus\/(menu-[a-z0-9-]+\.(?:webp|png|jpe?g))$/i.exec(url)?.[1];
  if (!filename) return;
  try { await fs.unlink(path.join(uploadDir, filename)); }
  catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to clean up a menu image:', error.code);
  }
};

module.exports = { normalizeMenuImage, storeMenuImage, removeMenuImage, uploadDir, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS };
