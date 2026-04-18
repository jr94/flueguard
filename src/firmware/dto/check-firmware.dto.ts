import { IsOptional, IsString } from 'class-validator';

export class CheckFirmwareDto {
  @IsString()
  version: string;

  @IsOptional()
  @IsString()
  serial_number?: string;

  @IsOptional()
  @IsString()
  model?: string;
}
