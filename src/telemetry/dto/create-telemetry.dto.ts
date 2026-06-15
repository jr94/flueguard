import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateTelemetryDto {
  @IsString()
  @IsNotEmpty()
  serial_number: string;

  @IsNumber()
  @IsNotEmpty()
  temperature: number;

  @IsOptional()
  alert_level?: string | number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  firmware_version?: string;
}
