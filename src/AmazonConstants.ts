export const OrderRegex = /^[\dD]\d{2}-\d{7}-\d{7}$/;
export const DigitalOrderRegex = /^D\d{2}-\d{7}-\d{7}$/;
export const NormalOrderRegex = /^\d{3}-\d{7}-\d{7}$/;
export const TransactionUrl = 'https://www.amazon.com/cpe/yourpayments/transactions';
export const NormalOrderUrl = 'https://www.amazon.com/gp/css/summary/print.html?orderID=';
export const DigitalOrderUrl = 'https://www.amazon.com/gp/digital/your-account/order-summary.html?print=1&orderID=';
export type DigitalOrderId = `${string}-${string}-${string}`;
export type NormalOrderId = `${string}-${string}-${string}`;
export type OrderId = DigitalOrderId | NormalOrderId;

export function isDigitalOrderId(orderId: string): orderId is DigitalOrderId {
  return DigitalOrderRegex.test(orderId);
}

export function isNormalOrderId(orderId: string): orderId is NormalOrderId {
  return NormalOrderRegex.test(orderId);
}

export function isOrderId(orderId: string): orderId is OrderId {
  return isDigitalOrderId(orderId) || isNormalOrderId(orderId);
}
