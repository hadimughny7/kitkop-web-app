export const getWibDate = (date = new Date()) =>
  new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const fetchAllOrders = async (getOrders, params) => {
  const orders = new Map();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const response = await getOrders({ ...params, page, limit: 100 });
    totalPages = response.data.pagination?.totalPages || 1;
    response.data.data.forEach((order) => orders.set(String(order.id), order));
  }
  return [...orders.values()];
};

export const isPaidOrder = (order) =>
  order.transaction?.status === 'paid' && order.status !== 'cancelled';

export const buildStaffSummary = ({ todayOrders, activeOrders }) => {
  const paidToday = todayOrders.filter(isPaidOrder);
  const queue = [...new Map(activeOrders.filter((order) => isPaidOrder(order) && ['confirmed', 'preparing'].includes(order.status))
    .map((order) => [String(order.id), order])).values()]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const sum = (orders) => orders.reduce((total, order) => total + Number(order.total || 0), 0);
  const cashOrders = paidToday.filter((order) => order.transaction.payment_method?.toUpperCase() === 'CASH');
  const qrisOrders = paidToday.filter((order) => order.transaction.payment_method?.toUpperCase() === 'QRIS');
  const otherOrders = paidToday.filter((order) => !['CASH', 'QRIS'].includes(order.transaction.payment_method?.toUpperCase()));


  return {
    todayCount: todayOrders.length,
    paidCount: paidToday.length,
    paidTotal: sum(paidToday),
    cashTotal: sum(cashOrders),
    qrisTotal: sum(qrisOrders),
    otherTotal: sum(otherOrders),
    queue,
    incomingCount: queue.filter((order) => order.status === 'confirmed').length,
    preparingCount: queue.filter((order) => order.status === 'preparing').length,
    completedOrderCount: paidToday.filter((order) => order.status === 'completed').length,

  };
};
