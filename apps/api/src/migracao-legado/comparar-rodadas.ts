import type { EntregaAnterior } from '../distribuicao/domain/motor/medicos-disponiveis';
import {
  normalizarGrafia,
  type PrioridadeOperacao,
} from '../distribuicao/domain/motor/prioridades-operacao';
import {
  type Leitura,
  RECORTES_VAZIOS,
  type RecortesRodada,
} from '../distribuicao/domain/rodada/entrada';
import { chaveTexto, idDoLegado } from './comum';

/**
 * Comparação das rodadas do dashboards-one com o motor do redo-one, SEM MobileMed e sem gravar
 * rodada: a fila é a que o legado guardou nas designações (cada exame lido vira uma designação, por
 * valor), a carga é a que o motor do legado viu (`insumosMotor`), e o redo-one roda o próprio motor
 * sobre isso com a escala e a configuração dele. O nome do paciente só serve para agrupar o pacote
 * (vira pseudônimo na montagem) e nunca sai daqui.
 */

/** Uma rodada do dashboards-one (`rodadas_distribuicao`), só o que a comparação usa. */
export interface LegadoRodada {
  id: string;
  criadoEm: string;
  aprovadaEm: string | null;
  status: string;
  automatica: boolean;
  turnoIds: string[];
  /** Rótulos dos pontos: "RX", "NEURO", "NEURO · COLUNAS". */
  frentes: string[];
  /** Grafias ("Urgência"). */
  prioridades: string[];
  medicosExcluidos: string[];
  medicosIncluidos: string[];
  clientesPrioritarios: string[];
  incluiFimDeSemana: boolean;
  /** A carga de cada médico como o motor do legado a viu (`insumosMotor.medicos`). */
  cargas: {
    medicoId: string;
    cargaInicial: number;
    cargaReservada: number;
    /** Teto do período já rateado pelo que resta do turno; null = sem teto. */
    capacidade?: number | null;
    produtividade?: number | null;
  }[];
}

/** Uma designação do dashboards-one (`designacoes_distribuicao`). */
export interface LegadoDesignacaoRodada {
  rodadaId: string;
  chaveExame: string;
  nomePaciente: string; // LGPD: pessoal (só agrupa o pacote; nunca sai da memória)
  estudoDescricao: string;
  dataRealizacao: string;
  empresa: string;
  prioridade: string;
  modalidade: string | null;
  especialidade: string | null;
  subespecialidade: string | null;
  laudos: number;
  dataPrazo: string | null;
  idExameMobilemed: number | null;
  medicoId: string | null;
  status: string;
  motivo: string | null;
  recolhidoDeId: string | null;
  alocacaoGratificadaId: string | null;
  executadaEm: string | null;
}

/** A designação do redo-one, só o que a comparação lê. */
export interface DesignacaoRedo {
  idExame: string;
  medicoId: string | null;
  status: string;
  motivo: string | null;
  elegiveis: readonly string[];
  barrados: Readonly<Record<string, string>>;
}

const DIA = 86_400_000;
const SEP_PONTO = ' · ';

/** O instante da leitura: a aprovação (o robô automático aprova a prévia logo em seguida). */
export function instanteDaRodada(r: Pick<LegadoRodada, 'criadoEm' | 'aprovadaEm'>): Date {
  return new Date(r.aprovadaEm ?? r.criadoEm);
}

export function idExameDaDesignacao(
  d: Pick<LegadoDesignacaoRodada, 'idExameMobilemed' | 'chaveExame'>,
): string {
  return d.idExameMobilemed === null ? `chave:${d.chaveExame}` : String(d.idExameMobilemed);
}

/** A fila sem médico que o legado leu. O recolhido fica de fora: o recolhimento não é simulado. */
export function leituraDaRodada(designacoes: readonly LegadoDesignacaoRodada[]): Leitura {
  return {
    emMaos: [],
    semMedico: designacoes
      .filter((d) => d.recolhidoDeId === null)
      .map((d) => ({
        idExame: idExameDaDesignacao(d),
        prioridade: d.prioridade,
        estudo: d.estudoDescricao,
        unidade: d.empresa,
        modalidade: d.modalidade,
        especialidade: d.especialidade,
        laudos: d.laudos,
        realizadoEm: new Date(d.dataRealizacao),
        // O legado não guarda a entrada na fila: vale a realização (só desempata a antiguidade).
        entradaEm: new Date(d.dataRealizacao),
        prazo: d.dataPrazo === null ? null : new Date(d.dataPrazo),
        status: 'NOVO',
        paciente: { codigo: null, nome: d.nomePaciente },
      })),
  };
}

/**
 * Rótulo da frente no legado (o nome da especialidade da escala) → frente do redo-one, pela frente
 * para onde as alocações daquela especialidade migraram.
 */
export function frentesPorRotulo(
  alocacoesLegado: readonly { id: string; especialidade: string }[],
  frenteDaAlocacao: ReadonlyMap<string, string>,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const a of alocacoesLegado) {
    const frente = frenteDaAlocacao.get(idDoLegado('alocacoes_medico', a.id));
    const rotulo = chaveTexto(a.especialidade);
    if (frente && !mapa.has(rotulo)) mapa.set(rotulo, frente);
  }
  return mapa;
}

/**
 * Os recortes da rodada do legado no vocabulário do redo-one. O ponto de segmento
 * ("NEURO · COLUNAS") vale a frente inteira: as rodadas comparadas marcam a especialidade inteira.
 */
export function recortesDaRodada(
  r: LegadoRodada,
  ctx: {
    frentePorRotulo: ReadonlyMap<string, string>;
    prioridadesOperacao: readonly PrioridadeOperacao[];
  },
): { recortes: RecortesRodada; naoMapeados: string[] } {
  const naoMapeados: string[] = [];
  const frenteIds: string[] = [];
  for (const ponto of r.frentes) {
    const i = ponto.indexOf(SEP_PONTO);
    const base = i < 0 ? ponto : ponto.slice(0, i);
    const frente = ctx.frentePorRotulo.get(chaveTexto(base));
    if (!frente) {
      if (!naoMapeados.includes(`frente ${base}`)) naoMapeados.push(`frente ${base}`);
    } else if (!frenteIds.includes(frente)) frenteIds.push(frente);
  }
  const porGrafia = new Map(
    ctx.prioridadesOperacao.flatMap((p) => p.grafias.map((g) => [normalizarGrafia(g), p.id])),
  );
  const prioridadeOperacaoIds: string[] = [];
  for (const grafia of r.prioridades) {
    const id = porGrafia.get(normalizarGrafia(grafia));
    if (!id) naoMapeados.push(`prioridade ${grafia}`);
    else if (!prioridadeOperacaoIds.includes(id)) prioridadeOperacaoIds.push(id);
  }
  return {
    recortes: {
      ...RECORTES_VAZIOS,
      turnoIds: r.turnoIds.map((t) => idDoLegado('turnos', t)),
      frenteIds,
      prioridadeOperacaoIds,
      medicosExcluidos: r.medicosExcluidos.map((m) => idDoLegado('medicos', m)),
      medicosIncluidos: r.medicosIncluidos.map((m) => idDoLegado('medicos', m)),
    },
    naoMapeados,
  };
}

const executadaAntes = (d: LegadoDesignacaoRodada, desde: Date, agora: Date) => {
  if (d.status !== 'executada' || d.executadaEm === null) return null;
  const em = new Date(d.executadaEm);
  return em >= desde && em < agora ? em : null;
};

/** O "já entregue": as execuções do legado nos `dias` antes da rodada, por exame. */
export function entregasDoLegado(
  executadas: readonly LegadoDesignacaoRodada[],
  agora: Date,
  dias: number,
): Map<string, EntregaAnterior[]> {
  const desde = new Date(agora.getTime() - dias * DIA);
  const mapa = new Map<string, EntregaAnterior[]>();
  for (const d of executadas) {
    const em = executadaAntes(d, desde, agora);
    if (!em || d.medicoId === null) continue;
    const id = idExameDaDesignacao(d);
    mapa.set(id, [
      ...(mapa.get(id) ?? []),
      { medicoId: idDoLegado('medicos', d.medicoId), em, origem: 'execucao' },
    ]);
  }
  return mapa;
}

/** O já executado por alocação gratificada (id do redo-one) desde o início do plantão. */
export function cotaEntregueDoLegado(
  executadas: readonly LegadoDesignacaoRodada[],
  plantoes: readonly { alocacaoId: string; desde: Date }[],
  agora: Date,
): Record<string, number> {
  const desdeDe = new Map(plantoes.map((p) => [p.alocacaoId, p.desde]));
  const cota: Record<string, number> = {};
  for (const d of executadas) {
    if (!d.alocacaoGratificadaId) continue;
    const alocacaoId = idDoLegado('alocacoes_medico', d.alocacaoGratificadaId);
    const desde = desdeDe.get(alocacaoId);
    if (!desde || !executadaAntes(d, desde, agora)) continue;
    cota[alocacaoId] = (cota[alocacaoId] ?? 0) + d.laudos;
  }
  return cota;
}

/**
 * Os recolhidos que o legado propôs ocupam o teto de quem os recebeu. Como o redo-one não simula o
 * recolhimento (falta a fila em mãos), essa carga entra antes do motor, para o teto ficar igual.
 */
export function cargaDosRecolhidos(
  designacoes: readonly LegadoDesignacaoRodada[],
): Map<string, number> {
  const carga = new Map<string, number>();
  for (const d of designacoes) {
    if (d.recolhidoDeId === null || d.medicoId === null) continue;
    const id = idDoLegado('medicos', d.medicoId);
    carga.set(id, (carga.get(id) ?? 0) + d.laudos);
  }
  return carga;
}

export type CategoriaComparacao =
  | 'mesmo_medico'
  | 'medico_diferente'
  | 'so_legado'
  | 'so_redo'
  | 'nenhum'
  /** Recolhido no legado: o redo-one não simula o recolhimento, fica fora da conta. */
  | 'recolhido_fora';

export interface ComparacaoExame {
  idExame: string;
  legado: LegadoDesignacaoRodada;
  redo: DesignacaoRedo | null;
  categoria: CategoriaComparacao;
  /** Médico que o legado propôs, com o id do redo-one. */
  medicoLegado: string | null;
  medicoRedo: string | null;
  medicoLegadoElegivelNoRedo: boolean | null;
  barreiraMedicoLegadoNoRedo: string | null;
}

/** Exame a exame: quem cada lado propôs. */
export function compararExames(
  legado: readonly LegadoDesignacaoRodada[],
  redo: readonly DesignacaoRedo[],
): ComparacaoExame[] {
  const porId = new Map(redo.map((d) => [d.idExame, d]));
  return legado.map((l) => {
    const idExame = idExameDaDesignacao(l);
    const r = porId.get(idExame) ?? null;
    const medicoLegado = l.medicoId === null ? null : idDoLegado('medicos', l.medicoId);
    const medicoRedo = r && r.status === 'prevista' ? r.medicoId : null;
    let categoria: CategoriaComparacao;
    if (l.recolhidoDeId !== null) categoria = 'recolhido_fora';
    else if (medicoLegado && medicoRedo)
      categoria = medicoLegado === medicoRedo ? 'mesmo_medico' : 'medico_diferente';
    else if (medicoLegado) categoria = 'so_legado';
    else if (medicoRedo) categoria = 'so_redo';
    else categoria = 'nenhum';
    return {
      idExame,
      legado: l,
      redo: r,
      categoria,
      medicoLegado,
      medicoRedo,
      medicoLegadoElegivelNoRedo: medicoLegado && r ? r.elegiveis.includes(medicoLegado) : null,
      barreiraMedicoLegadoNoRedo: medicoLegado && r ? (r.barrados[medicoLegado] ?? null) : null,
    };
  });
}

export interface ResumoComparacao {
  comparaveis: number;
  concordantes: number;
  porCategoria: Partial<Record<CategoriaComparacao, number>>;
  /** Médico (id do redo-one) → quantos exames cada lado lhe propôs. */
  porMedico: Map<string, { legado: number; redo: number }>;
}

export function resumirComparacao(linhas: readonly ComparacaoExame[]): ResumoComparacao {
  const porCategoria: ResumoComparacao['porCategoria'] = {};
  const porMedico = new Map<string, { legado: number; redo: number }>();
  const somar = (id: string | null, lado: 'legado' | 'redo') => {
    if (!id) return;
    const m = porMedico.get(id) ?? { legado: 0, redo: 0 };
    m[lado]++;
    porMedico.set(id, m);
  };
  let comparaveis = 0;
  let concordantes = 0;
  for (const l of linhas) {
    porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + 1;
    if (l.categoria === 'recolhido_fora') continue;
    somar(l.medicoLegado, 'legado');
    somar(l.medicoRedo, 'redo');
    comparaveis++;
    if (l.categoria === 'mesmo_medico' || l.categoria === 'nenhum') concordantes++;
  }
  return { comparaveis, concordantes, porCategoria, porMedico };
}
