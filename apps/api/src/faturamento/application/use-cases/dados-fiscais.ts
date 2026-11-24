import type { Auditoria } from '../../../auditoria/auditoria';
import {
  camposAlterados,
  DADOS_FISCAIS_VAZIOS,
  type DadosFiscais,
  prepararDadosFiscais,
} from '../../domain/dados-fiscais';
import { ClienteNaoEncontradoError } from '../../domain/vigencia-corte';
import type {
  DadosFiscaisRegistrados,
  DadosFiscaisRepository,
} from '../ports/dados-fiscais.repository';

/** Dados de faturamento do cliente; o cliente sem a linha devolve tudo vazio. */
export interface DadosFiscaisDoCliente extends Omit<DadosFiscaisRegistrados, 'atualizadoEm'> {
  atualizadoEm: Date | null;
}

async function exigirCliente(repo: DadosFiscaisRepository, clienteId: string) {
  if (!(await repo.clienteExiste(clienteId))) throw new ClienteNaoEncontradoError();
}

/** Aba Faturamento do cliente: e-mails da NF, endereço, contato, banco e Omie. */
export class ObterDadosFiscais {
  constructor(private readonly repo: DadosFiscaisRepository) {}

  async executar(clienteId: string): Promise<DadosFiscaisDoCliente> {
    await exigirCliente(this.repo, clienteId);
    return (
      (await this.repo.obter(clienteId)) ?? {
        dados: DADOS_FISCAIS_VAZIOS,
        omie: { codigoCliente: null, sincronizadoEm: null },
        atualizadoEm: null,
        atualizadoPor: null,
      }
    );
  }
}

/**
 * Troca os dados de faturamento do cliente (a unidade também tem os seus; a NF usa os do
 * principal). Auditado: define para onde vai a NF. Sem mudança, nada é gravado.
 */
export class DefinirDadosFiscais {
  constructor(
    private readonly repo: DadosFiscaisRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, clienteId: string, entrada: DadosFiscais): Promise<void> {
    await exigirCliente(this.repo, clienteId);
    const novos = prepararDadosFiscais(entrada);
    const atuais = (await this.repo.obter(clienteId))?.dados ?? DADOS_FISCAIS_VAZIOS;
    const mudanca = camposAlterados(atuais, novos);
    if (!mudanca) return;
    const em = this.agora();
    await this.repo.salvar(clienteId, novos, { usuarioId, em });
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'cliente_dados_fiscais',
      entidadeId: clienteId,
      acao: 'alterado',
      antes: mudanca.antes,
      depois: mudanca.depois,
      em,
    });
  }
}
