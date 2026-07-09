// auth.js
const Auth = {
    getAccessToken() {
        return localStorage.getItem('fg_access_token');
    },

    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('fg_user') || 'null');
        } catch (e) {
            console.error('Error parsing fg_user from localStorage', e);
            return null;
        }
    },

    getPermissions() {
        try {
            return JSON.parse(localStorage.getItem('fg_permissions') || 'null');
        } catch (e) {
            console.error('Error parsing fg_permissions from localStorage', e);
            return null;
        }
    },

    hasPermission(perm) {
        const user = this.getCurrentUser();
        const permissions = this.getPermissions();
        if (user && user.role === 'admin') return true;
        if (!permissions) return false;
        return !!permissions[perm];
    },

    isLoggedIn() {
        return !!this.getAccessToken() && !!this.getCurrentUser();
    },

    checkAuth() {
        const token = this.getAccessToken();
        const user = this.getCurrentUser();
        const isMain = window.location.pathname === '/portal' || window.location.pathname === '/portal/' || window.location.pathname.endsWith('/portal/index.html');
        
        if (!token || !user) {
            if (!isMain) {
                // Si no hay sesión y la ruta actual NO es /portal, redirigir a /portal
                window.location.replace(this.getPortalRootPath());
                return false;
            }
            // Si no hay sesión y la ruta actual ES /portal, permitir mostrar login (retorna false)
            return false;
        }
        
        return true;
    },

    getPortalRootPath() {
        return '/portal';
    },

    login(token, user) {
        localStorage.setItem('fg_access_token', token);
        localStorage.setItem('fg_user', JSON.stringify(user));
        localStorage.setItem('fg_permissions', JSON.stringify(user.permissions || null));
    },

    logout() {
        localStorage.removeItem('fg_access_token');
        localStorage.removeItem('fg_user');
        localStorage.removeItem('fg_permissions');
        window.location.replace(this.getPortalRootPath());
    }
};

// Ejecutar checkAuth de inmediato para evitar destellos de interfaz en páginas protegidas
if (window.location.pathname !== '/portal' && window.location.pathname !== '/portal/' && !window.location.pathname.endsWith('/portal/index.html')) {
    Auth.checkAuth();
}

window.Auth = Auth;
