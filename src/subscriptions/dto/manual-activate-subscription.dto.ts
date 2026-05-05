import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ManualActivateSubscriptionDto {
  @IsNotEmpty()
  @IsInt()
  device_id: number;

  @IsNotEmpty()
  @IsString()
  plan_code: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  months?: number = 1;
}
