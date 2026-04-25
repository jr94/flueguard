const mysql = require('mysql2/promise');
require('dotenv').config();

async function describeTable() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        const [rows] = await connection.execute('DESCRIBE portal_permissions');
        console.log('Columns in portal_permissions:');
        rows.forEach(r => console.log(`- ${r.Field} (${r.Type})`));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await connection.end();
    }
}

describeTable();
