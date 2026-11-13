import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Corpo de criar e editar papel. */
export class PapelDto {
  @ApiProperty({ example: 'Financeiro', maxLength: 60 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string | null;

  @ApiProperty({ type: [String], example: ['faturamento.ver', 'faturamento.competencia.fechar'] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissoes!: string[];
}

export class PapelResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @ApiProperty({ description: 'Papel fixo: não se edita nem se exclui.' }) sistema!: boolean;
  @ApiProperty() acessoTotal!: boolean;
  @ApiProperty() totalUsuarios!: number;
  @ApiProperty() totalPermissoes!: number;
}

export class PapelDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @ApiProperty() sistema!: boolean;
  @ApiProperty() acessoTotal!: boolean;
  @ApiProperty() totalUsuarios!: number;
  @ApiProperty({ type: [String] }) permissoes!: string[];
}

export class PapelCriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class PapelAtualizadoDto {
  @ApiProperty({ description: 'Sessões encerradas porque as permissões mudaram.' })
  sessoesEncerradas!: number;
}

export class AcaoCatalogoDto {
  @ApiProperty({ example: 'usuarios.desbloquear' }) chave!: string;
  @ApiProperty({ example: 'Desbloquear' }) rotulo!: string;
  @ApiProperty() sensivel!: boolean;
}

export class TelaCatalogoDto {
  @ApiProperty({ example: 'usuarios' }) tela!: string;
  @ApiProperty({ example: 'Usuários' }) rotulo!: string;
  @ApiProperty({ enum: ['Painéis', 'Operação', 'Cadastros', 'Financeiro', 'Configurações'] })
  area!: string;
  @ApiProperty({ type: [AcaoCatalogoDto] }) acoes!: AcaoCatalogoDto[];
}
