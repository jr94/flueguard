import { IsEmail, IsNotEmpty, IsNumber } from 'class-validator';

export class ShareDeviceDto {
  @IsNumber()
  @IsNotEmpty()
  device_id: number;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}
