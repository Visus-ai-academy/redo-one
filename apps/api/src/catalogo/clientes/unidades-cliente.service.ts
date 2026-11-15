import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import { UnificacaoEmUsoError, UnificacaoInvalidaError } from './clientes.errors';
import { ROTULO_CLIENTE } from './clientes.service';
import {
  UNIDADES_CLIENTE_REPOSITORY,
  type UnidadesClienteRepository,
} from './unidades-cliente.repository';

const ROTULO_UNIDADE = { entidade: 'cliente', singular: 'Unidade', genero: 'f' } as const;

/**
 * Unificação de clientes: várias unidades (ex.: as "PRN TELE_…") passam a responder por um cliente
 * principal, com um contrato só. A unidade continua cadastrada, com nome e apelidos próprios, e a
 * importação leva os laudos dela ao principal. Um nível só: principal não é unidade, unidade não
 * tem unidades. Desfazer devolve a unidade a cliente independente.
 */
@Injectable()
export class UnidadesClienteService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(UNIDADES_CLIENTE_REPOSITORY) private readonly unidades: UnidadesClienteRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_CLIENTE, auditoria, clock);
  }

  async adicionar(ator: AtorCatalogo, principalId: string, unidadeId: string): Promise<void> {
    if (principalId === unidadeId) {
      throw new UnificacaoInvalidaError('Um cliente não pode ser unidade dele mesmo.');
    }
    const [principal, unidade] = await Promise.all([
      this.unidades.buscarVinculo(principalId),
      this.unidades.buscarVinculo(unidadeId),
    ]);
    if (!principal || !unidade) throw new ItemNaoEncontradoError(ROTULO_CLIENTE);
    if (principal.unificadoEm) {
      throw new UnificacaoInvalidaError(
        `${principal.nome} já é unidade de ${principal.unificadoEm.nome}: unifique no cliente principal.`,
      );
    }
    if (unidade.unificadoEm?.id === principalId) {
      throw new UnificacaoEmUsoError('Esse cliente já é unidade deste.');
    }
    if (unidade.unificadoEm) {
      throw new UnificacaoEmUsoError(
        `${unidade.nome} já é unidade de ${unidade.unificadoEm.nome}.`,
      );
    }
    if (unidade.totalUnidades > 0) {
      throw new UnificacaoInvalidaError(
        `${unidade.nome} tem unidades próprias: desfaça essas unificações antes.`,
      );
    }

    await this.unidades.definirPrincipal(unidadeId, principalId);
    await this.registro.registrar(ator, principalId, 'unidade_adicionada', undefined, {
      unidade: unidade.nome,
    });
    await this.registro.registrar(ator, unidadeId, 'unificado_em', undefined, {
      principal: principal.nome,
    });
  }

  async remover(ator: AtorCatalogo, principalId: string, unidadeId: string): Promise<void> {
    const unidade = await this.unidades.buscarVinculo(unidadeId);
    if (!unidade || unidade.unificadoEm?.id !== principalId) {
      throw new ItemNaoEncontradoError(ROTULO_UNIDADE);
    }
    await this.unidades.definirPrincipal(unidadeId, null);
    await this.registro.registrar(ator, principalId, 'unidade_removida', {
      unidade: unidade.nome,
    });
    await this.registro.registrar(ator, unidadeId, 'unificacao_desfeita', {
      principal: unidade.unificadoEm.nome,
    });
  }
}
