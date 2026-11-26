import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const MSG = 'Use o formato AAAA-MM, com o mês de 01 a 12.';

export class CompetenciaRepasseParamDto {
  @ApiProperty({ example: '2026-10', pattern: COMPETENCIA.source })
  @Matches(COMPETENCIA, { message: `competencia: ${MSG}` })
  competencia!: string;
}

export class CompetenciaRepasseQueryDto extends CompetenciaRepasseParamDto {}

export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class MotivoDto {
  @ApiProperty({ maxLength: 1000, description: 'Obrigatório; fica no histórico.' })
  @Transform(aparar)
  @IsString()
  @MaxLength(1000)
  motivo!: string;
}

export class RecalculoRepasseCriadoDto {
  @ApiProperty({ format: 'uuid', description: 'Pedido em `recalculos_competencia`.' }) id!: string;
}

export class APartirDeDto {
  @ApiProperty({
    example: '2026-12',
    description: 'Vale a partir de: competência aberta ou futura (AAAA-MM).',
  })
  @Matches(COMPETENCIA, { message: `aPartirDe: ${MSG}` })
  aPartirDe!: string;
}

export class FaixaListaAtrasoDto {
  @ApiProperty({ type: 'integer', minimum: 1 }) @IsInt() @Min(1) exames!: number;
  @ApiProperty({ type: 'integer', minimum: 0, description: 'Centavos.' })
  @IsInt()
  @Min(0)
  valorCentavos!: number;
}

export class DadosParametrosRepasseDto {
  @ApiProperty({ type: 'integer', description: 'Centavos.' })
  @IsInt()
  @Min(1)
  tarifaPeerReviewCentavos!: number;
  @ApiProperty({ type: 'integer', description: 'Centavos.' })
  @IsInt()
  @Min(1)
  tarifaPlantaoCentavos!: number;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Contratado do registro.',
  })
  @IsOptional()
  @IsUUID()
  contratadoRegistroId!: string | null;
  @ApiProperty({ description: 'Laudo duplicado entra no repasse.' })
  @IsBoolean()
  pagaDuplicados!: boolean;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 28 })
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimento!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 28 })
  @IsInt()
  @Min(1)
  @Max(28)
  diaCorteAntecipacao!: number;
  @ApiProperty({ maxLength: 200 })
  @Transform(aparar)
  @IsString()
  @MaxLength(200)
  categoriaFinanceiraSocio!: string;
  @ApiProperty({ maxLength: 200 })
  @Transform(aparar)
  @IsString()
  @MaxLength(200)
  categoriaFinanceiraNaoSocio!: string;
  @ApiProperty({ type: [FaixaListaAtrasoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaixaListaAtrasoDto)
  faixasListaAtraso!: FaixaListaAtrasoDto[];
}

export class CriarParametrosRepasseDto extends DadosParametrosRepasseDto {
  @ApiProperty({ example: '2026-12', description: 'Vale a partir de (aberta ou futura).' })
  @Matches(COMPETENCIA, { message: `aPartirDe: ${MSG}` })
  aPartirDe!: string;
}

export class ParametrosRepasseDto extends DadosParametrosRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '0001-01', description: 'Vale desta competência até a próxima versão.' })
  vigenciaDesde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
}

export class CriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

/** Recorte com "todos" explícito: `todos` verdadeiro e lista vazia, ou falso com ao menos um. */
class RecorteDto {
  @ApiProperty() @IsBoolean() todos!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class CriarReclassificacaoDto {
  @ApiProperty({ example: '2026-12' })
  @Matches(COMPETENCIA, { message: `aPartirDe: ${MSG}` })
  aPartirDe!: string;
  @ApiProperty({ type: 'integer', description: 'Ordem: a primeira que casa vale.' })
  @IsInt()
  @Min(0)
  ordem!: number;
  @ApiProperty({ maxLength: 300 })
  @Transform(aparar)
  @IsString()
  @MaxLength(300)
  descricao!: string;
  @ApiProperty({ type: RecorteDto })
  @ValidateNested()
  @Type(() => RecorteDto)
  modalidades!: RecorteDto;
  @ApiProperty({ type: RecorteDto })
  @ValidateNested()
  @Type(() => RecorteDto)
  especialidades!: RecorteDto;
  @ApiProperty({ type: RecorteDto })
  @ValidateNested()
  @Type(() => RecorteDto)
  categorias!: RecorteDto;
  @ApiProperty({
    type: RecorteDto,
    description: 'Equipes (grupos de médicos); todos = todos os médicos.',
  })
  @ValidateNested()
  @Type(() => RecorteDto)
  equipes!: RecorteDto;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  especialidadeDestinoId!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoriaDestinoId!: string | null;
}

export class ReclassificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) ordem!: number;
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: [String], nullable: true, description: 'Vazio (nulo) = todas.' })
  modalidadeIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) especialidadeIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) categoriaIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true, description: 'Nulo = todos os médicos.' })
  equipeIds!: string[] | null;
  @ApiProperty({ type: String, nullable: true }) especialidadeDestinoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoriaDestinoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaAte!: string | null;
}

export class CriarAlternativaPrecoDto {
  @ApiProperty({ example: '2026-12' })
  @Matches(COMPETENCIA, { message: `aPartirDe: ${MSG}` })
  aPartirDe!: string;
  @ApiProperty({ type: 'integer' }) @IsInt() @Min(0) ordem!: number;
  @ApiProperty({ description: 'Vale para todas as especialidades.' })
  @IsBoolean()
  todasEspecialidades!: boolean;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  especialidadeId!: string | null;
  @ApiProperty({ description: 'Vale para o laudo sem categoria.' })
  @IsBoolean()
  semCategoria!: boolean;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoriaOrigemId!: string | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoriaDestinoId!: string;
}

export class AlternativaPrecoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) ordem!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = todas.' })
  especialidadeId!: string | null;
  @ApiProperty() semCategoria!: boolean;
  @ApiProperty({ type: String, nullable: true }) categoriaOrigemId!: string | null;
  @ApiProperty() categoriaDestinoId!: string;
  @ApiProperty({ type: String, nullable: true }) vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaAte!: string | null;
}

export class RegrasDoRepasseDto {
  @ApiProperty({ type: [ReclassificacaoDto] }) reclassificacoes!: ReclassificacaoDto[];
  @ApiProperty({ type: [AlternativaPrecoDto] }) alternativas!: AlternativaPrecoDto[];
}

export const TIPOS_ADICIONAL = ['avulso', 'peer_review', 'plantao'] as const;

export class LancarAdicionalDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() medicoId!: string;
  @ApiProperty({ enum: TIPOS_ADICIONAL, enumName: 'TipoAdicionalRepasse' })
  @IsIn(TIPOS_ADICIONAL)
  tipo!: (typeof TIPOS_ADICIONAL)[number];
  @ApiProperty({ example: '2026-11' })
  @Matches(COMPETENCIA, { message: `competencia: ${MSG}` })
  competencia!: string;
  @ApiProperty({ example: '2026-11-05' }) @IsString() data!: string;
  @ApiPropertyOptional({
    type: 'integer',
    description: 'Avulso: centavos, ≠ 0 (negativo = desconto).',
  })
  @IsOptional()
  @IsInt()
  valorCentavos?: number;
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;
  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;
  @ApiPropertyOptional({ type: 'integer', description: 'Sem ela, a tarifa padrão.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  valorUnitarioCentavos?: number;
  @ApiPropertyOptional({ example: '2026-08' }) @IsOptional() @IsString() referenciaDesde?: string;
  @ApiPropertyOptional({ example: '2026-09' }) @IsOptional() @IsString() referenciaAte?: string;
  @ApiPropertyOptional({
    description:
      'Na competência fechada: lançar nela (exige repasse.adicional.lancar_fechada e motivo) em vez da próxima aberta.',
  })
  @IsOptional()
  @IsBoolean()
  lancarNaFechada?: boolean;
  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}

export class AdicionalLancadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Onde entrou (a próxima aberta, se o pedido era de uma fechada).' })
  competencia!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Recálculo pedido.' })
  recalculoId!: string | null;
}

export class AdicionalDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() medico!: string;
  @ApiProperty({ enum: TIPOS_ADICIONAL, enumName: 'TipoAdicionalRepasse' })
  tipo!: (typeof TIPOS_ADICIONAL)[number];
  @ApiProperty() competencia!: string;
  @ApiProperty() data!: string;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: 'integer', nullable: true }) quantidade!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) valorUnitarioCentavos!: number | null;
  @ApiProperty({ type: String, nullable: true }) referenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) referenciaAte!: string | null;
  @ApiProperty({ type: String, nullable: true }) recalculoId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) lancadoEm!: Date;
  @ApiProperty({ type: String, nullable: true }) lancadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) canceladoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) canceladoPor!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoCancelamento!: string | null;
}
