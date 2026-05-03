import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { Device } from '../devices/entities/device.entity';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  async create(createAlertDto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create({
      ...createAlertDto,
      is_read: true,
    });
    return this.alertRepository.save(alert);
  }

  async findByDeviceId(deviceId: number): Promise<any[]> {
    const alerts = await this.alertRepository.find({
      where: { device_id: deviceId },
      order: { created_at: 'DESC' },
    });

    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    const deviceName = device?.device_name || 'Desconocido';

    return alerts.map(alert => ({
      id: alert.id,
      device_id: alert.device_id,
      temperature: alert.temperature,
      alert_level: alert.alert_level,
      alert_type: alert.alert_type,
      message: alert.message,
      is_read: alert.is_read,
      created_at: alert.created_at,
      device_name: deviceName
    }));
  }

  async hasRecentPredictiveAlert(deviceId: number, alertLevel: string, minutes: number = 10): Promise<boolean> {
    const pastDate = new Date();
    pastDate.setMinutes(pastDate.getMinutes() - minutes);

    const alert = await this.alertRepository.findOne({
      where: {
        device_id: deviceId,
        alert_level: alertLevel,
        alert_type: `PREDICTIVE_LEVEL_${alertLevel}`
      },
      order: { created_at: 'DESC' }
    });

    if (!alert) return false;
    return new Date(alert.created_at) >= pastDate;
  }

  async markAsRead(id: number): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id } });
    
    if (!alert) {
      throw new NotFoundException(`Alert with ID ${id} not found`);
    }

    alert.is_read = true;
    return this.alertRepository.save(alert);
  }
}
