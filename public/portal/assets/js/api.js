// api.js
const API_BASE_URL = '/api';

const Api = {
    async request(endpoint, options = {}) {
        const token = Auth.getAccessToken();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers,
            });
            
            if (response.status === 401) {
                // Session expired or token invalid
                Auth.logout();
                throw new Error('Sesión expirada');
            }
            
            return response;
        } catch (error) {
            console.error(`API request error on ${endpoint}:`, error);
            throw error;
        }
    },
    
    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    },
    
    async post(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
    },
    
    async put(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
    },
    
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }
};

window.Api = Api;
window.API_BASE_URL = API_BASE_URL;
