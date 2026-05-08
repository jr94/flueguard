import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GooglePlayVerifyDto {
  @IsNotEmpty()
  @IsInt()
  device_id: number;

  @IsNotEmpty()
  @IsString()
  product_id: string;

  @IsNotEmpty()
  @IsString()
  purchase_token: string;

  @IsOptional()
  @IsString()
  purchase_id?: string;

  @IsOptional()
  @IsString()
  base_plan_id?: string;

  @IsOptional()
  @IsString()
  order_id?: string;
}
