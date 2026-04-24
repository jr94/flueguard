import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestDeletionDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido.' })
  email: string;
}
