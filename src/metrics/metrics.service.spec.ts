import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceDailyMetric } from './entities/device-daily-metric.entity';
import { DeviceUsageSession } from './entities/device-usage-session.entity';
import { DevicePredictionMetric } from './entities/device-prediction-metric.entity';
import { DeviceReport } from './entities/device-report.entity';
import { DeviceSetting } from '../device-settings/entities/device-setting.entity';
import { TemperatureLog } from '../telemetry/entities/temperature-log.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MaintenanceService } from '../maintenance/maintenance.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: getRepositoryToken(DeviceDailyMetric), useValue: {} },
        { provide: getRepositoryToken(DeviceUsageSession), useValue: {} },
        { provide: getRepositoryToken(DevicePredictionMetric), useValue: {} },
        { provide: getRepositoryToken(DeviceReport), useValue: {} },
        { provide: getRepositoryToken(DeviceSetting), useValue: {} },
        { provide: getRepositoryToken(TemperatureLog), useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: MaintenanceService, useValue: {} },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  describe('calculateRiskScore', () => {
    // Helper to call private method
    const callCalculateRiskScore = (
      maxTemp: number,
      warningMin: number,
      criticalMin: number,
      level2: number,
      level3: number,
      t2: number,
      t3: number,
      maintenanceHours: number,
    ) => {
      return (service as any).calculateRiskScore(
        maxTemp,
        warningMin,
        criticalMin,
        level2,
        level3,
        t2,
        t3,
        maintenanceHours,
      );
    };

    it('should calculate normal risk when maintenanceHours < 250', () => {
      // Base score: 0
      // maintenanceHours = 249 should not add minimum risk
      const score = callCalculateRiskScore(100, 0, 0, 0, 0, 220, 330, 249);
      expect(score).toBe(0);
    });

    it('should return minimum score of 45 when maintenanceHours is exactly 250', () => {
      // Base score: 0
      // maintenanceHours = 250 should force score to 45
      const score = callCalculateRiskScore(100, 0, 0, 0, 0, 220, 330, 250);
      expect(score).toBe(45);
    });

    it('should return minimum score of 45 when maintenanceHours is 399', () => {
      const score = callCalculateRiskScore(100, 0, 0, 0, 0, 220, 330, 399);
      expect(score).toBe(45);
    });

    it('should return minimum score of 75 when maintenanceHours is exactly 400', () => {
      const score = callCalculateRiskScore(100, 0, 0, 0, 0, 220, 330, 400);
      expect(score).toBe(75);
    });

    it('should return minimum score of 75 when maintenanceHours is 450', () => {
      const score = callCalculateRiskScore(100, 0, 0, 0, 0, 220, 330, 450);
      expect(score).toBe(75);
    });

    it('should maintain higher score if temperature/alerts already exceed 75', () => {
      // maintenanceHours = 400 forces 75
      // but let's add a lot of critical minutes
      // score = 100 * 1.5 = 150 -> clamped to 100
      const score = callCalculateRiskScore(100, 0, 100, 0, 0, 220, 330, 400);
      expect(score).toBeGreaterThan(75);
      expect(score).toBe(100);
    });

    it('should maintain higher score if it was already above 45 for preventive maintenance', () => {
      // maintenanceHours = 250 forces 45
      // score = 50 * 1.5 = 75
      const score = callCalculateRiskScore(100, 0, 50, 0, 0, 220, 330, 250);
      expect(score).toBe(75);
    });
  });
});
