import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { aparar } from '../../../catalogo/comum/dto';
import { ConflitoEscalaDto } from '../../ocorrencias/dto/ocorrencias.dto';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORARIO = /^\d{1,2}:\d{2}$/;
const CLASSIFICACOES = ['fixa', 'periodo_unico', 'gratificada', 'cobertura'] as const;

/** Corpo de criar e editar uma alocação (a cobertura tem corpo próprio). */
export class AlocacaoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  medicoId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  turnoId!: string;

  @ApiProperty({ format: 'uuid', description: 'Precisa estar cadastrada no turno.' })
  @IsUUID()
  frenteId!: string;

  @ApiProperty({ type: [Number], description: '0 = domingo … 6 = sábado. Ao menos um.' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  diasSemana!: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: '1–5 e -1 (última). Vazio ou ausente = toda semana.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  semanasDoMes?: number[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '07:00',
    description: 'Ausente = o do turno.',
  })
  @IsOptional()
  @Matches(HORARIO, { message: 'Horário no formato HH:MM.' })
  horarioInicio?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '13:00',
    description: 'Ausente = o do turno.',
  })
  @IsOptional()
  @Matches(HORARIO, { message: 'Horário no formato HH:MM.' })
  horarioFim?: string | null;

  @ApiProperty({ format: 'date' })
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  dataInicio!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Ausente ou nulo = escala fixa, sem fim.',
  })
  @IsOptional()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  dataFim?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    description: 'Registros por turno; nulo = não informado. No gratificado, a cota do período.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  produtividade?: number | null;

  @ApiPropertyOptional({
    description: 'Só em turno lista. Ausente: falso ao criar; na edição, mantém o atual.',
  })
  @IsOptional()
  @IsBoolean()
  gratificado?: boolean;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Vazio = sem recorte.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  prioridadeIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Vazio = sem recorte.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  subespecialidadeIds?: string[];

  @ApiPropertyOptional({ description: 'O recorte de subespecialidade inclui o geral.' })
  @IsOptional()
  @IsBoolean()
  subespecialidadeGeral?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string | null;
}

/** Corpo de criar e editar uma cobertura. */
export class CoberturaDto {
  @ApiProperty({ format: 'uuid', description: 'Quem cobre.' })
  @IsUUID()
  medicoId!: string;

  @ApiProperty({ format: 'date' })
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  dataInicio!: string;

  @ApiProperty({ format: 'date', description: 'Dentro da vigência do titular.' })
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  dataFim!: string;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Dias do titular que a cobertura assume. Vazio ou ausente = todos os dele.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  diasSemana?: number[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ausente = o do titular.' })
  @IsOptional()
  @Matches(HORARIO, { message: 'Horário no formato HH:MM.' })
  horarioInicio?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ausente = o do titular.' })
  @IsOptional()
  @Matches(HORARIO, { message: 'Horário no formato HH:MM.' })
  horarioFim?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 0,
    description: 'Ausente = a do titular (nula se ele é gratificado); nulo = não informada.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  produtividade?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string | null;
}

/** Corpo do ajuste de produtividade de um dia. */
export class AjusteDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 0,
    description: 'Nulo remove o ajuste (o dia volta à produtividade da escala).',
  })
  @ValidateIf((o: AjusteDto) => o.produtividade !== null)
  @IsInt()
  @Min(0)
  produtividade!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string | null;
}

export class AlocacaoItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty({ format: 'uuid' }) turnoId!: string;
  @ApiProperty({ format: 'uuid' }) frenteId!: string;
  @ApiProperty({ type: [Number] }) diasSemana!: number[];
  @ApiProperty({ type: [Number] }) semanasDoMes!: number[];
  @ApiProperty({ example: '07:00' }) horarioInicio!: string;
  @ApiProperty({ example: '13:00' }) horarioFim!: string;
  @ApiProperty({ format: 'date' }) dataInicio!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dataFim!: string | null;
  @ApiProperty({ type: Number, nullable: true }) produtividade!: number | null;
  @ApiProperty() gratificado!: boolean;
  @ApiProperty() subespecialidadeGeral!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' }) prioridadeIds!: string[];
  @ApiProperty({ type: [String], format: 'uuid' }) subespecialidadeIds!: string[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) coberturaDeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
  @ApiProperty({ enum: CLASSIFICACOES, enumName: 'ClassificacaoAlocacao' })
  classificacao!: (typeof CLASSIFICACOES)[number];
}

export class AvisosEscalaDto {
  @ApiProperty({
    type: [ConflitoEscalaDto],
    description: 'Sobreposições de horário do médico nas próximas 8 semanas (não bloqueiam).',
  })
  avisos!: ConflitoEscalaDto[];
}

export class CriadoComAvisosDto extends AvisosEscalaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
