const Pages = {
    async adminDashboard(container) {
        const data = await App.api('/api/admin/dashboard');
        container.innerHTML = `
        <div class="page-header"><h1>SaaS Dashboard</h1><p>Business overview and metrics</p></div>
        <div class="page-content">
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon blue">&#128101;</div><div><div class="stat-value" data-testid="text-total-clients">${data.totalClients}</div><div class="stat-label">Total Clients</div></div></div>
                <div class="stat-card"><div class="stat-icon green">&#9989;</div><div><div class="stat-value" data-testid="text-active-subs">${data.activeSubscriptions}</div><div class="stat-label">Active Subscriptions</div></div></div>
                <div class="stat-card"><div class="stat-icon amber">&#9203;</div><div><div class="stat-value" data-testid="text-pending">${data.pendingPayments}</div><div class="stat-label">Pending Payments</div></div></div>
                <div class="stat-card"><div class="stat-icon purple">&#8377;</div><div><div class="stat-value" data-testid="text-revenue">${Number(data.revenueThisMonth).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})}</div><div class="stat-label">Revenue This Month</div></div></div>
            </div>
            ${data.expiringSoon.length > 0 ? `
            <div class="card mb-4"><div class="card-header"><h3>Expiring Soon (7 Days)</h3></div><div class="card-body">
                <div class="table-container"><table class="data-table"><thead><tr><th>Client</th><th>Email</th><th>End Date</th></tr></thead><tbody>
                ${data.expiringSoon.map(s => `<tr><td>${s.clientName}</td><td>${s.clientEmail}</td><td>${s.end_date}</td></tr>`).join('')}
                </tbody></table></div></div></div>` : ''}
            <div class="card"><div class="card-header"><h3>Recent Subscriptions</h3></div><div class="card-body">
                ${data.recentSubscriptions.length > 0 ? `
                <div class="table-container"><table class="data-table"><thead><tr><th>Client</th><th>Status</th><th>Amount</th><th>Start</th><th>End</th></tr></thead><tbody>
                ${data.recentSubscriptions.map(s => `<tr><td>${s.clientName}</td><td><span class="badge badge-${s.payment_status === 'confirmed' ? 'success' : s.payment_status === 'pending' ? 'warning' : 'danger'}">${s.payment_status}</span></td><td>${Number(s.total_amount).toLocaleString('en-IN',{style:'currency',currency:'INR'})}</td><td>${s.start_date}</td><td>${s.end_date}</td></tr>`).join('')}
                </tbody></table></div>` : '<div class="empty-state"><p>No subscriptions yet</p></div>'}
            </div></div>
        </div>`;
    },

    async adminPlans(container) {
        const plans = await App.api('/api/admin/plans');
        let ownerSettings;
        try { ownerSettings = await App.api('/api/admin/owner-settings'); } catch { ownerSettings = {}; }
        const gstEnabled = ownerSettings?.gst_enabled || false;

        container.innerHTML = `
        <div class="page-header flex justify-between items-center"><div><h1>Subscription Plans</h1><p>Manage pricing and plan durations</p></div>
            <button class="btn btn-primary" onclick="Pages.showPlanModal()" data-testid="button-add-plan">+ Add Plan</button>
        </div>
        <div class="page-content">
            ${plans.length > 0 ? `
            <div class="table-container"><table class="data-table"><thead><tr><th>Name</th><th>Duration</th><th>Price</th>${gstEnabled ? '<th>GST</th><th>Total</th>' : ''}<th>Status</th><th>Actions</th></tr></thead><tbody>
            ${plans.map(p => {
                const gst = gstEnabled ? (p.price * p.gst_percent / 100) : 0;
                const total = Number(p.price) + gst;
                return `<tr data-testid="row-plan-${p.id}"><td>${p.name}</td><td>${p.duration_months} month${p.duration_months > 1 ? 's' : ''}</td><td>${Number(p.price).toLocaleString('en-IN',{style:'currency',currency:'INR'})}</td>${gstEnabled ? `<td>${Number(gst).toLocaleString('en-IN',{style:'currency',currency:'INR'})} (${p.gst_percent}%)</td><td>${Number(total).toLocaleString('en-IN',{style:'currency',currency:'INR'})}</td>` : ''}<td><span class="badge badge-${p.is_active ? 'success' : 'danger'}">${p.is_active ? 'Active' : 'Inactive'}</span></td><td><button class="btn btn-sm btn-secondary" onclick="Pages.editPlan('${p.id}')">Edit</button> <button class="btn btn-sm btn-danger" onclick="Pages.deletePlan('${p.id}')">Delete</button></td></tr>`;
            }).join('')}
            </tbody></table></div>` : '<div class="empty-state"><h3>No plans yet</h3><p>Create your first subscription plan</p></div>'}
        </div>
        <div id="plan-modal"></div>`;
        this._plans = plans;
    },

    showPlanModal(plan = null) {
        document.getElementById('plan-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal"><div class="modal-header"><h3>${plan ? 'Edit Plan' : 'Add Plan'}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <div class="form-group"><label>Plan Name</label><input id="plan-name" value="${plan?.name || ''}" placeholder="e.g. Monthly Pro" data-testid="input-plan-name"></div>
                <div class="grid-2">
                    <div class="form-group"><label>Duration (months)</label><select id="plan-duration" data-testid="select-plan-duration">
                        ${[1,2,3,6,9,12].map(m => `<option value="${m}" ${plan?.duration_months == m ? 'selected' : ''}>${m} month${m > 1 ? 's' : ''}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label>Price (INR)</label><input type="number" id="plan-price" value="${plan?.price || ''}" placeholder="5000" data-testid="input-plan-price"></div>
                </div>
                <div class="form-group"><label>GST Percent</label><input type="number" id="plan-gst" value="${plan?.gst_percent ?? 18}" data-testid="input-plan-gst"></div>
                <div class="form-group"><label><input type="checkbox" id="plan-active" ${plan ? (plan.is_active ? 'checked' : '') : 'checked'}> Active</label></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages.savePlan('${plan?.id || ''}')" data-testid="button-save-plan">Save</button>
            </div></div>
        </div>`;
    },

    editPlan(id) {
        const plan = this._plans.find(p => p.id === id);
        if (plan) this.showPlanModal(plan);
    },

    async savePlan(id) {
        const data = {
            name: document.getElementById('plan-name').value,
            durationMonths: parseInt(document.getElementById('plan-duration').value),
            price: parseFloat(document.getElementById('plan-price').value),
            gstPercent: parseFloat(document.getElementById('plan-gst').value),
            isActive: document.getElementById('plan-active').checked,
        };
        try {
            if (id) { await App.api(`/api/admin/plans/${id}`, 'PATCH', data); }
            else { await App.api('/api/admin/plans', 'POST', data); }
            App.toast('Plan saved');
            App.navigate('admin-plans');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async deletePlan(id) {
        if (!confirm('Delete this plan?')) return;
        try {
            await App.api(`/api/admin/plans/${id}`, 'DELETE');
            App.toast('Plan deleted');
            App.navigate('admin-plans');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async adminClients(container) {
        const clients = await App.api('/api/admin/clients');
        container.innerHTML = `
        <div class="page-header"><h1>Client Management</h1><p>Manage client accounts and subscriptions</p></div>
        <div class="page-content">
            <div class="form-group"><input id="client-search" placeholder="Search by name, email, or phone..." oninput="Pages.filterClients()" data-testid="input-search-clients"></div>
            <div id="clients-list">
            ${clients.length > 0 ? `
            <div class="table-container"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Subscription</th><th>Actions</th></tr></thead><tbody id="clients-tbody">
            ${clients.map(c => `<tr class="client-row" data-search="${(c.name+c.email+c.phone).toLowerCase()}" data-testid="row-client-${c.id}"><td>${c.name}</td><td>${c.email}</td><td>${c.phone || '-'}</td><td><span class="badge badge-${c.is_active ? 'success' : 'danger'}">${c.is_active ? 'Active' : 'Inactive'}</span></td><td><span class="badge badge-${c.hasActiveSubscription ? 'success' : 'warning'}">${c.hasActiveSubscription ? 'Active' : 'No Active Sub'}</span></td><td>
                <button class="btn btn-sm btn-secondary" onclick="Pages.viewClient('${c.id}')">View</button>
                <button class="btn btn-sm btn-${c.is_active ? 'danger' : 'success'}" onclick="Pages.toggleClient('${c.id}', ${!c.is_active})">${c.is_active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn btn-sm btn-secondary" onclick="Pages.resetClientPassword('${c.id}', '${c.name}')">Reset Pwd</button>
                <button class="btn btn-sm btn-danger" onclick="Pages.deleteClient('${c.id}', '${c.name}')">Delete</button>
            </td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty-state"><h3>No clients yet</h3></div>'}
            </div>
        </div>
        <div id="client-modal"></div>`;
        this._clients = clients;
    },

    filterClients() {
        const q = document.getElementById('client-search').value.toLowerCase();
        document.querySelectorAll('.client-row').forEach(row => {
            row.style.display = row.dataset.search.includes(q) ? '' : 'none';
        });
    },

    async toggleClient(id, active) {
        try {
            await App.api(`/api/admin/clients/${id}`, 'PATCH', { isActive: active });
            App.toast(active ? 'Client activated' : 'Client deactivated');
            App.navigate('admin-clients');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async deleteClient(id, name) {
        if (!confirm(`Delete client "${name}" and ALL their data (trades, reports, subscriptions)? This cannot be undone.`)) return;
        try {
            await App.api(`/api/admin/clients/${id}`, 'DELETE');
            App.toast('Client deleted');
            App.navigate('admin-clients');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    resetClientPassword(id, name) {
        document.getElementById('client-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal"><div class="modal-header"><h3>Reset Password for ${name}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <div class="form-group">
                    <label>New Password</label>
                    <div style="position:relative">
                        <input type="password" id="reset-pwd-input" placeholder="Min 6 characters" data-testid="input-reset-password">
                        <button type="button" onclick="App.togglePassword('reset-pwd-input', this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px">&#128065;</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages.doResetPassword('${id}')" data-testid="button-confirm-reset">Reset Password</button>
            </div></div>
        </div>`;
    },

    async doResetPassword(id) {
        const pwd = document.getElementById('reset-pwd-input').value;
        if (!pwd || pwd.length < 6) { App.toast('Password must be at least 6 characters', 'error'); return; }
        try {
            await App.api(`/api/admin/clients/${id}/reset-password`, 'POST', { newPassword: pwd });
            App.toast('Password reset successfully');
            document.querySelector('.modal-overlay')?.remove();
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async viewClient(id) {
        const client = await App.api(`/api/admin/clients/${id}`);
        const plans = await App.api('/api/admin/plans');
        document.getElementById('client-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal" style="max-width:600px"><div class="modal-header"><h3>${client.name}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <table class="data-table"><tr><td class="font-bold">Email</td><td>${client.email}</td></tr><tr><td class="font-bold">Phone</td><td>${client.phone || '-'}</td></tr><tr><td class="font-bold">Company</td><td>${client.company_name || '-'}</td></tr><tr><td class="font-bold">SEBI Reg</td><td>${client.sebi_reg_number || '-'}</td></tr></table>
                <h4 class="mt-4 mb-3">Add Subscription</h4>
                <div class="grid-2">
                    <div class="form-group"><label>Plan</label><select id="sub-plan" data-testid="select-sub-plan">
                        ${plans.filter(p => p.is_active).map(p => `<option value="${p.id}">${p.name} - ${Number(p.price).toLocaleString('en-IN',{style:'currency',currency:'INR'})} / ${p.duration_months}mo</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label>Payment Note</label><input id="sub-note" placeholder="UPI/Bank ref" data-testid="input-sub-note"></div>
                </div>
                <button class="btn btn-primary" onclick="Pages.addSubscription('${id}')" data-testid="button-add-sub">Add Subscription</button>
                <h4 class="mt-4 mb-3">Subscription History</h4>
                ${(client.subscriptions || []).length > 0 ? `
                <div class="table-container"><table class="data-table"><thead><tr><th>Period</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
                ${client.subscriptions.map(s => `<tr><td>${s.start_date} to ${s.end_date}</td><td>${Number(s.total_amount).toLocaleString('en-IN',{style:'currency',currency:'INR'})}</td><td><span class="badge badge-${s.payment_status === 'confirmed' ? 'success' : 'warning'}">${s.payment_status}</span></td><td>${s.payment_status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="Pages.confirmPayment('${s.id}')">Confirm</button>` : '-'}</td></tr>`).join('')}
                </tbody></table></div>` : '<p class="text-muted">No subscriptions</p>'}
            </div></div>
        </div>`;
    },

    async addSubscription(clientId) {
        const planId = document.getElementById('sub-plan').value;
        const note = document.getElementById('sub-note').value;
        try {
            await App.api('/api/admin/subscriptions', 'POST', { clientId, planId, paymentNote: note });
            App.toast('Subscription created');
            this.viewClient(clientId);
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async confirmPayment(subId) {
        try {
            await App.api(`/api/admin/subscriptions/${subId}`, 'PATCH', { paymentStatus: 'confirmed' });
            App.toast('Payment confirmed');
            App.navigate('admin-clients');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async adminSettings(container) {
        let settings;
        try { settings = await App.api('/api/admin/owner-settings'); } catch { settings = {}; }
        const webhookUrl = window.location.origin + '/api/webhook';
        container.innerHTML = `
        <div class="page-header"><h1>Owner Settings</h1><p>Business, GST and webhook configuration</p></div>
        <div class="page-content">
            <div class="card"><div class="card-body">
                <h3 style="margin-bottom:12px">Business Details</h3>
                <div class="form-group"><label>Business Name</label><input id="os-biz" value="${settings.business_name || ''}" placeholder="Your Business Name" data-testid="input-business-name"></div>
                <div class="form-group"><label>Owner Email</label><input type="email" id="os-email" value="${settings.owner_email || ''}" placeholder="owner@email.com" data-testid="input-owner-email"></div>
                <div class="form-group"><label>Owner Phone</label><input id="os-phone" value="${settings.owner_phone || ''}" placeholder="+91 9876543210" data-testid="input-owner-phone"></div>
                <hr style="margin:16px 0">
                <h3 style="margin-bottom:12px">GST Settings</h3>
                <div class="form-group"><label>GST Active</label>
                    <label class="switch"><input type="checkbox" id="os-gst" ${settings.gst_enabled ? 'checked' : ''} data-testid="toggle-gst"><span class="slider"></span></label>
                </div>
                <div class="form-group"><label>GST Number</label><input id="os-gst-num" value="${settings.gst_number || ''}" placeholder="22AAAAA0000A1Z5" data-testid="input-gst-number"></div>
                <hr style="margin:16px 0">
                <h3 style="margin-bottom:12px">Payment Webhook Settings</h3>
                <div class="form-group"><label>Webhook Auto-Confirm</label>
                    <label class="switch"><input type="checkbox" id="os-webhook" ${settings.webhook_enabled ? 'checked' : ''} data-testid="toggle-webhook"><span class="slider"></span></label>
                    <small style="display:block;margin-top:4px;color:#666">When enabled, payments from Razorpay/Stripe will auto-confirm subscriptions</small>
                </div>
                <div id="webhook-fields" style="display:${settings.webhook_enabled ? 'block' : 'none'}">
                    <div class="form-group"><label>Payment Provider</label>
                        <select id="os-provider" data-testid="select-provider">
                            <option value="razorpay" ${(settings.webhook_provider || 'razorpay') === 'razorpay' ? 'selected' : ''}>Razorpay</option>
                            <option value="stripe" ${settings.webhook_provider === 'stripe' ? 'selected' : ''}>Stripe</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Webhook URL (copy to gateway dashboard)</label>
                        <div style="display:flex;gap:8px"><input readonly value="${webhookUrl}" style="font-family:monospace;font-size:12px;background:#f5f5f5" data-testid="input-webhook-url">
                        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${webhookUrl}');App.toast('URL copied!')" data-testid="button-copy-url">Copy</button></div>
                    </div>
                    <div class="form-group"><label>Webhook Secret</label><input type="password" id="os-webhook-secret" value="${settings.webhook_secret || ''}" placeholder="whsec_..." data-testid="input-webhook-secret"></div>
                    <div id="razorpay-keys" style="display:${(settings.webhook_provider || 'razorpay') === 'razorpay' ? 'block' : 'none'}">
                        <div class="form-group"><label>Razorpay Key ID</label><input id="os-rzp-key" value="${settings.razorpay_key_id || ''}" placeholder="rzp_live_..." data-testid="input-razorpay-key"></div>
                        <div class="form-group"><label>Razorpay Key Secret</label><input type="password" id="os-rzp-secret" value="${settings.razorpay_key_secret || ''}" placeholder="Key Secret" data-testid="input-razorpay-secret"></div>
                    </div>
                    <div style="background:#e3f2fd;border:1px solid #90caf9;padding:12px;border-radius:6px;margin-top:8px">
                        <strong style="font-size:13px">Setup Instructions:</strong>
                        <ol style="font-size:12px;margin:8px 0 0 16px;line-height:1.6" id="webhook-instructions"></ol>
                    </div>
                </div>
                <hr style="margin:16px 0">
                <button class="btn btn-primary" onclick="Pages.saveOwnerSettings()" data-testid="button-save-owner-settings">Save Settings</button>
            </div></div>
        </div>`;
        document.getElementById('os-webhook').addEventListener('change', function() {
            document.getElementById('webhook-fields').style.display = this.checked ? 'block' : 'none';
        });
        document.getElementById('os-provider')?.addEventListener('change', function() {
            document.getElementById('razorpay-keys').style.display = this.value === 'razorpay' ? 'block' : 'none';
            Pages.updateWebhookInstructions();
        });
        Pages.updateWebhookInstructions();
    },

    updateWebhookInstructions() {
        const el = document.getElementById('webhook-instructions');
        if (!el) return;
        const provider = document.getElementById('os-provider')?.value || 'razorpay';
        if (provider === 'razorpay') {
            el.innerHTML = '<li>Go to Razorpay Dashboard → Settings → Webhooks</li><li>Click "Add New Webhook"</li><li>Paste the Webhook URL above</li><li>Select events: <b>payment.captured</b> and <b>order.paid</b></li><li>Set a secret and paste the same secret here</li><li>In payment notes, include <b>email</b> (client email) and <b>plan_id</b></li>';
        } else {
            el.innerHTML = '<li>Go to Stripe Dashboard → Developers → Webhooks</li><li>Click "Add endpoint"</li><li>Paste the Webhook URL above</li><li>Select events: <b>checkout.session.completed</b> and <b>payment_intent.succeeded</b></li><li>Copy the signing secret and paste it here</li><li>Include <b>email</b> and <b>plan_id</b> in payment metadata</li>';
        }
    },

    async saveOwnerSettings() {
        try {
            await App.api('/api/admin/owner-settings', 'POST', {
                gstEnabled: document.getElementById('os-gst').checked,
                gstNumber: document.getElementById('os-gst-num').value,
                businessName: document.getElementById('os-biz').value,
                ownerEmail: document.getElementById('os-email').value,
                ownerPhone: document.getElementById('os-phone').value,
                webhookEnabled: document.getElementById('os-webhook').checked,
                webhookProvider: document.getElementById('os-provider')?.value || 'razorpay',
                webhookSecret: document.getElementById('os-webhook-secret')?.value || '',
                razorpayKeyId: document.getElementById('os-rzp-key')?.value || '',
                razorpayKeySecret: document.getElementById('os-rzp-secret')?.value || '',
            });
            App.toast('Settings saved');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async adminConsents(container) {
        let consents = [];
        try { consents = await App.api('/api/admin/consents'); } catch {}
        container.innerHTML = `
        <div class="page-header flex justify-between items-center"><div><h1>Consent Log</h1><p>Report download consent records</p></div>
            <div class="flex gap-2">
                <button class="btn btn-secondary" onclick="Pages.exportConsents()" data-testid="button-export-csv">Export CSV</button>
                <button class="btn btn-danger" onclick="Pages.deleteOldConsents()" data-testid="button-delete-old">Delete Old</button>
            </div>
        </div>
        <div class="page-content">
            <div class="form-group"><input id="consent-search" placeholder="Search consents..." oninput="Pages.filterConsents()" data-testid="input-search-consents"></div>
            ${consents.length > 0 ? `
            <div class="table-container"><table class="data-table"><thead><tr><th>Date</th><th>Client</th><th>Email</th><th>Report</th><th>Format</th><th>IP</th></tr></thead><tbody id="consents-tbody">
            ${consents.map(c => `<tr class="consent-row" data-search="${(c.client_name+c.client_email+c.report_title).toLowerCase()}"><td>${new Date(c.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</td><td>${c.client_name}</td><td>${c.client_email}</td><td>${c.report_title || c.report_id}</td><td><span class="badge badge-secondary">${c.download_format}</span></td><td>${c.ip_address}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty-state"><h3>No consent records</h3></div>'}
        </div>`;
    },

    filterConsents() {
        const q = document.getElementById('consent-search').value.toLowerCase();
        document.querySelectorAll('.consent-row').forEach(row => {
            row.style.display = row.dataset.search.includes(q) ? '' : 'none';
        });
    },

    exportConsents() {
        window.open('/api/admin/consents/export-csv', '_blank');
    },

    async deleteOldConsents() {
        const date = prompt('Delete consent records before which date? (YYYY-MM-DD)');
        if (!date) return;
        try {
            const result = await App.api(`/api/admin/consents/before/${date}`, 'DELETE');
            App.toast(result.message);
            App.navigate('admin-consents');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async dashboard(container) {
        const today = new Date().toISOString().split('T')[0];
        let trades = [];
        try { trades = await App.api(`/api/trades?date=${today}`); } catch {}
        const totalTrades = trades.length;
        const profitTrades = trades.filter(t => (t.profit_loss_amount || 0) > 0).length;
        const lossTrades = trades.filter(t => (t.profit_loss_amount || 0) < 0).length;
        const totalPL = trades.reduce((sum, t) => sum + (Number(t.profit_loss_amount) || 0), 0);

        let expiryBanner = '';
        if (App.role === 'client') {
            try {
                const subInfo = await App.api('/api/client/subscription');
                if (subInfo.expiryWarning && subInfo.daysRemaining !== null) {
                    const msg = subInfo.daysRemaining === 0 ? 'Your subscription expires today!'
                        : subInfo.daysRemaining === 1 ? 'Your subscription expires tomorrow!'
                        : `Your subscription expires in ${subInfo.daysRemaining} days!`;
                    expiryBanner = `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px" data-testid="banner-expiry-warning">
                        <span style="font-size:24px">⚠️</span>
                        <div><strong style="color:#856404">${msg}</strong><br><small style="color:#856404">Please renew your subscription to avoid service interruption.${subInfo.activeSubscription?.end_date ? ' Expiry: ' + subInfo.activeSubscription.end_date : ''}</small></div>
                    </div>`;
                }
            } catch {}
        }

        container.innerHTML = `
        <div class="page-header"><h1>Dashboard</h1><p>Today's trading overview - ${today}</p></div>
        <div class="page-content">
            ${expiryBanner}
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon blue">T</div><div><div class="stat-value">${totalTrades}</div><div class="stat-label">Total Trades</div></div></div>
                <div class="stat-card"><div class="stat-icon green">P</div><div><div class="stat-value">${profitTrades}</div><div class="stat-label">Profit Trades</div></div></div>
                <div class="stat-card"><div class="stat-icon amber">L</div><div><div class="stat-value">${lossTrades}</div><div class="stat-label">Loss Trades</div></div></div>
                <div class="stat-card"><div class="stat-icon ${totalPL >= 0 ? 'green' : 'amber'}">${totalPL >= 0 ? '+' : '-'}</div><div><div class="stat-value">${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}</div><div class="stat-label">Total P/L</div></div></div>
            </div>
            <div class="card"><div class="card-header"><h3>Today's Trades</h3></div><div class="card-body">
                ${trades.length > 0 ? trades.map(t => `
                <div class="trade-row"><div class="trade-info"><h4>${t.stock_name} ${t.strike_price || ''} ${t.option_type || ''}</h4><p>${t.segment} | ${t.trade_type} | Lot: ${t.lot_size}</p></div>
                <div class="text-right"><div class="font-bold ${(t.profit_loss_amount || 0) >= 0 ? '' : 'text-danger'}">${t.profit_loss_amount != null ? (t.profit_loss_amount >= 0 ? '+' : '') + Number(t.profit_loss_amount).toFixed(2) + '/-' : 'Open'}</div><div class="text-xs text-muted">Entry: ${t.entry_price}${t.exit_price ? ' | Exit: ' + t.exit_price : ''}</div></div></div>
                `).join('') : '<div class="empty-state"><p>No trades for today</p></div>'}
            </div></div>
        </div>`;
    },

    async trades(container) {
        const today = new Date().toISOString().split('T')[0];
        let groups = [];
        try { groups = await App.api('/api/channel-groups'); } catch {}
        container.innerHTML = `
        <div class="page-header flex justify-between items-center"><div><h1>Trade Management</h1><p>Add, edit, and manage trades</p></div>
            <div class="flex gap-2">
                <input type="date" id="trade-date" value="${today}" onchange="Pages.loadTrades()" data-testid="input-trade-date">
                <button class="btn btn-success" onclick="Pages.fetchTradesFromTelegram()" data-testid="button-fetch-telegram">Fetch from Telegram</button>
                <button class="btn btn-primary" onclick="Pages.showTradeModal()" data-testid="button-add-trade">+ Add Trade</button>
            </div>
        </div>
        <div id="fetch-telegram-result" class="page-content" style="display:none"></div>
        <div class="page-content" id="trades-list"><div class="loading"><div class="spinner"></div></div></div>
        <div id="trade-modal"></div>`;
        this._channelGroups = groups;
        this.loadTrades();
    },

    async fetchTradesFromTelegram() {
        const date = document.getElementById('trade-date')?.value;
        const resultEl = document.getElementById('fetch-telegram-result');
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<div class="loading"><div class="spinner"></div> Fetching trades from Telegram...</div>';
        try {
            const result = await App.api('/api/telegram/fetch-trades', 'POST', { date });
            resultEl.innerHTML = `<div class="card"><div class="card-body"><p class="text-success">${result.message || 'Trades fetched successfully'}</p></div></div>`;
            this.loadTrades();
            setTimeout(() => { resultEl.style.display = 'none'; }, 3000);
        } catch (err) {
            resultEl.innerHTML = `<div class="card"><div class="card-body"><p class="text-danger">${err.message}</p></div></div>`;
        }
    },

    async loadTrades() {
        const date = document.getElementById('trade-date')?.value;
        const listEl = document.getElementById('trades-list');
        try {
            const trades = await App.api(`/api/trades${date ? '?date=' + date : ''}`);
            if (trades.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><h3>No trades found</h3><p>Add a trade or change the date</p></div>';
                return;
            }
            listEl.innerHTML = `<div class="table-container"><table class="data-table"><thead><tr><th>Stock</th><th>Type</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            ${trades.map(t => `<tr data-testid="row-trade-${t.id}"><td><strong>${t.stock_name}</strong> ${t.strike_price || ''} ${t.option_type || ''}</td><td>${t.segment}</td><td>${t.entry_price}</td><td>${t.exit_price || '-'}</td><td class="${(t.profit_loss_amount || 0) >= 0 ? '' : 'text-danger'}">${t.profit_loss_amount != null ? Number(t.profit_loss_amount).toFixed(2) : '-'}</td><td><span class="badge badge-${t.status === 'closed' ? 'success' : 'warning'}">${t.status}</span></td><td>
                <button class="btn btn-sm btn-secondary" onclick="Pages.editTrade('${t.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="Pages.deleteTrade('${t.id}')">Del</button>
            </td></tr>`).join('')}
            </tbody></table></div>`;
            this._trades = trades;
        } catch (err) { listEl.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`; }
    },

    showTradeModal(trade = null) {
        const date = document.getElementById('trade-date')?.value || new Date().toISOString().split('T')[0];
        document.getElementById('trade-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal" style="max-width:600px"><div class="modal-header"><h3>${trade ? 'Edit Trade' : 'Add Trade'}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <div class="grid-2">
                    <div class="form-group"><label>Stock Name *</label><input id="t-stock" value="${trade?.stock_name || ''}" placeholder="NIFTY" data-testid="input-stock-name"></div>
                    <div class="form-group"><label>Trade Date</label><input type="date" id="t-date" value="${trade?.trade_date || date}" data-testid="input-trade-date-modal"></div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Strike Price</label><input type="number" id="t-strike" value="${trade?.strike_price || ''}" placeholder="22500" data-testid="input-strike"></div>
                    <div class="form-group"><label>Option Type</label><select id="t-option" data-testid="select-option"><option value="">None</option><option value="CE" ${trade?.option_type === 'CE' ? 'selected' : ''}>CE</option><option value="PE" ${trade?.option_type === 'PE' ? 'selected' : ''}>PE</option></select></div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Entry Price *</label><input type="number" step="0.01" id="t-entry" value="${trade?.entry_price || ''}" data-testid="input-entry"></div>
                    <div class="form-group"><label>Exit Price</label><input type="number" step="0.01" id="t-exit" value="${trade?.exit_price || ''}" data-testid="input-exit"></div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Stop Loss</label><input type="number" step="0.01" id="t-sl" value="${trade?.stop_loss || ''}" data-testid="input-sl"></div>
                    <div class="form-group"><label>Lot Size</label><input type="number" id="t-lot" value="${trade?.lot_size || 1}" data-testid="input-lot"></div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Segment</label><select id="t-segment" data-testid="select-segment"><option value="STOCK OPTION" ${trade?.segment === 'STOCK OPTION' ? 'selected' : ''}>Stock Option</option><option value="INDEX OPTION" ${trade?.segment === 'INDEX OPTION' ? 'selected' : ''}>Index Option</option><option value="EQUITY" ${trade?.segment === 'EQUITY' ? 'selected' : ''}>Equity</option></select></div>
                    <div class="form-group"><label>Trade Type</label><select id="t-type" data-testid="select-type"><option value="INTRADAY" ${trade?.trade_type === 'INTRADAY' ? 'selected' : ''}>Intraday</option><option value="POSITIONAL" ${trade?.trade_type === 'POSITIONAL' ? 'selected' : ''}>Positional</option><option value="BTST" ${trade?.trade_type === 'BTST' ? 'selected' : ''}>BTST</option></select></div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Status</label><select id="t-status" data-testid="select-status"><option value="active" ${trade?.status === 'active' ? 'selected' : ''}>Active</option><option value="closed" ${trade?.status === 'closed' ? 'selected' : ''}>Closed</option></select></div>
                    <div class="form-group"><label>P/L Amount</label><input type="number" step="0.01" id="t-pla" value="${trade?.profit_loss_amount || ''}" data-testid="input-pla"></div>
                </div>
                <div class="form-group"><label>Strategy</label><input id="t-strategy" value="${trade?.strategy || ''}" placeholder="Technical Analysis" data-testid="input-strategy"></div>
                <div class="form-group"><label>Rationale</label><textarea id="t-rationale" rows="3" placeholder="Trade rationale..." data-testid="input-rationale">${trade?.rationale || ''}</textarea></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages.saveTrade('${trade?.id || ''}')" data-testid="button-save-trade">Save</button>
            </div></div>
        </div>`;
    },

    async editTrade(id) {
        const trade = this._trades?.find(t => t.id === id);
        if (trade) this.showTradeModal(trade);
    },

    async saveTrade(id) {
        const data = {
            stockName: document.getElementById('t-stock').value,
            tradeDate: document.getElementById('t-date').value,
            strikePrice: parseFloat(document.getElementById('t-strike').value) || null,
            optionType: document.getElementById('t-option').value,
            entryPrice: parseFloat(document.getElementById('t-entry').value),
            exitPrice: parseFloat(document.getElementById('t-exit').value) || null,
            stopLoss: parseFloat(document.getElementById('t-sl').value) || null,
            lotSize: parseInt(document.getElementById('t-lot').value) || 1,
            segment: document.getElementById('t-segment').value,
            tradeType: document.getElementById('t-type').value,
            status: document.getElementById('t-status').value,
            profitLossAmount: parseFloat(document.getElementById('t-pla').value) || null,
            strategy: document.getElementById('t-strategy').value,
            rationale: document.getElementById('t-rationale').value,
        };
        try {
            if (id) { await App.api(`/api/trades/${id}`, 'PATCH', data); }
            else { await App.api('/api/trades', 'POST', data); }
            App.toast('Trade saved');
            document.querySelector('.modal-overlay')?.remove();
            this.loadTrades();
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async deleteTrade(id) {
        if (!confirm('Delete this trade?')) return;
        try {
            await App.api(`/api/trades/${id}`, 'DELETE');
            App.toast('Trade deleted');
            this.loadTrades();
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async reports(container) {
        const today = new Date().toISOString().split('T')[0];
        container.innerHTML = `
        <div class="page-header flex justify-between items-center"><div><h1>Reports</h1><p>Generate and download SEBI-compliant reports</p></div>
            <div class="flex gap-2">
                <input type="date" id="report-date" value="${today}" data-testid="input-report-date">
                <button class="btn btn-primary" onclick="Pages.generateReports()" data-testid="button-generate-reports">Generate Reports</button>
            </div>
        </div>
        <div class="page-content" id="reports-list"><div class="loading"><div class="spinner"></div></div></div>
        <div id="consent-modal"></div>`;
        this.loadReports(today);
    },

    async loadReports(date) {
        const listEl = document.getElementById('reports-list');
        try {
            const reports = await App.api(`/api/reports?date=${date}`);
            if (reports.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><h3>No reports for this date</h3><p>Generate reports from trades first</p></div>';
                return;
            }

            let groups = {};
            reports.forEach(r => {
                const groupName = r.content?.channelGroup || 'General';
                if (!groups[groupName]) groups[groupName] = [];
                groups[groupName].push(r);
            });

            let html = '';
            Object.keys(groups).forEach(groupName => {
                html += `<div class="group-header">${groupName}</div>`;
                groups[groupName].forEach(r => {
                    const stockName = `${r.content?.stockName || 'Unknown'} ${r.content?.strikePrice || ''} ${r.content?.optionType || ''}`.trim();
                    html += `<div class="report-card" data-testid="card-report-${r.id}">
                        <div class="flex items-center"><div class="report-icon">R</div><div><h4 style="font-size:14px;margin-bottom:2px">${stockName}</h4><p class="text-xs text-muted">${r.trade_date} | ${r.content?.segment || ''} | ${r.content?.tradeType || ''}</p></div></div>
                        <div class="flex gap-2">
                            <button class="btn btn-sm btn-primary" onclick="Pages.showFormatPicker('${r.id}', '${stockName.replace(/'/g, '')}')" data-testid="button-download-${r.id}">Download</button>
                        </div>
                    </div>`;
                });
            });
            listEl.innerHTML = html;
        } catch (err) { listEl.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`; }
    },

    async generateReports() {
        const date = document.getElementById('report-date').value;
        try {
            const result = await App.api('/api/reports/generate', 'POST', { date });
            App.toast(`Generated ${result.length} report(s)`);
            this.loadReports(date);
        } catch (err) { App.toast(err.message, 'error'); }
    },

    showFormatPicker(reportId, title) {
        document.getElementById('consent-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal" style="max-width:380px"><div class="modal-header"><h3>Choose Download Format</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <p style="font-size:13px;color:#64748b;margin-bottom:12px">Select which format you want to download:</p>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer" id="fmt-pdf-label" data-testid="option-format-pdf">
                        <input type="radio" name="dl-format" value="pdf" checked onchange="Pages._updateFormatPicker()"> <div><span style="font-size:13px;font-weight:500">PDF Only</span><br><span style="font-size:11px;color:#94a3b8">Download as PDF document</span></div>
                    </label>
                    <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer" id="fmt-word-label" data-testid="option-format-word">
                        <input type="radio" name="dl-format" value="word" onchange="Pages._updateFormatPicker()"> <div><span style="font-size:13px;font-weight:500">Word Only</span><br><span style="font-size:11px;color:#94a3b8">Download as Word (.doc) document</span></div>
                    </label>
                    <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer" id="fmt-both-label" data-testid="option-format-both">
                        <input type="radio" name="dl-format" value="both" onchange="Pages._updateFormatPicker()"> <div><span style="font-size:13px;font-weight:500">Both (PDF + Word)</span><br><span style="font-size:11px;color:#94a3b8">Download in both formats</span></div>
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages._confirmFormatAndProceed('${reportId}', '${title}')" data-testid="button-continue-download">Continue</button>
            </div></div>
        </div>`;
        this._updateFormatPicker();
    },

    _updateFormatPicker() {
        const selected = document.querySelector('input[name="dl-format"]:checked')?.value || 'pdf';
        ['pdf','word','both'].forEach(v => {
            const label = document.getElementById('fmt-'+v+'-label');
            if (label) label.style.borderColor = (v === selected) ? '#3b82f6' : '#e2e8f0';
            if (label) label.style.background = (v === selected) ? '#eff6ff' : 'transparent';
        });
    },

    _confirmFormatAndProceed(reportId, title) {
        const format = document.querySelector('input[name="dl-format"]:checked')?.value || 'pdf';
        document.querySelector('.modal-overlay')?.remove();
        this.downloadReport(reportId, format, title);
    },

    downloadReport(reportId, format, title) {
        if (App.isOwner) {
            this.showOwnerDownloadConfirm(reportId, format, title);
        } else {
            this.showClientConsentDialog(reportId, format, title);
        }
    },

    showOwnerDownloadConfirm(reportId, format, title) {
        document.getElementById('consent-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal"><div class="modal-header"><h3>Confirm Download</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <p style="color:#dc2626;font-weight:600;margin-bottom:12px">After download, all uploaded chart images for this report will be permanently deleted from the server. This cannot be undone.</p>
                <p class="font-medium mb-2">Before downloading, please verify:</p>
                <ul style="font-size:13px;color:#64748b;list-style:disc;padding-left:20px;margin-bottom:16px">
                    <li>Trade details, entry/exit prices, and P&L calculations</li>
                    <li>Chart screenshots are properly attached and readable</li>
                    <li>Analyst details and SEBI registration number</li>
                    <li>Strategy and rationale text accuracy</li>
                </ul>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages.executeDownload('${reportId}', '${format}', '${title}')" data-testid="button-confirm-download">Confirm & Download ${format === 'both' ? 'PDF + Word' : format.toUpperCase()}</button>
            </div></div>
        </div>`;
    },

    showClientConsentDialog(reportId, format, title) {
        const disclaimerText = `SEBI Registered Research Analyst Disclaimer:
1. This report is prepared by a SEBI Registered Research Analyst.
2. Registration does not guarantee quality of research or returns.
3. Past performance is not indicative of future results.
4. Investment in securities market is subject to market risks.
5. The analyst may have positions in the securities recommended.
6. This report is for educational purposes only and not investment advice.
7. Investors should do their own due diligence before making investment decisions.
8. The analyst and the platform are not liable for any losses incurred.
9. By downloading, you confirm you have read and agree to all terms.`;

        document.getElementById('consent-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal" style="max-width:600px"><div class="modal-header"><h3>Legal Disclaimer & Consent</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <p style="color:#dc2626;font-weight:600;margin-bottom:12px">After download, all uploaded chart images for this report will be permanently deleted from the server.</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;font-size:12px;max-height:200px;overflow-y:auto;margin-bottom:16px;white-space:pre-line">${disclaimerText}</div>
                <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px"><input type="checkbox" id="consent-check" data-testid="checkbox-consent"> I have read, understood, and agree to the above disclaimer. I acknowledge this download will be logged for SEBI compliance.</label>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" id="consent-download-btn" onclick="Pages.submitConsent('${reportId}', '${format}', '${title}')" disabled data-testid="button-consent-download">Accept & Download ${format === 'both' ? 'PDF + Word' : format.toUpperCase()}</button>
            </div></div>
        </div>`;
        document.getElementById('consent-check').addEventListener('change', function() {
            document.getElementById('consent-download-btn').disabled = !this.checked;
        });
    },

    async submitConsent(reportId, format, title) {
        const disclaimerText = document.querySelector('#consent-modal .modal-body div[style*="background"]')?.textContent || '';
        try {
            await App.api('/api/report-consent', 'POST', {
                reportId, reportTitle: title, downloadFormat: format, disclaimerText,
            });
            this.executeDownload(reportId, format, title);
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async executeDownload(reportId, format, title) {
        document.querySelector('.modal-overlay')?.remove();
        if (format === 'pdf' || format === 'both') {
            window.open(`/api/reports/${reportId}/download-pdf`, '_blank');
        }
        if (format === 'word' || format === 'both') {
            setTimeout(() => {
                window.open(`/api/reports/${reportId}/download-word`, '_blank');
            }, format === 'both' ? 500 : 0);
        }
        setTimeout(async () => {
            try {
                await App.api(`/api/reports/${reportId}/cleanup`, 'POST');
                App.toast('Report downloaded. Chart images cleaned up.');
            } catch {}
        }, format === 'both' ? 3000 : 2000);
    },

    async post(container) {
        const today = new Date().toISOString().split('T')[0];
        let groups = [];
        try { groups = await App.api('/api/channel-groups'); } catch {}

        container.innerHTML = `
        <div class="page-header"><h1>Post to Channel</h1><p>Post trade summaries to Telegram channels</p></div>
        <div class="page-content">
            <div class="card mb-4"><div class="card-header"><h3>Fetch Trades from Telegram</h3></div><div class="card-body">
                <div class="grid-2">
                    <div class="form-group"><label>Date</label><input type="date" id="fetch-date" value="${today}" data-testid="input-fetch-date"></div>
                    <div class="form-group"><label>Channel Group</label><select id="fetch-group" data-testid="select-fetch-group">
                        <option value="">All Groups</option>
                        ${groups.map(g => `<option value="${g.id}">${g.name} (${g.segment})</option>`).join('')}
                    </select></div>
                </div>
                <button class="btn btn-primary" onclick="Pages.fetchTrades()" data-testid="button-fetch-trades">Fetch Trades</button>
                <div id="fetch-result" class="mt-3"></div>
            </div></div>
            <div class="card"><div class="card-header"><h3>Post Summary</h3></div><div class="card-body">
                <div id="post-trades-list"><p class="text-muted">Fetch trades first, then select and post</p></div>
            </div></div>
        </div>`;
    },

    async fetchTrades() {
        const date = document.getElementById('fetch-date').value;
        const groupId = document.getElementById('fetch-group').value;
        try {
            const result = await App.api('/api/telegram/fetch-trades', 'POST', { date, channelGroupId: groupId || undefined });
            document.getElementById('fetch-result').innerHTML = `<p class="text-sm">${result.count} trade(s) fetched</p>`;
            App.toast(`Fetched ${result.count} trades`);

            const trades = await App.api(`/api/trades?date=${date}`);
            const postList = document.getElementById('post-trades-list');
            if (trades.length === 0) { postList.innerHTML = '<p class="text-muted">No trades to post</p>'; return; }

            let groupedTrades = {};
            trades.forEach(t => {
                const gId = t.channel_group_id || 'none';
                if (!groupedTrades[gId]) groupedTrades[gId] = [];
                groupedTrades[gId].push(t);
            });

            let html = '';
            Object.keys(groupedTrades).forEach(gId => {
                const groupTrades = groupedTrades[gId];
                const groupName = gId !== 'none' ? (groupTrades[0]?.channelGroupName || gId) : 'Ungrouped';
                html += `<div class="group-header">${groupName}</div>`;
                groupTrades.forEach(t => {
                    html += `<div class="trade-row"><label style="display:flex;align-items:center;gap:8px;flex:1"><input type="checkbox" class="post-trade-cb" value="${t.id}" ${t.is_posted ? 'disabled' : 'checked'}> <div><strong>${t.stock_name} ${t.strike_price || ''} ${t.option_type || ''}</strong><br><span class="text-xs text-muted">P/L: ${t.profit_loss_amount != null ? t.profit_loss_amount : 'N/A'} | ${t.is_posted ? 'Posted' : 'Not posted'}</span></div></label></div>`;
                });
            });
            html += `<div class="mt-3" style="display:flex;gap:8px">`;
            html += `<button class="btn btn-secondary" onclick="Pages.previewSummary('${date}')" data-testid="button-preview-post">Preview</button>`;
            html += `<button class="btn btn-primary" onclick="Pages.postSummary('${date}')" data-testid="button-post-summary">Post Summary</button>`;
            html += `</div>`;
            postList.innerHTML = html;
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async previewSummary(date) {
        const tradeIds = [...document.querySelectorAll('.post-trade-cb:checked')].map(cb => cb.value);
        const groupId = document.getElementById('fetch-group').value;
        if (tradeIds.length === 0) { App.toast('Select at least one trade', 'error'); return; }
        try {
            const data = await App.api('/api/telegram/preview-summary', 'POST', { date, tradeIds, channelGroupId: groupId || undefined });
            let html = `<div style="padding:16px">`;
            html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">`;
            html += `<div class="stat-card" style="text-align:center"><div class="stat-value">${data.tradeCount}</div><div class="stat-label">Trades</div></div>`;
            html += `<div class="stat-card" style="text-align:center"><div class="stat-value" style="color:var(--success)">${data.profitCount}</div><div class="stat-label">Profit</div></div>`;
            html += `<div class="stat-card" style="text-align:center"><div class="stat-value" style="color:var(--danger)">${data.lossCount}</div><div class="stat-label">Loss</div></div>`;
            html += `</div>`;
            html += `<div class="stat-card" style="text-align:center;margin-bottom:16px"><div class="stat-label">Total P/L</div><div class="stat-value" style="font-size:1.5em;color:${data.totalPL >= 0 ? 'var(--success)' : 'var(--danger)'}">${data.totalPL >= 0 ? '+' : ''}${data.totalPL}/-</div></div>`;
            if (data.groupName) html += `<p style="margin-bottom:8px"><strong>Channel Group:</strong> ${data.groupName}</p>`;
            html += `<h4 style="margin-bottom:8px">Trade Details:</h4>`;
            html += `<table class="data-table" style="margin-bottom:16px"><thead><tr><th>#</th><th>Stock</th><th>Lot</th><th style="text-align:right">Entry</th><th style="text-align:right">Exit</th><th style="text-align:right">P/L</th></tr></thead><tbody>`;
            data.trades.forEach(t => {
                const pl = t.profitLossAmount || 0;
                html += `<tr><td>${t.index}</td><td><strong>${t.stockName} ${t.strikePrice || ''} ${t.optionType}</strong></td><td>${t.lotSize}</td><td style="text-align:right">${t.entryPrice}</td><td style="text-align:right">${t.exitPrice || '-'}</td><td style="text-align:right;color:${pl >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${pl >= 0 ? '+' : ''}${pl}/-</strong></td></tr>`;
            });
            html += `</tbody></table>`;
            html += `<h4 style="margin-bottom:8px">Message that will be sent:</h4>`;
            html += `<pre style="background:var(--bg-secondary);padding:12px;border-radius:8px;white-space:pre-wrap;font-size:12px;max-height:200px;overflow-y:auto">${data.summaryText.replace(/</g,'&lt;')}</pre>`;
            if (data.channelId) html += `<p class="text-xs text-muted" style="margin-top:8px">Sending to channel: <code>${data.channelId}</code></p>`;
            html += `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">`;
            html += `<button class="btn btn-secondary" onclick="App.closeModal()" data-testid="button-preview-back">Go Back</button>`;
            html += `<button class="btn btn-primary" onclick="Pages.confirmPost('${date}')" data-testid="button-confirm-post">Confirm & Post</button>`;
            html += `</div></div>`;
            App.showModal('Preview Before Posting', html);
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async confirmPost(date) {
        App.closeModal();
        await Pages.postSummary(date);
    },

    async postSummary(date) {
        const tradeIds = [...document.querySelectorAll('.post-trade-cb:checked')].map(cb => cb.value);
        const groupId = document.getElementById('fetch-group').value;
        if (tradeIds.length === 0) { App.toast('Select at least one trade', 'error'); return; }
        try {
            await App.api('/api/telegram/post-summary', 'POST', { date, tradeIds, channelGroupId: groupId || undefined });
            App.toast('Summary posted to channel!');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async analytics(container) {
        let trades = [];
        try { trades = await App.api('/api/trades'); } catch {}
        const total = trades.length;
        const closed = trades.filter(t => t.status === 'closed');
        const profitTrades = closed.filter(t => (t.profit_loss_amount || 0) > 0).length;
        const lossTrades = closed.filter(t => (t.profit_loss_amount || 0) < 0).length;
        const totalPL = closed.reduce((s, t) => s + (Number(t.profit_loss_amount) || 0), 0);
        const accuracy = closed.length > 0 ? ((profitTrades / closed.length) * 100).toFixed(1) : 0;

        container.innerHTML = `
        <div class="page-header"><h1>Analytics</h1><p>Performance metrics and statistics</p></div>
        <div class="page-content">
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon blue">T</div><div><div class="stat-value">${total}</div><div class="stat-label">Total Trades</div></div></div>
                <div class="stat-card"><div class="stat-icon green">A</div><div><div class="stat-value">${accuracy}%</div><div class="stat-label">Accuracy</div></div></div>
                <div class="stat-card"><div class="stat-icon ${totalPL >= 0 ? 'green' : 'amber'}">P</div><div><div class="stat-value">${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}</div><div class="stat-label">Net P/L</div></div></div>
                <div class="stat-card"><div class="stat-icon purple">C</div><div><div class="stat-value">${closed.length}</div><div class="stat-label">Closed Trades</div></div></div>
            </div>
            <div class="card"><div class="card-header"><h3>Trade Breakdown</h3></div><div class="card-body">
                <table class="data-table"><tr><td>Profit Trades</td><td class="text-right font-bold">${profitTrades}</td></tr>
                <tr><td>Loss Trades</td><td class="text-right font-bold">${lossTrades}</td></tr>
                <tr><td>Avg Profit per Trade</td><td class="text-right font-bold">${closed.length > 0 ? (totalPL / closed.length).toFixed(2) : '0.00'}</td></tr></table>
            </div></div>
        </div>`;
    },

    async settings(container) {
        let settings = {};
        try { settings = await App.api('/api/settings'); } catch {}
        let groups = [];
        try { groups = await App.api('/api/channel-groups'); } catch {}
        let kiteStatus = {};
        try { kiteStatus = await App.api('/api/kite/status'); } catch {}

        const callbackUrl = window.location.origin + '/api/kite/callback';

        container.innerHTML = `
        <div class="page-header"><h1>Settings</h1><p>Analyst, Telegram, Kite Connect & AI configuration</p></div>
        <div class="page-content">
            <div class="card mb-4"><div class="card-header"><h3>Analyst Details</h3></div><div class="card-body">
                <div class="grid-2">
                    <div class="form-group"><label>Analyst Name</label><input id="s-name" value="${settings.analyst_name || ''}" data-testid="input-analyst-name"></div>
                    <div class="form-group"><label>SEBI Reg Number</label><input id="s-sebi" value="${settings.sebi_reg_number || ''}" data-testid="input-sebi-reg"></div>
                </div>
                <div class="grid-2">
                    <div class="form-group"><label>Company Name</label><input id="s-company" value="${settings.company_name || ''}" data-testid="input-company"></div>
                    <div class="form-group"><label>Website</label><input id="s-website" value="${settings.website_url || ''}" data-testid="input-website"></div>
                </div>
                <div class="form-group"><label>Disclaimer Text</label><textarea id="s-disclaimer" rows="4" data-testid="input-disclaimer">${settings.disclaimer_text || ''}</textarea></div>
                <button class="btn btn-primary" onclick="Pages.saveSettings()" data-testid="button-save-settings">Save Settings</button>
            </div></div>
            <div class="card mb-4"><div class="card-header"><h3>Telegram Configuration</h3></div><div class="card-body">
                <div class="form-group"><label>Bot Token</label><input id="s-token" value="${settings.telegram_bot_token || ''}" placeholder="123456:ABC-DEF..." data-testid="input-bot-token"></div>
                <div class="form-group"><label>Private Relay Channel ID</label><input id="s-relay" value="${settings.private_relay_channel_id || ''}" placeholder="-100xxxxxxxxxx" data-testid="input-relay-channel"></div>
                <button class="btn btn-secondary" onclick="Pages.testBot()" data-testid="button-test-bot">Test Connection</button>
            </div></div>
            <div class="card mb-4"><div class="card-header flex justify-between items-center"><h3>Kite Connect</h3>
                <span class="badge badge-${kiteStatus.connected ? 'success' : 'danger'}" data-testid="badge-kite-status">${kiteStatus.connected ? 'Connected' : 'Disconnected'}</span>
            </div><div class="card-body">
                <div class="grid-2">
                    <div class="form-group"><label>Kite API Key</label><input id="s-kite-key" value="${settings.kite_api_key || ''}" placeholder="your_api_key" data-testid="input-kite-key"></div>
                    <div class="form-group"><label>Kite API Secret</label><input type="password" id="s-kite-secret" value="${settings.kite_api_secret || ''}" placeholder="your_api_secret" data-testid="input-kite-secret"></div>
                </div>
                <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px;margin-bottom:12px">
                    <strong style="font-size:13px">Callback URL (set in Kite Developer Console):</strong>
                    <div style="display:flex;gap:8px;margin-top:6px">
                        <input readonly value="${callbackUrl}" style="font-family:monospace;font-size:12px;background:#fff;flex:1" data-testid="input-kite-callback">
                        <button class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText('${callbackUrl}');App.toast('Copied!')">Copy</button>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-primary" onclick="Pages.saveSettings()" data-testid="button-save-kite">Save Keys</button>
                    <button class="btn btn-success" onclick="Pages.loginKite()" data-testid="button-login-kite" ${!settings.kite_api_key ? 'disabled' : ''}>Login to Kite</button>
                </div>
                ${kiteStatus.connected ? `<p class="text-xs text-muted mt-2">Token expires: ${kiteStatus.expiry}</p>` : ''}
            </div></div>
            <div class="card mb-4"><div class="card-header"><h3>AI Configuration</h3></div><div class="card-body">
                <div class="grid-2">
                    <div class="form-group"><label>AI Provider</label><select id="s-ai-provider" data-testid="select-ai-provider">
                        <option value="gemini" ${(settings.ai_provider || 'gemini') === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                        <option value="openai" ${settings.ai_provider === 'openai' ? 'selected' : ''}>OpenAI GPT-4o</option>
                    </select></div>
                    <div class="form-group"><label>AI API Key</label><input type="password" id="s-ai-key" value="${settings.ai_api_key || ''}" placeholder="API Key" data-testid="input-ai-key"></div>
                </div>
                <button class="btn btn-primary" onclick="Pages.saveSettings()" data-testid="button-save-ai">Save AI Settings</button>
            </div></div>
            <div class="card mb-4"><div class="card-header flex justify-between items-center"><h3>Channel Groups</h3><button class="btn btn-sm btn-primary" onclick="Pages.showGroupModal()" data-testid="button-add-group">+ Add Group</button></div><div class="card-body">
                ${groups.length > 0 ? groups.map(g => `
                <div class="trade-row"><div class="trade-info"><h4>${g.name}</h4><p>${g.segment} | Paid: ${g.paid_channel_id} | Free: ${g.free_channel_id}</p></div>
                <div class="flex gap-2"><button class="btn btn-sm btn-secondary" onclick="Pages.editGroup('${g.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="Pages.deleteGroup('${g.id}')">Delete</button></div></div>
                `).join('') : '<p class="text-muted">No channel groups. Add one to get started.</p>'}
            </div></div>
            <div class="card"><div class="card-header"><h3>Signature Upload</h3></div><div class="card-body">
                <div class="form-group"><label>Upload Signature Image</label><input type="file" id="sig-file" accept="image/*" data-testid="input-signature-file"></div>
                <button class="btn btn-secondary" onclick="Pages.uploadSignature()" data-testid="button-upload-sig">Upload</button>
                ${settings.signature_image_path ? `<p class="text-xs text-muted mt-2">Current: ${settings.signature_image_path}</p>` : ''}
            </div></div>
        </div>
        <div id="group-modal"></div>`;
        this._settings = settings;
        this._groups = groups;
    },

    async saveSettings() {
        try {
            await App.api('/api/settings', 'POST', {
                analystName: document.getElementById('s-name').value,
                sebiRegNumber: document.getElementById('s-sebi').value,
                companyName: document.getElementById('s-company').value,
                websiteUrl: document.getElementById('s-website').value,
                disclaimerText: document.getElementById('s-disclaimer').value,
                telegramBotToken: document.getElementById('s-token').value,
                privateRelayChannelId: document.getElementById('s-relay')?.value || '',
                kiteApiKey: document.getElementById('s-kite-key')?.value || '',
                kiteApiSecret: document.getElementById('s-kite-secret')?.value || '',
                aiProvider: document.getElementById('s-ai-provider')?.value || 'gemini',
                aiApiKey: document.getElementById('s-ai-key')?.value || '',
            });
            App.toast('Settings saved');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async loginKite() {
        try {
            const data = await App.api('/api/kite/login-url');
            window.open(data.loginUrl, '_blank', 'width=600,height=600');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async testBot() {
        try {
            const result = await App.api('/api/telegram/test', 'POST');
            App.toast(`Bot connected: @${result.botName}`);
        } catch (err) { App.toast(err.message, 'error'); }
    },

    showGroupModal(group = null) {
        document.getElementById('group-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal"><div class="modal-header"><h3>${group ? 'Edit Group' : 'Add Channel Group'}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <div class="form-group"><label>Group Name</label><input id="g-name" value="${group?.name || ''}" placeholder="Equity Calls" data-testid="input-group-name"></div>
                <div class="form-group"><label>Segment</label><select id="g-segment" data-testid="select-group-segment"><option value="STOCK OPTION" ${group?.segment === 'STOCK OPTION' ? 'selected' : ''}>Stock Option</option><option value="INDEX OPTION" ${group?.segment === 'INDEX OPTION' ? 'selected' : ''}>Index Option</option><option value="EQUITY" ${group?.segment === 'EQUITY' ? 'selected' : ''}>Equity</option></select></div>
                <div class="form-group"><label>Paid Channel ID</label><input id="g-paid" value="${group?.paid_channel_id || ''}" placeholder="-1001234567890" data-testid="input-paid-channel"></div>
                <div class="form-group"><label>Free Channel ID</label><input id="g-free" value="${group?.free_channel_id || ''}" placeholder="-1001234567891" data-testid="input-free-channel"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages.saveGroup('${group?.id || ''}')" data-testid="button-save-group">Save</button>
            </div></div>
        </div>`;
    },

    editGroup(id) {
        const group = this._groups?.find(g => g.id === id);
        if (group) this.showGroupModal(group);
    },

    async saveGroup(id) {
        const data = {
            name: document.getElementById('g-name').value,
            segment: document.getElementById('g-segment').value,
            paidChannelId: document.getElementById('g-paid').value,
            freeChannelId: document.getElementById('g-free').value,
        };
        try {
            if (id) { await App.api(`/api/channel-groups/${id}`, 'PATCH', data); }
            else { await App.api('/api/channel-groups', 'POST', data); }
            App.toast('Group saved');
            document.querySelector('.modal-overlay')?.remove();
            App.navigate('settings');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async deleteGroup(id) {
        if (!confirm('Delete this channel group?')) return;
        try {
            await App.api(`/api/channel-groups/${id}`, 'DELETE');
            App.toast('Group deleted');
            App.navigate('settings');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async uploadSignature() {
        const file = document.getElementById('sig-file').files[0];
        if (!file) { App.toast('Select a file first', 'error'); return; }
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/upload/signature', { method: 'POST', body: formData, credentials: 'same-origin' });
            const data = await res.json();
            if (data.path) {
                await App.api('/api/settings', 'POST', { signatureImagePath: data.path });
                App.toast('Signature uploaded');
            }
        } catch (err) { App.toast(err.message, 'error'); }
    },

    async screener(container) {
        let kiteStatus = {};
        try { kiteStatus = await App.api('/api/kite/status'); } catch {}
        let snapshot = {};
        try { snapshot = await App.api('/api/screener/data'); } catch {}
        const data = snapshot.data || [];
        const timestamp = snapshot.timestamp || null;

        container.innerHTML = `
        <div class="page-header flex justify-between items-center">
            <div><h1>OI Screener</h1><p>Open Interest analysis and stock screening</p></div>
            <div class="flex gap-2 items-center">
                <span class="badge badge-${kiteStatus.connected ? 'success' : 'danger'}" data-testid="badge-kite-status">${kiteStatus.connected ? 'Kite Connected' : 'Kite Disconnected'}</span>
                <button class="btn btn-primary" onclick="Pages.refreshScreener()" data-testid="button-refresh-kite" ${!kiteStatus.connected ? 'disabled' : ''}>Refresh (Kite)</button>
                <button class="btn btn-secondary" onclick="Pages.showPasteOI()" data-testid="button-paste-oi">Paste Data</button>
            </div>
        </div>
        <div class="page-content">
            ${timestamp ? `<p class="text-xs text-muted mb-3" data-testid="text-snapshot-time">Last updated: ${timestamp} | ${data.length} stocks | Source: ${snapshot.source || 'N/A'}</p>` : ''}
            <div class="card mb-4"><div class="card-body">
                <div class="flex gap-2 flex-wrap mb-3">
                    <button class="btn btn-sm btn-secondary" onclick="Pages.filterScreener('all')" data-testid="button-filter-all">All</button>
                    <button class="btn btn-sm btn-secondary" onclick="Pages.filterScreener('Long Buildup')" data-testid="button-filter-long-buildup" style="border-color:#16a34a;color:#16a34a">Long Buildup</button>
                    <button class="btn btn-sm btn-secondary" onclick="Pages.filterScreener('Short Buildup')" data-testid="button-filter-short-buildup" style="border-color:#dc2626;color:#dc2626">Short Buildup</button>
                    <button class="btn btn-sm btn-secondary" onclick="Pages.filterScreener('Short Covering')" data-testid="button-filter-short-covering" style="border-color:#2563eb;color:#2563eb">Short Covering</button>
                    <button class="btn btn-sm btn-secondary" onclick="Pages.filterScreener('Long Unwinding')" data-testid="button-filter-long-unwinding" style="border-color:#d97706;color:#d97706">Long Unwinding</button>
                </div>
                <div class="form-group"><input id="screener-search" placeholder="Search by symbol..." oninput="Pages.searchScreener()" data-testid="input-screener-search"></div>
            </div></div>
            <div id="screener-table">
            ${data.length > 0 ? Pages._renderScreenerTable(data) : '<div class="empty-state"><h3>No OI Data</h3><p>Click "Refresh (Kite)" to fetch live data or "Paste Data" to enter manually</p></div>'}
            </div>
        </div>
        <div id="paste-modal"></div>`;
        this._screenerData = data;
        this._screenerFilter = 'all';
    },

    _renderScreenerTable(data) {
        if (!data || data.length === 0) return '<div class="empty-state"><p>No data matching filter</p></div>';
        const buildupColors = {'Long Buildup':'#16a34a','Short Buildup':'#dc2626','Short Covering':'#2563eb','Long Unwinding':'#d97706','Neutral':'#6b7280'};
        return `<div class="table-container"><table class="data-table"><thead><tr>
            <th>Symbol</th><th style="text-align:right">OI Change %</th><th style="text-align:right">Price Change %</th>
            <th style="text-align:right">Volume</th><th style="text-align:right">Latest OI</th><th style="text-align:right">Futures Price</th>
            <th style="text-align:right">Lot Size</th><th>Buildup</th>
        </tr></thead><tbody>
        ${data.map(d => `<tr class="screener-row" data-symbol="${d.symbol}" data-buildup="${d.buildupType}" data-testid="row-screener-${d.symbol}">
            <td><strong>${d.symbol}</strong></td>
            <td style="text-align:right;color:${d.oiChangePct >= 0 ? '#16a34a' : '#dc2626'}">${d.oiChangePct >= 0 ? '+' : ''}${d.oiChangePct}%</td>
            <td style="text-align:right;color:${d.priceChangePct >= 0 ? '#16a34a' : '#dc2626'}">${d.priceChangePct >= 0 ? '+' : ''}${d.priceChangePct}%</td>
            <td style="text-align:right">${Number(d.volume).toLocaleString()}</td>
            <td style="text-align:right">${Number(d.latestOI).toLocaleString()}</td>
            <td style="text-align:right">${Number(d.futuresPrice).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
            <td style="text-align:right">${d.lotSize}</td>
            <td><span class="badge" style="background:${buildupColors[d.buildupType] || '#6b7280'}20;color:${buildupColors[d.buildupType] || '#6b7280'};border:1px solid ${buildupColors[d.buildupType] || '#6b7280'}40">${d.buildupType}</span></td>
        </tr>`).join('')}
        </tbody></table></div>`;
    },

    filterScreener(type) {
        this._screenerFilter = type;
        const filtered = type === 'all' ? this._screenerData : this._screenerData.filter(d => d.buildupType === type);
        document.getElementById('screener-table').innerHTML = this._renderScreenerTable(filtered);
    },

    searchScreener() {
        const q = (document.getElementById('screener-search')?.value || '').toLowerCase();
        document.querySelectorAll('.screener-row').forEach(row => {
            const match = row.dataset.symbol.toLowerCase().includes(q);
            row.style.display = match ? '' : 'none';
        });
    },

    async refreshScreener() {
        App.toast('Fetching OI data from Kite...');
        try {
            const result = await App.api('/api/kite/fetch-oi', 'POST');
            App.toast(`Fetched ${result.count} stocks`);
            App.navigate('screener');
        } catch (err) { App.toast(err.message, 'error'); }
    },

    showPasteOI() {
        document.getElementById('paste-modal').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
            <div class="modal" style="max-width:700px"><div class="modal-header"><h3>Paste OI Data</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
            <div class="modal-body">
                <p class="text-sm text-muted mb-3">Paste tab-separated data from NSE or other sources. Format: Symbol, OI, OI Change, OI Change %, Price, Price Change, Price Change %, Volume, Lot Size</p>
                <div class="form-group"><textarea id="paste-oi-text" rows="10" placeholder="NIFTY&#9;12345678&#9;100000&#9;5.2%&#9;22500&#9;50&#9;0.22%&#9;500000&#9;25" data-testid="input-paste-oi" style="font-family:monospace;font-size:12px"></textarea></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="Pages.submitPasteOI()" data-testid="button-submit-paste">Parse & Save</button>
            </div></div>
        </div>`;
    },

    async submitPasteOI() {
        const text = document.getElementById('paste-oi-text').value;
        if (!text.trim()) { App.toast('Paste some data first', 'error'); return; }
        try {
            const result = await App.api('/api/oi/paste', 'POST', { text });
            App.toast(`Parsed ${result.count} stocks`);
            document.querySelector('.modal-overlay')?.remove();
            App.navigate('screener');
        } catch (err) { App.toast(err.message, 'error'); }
    },

};
