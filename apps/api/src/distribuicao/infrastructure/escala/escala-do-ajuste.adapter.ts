import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import { ehDiaDePlantao } from '../../../escala/alocacoes/apoio';
import { DrizzleAlocacoesRepository } from '../../../escala/alocacoes/drizzle-alocacoes.repository';
import { DrizzleEscopoEscalaRepository } from '../../../escala/escopo/drizzle-escopo.repository';
import { type EscopoEscala, estaNoEscopo } from '../../../escala/escopo/escopo';
import type {
  AlocacaoDoAjuste,
  AtorEscala,
  EscalaDoAjuste,
  NoRecorte,
} from '../../application/ports/escala-do-ajuste';

/**
 * Adaptador para a escala (contexto `escala`, modular-ddd): reaproveita o repositório das
 * alocações, o recorte da gestora e a regra do dia de plantão de lá, sem duplicar a regra.
 */
@Injectable()
export class EscalaDoAjusteAdapter implements EscalaDoAjuste {
  private readonly alocacoes: DrizzleAlocacoesRepository;
  private readonly escopos: DrizzleEscopoEscalaRepository;

  constructor(@Inject(DATABASE) db: Database) {
    this.alocacoes = new DrizzleAlocacoesRepository(db);
    this.escopos = new DrizzleEscopoEscalaRepository(db);
  }

  private escopo(ator: AtorEscala): Promise<EscopoEscala | null> {
    return ator.acessoTotal ? Promise.resolve(null) : this.escopos.doUsuario(ator.usuarioId);
  }

  async alocacaoNoRecorte(ator: AtorEscala, alocacaoId: string): Promise<AlocacaoDoAjuste | null> {
    const a = await this.alocacoes.buscar(alocacaoId);
    if (!a || !estaNoEscopo(await this.escopo(ator), a)) return null;
    return { id: a.id, medicoId: a.medicoId, turnoId: a.turnoId, frenteId: a.frenteId };
  }

  async ehDiaDePlantao(alocacaoId: string, data: string): Promise<boolean> {
    const a = await this.alocacoes.buscar(alocacaoId);
    return !!a && ehDiaDePlantao(this.alocacoes, a, data);
  }

  async recorteDo(ator: AtorEscala): Promise<NoRecorte> {
    const escopo = await this.escopo(ator);
    return (alvo) => estaNoEscopo(escopo, alvo);
  }
}
