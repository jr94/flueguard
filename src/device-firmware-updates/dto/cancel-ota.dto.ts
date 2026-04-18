import { IsString, IsNotEmpty } from 'class-validator';

export class CancelOtaDto {
  @IsString()
  @IsNotEmpty()
  serial_number: string;
}
