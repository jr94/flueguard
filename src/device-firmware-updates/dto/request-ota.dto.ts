import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class RequestOtaDto {
  @IsString()
  @IsNotEmpty()
  serial_number: string;

  @IsString()
  @IsNotEmpty()
  version: string;

  @IsBoolean()
  @IsOptional()
  mandatory?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}
