import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateDeviceDto {
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @IsString()
  @IsNotEmpty()
  serial_number: string;

  @IsString()
  @IsNotEmpty()
  device_name: string;

  @IsString()
  @IsOptional()
  FW_VERSION?: string;
}
