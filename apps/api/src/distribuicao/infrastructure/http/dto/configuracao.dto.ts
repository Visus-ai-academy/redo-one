import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const CRITERIOS = ['prioridade', 'prazo', 'antiguidade'] as const;
const DIRECOES = ['asc', 'desc'] as const;

export class ItemOrdemFilaDto {
  @ApiProperty({
    enum: CRITERIOS,
    enumName: 'CriterioFila',
    description:
      '"prioridade" = posição da prioridade da operação ("desc" = a posição 1 primeiro).',
  })
  @IsIn(CRITERIOS)
  criterio!: (typeof CRITERIOS)[number];

  @ApiProperty({ enum: DIRECOES, enumName: 'DirecaoOrdem' })
  @IsIn(DIRECOES)
  direcao!: (typeof DIRECOES)[number];
}

export class TurnosPosterioresDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Turnos que só recebem numa rodada posterior do dia (a Tarde).',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  turnoIds!: string[];

  @ApiProperty({
    example: '10:50',
    description:
      'HH:MM (Brasília) da rodada que enche esses turnos; dali em diante a Lista não guarda nada.',
  })
  @IsString()
  @MaxLength(5)
  cheiaEm!: string;
}

/** Configurações › Distribuição (global). O PUT troca tudo. */
export class ConfiguracaoDistribuicaoDto {
  @ApiProperty({
    type: [ItemOrdemFilaDto],
    description: 'Critérios da fila, na ordem em que desempatam.',
  })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ItemOrdemFilaDto)
  ordemFila!: ItemOrdemFilaDto[];

  @ApiProperty({
    description: 'Exames do mesmo paciente e especialidade vão juntos para um médico.',
  })
  @IsBoolean()
  agruparPorPaciente!: boolean;

  @ApiProperty({
    description: 'Distância máxima (horas) entre os exames do pacote; 0 = sem limite.',
  })
  @IsInt()
  janelaPacienteHoras!: number;

  @ApiProperty({ description: 'Folga aceita acima do teto do médico, em carga.' })
  @IsInt()
  toleranciaAcimaTeto!: number;

  @ApiProperty({ description: 'Margem (%) acima do teto só para urgência.' })
  @IsInt()
  margemUrgenciaPct!: number;

  @ApiProperty({
    description:
      'Pontos percentuais que o pacote atrasado ou vencendo antes da próxima rodada pode passar da proporção por modalidade (100 = ignora).',
  })
  @IsInt()
  folgaProporcaoPct!: number;

  @ApiProperty({
    description: 'A menos disto (minutos) do prazo, a prioridade do cliente sobe na fila.',
  })
  @IsInt()
  prazoCriticoMin!: number;

  @ApiProperty({
    description: 'Antecedência (minutos) com que um turno que ainda não começou entra na rodada.',
  })
  @IsInt()
  antecedenciaPeriodoMin!: number;

  @ApiProperty({ description: 'Intervalo entre rodadas (minutos).' })
  @IsInt()
  cicloMinutos!: number;

  @ApiProperty({
    type: [String],
    description:
      'Marcadores no nome do exame distribuídos por igual entre os elegíveis (ex.: ONCO).',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  marcadoresEquilibrio!: string[];

  @ApiProperty({ description: 'A frente da escala limita o que o médico recebe no período.' })
  @IsBoolean()
  escalaRestringeEspecialidade!: boolean;

  @ApiProperty({
    description:
      'Exame entregue a um médico nos últimos N dias e de volta à fila não volta para ele.',
  })
  @IsInt()
  diasJaEntregue!: number;

  @ApiProperty({
    type: TurnosPosterioresDto,
    nullable: true,
    description: 'Nulo = nenhum turno posterior (a Lista não guarda nada).',
  })
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => TurnosPosterioresDto)
  turnosPosteriores!: TurnosPosterioresDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Carência (minutos) do recolhimento depois do fim do turno; nulo = recolhimento desligado.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  recolhimentoAposTurnoMin!: number | null;
}
