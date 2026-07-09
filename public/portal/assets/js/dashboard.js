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
    const month   = data.month   || {};
    const last24h = data.last24h || {};

    const monthLabels    = month.labels    || [];
    const last24hLabels  = last24h.labels  || [];

    // Update current values
    const els = {
        'metric-total-devices':       current.total_devices       ?? 0,
        'metric-total-users':         current.total_users         ?? 0,
        'metric-active-devices':      current.active_devices      ?? 0,
        'metric-disconnected-devices':current.disconnected_devices ?? 0,
    };
    for (const [id, val] of Object.entries(els)) {
        const el = document.getElementById(id);
        if (el) el.textContent = formatMetricNumber(val);
    }

    // Render charts — monthly
    renderMetricChart('chart-total-devices',   monthLabels, month.total_devices   || [], '#3b82f6');
    renderMetricChart('chart-total-users',     monthLabels, month.total_users     || [], '#10b981');

    // Render charts — last 24h
    renderMetricChart('chart-active-devices',      last24hLabels, last24h.active_devices      || [], '#22c55e');
    renderMetricChart('chart-disconnected-devices',last24hLabels, last24h.disconnected_devices || [], '#ef4444');
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
        // Avoid duplicate "no data" messages
        if (!container.querySelector('.metric-no-data')) {
            const msg = document.createElement('div');
            msg.className = 'metric-no-data';
            msg.textContent = 'Sin datos';
            container.appendChild(msg);
        }
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
                backgroundColor: color + '22',
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
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    padding: 8,
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        maxTicksLimit: 6,
                        maxRotation: 0,
                    },
                    border: { display: false },
                },
                y: {
                    display: true,
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(148,163,184,0.07)',
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        precision: 0,
                        maxTicksLimit: 4,
                    },
                    border: { display: false },
                }
            },
            animation: {
                duration: 500,
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
