const mysql = require('mysql2/promise');
require('dotenv').config();

async function listTables() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        const [rows] = await connection.execute('SHOW TABLES');
        console.log('Tables:', rows.map(r => Object.values(r)[0]));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await connection.end();
    }
}

listTables();
