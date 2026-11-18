import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const TIPOS_URGENCIA = ['nunca', 'sempre', 'prazo'] as const;
const TIPOS_RECEBIMENTO = ['segue_sla', 'prazo_minimo', 'nao_recebe'] as const;

export class RegraUrgenciaDto {
  @ApiProperty({
    enum: TIPOS_URGENCIA,
    enumName: 'TipoUrgencia',
    description: 'nunca, sempre, ou prazo = quando o prazo restante fica abaixo de `horas`.',
  })
  @IsIn(TIPOS_URGENCIA)
  tipo!: (typeof TIPOS_URGENCIA)[number];

  @ApiProperty({ type: Number, nullable: true, description: 'Só com tipo = prazo.' })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  horas!: number | null;
}

export class RegraRecebimentoDto {
  @ApiProperty({
    enum: TIPOS_RECEBIMENTO,
    enumName: 'TipoRecebimento',
    description:
      'segue_sla; prazo_minimo = só o exame com prazo restante acima de `horas`; nao_recebe.',
  })
  @IsIn(TIPOS_RECEBIMENTO)
  tipo!: (typeof TIPOS_RECEBIMENTO)[number];

  @ApiProperty({ type: Number, nullable: true, description: 'Só com tipo = prazo_minimo.' })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  horas!: number | null;
}

/** Uma célula da grade de recebimento (prioridade da operação × turno). */
export class CelulaRecebimentoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  prioridadeOperacaoId!: string;

  @ApiProperty({ format: 'uuid', description: 'Turno da escala.' })
  @IsUUID()
  turnoId!: string;

  @ApiProperty({ type: RegraRecebimentoDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RegraRecebimentoDto)
  regra!: RegraRecebimentoDto;
}

/** A urgência de uma prioridade sobrescrita numa frente. */
export class UrgenciaFrenteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  prioridadeOperacaoId!: string;

  @ApiProperty({ type: RegraUrgenciaDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RegraUrgenciaDto)
  urgencia!: RegraUrgenciaDto;
}

/** Criar ou editar uma prioridade da operação. */
export class PrioridadeOperacaoEdicaoDto {
  @ApiProperty({ example: 'AMBULATÓRIO' })
  @IsString()
  @MaxLength(60)
  nome!: string;

  @ApiProperty({ description: 'Posição na fila: 1 = primeiro; empate permitido.' })
  @IsInt()
  posicao!: number;

  @ApiProperty({ type: RegraUrgenciaDto, description: 'Quando a operação a trata como urgência.' })
  @IsObject()
  @ValidateNested()
  @Type(() => RegraUrgenciaDto)
  urgencia!: RegraUrgenciaDto;

  @ApiProperty({ description: 'Vale para a grafia sem de-para (só uma prioridade).' })
  @IsBoolean()
  padrao!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Grafias da MobileMed que caem nesta prioridade (sem diferenciar acento e maiúsculas).',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  grafias!: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '#5677B8',
    description: 'Hex #RRGGBB da prioridade nas telas; sem cor, fica neutra.',
  })
  @IsOptional()
  @IsHexColor()
  cor: string | null = null;
}

export class PrioridadeOperacaoDto extends PrioridadeOperacaoEdicaoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Hex #RRGGBB; null = neutra.' })
  override cor: string | null = null;
}

/** A grade geral de recebimento. O PUT troca tudo; célula ausente = segue o SLA. */
export class GradeRecebimentoDto {
  @ApiProperty({ type: [CelulaRecebimentoDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CelulaRecebimentoDto)
  celulas!: CelulaRecebimentoDto[];
}
