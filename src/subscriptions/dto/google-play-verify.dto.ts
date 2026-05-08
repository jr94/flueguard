import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GooglePlayVerifyDto {
  @IsOptional()
  @IsInt()
  device_id?: number;

  @IsOptional()
  @IsInt()
  deviceId?: number;

  @IsOptional()
  @IsString()
  product_id?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  provider_product_id?: string;

  @IsOptional()
  @IsString()
  providerProductId?: string;

  @IsOptional()
  @IsString()
  purchase_token?: string;

  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  provider_purchase_token?: string;

  @IsOptional()
  @IsString()
  providerPurchaseToken?: string;

  @IsOptional()
  @IsString()
  purchase_id?: string;

  @IsOptional()
  @IsString()
  purchaseId?: string;

  @IsOptional()
  @IsString()
  provider_subscription_id?: string;

  @IsOptional()
  @IsString()
  providerSubscriptionId?: string;

  @IsOptional()
  @IsString()
  base_plan_id?: string;

  @IsOptional()
  @IsString()
  basePlanId?: string;

  @IsOptional()
  @IsString()
  provider_base_plan_id?: string;

  @IsOptional()
  @IsString()
  providerBasePlanId?: string;

  @IsOptional()
  @IsString()
  order_id?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  provider_order_id?: string;

  @IsOptional()
  @IsString()
  providerOrderId?: string;
}
