const User = require('./User');
const Customer = require('./Customer');
const Table = require('./Table');
const MenuCategory = require('./MenuCategory');
const Menu = require('./Menu');
const RawMaterial = require('./RawMaterial');
const MenuRecipe = require('./MenuRecipe');
const Order = require('./Order');
const OrderCounter = require('./OrderCounter');
const OrderItem = require('./OrderItem');
const OrderStatusLog = require('./OrderStatusLog');
const Transaction = require('./Transaction');
const QrisAttempt = require('./QrisAttempt');
const StockLog = require('./StockLog');
const Setting = require('./Setting');
const OptionGroup = require('./OptionGroup');
const OptionTemplate = require('./OptionTemplate');
const MenuOptionGroup = require('./MenuOptionGroup');
Menu.belongsToMany(OptionGroup, { through: MenuOptionGroup, foreignKey: 'menu_id', otherKey: 'option_group_id', as: 'optionGroups' });
OptionGroup.belongsToMany(Menu, { through: MenuOptionGroup, foreignKey: 'option_group_id', otherKey: 'menu_id', as: 'menus' });


User.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

MenuCategory.hasMany(Menu, { foreignKey: 'category_id', as: 'menus' });
Menu.belongsTo(MenuCategory, { foreignKey: 'category_id', as: 'category' });

Menu.belongsToMany(RawMaterial, {
  through: MenuRecipe,
  foreignKey: 'menu_id',
  otherKey: 'raw_material_id',
  as: 'rawMaterials',
});
RawMaterial.belongsToMany(Menu, {
  through: MenuRecipe,
  foreignKey: 'raw_material_id',
  otherKey: 'menu_id',
  as: 'menus',
});
Menu.hasMany(MenuRecipe, { foreignKey: 'menu_id', as: 'recipes' });
MenuRecipe.belongsTo(Menu, { foreignKey: 'menu_id', as: 'menu' });
MenuRecipe.belongsTo(RawMaterial, { foreignKey: 'raw_material_id', as: 'rawMaterial' });

Order.belongsTo(Table, { foreignKey: 'table_id', as: 'table' });
Order.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Order.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
Table.hasMany(Order, { foreignKey: 'table_id', as: 'orders' });
Customer.hasMany(Order, { foreignKey: 'customer_id', as: 'orders' });

Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
OrderItem.belongsTo(Menu, { foreignKey: 'menu_id', as: 'menu' });

Order.hasMany(OrderStatusLog, { foreignKey: 'order_id', as: 'statusLogs' });
OrderStatusLog.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
OrderStatusLog.belongsTo(User, { foreignKey: 'changed_by', as: 'changedByUser' });

Order.hasOne(Transaction, { foreignKey: 'order_id', as: 'transaction' });
Transaction.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

StockLog.belongsTo(RawMaterial, { foreignKey: 'raw_material_id', as: 'rawMaterial' });
StockLog.belongsTo(Order, { foreignKey: 'reference_order_id', as: 'referenceOrder' });
StockLog.belongsTo(User, { foreignKey: 'created_by', as: 'createdByUser' });
RawMaterial.hasMany(StockLog, { foreignKey: 'raw_material_id', as: 'stockLogs' });

module.exports = {
  User,
  Customer,
  Table,
  MenuCategory,
  Menu,
  RawMaterial,
  MenuRecipe,
  Order,
  OrderCounter,
  OrderItem,
  OrderStatusLog,
  Transaction,
  QrisAttempt,
  StockLog,
  Setting,
  OptionGroup,
  OptionTemplate,
  MenuOptionGroup,
};
