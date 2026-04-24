import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmDeletionDto {
  @IsString({ message: 'El token debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El token es requerido.' })
  token: string;
}
