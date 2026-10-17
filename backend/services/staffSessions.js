// Legacy tokens belong to version zero only. A password reset permanently
// invalidates them without signing out unaffected accounts during deployment.
const { userRoom } = require('../socket/realtimeEvents');
const sessionMatches = (claims, user) => {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  const version = claims?.sessionVersion === undefined ? 0 : claims.sessionVersion;
  return Number.isSafeInteger(version) && version >= 0
    && Number.isSafeInteger(user?.session_version) && user.session_version >= 0
    && version === user.session_version;
};

const endSocketSession = socket => {
  socket.emit('session-revoked');
  socket.disconnect(true);
};

const revokeStaffSockets = async (io, userId, version) => {
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  for (const socket of sockets) {
    if ((socket.data.sessionVersion ?? 0) < version) endSocketSession(socket);
  }
};

module.exports = { sessionMatches, endSocketSession, revokeStaffSockets };
