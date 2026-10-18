import { io } from 'socket.io-client';
import { BACKEND_URL } from './api';

const staffSockets = new Set();
export const disconnectStaffSockets = () => {
  for (const socket of staffSockets) socket.disconnect();
  staffSockets.clear();
};

export const createStaffSocket = () => {
  let sessionToken;
  const socket = io(BACKEND_URL, { auth: callback => {
    sessionToken = localStorage.getItem('kitkop_token');
    callback({ token: sessionToken });
  } });
  const sessionRevoked = () => {
    window.dispatchEvent(new CustomEvent('kitkop:session-revoked', { detail: { token: sessionToken } }));
    socket.disconnect();
  };
  socket.on('session-revoked', sessionRevoked);
  socket.on('connect_error', error => {
    if (error.data?.code === 'SESSION_REVOKED') sessionRevoked();
  });
  staffSockets.add(socket);
  const disconnect = socket.disconnect.bind(socket);
  socket.disconnect = () => {
    // Socket.IO emits no disconnect event when it has not connected yet.
    staffSockets.delete(socket);
    return disconnect();
  };
  socket.on('disconnect', () => { if (!socket.active) staffSockets.delete(socket); });
  return socket;
};

export const createOrderSocket = (orderNumber, trackingToken) => trackingToken
  ? io(BACKEND_URL, { auth: { orderNumber, trackingToken } }) : null;

// Logging out in another tab must stop that tab's staff event subscriptions too.
window.addEventListener('storage', event => {
  if (event.key === 'kitkop_token' && !event.newValue && !localStorage.getItem('kitkop_token')) disconnectStaffSockets();
});
