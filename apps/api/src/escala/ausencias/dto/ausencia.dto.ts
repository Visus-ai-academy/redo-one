import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../catalogo/comum/dto';
import type { OrigemAusencia, SituacaoAusencia } from '../../domain';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const SITUACOES = ['pendente', 'aprovada', 'recusada'] as const;
const ORIGENS = ['gestor', 'medico'] as const;

export class ListarAusenciasDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: SITUACOES, enumName: 'SituacaoAusencia' })
  @IsOptional()
  @IsIn(SITUACOES)
  situacao?: SituacaoAusencia;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tipoId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Ausências dessa frente, incluindo as que valem para todas as frentes.',
  })
  @IsOptional()
  @IsUUID()
  frenteId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  medicoId?: string;

  @ApiPropertyOptional({ description: 'Parte do nome do médico.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Ausências que terminam neste dia ou depois. Padrão: hoje − 30 dias.',
  })
  @IsOptional()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  de?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Ausências que começam até este dia.' })
  @IsOptional()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  ate?: string;
}

/** Campos comuns ao lançamento do gestor e ao pedido do médico. */
class PeriodoAusenciaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tipoId!: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  @IsString()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  dataInicio!: string;

  @ApiProperty({ format: 'date', example: '2026-12-10' })
  @IsString()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  dataFim!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Turnos em que vale. Vazio = o dia inteiro.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  turnoIds?: string[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'Dias da semana em que vale (0 = domingo … 6 = sábado). Vazio = todos.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemana?: number[];
}

/** Corpo de editar uma ausência (o médico não muda). */
export class AusenciaDto extends PeriodoAusenciaDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Frentes em que vale. Vazio = todas. Na edição, `frenteIds` ou `turnoIds` sem o campo (ou igual ao gravado) ' +
      'mantém o gravado. Para a gestora com recorte, a ausência fica inteira no recorte: "todas" ou "o dia inteiro" ' +
      'podem virar as frentes ou os turnos do recorte.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  frenteIds?: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    description: 'Dado de saúde (LGPD): não vai para o histórico.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string | null;
}

/** Corpo de lançar: a mesma ausência para vários médicos. */
export class CriarAusenciasDto extends AusenciaDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos um médico.' })
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  medicoIds!: string[];
}

export class RecusarAusenciaDto {
  @ApiProperty({ maxLength: 500, description: 'O médico vê o motivo no portal.' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo da recusa.' })
  @MaxLength(500)
  motivo!: string;
}

/** Pedido do médico no portal: vale para todas as frentes. */
export class PedidoAusenciaDto extends PeriodoAusenciaDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 2000,
    description: 'Motivo do pedido. Dado de saúde (LGPD).',
  })
  @Transform(aparar)
  @IsString()
  @MinLength(3, { message: 'Descreva o motivo da ausência.' })
  @MaxLength(2000)
  observacoes!: string;
}

export class ReferenciaAusenciaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class TipoDaAusenciaDto extends ReferenciaAusenciaDto {
  @ApiProperty({ type: String, nullable: true, example: '#00AA00' }) cor!: string | null;
}

/** A ausência como o médico vê no portal. */
export class AusenciaPortalDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ReferenciaAusenciaDto }) medico!: ReferenciaAusenciaDto;
  @ApiProperty({ type: TipoDaAusenciaDto }) tipo!: TipoDaAusenciaDto;
  @ApiProperty({ format: 'date' }) dataInicio!: string;
  @ApiProperty({ format: 'date' }) dataFim!: string;
  @ApiProperty({ type: [Number], description: 'Vazio = todos os dias.' }) diasSemana!: number[];
  @ApiProperty({
    type: [ReferenciaAusenciaDto],
    description: 'Vazio = todas. `nome` é o rótulo.',
  })
  frentes!: ReferenciaAusenciaDto[];
  @ApiProperty({ type: [ReferenciaAusenciaDto], description: 'Vazio = o dia inteiro.' })
  turnos!: ReferenciaAusenciaDto[];
  @ApiProperty({ enum: SITUACOES, enumName: 'SituacaoAusencia' }) situacao!: SituacaoAusencia;
  @ApiProperty({ enum: ORIGENS, enumName: 'OrigemAusencia' }) origem!: OrigemAusencia;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoRecusa!: string | null;
  @ApiProperty({ type: Date, nullable: true }) revisadaEm!: Date | null;
  @ApiProperty() criadoEm!: Date;
}

/** A ausência na tela do gestor: com quem pediu e quem revisou. */
export class AusenciaItemDto extends AusenciaPortalDto {
  @ApiProperty({ type: ReferenciaAusenciaDto, nullable: true })
  solicitadaPor!: ReferenciaAusenciaDto | null;
  @ApiProperty({ type: ReferenciaAusenciaDto, nullable: true })
  revisadaPor!: ReferenciaAusenciaDto | null;
}

export class PaginaAusenciasPortalDto {
  @ApiProperty({ type: [AusenciaPortalDto] }) itens!: AusenciaPortalDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class PaginaAusenciasDto {
  @ApiProperty({ type: [AusenciaItemDto] }) itens!: AusenciaItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class AusenciasCriadasDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Na ordem dos médicos pedidos.' })
  ids!: string[];
}

export class ContagemPendentesDto {
  @ApiProperty() pendentes!: number;
}
