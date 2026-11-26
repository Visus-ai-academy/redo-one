import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { MOTIVOS_RECOLHIMENTO } from '../../../domain/rodada/recolhimento';

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

/**
 * Recortes da rodada. Cada eixo tem o "todos" explícito ao lado da lista: com ele a lista vai
 * vazia; sem ele, a lista precisa de ao menos um item (vazio nunca é "todos").
 */
export class RecortesRodadaDto {
  @ApiProperty({ description: 'Todos os turnos. Sem ele, `turnoIds` precisa de ao menos um.' })
  @IsBoolean()
  todosTurnos!: boolean;

  @ids('Sem `todosTurnos`: turnos da escala.')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  turnoIds!: string[];

  @ApiProperty({ description: 'Todas as frentes. Sem ele, `frenteIds` precisa de ao menos uma.' })
  @IsBoolean()
  todasFrentes!: boolean;

  @ids('Sem `todasFrentes`: frentes da escala (`/escala/frentes`).')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  frenteIds!: string[];

  @ApiProperty({
    description: 'Todas as prioridades. Sem ele, `prioridadeOperacaoIds` precisa de ao menos uma.',
  })
  @IsBoolean()
  todasPrioridades!: boolean;

  @ids('Sem `todasPrioridades`: prioridades da operação (Configurações › Distribuição).')
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  prioridadeOperacaoIds!: string[];

  @ApiProperty({ description: 'Todos os segmentos. Sem ele, `subespecialidadeIds` ou o geral.' })
  @IsBoolean()
  todosSegmentos!: boolean;

  @ids(
    'Sem `todosSegmentos`: segmentos (subespecialidades) do catálogo; o pacote do paciente não se parte.',
  )
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  subespecialidadeIds!: string[];

  @ApiProperty({
    description: 'Sem `todosSegmentos`: o recorte de segmento inclui o exame sem segmento.',
  })
  @IsBoolean()
  subespecialidadeGeral!: boolean;

  @ApiProperty({ description: 'Todos os clientes. Sem ele, `clienteIds` precisa de ao menos um.' })
  @IsBoolean()
  todosClientes!: boolean;

  @ids('Sem `todosClientes`: só os exames destes clientes são distribuídos.')
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
  @ApiProperty({
    type: 'integer',
    description: 'Recolhidos de médicos (fim do turno ou ausência) que entraram na proposta.',
  })
  recolhidos!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Dos exames da proposta (lidos e recolhidos), os tratados como urgência.',
  })
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
  @ApiProperty({ type: RecortesRodadaDto }) recortes!: RecortesRodadaDto;
  @ApiProperty({ type: 'integer', description: 'Os que o motor propôs.' }) propostos!: number;
  @ApiProperty({ type: 'integer', description: 'Os que o motor deixou de fora.' })
  deFora!: number;
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Último movimento da rodada (o fim, na encerrada).',
  })
  atualizadoEm!: Date;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: STATUS_RODADA, enumName: 'StatusRodada' })
  status!: (typeof STATUS_RODADA)[number];
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) solicitadaPor!: RotuloRodadaDto | null;
  @ApiProperty({ type: RotuloRodadaDto, nullable: true }) aprovadaPor!: RotuloRodadaDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) aprovadaEm!: Date | null;
  @ApiProperty({ type: 'integer' }) lidos!: number;
  @ApiProperty({ type: 'integer', description: 'Recolhidos de médicos que entraram na proposta.' })
  recolhidos!: number;
  @ApiProperty({ type: 'integer' }) executadas!: number;
}

export class PaginaRodadasDto {
  @ApiProperty({ type: [RodadaListadaDto] }) itens!: RodadaListadaDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class PacoteDto {
  @ApiProperty({ description: 'Estável na rodada (agrupa os exames do mesmo paciente).' })
  id!: string;
  @ApiProperty({ type: 'integer' }) exames!: number;
  @ApiProperty({ type: 'integer', description: 'Soma dos laudos dos exames do pacote.' })
  laudos!: number;
}

export class FrenteDaDesignacaoDto {
  @ApiProperty({ format: 'uuid', description: 'Frente da escala (`frentes_escala.id`).' })
  id!: string;
  @ApiProperty({ description: 'Nome da especialidade ou código da modalidade.' }) nome!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Cor do catálogo (`#RRGGBB`).' })
  cor!: string | null;
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
  @ApiProperty({
    type: FrenteDaDesignacaoDto,
    nullable: true,
    description:
      'Frente da escala que recebe o exame, de preferência uma marcada na rodada (entre elas, a da especialidade antes da da modalidade); nula se nenhuma casa.',
  })
  frente!: FrenteDaDesignacaoDto | null;
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
    type: () => PacoteDto,
    nullable: true,
    description: 'Os exames do mesmo paciente na rodada; nulo = só este.',
  })
  pacote!: PacoteDto | null;
  @ApiProperty() gratificado!: boolean;
  @ApiProperty({ description: 'Mandado na mão na conferência (o motor o tinha deixado de fora).' })
  naMao!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Médicos que podiam laudar o exame na leitura (o "mover" sugere estes).',
  })
  elegiveis!: string[];
  @ApiProperty({
    type: RotuloRodadaDto,
    nullable: true,
    description: 'De quem a conferência o tirou.',
  })
  retiradoDe!: RotuloRodadaDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) retiradaEm!: Date | null;
  @ApiProperty({
    type: RotuloRodadaDto,
    nullable: true,
    description:
      'Recolhido: de quem o exame sai (só sai ao executar); nulo = estava sem médico na leitura.',
  })
  recolhidoDe!: RotuloRodadaDto | null;
  @ApiProperty({
    enum: MOTIVOS_RECOLHIMENTO,
    enumName: 'MotivoRecolhimento',
    nullable: true,
    description: '`turno_encerrado` (o turno da entrega acabou) ou `ausencia` (ausente hoje).',
  })
  motivoRecolhimento!: (typeof MOTIVOS_RECOLHIMENTO)[number] | null;
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

export class PropostaRodadaDto {
  @ApiProperty({
    type: [DesignacaoDto],
    description:
      'As previstas, na ordem da fila; o nome do paciente só com `distribuicao.paciente.ver` e a rodada viva.',
  })
  itens!: DesignacaoDto[];
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

  @ApiPropertyOptional({ type: [String], description: 'Código do motivo (ex.: `sem_espaco`).' })
  @Transform(umOuVarios)
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  motivo?: string[];

  @ApiPropertyOptional({ description: 'Só os mandados na mão (true) ou só os do motor (false).' })
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsOptional()
  @IsBoolean()
  naMao?: boolean;

  @ApiPropertyOptional({
    description: 'Só os recolhidos de médicos (true) ou só os da fila sem médico (false).',
  })
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsOptional()
  @IsBoolean()
  recolhido?: boolean;

  @ApiPropertyOptional({ description: 'Trecho do estudo ou da unidade.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class MovimentoPropostaDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Designação prevista (troca o médico) ou deixada de fora (vai na mão).',
  })
  @IsUUID()
  designacaoId!: string;
  @ApiProperty({ format: 'uuid', description: 'Médico ativo, com conta na MobileMed.' })
  @IsUUID()
  medicoId!: string;
  @ApiPropertyOptional({
    description: 'Leva junto os outros exames do mesmo paciente que estavam com ela.',
  })
  @IsOptional()
  @IsBoolean()
  levarPacote?: boolean;
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

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Desfaz o "tirar": volta ao médico de quem saiu.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  restaurar?: string[];
}

export class HistoricoQueryDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: STATUS_RODADA, enumName: 'StatusRodada', isArray: true })
  @Transform(umOuVarios)
  @IsOptional()
  @IsIn(STATUS_RODADA, { each: true })
  status?: (typeof STATUS_RODADA)[number][];

  @ApiPropertyOptional({ format: 'uuid', description: 'Quem pediu.' })
  @IsOptional()
  @IsUUID()
  solicitadaPorId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Pedidas a partir deste instante.' })
  @IsOptional()
  @IsDateString()
  desde?: string;
}

export class ExplicacaoQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() medicoId!: string;
}

export class CheckExplicacaoDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() titulo!: string;
  @ApiProperty() detalhe!: string;
}

export class ExplicacaoDto {
  @ApiProperty({ type: RotuloRodadaDto }) medico!: RotuloRodadaDto;
  @ApiProperty({ description: 'Ficou com o exame (proposto ou atribuído).' }) pegou!: boolean;
  @ApiProperty({ description: 'O desfecho, em uma frase.' }) titulo!: string;
  @ApiProperty({ type: [CheckExplicacaoDto], description: 'Os portões, até o que barrou.' })
  checks!: CheckExplicacaoDto[];
}

export class TurnoAComecarDto {
  @ApiProperty() turno!: string;
  @ApiProperty({ format: 'date-time' }) inicio!: string;
}

export class MedicoDaRodadaDto {
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: [String], description: 'Turnos em andamento na leitura.' })
  turnos!: string[];
  @ApiProperty({ type: [String], description: 'Frentes dos turnos em andamento e a começar.' })
  frentes!: string[];
  @ApiProperty({
    type: [TurnoAComecarDto],
    description:
      'Turnos que começavam depois da leitura, mas já entravam na rodada (dentro da antecedência ou turno escolhido).',
  })
  aComecar!: TurnoAComecarDto[];
  @ApiProperty({ type: 'integer', nullable: true, description: 'Teto da escala na leitura.' })
  capacidade!: number | null;
  @ApiProperty({
    type: 'integer',
    description: 'Já aberto na MobileMed na leitura, na unidade do teto dele.',
  })
  cargaEmMaos!: number;
  @ApiProperty({
    enum: ['exames', 'laudos'],
    enumName: 'UnidadeTeto',
    nullable: true,
    description:
      'Em que o teto e a carga dele são contados; null = mandado na conferência sem estar na rodada.',
  })
  unidadeTeto!: 'exames' | 'laudos' | null;
  @ApiProperty({ type: 'integer' }) propostos!: number;
  @ApiProperty({ type: 'integer' }) urgencias!: number;
  @ApiProperty({ type: 'integer', description: 'Pacientes com mais de um exame com ele.' })
  pacotes!: number;
  @ApiProperty({ type: 'integer' }) previstas!: number;
  @ApiProperty({ type: 'integer', description: 'Laudos das previstas.' })
  laudosPrevistos!: number;
  @ApiProperty({ type: 'integer' }) executadas!: number;
  @ApiProperty({ type: 'integer' }) puladas!: number;
  @ApiProperty({ type: 'integer' }) falharam!: number;
  @ApiProperty({ type: 'integer' }) naMao!: number;
}

export class ContagemMotivoDto {
  @ApiProperty({ enum: STATUS_DESIGNACAO, enumName: 'StatusDesignacao' })
  status!: (typeof STATUS_DESIGNACAO)[number];
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
  @ApiProperty({ type: 'integer' }) quantidade!: number;
}

export class AjustesConferenciaDto {
  @ApiProperty({ type: 'integer' }) tirados!: number;
  @ApiProperty({ type: 'integer' }) movidos!: number;
  @ApiProperty({ type: 'integer' }) naMao!: number;
}

export class FunilExamesDto {
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) escala!: number;
  @ApiProperty({ type: 'integer' }) arranjo!: number;
  @ApiProperty({ type: 'integer' }) equipe!: number;
  @ApiProperty({ type: 'integer' }) reservado!: number;
  @ApiProperty({ type: 'integer' }) elegiveis!: number;
}

export class FunilMedicosDto {
  @ApiProperty({ type: 'integer' }) habilitados!: number;
  @ApiProperty({ type: 'integer' }) escalados!: number;
  @ApiProperty({ type: 'integer' }) disponiveis!: number;
  @ApiProperty({ type: 'integer' }) noTurno!: number;
  @ApiProperty({ type: 'integer' }) noHorario!: number;
  @ApiProperty({ type: 'integer', description: 'Dos no horário, os com conta na MobileMed.' })
  comConta!: number;
  @ApiProperty({ type: 'integer' }) tirados!: number;
  @ApiProperty({ type: 'integer' }) receberam!: number;
}

export class TrilhaRodadaDto {
  @ApiProperty({ type: 'integer' }) pacotes!: number;
  @ApiProperty({ type: 'integer' }) examesAgrupados!: number;
  @ApiProperty({ type: 'integer', description: 'Foram ao médico que já tinha o paciente.' })
  aderencia!: number;
}

export class NaoRecolhidosDto {
  @ApiProperty({ type: 'integer', description: 'O médico já abriu.' }) aberto!: number;
  @ApiProperty({ type: 'integer', description: 'Trocado à mão depois do robô.' })
  trocado_por_fora!: number;
  @ApiProperty({ type: 'integer', description: 'Outro exame do pacote já foi aberto.' })
  pacote_aberto!: number;
  @ApiProperty({ type: 'integer', description: 'O turno da entrega (mais a carência) segue.' })
  turno_em_curso!: number;
  @ApiProperty({ type: 'integer', description: 'A frente não recolhe ao fim do turno.' })
  frente_nao_recolhe!: number;
}

export class RecolhimentoRodadaDto {
  @ApiProperty({ type: 'integer', description: 'Saíram dos médicos e entraram na rodada.' })
  recolhiveis!: number;
  @ApiProperty({ type: 'integer', description: 'Desses, os de médico ausente hoje.' })
  porAusencia!: number;
  @ApiProperty({ type: 'integer', description: 'Desses, os propostos a outro médico.' })
  propostos!: number;
  @ApiProperty({ type: 'integer', description: 'Desses, os sem destino: ficam com quem tem.' })
  semDestino!: number;
  @ApiProperty({ type: NaoRecolhidosDto, description: 'Os que ficaram com o médico, por motivo.' })
  naoRecolhidos!: NaoRecolhidosDto;
}

export class RecolhimentoPrevistoDto {
  @ApiProperty({ description: 'Falso = carência nula em Configurações › Distribuição.' })
  ligado!: boolean;
  @ApiProperty({
    type: 'integer',
    description: 'Exames que sairiam dos médicos se a rodada fosse pedida agora.',
  })
  recolhiveis!: number;
  @ApiProperty({ type: 'integer', description: 'Desses, os de médico ausente hoje.' })
  porAusencia!: number;
}

const MOTIVOS_FORA_DA_RODADA = [
  'ausente',
  'turno_nao_marcado',
  'frente_nao_marcada',
  'turno_encerrado',
  'turno_a_comecar',
  'sem_conta_mobilemed',
  'tirado_da_rodada',
] as const;

export class MedicoForaDaRodadaDto {
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ enum: MOTIVOS_FORA_DA_RODADA, enumName: 'MotivoForaDaRodada' })
  motivo!: (typeof MOTIVOS_FORA_DA_RODADA)[number];
  @ApiProperty({ description: 'O porquê legível, com o turno.' }) detalhe!: string;
}

export class ResumoRodadaDto {
  @ApiProperty({ type: [MedicoDaRodadaDto] }) medicos!: MedicoDaRodadaDto[];
  @ApiProperty({
    type: [MedicoForaDaRodadaDto],
    description:
      'Médicos da escala que ficaram fora da rodada (ou sem poder receber), com o motivo. Vazio nas leituras anteriores a ele.',
  })
  foraDaRodada!: MedicoForaDaRodadaDto[];
  @ApiProperty({ type: [ContagemMotivoDto] }) motivos!: ContagemMotivoDto[];
  @ApiProperty({ type: AjustesConferenciaDto }) ajustes!: AjustesConferenciaDto;
  @ApiProperty({ type: FunilExamesDto, nullable: true }) funilExames!: FunilExamesDto | null;
  @ApiProperty({ type: FunilMedicosDto, nullable: true }) funilMedicos!: FunilMedicosDto | null;
  @ApiProperty({ type: TrilhaRodadaDto, nullable: true }) trilha!: TrilhaRodadaDto | null;
  @ApiProperty({
    type: RecolhimentoRodadaDto,
    nullable: true,
    description: 'Nulo = recolhimento desligado na leitura (ou leitura anterior a ele).',
  })
  recolhimento!: RecolhimentoRodadaDto | null;
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

/** Uma prioridade da operação na fila do momento, com a cor cadastrada. */
export class PrioridadeDaFilaDto extends ContagemPrioridadeDto {
  @ApiProperty({ type: String, nullable: true, description: 'Hex #RRGGBB; null = neutra.' })
  cor!: string | null;
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

export class SegmentoEmTurnoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Cor cadastrada; null = sem cor.' })
  cor!: string | null;
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
  @ApiProperty({
    type: 'integer',
    description: 'Exames com ele ainda não laudados, na unidade do teto dele.',
  })
  cargaEmMaos!: number;
  @ApiPropertyOptional({
    enum: ['exames', 'laudos'],
    enumName: 'UnidadeTeto',
    description: 'Em que o teto e a carga dele são contados (ausente nos retratos antigos).',
  })
  unidadeTeto?: 'exames' | 'laudos';
  @ApiProperty({ description: 'Nome do turno.' }) turno!: string;
  @ApiProperty({ description: 'Nome da frente (especialidade ou modalidade).' })
  frenteNome!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'A frente da escala.' })
  frenteId!: string | null;
  @ApiProperty({ type: String, nullable: true }) turnoCor!: string | null;
  @ApiProperty({ type: String, nullable: true }) frenteCor!: string | null;
  @ApiProperty({
    type: [SegmentoEmTurnoDto],
    description:
      'Segmentos que a alocação cobre: sem recorte, todos os da especialidade da frente; com recorte, só os recortados; frente de modalidade, nenhum.',
  })
  segmentos!: SegmentoEmTurnoDto[];
  @ApiProperty({ description: 'A alocação tem recorte de segmento.' })
  segmentosRecortados!: boolean;
}

export class ContagemFrentePrioridadeDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  prioridadeOperacaoId!: string | null;
  @ApiProperty({ type: 'integer' }) exames!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
}

export class SegmentoDaFilaDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Segmento (subespecialidade) do catálogo do exame; nulo = exame sem segmento.',
  })
  segmentoId!: string | null;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Cor cadastrada; null = sem cor.' })
  cor!: string | null;
  @ApiProperty({ type: 'integer' }) exames!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
  @ApiProperty({ type: [ContagemFrentePrioridadeDto] })
  porPrioridade!: ContagemFrentePrioridadeDto[];
}

export class GrupoDaFilaDto {
  @ApiProperty({
    type: [String],
    description: 'As frentes que pegam o exame; vazio = sem frente.',
  })
  frenteIds!: string[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) segmentoId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  prioridadeOperacaoId!: string | null;
  @ApiProperty({ type: 'integer' }) exames!: number;
}

export class FrenteDaFilaDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Frente da escala; nula = o exame não casa com nenhuma.',
  })
  frenteId!: string | null;
  @ApiProperty({
    enum: ['especialidade', 'modalidade'],
    enumName: 'TipoFrenteDaFila',
    nullable: true,
    description: 'Nulo = "Sem frente".',
  })
  tipo!: 'especialidade' | 'modalidade' | null;
  @ApiProperty() nome!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cor cadastrada da especialidade ou modalidade; nula = sem cor.',
  })
  cor!: string | null;
  @ApiProperty({
    type: 'integer',
    description:
      'Exames que o recorte pegaria marcando só esta frente; um exame pode contar numa frente de especialidade e numa de modalidade.',
  })
  exames!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  primeiroVencimento!: Date | null;
  @ApiProperty({ type: [ContagemFrentePrioridadeDto] })
  porPrioridade!: ContagemFrentePrioridadeDto[];
  @ApiProperty({
    type: [SegmentoDaFilaDto],
    description:
      'Frente de especialidade: exames por segmento × prioridade (só os com exame, os sem segmento por último). Frente de modalidade: vazio.',
  })
  porSegmento!: SegmentoDaFilaDto[];
}

export class TurnoDaFilaDto {
  @ApiProperty({ format: 'uuid' }) turnoId!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, format: 'date-time' }) inicio!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) fim!: Date;
  @ApiProperty({ type: 'integer', description: 'Médicos habilitados escalados.' }) medicos!: number;
  @ApiProperty() emAndamento!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Cor cadastrada; null = sem cor.' })
  cor!: string | null;
}

export class ClienteInativoNaFilaDto {
  @ApiProperty({ format: 'uuid', description: 'O cliente (ou a unidade de um principal) inativo.' })
  clienteId!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({
    type: 'integer',
    description: 'Exames NOVO dele na fila, que não são distribuídos.',
  })
  exames!: number;
  @ApiProperty({
    type: [String],
    description: 'Os exames, sem nada do paciente: "ESTUDO · exame ID na MobileMed".',
  })
  itens!: string[];
}

export class FilaDoMomentoDto {
  @ApiProperty({ type: String, format: 'date-time' }) lidaEm!: Date;
  @ApiProperty({
    type: 'integer',
    description: 'Exames NOVO sem médico, sem os de cliente inativo (ver `clientesInativos`).',
  })
  total!: number;
  @ApiProperty({ type: 'integer' }) urgentes!: number;
  @ApiProperty({ type: 'integer' }) semCatalogo!: number;
  @ApiProperty({ type: 'integer' }) semCliente!: number;
  @ApiProperty({
    type: [ClienteInativoNaFilaDto],
    description:
      'Clientes inativos com exames NOVO na fila: não são distribuídos e ficam fora das contagens (a tela mostra o alerta).',
  })
  clientesInativos!: ClienteInativoNaFilaDto[];
  @ApiProperty({ type: 'integer', description: 'Prazo já passou.' })
  vencidos!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Prazo na próxima hora, sem os já vencidos.',
  })
  vencemProximaHora!: number;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'O prazo mais antigo da fila (o vencido mais antigo, se houver).',
  })
  primeiroVencimento!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'O próximo prazo a vencer (o primeiro ainda não vencido).',
  })
  proximoVencimento!: Date | null;
  @ApiProperty({ type: 'integer', description: 'Ativos e habilitados no robô.' })
  habilitados!: number;
  @ApiProperty({ description: 'Robô ligado em Configurações › Distribuição.' })
  roboAtivo!: boolean;
  @ApiProperty({ type: [PrioridadeDaFilaDto], description: 'Na ordem da operação.' })
  prioridades!: PrioridadeDaFilaDto[];
  @ApiProperty({
    type: [FrenteDaFilaDto],
    description:
      'Especialidades, depois modalidades, e "Sem frente" por último. Somar as linhas pode passar do total (um exame conta em cada frente que o pega).',
  })
  porFrente!: FrenteDaFilaDto[];
  @ApiProperty({
    type: [GrupoDaFilaDto],
    description:
      'Os exames pelos eixos do recorte (frentes, segmento, prioridade), cada um uma vez: para estimar a rodada sem contar duas vezes.',
  })
  grupos!: GrupoDaFilaDto[];
  @ApiProperty({ type: [TurnoDaFilaDto], description: 'Turnos de hoje que não acabaram.' })
  turnos!: TurnoDaFilaDto[];
  @ApiProperty({ type: [ContagemPrioridadeDto] }) porPrioridade!: ContagemPrioridadeDto[];
  @ApiProperty({ type: [ContagemEspecialidadeDto] })
  porEspecialidade!: ContagemEspecialidadeDto[];
  @ApiProperty({ type: [ContagemModalidadeDto] }) porModalidade!: ContagemModalidadeDto[];
  @ApiProperty({ type: [MedicoEmTurnoDto], description: 'Habilitados no robô em turno agora.' })
  medicosEmTurno!: MedicoEmTurnoDto[];
}

export class FalhaLeituraFilaDto {
  @ApiProperty({ type: String, format: 'date-time' }) em!: Date;
  @ApiProperty({ description: 'Mensagem curta, sem dado de paciente.' }) erro!: string;
}

export class RetratoFilaDto {
  @ApiProperty({
    type: FilaDoMomentoDto,
    nullable: true,
    description:
      'O último retrato lido (lidaEm = hora da leitura); null = a fila ainda não foi lida.',
  })
  fila!: FilaDoMomentoDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pedidaEm!: Date | null;
  @ApiProperty({ description: 'Há leitura pedida e ainda não terminada.' })
  lendo!: boolean;
  @ApiProperty({
    type: FalhaLeituraFilaDto,
    nullable: true,
    description: 'A última leitura falhou (o retrato é o da anterior); null = leu bem.',
  })
  falha!: FalhaLeituraFilaDto | null;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Minutos entre as leituras automáticas; null = desligadas (só "Ler agora").',
  })
  intervaloMin!: number | null;
}

export class BuscaMedicosQueryDto {
  @ApiPropertyOptional({ description: 'Parte do nome.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class MedicoDaBuscaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ description: 'Habilitado no robô (aba Distribuição do médico).' })
  habilitadoRobo!: boolean;
}
