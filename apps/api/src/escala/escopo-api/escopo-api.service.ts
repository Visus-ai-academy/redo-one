import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../identidade/clock';
import {
  ESCOPO_ESCALA_REPOSITORY,
  type EscopoEscala,
  type EscopoEscalaRepository,
} from '../escopo/escopo';
import {
  CADASTROS_ESCOPO_REPOSITORY,
  type CadastrosEscopoRepository,
  type Referencia,
} from './cadastros-escopo.repository';
import {
  EscopoDoProprioUsuarioError,
  FrenteInexistenteError,
  TurnoInexistenteError,
  UsuarioInexistenteError,
} from './escopo-api.errors';

/** Recorte com os nomes, para a tela. Listas vazias = sem recorte. */
export interface EscopoDetalhado {
  turnoIds: string[];
  frenteIds: string[];
  turnos: Referencia[];
  frentes: Referencia[];
}

const unicos = (ids: string[]) => [...new Set(ids)];

/** Lê e troca o recorte da gestora de escala (tela Usuários) e informa o do usuário logado. */
@Injectable()
export class EscopoApiService {
  constructor(
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(CADASTROS_ESCOPO_REPOSITORY) private readonly cadastros: CadastrosEscopoRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async obter(usuarioId: string): Promise<EscopoDetalhado> {
    if (!(await this.cadastros.usuarioExiste(usuarioId))) throw new UsuarioInexistenteError();
    return this.detalhar(await this.escopos.doUsuario(usuarioId));
  }

  /** O recorte de quem está logado; `null` = vê tudo (acesso total ou sem linhas). */
  async doPrincipal(principal: {
    usuarioId: string;
    acessoTotal: boolean;
  }): Promise<EscopoDetalhado | null> {
    if (principal.acessoTotal) return null;
    const escopo = await this.escopos.doUsuario(principal.usuarioId);
    return escopo ? this.detalhar(escopo) : null;
  }

  async definir(
    ator: { usuarioId: string },
    usuarioId: string,
    novo: { turnoIds: string[]; frenteIds: string[] },
  ): Promise<void> {
    if (ator.usuarioId === usuarioId) throw new EscopoDoProprioUsuarioError();
    if (!(await this.cadastros.usuarioExiste(usuarioId))) throw new UsuarioInexistenteError();

    const turnoIds = unicos(novo.turnoIds);
    const frenteIds = unicos(novo.frenteIds);
    const turnos = await this.cadastros.turnos(turnoIds);
    if (turnos.length !== turnoIds.length) throw new TurnoInexistenteError();
    const frentes = await this.cadastros.frentes(frenteIds);
    if (frentes.length !== frenteIds.length) throw new FrenteInexistenteError();

    const antes = await this.detalhar(await this.escopos.doUsuario(usuarioId));
    const depois: EscopoDetalhado = {
      turnoIds: turnos.map((t) => t.id),
      frenteIds: frentes.map((f) => f.id),
      turnos,
      frentes,
    };
    if (
      mesmoConjunto(antes.turnoIds, depois.turnoIds) &&
      mesmoConjunto(antes.frenteIds, depois.frenteIds)
    ) {
      return;
    }

    // O recorte e o evento na mesma transação.
    await this.cadastros.gravarRecorte(usuarioId, { turnoIds, frenteIds }, [
      {
        ator: { tipo: 'usuario', id: ator.usuarioId },
        entidade: 'escopo_escala',
        entidadeId: usuarioId,
        acao: 'definido',
        antes: paraEvento(antes),
        depois: paraEvento(depois),
        em: this.clock.now(),
      },
    ]);
  }

  private async detalhar(escopo: EscopoEscala | null): Promise<EscopoDetalhado> {
    if (!escopo) return { turnoIds: [], frenteIds: [], turnos: [], frentes: [] };
    const turnos = await this.cadastros.turnos([...escopo.turnoIds]);
    const frentes = await this.cadastros.frentes([...escopo.frenteIds]);
    return {
      turnoIds: turnos.map((t) => t.id),
      frenteIds: frentes.map((f) => f.id),
      turnos,
      frentes,
    };
  }
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Ids (para o recorte) e nomes (para o histórico mostrar antes → depois). */
function paraEvento(escopo: EscopoDetalhado): Record<string, unknown> {
  return {
    turnoIds: escopo.turnoIds,
    frenteIds: escopo.frenteIds,
    turnos: escopo.turnos.map((t) => t.nome),
    frentes: escopo.frentes.map((f) => f.nome),
  };
}
