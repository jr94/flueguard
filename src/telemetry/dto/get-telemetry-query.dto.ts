import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetTelemetryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'hours must be an integer' })
  @Min(1, { message: 'hours must be greater than 0' })
  hours?: number = 2;
}
