const jwt = require('jsonwebtoken');
const audience = 'kitkop-order-tracking';

const issueTrackingToken = order => jwt.sign({ orderNumber: order.order_number }, process.env.JWT_SECRET, {
  algorithm: 'HS256', audience, subject: String(order.id), expiresIn: '7d',
});
const verifyTrackingToken = token => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience });

module.exports = { issueTrackingToken, verifyTrackingToken };
