import { IsEmail, IsBoolean, IsOptional } from 'class-validator';

export class ShareDeviceDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  can_edit_settings?: boolean;

  @IsOptional()
  @IsBoolean()
  can_silence_alarm?: boolean;
}

export class UpdateDeviceShareDto {
  @IsOptional()
  @IsBoolean()
  can_edit_settings?: boolean;

  @IsOptional()
  @IsBoolean()
  can_silence_alarm?: boolean;
}
