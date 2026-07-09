document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const monUserSearch = document.getElementById('mon-user-search');
    const addMonUserBtn = document.getElementById('add-mon-user-btn');
    
    // Modal elements
    const userModal = document.getElementById('user-modal');
    const userForm = document.getElementById('user-form');
    const closeUserModal = document.getElementById('close-user-modal');
    const cancelUserBtn = document.getElementById('cancel-user-btn');
    
    const uId = document.getElementById('u-id');
    const uFirstName = document.getElementById('u-first-name');
    const uLastName = document.getElementById('u-last-name');
    const uEmail = document.getElementById('u-email');
    const uPassword = document.getElementById('u-password');
    const uPwHint = document.getElementById('u-pw-hint');
    const uRole = document.getElementById('u-role');
    const uActive = document.getElementById('u-active');
    const saveUserBtn = document.getElementById('save-user-btn');

    // Permission Checkboxes
    const permViewDash = document.getElementById('p-view-dash');
    const permViewDev = document.getElementById('p-view-dev');
    const permChangeSet = document.getElementById('p-change-set');
    const permManageDev = document.getElementById('p-manage-dev');
    const permViewTelemetry = document.getElementById('p-view-telemetry');
    const permViewAlerts = document.getElementById('p-view-alerts');
    const permManageUsers = document.getElementById('p-manage-users');

    let currentMonUsers = [];

    // Initialize Page
    fetchMonUsers();

    // Event Listeners
    if (addMonUserBtn) {
        addMonUserBtn.addEventListener('click', () => openUserModalForAdd());
    }

    if (closeUserModal) {
        closeUserModal.addEventListener('click', () => userModal.classList.remove('show'));
    }

    if (cancelUserBtn) {
        cancelUserBtn.addEventListener('click', () => userModal.classList.remove('show'));
    }

    // Search filter input
    monUserSearch.addEventListener('input', () => {
        renderMonUsers(currentMonUsers);
    });

    // Form Submit
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = uId.value;
        const isEdit = !!id;
        
        const payload = {
            first_name: uFirstName.value.trim(),
            last_name: uLastName.value.trim(),
            email: uEmail.value.trim(),
            role: uRole.value,
            is_active: uActive.value === '1',
            permissions: {
                can_view_dashboard: true,
                can_view_devices: permViewDev.checked,
                can_change_settings: permChangeSet.checked,
                can_manage_devices: permManageDev.checked,
                can_view_telemetry: permViewTelemetry.checked,
                can_view_alerts: permViewAlerts.checked,
                can_manage_users: permManageUsers.checked,
            }
        };

        if (uPassword.value) {
            if (uPassword.value.length < 6) {
                Layout.showToast('La contraseña debe tener al menos 6 caracteres', 'error');
                return;
            }
            payload.password = uPassword.value;
        }

        const btnText = saveUserBtn.querySelector('.btn-text');
        const loader = saveUserBtn.querySelector('.loader');
        saveUserBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (loader) loader.style.display = 'block';

        try {
            const response = isEdit 
                ? await Api.put(`/portal/auth/monitoring-users/${id}`, payload)
                : await Api.post('/portal/auth/monitoring-users', payload);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Error al guardar monitor');
            }

            Layout.showToast(isEdit ? 'Monitor actualizado correctamente' : 'Monitor creado correctamente', 'success');
            userModal.classList.remove('show');
            fetchMonUsers();
        } catch (error) {
            console.error('Save monitor error:', error);
            Layout.showToast(error.message, 'error');
        } finally {
            saveUserBtn.disabled = false;
            if (btnText) btnText.style.display = 'block';
            if (loader) loader.style.display = 'none';
        }
    });

    // Fetch Monitoring Users
    async function fetchMonUsers() {
        try {
            const res = await Api.get('/portal/auth/monitoring-users');
            if (!res.ok) throw new Error('Error al cargar monitores');
            currentMonUsers = await res.json();
            renderMonUsers(currentMonUsers);
        } catch (e) {
            console.error('Fetch Mon Users error:', e);
            Layout.showToast(e.message, 'error');
        }
    }

    // Render Users Table
    function renderMonUsers(users) {
        const tbody = document.getElementById('mon-users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const term = monUserSearch.value.toLowerCase().trim();
        const filtered = users.filter(u => 
            u.first_name.toLowerCase().includes(term) || 
            (u.last_name && u.last_name.toLowerCase().includes(term)) || 
            u.email.toLowerCase().includes(term)
        );

        filtered.forEach(u => {
            const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Nunca';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name || '')}</td>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="role-badge">${escapeHtml(u.role)}</span></td>
                <td>${lastLogin}</td>
                <td>
                    <span class="badge ${u.is_active ? 'badge-active' : 'badge-inactive'}">
                        ${u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td class="actions-cell">
                    <button class="btn icon-btn edit-mon-btn" data-id="${u.id}">✏️</button>
                    <button class="btn icon-btn delete-mon-btn text-danger" data-id="${u.id}">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners
        tbody.querySelectorAll('.edit-mon-btn').forEach(btn => {
            btn.addEventListener('click', () => openUserModalForEdit(btn.dataset.id));
        });
        tbody.querySelectorAll('.delete-mon-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUser(btn.dataset.id));
        });
    }

    // Open Modal for Add
    function openUserModalForAdd() {
        userForm.reset();
        uId.value = '';
        uPassword.required = true;
        uPwHint.textContent = 'Obligatorio (mínimo 6 caracteres)';
        document.getElementById('user-modal-title').textContent = 'Nuevo Monitor';
        userModal.classList.add('show');
        
        // Default permissions
        permViewDev.checked = true;
        permChangeSet.checked = false;
        permManageDev.checked = false;
        permViewTelemetry.checked = true;
        permViewAlerts.checked = true;
        permManageUsers.checked = false;
    }

    // Open Modal for Edit
    function openUserModalForEdit(id) {
        const user = currentMonUsers.find(u => u.id == id);
        if (!user) return;

        uId.value = user.id;
        uFirstName.value = user.first_name;
        uLastName.value = user.last_name || '';
        uEmail.value = user.email;
        uPassword.required = false;
        uPassword.value = '';
        uPwHint.textContent = 'Deje en blanco para no cambiar';
        uRole.value = user.role;
        uActive.value = user.is_active ? '1' : '0';
        
        // Set permissions checkboxes
        const p = user.permissions || {};
        permViewDev.checked = !!p.can_view_devices;
        permChangeSet.checked = !!p.can_change_settings;
        permManageDev.checked = !!p.can_manage_devices;
        permViewTelemetry.checked = !!p.can_view_telemetry;
        permViewAlerts.checked = !!p.can_view_alerts;
        permManageUsers.checked = !!p.can_manage_users;

        document.getElementById('user-modal-title').textContent = 'Editar Monitor';
        userModal.classList.add('show');
    }

    // Delete User Action
    async function deleteUser(id) {
        if (!confirm('¿Está seguro de eliminar este usuario?')) return;
        
        try {
            const res = await Api.delete(`/portal/auth/monitoring-users/${id}`);
            if (!res.ok) throw new Error('Error al eliminar el usuario');
            Layout.showToast('Monitor eliminado correctamente', 'success');
            fetchMonUsers();
        } catch (e) {
            console.error('Delete monitor error:', e);
            Layout.showToast(e.message, 'error');
        }
    }

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
