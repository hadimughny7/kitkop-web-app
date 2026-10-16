const { sequelize } = require('../config/database');
const OrderCounter = require('../models/OrderCounter');

const migrate = () => OrderCounter.sync();
module.exports = migrate;

if (require.main === module) {
  migrate().then(() => console.log('Order counter migration complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
