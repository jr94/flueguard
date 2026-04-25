import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class PortalLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
