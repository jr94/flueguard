import { IsString, IsNotEmpty } from 'class-validator';

export class StartOtaDto {
  @IsString()
  @IsNotEmpty()
  serial_number: string;

  @IsString()
  @IsNotEmpty()
  request_id: string;
}
