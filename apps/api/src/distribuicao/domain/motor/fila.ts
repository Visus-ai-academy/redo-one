import type { FrenteEscala } from '../arranjo';
import type { ConfiguracaoDistribuicao, ItemOrdemFila, RegrasPorFrente } from './configuracao';

/**
 * A fila e o pacote do paciente. Fonte: dashboards-one `motor.ts` (`montarFila`, `chavePacote`,
 * `agruparPorPaciente`, `criarNivelDoExame`) e `rodadas.ts` (`recortarPrioridades`,
 * `recortarClinicas`). Diferenças de propósito: o "COLUNAS de MSK é outro pacote", fixo no código,
 * vira o segmento "pacote à parte" da frente; o prazo crítico vem da configuração.
 */

/** O exame como o motor o lê (já resolvido contra o catálogo e com a urgência decidida). */
export interface ExameMotor {
  id: string;
  /** Carga do exame na unidade da configuração (registros ou laudos). */
  laudos: number;
  especialidadeId: string | null;
  modalidadeId: string | null;
  subespecialidadeId: string | null;
  clienteId: string | null;
  urgente: boolean;
  /** Chave do paciente (HMAC): agrupa o pacote, nunca o nome. */
  paciente: string;
  /** Minutos até o prazo; negativo = vencido; null = desconhecido. */
  restanteMin: number | null;
  entradaEm: Date;
  /** Marcador de equilíbrio do exame (ex.: ONCO). */
  marcador: string | null;
  /** Médico que já está com outro exame do paciente nesta especialidade. */
  medicoAderente: string | null;
}

/** Sem acento, sem espaços nas pontas e em maiúsculas: a tela manda "Urgência". */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * A prioridade do exame (do catálogo, já traduzida pelas variações) é urgente pela configuração.
 * Nunca pela grafia crua da MobileMed.
 */
export function ehUrgente(
  prioridadeId: string | null,
  config: Pick<ConfiguracaoDistribuicao, 'prioridadeIdsUrgentes'>,
): boolean {
  return prioridadeId !== null && config.prioridadeIdsUrgentes.includes(prioridadeId);
}

/** Prioridade do cliente no pico, num recorte (frente de especialidade ou de modalidade). */
export interface PrioridadeCliente {
  clienteId: string;
  frente: FrenteEscala;
  /** Menor = mais prioritário (1 = Alta, 2 = Média). */
  nivel: number;
}

export type NivelDoExame = (
  e: Pick<ExameMotor, 'clienteId' | 'especialidadeId' | 'modalidadeId'>,
) => number;

/** Fora de todo recorte o cliente é normal: depois de qualquer nível cadastrado. */
const NIVEL_NORMAL = Number.MAX_SAFE_INTEGER;

/** Nível de cada exame pelo cliente e recorte (o melhor, se casar mais de um). Null sem prioridade. */
export function criarNivelDoExame(
  prioridades: readonly PrioridadeCliente[] | undefined,
): NivelDoExame | null {
  if (!prioridades?.length) return null;
  const nivel = new Map<string, number>();
  for (const p of prioridades) {
    const k = `${p.clienteId}|${p.frente.especialidadeId ?? p.frente.modalidadeId}`;
    nivel.set(k, Math.min(nivel.get(k) ?? NIVEL_NORMAL, p.nivel));
  }
  return (e) =>
    e.clienteId
      ? Math.min(
          nivel.get(`${e.clienteId}|${e.especialidadeId}`) ?? NIVEL_NORMAL,
          nivel.get(`${e.clienteId}|${e.modalidadeId}`) ?? NIVEL_NORMAL,
        )
      : NIVEL_NORMAL;
}

type CriterioInterno = ItemOrdemFila['criterio'] | 'prazoCritico' | 'cliente';

/** Prazo crítico e nível do cliente entram logo depois da urgência (ou no topo, sem ela). */
function comFaixasDoCliente(ordem: readonly ItemOrdemFila[]) {
  const i = ordem.findIndex((o) => o.criterio === 'prioridade') + 1;
  return [
    ...ordem.slice(0, i),
    { criterio: 'prazoCritico' as const, direcao: 'asc' as const },
    { criterio: 'cliente' as const, direcao: 'asc' as const },
    ...ordem.slice(i),
  ];
}

/**
 * Ordena pela `ordemFila` configurada; o primeiro critério que desempata decide. Com prioridade de
 * cliente, logo depois da urgência entram a faixa do prazo crítico e o nível do cliente.
 */
export function montarFila<T extends ExameMotor>(
  exames: readonly T[],
  config: Pick<ConfiguracaoDistribuicao, 'ordemFila' | 'prazoCriticoMin'>,
  nivelDoExame?: NivelDoExame | null,
): T[] {
  const ordem: { criterio: CriterioInterno; direcao: 'asc' | 'desc' }[] = nivelDoExame
    ? comFaixasDoCliente(config.ordemFila)
    : [...config.ordemFila];
  const valor = (e: T, criterio: CriterioInterno): number => {
    switch (criterio) {
      case 'prioridade':
        return e.urgente ? 1 : 0;
      case 'prazoCritico':
        // A urgência é uma faixa só: dentro dela o nível do cliente vem antes do prazo.
        if (e.urgente) return 0;
        return e.restanteMin !== null && e.restanteMin < config.prazoCriticoMin ? 0 : 1;
      case 'cliente':
        return nivelDoExame ? nivelDoExame(e) : NIVEL_NORMAL;
      case 'prazo':
        return e.restanteMin ?? Number.MAX_SAFE_INTEGER;
      case 'antiguidade':
        return e.entradaEm.getTime();
    }
  };
  return [...exames].sort((a, b) => {
    for (const { criterio, direcao } of ordem) {
      const d = valor(a, criterio) - valor(b, criterio);
      if (d !== 0) return direcao === 'asc' ? d : -d;
    }
    return 0;
  });
}

/**
 * Chave do pacote: paciente + especialidade (o mesmo laudo não se parte entre dois médicos;
 * entre especialidades, exames diferentes são laudos diferentes). O segmento marcado "pacote à
 * parte" na frente da especialidade forma pacote próprio.
 */
export function chavePacote(
  e: Pick<ExameMotor, 'paciente' | 'especialidadeId' | 'subespecialidadeId'>,
  regras: RegrasPorFrente,
): string {
  const aParte =
    e.subespecialidadeId !== null &&
    !!regras
      .daEspecialidade(e.especialidadeId)
      ?.segmentos.some((s) => s.pacoteAParte && s.subespecialidadeId === e.subespecialidadeId);
  return `${e.paciente}|${e.especialidadeId ?? ''}${aParte ? `|${e.subespecialidadeId}` : ''}`;
}

export interface GrupoExames {
  paciente: string;
  exames: ExameMotor[];
  laudos: number;
  /** Posição na fila = a do exame mais bem colocado do pacote. */
  posicao: number;
}

/**
 * Junta os exames do mesmo pacote num lote indivisível, que herda a posição do seu exame mais bem
 * colocado. No mesmo prazo, mesma urgência e mesmo nível de cliente, o pacote maior vem antes: o
 * teto é tudo ou nada, e os avulsos enchiam as vagas antes dele (15/10).
 */
export function agruparPorPaciente(
  fila: readonly ExameMotor[],
  config: Pick<ConfiguracaoDistribuicao, 'agruparPorPaciente' | 'janelaPacienteHoras'>,
  regras: RegrasPorFrente,
  nivelDoExame: NivelDoExame | null,
): GrupoExames[] {
  if (!config.agruparPorPaciente) {
    return fila.map((e, i) => ({
      paciente: e.paciente,
      exames: [e],
      laudos: e.laudos,
      posicao: i,
    }));
  }
  const janelaMs =
    config.janelaPacienteHoras > 0
      ? config.janelaPacienteHoras * 3_600_000
      : Number.POSITIVE_INFINITY;
  const grupos: GrupoExames[] = [];
  const porChave = new Map<string, GrupoExames[]>();
  fila.forEach((e, i) => {
    const chave = chavePacote(e, regras);
    const doPacote = porChave.get(chave) ?? [];
    const cabe = doPacote.find((g) =>
      g.exames.some((x) => Math.abs(x.entradaEm.getTime() - e.entradaEm.getTime()) <= janelaMs),
    );
    if (cabe) {
      cabe.exames.push(e);
      cabe.laudos += e.laudos;
      cabe.posicao = Math.min(cabe.posicao, i);
      return;
    }
    const novo = { paciente: e.paciente, exames: [e], laudos: e.laudos, posicao: i };
    grupos.push(novo);
    porChave.set(chave, [...doPacote, novo]);
  });
  grupos.sort((a, b) => a.posicao - b.posicao);

  const faixa = (g: GrupoExames) => {
    const e = fila[g.posicao] as ExameMotor;
    return `${e.urgente ? 1 : 0}|${nivelDoExame ? nivelDoExame(e) : ''}|${e.restanteMin ?? ''}`;
  };
  for (let i = 0; i < grupos.length; ) {
    let fim = i + 1;
    while (
      fim < grupos.length &&
      faixa(grupos[fim] as GrupoExames) === faixa(grupos[i] as GrupoExames)
    )
      fim++;
    const trecho = grupos
      .slice(i, fim)
      .sort((a, b) => b.laudos - a.laudos || a.posicao - b.posicao);
    grupos.splice(i, trecho.length, ...trecho);
    i = fim;
  }
  return grupos;
}

/**
 * Filtro de prioridade da rodada (ids do catálogo): devolve os exames que ficam de fora. O pacote
 * do paciente não se parte: se um exame dele passa, os outros vão junto.
 */
export function recortarPrioridades(
  exames: readonly (Pick<
    ExameMotor,
    'id' | 'paciente' | 'especialidadeId' | 'subespecialidadeId'
  > & {
    prioridadeId: string | null;
  })[],
  prioridadeIds: readonly string[],
  regras: RegrasPorFrente,
): Set<string> {
  if (!prioridadeIds.length) return new Set();
  const passa = new Set(
    exames
      .filter((e) => e.prioridadeId !== null && prioridadeIds.includes(e.prioridadeId))
      .map((e) => chavePacote(e, regras)),
  );
  return new Set(exames.filter((e) => !passa.has(chavePacote(e, regras))).map((e) => e.id));
}

/** Filtro de clínica da rodada: devolve os exames de outra clínica (ou sem cliente). */
export function recortarClinicas(
  exames: readonly { id: string; clienteId: string | null }[],
  clienteIds: readonly string[],
): Set<string> {
  if (!clienteIds.length) return new Set();
  return new Set(
    exames
      .filter((e) => e.clienteId === null || !clienteIds.includes(e.clienteId))
      .map((e) => e.id),
  );
}
