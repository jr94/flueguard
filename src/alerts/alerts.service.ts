import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
  ) {}

  async create(createAlertDto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create(createAlertDto);
    return this.alertRepository.save(alert);
  }

  async findByDeviceId(deviceId: number): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { device_id: deviceId },
      order: { created_at: 'DESC' },
    });
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
