import { apiFetch } from './modules/http.js';

const usersBody = document.getElementById('usersBody');
const modal = document.getElementById('userModal');
const form = document.getElementById('userForm');
const saveButton = document.getElementById('saveUserButton');
const roleInput = document.getElementById('userRole');
const passwordInput = document.getElementById('userPassword');
let users = [];
let currentUserId;
let editingId = null;
let saving = false;
let deleting = false;
let previousFocus;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function message(id, text = '', type = 'error') {
    const element = document.getElementById(id);
    element.textContent = text;
    element.className = text ? `alert alert-${type}` : '';
    element.hidden = !text;
}

async function request(url, options) {
    const response = await apiFetch(url, options);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Đã xảy ra lỗi. Vui lòng thử lại.');
    return data;
}

function renderAdmin(user) {
    document.querySelector('#adminUser .sidebar-avatar').textContent = user.full_name?.charAt(0) || 'A';
    document.querySelector('#adminUser .sidebar-user-name').textContent = user.full_name || 'Admin';
}

async function loadUsers() {
    try {
        const data = await request('/admin/users/list');
        users = data.users;
        usersBody.innerHTML = users.length ? users.map(user => {
            const isSelf = Number(user.id) === currentUserId;
            const isAdmin = user.role === 'admin';
            return `<tr>
                <td><div class="user-info"><div class="user-avatar">${escapeHtml(user.full_name?.charAt(0) || 'U')}</div>
                    <div class="user-name">${escapeHtml(user.full_name)}${isSelf ? ' (Bạn)' : ''}</div></div></td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.phone || '-')}</td>
                <td><span class="badge ${isAdmin ? 'badge-primary' : 'badge-success'}">${isAdmin ? 'Admin' : 'Khách hàng'}</span></td>
                <td>${user.created_at ? escapeHtml(new Date(user.created_at).toLocaleDateString('vi-VN')) : '-'}</td>
                <td><div class="user-actions">
                    <button type="button" class="btn btn-sm btn-secondary" data-action="edit" data-user-id="${Number(user.id)}" aria-label="Sửa ${escapeHtml(user.full_name)}"><i class="fas fa-edit" aria-hidden="true"></i> Sửa</button>
                    <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-user-id="${Number(user.id)}" aria-label="Xóa ${escapeHtml(user.full_name)}" ${isSelf ? 'disabled title="Không thể xóa tài khoản đang đăng nhập"' : ''}><i class="fas fa-trash" aria-hidden="true"></i> Xóa</button>
                </div></td>
            </tr>`;
        }).join('') : '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><h3>Chưa có người dùng nào</h3></div></td></tr>';
        return true;
    } catch (error) {
        usersBody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>Lỗi tải dữ liệu</h3><button type="button" class="btn btn-secondary" data-action="reload">Thử lại</button></div></td></tr>';
        message('usersMessage', error.message);
        return false;
    }
}

function openModal(user = null) {
    if (saving || deleting) return;
    previousFocus = document.activeElement;
    editingId = user ? Number(user.id) : null;
    form.reset();
    message('userFormMessage');
    document.getElementById('userModalTitle').textContent = user ? 'Chỉnh sửa người dùng' : 'Thêm người dùng';
    document.getElementById('userFullName').value = user?.full_name || '';
    document.getElementById('userEmail').value = user?.email || '';
    document.getElementById('userPhone').value = user?.phone || '';
    roleInput.value = user?.role || 'customer';
    roleInput.disabled = editingId === currentUserId;
    document.getElementById('selfRoleHint').hidden = !roleInput.disabled;
    passwordInput.required = !user;
    document.getElementById('userPasswordLabel').textContent = user ? 'Mật khẩu mới' : 'Mật khẩu *';
    document.getElementById('userPasswordHint').textContent = user ? 'Để trống để giữ nguyên mật khẩu hiện tại.' : 'Nhập mật khẩu từ 6 đến 128 ký tự.';
    saveButton.textContent = user ? 'Lưu thay đổi' : 'Tạo tài khoản';
    modal.classList.add('show');
    document.getElementById('userFullName').focus();
}

function closeModal() {
    if (saving) return;
    modal.classList.remove('show');
    passwordInput.value = '';
    previousFocus?.focus();
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    saveButton.disabled = true;
    message('userFormMessage');
    const body = {
        full_name: document.getElementById('userFullName').value.trim(),
        email: document.getElementById('userEmail').value.trim(),
        phone: document.getElementById('userPhone').value.trim(),
        role: roleInput.value
    };
    if (passwordInput.value) body.password = passwordInput.value;
    const isEditing = editingId !== null;
    try {
        await request(isEditing ? `/admin/users/${editingId}` : '/admin/users', {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (editingId === currentUserId) renderAdmin(body);
        saving = false;
        closeModal();
        if (await loadUsers()) message('usersMessage', isEditing ? 'Cập nhật người dùng thành công.' : 'Tạo tài khoản thành công.', 'success');
    } catch (error) {
        message('userFormMessage', error.message);
    } finally {
        saving = false;
        saveButton.disabled = false;
    }
});

async function deleteUser(user, button) {
    if (deleting || saving || Number(user.id) === currentUserId) return;
    deleting = true;
    try {
        const confirmed = await window.adminConfirm({
            title: 'Xóa người dùng?',
            message: `Bạn có chắc muốn xóa tài khoản ${user.full_name} (${user.email})? Thao tác này không thể hoàn tác. Tài khoản có đơn hàng, đánh giá, câu hỏi hoặc yêu cầu đổi trả/bảo hành sẽ được giữ lại.`,
            confirmText: 'Xóa người dùng'
        });
        if (!confirmed) return;
        button.disabled = true;
        await request(`/admin/users/${Number(user.id)}`, { method: 'DELETE' });
        if (await loadUsers()) message('usersMessage', 'Xóa người dùng thành công.', 'success');
    } catch (error) {
        message('usersMessage', error.message);
    } finally {
        deleting = false;
        button.disabled = false;
        if (button.isConnected) button.focus();
    }
}

usersBody.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'reload') { message('usersMessage'); loadUsers(); return; }
    const user = users.find(item => Number(item.id) === Number(button.dataset.userId));
    if (!user) return;
    if (button.dataset.action === 'edit') openModal(user);
    if (button.dataset.action === 'delete') deleteUser(user, button);
});

document.getElementById('addUserButton').addEventListener('click', () => openModal());
document.querySelectorAll('[data-close-user-modal]').forEach(button => button.addEventListener('click', closeModal));
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, input, select')].filter(element => !element.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

window.adminLogout = async () => {
    if (!await window.adminConfirm({ title: 'Đăng xuất?', message: 'Bạn có chắc muốn đăng xuất?', confirmText: 'Đăng xuất', tone: 'primary', icon: 'fa-sign-out-alt' })) return;
    try {
        await request('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) { message('usersMessage', error.message); }
};

document.getElementById('currentDate').textContent = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
try {
    const data = await request('/api/auth/me');
    if (data.user?.role !== 'admin') window.location.href = '/login';
    else {
        currentUserId = Number(data.user.id);
        renderAdmin(data.user);
        await loadUsers();
    }
} catch (error) { message('usersMessage', error.message); }
