document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dashboardView = document.getElementById('dashboard-view');
    const deviceDetailView = document.getElementById('device-detail-view');
    
    const refreshBtn = document.getElementById('refresh-btn');
    const devicesLoader = document.getElementById('devices-loader');
    const devicesGrid = document.getElementById('devices-grid');
    const noDevices = document.getElementById('no-devices');
    const deviceSearch = document.getElementById('device-search');
    
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
    const backToDevicesBtn = document.getElementById('back-to-devices-btn');

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

    let tempChart = null;
    let currentDevices = [];
    let pollingInterval = null;
    let currentOpenDeviceId = null;
    let currentDeviceSettings = null;

    // Check permissions
    if (!Auth.hasPermission('can_view_devices')) {
        devicesLoader.style.display = 'none';
        devicesGrid.style.display = 'none';
        noDevices.style.display = 'block';
        noDevices.querySelector('p').textContent = 'No tiene permiso para ver dispositivos.';
        return;
    }

    // Initialize Devices View
    fetchDevices();
    startPolling();
    
    // Explicitly start alerts polling for devices page
    if (window.Layout && typeof Layout.startAlertsPolling === 'function') {
        Layout.startAlertsPolling();
    }

    // Refresh Button Click
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchDevices();
        });
    }

    // Back to Devices list button
    if (backToDevicesBtn) {
        backToDevicesBtn.addEventListener('click', () => {
            currentOpenDeviceId = null;
            deviceDetailView.style.display = 'none';
            dashboardView.style.display = 'block';
            
            // Re-render devices to make sure it's fresh
            renderDevices(currentDevices);
        });
    }

    // Polling setup
    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => {
            if (Auth.getAccessToken()) {
                fetchDevices(true);
            }
        }, 30000);
    }

    // Fetch Devices
    async function fetchDevices(silent = false) {
        if (!silent) {
            devicesLoader.style.display = 'flex';
            devicesGrid.style.display = 'none';
            noDevices.style.display = 'none';
        }

        try {
            const response = await Api.get('/telemetry/lastTemp/all');
            const data = await response.json();
            currentDevices = data;

            // If we are looking at the list, render it. 
            // If we are looking at detail, refresh detail.
            if (dashboardView.style.display !== 'none') {
                renderDevices(data);
            } else if (deviceDetailView.style.display !== 'none' && currentOpenDeviceId) {
                const updatedDevice = data.find(item => item.device.id === currentOpenDeviceId);
                if (updatedDevice) {
                    refreshDeviceDetail(updatedDevice);
                }
            }
        } catch (error) {
            console.error('Fetch devices error:', error);
            if (!silent) Layout.showToast(error.message, 'error');
            devicesLoader.style.display = 'none';
        }
    }

    // Render Devices Grid
    function renderDevices(devicesData) {
        devicesLoader.style.display = 'none';
        devicesGrid.innerHTML = '';

        const term = deviceSearch.value.toLowerCase().trim();
        const filtered = devicesData.filter(item => 
            item.device.device_name.toLowerCase().includes(term) || 
            item.device.serial_number.toLowerCase().includes(term)
        );

        if (!filtered || filtered.length === 0) {
            noDevices.style.display = 'block';
            return;
        }

        noDevices.style.display = 'none';
        devicesGrid.style.display = 'grid';

        filtered.forEach(item => {
            const device = item.device;
            const temp = item.last_temperature ? parseFloat(item.last_temperature).toFixed(1) : '--';
            const statusClass = device.status === 'online' ? 'status-online' : 'status-offline';
            const statusText = device.status === 'online' ? 'Conectado' : 'Desconectado';

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

    // Open Device Details
    async function openDeviceDetail(deviceData, trendIcon, trendColor) {
        currentOpenDeviceId = deviceData.device.id;
        dashboardView.style.display = 'none';
        deviceDetailView.style.display = 'block';
        
        const device = deviceData.device;
        detailDeviceName.textContent = device.device_name;
        detailSerial.textContent = `SN: ${device.serial_number}`;
        
        currentDeviceSettings = null;
        detailT1.textContent = '--';
        detailT2.textContent = '--';
        detailT3.textContent = '--';

        refreshDeviceDetail(deviceData);

        // Show/hide settings based on permissions
        const canChangeSettings = Auth.hasPermission('can_change_settings');
        settingsPanel.style.display = canChangeSettings ? 'block' : 'none';

        // Fetch thresholds settings
        try {
            const response = await Api.get(`/device-settings/${device.id}`);
            if (response.ok) {
                currentDeviceSettings = await response.json();
                if (currentDeviceSettings.threshold_1) detailT1.textContent = parseFloat(currentDeviceSettings.threshold_1).toFixed(0);
                if (currentDeviceSettings.threshold_2) detailT2.textContent = parseFloat(currentDeviceSettings.threshold_2).toFixed(0);
                if (currentDeviceSettings.threshold_3) detailT3.textContent = parseFloat(currentDeviceSettings.threshold_3).toFixed(0);
                
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

                refreshDeviceChart(device.id);
            }
        } catch (e) {
            console.error('Settings fetch error:', e);
        }

        // Firmware section
        const canManageDevices = Auth.hasPermission('can_manage_devices');
        firmwareSection.style.display = canManageDevices ? 'block' : 'none';
        if (canManageDevices) {
            loadFirmwareStatus(device);
        }
    }

    // Refresh Device Detail Info
    function refreshDeviceDetail(deviceData) {
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

    // Refresh Chart Logs
    async function refreshDeviceChart(deviceId) {
        try {
            const response = await Api.get(`/telemetry/device/${deviceId}?hours=2`);
            if (response.ok) {
                const logs = await response.json();
                renderChart(logs, currentDeviceSettings);
            }
        } catch (e) {
            console.error('Chart fetch error:', e);
        }
    }

    // Render Chart.js
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
            borderColor: '#10b981',
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
                    borderColor: '#3b82f6',
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
                    borderColor: '#eab308',
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
                    borderColor: '#ef4444',
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
                        onClick: null,
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

    // Save Settings Submit Handler
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
        if (btnText) btnText.style.display = 'none';
        if (loader) loader.style.display = 'block';

        try {
            const response = await Api.put(`/device-settings/${currentOpenDeviceId}`, payload);
            if (!response.ok) throw new Error('Error al guardar los ajustes');

            const saved = await response.json();
            currentDeviceSettings = saved;

            if (saved.threshold_1) detailT1.textContent = parseFloat(saved.threshold_1).toFixed(0);
            if (saved.threshold_2) detailT2.textContent = parseFloat(saved.threshold_2).toFixed(0);
            if (saved.threshold_3) detailT3.textContent = parseFloat(saved.threshold_3).toFixed(0);
            if (payload.device_name) detailDeviceName.textContent = payload.device_name;

            refreshDeviceChart(currentOpenDeviceId);
            Layout.showToast('Ajustes guardados correctamente', 'success');
        } catch (err) {
            console.error('Save settings error:', err);
            Layout.showToast(err.message, 'error');
        } finally {
            saveSettingsBtn.disabled = false;
            if (btnText) btnText.style.display = 'block';
            if (loader) loader.style.display = 'none';
        }
    });

    // Check Firmware Status
    let currentFirmwareDevice = null;
    let latestFirmwareVersion = null;

    async function loadFirmwareStatus(device) {
        currentFirmwareDevice = device;
        latestFirmwareVersion = null;

        fwUpdateAvailable.style.display = 'none';
        fwUpToDate.style.display = 'none';
        fwPending.style.display = 'none';
        fwCurrent.textContent = device.firmware_version || 'Desconocida';
        fwLatest.textContent = 'Consultando...';
        fwNotes.textContent = '--';

        try {
            // firmware endpoint does not run under /api prefix
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

    // Install Firmware update request
    fwInstallBtn.addEventListener('click', async () => {
        if (!currentFirmwareDevice || !latestFirmwareVersion) return;

        const btnText = fwInstallBtn.querySelector('.btn-text');
        const loader = fwInstallBtn.querySelector('.loader');
        fwInstallBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (loader) loader.style.display = 'block';

        try {
            const res = await Api.post('/portal/auth/firmware/request', {
                serial_number: currentFirmwareDevice.serial_number,
                version: latestFirmwareVersion,
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Error al solicitar actualización');
            }

            fwUpdateAvailable.style.display = 'none';
            fwPending.style.display = 'block';
            Layout.showToast('Actualización solicitada. El dispositivo la instalará al reconectarse.', 'success');
        } catch (e) {
            console.error('OTA request error:', e);
            Layout.showToast(e.message, 'error');
        } finally {
            fwInstallBtn.disabled = false;
            if (btnText) btnText.style.display = 'block';
            if (loader) loader.style.display = 'none';
        }
    });

    // Real-time search filter
    deviceSearch.addEventListener('input', () => {
        renderDevices(currentDevices);
    });

    // Utility HTML Escaper
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
