import { IsBoolean, IsNumber, IsOptional, IsString, IsInt, MaxLength } from 'class-validator';

export class UpdateDeviceSettingDto {
  @IsOptional()
  @IsString()
  device_name?: string;

  @IsOptional()
  @IsInt()
  region_id?: number | null;

  @IsOptional()
  @IsInt()
  comuna_id?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string | null;


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
