(function () {
    'use strict';

    const STORE_ADDRESS = '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh';
    const SHIPPING_FEES = { standard: 30000, express: 50000 };
    const state = {
        currentStep: 1,
        cart: null,
        user: null,
        shipping: null,
        shippingMethod: null,
        paymentMethod: null,
        coupon: null,
        availableCoupons: [],
        unavailableCoupons: [],
        couponError: '',
        selectedItemIds: [],
        pendingOrderId: null,
        buyNow: false
    };

    document.addEventListener('DOMContentLoaded', initializeCheckout);

    async function initializeCheckout() {
        try {
            if (typeof window.initApp === 'function') await window.initApp();
            const loaded = await loadCheckoutData();
            if (!loaded) return;
            renderCheckout();
            await loadAvailableCoupons();
        } catch (error) {
            console.error('Checkout initialization error:', error);
            checkoutToast('Không thể tải trang thanh toán. Vui lòng thử lại.', 'error');
        }
    }

    async function jsonRequest(url, options = {}) {
        const response = await fetch(url, { credentials: 'include', ...options });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : { error: await response.text() };
        if (!response.ok) throw new Error(data.error || 'Yêu cầu không thành công');
        return data;
    }

    async function loadCheckoutData() {
        const userData = await jsonRequest('/api/auth/me');
        if (!userData.user) {
            renderLoginRequired();
            return false;
        }
        state.user = userData.user;

        const params = new URLSearchParams(window.location.search);
        const buyNowToken = params.get('buy_now');
        if (buyNowToken) {
            const data = await jsonRequest('/api/cart/buy-now?token=' + encodeURIComponent(buyNowToken));
            if (!data.buyNow) throw new Error('Phiên mua ngay đã hết hạn');
            const item = data.buyNow;
            state.buyNow = true;
            state.cart = {
                items: [{
                    id: 'buy_now',
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                    name: item.product_name,
                    price: Number(item.price),
                    quantity: Number(item.quantity),
                    thumbnail: item.thumbnail,
                    stock: item.stock,
                    ram: item.ram,
                    storage: item.storage,
                    color: item.color
                }],
                total: Number(item.price) * Number(item.quantity)
            };
        } else {
            const cart = await jsonRequest('/api/cart');
            const requestedIds = (params.get('items') || '').split(',')
                .map(value => Number(value))
                .filter(Number.isSafeInteger);
            state.selectedItemIds = requestedIds;
            if (requestedIds.length) {
                cart.items = (cart.items || []).filter(item => requestedIds.includes(Number(item.id)));
            }
            if (!cart.items || !cart.items.length) {
                window.location.href = '/cart';
                return false;
            }
            cart.total = cart.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
            state.cart = cart;
        }
        return true;
    }

    function renderLoginRequired() {
        document.getElementById('checkoutSteps').style.display = 'none';
        document.getElementById('checkoutContent').innerHTML = `
            <div class="login-required">
                <i class="bi bi-shield-lock"></i>
                <h3>Vui lòng đăng nhập</h3>
                <p>Bạn cần đăng nhập để tiếp tục thanh toán.</p>
                <a href="/login" class="btn-login"><i class="bi bi-box-arrow-in-right"></i> Đăng nhập ngay</a>
            </div>`;
    }

    function renderCheckout() {
        const profileAddress = String(state.user.address || '');
        document.getElementById('checkoutContent').innerHTML = `
            <div class="checkout-grid checkout-reference-grid">
                <div class="checkout-flow">
                    <section class="checkout-card checkout-stage" id="addressStage">
                        <div class="stage-heading">
                            <span class="stage-number">1</span>
                            <div><h2>Thông tin nhận hàng</h2><p>Vui lòng điền đầy đủ thông tin để chúng tôi giao hàng cho bạn.</p></div>
                        </div>
                        <div class="card-body">
                            <form id="addressForm" novalidate>
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label class="form-label" for="shippingName">Họ và tên <span>*</span></label>
                                        <input class="form-input" id="shippingName" value="${escapeAttribute(state.user.full_name || '')}" autocomplete="name" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label" for="shippingPhone">Số điện thoại <span>*</span></label>
                                        <input class="form-input" id="shippingPhone" value="${escapeAttribute(state.user.phone || '')}" autocomplete="tel" required>
                                    </div>
                                    <div class="form-group full">
                                        <label class="form-label" for="shippingEmail">Email <span>*</span></label>
                                        <input type="email" class="form-input" id="shippingEmail" value="${escapeAttribute(state.user.email || '')}" autocomplete="email" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label" for="province">Tỉnh/Thành phố <span>*</span></label>
                                        <select class="form-select" id="province" required><option value="">Chọn Tỉnh/Thành phố</option></select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label" for="district">Quận/Huyện <span>*</span></label>
                                        <select class="form-select" id="district" required disabled><option value="">Chọn Quận/Huyện</option></select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label" for="ward">Phường/Xã <span>*</span></label>
                                        <select class="form-select" id="ward" required disabled><option value="">Chọn Phường/Xã</option></select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label" for="shippingAddress">Địa chỉ chi tiết <span>*</span></label>
                                        <input class="form-input" id="shippingAddress" value="${escapeAttribute(profileAddress)}" placeholder="Số nhà, tên đường" autocomplete="street-address" required>
                                    </div>
                                    <div class="form-group full">
                                        <label class="form-label" for="orderNotes">Ghi chú (tùy chọn)</label>
                                        <textarea class="form-textarea compact" id="orderNotes" placeholder="Lưu ý cho nhân viên giao hàng"></textarea>
                                    </div>
                                </div>
                                <p class="address-gate-note" id="addressGateNote"><i class="bi bi-info-circle"></i> Điền đủ địa chỉ để xem hình thức giao hàng.</p>
                            </form>
                        </div>
                    </section>

                    <section class="checkout-card checkout-stage progressive-section" id="shippingStage" hidden>
                        <div class="stage-heading">
                            <span class="stage-number">2</span>
                            <div><h2>Phương thức giao hàng</h2><p>Thời gian được tính trực tiếp từ cửa hàng tại ${STORE_ADDRESS}.</p></div>
                        </div>
                        <div class="card-body">
                            <div class="shipping-methods">
                                <button type="button" class="shipping-method" data-method="standard">
                                    <span class="choice-radio"></span><i class="bi bi-truck"></i>
                                    <span class="choice-copy"><strong>Giao tiêu chuẩn</strong><small id="standardEstimate">Đang tính thời gian...</small><b>30.000đ</b></span>
                                </button>
                                <button type="button" class="shipping-method" data-method="express">
                                    <span class="choice-radio"></span><i class="bi bi-lightning-charge"></i>
                                    <span class="choice-copy"><strong>Giao nhanh</strong><small id="expressEstimate">Đang tính thời gian...</small><b>50.000đ</b></span>
                                </button>
                            </div>
                            <div class="route-estimate" id="routeEstimate"></div>
                        </div>
                    </section>

                    <section class="checkout-card checkout-stage progressive-section" id="paymentStage" hidden>
                        <div class="stage-heading">
                            <span class="stage-number">3</span>
                            <div><h2>Phương thức thanh toán</h2><p>Chọn phương thức thanh toán phù hợp.</p></div>
                        </div>
                        <div class="card-body">
                            <div class="payment-methods payment-methods-grid">
                                <button type="button" class="payment-method" data-method="cod">
                                    <span class="choice-radio"></span><span class="payment-icon"><i class="bi bi-cash-coin"></i></span>
                                    <span class="payment-info"><strong>COD</strong><small>Thanh toán khi nhận hàng</small></span>
                                </button>
                                <button type="button" class="payment-method" data-method="vnpay">
                                    <span class="choice-radio"></span><span class="payment-icon"><i class="bi bi-bank"></i></span>
                                    <span class="payment-info"><strong>VNPay</strong><small>Thanh toán qua mã QR</small></span>
                                </button>
                                <button type="button" class="payment-method" data-method="momo">
                                    <span class="choice-radio"></span><span class="payment-icon momo-mark">mo<br>mo</span>
                                    <span class="payment-info"><strong>MoMo</strong><small>Thanh toán qua mã QR</small></span>
                                </button>
                            </div>

                            <div class="checkout-coupon" id="checkoutCoupon">
                                <div class="coupon-title"><i class="bi bi-ticket-perforated"></i> Mã giảm giá</div>
                                <div id="couponOptions"></div>
                            </div>
                            <div class="safe-payment-note"><i class="bi bi-shield-check"></i><div><strong>Thanh toán an toàn</strong><span>Đây là website thực tập, không phát sinh giao dịch thật.</span></div></div>
                        </div>
                    </section>

                    <div class="checkout-actions progressive-section" id="checkoutActions" hidden>
                        <a href="/cart" class="checkout-back"><i class="bi bi-arrow-left"></i> Quay lại giỏ hàng</a>
                        <button type="button" class="continue-payment" id="continuePayment" disabled>Tiếp tục thanh toán <i class="bi bi-arrow-right"></i></button>
                    </div>
                </div>
                <aside id="summarySidebar" class="checkout-summary-column"></aside>
            </div>`;

        initializeAddressSelectors();
        bindCheckoutEvents();
        renderOrderSummary();
        inferProfileAddress(profileAddress);
        evaluateAddressCompletion();
    }

    function initializeAddressSelectors() {
        const province = document.getElementById('province');
        getProvinces().forEach(name => province.add(new Option(name, name)));
    }

    function inferProfileAddress(address) {
        if (!address) return;
        const normalized = normalizeLocation(address);
        let provinceName = getProvinces().find(name => normalized.includes(normalizeLocation(name)));
        if (!provinceName && (normalized.includes('tp.hcm') || normalized.includes('tphcm'))) provinceName = 'Thành phố Hồ Chí Minh';
        if (!provinceName) return;
        const province = document.getElementById('province');
        province.value = provinceName;
        populateDistricts();
        const districtMatch = address.match(/(?:Q\.?|Quận\s*)(\d+)/i);
        if (districtMatch) {
            const districtName = 'Quận ' + districtMatch[1];
            const district = document.getElementById('district');
            if ([...district.options].some(option => option.value === districtName)) {
                district.value = districtName;
                populateWards();
            }
        }
    }

    function bindCheckoutEvents() {
        const form = document.getElementById('addressForm');
        form.addEventListener('input', evaluateAddressCompletion);
        form.addEventListener('change', evaluateAddressCompletion);
        document.getElementById('province').addEventListener('change', () => {
            populateDistricts();
            evaluateAddressCompletion();
        });
        document.getElementById('district').addEventListener('change', () => {
            populateWards();
            evaluateAddressCompletion();
        });
        document.querySelectorAll('.shipping-method').forEach(button => button.addEventListener('click', () => selectShipping(button.dataset.method)));
        document.querySelectorAll('.payment-method').forEach(button => button.addEventListener('click', () => selectPayment(button.dataset.method)));
        document.getElementById('continuePayment').addEventListener('click', continuePayment);
    }

    function populateDistricts() {
        const province = document.getElementById('province').value;
        const district = document.getElementById('district');
        const ward = document.getElementById('ward');
        district.innerHTML = '<option value="">Chọn Quận/Huyện</option>';
        ward.innerHTML = '<option value="">Chọn Phường/Xã</option>';
        getDistricts(province).forEach(name => district.add(new Option(name, name)));
        district.disabled = !province;
        ward.disabled = true;
    }

    function populateWards() {
        const province = document.getElementById('province').value;
        const district = document.getElementById('district').value;
        const ward = document.getElementById('ward');
        ward.innerHTML = '<option value="">Chọn Phường/Xã</option>';
        getWards(province, district).forEach(name => ward.add(new Option(name, name)));
        ward.disabled = !district;
    }

    function addressValues() {
        const value = id => document.getElementById(id)?.value.trim() || '';
        return {
            name: value('shippingName'), phone: value('shippingPhone'), email: value('shippingEmail'),
            province: value('province'), district: value('district'), ward: value('ward'),
            detail: value('shippingAddress'), notes: value('orderNotes')
        };
    }

    function evaluateAddressCompletion() {
        const values = addressValues();
        const complete = values.name && /^[0-9+().\s-]{8,15}$/.test(values.phone) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
            && values.province && values.district && values.ward && values.detail;
        const shippingStage = document.getElementById('shippingStage');
        const note = document.getElementById('addressGateNote');
        shippingStage.hidden = !complete;
        note.classList.toggle('complete', Boolean(complete));
        note.innerHTML = complete
            ? '<i class="bi bi-check-circle-fill"></i> Địa chỉ đã đầy đủ. Vui lòng chọn hình thức giao hàng.'
            : '<i class="bi bi-info-circle"></i> Điền đủ địa chỉ để xem hình thức giao hàng.';

        if (!complete) {
            state.shipping = null;
            state.shippingMethod = null;
            state.paymentMethod = null;
            hideAfterAddress();
            updateSteps(1);
            return;
        }

        state.shipping = {
            name: values.name,
            phone: values.phone,
            email: values.email,
            province: values.province,
            district: values.district,
            ward: values.ward,
            addressDetail: values.detail,
            address: [values.detail, values.ward, values.district, values.province].join(', '),
            notes: values.notes
        };
        updateDeliveryEstimates();
        updateSteps(state.shippingMethod ? 2 : 1);
    }

    function hideAfterAddress() {
        document.getElementById('paymentStage').hidden = true;
        document.getElementById('checkoutActions').hidden = true;
        renderOrderSummary();
    }

    function selectShipping(method) {
        state.shippingMethod = method;
        document.querySelectorAll('.shipping-method').forEach(button => button.classList.toggle('selected', button.dataset.method === method));
        document.getElementById('paymentStage').hidden = false;
        document.getElementById('checkoutActions').hidden = false;
        updateSteps(2);
        renderCouponOptions();
        renderOrderSummary();
        document.getElementById('paymentStage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function selectPayment(method) {
        state.paymentMethod = method;
        document.querySelectorAll('.payment-method').forEach(button => button.classList.toggle('selected', button.dataset.method === method));
        document.getElementById('continuePayment').disabled = false;
    }

    function normalizeLocation(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function deliveryProfile(method) {
        const location = normalizeLocation(`${state.shipping?.district || ''}, ${state.shipping?.province || ''}`);
        const isHcm = location.includes('ho chi minh');
        const isInner = isHcm && ['quan 1', 'quan 3', 'quan 4', 'quan 5', 'quan 10', 'binh thanh', 'phu nhuan'].some(name => location.includes(name));
        const isNear = ['binh duong', 'dong nai', 'long an', 'tay ninh', 'ba ria'].some(name => location.includes(name));
        if (method === 'express') return isInner ? [1, 1] : isHcm || isNear ? [1, 2] : [1, 3];
        return isInner ? [1, 2] : isHcm ? [2, 3] : isNear ? [2, 4] : [3, 6];
    }

    function dateAfter(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
    }

    function updateDeliveryEstimates() {
        if (!state.shipping) return;
        const standard = deliveryProfile('standard');
        const express = deliveryProfile('express');
        document.getElementById('standardEstimate').textContent = `Dự kiến ${dateAfter(standard[0])} - ${dateAfter(standard[1])} (${standard[0]}-${standard[1]} ngày)`;
        document.getElementById('expressEstimate').textContent = `Dự kiến ${dateAfter(express[0])} - ${dateAfter(express[1])} (${express[0]}-${express[1]} ngày)`;
        document.getElementById('routeEstimate').innerHTML = `<i class="bi bi-geo-alt"></i><span><strong>Từ:</strong> ${STORE_ADDRESS}<br><strong>Đến:</strong> ${escapeHtml(state.shipping.address)}</span>`;
    }

    async function loadAvailableCoupons() {
        try {
            let couponUrl = '/api/coupons/available?order_total=' + encodeURIComponent(Number(state.cart.total || 0));
            if (state.selectedItemIds.length) couponUrl += '&item_ids=' + encodeURIComponent(state.selectedItemIds.join(','));
            const data = await jsonRequest(couponUrl);
            state.availableCoupons = Array.isArray(data.coupons) ? data.coupons : [];
            state.unavailableCoupons = Array.isArray(data.unavailable) ? data.unavailable : [];
            state.couponError = '';
        } catch (error) {
            state.couponError = 'Không thể tải mã giảm giá.';
        }
        renderCouponOptions();
    }

    function renderCouponOptions() {
        const container = document.getElementById('couponOptions');
        if (!container) return;
        if (state.coupon) {
            container.innerHTML = `<div class="coupon-applied-box"><div class="coupon-applied-info"><i class="bi bi-check-circle-fill"></i><div><div class="coupon-applied-code">${escapeHtml(state.coupon.code)}</div><div class="coupon-applied-desc">-${formatPrice(state.coupon.discount_amount)}đ</div></div></div><button type="button" class="btn-remove-coupon" id="removeCoupon"><i class="bi bi-x"></i></button></div>`;
            document.getElementById('removeCoupon').addEventListener('click', () => { state.coupon = null; renderCouponOptions(); renderOrderSummary(); });
            return;
        }
        const chips = state.availableCoupons.slice(0, 4).map(coupon => `<button type="button" class="coupon-chip" data-code="${escapeAttribute(coupon.code)}"><i class="bi bi-ticket-perforated"></i><span class="coupon-code">${escapeHtml(coupon.code)}</span></button>`).join('');
        const message = state.couponError ? `<p class="coupon-msg error">${escapeHtml(state.couponError)}</p>` : '';
        container.innerHTML = `${chips ? `<div class="available-coupons">${chips}</div>` : ''}<div class="coupon-input-wrap"><i class="bi bi-ticket-perforated coupon-icon"></i><input class="coupon-input" id="couponCode" placeholder="Nhập mã giảm giá"><button type="button" class="btn-apply-coupon" id="applyCoupon">Áp dụng</button></div><div class="coupon-msg" id="couponMessage"></div>${message}`;
        container.querySelectorAll('.coupon-chip').forEach(button => button.addEventListener('click', () => { document.getElementById('couponCode').value = button.dataset.code; applyCoupon(); }));
        document.getElementById('applyCoupon').addEventListener('click', applyCoupon);
    }

    async function applyCoupon() {
        const input = document.getElementById('couponCode');
        const message = document.getElementById('couponMessage');
        const code = input.value.trim();
        if (!code) {
            message.className = 'coupon-msg error';
            message.textContent = 'Vui lòng nhập mã giảm giá.';
            return;
        }
        try {
            const validateUrl = '/api/coupons/validate' + (state.selectedItemIds.length
                ? '?item_ids=' + encodeURIComponent(state.selectedItemIds.join(',')) : '');
            const data = await jsonRequest(validateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, order_total: Number(state.cart.total || 0) })
            });
            state.coupon = data.coupon;
            renderCouponOptions();
            renderOrderSummary();
        } catch (error) {
            message.className = 'coupon-msg error';
            message.textContent = error.message;
        }
    }

    function renderOrderSummary() {
        const sidebar = document.getElementById('summarySidebar');
        if (!sidebar || !state.cart) return;
        const subtotal = Number(state.cart.total || 0);
        const shippingFee = state.shippingMethod ? SHIPPING_FEES[state.shippingMethod] : 0;
        const discount = Number(state.coupon?.discount_amount || 0);
        const total = Math.max(0, subtotal + shippingFee - discount);
        state.total = total;
        const items = state.cart.items.map(item => {
            const variants = [item.ram, item.storage, item.color].filter(Boolean).join(' · ');
            return `<div class="summary-item"><div class="summary-item-img"><img src="${escapeAttribute(productImage(item.thumbnail))}" alt="${escapeAttribute(item.name)}" onerror="this.onerror=null;this.src='/images/no-image.svg'"></div><div class="summary-item-info"><div class="summary-item-name">${escapeHtml(item.name)}</div>${variants ? `<div class="summary-item-qty">${escapeHtml(variants)}</div>` : ''}<div class="summary-item-qty">Số lượng: ${Number(item.quantity)}</div></div><div class="summary-item-price">${formatPrice(Number(item.price) * Number(item.quantity))}đ</div></div>`;
        }).join('');
        sidebar.innerHTML = `<div class="order-summary-card"><div class="summary-header">Đơn hàng của bạn <span>(${state.cart.items.length} sản phẩm)</span></div><div class="summary-items">${items}</div><div class="summary-body">${state.shippingMethod ? '' : '<div class="summary-waiting"><i class="bi bi-truck"></i> Phí giao hàng sẽ hiện sau khi chọn hình thức giao hàng.</div>'}<div class="summary-row"><span class="label">Tạm tính</span><span class="value">${formatPrice(subtotal)}đ</span></div>${discount ? `<div class="summary-row discount-row"><span class="label">Giảm giá</span><span class="value">-${formatPrice(discount)}đ</span></div>` : ''}<div class="summary-row"><span class="label">Phí vận chuyển</span><span class="value">${state.shippingMethod ? formatPrice(shippingFee) + 'đ' : '—'}</span></div><div class="summary-divider"></div><div class="summary-total"><span class="label">Tổng tiền</span><span class="value">${formatPrice(total)}đ</span></div><p class="vat-note">(Đã bao gồm VAT)</p><div class="summary-assurances"><div><i class="bi bi-shield-check"></i><span><strong>Cam kết chính hãng</strong><small>Sản phẩm chính hãng, bảo hành theo hãng.</small></span></div><div><i class="bi bi-truck"></i><span><strong>Giao hàng toàn quốc</strong><small>Dự kiến theo địa chỉ bạn đã chọn.</small></span></div><div><i class="bi bi-headset"></i><span><strong>Hỗ trợ 24/7</strong><small>Hotline: 1800 2097</small></span></div></div></div></div>`;
    }

    function checkoutPayload() {
        return {
            shipping_name: state.shipping.name,
            shipping_phone: state.shipping.phone,
            shipping_address: state.shipping.address,
            shipping_method: state.shippingMethod,
            payment_method: state.paymentMethod,
            notes: state.shipping.notes || '',
            coupon_code: state.coupon?.code || null,
            item_ids: state.selectedItemIds
        };
    }

    async function continuePayment() {
        if (!state.shipping || !state.shippingMethod || !state.paymentMethod) {
            checkoutToast('Vui lòng hoàn tất thông tin giao hàng và thanh toán.', 'error');
            return;
        }
        if (state.paymentMethod === 'cod') {
            await createCodOrder();
            return;
        }
        await createOnlineOrder();
    }

    async function createCodOrder() {
        showLoading('Đang tạo đơn hàng...');
        try {
            const result = await jsonRequest('/api/orders', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checkoutPayload())
            });
            window.location.href = '/order/' + result.order_id;
        } catch (error) {
            hideLoading();
            checkoutToast(error.message, 'error');
        }
    }

    async function createOnlineOrder() {
        showLoading('Đang khởi tạo thanh toán...');
        try {
            const result = await jsonRequest('/api/orders/initiate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checkoutPayload())
            });
            state.pendingOrderId = result.order_id;
            state.total = Number(result.total);
            hideLoading();
            renderQrPayment(result);
        } catch (error) {
            hideLoading();
            checkoutToast(error.message, 'error');
        }
    }

    function renderQrPayment(order) {
        updateSteps(3);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const provider = state.paymentMethod === 'vnpay' ? 'VNPay' : 'MoMo';
        document.getElementById('checkoutContent').innerHTML = `<div class="payment-final"><div class="payment-final-card"><div class="payment-final-icon"><i class="bi bi-qr-code-scan"></i></div><h1>Thanh toán qua ${provider}</h1><p>Quét mã QR minh họa để hoàn tất đơn <strong>${escapeHtml(order.payment_code || '#' + order.order_id)}</strong>.</p><div class="final-qr"><img src="/images/qr.jpg" alt="Mã QR thanh toán minh họa"></div><div class="final-amount"><span>Số tiền thanh toán</span><strong>${formatPrice(order.total)}đ</strong></div><div class="demo-warning"><i class="bi bi-info-circle"></i> Đây là giao dịch mô phỏng phục vụ đồ án, không chuyển tiền thật.</div><button type="button" class="continue-payment" id="confirmDemoPayment"><i class="bi bi-check-circle"></i> Xác nhận đã quét mã</button><a class="checkout-back centered" href="/order/${order.order_id}">Xem chi tiết đơn hàng</a></div><aside class="payment-order-recap"><h3>Thông tin đơn hàng</h3><div><span>Mã đơn</span><strong>${escapeHtml(order.payment_code || '#' + order.order_id)}</strong></div><div><span>Hình thức giao</span><strong>${state.shippingMethod === 'express' ? 'Giao nhanh' : 'Giao tiêu chuẩn'}</strong></div><div><span>Phương thức</span><strong>${provider}</strong></div><div><span>Người nhận</span><strong>${escapeHtml(state.shipping.name)}</strong></div><div><span>Địa chỉ</span><strong>${escapeHtml(state.shipping.address)}</strong></div></aside></div>`;
        document.getElementById('confirmDemoPayment').addEventListener('click', confirmPayment);
    }

    async function confirmPayment() {
        showLoading('Đang xác nhận thanh toán...');
        try {
            const status = await jsonRequest(`/api/orders/${state.pendingOrderId}/check-payment`);
            if (!status.paid) throw new Error('Chưa thể xác nhận thanh toán.');
            await jsonRequest(`/api/orders/${state.pendingOrderId}/complete`, { method: 'POST' });
            window.location.href = '/order/' + state.pendingOrderId;
        } catch (error) {
            hideLoading();
            checkoutToast(error.message, 'error');
        }
    }

    function updateSteps(step) {
        state.currentStep = step;
        [1, 2, 3].forEach(number => {
            const item = document.getElementById(`step${number}Indicator`);
            item.className = 'step-item ' + (number < step ? 'completed' : number === step ? 'active' : 'pending');
            const numberElement = item.querySelector('.step-number');
            numberElement.innerHTML = number < step ? '<i class="bi bi-check"></i>' : String(number);
        });
        document.getElementById('stepDivider1').classList.toggle('completed', step > 1);
        document.getElementById('stepDivider2').classList.toggle('completed', step > 2);
    }

    function showLoading(text) {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.add('active');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    function checkoutToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type || 'info'}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    function formatPrice(value) {
        return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
    }

    function productImage(value) {
        if (!value) return '/images/no-image.svg';
        if (/^https?:\/\//i.test(value)) {
            try {
                const url = new URL(value);
                return ['res.cloudinary.com', 'www.gstatic.com'].includes(url.hostname) ? value : '/images/no-image.svg';
            } catch (_) {
                return '/images/no-image.svg';
            }
        }
        if (value.startsWith('/')) return value;
        return '/assets/images/products/' + value;
    }

    function escapeAttribute(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
})();
