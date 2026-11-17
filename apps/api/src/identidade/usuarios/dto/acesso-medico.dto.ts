import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

import { UsuarioResumoDto } from './usuario.dto';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AcessoMedicoDto {
  @ApiProperty({
    type: UsuarioResumoDto,
    nullable: true,
    description: 'Conta do portal ligada ao médico; nula se ele ainda não tem acesso.',
  })
  conta!: UsuarioResumoDto | null;
}

/** Convite pela aba Acesso: o médico vem da rota. */
export class ConviteMedicoDto {
  @ApiProperty({ example: 'Augusto Lima', maxLength: 120 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiProperty({ example: 'nome@clinica.com.br' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  papelId!: string;
}

export class LigarContaDto {
  @ApiProperty({ format: 'uuid', description: 'Conta que já existe e passa a ser a do médico.' })
  @IsUUID()
  usuarioId!: string;
}

export class BuscarContasDto {
  @ApiProperty({ description: 'Parte do nome ou do e-mail, ou o CPF.' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  busca!: string;
}

/** Só o necessário para escolher a conta a ligar. */
export class ContaParaLigarDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() email!: string;
}
