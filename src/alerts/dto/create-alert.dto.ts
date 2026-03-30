import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateAlertDto {
  @IsNumber()
  @IsNotEmpty()
  device_id: number;

  @IsNumber()
  @IsNotEmpty()
  temperature: number;

  @IsString()
  @IsNotEmpty()
  alert_level: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
