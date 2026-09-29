import('/js/modules/http.js').then(({ installFetch }) => installFetch()).catch(() => {});

// Format price to VND
function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN').format(price);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

// Toast Notification
function showToast(message, type = 'success') {
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill', warning: 'bi-exclamation-circle-fill' };
    document.querySelectorAll('.custom-toast[data-storefront-toast="true"]').forEach(item => item.remove());
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    toast.dataset.storefrontToast = 'true';
    toast.innerHTML = `<i class="bi ${icons[type]}"></i><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastSlideOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function showLoginPrompt(message, redirect = window.location.pathname + window.location.search) {
    showConfirm('Đăng nhập để tiếp tục', message, () => {
        window.location.href = '/login?redirect=' + encodeURIComponent(redirect);
    });
}

// Initialize app
async function initApp() {
    await loadUserInfo();
    await loadCartBadge();
    await loadWishlistBadge();
    updateCompareBadge();
    setupSearch();
}

// Load user info
async function loadUserInfo() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();

        const userArea = document.getElementById('userArea');
        const mobileUserArea = document.getElementById('mobileUserArea');

            if (data.user) {
                const roleLabel = data.user.role === 'admin' ? 'Quản trị viên' : 'Khách hàng';
                const safeName = escapeHtml(data.user.full_name || 'Người dùng');
                const safeAvatar = escapeHtml(data.user.avatar || '');
                const adminLink = data.user.role === 'admin'
                    ? '<a href="/admin" class="user-dropdown-item"><i class="bi bi-speedometer2"></i> Trang quản trị</a>'
                    : '';

                const avatarHtml = data.user.avatar
                    ? '<div class="user-avatar"><img src="' + safeAvatar + '" alt="Avatar"></div>'
                    : '<div class="user-avatar"><i class="bi bi-person-fill"></i></div>';

                const userHtml = `
                <div class="user-dropdown">
                    <button class="btn-login user-dropdown-btn">
                        <i class="bi bi-person-circle"></i>
                        ${safeName}
                        <i class="bi bi-chevron-down" style="font-size:0.65rem"></i>
                    </button>
                    <div class="user-dropdown-menu">
                        <div class="user-dropdown-header">
                            ${avatarHtml}
                            <div>
                                <div class="user-name">${safeName}</div>
                                <div class="user-role">${roleLabel}</div>
                            </div>
                        </div>
                        <div class="user-dropdown-divider"></div>
                        ${adminLink}
                        <a href="/orders" class="user-dropdown-item"><i class="bi bi-bag-check"></i> Đơn hàng của tôi</a>
                        <a href="/profile" class="user-dropdown-item"><i class="bi bi-gear"></i> Cài đặt tài khoản</a>
                        <div class="user-dropdown-divider"></div>
                        <a href="javascript:void(0)" class="user-dropdown-item user-dropdown-logout" onclick="logout()"><i class="bi bi-box-arrow-right"></i> Đăng xuất</a>
                    </div>
                </div>`;

                const mobileAvatarHtml = data.user.avatar
                    ? '<div class="user-avatar"><img src="' + safeAvatar + '" alt="Avatar"></div>'
                    : '<div class="user-avatar"><i class="bi bi-person-fill"></i></div>';

                const mobileUserHtml = `
                <div class="mobile-nav-user">
                    ${mobileAvatarHtml}
                    <div>
                        <div style="font-weight:700;font-size:0.875rem">${safeName}</div>
                        <div style="font-size:0.72rem;color:var(--gray)">${roleLabel}</div>
                    </div>
                </div>
                ${data.user.role === 'admin' ? '<a href="/admin" class="mobile-nav-item"><i class="bi bi-speedometer2"></i> Trang quản trị</a>' : ''}
                <a href="/orders" class="mobile-nav-item"><i class="bi bi-bag-check"></i> Đơn hàng của tôi</a>
                ${document.querySelector('#mobileMenu a[href="/wishlist"]') ? '' : '<a href="/wishlist" class="mobile-nav-item"><i class="bi bi-heart"></i> Yêu thích</a>'}
                <a href="/profile" class="mobile-nav-item"><i class="bi bi-gear"></i> Cài đặt tài khoản</a>
                <a href="javascript:void(0)" class="mobile-nav-item" style="color:var(--slate-600)" onclick="logout()"><i class="bi bi-box-arrow-right"></i> Đăng xuất</a>`;

            if (userArea) userArea.innerHTML = userHtml;
            if (mobileUserArea) mobileUserArea.innerHTML = mobileUserHtml;

            // Set global currentUser for other pages
            window.currentUser = data.user;

            // Setup dropdown
            setupUserDropdown();
        } else {
            window.currentUser = null;
            const guestHtml = '<a href="/login" class="btn-login"><i class="bi bi-person"></i> Đăng nhập</a>';
            const mobileGuestHtml = '<a href="/login" class="mobile-nav-item" style="color:var(--primary);font-weight:700"><i class="bi bi-person"></i> Đăng nhập</a>';

            if (userArea) userArea.innerHTML = guestHtml;
            if (mobileUserArea) mobileUserArea.innerHTML = mobileGuestHtml;
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Load cart badge
async function loadCartBadge() {
    try {
        const response = await fetch('/api/cart-count');
        const data = await response.json();

        const badge = document.getElementById('cartBadge');
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading cart count:', error);
    }
}

// Load wishlist badge (số sản phẩm yêu thích)
async function loadWishlistBadge() {
    try {
        const response = await fetch('/api/wishlist/count', { credentials: 'include' });
        const data = await response.json();

        const badge = document.getElementById('wishlistBadge');
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading wishlist count:', error);
    }
}

// ============ COMPARE (So sánh sản phẩm - LocalStorage) ============
const COMPARE_KEY = 'compare_products';
const MAX_COMPARE = 4;

function getCompareList() {
    try {
        const data = localStorage.getItem(COMPARE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveCompareList(list) {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
    updateCompareBadge();
}

function isInCompare(productId) {
    return getCompareList().includes(productId);
}

// Thêm/xóa sản phẩm khỏi danh sách so sánh
function toggleCompare(productId, btn) {
    let list = getCompareList();
    const idx = list.indexOf(productId);
    if (idx >= 0) {
        list.splice(idx, 1);
        if (btn) {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="bi bi-bar-chart"></i>';
        }
        showToast('Đã xóa khỏi so sánh', 'info');
    } else {
        if (list.length >= MAX_COMPARE) {
            showToast(`Bạn chỉ có thể thêm tối đa ${MAX_COMPARE} sản phẩm vào danh sách so sánh.`, 'warning');
            return false;
        }
        list.push(productId);
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="bi bi-bar-chart-fill"></i>';
        }
        showToast('Đã thêm vào so sánh!', 'success');
    }
    saveCompareList(list);
    return true;
}

function clearCompare() {
    localStorage.removeItem(COMPARE_KEY);
    updateCompareBadge();
}

function updateCompareBadge() {
    const count = getCompareList().length;
    const badge = document.getElementById('compareBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Add to cart
async function addToCart(productId, quantity = 1, variantId = null) {
    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ product_id: productId, qty: quantity, variant_id: variantId })
        });

        const data = await response.json();

        if (data.error) {
            if (data.error.includes('đăng nhập')) {
                showLoginPrompt('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.');
            } else {
                showToast(data.error, 'error');
            }
        } else {
            const variantText = variantId ? ' (đã chọn phiên bản)' : '';
            showToast('Đã thêm vào giỏ hàng!' + variantText, 'success');
            loadCartBadge();
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        showToast('Đã xảy ra lỗi khi thêm vào giỏ hàng!', 'error');
    }
}

// Toggle wishlist (thêm/xóa yêu thích)
async function toggleWishlist(productId, btn) {
    try {
        const response = await fetch('/api/wishlist/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ product_id: productId })
        });

        const data = await response.json();

        if (data.need_login || (data.error && data.error.includes('đăng nhập'))) {
            showLoginPrompt('Vui lòng đăng nhập để lưu sản phẩm vào danh sách yêu thích.');
            return;
        }

        if (data.success) {
            // Cập nhật UI nếu có nút
            if (btn) {
                const icon = btn.querySelector('i');
                if (data.action === 'added') {
                    icon.className = 'bi bi-heart-fill';
                    btn.classList.add('active');
                } else {
                    icon.className = 'bi bi-heart';
                    btn.classList.remove('active');
                }
            }
            // Hiện toast đẹp
            showToast(data.message || 'Thành công!', data.action === 'added' ? 'success' : 'info');
            loadWishlistBadge();
        } else {
            showToast(data.error || 'Có lỗi xảy ra!', 'error');
        }
    } catch (error) {
        console.error('Toggle wishlist error:', error);
        showToast('Lỗi kết nối!', 'error');
    }
}

// Search
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchSuggest = document.getElementById('searchSuggest');
    let searchTimer;

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            const q = this.value.trim();
            if (q.length < 2) {
                if (searchSuggest) searchSuggest.style.display = 'none';
                return;
            }

            searchTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                    const data = await response.json();

                    if (data.length === 0) {
                        if (searchSuggest) searchSuggest.style.display = 'none';
                        return;
                    }

                    let html = '';
                    data.forEach(item => {
                        const imgSrc = item.thumbnail && item.thumbnail.startsWith('http')
                            ? item.thumbnail
                            : `/assets/images/products/${encodeURIComponent(item.thumbnail || '')}`;
                        const safeImgSrc = escapeHtml(imgSrc);
                        html += `
                            <a href="/product/${encodeURIComponent(item.id)}" class="suggest-item">
                                <img src="${safeImgSrc}" onerror="this.style.display='none'" class="suggest-img">
                                <div class="suggest-info">
                                    <div class="suggest-name">${escapeHtml(item.name)}</div>
                                    <div class="suggest-price">${formatPrice(item.price)}đ</div>
                                </div>
                            </a>`;
                    });
                    html += `
                        <div class="suggest-footer">
                            <a href="/products?q=${encodeURIComponent(q)}" class="suggest-all">
                                <i class="bi bi-search"></i> Xem tất cả kết quả cho "${q}"
                            </a>
                        </div>`;

                    if (searchSuggest) {
                        searchSuggest.innerHTML = html;
                        searchSuggest.style.display = 'block';
                    }
                } catch (error) {
                    console.error('Search error:', error);
                }
            }, 300);
        });

        // Hide suggest on click outside
        document.addEventListener('click', function (e) {
            if (!searchInput.contains(e.target) && (!searchSuggest || !searchSuggest.contains(e.target))) {
                if (searchSuggest) searchSuggest.style.display = 'none';
            }
        });
    }
}

// Generic Confirm Dialog
function showConfirm(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog">
            <div class="confirm-icon"><i class="bi bi-question-circle-fill"></i></div>
            <div class="confirm-title">${escapeHtml(title)}</div>
            <div class="confirm-message">${escapeHtml(message)}</div>
            <div class="confirm-actions">
                <button class="confirm-btn cancel" onclick="this.closest('.confirm-overlay').remove()">Hủy</button>
                <button class="confirm-btn confirm">Xác nhận</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-btn.confirm').onclick = async () => {
        overlay.remove();
        if (onConfirm) await onConfirm();
    };
    overlay.querySelector('.confirm-btn.cancel').onclick = () => overlay.remove();
}

// Logout
function showConfirmLogout() {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog">
            <div class="confirm-icon"><i class="bi bi-box-arrow-right"></i></div>
            <div class="confirm-title">Đăng xuất?</div>
            <div class="confirm-message">Bạn có chắc muốn đăng xuất khỏi tài khoản này?</div>
            <div class="confirm-actions">
                <button class="confirm-btn cancel" onclick="this.closest('.confirm-overlay').remove()">Hủy</button>
                <button class="confirm-btn confirm">Đăng xuất</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-btn.confirm').onclick = async () => {
        overlay.remove();
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (error) {
            window.location.href = '/login';
        }
    };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function logout() {
    showConfirmLogout();
}

// User dropdown
function setupUserDropdown() {
    const userBtn = document.querySelector('.user-dropdown-btn');
    const userMenu = document.querySelector('.user-dropdown-menu');

    if (userBtn && userMenu) {
        userBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            userMenu.classList.toggle('show');
        });

        document.addEventListener('click', function () {
            userMenu.classList.remove('show');
        });
    }
}

// Mobile menu
function openMobileMenu() {
    var menu = document.getElementById('mobileMenu');
    var overlay = document.getElementById('mobileOverlay');
    if (menu) menu.classList.add('active');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
    var menu = document.getElementById('mobileMenu');
    var overlay = document.getElementById('mobileOverlay');
    if (menu) menu.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Go search
function goSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (q) window.location = '/products?q=' + encodeURIComponent(q);
}

function goMobileSearch() {
    const q = document.getElementById('mobileSearchInput').value.trim();
    if (q) window.location = '/products?q=' + encodeURIComponent(q);
}

// Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export for use
window.initApp = initApp;
window.loadUserInfo = loadUserInfo;
window.loadCartBadge = loadCartBadge;
window.loadWishlistBadge = loadWishlistBadge;
window.addToCart = addToCart;
window.toggleWishlist = toggleWishlist;
window.toggleCompare = toggleCompare;
window.getCompareList = getCompareList;
window.clearCompare = clearCompare;
window.updateCompareBadge = updateCompareBadge;
window.formatPrice = formatPrice;
window.goSearch = goSearch;
window.goMobileSearch = goMobileSearch;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.logout = logout;
