import { type AcessoAvisos, tiposDeAvisoVisiveis } from '../../domain/avisos-visiveis';
import type { TipoAviso } from '../../domain/preparar-laudo';
import { AvisoNaoEncontradoError } from '../erros';
import type { ConsultaAvisos, FiltroAvisos } from '../ports/avisos.consulta';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';

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

/** Avisos de cadastro para a triagem, só dos tipos cuja tela quem consulta vê. */
export class ListarAvisos {
  constructor(private readonly avisos: ConsultaAvisos) {}

  async executar(
    { tipo, ...filtro }: Omit<FiltroAvisos, 'tipos'> & { tipo?: TipoAviso },
    acesso: AcessoAvisos,
  ) {
    const visiveis = tiposDeAvisoVisiveis(acesso);
    const tipos = tipo ? visiveis.filter((t) => t === tipo) : visiveis;
    return { ...(await this.avisos.listar({ ...filtro, tipos })), tipos: visiveis };
  }

  obter(id: string, acesso: AcessoAvisos) {
    return obterAvisoVisivel(this.avisos, id, acesso);
  }
}

export class ObterParametros {
  constructor(private readonly parametros: ParametrosIngestaoRepository) {}

  executar() {
    return this.parametros.obter();
  }
}
