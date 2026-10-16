const { sequelize } = require('../config/database');
const QrisAttempt = require('../models/QrisAttempt');
const migrate = () => QrisAttempt.sync();
module.exports = migrate;
if (require.main === module) {
  migrate().then(() => console.log('QRIS attempt migration complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
