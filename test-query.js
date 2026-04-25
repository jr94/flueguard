const mysql = require('mysql2/promise');
require('dotenv').config();

async function testQuery() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1', 
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    try {
        const [rows] = await connection.execute('SELECT `PortalUser`.`id` AS `PortalUser_id`, `PortalUser`.`first_name` AS `PortalUser_first_name`, `PortalUser`.`last_name` AS `PortalUser_last_name`, `PortalUser`.`email` AS `PortalUser_email`, `PortalUser`.`password` AS `PortalUser_password`, `PortalUser`.`role` AS `PortalUser_role`, `PortalUser`.`is_active` AS `PortalUser_is_active`, `PortalUser`.`last_login_at` AS `PortalUser_last_login_at`, `PortalUser`.`created_at` AS `PortalUser_created_at`, `PortalUser`.`updated_at` AS `PortalUser_updated_at`, `PortalUser_permissions`.`id` AS `PortalUser_permissions_id`, `PortalUser_permissions`.`portal_user_id` AS `PortalUser_permissions_portal_user_id`, `PortalUser_permissions`.`can_view_dashboard` AS `PortalUser_permissions_can_view_dashboard`, `PortalUser_permissions`.`can_view_devices` AS `PortalUser_permissions_can_view_devices`, `PortalUser_permissions`.`can_view_telemetry` AS `PortalUser_permissions_can_view_telemetry`, `PortalUser_permissions`.`can_view_alerts` AS `PortalUser_permissions_can_view_alerts`, `PortalUser_permissions`.`can_view_logs` AS `PortalUser_permissions_can_view_logs`, `PortalUser_permissions`.`can_manage_devices` AS `PortalUser_permissions_can_manage_devices`, `PortalUser_permissions`.`can_manage_users` AS `PortalUser_permissions_can_manage_users`, `PortalUser_permissions`.`can_change_settings` AS `PortalUser_permissions_can_change_settings`, `PortalUser_permissions`.`created_at` AS `PortalUser_permissions_created_at`, `PortalUser_permissions`.`updated_at` AS `PortalUser_permissions_updated_at` FROM `portal_users` `PortalUser` LEFT JOIN `portal_permissions` `PortalUser_permissions` ON `PortalUser_permissions`.`portal_user_id`=`PortalUser`.`id` WHERE (`PortalUser`.`email` = ?) LIMIT 1', ['jose.riquelme94@gmail.com']);
        console.log('Query success! Rows:', rows.length);
    } catch (e) {
        console.error('Query Failed:', e.message);
    } finally {
        await connection.end();
    }
}

testQuery();
