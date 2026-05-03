import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateUserDeviceNotificationsDto {
  @IsBoolean()
  @IsNotEmpty()
  notifications_enabled: boolean;
}
