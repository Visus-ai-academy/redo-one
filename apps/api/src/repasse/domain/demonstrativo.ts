import {
  type AlternativaPreco,
  type ArranjoRepasse,
  buscarPrecoRepasse,
  type OrigemPreco,
  type PrecoRepasse,
} from './busca-preco';

/** Laudo (ou peça da quebra) da competência, com o arranjo que o catálogo deu. */
export interface LaudoRepasse extends ArranjoRepasse {
  laudoId: string;
  /** 0 = o laudo inteiro; 1..N = a peça da quebra. */
  peca: number;
  medicoId: string;
  clienteId: string | null;
  unidadeId: string | null;
  volume: number;
  /** Dia do laudo em Brasília ("AAAA-MM-DD"). */
  dia: string;
  duplicado: boolean;
}

/** Reclassificação vigente, na ordem configurada; `null` num recorte = todos. */
export interface ReclassificacaoVigente {
  id: string;
  modalidadeIds: readonly string[] | null;
  especialidadeIds: readonly string[] | null;
  categoriaIds: readonly string[] | null;
  /** Equipes (grupos de médicos); `null` = todos os médicos. */
  equipeIds: readonly string[] | null;
  especialidadeDestinoId: string | null;
  categoriaDestinoId: string | null;
}

/** Como o repasse trata os laudos do médico; `recortes` nulo = todos os laudos. */
export interface ConfiguracaoMedicoVigente {
  somenteAdicionais: boolean;
  /** `clienteId`/`especialidadeId` nulo = todos os clientes / todas as especialidades. */
  recortes: readonly { clienteId: string | null; especialidadeId: string | null }[] | null;
}

export interface AdicionalVigente {
  id: string;
  medicoId: string;
  valorCentavos: number;
  descricao: string;
  data: string;
}

export type AplicacaoRetencao =
  | 'todos'
  | 'pessoa_fisica'
  | 'pessoa_juridica'
  | 'pessoa_juridica_simples'
  | 'pessoa_juridica_fora_simples';

export interface RetencaoVigente {
  id: string;
  descricao: string;
  aplicaA: AplicacaoRetencao;
  aliquotaPpm: number;
  pisoCentavos: number;
}

/** O que a retenção precisa saber do médico (dos dados de pagamento). */
export interface PessoaMedico {
  tipo: 'pessoa_fisica' | 'pessoa_juridica' | 'desconhecido';
  optanteSimples: boolean | null;
}

/** Extra calculado por uma regra de apuração (coordenação, lista em atraso). */
export interface ExtraRegra {
  regraId: string;
  valorCentavos: number;
  descricao: string;
}

export interface EntradaRepasse {
  laudos: readonly LaudoRepasse[];
  pagaDuplicados: boolean;
  /** Contratado sob o qual o repasse é registrado. */
  contratadoId: string | null;
  equipesDoMedico: ReadonlyMap<string, ReadonlySet<string>>;
  reclassificacoes: readonly ReclassificacaoVigente[];
  configuracoes: ReadonlyMap<string, ConfiguracaoMedicoVigente>;
  /** Preços vigentes de cada médico. */
  precos: ReadonlyMap<string, readonly PrecoRepasse[]>;
  alternativas: readonly AlternativaPreco[];
  /** Tarifa própria vigente do médico (regra `tarifa_laudo`). */
  tarifas: ReadonlyMap<string, number>;
  adicionais: readonly AdicionalVigente[];
  retencoes: readonly RetencaoVigente[];
  pessoas: ReadonlyMap<string, PessoaMedico>;
  /**
   * Extras das regras de apuração, calculados depois dos exames de todos (o percentual soma o dos
   * outros médicos): recebe o valor de exames de cada médico.
   */
  extras?: (examesPorMedico: ReadonlyMap<string, number>) => ReadonlyMap<string, ExtraRegra[]>;
}

export interface LaudoPago {
  laudoId: string;
  peca: number;
  volume: number;
  totalCentavos: number;
}

export interface GrupoCalculado extends ArranjoRepasse {
  clienteId: string | null;
  unidadeId: string | null;
  volume: number;
  unitarioCentavos: number;
  totalCentavos: number;
  origem: OrigemPreco | 'sem_preco';
  precoId: string | null;
  categoriaPrecoId: string | null;
  laudos: LaudoPago[];
}

export interface DemonstrativoCalculado {
  medicoId: string;
  contratadoId: string | null;
  volume: number;
  examesCentavos: number;
  adicionaisCentavos: number;
  brutoCentavos: number;
  retencoesCentavos: number;
  liquidoCentavos: number;
  gruposSemPreco: number;
  grupos: GrupoCalculado[];
  adicionais: AdicionalVigente[];
  extras: ExtraRegra[];
  retencoes: { retencaoId: string; descricao: string; totalCentavos: number }[];
  dias: { dia: string; volume: number; totalCentavos: number }[];
}

const casa = (lista: readonly string[] | null, valor: string | null) =>
  lista === null || (valor !== null && lista.includes(valor));

/** A primeira reclassificação que casa o laudo e o médico muda a especialidade e/ou a categoria. */
export function reclassificar(
  laudo: LaudoRepasse,
  regras: readonly ReclassificacaoVigente[],
  equipes: ReadonlySet<string> | undefined,
): LaudoRepasse {
  const regra = regras.find(
    (r) =>
      casa(r.modalidadeIds, laudo.modalidadeId) &&
      casa(r.especialidadeIds, laudo.especialidadeId) &&
      casa(r.categoriaIds, laudo.categoriaId) &&
      (r.equipeIds === null || r.equipeIds.some((e) => equipes?.has(e))),
  );
  if (!regra) return laudo;
  return {
    ...laudo,
    especialidadeId: regra.especialidadeDestinoId ?? laudo.especialidadeId,
    categoriaId: regra.categoriaDestinoId ?? laudo.categoriaId,
  };
}

function contaParaOMedico(laudo: LaudoRepasse, config: ConfiguracaoMedicoVigente | undefined) {
  if (!config) return true;
  if (config.somenteAdicionais) return false;
  if (config.recortes === null) return true;
  return config.recortes.some(
    (r) =>
      (r.clienteId === null ||
        r.clienteId === laudo.clienteId ||
        r.clienteId === laudo.unidadeId) &&
      (r.especialidadeId === null || r.especialidadeId === laudo.especialidadeId),
  );
}

function aplicaA(retencao: RetencaoVigente, pessoa: PessoaMedico | undefined): boolean {
  const p = pessoa ?? { tipo: 'desconhecido', optanteSimples: null };
  switch (retencao.aplicaA) {
    case 'todos':
      return true;
    case 'pessoa_fisica':
      return p.tipo === 'pessoa_fisica';
    case 'pessoa_juridica':
      return p.tipo === 'pessoa_juridica';
    case 'pessoa_juridica_simples':
      return p.tipo === 'pessoa_juridica' && p.optanteSimples === true;
    case 'pessoa_juridica_fora_simples':
      return p.tipo === 'pessoa_juridica' && p.optanteSimples === false;
  }
}

/** Volume com duas casas (como no banco), sem o ruído da soma de ponto flutuante. */
const volume2 = (n: number) => Math.round(n * 100) / 100;

function gruposDoMedico(laudos: readonly LaudoRepasse[], e: EntradaRepasse, medicoId: string) {
  const porChave = new Map<string, GrupoCalculado>();
  const precos = e.precos.get(medicoId) ?? [];
  const tarifa = e.tarifas.get(medicoId) ?? null;
  for (const l of laudos) {
    const chave = [
      l.modalidadeId,
      l.especialidadeId,
      l.categoriaId,
      l.prioridadeId,
      l.clienteId,
      l.unidadeId,
    ].join('|');
    let g = porChave.get(chave);
    if (!g) {
      const r = buscarPrecoRepasse(
        l,
        { clienteId: l.clienteId, unidadeId: l.unidadeId },
        precos,
        e.alternativas,
        tarifa,
      );
      g = {
        modalidadeId: l.modalidadeId,
        especialidadeId: l.especialidadeId,
        categoriaId: l.categoriaId,
        prioridadeId: l.prioridadeId,
        clienteId: l.clienteId,
        unidadeId: l.unidadeId,
        volume: 0,
        unitarioCentavos: r.encontrado ? r.valorCentavos : 0,
        totalCentavos: 0,
        origem: r.encontrado ? r.origem : 'sem_preco',
        precoId: r.encontrado ? r.precoId : null,
        categoriaPrecoId: r.encontrado ? r.categoriaPrecoId : null,
        laudos: [],
      };
      porChave.set(chave, g);
    }
    const totalCentavos = Math.round(g.unitarioCentavos * l.volume);
    g.laudos.push({ laudoId: l.laudoId, peca: l.peca, volume: l.volume, totalCentavos });
    g.volume = volume2(g.volume + l.volume);
    g.totalCentavos += totalCentavos;
  }
  return [...porChave.values()];
}

/**
 * Demonstrativos da competência, um por médico que tem laudo pago, adicional ou extra. Os laudos
 * entram pelo volume (soma, nunca contagem), reclassificados e filtrados pela configuração do
 * médico; cada grupo (arranjo × cliente × unidade) tem um preço. Total bruto = exames +
 * adicionais + extras; líquido = bruto − retenções.
 */
export function calcularRepasse(e: EntradaRepasse): DemonstrativoCalculado[] {
  const laudosPorMedico = new Map<string, LaudoRepasse[]>();
  const diasPorMedico = new Map<string, Map<string, { volume: number; totalCentavos: number }>>();
  for (const bruto of e.laudos) {
    if (bruto.duplicado && !e.pagaDuplicados) continue;
    const l = reclassificar(bruto, e.reclassificacoes, e.equipesDoMedico.get(bruto.medicoId));
    if (!contaParaOMedico(l, e.configuracoes.get(l.medicoId))) continue;
    laudosPorMedico.set(l.medicoId, [...(laudosPorMedico.get(l.medicoId) ?? []), l]);
  }

  const gruposPorMedico = new Map<string, GrupoCalculado[]>();
  const examesPorMedico = new Map<string, number>();
  for (const [medicoId, laudos] of laudosPorMedico) {
    const grupos = gruposDoMedico(laudos, e, medicoId);
    gruposPorMedico.set(medicoId, grupos);
    examesPorMedico.set(
      medicoId,
      grupos.reduce((s, g) => s + g.totalCentavos, 0),
    );
    const dias = new Map<string, { volume: number; totalCentavos: number }>();
    const diaDe = new Map(laudos.map((l) => [`${l.laudoId}|${l.peca}`, l.dia]));
    for (const g of grupos)
      for (const lp of g.laudos) {
        const dia = diaDe.get(`${lp.laudoId}|${lp.peca}`) as string;
        const d = dias.get(dia) ?? { volume: 0, totalCentavos: 0 };
        d.volume = volume2(d.volume + lp.volume);
        d.totalCentavos += lp.totalCentavos;
        dias.set(dia, d);
      }
    diasPorMedico.set(medicoId, dias);
  }

  const adicionaisPorMedico = new Map<string, AdicionalVigente[]>();
  for (const a of e.adicionais)
    adicionaisPorMedico.set(a.medicoId, [...(adicionaisPorMedico.get(a.medicoId) ?? []), a]);
  const extras = e.extras?.(examesPorMedico) ?? new Map<string, ExtraRegra[]>();

  const medicos = new Set([
    ...gruposPorMedico.keys(),
    ...adicionaisPorMedico.keys(),
    ...[...extras].filter(([, l]) => l.length > 0).map(([m]) => m),
  ]);
  return [...medicos].sort().map((medicoId) => {
    const grupos = gruposPorMedico.get(medicoId) ?? [];
    const adicionais = adicionaisPorMedico.get(medicoId) ?? [];
    const extrasDoMedico = extras.get(medicoId) ?? [];
    const examesCentavos = examesPorMedico.get(medicoId) ?? 0;
    const adicionaisCentavos =
      adicionais.reduce((s, a) => s + a.valorCentavos, 0) +
      extrasDoMedico.reduce((s, x) => s + x.valorCentavos, 0);
    const brutoCentavos = examesCentavos + adicionaisCentavos;
    const retencoes = e.retencoes
      .filter((r) => aplicaA(r, e.pessoas.get(medicoId)))
      .map((r) => {
        const valor = Math.round((Math.max(brutoCentavos, 0) * r.aliquotaPpm) / 1_000_000);
        return {
          retencaoId: r.id,
          descricao: r.descricao,
          totalCentavos: valor < r.pisoCentavos ? 0 : valor,
        };
      })
      .filter((r) => r.totalCentavos > 0);
    const retencoesCentavos = retencoes.reduce((s, r) => s + r.totalCentavos, 0);
    return {
      medicoId,
      contratadoId: e.contratadoId,
      volume: volume2(grupos.reduce((s, g) => s + g.volume, 0)),
      examesCentavos,
      adicionaisCentavos,
      brutoCentavos,
      retencoesCentavos,
      liquidoCentavos: brutoCentavos - retencoesCentavos,
      gruposSemPreco: grupos.filter((g) => g.origem === 'sem_preco').length,
      grupos,
      adicionais,
      extras: extrasDoMedico,
      retencoes,
      dias: [...(diasPorMedico.get(medicoId) ?? [])]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, d]) => ({ dia, ...d })),
    };
  });
}
