import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateSupportRequestDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  type: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;
}
