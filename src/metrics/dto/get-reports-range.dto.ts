import { IsEnum } from 'class-validator';

export class GetReportsRangeDto {
  @IsEnum(['weekly', 'monthly'])
  type: 'weekly' | 'monthly';
}
