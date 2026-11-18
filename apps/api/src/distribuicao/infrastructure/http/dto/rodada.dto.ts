import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';

const STATUS_RODADA = [
  'solicitada',
  'lendo',
  'aguardando_aprovacao',
  'aprovada',
  'executando',
  'pausada',
  'parcial',
  'concluida',
  'expirada',
  'cancelada',
  'falhou',
] as const;
const STATUS_DESIGNACAO = ['prevista', 'executada', 'pulada', 'falhou', 'recusada'] as const;

const ids = (descricao: string) =>
  ApiProperty({ type: [String], format: 'uuid', description: descricao });

/** Recortes da rodada; lista vazia = sem recorte naquele eixo. */
export class RecortesRodadaDto {
  @ids('Turnos da escala.')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  turnoIds!: string[];

  @ids('Frentes da escala (`/escala/frentes`).')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  frenteIds!: string[];

  @ids('Prioridades da operação (Configurações › Distribuição).')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  prioridadeOperacaoIds!: string[];

  @ids('Clientes: só os exames deles são distribuídos.')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  clienteIds!: string[];

  @ids('Médicos que ficam de fora da rodada.')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  medicosExcluidos!: string[];

  @ids('Médicos que entram mesmo fora dos turnos e das frentes do recorte.')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  medicosIncluidos!: string[];
}

export class RotuloRodadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class EventoRodadaDto {
  @ApiProperty({ type: String, format: 'date-time' }) em!: Date;
  @ApiProperty() texto!: string;
  @ApiProperty({ type: 'integer', nullable: true, description: 'Com `total`: a barra.' })
  atual!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) total!: number | null;
}

export class ContagemDesignacoesDto {
  @ApiProperty({ type: 'integer' }) prevista!: number;
  @ApiProperty({ type: 'integer' }) executada!: number;
  @ApiProperty({ type: 'integer' }) pulada!: number;
  @ApiProperty({ type: 'integer' }) falhou!: number;
  @ApiProperty({ type: 'integer' }) recusada!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Puladas ou falhas que o "Retomar" tenta de novo.',
  })
  retentaveis!: number;
}

/** O endpoint leve do polling (3–5 s, só com rodada ativa). */
export class SituacaoRodadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: STATUS_RODADA, enumName: 'StatusRodada' })
  status!: (typeof STATUS_RODADA)[number];
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiraEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) erro!: string | null;
  @ApiProperty({
    type: EventoRodadaDto,
    nullable: true,
    description: 'Último evento com barra (execução); nulo fora dela.',
  })
  progresso!: EventoRodadaDto | null;
  @ApiProperty({ type: ContagemDesignacoesDto }) contagens!: ContagemDesignacoesDto;
}

export class RodadaDto extends SituacaoRodadaDto {
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) solicitadaPor!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) aprovadaPor!: RotuloRodadaDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) aprovadaEm!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Instante da leitura da fila (o minuto da escala que valeu).',
  })
  lidaEm!: Date | null;
  @ApiProperty({
    type: [String],
    description: 'Avisos da proposta (catálogo, cliente, grafia sem de-para, teto, escala).',
  })
  avisos!: string[];
  @ApiProperty({ type: 'integer', description: 'Exames lidos da fila sem médico.' })
  lidos!: number;
  @ApiProperty({ type: 'integer', description: 'Desses, os tratados como urgência.' })
  urgentes!: number;
  @ApiProperty({ type: RecortesRodadaDto }) recortes!: RecortesRodadaDto;
  @ApiProperty({ type: [EventoRodadaDto], description: 'O diário, do mais antigo ao mais novo.' })
  eventos!: EventoRodadaDto[];
}

export class RodadaVivaDto {
  @ApiProperty({ type: RodadaDto, nullable: true, description: 'Nula = nenhuma rodada viva.' })
  rodada!: RodadaDto | null;
}

export class RodadaListadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: STATUS_RODADA, enumName: 'StatusRodada' })
  status!: (typeof STATUS_RODADA)[number];
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) solicitadaPor!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) aprovadaPor!: RotuloRodadaDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) aprovadaEm!: Date | null;
  @ApiProperty({ type: 'integer' }) lidos!: number;
  @ApiProperty({ type: 'integer' }) executadas!: number;
}

export class PaginaRodadasDto {
  @ApiProperty({ type: [RodadaListadaDto] }) itens!: RodadaListadaDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class DesignacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer', description: 'Ordem da fila do motor na leitura.' })
  ordem!: number;
  @ApiProperty({ description: 'Id do exame na MobileMed.' }) idExameMobilemed!: string;
  @ApiProperty({ description: 'Nome do estudo como veio da MobileMed.' }) estudo!: string;
  @ApiProperty({ description: 'Unidade (empresa) na MobileMed.' }) unidade!: string;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) cliente!: RotuloRodadaDto | null;
  @ApiProperty({ type: String, nullable: true, description: 'Grafia da prioridade na MobileMed.' })
  prioridadeGrafia!: string | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true })
  prioridadeOperacao!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) especialidade!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) modalidade!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true })
  subespecialidade!: RotuloRodadaDto | null;
  @ApiProperty({ type: 'integer' }) laudos!: number;
  @ApiProperty({ type: String, format: 'date-time' }) realizadoEm!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) prazo!: Date | null;
  @ApiProperty({ description: 'A operação trata como urgência.' }) urgente!: boolean;
  @ApiProperty({
    type: RotuloRodadaDto,
    nullable: true,
    description: 'Quem o motor propôs (fica mesmo se a conferência mover ou tirar).',
  })
  medicoProposto!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true, description: 'A quem vai ou foi.' })
  medico!: RotuloRodadaDto | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Id na MobileMed do exame com quem anda no pacote do paciente.',
  })
  agrupadoCom!: string | null;
  @ApiProperty() gratificado!: boolean;
  @ApiProperty({ enum: STATUS_DESIGNACAO, enumName: 'StatusDesignacao' })
  status!: (typeof STATUS_DESIGNACAO)[number];
  @ApiProperty({ type: String, nullable: true, description: 'Código do motivo.' })
  motivo!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'O porquê, para a pessoa.' })
  detalhe!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) executadaEm!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Nome do paciente, lido na MobileMed agora: só com `distribuicao.paciente.ver` (leitura auditada); nulo sem ela ou fora da fila.',
  })
  nomePaciente!: string | null;
}

export class PaginaDesignacoesDto {
  @ApiProperty({ type: [DesignacaoDto] }) itens!: DesignacaoDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

const umOuVarios = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class DesignacoesQueryDto extends PaginacaoDto {
  @ApiPropertyOptional({
    enum: STATUS_DESIGNACAO,
    enumName: 'StatusDesignacao',
    isArray: true,
  })
  @Transform(umOuVarios)
  @IsOptional()
  @IsIn(STATUS_DESIGNACAO, { each: true })
  status?: (typeof STATUS_DESIGNACAO)[number][];

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() medicoId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() prioridadeOperacaoId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() especialidadeId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() modalidadeId?: string;

  @ApiPropertyOptional({ description: 'Trecho do estudo ou da unidade.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class MovimentoPropostaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() designacaoId!: string;
  @ApiProperty({ format: 'uuid', description: 'Médico ativo, com conta na MobileMed.' })
  @IsUUID()
  medicoId!: string;
}

/** Ajustes da conferência, antes de aprovar. */
export class AjustePropostaDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Designações que saem da proposta.' })
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  remover!: string[];

  @ApiProperty({ type: [MovimentoPropostaDto], description: 'Designações que mudam de médico.' })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => MovimentoPropostaDto)
  mover!: MovimentoPropostaDto[];
}

export class MedicosRodadaDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Ficam de fora.' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  excluidos!: string[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Entram mesmo fora dos turnos e das frentes.',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  incluidos!: string[];
}

// --- fila do momento ---

export class FrenteRodadaDto {
  @ApiProperty({ enum: ['especialidade', 'modalidade'], enumName: 'TipoFrenteRodada' })
  tipo!: 'especialidade' | 'modalidade';
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) especialidadeId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) modalidadeId!: string | null;
}

export class ContagemPrioridadeDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  prioridadeOperacaoId!: string | null;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: 'integer' }) exames!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
}

export class ContagemEspecialidadeDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) especialidadeId!: string | null;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: 'integer' }) exames!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
}

export class ContagemModalidadeDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) modalidadeId!: string | null;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: 'integer' }) exames!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
}

export class MedicoEmTurnoDto {
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ format: 'uuid' }) alocacaoId!: string;
  @ApiProperty({ format: 'uuid' }) turnoId!: string;
  @ApiProperty({ type: FrenteRodadaDto }) frente!: FrenteRodadaDto;
  @ApiProperty({ type: String, format: 'date-time' }) inicio!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) fim!: Date;
  @ApiProperty({ type: 'integer', nullable: true }) produtividade!: number | null;
  @ApiProperty({ type: 'integer', description: 'Exames com ele ainda não laudados.' })
  cargaEmMaos!: number;
}

export class FilaDoMomentoDto {
  @ApiProperty({ type: String, format: 'date-time' }) lidaEm!: Date;
  @ApiProperty({ type: 'integer', description: 'Exames NOVO sem médico.' }) total!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
  @ApiProperty({ type: 'integer' }) semCatalogo!: number;
  @ApiProperty({ type: 'integer' }) semCliente!: number;
  @ApiProperty({ type: [ContagemPrioridadeDto] }) porPrioridade!: ContagemPrioridadeDto[];
  @ApiProperty({ type: [ContagemEspecialidadeDto] })
  porEspecialidade!: ContagemEspecialidadeDto[];
  @ApiProperty({ type: [ContagemModalidadeDto] }) porModalidade!: ContagemModalidadeDto[];
  @ApiProperty({ type: [MedicoEmTurnoDto], description: 'Habilitados no robô em turno agora.' })
  medicosEmTurno!: MedicoEmTurnoDto[];
}
