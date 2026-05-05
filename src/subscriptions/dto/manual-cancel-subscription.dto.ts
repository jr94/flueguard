import { IsBoolean, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class ManualCancelSubscriptionDto {
  @IsNotEmpty()
  @IsInt()
  device_id: number;

  @IsOptional()
  @IsBoolean()
  cancel_at_period_end?: boolean = false;
}
