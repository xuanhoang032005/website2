const { listCustomerOrders, getCustomerOrder } = require('../services/orders-service');

async function list(req, res) {
    const orders = await listCustomerOrders(req.session.user_id);
    res.json({ orders });
}

async function detail(req, res) {
    const result = await getCustomerOrder(req.params.id, req.session.user_id);
    if (!result) return res.status(404).json({ error: 'Đơn hàng không tồn tại!' });
    res.json(result);
}

module.exports = { list, detail };
