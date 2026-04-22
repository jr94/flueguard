import { IsString, IsNotEmpty } from 'class-validator';

export class RemoveDeviceDto {
  @IsString()
  @IsNotEmpty({ message: 'serial_number is required' })
  serial_number: string;
}
