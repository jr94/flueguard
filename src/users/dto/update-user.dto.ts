import { IsString, IsOptional, IsInt } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  apellido?: string;

  @IsInt()
  @IsOptional()
  region?: number;

  @IsInt()
  @IsOptional()
  comuna?: number;
}
