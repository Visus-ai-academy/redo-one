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

const MODOS_PRAZO = ['padrao', 'sla', 'minimo'] as const;
const DIVISOES = ['igualitaria', 'proporcao'] as const;
const TIPOS_FRENTE = ['especialidade', 'modalidade'] as const;

const uuidNulo = (descricao: string) =>
  ApiProperty({ type: String, format: 'uuid', nullable: true, description: descricao });

export class HorarioSemRoboDto {
  @ApiProperty({
    type: [Number],
    description: 'Dias da semana (0 = domingo … 6 = sábado); vazio = todos os dias.',
  })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  diasSemana!: number[];

  @ApiProperty({ example: '19:00', description: 'HH:MM (Brasília).' })
  @IsString()
  @MaxLength(5)
  inicio!: string;

  @ApiProperty({
    example: '07:00',
    description: 'HH:MM (Brasília); antes do início = vira a meia-noite.',
  })
  @IsString()
  @MaxLength(5)
  fim!: string;
}

export class ProporcaoModalidadeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  modalidadeId!: string;

  @ApiProperty({ description: 'Percentual de exames (os da frente somam 100).' })
  @IsInt()
  percentual!: number;
}

export class TetoReduzidoDto {
  @ApiProperty({ description: 'Vale para quem tem produtividade de escala até este valor.' })
  @IsInt()
  produtividadeAte!: number;

  @ApiProperty()
  @IsInt()
  teto!: number;
}

export class RegraSegmentoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subespecialidadeId!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Máximo de exames do segmento por médico a cada rodada; nulo = sem teto.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  teto!: number | null;

  @ApiProperty({ type: TetoReduzidoDto, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => TetoReduzidoDto)
  tetoReduzido!: TetoReduzidoDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Quantos do segmento cada médico que o lauda recebe logo depois das urgências.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  piso!: number | null;

  @ApiProperty({
    description: 'No pacote do paciente, o segmento não se junta ao resto (COLUNAS de MSK).',
  })
  @IsBoolean()
  pacoteAParte!: boolean;
}

export class FatiaMisturaDto {
  @uuidNulo('Nula = o segmento em qualquer especialidade.')
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  especialidadeId!: string | null;

  @uuidNulo('Nulo = o geral (exame sem segmento) da especialidade.')
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  subespecialidadeId!: string | null;
}

/** As regras de uma frente, como a tela edita. O PUT troca tudo. */
export class RegrasFrenteDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    nullable: true,
    description:
      'Prioridades que a Lista desta frente aceita (vazia = todas); nulo = as da regra padrão (configuração global).',
  })
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  listaPrioridadeIds!: string[] | null;

  @ApiProperty({
    enum: MODOS_PRAZO,
    enumName: 'ModoPrazoLista',
    description:
      'padrao = o da configuração global; sla = segue o SLA (sem mínimo); minimo = `listaPrazoMinimoHoras`.',
  })
  @IsIn(MODOS_PRAZO)
  listaPrazo!: (typeof MODOS_PRAZO)[number];

  @ApiProperty({ type: Number, nullable: true, description: 'Só com `listaPrazo` = minimo.' })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  listaPrazoMinimoHoras!: number | null;

  @ApiProperty({ description: 'Ao fim do turno, o exame não aberto volta para a fila.' })
  @IsBoolean()
  recolheAoFimDoTurno!: boolean;

  @ApiProperty({ description: 'Falso = a frente é toda manual.' })
  @IsBoolean()
  distribuiPeloRobo!: boolean;

  @ApiProperty({
    type: [HorarioSemRoboDto],
    description: 'Faixas em que o robô não distribui a frente.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HorarioSemRoboDto)
  horariosSemRobo!: HorarioSemRoboDto[];

  @ApiProperty({ enum: DIVISOES, enumName: 'MetodoDivisao' })
  @IsIn(DIVISOES)
  divisao!: (typeof DIVISOES)[number];

  @ApiProperty({
    type: [ProporcaoModalidadeDto],
    description: 'Só na divisão por proporção (vazia na igualitária).',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProporcaoModalidadeDto)
  proporcoes!: ProporcaoModalidadeDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Teto por médico a cada rodada, além do da escala; nulo = só o da escala.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  tetoPorMedico!: number | null;

  @ApiProperty({ type: [RegraSegmentoDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RegraSegmentoDto)
  segmentos!: RegraSegmentoDto[];

  @ApiProperty({
    type: [FatiaMisturaDto],
    description: 'Mistura entre segmentos (a do neurologista), na ordem; vazia = nenhuma.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FatiaMisturaDto)
  mistura!: FatiaMisturaDto[];

  @ApiProperty({
    description:
      'Antes de os turnos posteriores começarem, a Lista fica só com o que eles não vão dar conta.',
  })
  @IsBoolean()
  listaDepoisDosFixos!: boolean;
}

export class FrenteCatalogoDto {
  @ApiProperty({ enum: TIPOS_FRENTE, enumName: 'TipoFrenteCatalogo' })
  tipo!: (typeof TIPOS_FRENTE)[number];

  @uuidNulo('Na frente de especialidade.')
  especialidadeId!: string | null;

  @uuidNulo('Na frente de modalidade.')
  modalidadeId!: string | null;
}

export class RegrasDaFrenteDto {
  @ApiProperty({ type: FrenteCatalogoDto }) frente!: FrenteCatalogoDto;
  @ApiProperty({ type: RegrasFrenteDto }) regras!: RegrasFrenteDto;
  @ApiProperty({ description: 'Falso = a frente não tem cadastro: as regras são as neutras.' })
  cadastrada!: boolean;
}
