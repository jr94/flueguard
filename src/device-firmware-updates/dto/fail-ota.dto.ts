import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class FailOtaDto {
  @IsString()
  @IsNotEmpty()
  serial_number: string;

  @IsString()
  @IsNotEmpty()
  request_id: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  firmware_version?: string;

  @IsString()
  @IsOptional()
  model?: string;
}
