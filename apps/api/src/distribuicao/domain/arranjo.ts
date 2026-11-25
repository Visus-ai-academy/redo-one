/**
 * O que um médico (ou uma equipe) lauda. Os arranjos são uma união: o médico pega o exame se
 * QUALQUER arranjo dele casar por inteiro. Cada arranjo começa pela FRENTE, uma especialidade OU
 * uma modalidade do catálogo (a mesma ideia de frente da escala e das regras da frente): na de
 * especialidade, recorta-se por modalidades e segmentos; na de modalidade, por especialidades
 * ("RX de MI e MSK"). Em cada eixo, lista vazia significa "todos"; nos segmentos, lista vazia
 * SEM `subespecialidadeGeral` é "todos", e com ela é "só o geral".
 */
export type ModoVinculo = 'todos' | 'apenas' | 'exceto';

export interface Arranjo {
  /** Frente de especialidade. Exatamente uma das duas frentes vem preenchida. */
  especialidadeId: string | null;
  /** Frente de modalidade. */
  modalidadeId: string | null;
  /** Só na frente de modalidade: as especialidades dela que ele lauda; vazia = todas. */
  especialidadeIds: string[];
  /** Só na frente de especialidade: as modalidades dela que ele lauda; vazia = todas. */
  modalidadeIds: string[];
  subespecialidadeIds: string[];
  subespecialidadeGeral: boolean;
  /** Prioridades da operação (Internado, Ambulatório etc. separados); a grafia entra pelo de-para delas. */
  prioridadeIds: string[];
  modoClientes: ModoVinculo;
  clienteIds: string[];
  modoExames: ModoVinculo;
  exameIds: string[];
  /** Só em arranjo de médico: clínicas que, neste recorte, só os exclusivos recebem. */
  clientesExclusivosIds: string[];
}

export type DonoArranjo = 'medico' | 'equipe';

export class ArranjoInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ArranjoInvalidoError';
  }
}

function semRepetidos(lista: string[], eixo: string) {
  if (new Set(lista).size !== lista.length) {
    throw new ArranjoInvalidoError(`Há ${eixo} repetido no arranjo.`);
  }
}

/** O arranjo atende o cliente pela lista e pelo modo dele? */
function atendeCliente(a: Arranjo, clienteId: string): boolean {
  if (a.modoClientes === 'todos') return true;
  const naLista = a.clienteIds.includes(clienteId);
  return a.modoClientes === 'apenas' ? naLista : !naLista;
}

/** O recorte de cada eixo tem de ser o da frente do arranjo. */
function validarFrente(a: Arranjo): void {
  if ((a.especialidadeId === null) === (a.modalidadeId === null)) {
    throw new ArranjoInvalidoError(
      'Escolha a frente do arranjo: uma especialidade ou uma modalidade.',
    );
  }
  if (a.modalidadeId !== null) {
    if (a.modalidadeIds.length) {
      throw new ArranjoInvalidoError(
        'Na frente de modalidade, o recorte é por especialidades, não por modalidades.',
      );
    }
    if (a.subespecialidadeIds.length || a.subespecialidadeGeral) {
      throw new ArranjoInvalidoError('Segmento só vale na frente de especialidade.');
    }
  } else if (a.especialidadeIds.length) {
    throw new ArranjoInvalidoError(
      'Na frente de especialidade, o recorte é por modalidades, não por especialidades.',
    );
  }
}

export function validarArranjos(arranjos: Arranjo[], dono: DonoArranjo): void {
  for (const a of arranjos) {
    validarFrente(a);
    semRepetidos(a.especialidadeIds, 'especialidade');
    semRepetidos(a.modalidadeIds, 'modalidade');
    semRepetidos(a.subespecialidadeIds, 'segmento');
    semRepetidos(a.prioridadeIds, 'prioridade');
    semRepetidos(a.clienteIds, 'cliente');
    semRepetidos(a.exameIds, 'exame');
    semRepetidos(a.clientesExclusivosIds, 'clínica exclusiva');
    // "Só estes" sem nenhum seria "não lauda nada": um arranjo assim não serve para nada.
    if (a.modoClientes === 'apenas' && !a.clienteIds.length) {
      throw new ArranjoInvalidoError('Escolha ao menos um cliente em "só estes clientes".');
    }
    if (a.modoExames === 'apenas' && !a.exameIds.length) {
      throw new ArranjoInvalidoError('Escolha ao menos um exame em "só estes exames".');
    }
    if (a.clientesExclusivosIds.length && dono === 'equipe') {
      throw new ArranjoInvalidoError(
        'Clínica exclusiva só vale em arranjo de médico, não de equipe.',
      );
    }
    if (a.clientesExclusivosIds.some((c) => !atendeCliente(a, c))) {
      throw new ArranjoInvalidoError(
        'Toda clínica exclusiva precisa estar entre os clientes que o arranjo atende.',
      );
    }
  }
}

/** Frente da escala: uma especialidade ou uma modalidade do catálogo. */
export type FrenteEscala =
  | { tipo: 'especialidade'; especialidadeId: string; modalidadeId: null }
  | { tipo: 'modalidade'; especialidadeId: null; modalidadeId: string };

export interface SugestaoAlocacao {
  prioridadeIds: string[];
  subespecialidadeIds: string[];
  subespecialidadeGeral: boolean;
}

/** Une os recortes de um eixo: se algum arranjo não recorta, o eixo fica livre. */
function unir(listas: string[][]): string[] {
  if (listas.some((l) => l.length === 0)) return [];
  return [...new Set(listas.flat())];
}

/**
 * Pré-preenchimento da alocação a partir dos arranjos da frente. Na frente de especialidade, os
 * arranjos dela; na de modalidade, os dela e os de especialidade que marcam a modalidade ("MI em
 * RX"). O arranjo sem modalidade marcada não é "da" frente de RX, embora a cubra, e o de RX não é
 * "da" frente de MI. Sugestão: a gestora pode mudar tudo no formulário. Null = nenhum arranjo da
 * frente, nada a sugerir.
 */
export function sugestaoAlocacao(
  arranjos: Arranjo[],
  frente: FrenteEscala,
): SugestaoAlocacao | null {
  const daFrente = arranjos.filter((a) =>
    frente.tipo === 'especialidade'
      ? a.especialidadeId === frente.especialidadeId
      : a.modalidadeId === frente.modalidadeId || a.modalidadeIds.includes(frente.modalidadeId),
  );
  if (!daFrente.length) return null;
  const prioridadeIds = unir(daFrente.map((a) => a.prioridadeIds));
  // Segmento é recorte da especialidade: na frente de modalidade os arranjos podem ser de
  // especialidades diferentes, e juntar os segmentos delas não diz nada.
  if (frente.tipo === 'modalidade') {
    return { prioridadeIds, subespecialidadeIds: [], subespecialidadeGeral: false };
  }
  const semRecorte = daFrente.some(
    (a) => !a.subespecialidadeIds.length && !a.subespecialidadeGeral,
  );
  return semRecorte
    ? { prioridadeIds, subespecialidadeIds: [], subespecialidadeGeral: false }
    : {
        prioridadeIds,
        subespecialidadeIds: [...new Set(daFrente.flatMap((a) => a.subespecialidadeIds))],
        subespecialidadeGeral: daFrente.some((a) => a.subespecialidadeGeral),
      };
}
