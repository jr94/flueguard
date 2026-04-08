import { IsBoolean, IsNotEmpty, IsNumber } from 'class-validator';

export class UpdateShareDeviceDto {
  @IsNumber()
  @IsNotEmpty()
  device_id: number;

  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @IsBoolean()
  @IsNotEmpty()
  edit: boolean;
}
