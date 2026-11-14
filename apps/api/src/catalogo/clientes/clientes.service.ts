import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemEmUsoError, ItemNaoEncontradoError, NomeEmUsoError } from '../comum/catalogo.errors';
import { documentoOpcional, textoOpcional } from '../comum/documentos';
import { normalizarNome } from '../comum/nomes';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import {
  CONTRATADOS_REPOSITORY,
  type ContratadosRepository,
} from '../contratados/contratados.repository';
import { ContratadoObrigatorioError } from './clientes.errors';
import {
  CLIENTES_REPOSITORY,
  type ClienteDetalhe,
  type ClienteResumo,
  type ClientesRepository,
  type DadosCliente,
  type FiltroClientes,
} from './clientes.repository';

export const ROTULO_CLIENTE = { entidade: 'cliente', singular: 'Cliente', genero: 'm' } as const;

/** Na auditoria, o CPF (dado pessoal) aparece só pelos dois últimos dígitos. */
const paraAuditoria = (dados: DadosCliente) => ({
  ...dados,
  cpf: dados.cpf ? `***${dados.cpf.slice(-2)}` : null,
});

/** Cadastro básico do cliente. Fiscal, contrato e pré-pago ficam nos contextos donos. */
@Injectable()
export class ClientesService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(CLIENTES_REPOSITORY) private readonly repo: ClientesRepository,
    @Inject(CONTRATADOS_REPOSITORY)
    private readonly contratados: Pick<ContratadosRepository, 'buscar'>,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_CLIENTE, auditoria, clock);
  }

  listar(filtro: FiltroClientes): Promise<Pagina<ClienteResumo>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<ClienteDetalhe> {
    const cliente = await this.repo.buscar(id);
    if (!cliente) throw new ItemNaoEncontradoError(ROTULO_CLIENTE);
    return cliente;
  }

  async criar(ator: AtorCatalogo, dados: DadosCliente): Promise<string> {
    const validos = await this.validar(dados, null);
    const id = await this.repo.criar({
      ...validos,
      chaveNormalizada: normalizarNome(validos.nome),
    });
    await this.registro.criado(ator, id, paraAuditoria(validos));
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: DadosCliente): Promise<void> {
    const atual = dadosDe(await this.obter(id));
    const validos = await this.validar(dados, id);
    await this.repo.atualizar(id, { ...validos, chaveNormalizada: normalizarNome(validos.nome) });
    await this.registro.alterado(ator, id, paraAuditoria(atual), paraAuditoria(validos));
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const atual = dadosDe(await this.obter(id));
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO_CLIENTE);
    await this.registro.excluido(ator, id, paraAuditoria(atual));
  }

  private async validar(dados: DadosCliente, idAtual: string | null): Promise<DadosCliente> {
    const nome = dados.nome.trim();
    const mesmoNome = await this.repo.buscarPorNome(nome);
    if (mesmoNome && mesmoNome.id !== idAtual) throw new NomeEmUsoError(ROTULO_CLIENTE, nome);

    if (!dados.contratadoId) {
      throw new ContratadoObrigatorioError('Informe a empresa que fatura este cliente.');
    }
    if (!(await this.contratados.buscar(dados.contratadoId))) {
      throw new ContratadoObrigatorioError('Empresa que fatura não encontrada.');
    }

    return {
      nome,
      nomeFantasia: textoOpcional(dados.nomeFantasia),
      razaoSocial: textoOpcional(dados.razaoSocial),
      tipoPessoa: dados.tipoPessoa,
      cnpj: documentoOpcional(dados.cnpj, 14, 'O CNPJ tem 14 dígitos.'),
      cpf: documentoOpcional(dados.cpf, 11, 'O CPF tem 11 dígitos.'),
      contratadoId: dados.contratadoId,
      ativo: dados.ativo,
      ocultoDashboards: dados.ocultoDashboards,
      observacoes: textoOpcional(dados.observacoes),
    };
  }
}

function dadosDe({ id: _, contratado, aliases: __, ...resto }: ClienteDetalhe): DadosCliente {
  return { ...resto, contratadoId: contratado?.id ?? null };
}
