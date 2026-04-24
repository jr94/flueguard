document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const userGreeting = document.getElementById('user-greeting');
    const devicesLoader = document.getElementById('devices-loader');
    const devicesGrid = document.getElementById('devices-grid');
    const noDevices = document.getElementById('no-devices');
    const toast = document.getElementById('toast');

    // State
    let accessToken = localStorage.getItem('fg_access_token');
    let currentUser = JSON.parse(localStorage.getItem('fg_user') || 'null');

    // API Base URL
    const API_BASE_URL = '/api';

    // Initialize
    init();

    function init() {
        if (accessToken && currentUser) {
            showDashboard();
        } else {
            showLogin();
        }
    }

    // View Routing
    function showLogin() {
        loginView.classList.add('active');
        dashboardView.classList.remove('active');
    }

    function showDashboard() {
        loginView.classList.remove('active');
        dashboardView.classList.add('active');
        userGreeting.textContent = `Hola, ${currentUser.first_name || currentUser.email}`;
        fetchDevices();
    }

    // Toast Notification
    let toastTimeout;
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Set Loading State for Button
    function setBtnLoading(isLoading) {
        const btnText = loginBtn.querySelector('.btn-text');
        const loader = loginBtn.querySelector('.loader');

        loginBtn.disabled = isLoading;
        if (isLoading) {
            btnText.style.display = 'none';
            loader.style.display = 'block';
        } else {
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    }

    // Handle Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) return;

        setBtnLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, device_type: 'Navegador' }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error de credenciales');
            }

            // Save to local storage
            accessToken = data.access_token;
            currentUser = data.user;
            localStorage.setItem('fg_access_token', accessToken);
            localStorage.setItem('fg_user', JSON.stringify(currentUser));

            showToast('Inicio de sesión exitoso');
            showDashboard();

            // Clear form
            loginForm.reset();

        } catch (error) {
            console.error('Login error:', error);
            showToast(error.message, 'error');
        } finally {
            setBtnLoading(false);
        }
    });

    // Handle Logout
    logoutBtn.addEventListener('click', () => {
        accessToken = null;
        currentUser = null;
        localStorage.removeItem('fg_access_token');
        localStorage.removeItem('fg_user');
        showLogin();
    });

    // Handle Refresh
    refreshBtn.addEventListener('click', () => {
        fetchDevices();
    });

    // Fetch Devices
    async function fetchDevices() {
        if (!currentUser || !currentUser.id) return;

        devicesLoader.style.display = 'flex';
        devicesGrid.style.display = 'none';
        noDevices.style.display = 'none';

        try {
            const response = await fetch(`${API_BASE_URL}/telemetry/lastTemp/user/${currentUser.id}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                // Token expired or invalid
                logoutBtn.click();
                showToast('Sesión expirada. Por favor inicie sesión nuevamente.', 'error');
                return;
            }

            if (!response.ok) {
                throw new Error('No se pudieron cargar los dispositivos');
            }

            const data = await response.json();
            renderDevices(data);

        } catch (error) {
            console.error('Fetch devices error:', error);
            showToast(error.message, 'error');
            devicesLoader.style.display = 'none';
        }
    }

    // Render Devices
    function renderDevices(devicesData) {
        devicesLoader.style.display = 'none';
        devicesGrid.innerHTML = '';

        if (!devicesData || devicesData.length === 0) {
            noDevices.style.display = 'block';
            return;
        }

        devicesGrid.style.display = 'grid';

        devicesData.forEach(item => {
            const device = item.device;
            const temp = item.last_temperature ? parseFloat(item.last_temperature).toFixed(1) : '--';
            const statusClass = device.status === 'online' ? 'status-online' : 'status-offline';
            const statusText = device.status === 'online' ? 'Conectado' : 'Desconectado';

            // Generate diffTemp icon/text if needed (0: bajando, 1: estable, 2: subiendo, 3: acelerada, 4: peligrosa)
            let trendIcon = '';
            let trendColor = '';

            if (device.diffTemp === 0) {
                trendIcon = '↘'; // Bajando
                trendColor = 'var(--text-secondary)';
            } else if (device.diffTemp === 1) {
                trendIcon = '→'; // Estable
                trendColor = 'var(--text-secondary)';
            } else if (device.diffTemp === 2) {
                trendIcon = '↗'; // Subiendo
                trendColor = 'var(--warning)';
            } else if (device.diffTemp >= 3) {
                trendIcon = '↑'; // Peligrosa
                trendColor = 'var(--danger)';
            }

            const card = document.createElement('div');
            card.className = 'device-card';
            card.innerHTML = `
                <div class="device-header">
                    <div class="device-info">
                        <h3>${escapeHtml(device.device_name)}</h3>
                        <div class="device-serial">SN: ${escapeHtml(device.serial_number)}</div>
                    </div>
                    <div class="device-status ${statusClass}">${statusText}</div>
                </div>
                <div class="device-body">
                    <div class="temp-display" title="Tendencia de temperatura">
                        <div class="temp-value" style="color: ${trendColor}">${temp}</div>
                        <div class="temp-unit">°C ${trendIcon}</div>
                    </div>
                </div>
            `;
            devicesGrid.appendChild(card);
        });
    }

    // Utility
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
});
