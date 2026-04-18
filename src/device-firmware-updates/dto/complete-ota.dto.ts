import { IsString, IsNotEmpty } from 'class-validator';

export class CompleteOtaDto {
  @IsString()
  @IsNotEmpty()
  serial_number: string;

  @IsString()
  @IsNotEmpty()
  request_id: string;
}
