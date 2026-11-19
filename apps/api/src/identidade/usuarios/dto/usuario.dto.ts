import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Quem tem este papel (entre outros).' })
  @IsOptional()
  @IsUUID()
  papelId?: string;

  @ApiPropertyOptional({ enum: SITUACOES })
  @IsOptional()
  @IsIn(SITUACOES)
  situacao?: SituacaoUsuario;

  @ApiPropertyOptional({ format: 'uuid', description: 'Só a conta ligada a este médico.' })
  @IsOptional()
  @IsUUID()
  medicoId?: string;

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

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Um ou mais; as permissões são a união das deles.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  papelIds!: string[];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Médico desta conta (portal); um usuário por médico.',
  })
  @IsOptional()
  @IsUUID()
  medicoId?: string | null;
}

export class VincularMedicoDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Nulo desliga.' })
  @IsOptional()
  @IsUUID()
  medicoId!: string | null;
}

export class TrocarPapeisDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Todos os papéis que a pessoa passa a ter (um ou mais).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  papelIds!: string[];
}

export class PapelDoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class PapelAtribuivelDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;

  @ApiProperty({
    description: 'Quem está logado pode dar este papel a alguém (tem todas as permissões dele).',
  })
  atribuivel!: boolean;
}

export class UsuarioResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: [PapelDoUsuarioDto], description: 'Por nome.' })
  papeis!: PapelDoUsuarioDto[];
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
