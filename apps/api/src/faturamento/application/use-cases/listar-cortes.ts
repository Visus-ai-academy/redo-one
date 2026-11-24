import type { CortesRepository, VigenciaRegistrada } from '../ports/cortes.repository';

/** Histórico de vigências do corte padrão (sem cliente) ou de um cliente, a mais nova primeiro. */
export class ListarCortes {
  constructor(private readonly cortes: CortesRepository) {}

  executar(clienteId: string | null): Promise<VigenciaRegistrada[]> {
    return this.cortes.listarVigencias(clienteId);
  }
}
