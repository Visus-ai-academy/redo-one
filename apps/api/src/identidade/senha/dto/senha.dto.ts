import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RecuperacaoSenhaDto {
  @ApiProperty({ example: 'nome@empresa.com.br' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ConsultaLinkDto {
  @ApiProperty({ description: 'O token do link recebido por e-mail.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;
}

export class DefinirSenhaDto {
  @ApiProperty({ description: 'O token do link recebido por e-mail.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @ApiProperty({
    format: 'password',
    description: 'Pelo menos 8 caracteres, com letras e números.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  senha!: string;
}

export class InfoLinkDto {
  @ApiProperty({ enum: ['convite', 'recuperacao'] })
  @IsIn(['convite', 'recuperacao'])
  tipo!: 'convite' | 'recuperacao';

  @ApiProperty() nome!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ description: 'Nome do papel da conta.' }) papel!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Quem convidou (só no convite).' })
  convidadoPor!: string | null;
}

export class SenhaFracaDto {
  @ApiProperty() message!: string;
  @ApiProperty({ type: [String], example: ['Use pelo menos 8 caracteres.'] }) problemas!: string[];
}
