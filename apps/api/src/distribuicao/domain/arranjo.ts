/**
 * O que um médico (ou uma equipe) lauda. Os arranjos são uma união: o médico pega o exame se
 * QUALQUER arranjo dele casar por inteiro. Cada arranjo começa pela FRENTE, uma especialidade OU
 * uma modalidade do catálogo (a mesma ideia de frente da escala e das regras da frente): na de
 * especialidade, recorta-se por modalidades e segmentos; na de modalidade, por especialidades
 * ("RX de MI e MSK"). Em cada eixo, "todas" é explícito (`todasModalidades` etc.): lista vazia
 * nunca quer dizer "todas" (decisão de 25/11/2026), e sem "todas" a lista precisa de ao menos um.
 * Nos segmentos, `subespecialidadeGeral` sozinho é "só o geral". O eixo que não é da frente
 * (modalidades e segmentos na de modalidade; especialidades na de especialidade) fica vazio e com
 * "todas" falso.
 */
export type ModoVinculo = 'todos' | 'apenas' | 'exceto';

export interface Arranjo {
  /** Frente de especialidade. Exatamente uma das duas frentes vem preenchida. */
  especialidadeId: string | null;
  /** Frente de modalidade. */
  modalidadeId: string | null;
  /** Só na frente de modalidade: lauda todas as especialidades dela. */
  todasEspecialidades: boolean;
  /** Só na frente de modalidade, sem `todasEspecialidades`: as especialidades que ele lauda. */
  especialidadeIds: string[];
  /** Só na frente de especialidade: lauda todas as modalidades dela. */
  todasModalidades: boolean;
  /** Só na frente de especialidade, sem `todasModalidades`: as modalidades que ele lauda. */
  modalidadeIds: string[];
  /** Só na frente de especialidade: lauda todos os segmentos (e o exame sem segmento). */
  todosSegmentos: boolean;
  subespecialidadeIds: string[];
  subespecialidadeGeral: boolean;
  todasPrioridades: boolean;
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
    if (a.modalidadeIds.length || a.todasModalidades) {
      throw new ArranjoInvalidoError(
        'Na frente de modalidade, o recorte é por especialidades, não por modalidades.',
      );
    }
    if (a.subespecialidadeIds.length || a.subespecialidadeGeral || a.todosSegmentos) {
      throw new ArranjoInvalidoError('Segmento só vale na frente de especialidade.');
    }
    exigirRecorte(a.todasEspecialidades, a.especialidadeIds.length > 0, 'especialidade');
  } else {
    if (a.especialidadeIds.length || a.todasEspecialidades) {
      throw new ArranjoInvalidoError(
        'Na frente de especialidade, o recorte é por modalidades, não por especialidades.',
      );
    }
    exigirRecorte(a.todasModalidades, a.modalidadeIds.length > 0, 'modalidade');
    exigirRecorte(
      a.todosSegmentos,
      a.subespecialidadeIds.length > 0 || a.subespecialidadeGeral,
      'segmento',
    );
  }
  exigirRecorte(a.todasPrioridades, a.prioridadeIds.length > 0, 'prioridade');
}

/** O eixo é "todas" OU uma lista com ao menos um: nunca as duas coisas, nem nenhuma. */
function exigirRecorte(todas: boolean, temLista: boolean, eixo: string): void {
  if (todas && temLista) {
    throw new ArranjoInvalidoError(`Escolha "todas" ou uma lista de ${eixo}, não as duas.`);
  }
  if (!todas && !temLista) {
    throw new ArranjoInvalidoError(`Escolha ao menos um(a) ${eixo} ou marque "todas".`);
  }
}

/**
 * Tira do arranjo o "todas" dos eixos que não são da frente (a tela pode mandar ligado): na
 * frente de modalidade não há modalidades nem segmentos; na de especialidade, não há especialidades.
 */
export function normalizarArranjo(a: Arranjo): Arranjo {
  return a.modalidadeId !== null
    ? { ...a, todasModalidades: false, todosSegmentos: false }
    : { ...a, todasEspecialidades: false };
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
    // "Todos, exceto nenhum" seria "todos" às escondidas: para isso existe o modo "todos".
    if (a.modoClientes === 'exceto' && !a.clienteIds.length) {
      throw new ArranjoInvalidoError('Escolha ao menos um cliente em "todos, exceto estes".');
    }
    if (a.modoExames === 'exceto' && !a.exameIds.length) {
      throw new ArranjoInvalidoError('Escolha ao menos um exame em "todos, exceto estes".');
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
  todasPrioridades: boolean;
  prioridadeIds: string[];
  todosSegmentos: boolean;
  subespecialidadeIds: string[];
  subespecialidadeGeral: boolean;
}

/** Une os recortes de um eixo: se algum arranjo pega todas, o eixo fica com todas. */
function unir(eixos: { todas: boolean; ids: string[] }[]): { todas: boolean; ids: string[] } {
  if (eixos.some((e) => e.todas)) return { todas: true, ids: [] };
  return { todas: false, ids: [...new Set(eixos.flatMap((e) => e.ids))] };
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
  const prioridades = unir(
    daFrente.map((a) => ({ todas: a.todasPrioridades, ids: a.prioridadeIds })),
  );
  const comPrioridades = { todasPrioridades: prioridades.todas, prioridadeIds: prioridades.ids };
  const todosOsSegmentos = {
    todosSegmentos: true,
    subespecialidadeIds: [],
    subespecialidadeGeral: false,
  };
  // Segmento é recorte da especialidade: na frente de modalidade os arranjos podem ser de
  // especialidades diferentes, e juntar os segmentos delas não diz nada.
  if (frente.tipo === 'modalidade' || daFrente.some((a) => a.todosSegmentos)) {
    return { ...comPrioridades, ...todosOsSegmentos };
  }
  return {
    ...comPrioridades,
    todosSegmentos: false,
    subespecialidadeIds: [...new Set(daFrente.flatMap((a) => a.subespecialidadeIds))],
    subespecialidadeGeral: daFrente.some((a) => a.subespecialidadeGeral),
  };
}
