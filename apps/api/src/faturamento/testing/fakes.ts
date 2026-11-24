import type { Paginacao } from '../../catalogo/comum/paginacao';
import {
  CORTE_PADRAO_INICIAL,
  type TabelaCortes,
  type VigenciaCliente,
  type VigenciaCorte,
} from '../../ingestao/domain/competencia';
import type {
  Autor,
  CompetenciaResumo,
  CompetenciasRepository,
} from '../application/ports/competencias.repository';
import type { CortesRepository, VigenciaRegistrada } from '../application/ports/cortes.repository';
import type {
  LaudoParaPrevia,
  LaudosCompetencia,
  LotePrevia,
} from '../application/ports/laudos-competencia';
import type { StatusCompetencia } from '../domain/competencia-status';
import type { NovaVigencia } from '../domain/vigencia-corte';

export interface CompetenciaGuardada {
  status: StatusCompetencia;
  importacaoTravada: boolean;
}

/** Ação gravada pelo fake, para os testes conferirem autor e data. */
export interface AcaoCompetencia {
  acao: 'fechar' | 'reabrir' | 'travar' | 'destravar';
  competencia: string;
  autor?: Autor;
}

export class CompetenciasEmMemoria implements CompetenciasRepository {
  readonly competencias = new Map<string, CompetenciaGuardada>();
  readonly acoes: AcaoCompetencia[] = [];

  async listar() {
    return [...this.competencias]
      .filter(([, c]) => c.status === 'fechada' || c.importacaoTravada)
      .map(([competencia]) => competencia);
  }

  async garantir(lista: string[]) {
    for (const competencia of lista) {
      if (!this.competencias.has(competencia)) {
        this.competencias.set(competencia, { status: 'aberta', importacaoTravada: false });
      }
    }
  }

  async listarPagina({ pagina, porPagina }: Paginacao) {
    const todas = [...this.competencias.keys()].sort().reverse();
    const itens = todas
      .slice((pagina - 1) * porPagina, pagina * porPagina)
      .map((competencia): CompetenciaResumo => {
        const c = this.competencias.get(competencia) as CompetenciaGuardada;
        return {
          competencia,
          status: c.status,
          fechadaEm: null,
          fechadaPor: null,
          reabertaEm: null,
          reabertaPor: null,
          importacaoTravadaEm: null,
          importacaoTravadaPor: null,
          observacoes: null,
          laudos: 0,
          volume: 0,
        };
      });
    return { itens, total: todas.length };
  }

  async obter(competencia: string) {
    const c = this.competencias.get(competencia);
    return c ? { ...c } : null;
  }

  async ultimaFechada() {
    const fechadas = [...this.competencias]
      .filter(([, c]) => c.status === 'fechada')
      .map(([competencia]) => competencia)
      .sort();
    return fechadas.at(-1) ?? null;
  }

  private mudar(
    acao: AcaoCompetencia['acao'],
    competencia: string,
    pode: (c: CompetenciaGuardada) => boolean,
    mudanca: Partial<CompetenciaGuardada>,
    autor?: Autor,
  ) {
    const c = this.competencias.get(competencia);
    if (!c || !pode(c)) return false;
    Object.assign(c, mudanca);
    this.acoes.push({ acao, competencia, ...(autor && { autor }) });
    return true;
  }

  async fechar(competencia: string, autor: Autor) {
    return this.mudar(
      'fechar',
      competencia,
      (c) => c.status === 'aberta',
      { status: 'fechada' },
      autor,
    );
  }

  async reabrir(competencia: string, autor: Autor) {
    return this.mudar(
      'reabrir',
      competencia,
      (c) => c.status === 'fechada',
      { status: 'aberta' },
      autor,
    );
  }

  async travarImportacao(competencia: string, autor: Autor) {
    return this.mudar(
      'travar',
      competencia,
      (c) => !c.importacaoTravada,
      { importacaoTravada: true },
      autor,
    );
  }

  async destravarImportacao(competencia: string) {
    return this.mudar('destravar', competencia, (c) => c.importacaoTravada, {
      importacaoTravada: false,
    });
  }
}

/** Vigência criada pelo fake, com o recálculo que a criação teria enfileirado. */
export interface VigenciaCriada {
  vigencia: NovaVigencia;
  autor: Autor;
  recalculo: string[] | null;
}

export class CortesEmMemoria implements CortesRepository {
  readonly padrao: VigenciaCorte[] = [];
  readonly porCliente = new Map<string, VigenciaCliente[]>();
  readonly clientes = new Set<string>();
  readonly criadas: VigenciaCriada[] = [];

  async carregar(): Promise<TabelaCortes> {
    const ordem = <T extends { desde: string }>(l: T[]) =>
      [...l].sort((a, b) => a.desde.localeCompare(b.desde));
    return {
      padrao: this.padrao.length > 0 ? ordem(this.padrao) : [CORTE_PADRAO_INICIAL],
      porCliente: new Map([...this.porCliente].map(([id, l]) => [id, ordem(l)])),
    };
  }

  async garantirPadraoInicial() {
    if (this.padrao.length === 0) this.padrao.push(CORTE_PADRAO_INICIAL);
  }

  async listarVigencias(clienteId: string | null): Promise<VigenciaRegistrada[]> {
    const lista: VigenciaCliente[] =
      clienteId === null ? this.padrao : (this.porCliente.get(clienteId) ?? []);
    return [...lista]
      .sort((a, b) => b.desde.localeCompare(a.desde))
      .map((v) => ({
        id: `${clienteId ?? 'padrao'}:${v.desde}`,
        clienteId,
        desde: v.desde,
        corte: v.corte,
        criadoEm: new Date(0),
        criadoPor: null,
      }));
  }

  async clienteExiste(clienteId: string) {
    return this.clientes.has(clienteId);
  }

  async criar(vigencia: NovaVigencia, autor: Autor) {
    const { clienteId, desde, corte } = vigencia;
    if (clienteId === null) {
      if (!corte) throw new Error('padrão sem corte');
      this.padrao.push({ desde, corte });
    } else {
      this.porCliente.set(clienteId, [...(this.porCliente.get(clienteId) ?? []), { desde, corte }]);
    }
    this.criadas.push({ vigencia, autor, recalculo: clienteId === null ? null : [clienteId] });
    return `${clienteId ?? 'padrao'}:${desde}`;
  }
}

export class LaudosCompetenciaEmMemoria implements LaudosCompetencia {
  readonly laudos: LaudoParaPrevia[] = [];

  async lerParaPrevia(lote: LotePrevia) {
    const bloqueada = new Set(lote.competenciasBloqueadas);
    return [...this.laudos]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter(
        (l) =>
          (lote.depoisDe === null || l.id > lote.depoisDe) &&
          (lote.clienteId === null || l.clienteId === lote.clienteId) &&
          l.competencia.localeCompare(lote.aPartirDe) >= 0 &&
          !bloqueada.has(l.competencia),
      )
      .slice(0, lote.limite);
  }
}
