// A rodada do robô de distribuição na tela: rótulos, etapas, recortes e funil (sem React).
import type { TomEtiqueta } from '../components/etiqueta/Etiqueta';
import type { ContagemDesignacoesDto } from '../gen/types/ContagemDesignacoesDto';
import type { ContagemMotivoDto } from '../gen/types/ContagemMotivoDto';
import type { MedicoEmTurnoDto } from '../gen/types/MedicoEmTurnoDto';
import type { RecortesRodadaDto } from '../gen/types/RecortesRodadaDto';
import type { StatusDesignacaoKey } from '../gen/types/StatusDesignacao';
import type { StatusRodadaKey } from '../gen/types/StatusRodada';
import { horaDeBrasilia } from './acesso';
import { dataHoraCurta } from './datas';

/** Número no formato brasileiro (1.487). */
export const num = (n: number) => n.toLocaleString('pt-BR');

const SITUACOES: Record<StatusRodadaKey, { texto: string; tom: TomEtiqueta }> = {
  solicitada: { texto: 'Pedida', tom: 'info' },
  lendo: { texto: 'Lendo a fila', tom: 'info' },
  aguardando_aprovacao: { texto: 'Aguardando aprovação', tom: 'atencao' },
  aprovada: { texto: 'Aprovada', tom: 'info' },
  executando: { texto: 'Executando', tom: 'info' },
  pausada: { texto: 'Pausada', tom: 'atencao' },
  parcial: { texto: 'Parcial', tom: 'atencao' },
  concluida: { texto: 'Concluída', tom: 'sucesso' },
  expirada: { texto: 'Expirada', tom: 'inativo' },
  cancelada: { texto: 'Cancelada', tom: 'inativo' },
  falhou: { texto: 'Falhou', tom: 'erro' },
};

export const situacaoDaRodada = (status: StatusRodadaKey) => SITUACOES[status];

/** Etapas que andam sem ninguém clicar: a tela consulta a situação enquanto durarem. */
const ANDAM_SOZINHAS: readonly StatusRodadaKey[] = [
  'solicitada',
  'lendo',
  'aprovada',
  'executando',
];

/** Polling de 4 s (regra do apps/web: 3–5 s) só nas etapas ativas. */
export const intervaloDaRodada = (status: StatusRodadaKey | undefined) =>
  status && ANDAM_SOZINHAS.includes(status) ? 4000 : (false as const);

/** Rótulo de cada motivo gravado pelo motor, pela conferência, pela execução e pelo controle. */
const MOTIVOS: Record<string, string> = {
  horario_sem_robo: 'Horário sem robô na frente',
  frente_manual: 'A frente não é distribuída pelo robô',
  sem_medico_elegivel: 'Nenhum médico da rodada podia laudar',
  sem_espaco: 'Todos que laudam estavam no teto',
  teto_do_segmento: 'Todos que laudam atingiram o máximo do segmento',
  nao_novo: 'Já aberto por um médico',
  fora_da_prioridade: 'Fora das prioridades da rodada',
  fora_da_clinica: 'Fora dos clientes da rodada',
  fora_da_frente: 'Fora das frentes da rodada',
  retirado_do_medico: 'Já entregue ou retirado de quem laudaria',
  guardado_para_posteriores: 'Guardado para os turnos posteriores',
  teto_da_rodada: 'Acima do teto de exames da rodada',
  removido_na_conferencia: 'Tirado na conferência',
  encerrada_pelo_operador: 'Deixado ao encerrar a rodada',
  rodada_cancelada: 'Rodada cancelada',
  sem_conta_mobilemed: 'Médico sem conta na MobileMed',
  erro_inesperado: 'A MobileMed não respondeu',
  saiu_da_fila: 'Já tinha médico quando o robô chegou',
  sessao_caiu: 'A sessão da MobileMed caiu',
  ja_atribuido_mobilemed: 'Já atribuído na MobileMed',
};

export function rotuloMotivo(motivo: string | null | undefined) {
  if (!motivo) return 'Sem motivo';
  const conhecido = MOTIVOS[motivo];
  if (conhecido) return conhecido;
  const texto = motivo.replaceAll('_', ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "Rodada de hoje, 10:31", "Rodada de ontem, 22:10", "Rodada de 17/11, 10:31". */
export function tituloDaRodada(criadoEm: string, agora = new Date()) {
  const curta = dataHoraCurta(criadoEm, agora);
  if (curta.startsWith('Hoje') || curta.startsWith('Ontem')) {
    return `Rodada de ${curta.charAt(0).toLowerCase()}${curta.slice(1)}`;
  }
  return `Rodada de ${curta.replace(' ', ', ')}`;
}

/** "Manhã", "Manhã e Lista", "Manhã, Lista e Tarde". */
export function juntarNomes(nomes: readonly string[]) {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

export type EstadoEtapa = 'feito' | 'agora' | 'futuro';
export type Etapa = { rotulo: string; estado: EstadoEtapa };

type RodadaDasEtapas = {
  status: StatusRodadaKey;
  lidaEm: string | null;
  aprovadaEm: string | null;
  contagens: ContagemDesignacoesDto;
};

/** Pedida → fila lida → aprovação → execução → fim, com a etapa de agora marcada. */
export function etapasDaRodada(r: RodadaDasEtapas): Etapa[] {
  const lida = r.lidaEm ? `Fila lida às ${horaDeBrasilia(r.lidaEm)}` : 'Fila lida';
  const aprovada = r.aprovadaEm ? `Aprovada às ${horaDeBrasilia(r.aprovadaEm)}` : 'Aprovada';
  const restam = r.contagens.prevista + r.contagens.retentaveis;
  const rotulos = [
    'Pedida',
    lida,
    r.aprovadaEm ? aprovada : 'Aguardando aprovação',
    'Executando',
    'Concluída',
  ];
  // Onde a rodada está agora e o que dizer ali.
  let agora: number;
  let rotuloAgora: string | null = null;
  switch (r.status) {
    case 'solicitada':
    case 'lendo':
      agora = 1;
      rotuloAgora = 'Lendo a fila';
      break;
    case 'aguardando_aprovacao':
      agora = 2;
      rotuloAgora = 'Aguardando aprovação';
      break;
    case 'expirada':
      agora = 2;
      rotuloAgora = 'Expirou sem aprovação';
      break;
    case 'aprovada':
    case 'executando':
      agora = 3;
      rotuloAgora = 'Executando';
      break;
    case 'pausada':
      agora = 3;
      rotuloAgora = 'Pausada';
      break;
    case 'parcial':
      agora = 4;
      rotuloAgora = `Parcial: ${restam} por tentar de novo`;
      rotulos[3] = 'Executada';
      break;
    case 'concluida':
      agora = 5;
      rotulos[3] = 'Executada';
      break;
    default:
      // Cancelada ou com falha: para onde estava.
      agora = r.aprovadaEm ? 3 : r.lidaEm ? 2 : 1;
      rotuloAgora = r.status === 'cancelada' ? 'Cancelada' : 'Falhou';
  }
  return rotulos.map((rotulo, i) => {
    if (i < agora) return { rotulo, estado: 'feito' };
    if (i === agora) return { rotulo: rotuloAgora ?? rotulo, estado: 'agora' };
    return { rotulo, estado: 'futuro' };
  });
}

const resumirIds = (
  ids: readonly string[],
  nomes: ReadonlyMap<string, string>,
  todos: string,
  unidade: [string, string],
) => {
  if (!ids.length) return todos;
  if (ids.every((id) => nomes.has(id))) return juntarNomes(ids.map((id) => nomes.get(id) ?? ''));
  return `${ids.length} ${ids.length === 1 ? unidade[0] : unidade[1]}`;
};

/** Os recortes da rodada em texto (lista vazia = sem recorte naquele eixo). */
export function descreverRecortes(r: RecortesRodadaDto, nomes: ReadonlyMap<string, string>) {
  const medicos = [
    r.medicosExcluidos.length &&
      `Sem ${resumirIds(r.medicosExcluidos, nomes, '', ['médico', 'médicos'])}`,
    r.medicosIncluidos.length &&
      `Com ${resumirIds(r.medicosIncluidos, nomes, '', ['médico', 'médicos'])} fora de turno`,
  ].filter(Boolean);
  return [
    { rotulo: 'Turnos', valor: resumirIds(r.turnoIds, nomes, 'Todos', ['turno', 'turnos']) },
    { rotulo: 'Frentes', valor: resumirIds(r.frenteIds, nomes, 'Todas', ['frente', 'frentes']) },
    {
      rotulo: 'Prioridades',
      valor: resumirIds(r.prioridadeOperacaoIds, nomes, 'Todas', ['prioridade', 'prioridades']),
    },
    {
      rotulo: 'Clientes',
      valor: resumirIds(r.clienteIds, nomes, 'Todos', ['cliente', 'clientes']),
    },
    { rotulo: 'Médicos', valor: medicos.length ? medicos.join('; ') : 'Os em turno' },
  ];
}

export type LinhaFunil = {
  rotulo: string;
  saem: number;
  restam: number;
  /** Lidos, propostos e atribuídos: os marcos entre as etapas. */
  marco: boolean;
  /** Para abrir os exames que a etapa tirou. */
  filtro: { status: StatusDesignacaoKey; motivo: string | null } | null;
};

/** Dos lidos aos atribuídos: o que o motor deixou de fora, a conferência tirou e a execução não fez. */
export function funilDosExames(lidos: number, motivos: readonly ContagemMotivoDto[]): LinhaFunil[] {
  let restam = lidos;
  const linhas: LinhaFunil[] = [
    { rotulo: 'Lidos na fila', saem: 0, restam, marco: true, filtro: null },
  ];
  const etapa = (status: StatusDesignacaoKey, ordem: (m: ContagemMotivoDto) => number) =>
    motivos
      .filter((m) => m.status === status)
      .sort((a, b) => ordem(a) - ordem(b) || b.quantidade - a.quantidade)
      .forEach((m) => {
        restam -= m.quantidade;
        linhas.push({
          rotulo: rotuloMotivo(m.motivo),
          saem: m.quantidade,
          restam,
          marco: false,
          filtro: { status, motivo: m.motivo },
        });
      });
  etapa('recusada', () => 0);
  linhas.push({ rotulo: 'Propostos', saem: 0, restam, marco: true, filtro: null });
  // Primeiro o que a conferência tirou, depois o que a execução pulou.
  etapa('pulada', (m) => (m.motivo === 'removido_na_conferencia' ? 0 : 1));
  etapa('falhou', () => 0);
  linhas.push({ rotulo: 'Atribuídos ou por atribuir', saem: 0, restam, marco: true, filtro: null });
  return linhas;
}

export type MedicoEmTurno = {
  medicoId: string;
  nome: string;
  turnos: string[];
  frentes: string[];
  cargaEmMaos: number;
  /** O maior teto (produtividade) entre os períodos em andamento; null = desconhecido. */
  teto: number | null;
};

/** Um por médico (ele pode ter vários períodos agora), em ordem de nome. */
export function medicosEmTurno(lista: readonly MedicoEmTurnoDto[]): MedicoEmTurno[] {
  const porId = new Map<string, MedicoEmTurno>();
  for (const o of lista) {
    const m = porId.get(o.medicoId) ?? {
      medicoId: o.medicoId,
      nome: o.nome,
      turnos: [],
      frentes: [],
      cargaEmMaos: o.cargaEmMaos,
      teto: null,
    };
    if (!m.turnos.includes(o.turno)) m.turnos.push(o.turno);
    if (!m.frentes.includes(o.frenteNome)) m.frentes.push(o.frenteNome);
    if (o.produtividade !== null) m.teto = Math.max(m.teto ?? 0, o.produtividade);
    porId.set(o.medicoId, m);
  }
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** A carga do médico depois da rodada (o que já tem aberto + o proposto) contra o teto. */
export function cargaDoMedico(m: {
  cargaEmMaos: number;
  propostos: number;
  capacidade: number | null;
}) {
  const depois = m.cargaEmMaos + m.propostos;
  const teto = m.capacidade;
  const base = teto && teto > 0 ? teto : Math.max(depois, 1);
  const pct = (n: number) => Math.min(100, Math.round((n / base) * 100));
  return {
    depois,
    teto,
    noTeto: teto !== null && depois >= teto,
    pctAberto: pct(m.cargaEmMaos),
    pctProposto: Math.min(100 - pct(m.cargaEmMaos), pct(m.propostos)),
  };
}

/** Tom da prioridade: urgência em vermelho; o resto neutro (a cor não é o único sinal). */
export const tomDaPrioridade = (d: { urgente: boolean }): TomEtiqueta =>
  d.urgente ? 'erro' : 'inativo';

export const PERIODOS = [
  { valor: '7', rotulo: 'Últimos 7 dias' },
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: 'todas', rotulo: 'Todas' },
] as const;
export type Periodo = (typeof PERIODOS)[number]['valor'];

/** "2 turno(s), 3 cliente(s)": o que a rodada recortou, em poucas palavras. */
export function recortesEmPoucasPalavras(r: RecortesRodadaDto) {
  const partes = [
    r.turnoIds.length ? `${r.turnoIds.length} turno(s)` : 'Todos os turnos',
    r.frenteIds.length && `${r.frenteIds.length} frente(s)`,
    r.prioridadeOperacaoIds.length && `${r.prioridadeOperacaoIds.length} prioridade(s)`,
    r.clienteIds.length && `${r.clienteIds.length} cliente(s)`,
    r.medicosExcluidos.length && `sem ${r.medicosExcluidos.length} médico(s)`,
    r.medicosIncluidos.length && `com ${r.medicosIncluidos.length} fora de turno`,
  ].filter(Boolean);
  return partes.join(', ');
}
