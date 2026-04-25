const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTables() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        console.log('Creating portal_users...');
        await connection.execute('CREATE TABLE IF NOT EXISTS portal_users (id INT AUTO_INCREMENT PRIMARY KEY, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100), email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role ENUM("admin", "monitor") DEFAULT "monitor", is_active BOOLEAN DEFAULT TRUE, last_login_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB');

        console.log('Creating portal_permissions...');
        await connection.execute('CREATE TABLE IF NOT EXISTS portal_permissions (id INT AUTO_INCREMENT PRIMARY KEY, portal_user_id INT NOT NULL, can_view_dashboard BOOLEAN DEFAULT TRUE, can_view_devices BOOLEAN DEFAULT TRUE, can_view_telemetry BOOLEAN DEFAULT TRUE, can_view_alerts BOOLEAN DEFAULT TRUE, can_view_logs BOOLEAN DEFAULT TRUE, can_manage_devices BOOLEAN DEFAULT FALSE, can_manage_users BOOLEAN DEFAULT FALSE, can_change_settings BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_portal_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE) ENGINE=InnoDB');

        console.log('Inserting admin user...');
        await connection.execute('INSERT IGNORE INTO portal_users (first_name, last_name, email, password, role, is_active) VALUES ("jose", "Riquelme", "jose.riquelme94@gmail.com", "#Peuco1994", "admin", 1)');

        const [rows] = await connection.execute('SELECT id FROM portal_users WHERE email = ?', ['jose.riquelme94@gmail.com']);
        if (rows.length > 0) {
            const userId = rows[0].id;
            console.log('Inserting permissions for admin...');
            await connection.execute('INSERT IGNORE INTO portal_permissions (portal_user_id, can_view_dashboard, can_view_devices, can_view_telemetry, can_view_alerts, can_view_logs, can_manage_devices, can_manage_users, can_change_settings) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1)', [userId]);
        }

        console.log('Database setup complete.');
    } catch (e) {
        console.error('Setup Error:', e.message);
    } finally {
        await connection.end();
    }
}

createTables();
