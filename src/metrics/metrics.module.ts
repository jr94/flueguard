import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { DeviceDailyMetric } from './entities/device-daily-metric.entity';
import { DeviceUsageSession } from './entities/device-usage-session.entity';
import { DevicePredictionMetric } from './entities/device-prediction-metric.entity';
import { DeviceReport } from './entities/device-report.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DeviceSettingsModule } from '../device-settings/device-settings.module';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceDailyMetric,
      DeviceUsageSession,
      DevicePredictionMetric,
      DeviceReport,
      DeviceSetting,
      TemperatureLog,
    ]),
    SubscriptionsModule,
    DeviceSettingsModule,
    forwardRef(() => MaintenanceModule),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
