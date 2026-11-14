import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { medicosDadosPagamento } from '../../database/schema';
import type { DadosPagamento, PagamentoMedicoRepository } from './pagamento-medico.repository';

@Injectable()
export class DrizzlePagamentoMedicoRepository implements PagamentoMedicoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async buscar(medicoId: string): Promise<DadosPagamento | null> {
    const [dados] = await this.db
      .select({
        cpf: medicosDadosPagamento.cpf,
        cnpj: medicosDadosPagamento.cnpj,
        razaoSocial: medicosDadosPagamento.razaoSocial,
        tipoChavePix: medicosDadosPagamento.tipoChavePix,
        chavePix: medicosDadosPagamento.chavePix,
        socio: medicosDadosPagamento.socio,
        optanteSimples: medicosDadosPagamento.optanteSimples,
        omieCodigoFornecedor: medicosDadosPagamento.omieCodigoFornecedor,
      })
      .from(medicosDadosPagamento)
      .where(eq(medicosDadosPagamento.medicoId, medicoId))
      .limit(1);
    return dados ?? null;
  }

  async salvar(medicoId: string, dados: DadosPagamento) {
    await this.db
      .insert(medicosDadosPagamento)
      .values({ ...dados, medicoId })
      .onConflictDoUpdate({ target: medicosDadosPagamento.medicoId, set: dados });
  }
}
