const express = require('express');
const { uploadDir } = require('../services/menuImages');
const serve = express.static(uploadDir);

module.exports = (req, res, next) => {
  // Do not serve HTML/SVG or other old non-image uploads from this URL space.
  if (!/\.(?:jpe?g|png|webp)$/i.test(req.path)) return res.sendStatus(404);
  serve(req, res, next);
};
