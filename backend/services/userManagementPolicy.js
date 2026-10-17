const { Op } = require('sequelize');
const { User } = require('../models');
const { sequelize } = require('../config/database');

const MANAGER_STAFF_ROLES = Object.freeze(['kasir', 'kitchen', 'barista']);

function deny(message) {
  throw Object.assign(new Error(message), { statusCode: 403, code: 'USER_MANAGEMENT_FORBIDDEN' });
}

function assertCanCreate(actor, role) {
  if (actor.role === 'owner') return;
  if (actor.role !== 'manajer' || !MANAGER_STAFF_ROLES.includes(role)) {
    deny('Hanya Owner yang dapat membuat akun Owner atau Manajer.');
  }
}

function assertCanUpdate(actor, target, changes) {
  if (actor.role === 'owner') return;
  if (actor.role !== 'manajer') deny('Akses pengelolaan pengguna ditolak.');
  if (actor.id === target.id) {
    if ((changes.role !== undefined && changes.role !== target.role) ||
        (changes.is_active !== undefined && Number(changes.is_active) !== Number(target.is_active))) {
      deny('Manajer hanya dapat mengubah profil dan password sendiri, bukan role atau status akun.');
    }
    return;
  }
  if (!MANAGER_STAFF_ROLES.includes(target.role)) {
    deny('Hanya Owner yang dapat mengubah akun Owner atau Manajer lain.');
  }
  if (changes.role !== undefined && !MANAGER_STAFF_ROLES.includes(changes.role)) {
    deny('Manajer hanya dapat menetapkan role Kasir, Kitchen, atau Barista.');
  }
}

function assertCanDelete(actor, target) {
  if (actor.role === 'owner') return;
  if (actor.role !== 'manajer' || !MANAGER_STAFF_ROLES.includes(target.role)) {
    deny('Manajer hanya dapat menghapus akun Kasir, Kitchen, atau Barista.');
  }
}

// Recheck the actor and target while locked. A concurrent promotion/demotion
// must not turn an earlier permission check into permission to edit an Owner.
async function withManagedUsers(req, targetId, action) {
  if (targetId !== undefined && (!Number.isSafeInteger(targetId) || targetId < 1)) {
    throw Object.assign(new Error('User tidak ditemukan.'), { statusCode: 404 });
  }
  return sequelize.transaction(async transaction => {
    const ids = [...new Set([req.user.id, ...(targetId === undefined ? [] : [targetId])])].sort((a, b) => a - b);
    const rows = await User.findAll({
      where: { id: { [Op.in]: ids } },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const actor = rows.find(row => row.id === req.user.id);
    if (!actor || !actor.is_active || actor.session_version !== req.user.session_version) {
      throw Object.assign(new Error('Sesi telah berakhir. Silakan login ulang.'), { statusCode: 401 });
    }
    if (!['owner', 'manajer'].includes(actor.role)) deny('Akses pengelolaan pengguna ditolak.');
    const target = targetId === undefined ? undefined : rows.find(row => row.id === targetId);
    if (targetId !== undefined && !target) {
      throw Object.assign(new Error('User tidak ditemukan.'), { statusCode: 404 });
    }
    return action({ actor, target, transaction });
  });
}

module.exports = { assertCanCreate, assertCanUpdate, assertCanDelete, withManagedUsers };
