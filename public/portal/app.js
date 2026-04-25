document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const profileView = document.getElementById('profile-view');
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const userGreeting = document.getElementById('user-greeting');
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    const profileBtn = document.getElementById('profile-btn');
    const backDashboardBtn = document.getElementById('back-dashboard-btn');
    const devicesLoader = document.getElementById('devices-loader');
    const devicesGrid = document.getElementById('devices-grid');
    const noDevices = document.getElementById('no-devices');
    const toast = document.getElementById('toast');

    // Profile Form Elements
    const profileForm = document.getElementById('profile-form');
    const profileNombre = document.getElementById('profile-nombre');
    const profileApellido = document.getElementById('profile-apellido');
    const profileRegion = document.getElementById('profile-region');
    const profileComuna = document.getElementById('profile-comuna');
    const profilePassword = document.getElementById('profile-password');
    const profileConfirmPassword = document.getElementById('profile-confirm-password');
    const saveProfileBtn = document.getElementById('save-profile-btn');

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
        profileView.classList.remove('active');
    }

    function showDashboard() {
        loginView.classList.remove('active');
        profileView.classList.remove('active');
        dashboardView.classList.add('active');
        userGreeting.textContent = `Hola, ${currentUser.first_name || currentUser.email}`;
        fetchDevices();
    }

    function showProfile() {
        loginView.classList.remove('active');
        dashboardView.classList.remove('active');
        profileView.classList.add('active');
        userDropdown.style.display = 'none';
        loadProfileData();
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

    // Menu Toggle
    userMenuBtn.addEventListener('click', () => {
        const isVisible = userDropdown.style.display === 'block';
        userDropdown.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.style.display = 'none';
        }
    });

    profileBtn.addEventListener('click', showProfile);
    backDashboardBtn.addEventListener('click', showDashboard);

    // Handle Logout
    logoutBtn.addEventListener('click', () => {
        accessToken = null;
        currentUser = null;
        localStorage.removeItem('fg_access_token');
        localStorage.removeItem('fg_user');
        userDropdown.style.display = 'none';
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

    // --- Profile Logic ---
    async function loadProfileData() {
        profileNombre.value = currentUser.first_name || '';
        profileApellido.value = currentUser.last_name || '';
        profilePassword.value = '';
        profileConfirmPassword.value = '';

        try {
            // Load Regiones
            const response = await fetch(`${API_BASE_URL}/regiones`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) throw new Error('Error al cargar regiones');
            const regiones = await response.json();
            
            profileRegion.innerHTML = '<option value="">Seleccione una región</option>';
            regiones.forEach(r => {
                profileRegion.innerHTML += `<option value="${r.id}">${r.region}</option>`;
            });

            // Set current region if any
            if (currentUser.region_id) {
                profileRegion.value = currentUser.region_id;
                await loadComunas(currentUser.region_id);
                if (currentUser.comuna_id) {
                    profileComuna.value = currentUser.comuna_id;
                }
            } else {
                profileComuna.innerHTML = '<option value="">Seleccione una comuna</option>';
                profileComuna.disabled = true;
            }
        } catch (error) {
            console.error('Profile load error:', error);
            showToast('No se pudieron cargar los datos de ubicación', 'error');
        }
    }

    async function loadComunas(regionId) {
        if (!regionId) {
            profileComuna.innerHTML = '<option value="">Seleccione una comuna</option>';
            profileComuna.disabled = true;
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/region/${regionId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) throw new Error('Error al cargar comunas');
            const comunas = await response.json();
            
            profileComuna.innerHTML = '<option value="">Seleccione una comuna</option>';
            comunas.forEach(c => {
                profileComuna.innerHTML += `<option value="${c.id}">${c.comuna}</option>`;
            });
            profileComuna.disabled = false;
        } catch (error) {
            console.error('Comunas load error:', error);
            showToast('No se pudieron cargar las comunas', 'error');
        }
    }

    profileRegion.addEventListener('change', (e) => {
        loadComunas(e.target.value);
    });

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pwd = profilePassword.value;
        const confirmPwd = profileConfirmPassword.value;

        if (pwd && pwd !== confirmPwd) {
            showToast('Las contraseñas no coinciden', 'error');
            return;
        }

        const payload = {
            nombre: profileNombre.value.trim(),
            apellido: profileApellido.value.trim()
        };

        if (profileRegion.value) payload.region = parseInt(profileRegion.value);
        if (profileComuna.value) payload.comuna = parseInt(profileComuna.value);
        if (pwd) payload.password = pwd;

        const btnText = saveProfileBtn.querySelector('.btn-text');
        const loader = saveProfileBtn.querySelector('.loader');
        
        saveProfileBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';

        try {
            const response = await fetch(`${API_BASE_URL}/users/update/${currentUser.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al actualizar perfil');

            const updatedUser = await response.json();
            
            // Update local storage and current session state
            currentUser = { ...currentUser, ...updatedUser };
            localStorage.setItem('fg_user', JSON.stringify(currentUser));
            userGreeting.textContent = `Hola, ${currentUser.first_name || currentUser.email}`;

            showToast('Perfil actualizado correctamente', 'success');
            profilePassword.value = '';
            profileConfirmPassword.value = '';

        } catch (error) {
            console.error('Update profile error:', error);
            showToast(error.message, 'error');
        } finally {
            saveProfileBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    });

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
