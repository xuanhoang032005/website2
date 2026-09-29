const { getDashboardStats } = require('../services/admin-service');

async function stats(req, res) {
    res.json(await getDashboardStats());
}

module.exports = { stats };
