const repository = require('../repositories/admin-repository');

async function getDashboardStats(db) {
    return repository.dashboardStats(db);
}

module.exports = { getDashboardStats };
