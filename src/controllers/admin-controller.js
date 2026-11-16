const service = require('../services/admin-service');

async function stats(req, res) {
    res.json(await service.getDashboardStats());
}

async function listUsers(req, res) {
    res.json({ users: await service.listUsers() });
}

async function createUser(req, res) {
    res.json({ success: true, id: await service.createUser(req.body) });
}

function disconnectUser(req, id) {
    const io = req.app.get('io');
    if (!io) return;
    for (const socket of io.sockets.sockets.values()) {
        const session = socket.request.session;
        if (Number(session?.user_id || session?.passport?.user) === id && socket.request.sessionID !== req.sessionID) {
            socket.disconnect(true);
        }
    }
}

async function updateUser(req, res) {
    const result = await service.updateUser(req.params.id, req.body, req.session.user_id, req.sessionID);
    if (result.id === Number(req.session.user_id)) req.session.full_name = result.full_name;
    if (result.revokeSessions) disconnectUser(req, result.id);
    res.json({ success: true });
}

async function deleteUser(req, res) {
    const result = await service.deleteUser(req.params.id, req.session.user_id);
    disconnectUser(req, result.id);
    res.json({ success: true });
}

module.exports = { stats, listUsers, createUser, updateUser, deleteUser };
