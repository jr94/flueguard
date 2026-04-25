const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixColumn() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        console.log('Adding can_view_logs to portal_permissions if missing...');
        // We can't use ADD COLUMN IF NOT EXISTS easily in MySQL < 8.0.19, so we catch the error
        try {
            await connection.execute('ALTER TABLE portal_permissions ADD COLUMN can_view_logs BOOLEAN DEFAULT TRUE');
            console.log('Column can_view_logs added.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column can_view_logs already exists.');
            } else {
                throw err;
            }
        }

        // Also check for can_view_telemetry which was in the entity before
        try {
            await connection.execute('ALTER TABLE portal_permissions ADD COLUMN can_view_telemetry BOOLEAN DEFAULT TRUE');
            console.log('Column can_view_telemetry added.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column can_view_telemetry already exists.');
            } else {
                // Ignore other errors for this one
            }
        }

        console.log('Fix complete.');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await connection.end();
    }
}

fixColumn();
