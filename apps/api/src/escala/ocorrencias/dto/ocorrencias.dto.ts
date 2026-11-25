import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Lista na query: `?turnoIds=a,b` ou `?turnoIds=a&turnoIds=b`. */
const listaDaQuery = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const itens = Array.isArray(value) ? value : [value];
  return itens
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
};

/**
 * Janela da consulta (dias de Brasília, inclusivos; até 62 dias). A resposta traz também os
 * plantões do dia anterior a `de` ainda em curso à meia-noite (`doDiaAnterior`).
 */
export class JanelaOcorrenciasDto {
  @ApiProperty({ format: 'date', description: 'Dia de Brasília, inclusivo.' })
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  de!: string;

  @ApiProperty({
    format: 'date',
    description: 'Dia de Brasília, inclusivo; até 62 dias após `de`.',
  })
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  ate!: string;
}

export class ListarOcorrenciasDto extends JanelaOcorrenciasDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  medicoId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Separados por vírgula ou repetidos. Vazio = todos.',
  })
  @Transform(listaDaQuery)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  turnoIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Separados por vírgula ou repetidos. Vazio = todas.',
  })
  @Transform(listaDaQuery)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  frenteIds?: string[];
}

export class VinculoDaCoberturaDto {
  @ApiProperty({ format: 'uuid' }) alocacaoId!: string;
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() medicoNome!: string;
}

export class OcorrenciaDto {
  @ApiProperty({ format: 'uuid' }) alocacaoId!: string;
  @ApiProperty({ format: 'date' }) data!: string;
  @ApiProperty({ description: '0 = domingo … 6 = sábado.' }) diaSemana!: number;
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() medicoNome!: string;
  @ApiProperty({ format: 'uuid' }) turnoId!: string;
  @ApiProperty() turnoNome!: string;
  @ApiProperty({ enum: ['fixo', 'lista'], enumName: 'TipoTurno' }) turnoTipo!: 'fixo' | 'lista';
  @ApiProperty({ type: String, nullable: true }) turnoCor!: string | null;
  @ApiProperty() turnoOrdem!: number;
  @ApiProperty({ format: 'uuid' }) frenteId!: string;
  @ApiProperty() frenteRotulo!: string;
  @ApiProperty({ type: String, nullable: true }) frenteCor!: string | null;
  @ApiProperty() frenteOrdem!: number;
  @ApiProperty({ example: '07:00' }) horarioInicio!: string;
  @ApiProperty({ example: '13:00' }) horarioFim!: string;
  @ApiProperty({ example: '2026-11-16T07:00:00-03:00' }) inicio!: string;
  @ApiProperty({ example: '2026-11-16T13:00:00-03:00' }) fim!: string;
  @ApiProperty({ type: Number, nullable: true, description: 'A do dia (com o ajuste).' })
  produtividade!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'A da escala, sem o ajuste.' })
  produtividadeEscala!: number | null;
  @ApiProperty() ajustada!: boolean;
  @ApiProperty() gratificado!: boolean;
  @ApiProperty({
    enum: ['fixa', 'periodo'],
    enumName: 'VigenciaAlocacao',
    description: 'Da alocação: escala fixa (fim opcional) ou período único.',
  })
  vigencia!: 'fixa' | 'periodo';
  @ApiProperty({ type: [Number], description: 'Da alocação: 0 = domingo … 6 = sábado.' })
  diasSemana!: number[];
  @ApiProperty({ description: 'Da alocação: repete toda semana do mês.' })
  todasSemanas!: boolean;
  @ApiProperty({
    type: [Number],
    description: 'Da alocação: 1–5 e -1 (última), sem `todasSemanas`.',
  })
  semanasDoMes!: number[];
  @ApiProperty({ format: 'date' }) dataInicio!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dataFim!: string | null;
  @ApiProperty({ description: 'Sem recorte de prioridade.' }) todasPrioridades!: boolean;
  @ApiProperty({ type: [String], format: 'uuid', description: 'Prioridades da operação.' })
  prioridadeIds!: string[];
  @ApiProperty({ description: 'Sem recorte de segmento.' }) todosSegmentos!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' }) subespecialidadeIds!: string[];
  @ApiProperty() subespecialidadeGeral!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) coberturaDeId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cobertoPorAlocacaoId!: string | null;
  @ApiProperty() ausente!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Tipo da ausência que vale no dia, `cobertura` quando outro médico cobre, ou nulo.',
  })
  tipoAusenciaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) tipoAusenciaNome!: string | null;
  @ApiProperty({ type: String, nullable: true }) tipoAusenciaCor!: string | null;
  @ApiProperty({
    type: VinculoDaCoberturaDto,
    nullable: true,
    description: 'Nesta cobertura: o titular.',
  })
  coberturaDe!: VinculoDaCoberturaDto | null;
  @ApiProperty({
    type: VinculoDaCoberturaDto,
    nullable: true,
    description: 'No titular coberto neste dia: quem cobre.',
  })
  cobertoPor!: VinculoDaCoberturaDto | null;
  @ApiProperty({
    description:
      'Plantão do dia anterior a `de` (`data` = `de` − 1) que ainda está em curso à meia-noite de `de` (vira a meia-noite). A grade da janela não tem coluna para esse dia: use `inicio`/`fim`.',
  })
  doDiaAnterior!: boolean;
}

export class PlantaoEmConflitoDto {
  @ApiProperty({ format: 'uuid' }) alocacaoId!: string;
  @ApiProperty({ format: 'date' }) data!: string;
  @ApiProperty({ format: 'uuid' }) turnoId!: string;
  @ApiProperty() turnoNome!: string;
  @ApiProperty({ format: 'uuid' }) frenteId!: string;
  @ApiProperty() frenteRotulo!: string;
  @ApiProperty() inicio!: string;
  @ApiProperty() fim!: string;
}

/** Dois plantões do mesmo médico no mesmo turno com horários sobrepostos (aviso; não bloqueia). */
export class ConflitoEscalaDto {
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() medicoNome!: string;
  @ApiProperty({ format: 'date' }) data!: string;
  @ApiProperty({ type: PlantaoEmConflitoDto }) a!: PlantaoEmConflitoDto;
  @ApiProperty({ type: PlantaoEmConflitoDto }) b!: PlantaoEmConflitoDto;
}

export class OcorrenciasDto {
  @ApiProperty({ type: [OcorrenciaDto] }) ocorrencias!: OcorrenciaDto[];
  @ApiProperty({ type: [ConflitoEscalaDto] }) conflitos!: ConflitoEscalaDto[];
}
