document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fgUserSearch = document.getElementById('fg-user-search');
    const addFgUserBtn = document.getElementById('add-fg-user-btn');
    
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
    const saveUserBtn = document.getElementById('save-user-btn');

    let currentFgUsers = [];

    // Initialize Page
    fetchFgUsers();

    // Event Listeners
    if (addFgUserBtn) {
        addFgUserBtn.addEventListener('click', () => openUserModalForAdd());
    }

    if (closeUserModal) {
        closeUserModal.addEventListener('click', () => userModal.classList.remove('show'));
    }

    if (cancelUserBtn) {
        cancelUserBtn.addEventListener('click', () => userModal.classList.remove('show'));
    }

    // Search filter input
    fgUserSearch.addEventListener('input', () => {
        renderFgUsers(currentFgUsers);
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
                ? await Api.put(`/portal/auth/flueguard-users/${id}`, payload)
                : await Api.post('/portal/auth/flueguard-users', payload);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Error al guardar usuario');
            }

            Layout.showToast(isEdit ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success');
            userModal.classList.remove('show');
            fetchFgUsers();
        } catch (error) {
            console.error('Save user error:', error);
            Layout.showToast(error.message, 'error');
        } finally {
            saveUserBtn.disabled = false;
            if (btnText) btnText.style.display = 'block';
            if (loader) loader.style.display = 'none';
        }
    });

    // Fetch FlueGuard Users
    async function fetchFgUsers() {
        try {
            const res = await Api.get('/portal/auth/flueguard-users');
            if (!res.ok) throw new Error('Error al cargar los usuarios de FlueGuard');
            currentFgUsers = await res.json();
            renderFgUsers(currentFgUsers);
        } catch (e) {
            console.error('Fetch FG Users error:', e);
            Layout.showToast(e.message, 'error');
        }
    }

    // Render Users Table
    function renderFgUsers(users) {
        const tbody = document.getElementById('fg-users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const term = fgUserSearch.value.toLowerCase().trim();
        const filtered = users.filter(u => 
            u.first_name.toLowerCase().includes(term) || 
            (u.last_name && u.last_name.toLowerCase().includes(term)) || 
            u.email.toLowerCase().includes(term)
        );

        filtered.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(u.first_name)}</td>
                <td>${escapeHtml(u.last_name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>
                    <span class="badge ${u.is_active ? 'badge-active' : 'badge-inactive'}">
                        ${u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td class="actions-cell">
                    <button class="btn icon-btn edit-fg-btn" data-id="${u.id}">✏️</button>
                    <button class="btn icon-btn delete-fg-btn text-danger" data-id="${u.id}">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners
        tbody.querySelectorAll('.edit-fg-btn').forEach(btn => {
            btn.addEventListener('click', () => openUserModalForEdit(btn.dataset.id));
        });
        tbody.querySelectorAll('.delete-fg-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUser(btn.dataset.id));
        });
    }

    // Open Modal for Add
    function openUserModalForAdd() {
        userForm.reset();
        uId.value = '';
        uPassword.required = true;
        uPwHint.textContent = 'Obligatorio (mínimo 6 caracteres)';
        document.getElementById('user-modal-title').textContent = 'Nuevo Usuario FlueGuard';
        userModal.classList.add('show');
    }

    // Open Modal for Edit
    function openUserModalForEdit(id) {
        const user = currentFgUsers.find(u => u.id == id);
        if (!user) return;

        uId.value = user.id;
        uFirstName.value = user.first_name;
        uLastName.value = user.last_name || '';
        uEmail.value = user.email;
        uPassword.required = false;
        uPassword.value = '';
        uPwHint.textContent = 'Deje en blanco para no cambiar';
        document.getElementById('user-modal-title').textContent = 'Editar Usuario FlueGuard';
        userModal.classList.add('show');
    }

    // Delete User Action
    async function deleteUser(id) {
        if (!confirm('¿Está seguro de eliminar este usuario?')) return;
        
        try {
            const res = await Api.delete(`/portal/auth/flueguard-users/${id}`);
            if (!res.ok) throw new Error('Error al eliminar el usuario');
            Layout.showToast('Usuario eliminado correctamente', 'success');
            fetchFgUsers();
        } catch (e) {
            console.error('Delete user error:', e);
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
