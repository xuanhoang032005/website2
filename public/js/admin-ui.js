import('/js/modules/http.js').then(({ installFetch }) => installFetch()).catch(() => {});

(function () {
    'use strict';

    const routeLabels = {
        '/admin': 'Tổng quan',
        '/admin/products': 'Sản phẩm',
        '/admin/orders': 'Đơn hàng',
        '/admin/users': 'Khách hàng',
        '/admin/reviews': 'Đánh giá',
        '/admin/contacts': 'Liên hệ',
        '/admin/categories': 'Danh mục',
        '/admin/brands': 'Thương hiệu',
        '/admin/banners': 'Banner',
        '/admin/promotions': 'Khuyến mãi'
    };

    function normalizedPath(value) {
        return (value || '/').replace(/\/+$/, '') || '/';
    }

    function createConfirmElement(className, text) {
        const element = document.createElement('div');
        element.className = className;
        element.textContent = text;
        return element;
    }

    function adminConfirm(options) {
        const settings = Object.assign({
            title: 'Xác nhận thao tác',
            message: 'Bạn có chắc muốn tiếp tục?',
            confirmText: 'Xác nhận',
            cancelText: 'Hủy',
            icon: 'fa-triangle-exclamation',
            tone: 'danger'
        }, options || {});

        const oldOverlay = document.querySelector('.confirm-overlay');
        if (oldOverlay) oldOverlay.remove();

        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'confirm-dialog';
            dialog.setAttribute('role', 'alertdialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'adminConfirmTitle');
            dialog.setAttribute('aria-describedby', 'adminConfirmMessage');

            const icon = document.createElement('div');
            icon.className = `confirm-icon ${settings.tone}`;
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = `<i class="fas ${settings.icon}"></i>`;

            const title = createConfirmElement('confirm-title', settings.title);
            title.id = 'adminConfirmTitle';
            const message = createConfirmElement('confirm-message', settings.message);
            message.id = 'adminConfirmMessage';

            const actions = document.createElement('div');
            actions.className = 'confirm-actions';
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'confirm-btn cancel';
            cancelButton.textContent = settings.cancelText;
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.className = `confirm-btn confirm ${settings.tone}`;
            confirmButton.textContent = settings.confirmText;
            actions.append(cancelButton, confirmButton);
            dialog.append(icon, title, message, actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            let settled = false;
            function close(result) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeydown);
                overlay.remove();
                resolve(result);
            }
            function onKeydown(event) {
                if (event.key === 'Escape') close(false);
            }
            cancelButton.addEventListener('click', function () { close(false); });
            confirmButton.addEventListener('click', function () { close(true); });
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) close(false);
            });
            document.addEventListener('keydown', onKeydown);
            cancelButton.focus();
        });
    }

    window.adminConfirm = adminConfirm;
    window.showConfirm = function (title, message, onConfirm) {
        adminConfirm({
            title,
            message,
            confirmText: 'Đăng xuất',
            icon: 'fa-sign-out-alt',
            tone: 'primary'
        }).then(function (confirmed) {
            if (confirmed && typeof onConfirm === 'function') onConfirm();
        });
    };

    function closeSidebar() {
        document.body.classList.remove('sidebar-open');
        const button = document.querySelector('.admin-mobile-toggle');
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    function setupNavigation() {
        const sidebar = document.querySelector('.sidebar');
        const headerLeft = document.querySelector('.top-header-left');
        if (!sidebar || !headerLeft) return;

        sidebar.id = sidebar.id || 'adminSidebar';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'admin-mobile-toggle';
        toggle.setAttribute('aria-label', 'Mở menu quản trị');
        toggle.setAttribute('aria-controls', sidebar.id);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        headerLeft.prepend(toggle);

        const backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.className = 'admin-sidebar-backdrop';
        backdrop.setAttribute('aria-label', 'Đóng menu quản trị');
        document.body.appendChild(backdrop);

        toggle.addEventListener('click', function () {
            const isOpen = document.body.classList.toggle('sidebar-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });
        backdrop.addEventListener('click', closeSidebar);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeSidebar();
        });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 900) closeSidebar();
        });

        const productsLink = sidebar.querySelector('.nav-item[href="/admin/products"]');
        if (productsLink && !sidebar.querySelector('.nav-item[href="/admin/categories"]')) {
            const categoriesLink = document.createElement('a');
            categoriesLink.href = '/admin/categories';
            categoriesLink.className = 'nav-item';
            categoriesLink.innerHTML = '<i class="fas fa-layer-group" aria-hidden="true"></i> Danh mục';
            productsLink.insertAdjacentElement('afterend', categoriesLink);

            const brandsLink = document.createElement('a');
            brandsLink.href = '/admin/brands';
            brandsLink.className = 'nav-item';
            brandsLink.innerHTML = '<i class="fas fa-tags" aria-hidden="true"></i> Thương hiệu';
            categoriesLink.insertAdjacentElement('afterend', brandsLink);
        }

        const current = normalizedPath(window.location.pathname);
        document.querySelectorAll('.sidebar .nav-item[href]').forEach(function (item) {
            const href = normalizedPath(new URL(item.href, window.location.origin).pathname);
            const exactMatch = href === current;
            item.classList.toggle('active', exactMatch);
            if (exactMatch) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
            item.addEventListener('click', function () {
                if (window.innerWidth <= 900) closeSidebar();
            });
        });

        const subtitle = document.querySelector('.sidebar-logo-sub');
        if (subtitle) subtitle.textContent = 'Bảng điều khiển';
    }

    function setupTables() {
        document.querySelectorAll('table.data-table').forEach(function (table) {
            const parent = table.parentElement;
            if (!parent || parent.classList.contains('table-scroll')) return;
            const computed = window.getComputedStyle(parent);
            if (computed.overflowX === 'auto' || computed.overflowX === 'scroll') return;
            const wrapper = document.createElement('div');
            wrapper.className = 'table-scroll';
            parent.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });
    }

    function improveAccessibility() {
        document.querySelectorAll('button, a').forEach(function (element) {
            if (element.getAttribute('aria-label')) return;
            const visibleText = (element.textContent || '').trim();
            if (visibleText) return;
            const title = element.getAttribute('title');
            const icon = element.querySelector('i');
            const iconName = icon ? Array.from(icon.classList).find(function (name) { return name.indexOf('fa-') === 0 && name !== 'fa-solid' && name !== 'fa-regular'; }) : '';
            if (title) element.setAttribute('aria-label', title);
            else if (iconName) element.setAttribute('aria-label', iconName.replace(/^fa-/, '').replace(/-/g, ' '));
        });
    }

    function setupMobileChat() {
        const layout = document.querySelector('.chat-layout');
        if (!layout) return;
        layout.querySelectorAll('.conversation-item').forEach(function (item) {
            item.addEventListener('click', function () {
                if (window.innerWidth <= 640) layout.classList.add('chat-open');
            });
        });
        const header = layout.querySelector('.chat-header');
        if (!header || header.querySelector('.chat-back-button')) return;
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn btn-icon btn-secondary chat-back-button';
        back.setAttribute('aria-label', 'Quay lại danh sách liên hệ');
        back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i>';
        back.addEventListener('click', function () { layout.classList.remove('chat-open'); });
        header.prepend(back);
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.body.classList.add('admin-shell');
        document.body.dataset.adminSection = routeLabels[normalizedPath(window.location.pathname)] || 'Quản trị';
        setupNavigation();
        setupTables();
        improveAccessibility();
        setupMobileChat();
    });
})();
