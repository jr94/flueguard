// layout.js
document.addEventListener('DOMContentLoaded', () => {
    const user = Auth.getCurrentUser();
    const token = Auth.getAccessToken();
    
    // Check if we are on the main /portal landing page
    const isMainPortalPage = window.location.pathname === '/portal' || window.location.pathname === '/portal/' || window.location.pathname.endsWith('/portal/index.html');
    
    if (!token || !user) {
        if (!isMainPortalPage) {
            // Not authorized and not on landing, force logout redirection
            Auth.logout();
            return;
        }
        
        // On landing and not logged in, show login form, hide layout
        const loginView = document.getElementById('login-view');
        if (loginView) loginView.classList.add('active');
        
        const mainSidebar = document.getElementById('main-sidebar');
        if (mainSidebar) mainSidebar.style.display = 'none';
        
        const topNav = document.getElementById('top-nav');
        if (topNav) topNav.style.display = 'none';
        
        setupLoginHandler();
        return;
    }
    
    // If logged in, set up standard layout
    setupLayoutUI(user);
    
    if (isMainPortalPage) {
        // If logged in on landing page, hide login view, show empty layout
        const loginView = document.getElementById('login-view');
        if (loginView) loginView.classList.remove('active');
        
        const viewTitle = document.getElementById('view-title');
        if (viewTitle) viewTitle.textContent = 'Inicio';
    }
});

function setupLoginHandler() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const loginBtn = document.getElementById('login-btn');
        
        if (!email || !password) return;
        
        // Button loading state
        const btnText = loginBtn.querySelector('.btn-text');
        const loader = loginBtn.querySelector('.loader');
        loginBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (loader) loader.style.display = 'block';
        
        try {
            const response = await fetch('/api/portal/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Error de credenciales');
            }
            
            Auth.login(data.access_token, data.user);
            Layout.showToast('Inicio de sesión exitoso');
            
            // Redirect to portal root
            window.location.replace('/portal');
        } catch (error) {
            console.error('Login error:', error);
            Layout.showToast(error.message, 'error');
        } finally {
            loginBtn.disabled = false;
            if (btnText) btnText.style.display = 'block';
            if (loader) loader.style.display = 'none';
        }
    });
}

function setupLayoutUI(user) {
    const sidebar = document.getElementById('main-sidebar');
    const topNav = document.getElementById('top-nav');
    if (sidebar) sidebar.style.display = 'flex';
    if (topNav) topNav.style.display = 'flex';
    
    // Admin class
    if (user.role === 'admin') {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
        // Hide admin-only elements
        document.querySelectorAll('.admin-only').forEach(el => el.style.setProperty('display', 'none', 'important'));
    }
    
    // User details in UI
    const navUserName = document.getElementById('nav-user-name');
    const sideUserName = document.getElementById('side-user-name');
    const sideUserRole = document.getElementById('side-user-role');
    
    if (navUserName) navUserName.textContent = user.first_name || user.email;
    if (sideUserName) sideUserName.textContent = `${user.first_name} ${user.last_name || ''}`;
    if (sideUserRole) sideUserRole.textContent = user.role;
    
    // Dropdown toggles
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', () => {
            userDropdown.style.display = 'none';
        });
    }
    
    // Profile menu button navigation
    const profileMenuBtn = document.getElementById('profile-menu-btn');
    if (profileMenuBtn) {
        profileMenuBtn.addEventListener('click', () => {
            window.location.href = '/portal/profile';
        });
    }
    
    // Logout actions
    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnSide = document.getElementById('logout-btn-side');
    if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
    if (logoutBtnSide) logoutBtnSide.addEventListener('click', () => Auth.logout());
    
    // Notifications toggle
    const notificationsBtn = document.getElementById('notifications-btn');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    if (notificationsBtn && notificationsDropdown) {
        notificationsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationsDropdown.style.display = notificationsDropdown.style.display === 'flex' ? 'none' : 'flex';
        });
        document.addEventListener('click', () => {
            notificationsDropdown.style.display = 'none';
        });
        notificationsDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Mark active nav items in sidebar
    const pathname = window.location.pathname;
    const navItems = {
        '/portal/devices': 'nav-item-devices',
        '/portal/user': 'nav-item-user',
        '/portal/admin': 'nav-item-admin'
    };
    
    Object.keys(navItems).forEach(path => {
        const elementId = navItems[path];
        const el = document.getElementById(elementId);
        if (el) {
            const isDeviceDetail = (path === '/portal/devices' && pathname.includes('/portal/device/'));
            if (pathname.includes(path) || isDeviceDetail) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    });
    
    // Notifications container visibility if permission exists (does not start polling automatically)
    if (Auth.hasPermission('can_view_alerts')) {
        const notificationsContainer = document.getElementById('notifications-container');
        if (notificationsContainer) notificationsContainer.style.display = 'block';
    }
}

// Global Toast & layout helper utilities
const Layout = {
    toastTimeout: null,
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    startAlertsPolling() {
        if (Auth.hasPermission('can_view_alerts')) {
            Notifications.init();
        }
    }
};

// Global Notifications logic
const Notifications = {
    unreadAlerts: [],
    knownAlertIds: new Set(),
    isFirstFetch: true,
    pollingInterval: null,
    audioCtx: null,
    
    init() {
        this.fetchAlerts();
        this.pollingInterval = setInterval(() => this.fetchAlerts(), 30000);
        
        // Setup clear button
        const clearBtn = document.getElementById('clear-notifications-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllAlerts());
        }
        
        // Setup sound interaction unlock
        document.addEventListener('click', () => this.initAudio(), { once: true });
    },
    
    initAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioCtx) this.audioCtx = new AudioContext();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        } catch (e) {
            console.error('Audio init error:', e);
        }
    },
    
    playAlertSound() {
        try {
            if (!this.audioCtx) this.initAudio();
            if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
            
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.type = 'sawtooth';
            
            const now = this.audioCtx.currentTime;
            const duration = 2.0;
            osc.frequency.setValueAtTime(600, now);
            
            for (let t = 0; t < duration; t += 0.4) {
                osc.frequency.linearRampToValueAtTime(1200, now + t + 0.2);
                osc.frequency.linearRampToValueAtTime(600, now + t + 0.4);
            }
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1.0, now + 0.1);
            gain.gain.setValueAtTime(1.0, now + duration - 0.1);
            gain.gain.linearRampToValueAtTime(0, now + duration);
            
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {
            console.error('Sound play error:', e);
        }
    },
    
    async fetchAlerts() {
        try {
            // First fetch devices to know which devices we have
            const resDevices = await fetch('/api/telemetry/lastTemp/all', {
                headers: { 'Authorization': `Bearer ${Auth.getAccessToken()}` }
            });
            if (!resDevices.ok) return;
            const devices = await resDevices.json();
            
            this.unreadAlerts = [];
            let hasNewAlert = false;
            
            for (const item of devices) {
                const response = await fetch(`/api/alerts/device/${item.device.id}`, {
                    headers: { 'Authorization': `Bearer ${Auth.getAccessToken()}` }
                });
                if (response.ok) {
                    const alerts = await response.json();
                    const unread = alerts.filter(a => !a.is_read);
                    this.unreadAlerts.push(...unread);
                }
            }
            
            this.unreadAlerts.forEach(alert => {
                if (!this.knownAlertIds.has(alert.id)) {
                    hasNewAlert = true;
                    this.knownAlertIds.add(alert.id);
                }
            });
            
            if (!this.isFirstFetch && hasNewAlert) {
                this.playAlertSound();
            }
            this.isFirstFetch = false;
            
            this.unreadAlerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            this.render();
        } catch (e) {
            console.error('Notifications fetch error:', e);
        }
    },
    
    render() {
        const notificationsBadge = document.getElementById('notifications-badge');
        const notificationsList = document.getElementById('notifications-list');
        const clearBtn = document.getElementById('clear-notifications-btn');
        
        if (!notificationsBadge || !notificationsList) return;
        
        if (this.unreadAlerts.length > 0) {
            notificationsBadge.textContent = this.unreadAlerts.length;
            notificationsBadge.style.display = 'block';
            if (clearBtn) clearBtn.disabled = false;
            
            notificationsList.innerHTML = '';
            this.unreadAlerts.forEach(alert => {
                const d = new Date(alert.created_at);
                const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
                notificationsList.innerHTML += `
                    <div class="notification-item level-${alert.alert_level}">
                        <div>${escapeHtml(alert.message)}</div>
                        <div class="notification-date">${dateStr}</div>
                    </div>
                `;
            });
        } else {
            notificationsBadge.style.display = 'none';
            if (clearBtn) clearBtn.disabled = true;
            notificationsList.innerHTML = '<div class="notification-item empty">No hay alertas activas.</div>';
        }
    },
    
    async clearAllAlerts() {
        const clearBtn = document.getElementById('clear-notifications-btn');
        if (clearBtn) {
            clearBtn.disabled = true;
            clearBtn.textContent = 'Borrando...';
        }
        
        try {
            for (const alert of this.unreadAlerts) {
                await fetch(`/api/alerts/${alert.id}/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${Auth.getAccessToken()}` }
                });
            }
            this.unreadAlerts = [];
            this.knownAlertIds.clear();
            this.render();
            Layout.showToast('Notificaciones borradas', 'success');
        } catch (e) {
            console.error('Clear notifications error:', e);
            Layout.showToast('Error al borrar notificaciones', 'error');
        } finally {
            if (clearBtn) {
                clearBtn.disabled = false;
                clearBtn.textContent = 'Limpiar todas';
            }
        }
    }
};

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.Layout = Layout;
window.Notifications = Notifications;
