import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail ou CPF (com ou sem pontuação).',
    example: 'nome@empresa.com.br',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identificador!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  // Limite alto só para não aceitar corpos gigantes no hash.
  @MaxLength(128)
  senha!: string;
}
