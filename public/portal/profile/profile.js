document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const profileForm = document.getElementById('profile-form');
    const profileNombre = document.getElementById('profile-nombre');
    const profileApellido = document.getElementById('profile-apellido');
    const profileEmail = document.getElementById('profile-email');
    const profileRole = document.getElementById('profile-role');
    const profilePassword = document.getElementById('profile-password');
    const profileConfirmPassword = document.getElementById('profile-confirm-password');
    const saveProfileBtn = document.getElementById('save-profile-btn');

    const currentUser = Auth.getCurrentUser();

    if (!currentUser) return;

    // Load initial profile data
    loadProfileData();

    function loadProfileData() {
        profileNombre.value = currentUser.first_name || '';
        profileApellido.value = currentUser.last_name || '';
        if (profileEmail) profileEmail.value = currentUser.email || '';
        if (profileRole) profileRole.value = currentUser.role || '';
        profilePassword.value = '';
        profileConfirmPassword.value = '';
    }

    // Submit Changes
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pwd = profilePassword.value;
        const confirmPwd = profileConfirmPassword.value;

        if (pwd && pwd !== confirmPwd) {
            Layout.showToast('Las contraseñas no coinciden', 'error');
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
        if (btnText) btnText.style.display = 'none';
        if (loader) loader.style.display = 'block';

        try {
            const response = await Api.put(`/portal/auth/profile/${currentUser.id}`, payload);
            if (!response.ok) throw new Error('Error al actualizar el perfil');

            const updatedUser = await response.json();
            
            // Merge updated profile data back into storage session
            const newUserData = { ...currentUser, ...updatedUser };
            localStorage.setItem('fg_user', JSON.stringify(newUserData));
            
            // Update UI elements instantly
            const navUserName = document.getElementById('nav-user-name');
            const sideUserName = document.getElementById('side-user-name');
            if (navUserName) navUserName.textContent = newUserData.first_name || newUserData.email;
            if (sideUserName) sideUserName.textContent = `${newUserData.first_name} ${newUserData.last_name || ''}`;

            Layout.showToast('Perfil actualizado correctamente', 'success');
            profilePassword.value = '';
            profileConfirmPassword.value = '';
        } catch (error) {
            console.error('Update profile error:', error);
            Layout.showToast(error.message, 'error');
        } finally {
            saveProfileBtn.disabled = false;
            if (btnText) btnText.style.display = 'block';
            if (loader) loader.style.display = 'none';
        }
    });
});
