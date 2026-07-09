document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const refreshBtn = document.getElementById('refresh-btn');
    const devicesLoader = document.getElementById('devices-loader');
    const noDevices = document.getElementById('no-devices');
    const deviceSearch = document.getElementById('device-search');
    const sectionsContainer = document.getElementById('devices-sections-container');
    
    // Tbodies for each section
    const listConnected = document.getElementById('devices-list-connected');
    const listCold = document.getElementById('devices-list-cold');
    const listDisconnected = document.getElementById('devices-list-disconnected');

    let currentDevices = [];
    let pollingInterval = null;

    // Check permissions
    if (!Auth.hasPermission('can_view_devices')) {
        if (devicesLoader) devicesLoader.style.display = 'none';
        if (sectionsContainer) sectionsContainer.style.display = 'none';
        if (noDevices) {
            noDevices.style.display = 'block';
            noDevices.querySelector('p').textContent = 'No tiene permiso para ver dispositivos.';
        }
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

    // Search input listener
    if (deviceSearch) {
        deviceSearch.addEventListener('input', () => {
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
            if (sectionsContainer) sectionsContainer.style.display = 'none';
            if (noDevices) noDevices.style.display = 'none';
        }

        try {
            const response = await Api.get('/telemetry/lastTemp/all');
            const data = await response.json();
            currentDevices = data;
            renderDevices(data);
        } catch (error) {
            console.error('Fetch devices error:', error);
            if (!silent) Layout.showToast(error.message, 'error');
            devicesLoader.style.display = 'none';
        }
    }

    // Render Devices Grouped by state
    function renderDevices(devicesData) {
        devicesLoader.style.display = 'none';

        // Clear existing list rows
        listConnected.innerHTML = '';
        listCold.innerHTML = '';
        listDisconnected.innerHTML = '';

        if (!devicesData || devicesData.length === 0) {
            if (sectionsContainer) sectionsContainer.style.display = 'none';
            if (noDevices) noDevices.style.display = 'block';
            return;
        }

        if (noDevices) noDevices.style.display = 'none';
        if (sectionsContainer) sectionsContainer.style.display = 'block';

        // Filtering
        const term = deviceSearch.value.toLowerCase().trim();
        const filtered = devicesData.filter(item => {
            const device = item.device;
            const matchesId = String(device.id).includes(term);
            const matchesName = device.device_name.toLowerCase().includes(term);
            const matchesSerial = device.serial_number.toLowerCase().includes(term);
            
            const stateStr = device.connection_state || '';
            let matchesCategory = false;
            if (term === 'activo' || term === 'activos') {
                matchesCategory = (stateStr === 'connected');
            } else if (term === 'frio' || term === 'frío' || term === 'modo frio' || term === 'modo frío') {
                matchesCategory = (stateStr === 'cold_idle');
            } else if (term === 'desconectado' || term === 'desconectados') {
                matchesCategory = (stateStr === 'disconnected');
            }
            
            return matchesId || matchesName || matchesSerial || matchesCategory;
        });

        // Group into sections
        const groupConnected = [];
        const groupCold = [];
        const groupDisconnected = [];

        filtered.forEach(item => {
            const state = item.device.connection_state;
            if (state === 'connected') {
                groupConnected.push(item);
            } else if (state === 'cold_idle') {
                groupCold.push(item);
            } else {
                groupDisconnected.push(item);
            }
        });

        // Render sections
        renderSectionRows(listConnected, groupConnected, 'Sin dispositivos activos');
        renderSectionRows(listCold, groupCold, 'Sin dispositivos en modo frío');
        renderSectionRows(listDisconnected, groupDisconnected, 'Sin dispositivos desconectados');
    }

    function renderSectionRows(tbodyEl, items, emptyMessage) {
        if (items.length === 0) {
            tbodyEl.innerHTML = `
                <tr>
                    <td colspan="7" style="color: var(--text-secondary); text-align: center; padding: 1.5rem; font-style: italic;">
                        ${emptyMessage}
                    </td>
                </tr>
            `;
            return;
        }

        items.forEach(item => {
            const device = item.device;
            const tempVal = item.last_temperature !== null && item.last_temperature !== undefined 
                ? parseFloat(item.last_temperature).toFixed(1) 
                : null;
            const tempText = tempVal !== null ? `${tempVal}°C` : '--';
            const trend = getTrendInfo(device.diffTemp);
            
            // Format Last Log Date/Time
            const timeAgoText = formatTimeAgo(device.minutes_since_last_log, item.last_log_time);
            
            // Get Connection State badge
            let stateBadge = '';
            if (device.connection_state === 'connected') {
                stateBadge = '<span class="badge badge-connected">Activo</span>';
            } else if (device.connection_state === 'cold_idle') {
                stateBadge = '<span class="badge badge-cold">Modo frío</span>';
            } else {
                stateBadge = '<span class="badge badge-disconnected">Desconectado</span>';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${device.id}</strong></td>
                <td><strong>${escapeHtml(device.device_name)}</strong></td>
                <td>
                    <span style="color: ${getTemperatureColor(item.last_temperature)}; font-weight: 600;">${tempText}</span>
                    ${trend.icon ? `<span style="color: ${trend.color}; font-size: 0.9rem;" title="${trend.text}">${trend.icon} ${trend.text}</span>` : ''}
                </td>
                <td style="color: var(--text-secondary);">${timeAgoText}</td>
                <td><code style="font-family: monospace;">${escapeHtml(device.serial_number)}</code></td>
                <td>${stateBadge}</td>
                <td>
                    <a href="/portal/device/${device.serial_number}" class="btn outline-btn" style="padding: 0.35rem 0.8rem; font-size: 0.85rem; text-decoration: none; display: inline-block;">
                        Entrar
                    </a>
                </td>
            `;
            tbodyEl.appendChild(tr);
        });
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

    function getTrendInfo(diffTemp) {
        if (diffTemp === 0) return { icon: '↘', text: 'bajando', color: 'var(--text-secondary)' };
        if (diffTemp === 1) return { icon: '→', text: 'estable', color: 'var(--text-secondary)' };
        if (diffTemp === 2) return { icon: '↗', text: 'subiendo', color: 'var(--warning)' };
        if (diffTemp === 3) return { icon: '↑', text: 'subiendo (acelerada)', color: 'var(--danger)' };
        if (diffTemp >= 4) return { icon: '↑', text: 'subiendo (peligrosa)', color: 'var(--danger)' };
        return { icon: '', text: 'desconocida', color: 'var(--text-secondary)' };
    }

    function formatTimeAgo(minutes, rawTime) {
        if (minutes === null || minutes === undefined || !rawTime) {
            return 'Sin registros';
        }
        if (minutes < 1) {
            return 'Hace menos de 1 min';
        }
        if (minutes < 60) {
            return `Hace ${minutes} min`;
        }
        if (minutes < 1440) {
            const hrs = Math.floor(minutes / 60);
            return `Hace ${hrs} ${hrs === 1 ? 'hora' : 'horas'}`;
        }
        // Format as general datetime for older
        const d = new Date(rawTime);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

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
