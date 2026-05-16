import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';

export class GetMetricsRangeDto {
  @IsEnum(['today', '7d', '30d', 'custom', 'hour', '1h'])
  range: 'today' | '7d' | '30d' | 'custom' | 'hour' | '1h';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
