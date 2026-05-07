import { IsOptional, IsEnum, IsDateString } from 'class-validator';

export class GetSessionsRangeDto {
  @IsEnum(['today', '7d', '30d', 'custom'])
  range: 'today' | '7d' | '30d' | 'custom';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
