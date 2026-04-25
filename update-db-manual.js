const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateDb() {
    // Try 127.0.0.1 if localhost fails
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        console.log('Adding can_view_logs column...');
        await connection.execute('ALTER TABLE portal_permissions ADD COLUMN can_view_logs BOOLEAN DEFAULT TRUE AFTER can_view_alerts');
        console.log('Column added successfully.');
    } catch (e) {
        console.error('DB Update Error:', e.message);
    } finally {
        await connection.end();
    }
}

updateDb();
