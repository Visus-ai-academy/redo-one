import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import type { AlocacaoGravada } from '../../../escala/alocacoes/alocacoes.repository';
import { ehDiaDePlantao } from '../../../escala/alocacoes/apoio';
import { DrizzleAlocacoesRepository } from '../../../escala/alocacoes/drizzle-alocacoes.repository';
import { adicionarDias } from '../../../escala/domain';
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

  async diasDePlantao(alocacaoId: string, de: string, ate: string): Promise<string[]> {
    const a = await this.alocacoes.buscar(alocacaoId);
    if (!a) return [];
    // O titular da cobertura é lido uma vez só, não a cada dia do período.
    const lidas = new Map<string, Promise<AlocacaoGravada | null>>();
    const repo = {
      buscar: (id: string) => {
        if (!lidas.has(id)) lidas.set(id, this.alocacoes.buscar(id));
        return lidas.get(id) as Promise<AlocacaoGravada | null>;
      },
    };
    const dias: string[] = [];
    for (let dia = de; dia <= ate; dia = adicionarDias(dia, 1)) {
      if (await ehDiaDePlantao(repo, a, dia)) dias.push(dia);
    }
    return dias;
  }

  async recorteDo(ator: AtorEscala): Promise<NoRecorte> {
    const escopo = await this.escopo(ator);
    return (alvo) => estaNoEscopo(escopo, alvo);
  }
}
