import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateDeviceSettingDto {
  @IsOptional()
  @IsString()
  device_name?: string;

  @IsOptional()
  @IsNumber()
  type_device?: number;

  @IsOptional()
  @IsNumber()
  threshold_1?: number;

  @IsOptional()
  @IsNumber()
  threshold_2?: number;

  @IsOptional()
  @IsNumber()
  threshold_3?: number;

  @IsOptional()
  @IsBoolean()
  notifications_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sound_alarm_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sound_alarm_temp_low?: boolean;
}
