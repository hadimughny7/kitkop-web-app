const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validasi gagal.',
      errors,
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      message: 'Data sudah ada (duplikat).',
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'Referensi data tidak valid atau masih digunakan.',
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Ukuran file terlalu besar. Maksimal 5MB.',
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan pada server.',
  });
};

module.exports = errorHandler;
