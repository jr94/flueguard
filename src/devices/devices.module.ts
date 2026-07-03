import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { Device } from './entities/device.entity';
import { UserDevice } from './entities/user-device.entity';
import { UsersModule } from '../users/users.module';

import { UserDevicesController } from './user-devices.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, UserDevice, DeviceSetting]),
    UsersModule,
    SubscriptionsModule,
    forwardRef(() => MaintenanceModule),
  ],
  controllers: [DevicesController, UserDevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
