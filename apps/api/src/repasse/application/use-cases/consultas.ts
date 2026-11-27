import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import { competenciaDestino } from '../../domain/vigencia';
import {
  type CompetenciaLida,
  type ConsultasRepasse,
  type DemonstrativoLido,
  type FiltroDemonstrativos,
  type GeracaoLida,
  type LaudoDoDemonstrativo,
  type PaginaRepasse,
  TOTAIS_ZERADOS,
} from '../ports/consultas-repasse';

export class VersaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Versão do repasse não encontrada nesta competência. Escolha outra versão.');
  }
}

export class DemonstrativoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Demonstrativo não encontrado. Ele pode ser de uma prévia que já foi refeita.');
  }
}

export interface VersaoRepasse extends GeracaoLida {
  /** 1 = a primeira geração guardada da competência. */
  numero: number;
}

export interface CompetenciaRepasse extends Omit<CompetenciaLida, 'geracoes'> {
  versoes: VersaoRepasse[];
  atual: VersaoRepasse | null;
}

const numerar = (geracoes: readonly GeracaoLida[]): VersaoRepasse[] =>
  geracoes.map((g, i) => ({ ...g, numero: i + 1 }));

/** Situação da competência e as versões guardadas do repasse dela (com o motivo do recálculo). */
export class ObterCompetenciaRepasse {
  constructor(private readonly consultas: ConsultasRepasse) {}

  async executar(competencia: string): Promise<CompetenciaRepasse> {
    const { geracoes, ...resto } = await this.consultas.competencia(competencia);
    const versoes = numerar(geracoes);
    return { ...resto, versoes, atual: versoes.find((v) => v.atual) ?? null };
  }
}

export type PedidoDemonstrativos = Omit<FiltroDemonstrativos, 'geracaoId'> & { versao?: string };

/** Demonstrativos por médico de uma versão (a atual, sem escolha), com os totais do recorte. */
export class ListarDemonstrativos {
  constructor(private readonly consultas: ConsultasRepasse) {}

  async executar(competencia: string, { versao, ...filtro }: PedidoDemonstrativos) {
    const { geracoes } = await this.consultas.competencia(competencia);
    const geracao = versao ? geracoes.find((g) => g.id === versao) : geracoes.find((g) => g.atual);
    if (versao && !geracao) throw new VersaoNaoEncontradaError();
    if (!geracao)
      return {
        itens: [],
        total: 0,
        pagina: filtro.pagina,
        porPagina: filtro.porPagina,
        totais: TOTAIS_ZERADOS,
      };
    return this.consultas.demonstrativos({ ...filtro, geracaoId: geracao.id });
  }
}

/** Detalhe do demonstrativo: grupos com a origem do preço, lançamentos e dias. */
export class ObterDemonstrativo {
  constructor(private readonly consultas: ConsultasRepasse) {}

  async executar(
    id: string,
  ): Promise<DemonstrativoLido & { versao: number; versaoAtual: boolean }> {
    const d = await this.consultas.demonstrativo(id);
    if (!d) throw new DemonstrativoNaoEncontradoError();
    const versoes = numerar((await this.consultas.competencia(d.competencia)).geracoes);
    const v = versoes.find((x) => x.id === d.geracaoId);
    return { ...d, versao: v?.numero ?? versoes.length, versaoAtual: v?.atual ?? false };
  }
}

/** A leitura auditada do nome do paciente (`LerPacientesDosLaudos`, do contexto `ingestao`). */
export interface LeitorPacientes {
  executar(
    leitor: { usuarioId: string; podeVerPaciente: boolean },
    laudoIds: string[],
  ): Promise<Map<string, { nome: string | null }>>;
}

export interface LaudoComPaciente extends LaudoDoDemonstrativo {
  paciente: string | null;
}

/**
 * Laudos pagos no demonstrativo, paginados. Com a permissão, o nome do paciente vem pela leitura
 * auditada (cada laudo lido vira um evento); sem ela, nem se lê.
 */
export class ListarLaudosDoDemonstrativo {
  constructor(
    private readonly consultas: ConsultasRepasse,
    private readonly pacientes: LeitorPacientes,
  ) {}

  async executar(
    leitor: { usuarioId: string; podeVerPaciente: boolean },
    demonstrativoId: string,
    pagina: number,
    porPagina: number,
  ): Promise<PaginaRepasse<LaudoComPaciente> & { pacienteVisivel: boolean }> {
    if (!(await this.consultas.demonstrativo(demonstrativoId)))
      throw new DemonstrativoNaoEncontradoError();
    const p = await this.consultas.laudos(demonstrativoId, pagina, porPagina);
    const nomes = leitor.podeVerPaciente
      ? await this.pacientes.executar(
          leitor,
          p.itens.map((l) => l.laudoId),
        )
      : new Map<string, { nome: string | null }>();
    return {
      ...p,
      itens: p.itens.map((l) => ({ ...l, paciente: nomes.get(l.laudoId)?.nome ?? null })),
      pacienteVisivel: leitor.podeVerPaciente,
    };
  }
}

interface Tarifas {
  peerReviewCentavos: number;
  plantaoCentavos: number;
}

/**
 * O que o formulário de lançamento precisa saber da competência escolhida: se está fechada, para
 * qual aberta o adicional iria e a tarifa vigente lá e na própria fechada.
 */
export class TarifasDoLancamento {
  constructor(
    private readonly competencias: { fechadas(): Promise<string[]> },
    private readonly repo: { tarifas(competencia: string): Promise<Tarifas> },
  ) {}

  async executar(competencia: string) {
    const fechadas = await this.competencias.fechadas();
    const destino = competenciaDestino(competencia, fechadas);
    const [tarifasDestino, tarifasDaCompetencia] = await Promise.all([
      this.repo.tarifas(destino),
      this.repo.tarifas(competencia),
    ]);
    return {
      competencia,
      fechada: fechadas.includes(competencia),
      destino,
      tarifasDestino,
      tarifasDaCompetencia,
    };
  }
}
