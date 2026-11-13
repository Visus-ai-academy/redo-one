import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { SituacaoUsuario } from '../gestao-usuarios.repository';

const SITUACOES: SituacaoUsuario[] = ['ativo', 'convite_pendente', 'bloqueado', 'desativado'];
const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListarUsuariosDto {
  @ApiPropertyOptional({ description: 'Parte do nome ou do e-mail, ou o CPF.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  papelId?: string;

  @ApiPropertyOptional({ enum: SITUACOES })
  @IsOptional()
  @IsIn(SITUACOES)
  situacao?: SituacaoUsuario;

  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @ApiPropertyOptional({ type: 'integer', default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina: number = 25;
}

export class ConviteUsuarioDto {
  @ApiProperty({ example: 'Maria Souza', maxLength: 120 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiProperty({ example: 'nome@empresa.com.br' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '000.000.000-00' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  papelId!: string;
}

export class TrocarPapelDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  papelId!: string;
}

export class PapelDoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class UsuarioResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: PapelDoUsuarioDto }) papel!: PapelDoUsuarioDto;
  @ApiProperty({ enum: SITUACOES }) situacao!: SituacaoUsuario;
  @ApiProperty({ type: Date, nullable: true }) ultimoAcessoEm!: Date | null;
}

export class PaginaUsuariosDto {
  @ApiProperty({ type: [UsuarioResumoDto] }) itens!: UsuarioResumoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class SessaoAbertaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
  @ApiProperty() criadaEm!: Date;
  @ApiProperty() ultimoUsoEm!: Date;
}

export class UsuarioDetalheDto extends UsuarioResumoDto {
  @ApiProperty({ type: String, nullable: true, description: 'Só os 2 últimos dígitos do CPF.' })
  cpfFinal!: string | null;

  @ApiProperty({ type: Date, nullable: true }) bloqueadoAte!: Date | null;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty({ type: [SessaoAbertaDto] }) sessoesAbertas!: SessaoAbertaDto[];
}

export class UsuarioCriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
