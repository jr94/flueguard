import { IsOptional, IsString } from 'class-validator';

export class GetDeviceSettingsQueryDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  firmware_version?: string;
}
