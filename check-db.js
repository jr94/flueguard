const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDb() {
    const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        const [rows] = await connection.execute('SELECT * FROM portal_users');
        console.log('Portal Users count:', rows.length);
        console.log('User emails:', rows.map(r => r.email));
        
        const [permRows] = await connection.execute('SELECT * FROM portal_permissions');
        console.log('Permissions count:', permRows.length);
    } catch (e) {
        console.error('DB Error:', e.message);
    } finally {
        await connection.end();
    }
}

checkDb();
