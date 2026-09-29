const repository = require('../repositories/orders-repository');

function customerOrder(order) {
    const { cart_item_ids, ...safeOrder } = order;
    return safeOrder;
}

async function listCustomerOrders(userId, db) {
    const orders = await repository.listByUser(userId, db);
    return orders.map(customerOrder);
}

async function getCustomerOrder(orderId, userId, db) {
    const result = await repository.findOwnedWithItems(orderId, userId, db);
    if (!result) return null;
    return { order: customerOrder(result.order), items: result.items };
}

module.exports = { customerOrder, listCustomerOrders, getCustomerOrder };
