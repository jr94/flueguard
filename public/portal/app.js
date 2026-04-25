document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const mainNav = document.getElementById('main-nav');
    const globalBackBtn = document.getElementById('global-back-btn');
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const profileView = document.getElementById('profile-view');
    const deviceDetailView = document.getElementById('device-detail-view');
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
    const devicesLoader = document.getElementById('devices-loader');
    const devicesGrid = document.getElementById('devices-grid');
    const noDevices = document.getElementById('no-devices');
    const toast = document.getElementById('toast');

    // Notifications
    const notificationsBtn = document.getElementById('notifications-btn');
    const notificationsBadge = document.getElementById('notifications-badge');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notificationsList = document.getElementById('notifications-list');
    const clearNotificationsBtn = document.getElementById('clear-notifications-btn');

    // Device Detail Elements
    const detailDeviceName = document.getElementById('detail-device-name');
    const detailDeviceStatus = document.getElementById('detail-device-status');
    const detailTemp = document.getElementById('detail-temp');
    const detailTrend = document.getElementById('detail-trend');
    const detailLastUpdate = document.getElementById('detail-last-update');
    const detailSerial = document.getElementById('detail-serial');
    const detailT1 = document.getElementById('detail-t1');
    const detailT2 = document.getElementById('detail-t2');
    const detailT3 = document.getElementById('detail-t3');
    const ctx = document.getElementById('temperatureChart').getContext('2d');

    // Settings panel refs
    const settingsPanel = document.getElementById('settings-panel');
    const settingsForm = document.getElementById('settings-form');
    const sDeviceName = document.getElementById('s-device-name');
    const sTypeDevice = document.getElementById('s-type-device');
    const sT1 = document.getElementById('s-t1');
    const sT2 = document.getElementById('s-t2');
    const sT3 = document.getElementById('s-t3');
    const sNotificationsEnabled = document.getElementById('s-notifications-enabled');
    const sSoundAlarm = document.getElementById('s-sound-alarm');
    const sAlarmTempLow = document.getElementById('s-alarm-temp-low');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    // Firmware refs
    const firmwareSection = document.getElementById('firmware-section');
    const fwCurrent = document.getElementById('fw-current');
    const fwLatest = document.getElementById('fw-latest');
    const fwNotes = document.getElementById('fw-notes');
    const fwUpdateAvailable = document.getElementById('fw-update-available');
    const fwUpToDate = document.getElementById('fw-up-to-date');
    const fwPending = document.getElementById('fw-pending');
    const fwInstallBtn = document.getElementById('fw-install-btn');

    let tempChart;
    let currentDevices = [];
    let unreadAlerts = [];
    let pollingInterval = null;
    let currentOpenDeviceId = null;
    let currentDeviceSettings = null;
    let knownAlertIds = new Set();
    let isFirstNotificationsFetch = true;

    // Profile Form Elements
    const profileForm = document.getElementById('profile-form');
    const profileNombre = document.getElementById('profile-nombre');
    const profileApellido = document.getElementById('profile-apellido');
    const profileEmail = document.getElementById('profile-email');
    const profileRole = document.getElementById('profile-role');
    const profilePassword = document.getElementById('profile-password');
    const profileConfirmPassword = document.getElementById('profile-confirm-password');
    const saveProfileBtn = document.getElementById('save-profile-btn');

    // State
    let accessToken = localStorage.getItem('fg_access_token');
    let currentUser = JSON.parse(localStorage.getItem('fg_user') || 'null');
    let currentPermissions = JSON.parse(localStorage.getItem('fg_permissions') || 'null');

    function hasPermission(perm) {
        if (!currentPermissions) return false;
        if (currentUser && currentUser.role === 'admin') return true;
        return !!currentPermissions[perm];
    }

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

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => {
            if (accessToken && (dashboardView.classList.contains('active') || deviceDetailView.classList.contains('active'))) {
                fetchDevices(true);
            }
        }, 30000);
    }

    function stopPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = null;
    }

    // View Routing
    function showLogin() {
        stopPolling();
        mainNav.style.display = 'none';
        loginView.classList.add('active');
        dashboardView.classList.remove('active');
        profileView.classList.remove('active');
        deviceDetailView.classList.remove('active');
    }

    function showDashboard() {
        mainNav.style.display = 'flex';
        globalBackBtn.style.display = 'none';
        loginView.classList.remove('active');
        profileView.classList.remove('active');
        deviceDetailView.classList.remove('active');
        dashboardView.classList.add('active');
        userGreeting.textContent = `Hola, ${currentUser.first_name || currentUser.email}`;
        currentOpenDeviceId = null;

        // Apply permissions
        const canViewAlerts = hasPermission('can_view_alerts');
        document.querySelector('.notifications-container').style.display = canViewAlerts ? '' : 'none';

        if (hasPermission('can_view_devices')) {
            fetchDevices();
        } else {
            devicesLoader.style.display = 'none';
            devicesGrid.style.display = 'none';
            noDevices.style.display = 'block';
            noDevices.querySelector('p').textContent = 'No tiene permiso para ver dispositivos.';
        }
        startPolling();
    }

    function showProfile() {
        mainNav.style.display = 'flex';
        globalBackBtn.style.display = 'inline-block';
        loginView.classList.remove('active');
        dashboardView.classList.remove('active');
        deviceDetailView.classList.remove('active');
        profileView.classList.add('active');
        userDropdown.style.display = 'none';
        loadProfileData();
    }

    function showDeviceDetail() {
        mainNav.style.display = 'flex';
        globalBackBtn.style.display = 'inline-block';
        loginView.classList.remove('active');
        dashboardView.classList.remove('active');
        profileView.classList.remove('active');
        deviceDetailView.classList.add('active');
        startPolling();
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
            const response = await fetch(`${API_BASE_URL}/portal/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error de credenciales');
            }

            // Save to local storage
            accessToken = data.access_token;
            currentUser = data.user;
            currentPermissions = data.user.permissions || null;
            localStorage.setItem('fg_access_token', accessToken);
            localStorage.setItem('fg_user', JSON.stringify(currentUser));
            localStorage.setItem('fg_permissions', JSON.stringify(currentPermissions));

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
        if (!notificationsBtn.contains(e.target) && !notificationsDropdown.contains(e.target)) {
            notificationsDropdown.style.display = 'none';
        }
    });

    profileBtn.addEventListener('click', showProfile);
    globalBackBtn.addEventListener('click', showDashboard);

    notificationsBtn.addEventListener('click', () => {
        const isVisible = notificationsDropdown.style.display === 'flex';
        notificationsDropdown.style.display = isVisible ? 'none' : 'flex';
    });

    // Handle Logout
    logoutBtn.addEventListener('click', () => {
        accessToken = null;
        currentUser = null;
        currentPermissions = null;
        localStorage.removeItem('fg_access_token');
        localStorage.removeItem('fg_user');
        localStorage.removeItem('fg_permissions');
        userDropdown.style.display = 'none';
        showLogin();
    });

    // Handle Refresh
    refreshBtn.addEventListener('click', () => {
        fetchDevices();
    });

    // Fetch Devices
    async function fetchDevices(silent = false) {
        if (!currentUser || !currentUser.id) return;

        if (!silent) {
            devicesLoader.style.display = 'flex';
            devicesGrid.style.display = 'none';
            noDevices.style.display = 'none';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/telemetry/lastTemp/all`, {
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
            currentDevices = data;
            
            if (dashboardView.classList.contains('active')) {
                renderDevices(data);
            } else if (deviceDetailView.classList.contains('active') && currentOpenDeviceId) {
                const updatedDevice = data.find(item => item.device.id === currentOpenDeviceId);
                if (updatedDevice) {
                    refreshDeviceDetail(updatedDevice);
                }
            }
            
            fetchNotifications();

        } catch (error) {
            console.error('Fetch devices error:', error);
            if (!silent) showToast(error.message, 'error');
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
            let trendText = '';

            if (device.diffTemp === 0) {
                trendIcon = '↘';
                trendColor = 'var(--text-secondary)';
                trendText = 'Temperatura bajando';
            } else if (device.diffTemp === 1) {
                trendIcon = '→';
                trendColor = 'var(--text-secondary)';
                trendText = 'Temperatura estable';
            } else if (device.diffTemp === 2) {
                trendIcon = '↗';
                trendColor = 'var(--warning)';
                trendText = 'Temperatura subiendo';
            } else if (device.diffTemp === 3) {
                trendIcon = '↑';
                trendColor = 'var(--danger)';
                trendText = 'Subiendo (acelerada)';
            } else if (device.diffTemp >= 4) {
                trendIcon = '↑';
                trendColor = 'var(--danger)';
                trendText = 'Subiendo (peligrosa)';
            } else {
                trendIcon = '';
                trendColor = 'var(--text-secondary)';
                trendText = 'Tendencia desconocida';
            }

            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.cursor = 'pointer';
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
                        <div class="temp-unit">°C</div>
                    </div>
                    <div class="trend-text" style="color: ${trendColor}; font-size: 0.9rem; margin-top: 0.5rem; text-align: center;">
                        ${trendIcon} ${trendText}
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                openDeviceDetail(item, trendIcon, trendColor);
            });

            devicesGrid.appendChild(card);
        });
    }

    // --- Device Details Logic ---
    async function openDeviceDetail(deviceData, trendIcon, trendColor) {
        currentOpenDeviceId = deviceData.device.id;
        showDeviceDetail();
        const device = deviceData.device;
        
        detailDeviceName.textContent = device.device_name;
        detailSerial.textContent = `SN: ${device.serial_number}`;
        
        currentDeviceSettings = null;
        detailT1.textContent = '--';
        detailT2.textContent = '--';
        detailT3.textContent = '--';

        refreshDeviceDetail(deviceData);

        // Show/hide settings panel based on permission
        const canChangeSettings = hasPermission('can_change_settings');
        settingsPanel.style.display = canChangeSettings ? 'block' : 'none';

        // Fetch thresholds
        try {
            const response = await fetch(`${API_BASE_URL}/device-settings/${device.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (response.ok) {
                currentDeviceSettings = await response.json();
                if (currentDeviceSettings.threshold_1) detailT1.textContent = parseFloat(currentDeviceSettings.threshold_1).toFixed(0);
                if (currentDeviceSettings.threshold_2) detailT2.textContent = parseFloat(currentDeviceSettings.threshold_2).toFixed(0);
                if (currentDeviceSettings.threshold_3) detailT3.textContent = parseFloat(currentDeviceSettings.threshold_3).toFixed(0);
                
                // Populate settings form if panel is visible
                if (canChangeSettings) {
                    sDeviceName.value = device.device_name || '';
                    sTypeDevice.value = currentDeviceSettings.type_device != null ? String(currentDeviceSettings.type_device) : '0';
                    sT1.value = currentDeviceSettings.threshold_1 != null ? parseFloat(currentDeviceSettings.threshold_1) : '';
                    sT2.value = currentDeviceSettings.threshold_2 != null ? parseFloat(currentDeviceSettings.threshold_2) : '';
                    sT3.value = currentDeviceSettings.threshold_3 != null ? parseFloat(currentDeviceSettings.threshold_3) : '';
                    sNotificationsEnabled.checked = !!currentDeviceSettings.notifications_enabled;
                    sSoundAlarm.checked = !!currentDeviceSettings.sound_alarm_enabled;
                    sAlarmTempLow.checked = !!currentDeviceSettings.sound_alarm_temp_low;
                }

                // re-render chart with settings if logs already fetched
                refreshDeviceChart(device.id);
            }
        } catch (e) {
            console.error('Settings fetch error:', e);
        }

        // Firmware section
        const canManageDevices = hasPermission('can_manage_devices');
        firmwareSection.style.display = canManageDevices ? 'block' : 'none';
        if (canManageDevices) {
            loadFirmwareStatus(device);
        }
    }

    async function refreshDeviceDetail(deviceData) {
        const device = deviceData.device;
        
        detailDeviceStatus.textContent = device.status === 'online' ? 'Conectado' : 'Desconectado';
        detailDeviceStatus.className = 'device-status ' + (device.status === 'online' ? 'status-online' : 'status-offline');
        
        let trendColor = '';
        if (device.diffTemp === 0) trendColor = 'var(--text-secondary)';
        else if (device.diffTemp === 1) trendColor = 'var(--text-secondary)';
        else if (device.diffTemp === 2) trendColor = 'var(--warning)';
        else if (device.diffTemp === 3) trendColor = 'var(--danger)';
        else if (device.diffTemp >= 4) trendColor = 'var(--danger)';

        detailTemp.textContent = deviceData.last_temperature ? parseFloat(deviceData.last_temperature).toFixed(1) : '--';
        detailTemp.style.color = trendColor;

        if (device.diffTemp === 0) detailTrend.textContent = '↘ Temperatura bajando';
        else if (device.diffTemp === 1) detailTrend.textContent = '→ Temperatura estable';
        else if (device.diffTemp === 2) detailTrend.textContent = '↗ Temperatura subiendo';
        else if (device.diffTemp === 3) detailTrend.textContent = '↑ Subiendo (acelerada)';
        else if (device.diffTemp >= 4) detailTrend.textContent = '↑ Subiendo (peligrosa)';
        else detailTrend.textContent = 'Tendencia desconocida';

        if (deviceData.last_log_time) {
            const date = new Date(deviceData.last_log_time);
            detailLastUpdate.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString();
        } else {
            detailLastUpdate.textContent = 'Sin registros';
        }

        refreshDeviceChart(device.id);
    }

    async function refreshDeviceChart(deviceId) {
        try {
            const response = await fetch(`${API_BASE_URL}/telemetry/device/${deviceId}?hours=2`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (response.ok) {
                const logs = await response.json();
                renderChart(logs, currentDeviceSettings);
            }
        } catch (e) {
            console.error('Chart fetch error:', e);
        }
    }

    function renderChart(logs, settings) {
        if (tempChart) tempChart.destroy();
        
        const labels = logs.map(log => {
            const d = new Date(log.created_at);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        const data = logs.map(log => parseFloat(log.temperature));

        let minVal = 0;
        let maxVal = 100;
        if (data.length > 0) {
            minVal = Math.floor(Math.min(...data)) - 20;
            maxVal = Math.ceil(Math.max(...data)) + 20;
        }

        const datasets = [{
            label: 'Temperatura (°C)',
            data: data,
            borderColor: '#10b981', // green for standard temp
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            pointRadius: 2,
            fill: true,
            tension: 0.3
        }];

        if (settings) {
            if (settings.threshold_1) {
                datasets.push({
                    label: 'Nivel 1 (Min)',
                    data: Array(logs.length).fill(parseFloat(settings.threshold_1)),
                    borderColor: '#3b82f6', // blue
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                });
            }
            if (settings.threshold_2) {
                datasets.push({
                    label: 'Nivel 2 (Max)',
                    data: Array(logs.length).fill(parseFloat(settings.threshold_2)),
                    borderColor: '#eab308', // warning yellow
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                });
            }
            if (settings.threshold_3) {
                datasets.push({
                    label: 'Nivel 3 (Crit)',
                    data: Array(logs.length).fill(parseFloat(settings.threshold_3)),
                    borderColor: '#ef4444', // danger red
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                });
            }
        }

        tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        onClick: null, // Prevents hiding datasets on click
                        labels: { color: '#94a3b8', font: { size: 11 } }
                    }
                },
                scales: {
                    y: {
                        min: minVal,
                        max: maxVal,
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', maxTicksLimit: 8 }
                    }
                }
            }
        });
    }

    // --- Notifications Logic ---
    async function fetchNotifications() {
        if (!hasPermission('can_view_alerts')) return;
        if (!currentDevices.length) return;
        unreadAlerts = [];
        
        try {
            // Fetch alerts for all devices
            for (const item of currentDevices) {
                const response = await fetch(`${API_BASE_URL}/alerts/device/${item.device.id}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (response.ok) {
                    const alerts = await response.json();
                    const unread = alerts.filter(a => !a.is_read);
                    unreadAlerts.push(...unread);
                }
            }
            
            // Check for new alerts to play sound
            let hasNewAlert = false;
            unreadAlerts.forEach(alert => {
                if (!knownAlertIds.has(alert.id)) {
                    hasNewAlert = true;
                    knownAlertIds.add(alert.id);
                }
            });

            if (!isFirstNotificationsFetch && hasNewAlert) {
                playAlertSound();
            }
            isFirstNotificationsFetch = false;

            // Sort by latest
            unreadAlerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            renderNotifications();
            
        } catch (e) {
            console.error('Notifications fetch error:', e);
        }
    }

    function renderNotifications() {
        if (unreadAlerts.length > 0) {
            notificationsBadge.textContent = unreadAlerts.length;
            notificationsBadge.style.display = 'block';
            clearNotificationsBtn.disabled = false;
            
            notificationsList.innerHTML = '';
            unreadAlerts.forEach(alert => {
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
            clearNotificationsBtn.disabled = true;
            notificationsList.innerHTML = '<div class="notification-item empty">No hay alertas activas.</div>';
        }
    }

    clearNotificationsBtn.addEventListener('click', async () => {
        clearNotificationsBtn.disabled = true;
        clearNotificationsBtn.textContent = 'Borrando...';
        
        try {
            for (const alert of unreadAlerts) {
                await fetch(`${API_BASE_URL}/alerts/${alert.id}/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
            }
            unreadAlerts = [];
            knownAlertIds.clear();
            renderNotifications();
            showToast('Notificaciones borradas', 'success');
        } catch (e) {
            console.error('Clear notifications error:', e);
            showToast('Error al borrar notificaciones', 'error');
        } finally {
            clearNotificationsBtn.textContent = 'Borrar Notificaciones';
        }
    });

    // --- Profile Logic ---
    async function loadProfileData() {
        profileNombre.value = currentUser.first_name || '';
        profileApellido.value = currentUser.last_name || '';
        if (profileEmail) profileEmail.value = currentUser.email || '';
        if (profileRole) profileRole.value = currentUser.role || '';
        profilePassword.value = '';
        profileConfirmPassword.value = '';
    }

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pwd = profilePassword.value;
        const confirmPwd = profileConfirmPassword.value;

        if (pwd && pwd !== confirmPwd) {
            showToast('Las contraseñas no coinciden', 'error');
            return;
        }

        const payload = {
            first_name: profileNombre.value.trim(),
            last_name: profileApellido.value.trim(),
        };
        if (pwd) payload.password = pwd;

        const btnText = saveProfileBtn.querySelector('.btn-text');
        const loader = saveProfileBtn.querySelector('.loader');
        
        saveProfileBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';

        try {
            const response = await fetch(`${API_BASE_URL}/portal/auth/profile/${currentUser.id}`, {
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

    // ── Settings Form ────────────────────────────────────────────────────────
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentOpenDeviceId) return;

        const payload = {};

        if (sDeviceName.value.trim()) payload.device_name = sDeviceName.value.trim();
        payload.type_device = parseInt(sTypeDevice.value);
        if (sT1.value !== '') payload.threshold_1 = parseFloat(sT1.value);
        if (sT2.value !== '') payload.threshold_2 = parseFloat(sT2.value);
        if (sT3.value !== '') payload.threshold_3 = parseFloat(sT3.value);
        payload.notifications_enabled = sNotificationsEnabled.checked;
        payload.sound_alarm_enabled = sSoundAlarm.checked;
        payload.sound_alarm_temp_low = sAlarmTempLow.checked;

        const btnText = saveSettingsBtn.querySelector('.btn-text');
        const loader = saveSettingsBtn.querySelector('.loader');
        saveSettingsBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';

        try {
            const response = await fetch(`${API_BASE_URL}/device-settings/${currentOpenDeviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error('Error al guardar los ajustes');

            const saved = await response.json();
            currentDeviceSettings = saved;

            // Update displayed thresholds immediately
            if (saved.threshold_1) detailT1.textContent = parseFloat(saved.threshold_1).toFixed(0);
            if (saved.threshold_2) detailT2.textContent = parseFloat(saved.threshold_2).toFixed(0);
            if (saved.threshold_3) detailT3.textContent = parseFloat(saved.threshold_3).toFixed(0);
            if (payload.device_name) detailDeviceName.textContent = payload.device_name;

            refreshDeviceChart(currentOpenDeviceId);
            showToast('Ajustes guardados correctamente', 'success');

        } catch (err) {
            console.error('Save settings error:', err);
            showToast(err.message, 'error');
        } finally {
            saveSettingsBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    });

    // ── Firmware Logic ───────────────────────────────────────────────────────
    let currentFirmwareDevice = null;
    let latestFirmwareVersion = null;

    async function loadFirmwareStatus(device) {
        currentFirmwareDevice = device;
        latestFirmwareVersion = null;

        // Reset UI
        fwUpdateAvailable.style.display = 'none';
        fwUpToDate.style.display = 'none';
        fwPending.style.display = 'none';
        fwCurrent.textContent = device.firmware_version || 'Desconocida';
        fwLatest.textContent = 'Consultando...';
        fwNotes.textContent = '--';

        try {
            // El endpoint de firmware NO está bajo /api
            const res = await fetch(`/firmware/check/serial_number/${device.serial_number}`);

            if (!res.ok) throw new Error('No se pudo consultar el servidor de firmware');
            const data = await res.json();

            fwLatest.textContent = data.latest_version || data.current_version || '--';
            fwNotes.textContent = data.notes || 'Sin notas';

            if (data.update) {
                latestFirmwareVersion = data.latest_version;
                fwUpdateAvailable.style.display = 'flex';
            } else {
                fwUpToDate.style.display = 'block';
            }
        } catch (e) {
            console.error('Firmware check error:', e);
            fwLatest.textContent = 'Error al consultar';
        }
    }

    fwInstallBtn.addEventListener('click', async () => {
        if (!currentFirmwareDevice || !latestFirmwareVersion) return;

        const btnText = fwInstallBtn.querySelector('.btn-text');
        const loader = fwInstallBtn.querySelector('.loader');
        fwInstallBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';

        try {
            const res = await fetch(`${API_BASE_URL}/portal/auth/firmware/request`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    serial_number: currentFirmwareDevice.serial_number,
                    version: latestFirmwareVersion,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Error al solicitar actualización');
            }

            fwUpdateAvailable.style.display = 'none';
            fwPending.style.display = 'block';
            showToast('Actualización solicitada. El dispositivo la instalará al reconectarse.', 'success');

        } catch (e) {
            console.error('OTA request error:', e);
            showToast(e.message, 'error');
        } finally {
            fwInstallBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    });

    // Audio Alert
    let audioCtx = null;

    function initAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtx) {
                audioCtx = new AudioContext();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        } catch (e) {
            console.error('Audio init error:', e);
        }
    }

    // Unlock audio on first user interaction
    document.addEventListener('click', () => {
        initAudio();
    }, { once: true });

    function playAlertSound() {
        try {
            if (!audioCtx) initAudio();
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            // Create a fire alarm siren sound (2 seconds duration)
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sawtooth'; // Harsh and piercing like a fire alarm
            
            const now = audioCtx.currentTime;
            const duration = 2.0; // 2 seconds total
            
            osc.frequency.setValueAtTime(600, now);
            
            // Fast wailing effect (up and down) 5 times in 2 seconds
            for (let t = 0; t < duration; t += 0.4) {
                osc.frequency.linearRampToValueAtTime(1200, now + t + 0.2);
                osc.frequency.linearRampToValueAtTime(600, now + t + 0.4);
            }
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1.0, now + 0.1); // Max volume
            gain.gain.setValueAtTime(1.0, now + duration - 0.1);
            gain.gain.linearRampToValueAtTime(0, now + duration);
            
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {
            console.error('No se pudo reproducir el sonido de alerta', e);
        }
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
