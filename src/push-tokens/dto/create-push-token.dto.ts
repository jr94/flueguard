import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class CreatePushTokenDto {
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @IsNumber()
  @IsNotEmpty()
  device_id: number;

  @IsString()
  @IsNotEmpty()
  fcm_token: string;

  @IsString()
  @IsOptional()
  platform?: string;
}
