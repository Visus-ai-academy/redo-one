import type { CompetenciasBloqueadas } from '../../ingestao/application/ports/competencias-bloqueadas';
import type { LeitorCortesCompetencia } from '../../ingestao/application/ports/cortes-competencia';
import {
  CORTE_PADRAO_INICIAL,
  type TabelaCortes,
  type VigenciaCliente,
  type VigenciaCorte,
} from '../../ingestao/domain/competencia';
import type { CompetenciasRepository } from '../application/ports/competencias.repository';
import type { CortesRepository } from '../application/ports/cortes.repository';
import type { StatusCompetencia } from '../domain/competencia-status';

export interface CompetenciaGuardada {
  status: StatusCompetencia;
  importacaoTravada: boolean;
}

export class CompetenciasEmMemoria implements CompetenciasRepository, CompetenciasBloqueadas {
  readonly competencias = new Map<string, CompetenciaGuardada>();

  async listarBloqueadas() {
    return [...this.competencias]
      .filter(([, c]) => c.status === 'fechada' || c.importacaoTravada)
      .map(([competencia]) => competencia);
  }

  listar() {
    return this.listarBloqueadas();
  }

  async garantir(lista: string[]) {
    for (const competencia of lista) {
      if (!this.competencias.has(competencia)) {
        this.competencias.set(competencia, { status: 'aberta', importacaoTravada: false });
      }
    }
  }
}

export class CortesEmMemoria implements CortesRepository, LeitorCortesCompetencia {
  readonly padrao: VigenciaCorte[] = [];
  readonly porCliente = new Map<string, VigenciaCliente[]>();

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
}
