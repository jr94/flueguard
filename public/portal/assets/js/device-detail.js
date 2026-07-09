document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const deviceLoader = document.getElementById('device-loader');
    const deviceError = document.getElementById('device-error');
    const errorTitle = document.getElementById('error-title');
    const errorMsg = document.getElementById('error-msg');
    const detailContainer = document.getElementById('device-detail-container');
    
    // Details Display elements
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

    let tempChart = null;
    let currentDevice = null;
    let currentDeviceSettings = null;
    let pollingInterval = null;

    // 1. Get serial number from path: /portal/device/{serial_number}
    const pathParts = window.location.pathname.split('/');
    // Get last non-empty part
    const serialNumber = pathParts.filter(p => p !== '').pop();

    if (!serialNumber) {
        showError('URL Inválida', 'No se ha proporcionado un número de serie.');
        return;
    }

    // Initialize View
    init();

    async function init() {
        // Explicitly start alerts polling if available (so header updates)
        if (window.Layout && typeof Layout.startAlertsPolling === 'function') {
            Layout.startAlertsPolling();
        }

        await fetchDeviceDetails(false);
        startPolling();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => {
            if (Auth.getAccessToken() && currentDevice) {
                fetchDeviceDetails(true);
            }
        }, 30000);
    }

    function showError(title, message) {
        if (deviceLoader) deviceLoader.style.display = 'none';
        if (detailContainer) detailContainer.style.display = 'none';
        if (deviceError) {
            deviceError.style.display = 'block';
            if (errorTitle) errorTitle.textContent = title;
            if (errorMsg) errorMsg.textContent = message;
        }
    }

    async function fetchDeviceDetails(silent = false) {
        if (!silent) {
            deviceLoader.style.display = 'flex';
            detailContainer.style.display = 'none';
            deviceError.style.display = 'none';
        }

        try {
            // Fetch device basic data and connections status by serial
            const response = await Api.get(`/devices/serial/${serialNumber}`);
            if (!response.ok) {
                if (response.status === 404) {
                    showError('Dispositivo No Encontrado', `No existe una estufa registrada con el número de serie ${serialNumber}.`);
                } else if (response.status === 403 || response.status === 401) {
                    showError('Acceso Denegado', 'No tiene permisos para ver los detalles de este dispositivo.');
                } else {
                    showError('Error', 'Ha ocurrido un error al cargar la información.');
                }
                return;
            }

            const device = await response.json();
            currentDevice = device;

            // Render details
            renderDeviceDetail(device);

            // Populate form and chart settings
            if (!silent) {
                // Show/hide settings based on permissions
                const canChangeSettings = Auth.hasPermission('can_change_settings');
                settingsPanel.style.display = canChangeSettings ? 'block' : 'none';

                // Fetch thresholds settings
                try {
                    const settingsRes = await Api.get(`/device-settings/${device.id}`);
                    if (settingsRes.ok) {
                        currentDeviceSettings = await settingsRes.json();
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

            // Refresh Chart Logs
            await refreshDeviceChart(device.id);

            deviceLoader.style.display = 'none';
            detailContainer.style.display = 'block';

        } catch (error) {
            console.error('Fetch device detail error:', error);
            if (!silent) {
                showError('Error de Conexión', 'No se pudo conectar con el servidor.');
                Layout.showToast(error.message, 'error');
            }
        }
    }

    // Render device status cards
    function renderDeviceDetail(device) {
        detailDeviceName.textContent = device.device_name;
        detailSerial.textContent = `SN: ${device.serial_number}`;

        detailDeviceStatus.textContent = device.status === 'online' ? 'Conectado' : 'Desconectado';
        detailDeviceStatus.className = 'device-status ' + (device.status === 'online' ? 'status-online' : 'status-offline');
        
        let trendColor = '';
        let trendText = '';
        let trendIcon = '';
        if (device.diffTemp === 0) {
            trendIcon = '↘';
            trendText = 'Temperatura bajando';
            trendColor = 'var(--text-secondary)';
        } else if (device.diffTemp === 1) {
            trendIcon = '→';
            trendText = 'Temperatura estable';
            trendColor = 'var(--text-secondary)';
        } else if (device.diffTemp === 2) {
            trendIcon = '↗';
            trendText = 'Temperatura subiendo';
            trendColor = 'var(--warning)';
        } else if (device.diffTemp === 3) {
            trendIcon = '↑';
            trendText = 'Subiendo (acelerada)';
            trendColor = 'var(--danger)';
        } else if (device.diffTemp >= 4) {
            trendIcon = '↑';
            trendText = 'Subiendo (peligrosa)';
            trendColor = 'var(--danger)';
        } else {
            trendIcon = '';
            trendText = 'Tendencia de temperatura';
            trendColor = 'var(--text-secondary)';
        }

        detailTemp.textContent = formatTemperature(device.last_temperature);
        detailTemp.style.color = getTemperatureColor(device.last_temperature);
        detailTrend.textContent = `${trendIcon} ${trendText}`;
        detailTrend.style.color = trendColor;

        if (device.last_log_time) {
            const date = new Date(device.last_log_time);
            detailLastUpdate.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString();
        } else {
            detailLastUpdate.textContent = 'Sin registros';
        }
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
        if (!currentDevice) return;

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
            const response = await Api.put(`/device-settings/${currentDevice.id}`, payload);
            if (!response.ok) throw new Error('Error al guardar los ajustes');

            const saved = await response.json();
            currentDeviceSettings = saved;

            if (saved.threshold_1) detailT1.textContent = parseFloat(saved.threshold_1).toFixed(0);
            if (saved.threshold_2) detailT2.textContent = parseFloat(saved.threshold_2).toFixed(0);
            if (saved.threshold_3) detailT3.textContent = parseFloat(saved.threshold_3).toFixed(0);
            if (payload.device_name) detailDeviceName.textContent = payload.device_name;

            await refreshDeviceChart(currentDevice.id);
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
        }
    });

    function formatTemperature(temp) {
        if (temp === null || temp === undefined) {
            return '-- °C';
        }
        const value = parseFloat(temp);
        if (isNaN(value)) {
            return '-- °C';
        }
        return `${value.toFixed(1)}°C`;
    }

    function getTemperatureColor(temp) {
        if (temp === null || temp === undefined) {
            return 'var(--text-secondary)';
        }
        const value = parseFloat(temp);
        if (isNaN(value)) {
            return 'var(--text-secondary)';
        }
        if (value > 300) {
            return 'var(--danger)';
        }
        if (value > 250) {
            return 'var(--warning)';
        }
        return 'var(--success)';
    }
});
