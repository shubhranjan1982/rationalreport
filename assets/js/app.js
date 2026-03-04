const App = {
    user: null,
    currentPage: 'dashboard',
    init() {
        this.checkAuth();
    },

    async api(url, method = 'GET', data = null) {
        const opts = { method, headers: {}, credentials: 'same-origin' };
        if (data && method !== 'GET') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(data);
        }
        const res = await fetch(url, opts);
        if (res.status === 401) { this.user = null; this.renderAuth(); throw new Error('Not authenticated'); }
        if (res.status === 403) {
            const body = await res.json();
            if (body.subscriptionExpired) { this.renderExpired(); throw new Error('Subscription expired'); }
            throw new Error(body.message || 'Access denied');
        }
        if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message || 'Request failed'); }
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json')) return res.json();
        return res.text();
    },

    toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    showModal(title, contentHtml) {
        this.closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
        overlay.onclick = (e) => { if (e.target === overlay) this.closeModal(); };
        const modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg-primary,#fff);border-radius:12px;max-width:700px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
        modal.innerHTML = `<div style="padding:16px 20px;border-bottom:1px solid var(--border-color,#e5e7eb);display:flex;align-items:center;justify-content:space-between"><h3 style="margin:0">${title}</h3><button onclick="App.closeModal()" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-muted,#6b7280)">&times;</button></div>${contentHtml}`;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    closeModal() {
        const existing = document.getElementById('app-modal-overlay');
        if (existing) existing.remove();
    },

    async checkAuth() {
        try {
            this.user = await this.api('/api/auth/me');
            if (this.user.role === 'client' && !this.user.hasActiveSubscription) {
                this.renderExpired();
            } else {
                this.renderApp();
            }
        } catch {
            this.user = null;
            this.renderAuth();
        }
    },

    async loginUnified(email, password) {
        this.user = await this.api('/api/auth/login', 'POST', { email, password });
        if (this.user.role === 'client' && !this.user.hasActiveSubscription) {
            this.renderExpired();
            return;
        }
        this.renderApp();
    },

    async loginOwner(username, password) {
        this.user = await this.api('/api/auth/owner/login', 'POST', { username, password });
        this.renderApp();
    },

    async loginClient(email, password) {
        this.user = await this.api('/api/auth/client/login', 'POST', { email, password });
        if (!this.user.hasActiveSubscription) { this.renderExpired(); return; }
        this.renderApp();
    },

    async registerClient(data) {
        this.user = await this.api('/api/auth/client/register', 'POST', data);
        this.renderExpired();
    },

    async logout() {
        await this.api('/api/auth/logout', 'POST');
        this.user = null;
        this.renderAuth();
    },

    get isOwner() { return this.user?.role === 'owner'; },

    renderAuth() {
        document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-box">
                <div class="auth-header">
                    <h1 data-testid="text-app-title">TradeBot Pro</h1>
                    <p>SEBI Registered Research Analyst Platform</p>
                </div>
                <div class="tabs">
                    <button class="tab active" onclick="App.switchTab('login')" data-testid="tab-login">Login</button>
                    <button class="tab" onclick="App.switchTab('register')" data-testid="tab-register">Sign Up</button>
                </div>
                <div id="tab-login" class="tab-content active">
                    <div class="card" style="border-top:none;border-radius:0 0 8px 8px">
                        <div class="card-header"><h3>Sign In</h3><p>Owner and clients use the same login</p></div>
                        <div class="card-body">
                            <form onsubmit="return App.handleLogin(event)">
                                <div class="form-group"><label>Email</label><input type="email" id="login-email" placeholder="your@email.com" required data-testid="input-email"></div>
                                <div class="form-group">
                                    <label>Password</label>
                                    <div style="position:relative">
                                        <input type="password" id="login-pass" placeholder="Enter password" required data-testid="input-password">
                                        <button type="button" onclick="App.togglePassword('login-pass', this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px" data-testid="button-toggle-password">👁</button>
                                    </div>
                                </div>
                                <button type="submit" class="btn btn-primary btn-block" data-testid="button-login">Sign In</button>
                            </form>
                        </div>
                    </div>
                </div>
                <div id="tab-register" class="tab-content">
                    <div class="card" style="border-top:none;border-radius:0 0 8px 8px">
                        <div class="card-header"><h3>Create Account</h3><p>Register as a new client</p></div>
                        <div class="card-body">
                            <form onsubmit="return App.handleRegister(event)">
                                <div class="form-group"><label>Full Name *</label><input id="reg-name" placeholder="Your name" required data-testid="input-reg-name"></div>
                                <div class="form-group"><label>Email *</label><input type="email" id="reg-email" placeholder="your@email.com" required data-testid="input-reg-email"></div>
                                <div class="form-group"><label>Phone</label><input id="reg-phone" placeholder="+91 9876543210" data-testid="input-reg-phone"></div>
                                <div class="form-group">
                                    <label>Password *</label>
                                    <div style="position:relative">
                                        <input type="password" id="reg-pass" placeholder="Choose password" required data-testid="input-reg-password">
                                        <button type="button" onclick="App.togglePassword('reg-pass', this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px">👁</button>
                                    </div>
                                </div>
                                <div class="form-group"><label>Company Name</label><input id="reg-company" placeholder="Your company" data-testid="input-reg-company"></div>
                                <div class="form-group"><label>SEBI Registration Number</label><input id="reg-sebi" placeholder="INH000XXXXXX" data-testid="input-reg-sebi"></div>
                                <button type="submit" class="btn btn-primary btn-block" data-testid="button-register">Create Account</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    },

    togglePassword(inputId, btn) {
        const input = document.getElementById(inputId);
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
        } else {
            input.type = 'password';
            btn.textContent = '👁';
        }
    },

    switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-' + tabId)?.classList.add('active');
        document.querySelectorAll('.tab').forEach(t => {
            if (t.getAttribute('onclick')?.includes(tabId)) t.classList.add('active');
        });
    },

    async handleLogin(e) {
        e.preventDefault();
        try {
            await this.loginUnified(document.getElementById('login-email').value, document.getElementById('login-pass').value);
            this.toast('Logged in successfully');
        } catch (err) { this.toast(err.message, 'error'); }
        return false;
    },

    async handleRegister(e) {
        e.preventDefault();
        try {
            await this.registerClient({
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                phone: document.getElementById('reg-phone').value,
                password: document.getElementById('reg-pass').value,
                companyName: document.getElementById('reg-company').value,
                sebiRegNumber: document.getElementById('reg-sebi').value,
            });
            this.toast('Account created! Please wait for subscription activation.');
        } catch (err) { this.toast(err.message, 'error'); }
        return false;
    },

    async renderExpired() {
        let plansHtml = '';
        try {
            const data = await this.api('/api/public/plans');
            const plans = data.plans || [];
            if (plans.length > 0) {
                plansHtml = '<div class="card mt-4"><div class="card-header"><h3>Available Plans</h3></div><div class="card-body">';
                plans.forEach(p => {
                    plansHtml += `<div class="trade-row"><div class="trade-info"><h4>${p.name}</h4><p>${p.duration_months} month${p.duration_months > 1 ? 's' : ''}</p></div>`;
                    plansHtml += `<div class="text-right"><div class="font-bold">${Number(p.totalPrice).toLocaleString('en-IN', {style:'currency',currency:'INR'})}</div>`;
                    if (p.gstEnabled) plansHtml += `<div class="text-xs text-muted">${Number(p.price).toLocaleString('en-IN', {style:'currency',currency:'INR'})} + ${p.gst_percent}% GST</div>`;
                    plansHtml += `</div></div>`;
                });
                plansHtml += '</div></div>';
            }
        } catch {}

        document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-box" style="max-width:500px">
                <div class="text-center mb-4">
                    <div style="font-size:48px">&#9888;</div>
                    <h1 style="font-size:24px;margin-top:12px" data-testid="text-expired-title">Subscription Expired</h1>
                    <p class="text-muted mt-2">Your subscription has ended. Please renew to continue using TradeBot Pro.</p>
                </div>
                ${plansHtml}
                <div class="card mt-4"><div class="card-body text-center">
                    <p class="font-medium mb-2">Contact the administrator to renew</p>
                    <p class="text-xs text-muted">Email admin for renewal</p>
                </div></div>
                <div class="text-center mt-4">
                    <button class="btn btn-secondary" onclick="App.logout()" data-testid="button-logout">Sign Out</button>
                </div>
            </div>
        </div>`;
    },

    renderApp() {
        const adminNav = this.isOwner ? `
            <div class="sidebar-section">SaaS Admin</div>
            <ul class="sidebar-nav">
                <li><a href="#" onclick="App.navigate('admin-dashboard')" data-testid="link-nav-saas-dashboard">SaaS Dashboard</a></li>
                <li><a href="#" onclick="App.navigate('admin-plans')" data-testid="link-nav-plans">Plans</a></li>
                <li><a href="#" onclick="App.navigate('admin-clients')" data-testid="link-nav-clients">Clients</a></li>
                <li><a href="#" onclick="App.navigate('admin-settings')" data-testid="link-nav-owner-settings">Owner Settings</a></li>
                <li><a href="#" onclick="App.navigate('admin-consents')" data-testid="link-nav-consents">Consent Log</a></li>
            </ul>` : '';

        document.getElementById('app').innerHTML = `
        <button class="hamburger" onclick="document.querySelector('.sidebar').classList.toggle('open')">&#9776;</button>
        <div class="app-layout">
            <aside class="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-logo">TB</div>
                    <div>
                        <div class="sidebar-title" data-testid="text-app-name">TradeBot Pro</div>
                        <div class="sidebar-subtitle">${this.isOwner ? 'Admin Panel' : (this.user?.name || 'SEBI RA Platform')}</div>
                    </div>
                </div>
                ${adminNav}
                <div class="sidebar-section">${this.isOwner ? 'Trading Tools' : 'Navigation'}</div>
                <ul class="sidebar-nav">
                    <li><a href="#" onclick="App.navigate('dashboard')" data-testid="link-nav-dashboard">Dashboard</a></li>
                    <li><a href="#" onclick="App.navigate('trades')" data-testid="link-nav-trades">Trades</a></li>
                    <li><a href="#" onclick="App.navigate('screener')" data-testid="link-nav-screener">OI Screener</a></li>
                    <li><a href="#" onclick="App.navigate('post')" data-testid="link-nav-post-to-channel">Post to Channel</a></li>
                    <li><a href="#" onclick="App.navigate('reports')" data-testid="link-nav-reports">Reports</a></li>
                    <li><a href="#" onclick="App.navigate('analytics')" data-testid="link-nav-analytics">Analytics</a></li>
                    <li><a href="#" onclick="App.navigate('settings')" data-testid="link-nav-settings">Settings</a></li>
                </ul>
                <div class="sidebar-footer">
                    <button onclick="App.logout()" data-testid="button-logout">Sign Out</button>
                    <div class="text-xs text-center mt-2" style="opacity:0.5">${this.user?.email || 'SEBI Registered RA Platform'}</div>
                </div>
            </aside>
            <div class="main-content">
                <div id="page-content"><div class="loading"><div class="spinner"></div></div></div>
            </div>
        </div>`;
        this.navigate(this.isOwner ? 'admin-dashboard' : 'dashboard');
    },

    navigate(page) {
        this.currentPage = page;
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        const activeLink = document.querySelector(`[onclick*="'${page}'"]`);
        if (activeLink) activeLink.classList.add('active');
        document.querySelector('.sidebar')?.classList.remove('open');
        this.loadPage(page);
    },

    async loadPage(page) {
        const container = document.getElementById('page-content');
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            switch (page) {
                case 'admin-dashboard': await Pages.adminDashboard(container); break;
                case 'admin-plans': await Pages.adminPlans(container); break;
                case 'admin-clients': await Pages.adminClients(container); break;
                case 'admin-settings': await Pages.adminSettings(container); break;
                case 'admin-consents': await Pages.adminConsents(container); break;
                case 'dashboard': await Pages.dashboard(container); break;
                case 'trades': await Pages.trades(container); break;
                case 'screener': await Pages.screener(container); break;
                case 'reports': await Pages.reports(container); break;
                case 'post': await Pages.post(container); break;
                case 'analytics': await Pages.analytics(container); break;
                case 'settings': await Pages.settings(container); break;
                default: container.innerHTML = '<div class="page-content"><div class="empty-state"><div class="icon">?</div><h3>Page Not Found</h3></div></div>';
            }
        } catch (err) {
            container.innerHTML = `<div class="page-content"><div class="empty-state"><div class="icon">!</div><h3>Error loading page</h3><p class="text-muted mt-2">${err.message}</p></div></div>`;
        }
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
