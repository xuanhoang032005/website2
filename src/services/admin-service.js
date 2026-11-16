const repository = require('../repositories/admin-repository');
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { HttpError } = require('../core/http-error');
const { stringField, emailField, enumField } = require('../middleware/validate');

async function getDashboardStats(db) {
    return repository.dashboardStats(db);
}

function parseUser(body = {}, creating = false) {
    try {
        const email = emailField({ required: true })(body.email);
        if (email.length > 100) throw new Error('Email không được vượt quá 100 ký tự.');
        return {
            full_name: stringField({ required: true, max: 100, disallowHtml: true, label: 'Họ tên' })(body.full_name),
            email,
            phone: stringField({ max: 15, disallowHtml: true, label: 'Số điện thoại' })(body.phone) || '',
            role: enumField(['customer', 'admin'], { required: true, label: 'Vai trò' })(creating ? body.role || 'customer' : body.role),
            password: stringField({ required: creating, min: 6, max: 128, trim: false, label: 'Mật khẩu' })(body.password)
        };
    } catch (error) {
        throw new HttpError(400, 'VALIDATION_ERROR', error.message);
    }
}

function parseUserId(value) {
    const id = Number(value);
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
        throw new HttpError(400, 'INVALID_USER_ID', 'ID người dùng không hợp lệ.');
    }
    return id;
}

function userError(error) {
    if (error.code === 'ER_DUP_ENTRY') return new HttpError(409, 'EMAIL_EXISTS', 'Email này đã được đăng ký!');
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        return new HttpError(409, 'USER_HAS_HISTORY', 'Không thể xóa người dùng đã có đơn hàng, đánh giá, câu hỏi hoặc yêu cầu đổi trả/bảo hành.');
    }
    return error;
}

async function createUser(body, db = pool) {
    const user = parseUser(body, true);
    user.password = await bcrypt.hash(user.password, 10);
    try {
        return await repository.createUser(user, db);
    } catch (error) {
        throw userError(error);
    }
}

async function mutateUser(id, actorId, db, action) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        // Serialize admin changes so simultaneous requests cannot remove every admin.
        const admins = await repository.lockAdmins(connection);
        if (!admins.some(admin => Number(admin.id) === Number(actorId))) {
            throw new HttpError(403, 'ADMIN_REQUIRED', 'Tài khoản của bạn không còn quyền quản trị.');
        }
        const user = await repository.lockUser(id, connection);
        if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng.');
        const result = await action(user, admins, connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw userError(error);
    } finally {
        connection.release();
    }
}

function protectAdmin(user, admins) {
    if (user.role === 'admin' && admins.length <= 1) {
        throw new HttpError(409, 'LAST_ADMIN', 'Phải giữ lại ít nhất một tài khoản quản trị.');
    }
}

async function updateUser(value, body, actorId, sessionId, db = pool) {
    const id = parseUserId(value);
    const changes = parseUser(body);
    if (id === Number(actorId) && changes.role !== 'admin') {
        throw new HttpError(400, 'SELF_ROLE_CHANGE', 'Bạn không thể tự hạ quyền quản trị của mình.');
    }
    if (changes.password) changes.password = await bcrypt.hash(changes.password, 10);
    return mutateUser(id, actorId, db, async (user, admins, connection) => {
        if (changes.role !== 'admin') protectAdmin(user, admins);
        await repository.updateUser(id, changes, connection);
        const revokeSessions = user.role !== changes.role || user.email !== changes.email || Boolean(changes.password);
        if (revokeSessions) {
            await repository.revokeUserSessions(id, id === Number(actorId) ? sessionId : null, connection);
        }
        if (user.email !== changes.email || changes.password) {
            await connection.query('DELETE FROM reset_tokens WHERE user_id = ?', [id]);
        }
        return { id, full_name: changes.full_name, revokeSessions };
    });
}

async function deleteUser(value, actorId, db = pool) {
    const id = parseUserId(value);
    if (id === Number(actorId)) throw new HttpError(400, 'SELF_DELETE', 'Bạn không thể xóa tài khoản đang đăng nhập.');
    return mutateUser(id, actorId, db, async (user, admins, connection) => {
        protectAdmin(user, admins);
        if (await repository.hasUserHistory(id, connection)) {
            throw userError({ code: 'ER_ROW_IS_REFERENCED_2' });
        }
        await repository.deleteUser(id, connection);
        await repository.revokeUserSessions(id, null, connection);
        return { id };
    });
}

module.exports = { getDashboardStats, listUsers: repository.listUsers, createUser, updateUser, deleteUser };
