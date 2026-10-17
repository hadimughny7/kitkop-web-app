const multer = require('multer');
const { normalizeMenuImage, MAX_IMAGE_BYTES } = require('../services/menuImages');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

// Keep untrusted bytes out of the public directory until decode/re-encode succeeds.
module.exports = {
  single: field => {
    const parse = upload.single(field);
    return (req, res, next) => parse(req, res, error => {
      if (error) {
        if (error instanceof multer.MulterError) error.statusCode = 400;
        return next(error);
      }
      if (!req.file) return next();
      normalizeMenuImage(req.file.buffer).then(buffer => {
        req.file.buffer = buffer;
        req.file.mimetype = 'image/webp';
        req.file.size = buffer.length;
        next();
      }).catch(next);
    });
  },
};
