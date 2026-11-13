import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { PapelDoUsuarioDto, SessaoAbertaDto } from '../../usuarios/dto/usuario.dto';

export class AtualizarContaDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;
}

export class TrocarSenhaDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  senhaAtual!: string;

  @ApiProperty({
    format: 'password',
    description: 'Pelo menos 8 caracteres, com letras e números.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  novaSenha!: string;
}

export class MinhaSessaoDto extends SessaoAbertaDto {
  @ApiProperty({ description: 'É a sessão desta requisição.' }) atual!: boolean;
}

export class MinhaContaDto {
  @ApiProperty() nome!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Só os 2 últimos dígitos do CPF.' })
  cpfFinal!: string | null;

  @ApiProperty({ type: PapelDoUsuarioDto }) papel!: PapelDoUsuarioDto;
  @ApiProperty({ type: Date, nullable: true }) senhaAlteradaEm!: Date | null;
  @ApiProperty({ type: [MinhaSessaoDto] }) sessoesAbertas!: MinhaSessaoDto[];
}

export class SenhaTrocadaDto {
  @ApiProperty({ description: 'Outras sessões encerradas pela troca.' }) sessoesEncerradas!: number;
}

export class AcessoRecenteDto {
  @ApiProperty() em!: Date;
  @ApiProperty() sucesso!: boolean;
  @ApiProperty() ip!: string;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
}
