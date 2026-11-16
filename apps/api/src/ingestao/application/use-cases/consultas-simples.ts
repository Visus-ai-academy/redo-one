import type { ConsultaAvisos, FiltroAvisos } from '../ports/avisos.consulta';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';

/** Avisos de cadastro para a triagem. */
export class ListarAvisos {
  constructor(private readonly avisos: ConsultaAvisos) {}

  executar(filtro: FiltroAvisos) {
    return this.avisos.listar(filtro);
  }
}

export class ObterParametros {
  constructor(private readonly parametros: ParametrosIngestaoRepository) {}

  executar() {
    return this.parametros.obter();
  }
}
