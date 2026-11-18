import { ErroDeDominio } from '../../../comum/erro-de-dominio';

/**
 * A máquina de estados de uma rodada de distribuição. Fonte: dashboards-one `rodadas.ts`.
 *
 *   solicitada → lendo → aguardando_aprovacao → aprovada → executando → concluida
 *                                ↘ expirada          ↘ pausada ⇄ aprovada   ↘ parcial | falhou
 *   (qualquer viva) → cancelada | concluida (encerrar) | falhou
 *
 * NADA é atribuído sem passar por `aprovada`: o robô lê, propõe, espera a pessoa e executa. Sem
 * rodada automática por ora (decisão de 17/11/2026). Cada função recebe o estado atual e devolve o
 * próximo, ou recusa com a mensagem para quem clicou.
 */

export type StatusRodada =
  | 'solicitada'
  | 'lendo'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'executando'
  | 'pausada'
  | 'parcial'
  | 'concluida'
  | 'expirada'
  | 'cancelada'
  | 'falhou';

export interface EstadoRodada {
  status: StatusRodada;
  expiraEm: Date | null;
}

/** Ainda vão a algum lugar: no máximo uma por vez. A parcial espera a decisão de quem acompanha. */
export const STATUS_VIVOS: readonly StatusRodada[] = [
  'solicitada',
  'lendo',
  'aguardando_aprovacao',
  'aprovada',
  'executando',
  'pausada',
  'parcial',
];

const ROTULO: Readonly<Record<StatusRodada, string>> = {
  solicitada: 'solicitada',
  lendo: 'lendo a fila',
  aguardando_aprovacao: 'aguardando aprovação',
  aprovada: 'aprovada',
  executando: 'distribuindo',
  pausada: 'pausada',
  parcial: 'parcial',
  concluida: 'concluída',
  expirada: 'expirada',
  cancelada: 'cancelada',
  falhou: 'com falha',
};

export class RodadaEmEstadoInvalidoError extends ErroDeDominio {
  readonly tipo = 'conflito';
}

const recusa = (mensagem: string): never => {
  throw new RodadaEmEstadoInvalidoError(mensagem);
};

export const estaViva = (s: StatusRodada) => STATUS_VIVOS.includes(s);

const exigir = (r: EstadoRodada, aceitos: readonly StatusRodada[], acao: string) => {
  if (!aceitos.includes(r.status)) {
    recusa(`A rodada está ${ROTULO[r.status]} e não pode ${acao}.`);
  }
};

export function iniciarLeitura(r: EstadoRodada): StatusRodada {
  exigir(r, ['solicitada'], 'começar a leitura');
  return 'lendo';
}

/** A leitura terminou: a proposta espera a aprovação até `expiraEm`. */
export function propor(
  r: EstadoRodada,
  agora: Date,
  expiracaoMin: number,
): { status: StatusRodada; expiraEm: Date } {
  exigir(r, ['lendo'], 'receber a proposta');
  return {
    status: 'aguardando_aprovacao',
    expiraEm: new Date(agora.getTime() + expiracaoMin * 60_000),
  };
}

/** Proposta velha descreve uma fila que já mudou: aprovar seria distribuir às cegas. */
export const expirou = (r: EstadoRodada, agora: Date) =>
  r.status === 'aguardando_aprovacao' &&
  r.expiraEm !== null &&
  r.expiraEm.getTime() < agora.getTime();

const exigirNaoVencida = (r: EstadoRodada, agora: Date) => {
  if (r.status === 'expirada' || expirou(r, agora)) {
    recusa('A proposta expirou: a fila da MobileMed já mudou. Leia de novo.');
  }
};

/** Quem confere só mexe na proposta antes do "Aprovar": depois, a execução já está atribuindo. */
export function exigirProposta(r: EstadoRodada, agora: Date): void {
  exigirNaoVencida(r, agora);
  exigir(r, ['aguardando_aprovacao'], 'ser ajustada');
}

export function aprovar(r: EstadoRodada, agora: Date): StatusRodada {
  exigirNaoVencida(r, agora);
  exigir(r, ['aguardando_aprovacao'], 'ser aprovada');
  return 'aprovada';
}

export function iniciarExecucao(r: EstadoRodada): StatusRodada {
  exigir(r, ['aprovada'], 'começar a distribuir');
  return 'executando';
}

/** Interrompe sem perder o feito: o que falta segue previsto. */
export function pausar(r: EstadoRodada): StatusRodada {
  exigir(r, ['aprovada', 'executando'], 'ser pausada (não está distribuindo)');
  return 'pausada';
}

/**
 * Volta a distribuir o que falta. Vale para a rodada travada em "executando" (a API caiu no meio)
 * e para a que falhou: retomar é o caminho, não recomeçar.
 */
export function retomar(r: EstadoRodada, { restam }: { restam: number }): StatusRodada {
  exigir(r, ['pausada', 'parcial', 'falhou', 'executando'], 'ser retomada');
  if (restam === 0) recusa('Não há mais exames pendentes nesta rodada. Encerre-a.');
  return 'aprovada';
}

const exigirViva = (r: EstadoRodada) => {
  if (!estaViva(r.status)) recusa(`A rodada já está encerrada (${ROTULO[r.status]}).`);
};

/** Aceita o que não foi atribuído: o feito conta, o resto fica para depois. */
export function encerrar(r: EstadoRodada): StatusRodada {
  exigirViva(r);
  return 'concluida';
}

export function cancelar(r: EstadoRodada): StatusRodada {
  exigirViva(r);
  return 'cancelada';
}

/** O job morreu no meio; null = a rodada já não estava viva (nada a marcar). */
export function falhar(r: EstadoRodada): StatusRodada | null {
  return estaViva(r.status) ? 'falhou' : null;
}

const exigirSemExecucao = (executadas: number) => {
  if (executadas > 0) {
    recusa(`Esta rodada já atribuiu ${executadas} exame(s). Encerre-a e inicie outra.`);
  }
};

/** Lê a fila de novo na mesma rodada (a leitura anterior é descartada). */
export function reler(r: EstadoRodada, { executadas }: { executadas: number }): StatusRodada {
  exigirSemExecucao(executadas);
  // A expirada fica no histórico como estava (com os ajustes): pede-se outra rodada.
  if (r.status === 'expirada') {
    recusa(
      'A proposta expirou e fica no histórico como estava: peça outra rodada com os mesmos recortes.',
    );
  }
  exigir(r, ['aguardando_aprovacao', 'falhou', 'parcial'], 'ser lida de novo');
  return 'solicitada';
}

/**
 * Trocar os médicos: antes da leitura basta gravar (ela lê o recorte ao começar); com a proposta
 * pronta, a fila é lida de novo com o time novo. Durante a leitura ou a execução, não.
 */
export function ajusteDeMedicos(
  r: EstadoRodada,
  { executadas }: { executadas: number },
): 'gravar' | 'reler' {
  if (r.status === 'solicitada') return 'gravar';
  if (r.status === 'lendo')
    recusa('A rodada está lendo a fila: espere a proposta para trocar os médicos.');
  reler(r, { executadas });
  return 'reler';
}

export interface ContagemExecucao {
  /** Ainda previstas (a execução parou antes delas). */
  restam: number;
  executadas: number;
  falhas: number;
  /** Puladas ou falhas que vale tentar de novo. */
  retentaveis: number;
  /** Alguém pausou enquanto a execução andava. */
  pausada: boolean;
  /** Falha que derrubou a execução inteira. */
  erroGeral?: string | null;
}

/**
 * Como a execução termina. Sobrou exame (previsto ou retentável): parcial, e quem acompanha decide
 * entre tentar o resto ou encerrar. Nada atribuído e alguma falha: falhou. A pausa pedida no meio
 * continua pausada, a menos que tudo tenha saído.
 */
export function desfechoExecucao(c: ContagemExecucao): StatusRodada {
  if (c.erroGeral) return 'falhou';
  if (c.pausada && c.restam > 0) return 'pausada';
  if (c.restam > 0) return 'parcial';
  if (c.executadas === 0 && c.falhas > 0) return 'falhou';
  if (c.retentaveis > 0) return 'parcial';
  return 'concluida';
}
