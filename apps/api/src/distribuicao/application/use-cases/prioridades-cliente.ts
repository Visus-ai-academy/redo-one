import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import {
  canonicaPrioridades,
  type PrioridadeDaFrente,
  validarPrioridadesCliente,
} from '../../domain/prioridade-cliente';
import { ClienteNaoEncontradoError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { PrioridadesClienteRepository } from '../ports/prioridades-cliente.repository';
import { exigirReferencias } from '../referencias';

async function exigirCliente(cadastros: CadastrosDistribuicao, clienteId: string) {
  if ((await cadastros.faltando({ cliente: [clienteId] })).length) {
    throw new ClienteNaoEncontradoError();
  }
}

/** Aba Distribuição do cliente: a prioridade dele em cada frente. */
export class ObterPrioridadesCliente {
  constructor(
    private readonly repo: PrioridadesClienteRepository,
    private readonly cadastros: CadastrosDistribuicao,
  ) {}

  async executar(clienteId: string): Promise<PrioridadeDaFrente[]> {
    await exigirCliente(this.cadastros, clienteId);
    return canonicaPrioridades(await this.repo.doCliente(clienteId));
  }
}

/** Troca as prioridades do cliente inteiras, com auditoria do antes e do depois. */
export class DefinirPrioridadesCliente {
  constructor(
    private readonly repo: PrioridadesClienteRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, clienteId: string, itens: PrioridadeDaFrente[]): Promise<void> {
    await exigirCliente(this.cadastros, clienteId);
    validarPrioridadesCliente(itens);
    await exigirReferencias(this.cadastros, {
      especialidade: itens.flatMap((i) =>
        i.frente.especialidadeId ? [i.frente.especialidadeId] : [],
      ),
      modalidade: itens.flatMap((i) => (i.frente.modalidadeId ? [i.frente.modalidadeId] : [])),
    });
    const novas = canonicaPrioridades(itens);
    const atuais = canonicaPrioridades(await this.repo.doCliente(clienteId));
    if (JSON.stringify(atuais) === JSON.stringify(novas)) return;
    await this.repo.substituir(clienteId, novas);
    await this.auditoria.registrar({
      ator,
      entidade: 'prioridades_cliente',
      entidadeId: clienteId,
      acao: 'alterado',
      antes: { prioridades: atuais },
      depois: { prioridades: novas },
      em: this.agora(),
    });
  }
}
