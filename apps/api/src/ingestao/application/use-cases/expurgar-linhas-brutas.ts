import type { LinhasBrutasRepository } from '../ports/linhas-brutas.repository';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Apaga as linhas cruas da planilha mais antigas que a retenção (job diário). */
export class ExpurgarLinhasBrutas {
  constructor(
    private readonly parametros: ParametrosIngestaoRepository,
    private readonly linhasBrutas: LinhasBrutasRepository,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<number> {
    const { retencaoLinhasBrutasDias } = await this.parametros.obter();
    return this.linhasBrutas.expurgarAntesDe(
      new Date(this.agora().getTime() - retencaoLinhasBrutasDias * DIA_MS),
    );
  }
}
