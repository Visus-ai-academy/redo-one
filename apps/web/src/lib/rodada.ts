// A rodada do robô de distribuição na tela: rótulos, etapas, recortes e funil (sem React).
import { somarDias } from '../components/escala-ausencias/ausencias';
import type { TomEtiqueta } from '../components/etiqueta/Etiqueta';
import {
  ATALHOS_ULTIMOS,
  type AtalhoDePeriodo,
  inicioDoDiaEmBrasilia,
  type Periodo as PeriodoKit,
  periodoDoAtalho,
} from '../components/periodo/periodo';
import type { ContagemDesignacoesDto } from '../gen/types/ContagemDesignacoesDto';
import type { ContagemMotivoDto } from '../gen/types/ContagemMotivoDto';
import type { FunilMedicosDto } from '../gen/types/FunilMedicosDto';
import type { MedicoEmTurnoDto } from '../gen/types/MedicoEmTurnoDto';
import type { MotivoRecolhimentoKey } from '../gen/types/MotivoRecolhimento';
import type { RecolhimentoPrevistoDto } from '../gen/types/RecolhimentoPrevistoDto';
import type { RecolhimentoRodadaDto } from '../gen/types/RecolhimentoRodadaDto';
import type { RecortesRodadaDto } from '../gen/types/RecortesRodadaDto';
import type { StatusDesignacaoKey } from '../gen/types/StatusDesignacao';
import type { StatusRodadaKey } from '../gen/types/StatusRodada';
import type { UnidadeTetoKey as UnidadeTeto } from '../gen/types/UnidadeTeto';
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

const LENDO_A_CADA_MS = 3_000;
/** Depois da hora prevista da leitura do job: dá tempo de ela terminar antes de consultar. */
const FOLGA_LEITURA_MS = 30_000;
/** A leitura atrasou (ou nunca houve): tenta de minuto em minuto até o retrato novo chegar. */
const ATRASADA_A_CADA_MS = 60_000;
/** Leitura automática desligada: a fila só muda por leitura pedida (regra dos painéis, 1–5 min). */
const SEM_LEITURA_AUTOMATICA_MS = 5 * 60_000;

/**
 * Polling da fila do momento, casado com a leitura do job: em vez de consultar num intervalo fixo,
 * espera a próxima leitura (a última leitura, falha ou pedido mais o intervalo de Configurações ›
 * Distribuição, com folga). Com rodada viva, não consulta; com leitura pedida, de 3 em 3 s.
 */
export function intervaloDoRetrato(
  r: {
    rodadaViva: boolean;
    lendo: boolean;
    intervaloMin: number | null;
    lidaEm: string | null;
    falhaEm: string | null;
    pedidaEm: string | null;
  },
  agora: number,
): number | false {
  if (r.rodadaViva) return false;
  if (r.lendo) return LENDO_A_CADA_MS;
  if (r.intervaloMin === null) return SEM_LEITURA_AUTOMATICA_MS;
  const ultima = Math.max(
    ...[r.lidaEm, r.falhaEm, r.pedidaEm].map((x) => (x ? new Date(x).getTime() : 0)),
  );
  if (!ultima) return ATRASADA_A_CADA_MS;
  const espera = ultima + r.intervaloMin * 60_000 + FOLGA_LEITURA_MS - agora;
  return espera > 0 ? espera : ATRASADA_A_CADA_MS;
}

/** Rótulo de cada motivo gravado pelo motor, pela conferência, pela execução e pelo controle. */
const MOTIVOS: Record<string, string> = {
  horario_sem_robo: 'Horário sem robô na frente',
  frente_manual: 'A frente não é distribuída pelo robô',
  sem_medico_elegivel: 'Nenhum médico da rodada podia laudar',
  sem_espaco: 'Todos que laudam estavam no teto',
  teto_do_segmento: 'Todos que laudam atingiram o máximo do segmento',
  nao_novo: 'Já aberto por um médico',
  cliente_inativo: 'Cliente inativo no cadastro',
  fora_da_prioridade: 'Fora das prioridades da rodada',
  fora_da_clinica: 'Fora dos clientes da rodada',
  fora_da_frente: 'Fora das frentes da rodada',
  fora_da_subespecialidade: 'Fora das subespecialidades da rodada',
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
  mudou_de_dono: 'Aberto ou trocado de médico desde o recolhimento',
  medico_fora_da_unidade: 'Conta do médico não liberada nesta unidade na MobileMed',
};

export function rotuloMotivo(motivo: string | null | undefined) {
  if (!motivo) return 'Sem motivo';
  const conhecido = MOTIVOS[motivo];
  if (conhecido) return conhecido;
  const texto = motivo.replaceAll('_', ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const MOTIVOS_RECOLHIMENTO: Record<MotivoRecolhimentoKey, string> = {
  turno_encerrado: 'Turno encerrado',
  ausencia: 'Ausente hoje',
};

/** A marca do exame recolhido na proposta: de quem sai e por quê; null = veio da fila sem médico. */
export function rotuloRecolhido(d: {
  recolhidoDe: { id: string; nome: string } | null;
  motivoRecolhimento: MotivoRecolhimentoKey | null;
}) {
  if (!d.recolhidoDe) return null;
  return {
    etiqueta: `Recolhido de ${d.recolhidoDe.nome}`,
    motivo: d.motivoRecolhimento ? MOTIVOS_RECOLHIMENTO[d.motivoRecolhimento] : null,
  };
}

/** Por que um exame que podia ser recolhido ficou com o médico, em ordem de exibição. */
const FICARAM: [keyof RecolhimentoRodadaDto['naoRecolhidos'], string][] = [
  ['turno_em_curso', 'Turno da entrega ainda em curso (ou na carência)'],
  ['aberto', 'Já aberto pelo médico'],
  ['frente_nao_recolhe', 'Frente que não recolhe ao fim do turno'],
  ['pacote_aberto', 'Outro exame do pacote já aberto'],
  ['trocado_por_fora', 'Trocado de médico à mão depois do robô'],
];

/** O recolhimento da leitura (detalhe e conferência); null = desligado ou leitura antiga. */
export function resumoDoRecolhimento(r: RecolhimentoRodadaDto | null | undefined) {
  if (!r) return null;
  const texto = r.recolhiveis
    ? `${num(r.recolhiveis)} recolhido(s) de médicos fora do turno ou ausentes` +
      (r.porAusencia ? ` (${num(r.porAusencia)} por ausência)` : '') +
      `: ${num(r.propostos)} propostos a outro médico` +
      (r.semDestino ? `, ${num(r.semDestino)} fica(m) com quem tem` : '')
    : 'Nenhum exame a recolher';
  const ficaram = FICARAM.map(([chave, rotulo]) => ({ rotulo, quantidade: r.naoRecolhidos[chave] }))
    .filter((f) => f.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);
  return { texto, ficaram };
}

/** A prévia do "Distribuir agora"; null = ainda não chegou. */
export function recolhimentoPrevistoEmTexto(p: RecolhimentoPrevistoDto | undefined) {
  if (!p) return null;
  if (!p.ligado) return 'Recolhimento desligado em Configurações › Distribuição.';
  if (!p.recolhiveis) return 'Nenhum exame a recolher de médicos fora do turno ou ausentes.';
  return (
    `Mais ${num(p.recolhiveis)} exame(s) a recolher de médicos fora do turno ou ausentes` +
    (p.porAusencia ? ` (${num(p.porAusencia)} por ausência)` : '') +
    ', se houver quem os pegue.'
  );
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

/** Com o "todos" explícito, `todos`; lista vazia sem ele, `nenhum` (vazio nunca é "todos"). */
const resumirIds = (
  ids: readonly string[],
  nomes: ReadonlyMap<string, string>,
  todos: string | false,
  unidade: [string, string],
  nenhum = '',
) => {
  if (todos !== false) return todos;
  if (!ids.length) return nenhum;
  if (ids.every((id) => nomes.has(id))) return juntarNomes(ids.map((id) => nomes.get(id) ?? ''));
  return `${ids.length} ${ids.length === 1 ? unidade[0] : unidade[1]}`;
};

/** Os recortes da rodada em texto. */
export function descreverRecortes(r: RecortesRodadaDto, nomes: ReadonlyMap<string, string>) {
  const medicos = [
    r.medicosExcluidos.length &&
      `Sem ${resumirIds(r.medicosExcluidos, nomes, false, ['médico', 'médicos'])}`,
    r.medicosIncluidos.length &&
      `Com ${resumirIds(r.medicosIncluidos, nomes, false, ['médico', 'médicos'])} fora de turno`,
  ].filter(Boolean);
  return [
    {
      rotulo: 'Turnos',
      valor: resumirIds(r.turnoIds, nomes, r.todosTurnos && 'Todos', ['turno', 'turnos'], 'Nenhum'),
    },
    {
      rotulo: 'Frentes',
      valor: resumirIds(
        r.frenteIds,
        nomes,
        r.todasFrentes && 'Todas',
        ['frente', 'frentes'],
        'Nenhuma',
      ),
    },
    {
      rotulo: 'Prioridades',
      valor: resumirIds(
        r.prioridadeOperacaoIds,
        nomes,
        r.todasPrioridades && 'Todas',
        ['prioridade', 'prioridades'],
        'Nenhuma',
      ),
    },
    {
      rotulo: 'Subespecialidades',
      // O geral (exame sem subespecialidade) entra como o id vazio.
      valor: resumirIds(
        r.subespecialidadeGeral ? [...r.subespecialidadeIds, ''] : r.subespecialidadeIds,
        new Map(nomes).set('', 'Sem subespecialidade'),
        r.todosSegmentos && 'Todas',
        ['subespecialidade', 'subespecialidades'],
        'Nenhuma',
      ),
    },
    {
      rotulo: 'Clientes',
      valor: resumirIds(
        r.clienteIds,
        nomes,
        r.todosClientes && 'Todos',
        ['cliente', 'clientes'],
        'Nenhum',
      ),
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
export function funilDosExames(
  lidos: number,
  motivos: readonly ContagemMotivoDto[],
  /** Recolhidos de outros médicos que entraram na proposta. */
  recolhidos = 0,
): LinhaFunil[] {
  let restam = lidos;
  const linhas: LinhaFunil[] = [
    { rotulo: 'Lidos na fila', saem: 0, restam, marco: true, filtro: null },
  ];
  if (recolhidos) {
    restam += recolhidos;
    linhas.push({
      rotulo: 'Mais os recolhidos de outros médicos',
      saem: 0,
      restam,
      marco: true,
      filtro: null,
    });
  }
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

export type LinhaFunilMedicos = { rotulo: string; restam: number; saem: number; marco?: boolean };

/** Dos habilitados aos que receberam: onde cada médico ficou de fora da rodada. */
export function funilDosMedicos(f: FunilMedicosDto): LinhaFunilMedicos[] {
  return [
    { rotulo: 'Habilitados no robô', restam: f.habilitados, saem: 0, marco: true },
    { rotulo: 'Sem escala agora', restam: f.escalados, saem: f.habilitados - f.escalados },
    { rotulo: 'Com ausência no dia', restam: f.disponiveis, saem: f.escalados - f.disponiveis },
    {
      rotulo: 'Fora dos turnos e frentes da rodada (ou tirados)',
      restam: f.noTurno,
      saem: f.disponiveis - f.noTurno,
    },
    { rotulo: 'Fora do horário agora', restam: f.noHorario, saem: f.noTurno - f.noHorario },
    { rotulo: 'Sem conta na MobileMed', restam: f.comConta, saem: f.noHorario - f.comConta },
    { rotulo: 'Receberam exames', restam: f.receberam, saem: 0, marco: true },
  ];
}

/** Turno, frente ou segmento com a cor cadastrada (null = selo neutro). */
export type ItemComCor = { id: string; nome: string; cor: string | null };

export type FrenteEmTurno = ItemComCor & {
  /** Os segmentos recortados na alocação; vazio = a frente inteira. */
  recorte: ItemComCor[];
};

export type MedicoEmTurno = {
  medicoId: string;
  nome: string;
  turnos: ItemComCor[];
  frentes: FrenteEmTurno[];
  /** Os segmentos que alguma frente dele cobre (o filtro de subespecialidade). */
  segmentos: ItemComCor[];
  /** Na unidade do teto dele. */
  cargaEmMaos: number;
  /** Em que o teto dele é contado; ausente nos retratos antigos. */
  unidadeTeto?: UnidadeTeto;
  /** O maior teto (produtividade) entre os períodos em andamento; null = desconhecido. */
  teto: number | null;
};

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');

const juntarItem = (lista: ItemComCor[], item: ItemComCor) => {
  if (!lista.some((x) => x.id === item.id)) lista.push(item);
};

/** Um por médico (ele pode ter vários períodos agora), em ordem de nome. */
export function medicosEmTurno(lista: readonly MedicoEmTurnoDto[]): MedicoEmTurno[] {
  const porId = new Map<string, MedicoEmTurno>();
  // Frente do médico com algum período sem recorte: vale a frente inteira.
  const frenteInteira = new Set<string>();
  for (const o of lista) {
    const m = porId.get(o.medicoId) ?? {
      medicoId: o.medicoId,
      nome: o.nome,
      turnos: [],
      frentes: [],
      segmentos: [],
      cargaEmMaos: o.cargaEmMaos,
      unidadeTeto: o.unidadeTeto,
      teto: null,
    };
    juntarItem(m.turnos, { id: o.turnoId, nome: o.turno, cor: o.turnoCor });
    const idFrente = o.frenteId ?? o.frenteNome;
    let frente = m.frentes.find((f) => f.id === idFrente);
    if (!frente) {
      frente = { id: idFrente, nome: o.frenteNome, cor: o.frenteCor, recorte: [] };
      m.frentes.push(frente);
    }
    const chave = `${o.medicoId}|${idFrente}`;
    if (!o.segmentosRecortados) {
      frenteInteira.add(chave);
      frente.recorte = [];
    } else if (!frenteInteira.has(chave)) {
      for (const sg of o.segmentos) juntarItem(frente.recorte, sg);
    }
    for (const sg of o.segmentos) juntarItem(m.segmentos, sg);
    if (o.produtividade !== null) m.teto = Math.max(m.teto ?? 0, o.produtividade);
    porId.set(o.medicoId, m);
  }
  return [...porId.values()].sort(porNome);
}

export type OpcaoComCor = { valor: string; rotulo: string; cor: string | null };

const opcoes = (itens: ItemComCor[]): OpcaoComCor[] => {
  const unicos = new Map<string, ItemComCor>();
  for (const i of itens) unicos.set(i.id, i);
  return [...unicos.values()]
    .sort(porNome)
    .map((i) => ({ valor: i.id, rotulo: i.nome, cor: i.cor }));
};

/** As opções dos filtros saem de quem está em turno: turnos, frentes e os segmentos cobertos. */
export function opcoesDosFiltros(medicos: readonly MedicoEmTurno[]) {
  return {
    turnos: opcoes(medicos.flatMap((m) => m.turnos)),
    frentes: opcoes(medicos.flatMap((m) => m.frentes)),
    segmentos: opcoes(medicos.flatMap((m) => m.segmentos)),
  };
}

export type FiltrosEmTurno = { turnos: string[]; frentes: string[]; segmentos: string[] };

/**
 * Cada filtro marcado precisa casar (e entre eles): o médico com ao menos um turno ou frente
 * escolhido, e com alguma frente que cubra o segmento escolhido.
 */
export function filtrarMedicosEmTurno(medicos: readonly MedicoEmTurno[], f: FiltrosEmTurno) {
  const casa = (marcados: string[], itens: ItemComCor[]) =>
    !marcados.length || itens.some((i) => marcados.includes(i.id));
  return medicos.filter(
    (m) => casa(f.turnos, m.turnos) && casa(f.frentes, m.frentes) && casa(f.segmentos, m.segmentos),
  );
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

/**
 * A carga prevista do médico na unidade do teto dele: as previstas em exames, ou a soma dos
 * laudos delas para quem conta por laudos. Sem unidade (fora do retrato), em exames.
 */
export const cargaNaUnidade = (m: {
  unidadeTeto: UnidadeTeto | null;
  previstas: number;
  laudosPrevistos: number;
}) => (m.unidadeTeto === 'laudos' ? m.laudosPrevistos : m.previstas);

/** "12 de 20 exames", "3 laudos, sem teto"; sem unidade (retrato antigo), só os números. */
export function textoDaCarga(
  c: { depois: number; teto: number | null },
  unidade: UnidadeTeto | null | undefined,
) {
  const u = unidade ? ` ${unidade}` : '';
  return c.teto === null
    ? `${num(c.depois)}${u}, sem teto`
    : `${num(c.depois)} de ${num(c.teto)}${u}`;
}

/** Tom da prioridade: urgência em vermelho; o resto neutro (a cor não é o único sinal). */
export const tomDaPrioridade = (d: { urgente: boolean }): TomEtiqueta =>
  d.urgente ? 'erro' : 'inativo';

/** O que fica na URL do histórico: `todas` (sem período) ou De e Até; nada é o padrão (7 dias). */
export type BuscaPeriodoHistorico = { periodo?: 'todas'; de?: string; ate?: string };

const PADRAO_HISTORICO = ATALHOS_ULTIMOS.find((a) => a.valor === '7') as AtalhoDePeriodo;

/** O período do histórico das rodadas pela URL; sem nada, os últimos 7 dias. */
export function periodoDoHistorico(busca: BuscaPeriodoHistorico, hoje: string): PeriodoKit {
  if (busca.periodo === 'todas') return { de: undefined, ate: undefined };
  if (busca.de || busca.ate) return { de: busca.de, ate: busca.ate };
  return periodoDoAtalho(PADRAO_HISTORICO, hoje);
}

/** O período escolhido de volta para a URL (o padrão não fica na URL). */
export function buscaDoPeriodoHistorico(p: PeriodoKit, hoje: string): BuscaPeriodoHistorico {
  if (!p.de && !p.ate) return { periodo: 'todas' };
  const padrao = periodoDoAtalho(PADRAO_HISTORICO, hoje);
  if (p.de === padrao.de && p.ate === padrao.ate) return {};
  return { de: p.de, ate: p.ate };
}

/** O período em instantes para a API: `desde` inclusivo, `ate` exclusivo (o dia seguinte). */
export function consultaDoPeriodo(p: PeriodoKit): { desde?: string; ate?: string } {
  return {
    ...(p.de && { desde: inicioDoDiaEmBrasilia(p.de) }),
    ...(p.ate && { ate: inicioDoDiaEmBrasilia(somarDias(p.ate, 1)) }),
  };
}

/** "2 turno(s), 3 cliente(s)": o que a rodada recortou, em poucas palavras. */
export function recortesEmPoucasPalavras(r: RecortesRodadaDto) {
  const partes = [
    r.todosTurnos ? 'Todos os turnos' : `${r.turnoIds.length} turno(s)`,
    !r.todasFrentes && `${r.frenteIds.length} frente(s)`,
    !r.todasPrioridades && `${r.prioridadeOperacaoIds.length} prioridade(s)`,
    !r.todosSegmentos &&
      `${r.subespecialidadeIds.length + Number(r.subespecialidadeGeral)} subespecialidade(s)`,
    !r.todosClientes && `${r.clienteIds.length} cliente(s)`,
    r.medicosExcluidos.length && `sem ${r.medicosExcluidos.length} médico(s)`,
    r.medicosIncluidos.length && `com ${r.medicosIncluidos.length} fora de turno`,
  ].filter(Boolean);
  return partes.join(', ');
}
