import { io } from 'socket.io-client';
import { BACKEND_URL } from './api';

const staffSockets = new Set();
export const disconnectStaffSockets = () => {
  for (const socket of staffSockets) socket.disconnect();
  staffSockets.clear();
};

export const createStaffSocket = () => {
  const socket = io(BACKEND_URL, { auth: callback => callback({ token: localStorage.getItem('kitkop_token') }) });
  staffSockets.add(socket);
  socket.on('disconnect', () => { if (!socket.active) staffSockets.delete(socket); });
  return socket;
};

export const createOrderSocket = (orderNumber, trackingToken) => trackingToken
  ? io(BACKEND_URL, { auth: { orderNumber, trackingToken } }) : null;

// Logging out in another tab must stop that tab's staff event subscriptions too.
window.addEventListener('storage', event => {
  if (event.key === 'kitkop_token' && !event.newValue) disconnectStaffSockets();
});
