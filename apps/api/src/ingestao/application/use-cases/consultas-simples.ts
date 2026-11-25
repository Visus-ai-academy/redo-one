import { type AcessoAvisos, tiposDeAvisoVisiveis } from '../../domain/avisos-visiveis';
import type { TipoAviso } from '../../domain/preparar-laudo';
import { AvisoNaoEncontradoError } from '../erros';
import type { ConsultaAvisos, FiltroAvisos } from '../ports/avisos.consulta';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';
import type { TiposAvisoRepository } from '../ports/tipos-aviso.repository';

/**
 * O aviso, se existe e o acesso vê o tipo dele; senão, não encontrado (não revela que existe um
 * aviso de médico para quem não vê a tela Médicos).
 */
export async function obterAvisoVisivel(avisos: ConsultaAvisos, id: string, acesso: AcessoAvisos) {
  const aviso = await avisos.obter(id);
  if (!aviso || !tiposDeAvisoVisiveis(acesso).includes(aviso.tipo))
    throw new AvisoNaoEncontradoError();
  return aviso;
}

/** Quem consulta, com os papéis (o recorte "só os meus" e a faixa do responsável). */
export interface AcessoAvisosComPapeis extends AcessoAvisos {
  papeisIds?: readonly string[];
}

/** Os tipos que o acesso vê e de que algum papel dele é responsável. */
async function tiposDoResponsavel(tipos: TiposAvisoRepository, acesso: AcessoAvisosComPapeis) {
  const papeis = acesso.papeisIds ?? [];
  if (!papeis.length) return [];
  const responsavel = new Set(await tipos.tiposDosPapeis(papeis));
  return tiposDeAvisoVisiveis(acesso).filter((t) => responsavel.has(t));
}

/**
 * Avisos para a triagem, só dos tipos cuja tela quem consulta vê; "só os meus" estreita aos tipos
 * de que ele é responsável (um recorte a mais, não uma permissão).
 */
export class ListarAvisos {
  constructor(
    private readonly avisos: ConsultaAvisos,
    private readonly tipos: TiposAvisoRepository,
  ) {}

  async executar(
    { tipo, meus, ...filtro }: Omit<FiltroAvisos, 'tipos'> & { tipo?: TipoAviso; meus?: boolean },
    acesso: AcessoAvisosComPapeis,
  ) {
    const visiveis = tiposDeAvisoVisiveis(acesso);
    const base = meus ? await tiposDoResponsavel(this.tipos, acesso) : visiveis;
    const tipos = tipo ? base.filter((t) => t === tipo) : base;
    return { ...(await this.avisos.listar({ ...filtro, tipos })), tipos: visiveis };
  }

  obter(id: string, acesso: AcessoAvisos) {
    return obterAvisoVisivel(this.avisos, id, acesso);
  }
}

/** A faixa do topo: os avisos pendentes de que quem consulta é responsável. */
export class ResumoAvisosDoResponsavel {
  constructor(
    private readonly avisos: ConsultaAvisos,
    private readonly tipos: TiposAvisoRepository,
  ) {}

  async executar(acesso: AcessoAvisosComPapeis) {
    const tipos = await tiposDoResponsavel(this.tipos, acesso);
    if (!tipos.length) return { total: 0, maisAntigoEm: null, tipos };
    return { ...(await this.avisos.resumoPendentes(tipos)), tipos };
  }
}

/** O selo dos itens de uma lista: os avisos pendentes deles, numa consulta só por página. */
export class SelosDeAviso {
  constructor(private readonly avisos: ConsultaAvisos) {}

  async executar(entidade: string, ids: readonly string[], acesso: AcessoAvisos) {
    const unicos = [...new Set(ids)];
    const tipos = tiposDeAvisoVisiveis(acesso);
    if (!unicos.length || !tipos.length) return [];
    return this.avisos.pendentesDasEntidades(entidade, unicos, tipos);
  }
}

export class ObterParametros {
  constructor(private readonly parametros: ParametrosIngestaoRepository) {}

  executar() {
    return this.parametros.obter();
  }
}
