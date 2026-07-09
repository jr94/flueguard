// dashboard.js — Portal Admin Dashboard
// Loads metrics from GET /api/portal/dashboard/metrics and renders 4 metric cards.

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardMetrics();
});

const chartInstances = {};

async function loadDashboardMetrics() {
    const loader = document.getElementById('dashboard-loader');
    const errorEl = document.getElementById('dashboard-error');
    const grid = document.getElementById('metrics-grid');

    if (loader) loader.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';
    if (grid) grid.style.display = 'none';

    try {
        const response = await Api.get('/portal/dashboard/metrics');
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Error ${response.status}`);
        }
        const data = await response.json();
        renderMetricCards(data);
        if (grid) grid.style.display = 'grid';
    } catch (err) {
        console.error('Dashboard metrics error:', err);
        if (errorEl) {
            errorEl.querySelector('.dashboard-error-msg').textContent =
                'No se pudieron cargar las métricas del dashboard. ' + (err.message || '');
            errorEl.style.display = 'flex';
        }
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderMetricCards(data) {
    const current = data.current || {};
    const month = data.month || {};
    const labels = month.labels || [];

    // Update current values
    const totalDevicesEl = document.getElementById('metric-total-devices');
    const totalUsersEl = document.getElementById('metric-total-users');
    const activeDevicesEl = document.getElementById('metric-active-devices');
    const disconnectedDevicesEl = document.getElementById('metric-disconnected-devices');

    if (totalDevicesEl) totalDevicesEl.textContent = formatMetricNumber(current.total_devices ?? 0);
    if (totalUsersEl) totalUsersEl.textContent = formatMetricNumber(current.total_users ?? 0);
    if (activeDevicesEl) activeDevicesEl.textContent = formatMetricNumber(current.active_devices ?? 0);
    if (disconnectedDevicesEl) disconnectedDevicesEl.textContent = formatMetricNumber(current.disconnected_devices ?? 0);

    // Render charts
    renderMetricChart('chart-total-devices', labels, month.total_devices || [], '#3b82f6');
    renderMetricChart('chart-total-users', labels, month.total_users || [], '#10b981');
    renderMetricChart('chart-active-devices', labels, month.active_devices || [], '#10b981');
    renderMetricChart('chart-disconnected-devices', labels, month.disconnected_devices || [], '#ef4444');
}

function renderMetricChart(canvasId, labels, values, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy previous instance if exists
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }

    if (!labels || labels.length === 0) {
        const container = canvas.parentElement;
        canvas.style.display = 'none';
        const msg = document.createElement('div');
        msg.className = 'metric-no-data';
        msg.textContent = 'Sin datos este mes';
        container.appendChild(msg);
        return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.4,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#94a3b8',
                    bodyColor: '#f8fafc',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 8,
                    callbacks: {
                        title: (items) => `Día ${items[0].label}`,
                        label: (item) => ` ${formatMetricNumber(item.raw)}`,
                    }
                }
            },
            scales: {
                x: {
                    display: false,
                },
                y: {
                    display: false,
                    beginAtZero: true,
                }
            },
            animation: {
                duration: 600,
                easing: 'easeInOutQuart',
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
        }
    });
}

function formatMetricNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return Number(value).toLocaleString('es-CL');
}
