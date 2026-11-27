import { Inject, Injectable } from '@nestjs/common';

import type { Paginacao } from '../../catalogo/comum/paginacao';
import { type Principal, temPermissao } from '../../identidade/principal';
import {
  HISTORICO_CADASTRO_REPOSITORY,
  type HistoricoCadastroRepository,
  type PaginaHistoricoCadastro,
} from './historico-cadastro.repository';

/**
 * Histórico (log de mudanças) do cadastro de um médico, cliente, exame ou fornecedor, lido da auditoria. Quem
 * vê o cadastro vê o histórico dele; no médico, as partes com permissão própria entram só para
 * quem pode vê-las.
 */
@Injectable()
export class HistoricoCadastroService {
  constructor(
    @Inject(HISTORICO_CADASTRO_REPOSITORY) private readonly repo: HistoricoCadastroRepository,
  ) {}

  doMedico(
    principal: Principal,
    id: string,
    paginacao: Paginacao,
  ): Promise<PaginaHistoricoCadastro> {
    const incluir = {
      pagamento: temPermissao(principal, 'medicos.pagamento.ver'),
      distribuicao: temPermissao(principal, 'medicos.distribuicao.ver'),
      acesso: temPermissao(principal, 'medicos.acesso.ver'),
    };
    return this.repo.listar({ cadastro: 'medico', id, incluir }, paginacao);
  }

  doCliente(id: string, paginacao: Paginacao): Promise<PaginaHistoricoCadastro> {
    return this.repo.listar({ cadastro: 'cliente', id }, paginacao);
  }

  doExame(id: string, paginacao: Paginacao): Promise<PaginaHistoricoCadastro> {
    return this.repo.listar({ cadastro: 'exame', id }, paginacao);
  }

  doFornecedor(id: string, paginacao: Paginacao): Promise<PaginaHistoricoCadastro> {
    return this.repo.listar({ cadastro: 'fornecedor', id }, paginacao);
  }

  doTitulo(
    tipo: 'pagar' | 'receber',
    id: string,
    paginacao: Paginacao,
  ): Promise<PaginaHistoricoCadastro> {
    return this.repo.listar({ cadastro: 'titulo', tipo, id }, paginacao);
  }
}
