import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { textoOpcional } from '../comum/documentos';
import { normalizarNome } from '../comum/nomes';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import {
  ALIASES_CLIENTE_REPOSITORY,
  type AliasesClienteRepository,
} from './aliases-cliente.repository';
import { AliasEmUsoError, AliasInvalidoError } from './clientes.errors';
import {
  CLIENTES_REPOSITORY,
  type ClientesRepository,
  type TipoAlias,
} from './clientes.repository';
import { ROTULO_CLIENTE } from './clientes.service';

const ROTULO_ALIAS = { entidade: 'alias_cliente', singular: 'Apelido', genero: 'm' } as const;

export interface DadosAlias {
  tipo: TipoAlias;
  padrao: string;
  observacoes: string | null;
}

/** O que a importação compara: maiúsculas no exato e no prefixo; grafia normalizada no normalizado. */
function chaveDe(tipo: TipoAlias, padrao: string) {
  return tipo === 'normalizado' ? normalizarNome(padrao) : padrao.toUpperCase();
}

/**
 * Apelidos do cliente: outras grafias que chegam da MobileMed. Ficam no cliente (auditados nele);
 * a ordem em que a importação os aplica (exato → prefixo, padrão mais longo vence) é da ingestão.
 */
@Injectable()
export class AliasesClienteService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(CLIENTES_REPOSITORY) private readonly clientes: Pick<ClientesRepository, 'buscar'>,
    @Inject(ALIASES_CLIENTE_REPOSITORY) private readonly aliases: AliasesClienteRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_CLIENTE, auditoria, clock);
  }

  async criar(ator: AtorCatalogo, clienteId: string, dados: DadosAlias): Promise<string> {
    const cliente = await this.clientes.buscar(clienteId);
    if (!cliente) throw new ItemNaoEncontradoError(ROTULO_CLIENTE);

    const padrao = dados.padrao.trim();
    const chave = chaveDe(dados.tipo, padrao);
    if (!chave) throw new AliasInvalidoError('Informe a grafia que vem da origem.');

    const existente = await this.aliases.buscarAlias(dados.tipo, chave);
    if (existente) {
      throw new AliasEmUsoError(
        existente.clienteId === clienteId
          ? 'Esse apelido já existe para este cliente.'
          : `Esse apelido já está ligado a ${existente.clienteNome}.`,
      );
    }
    if (dados.tipo === 'normalizado') {
      const dono = await this.aliases.buscarClientePorChave(chave);
      if (dono?.id === clienteId) {
        throw new AliasInvalidoError(
          'Essa grafia já é a do próprio cliente: não precisa de apelido.',
        );
      }
      if (dono) throw new AliasEmUsoError(`Essa grafia é o nome do cliente ${dono.nome}.`);
    }

    const observacoes = textoOpcional(dados.observacoes);
    const id = await this.aliases.criarAlias(clienteId, {
      tipo: dados.tipo,
      padrao,
      chave,
      observacoes,
    });
    await this.registro.registrar(ator, clienteId, 'alias_criado', undefined, {
      tipo: dados.tipo,
      padrao,
      observacoes,
    });
    return id;
  }

  async excluir(ator: AtorCatalogo, clienteId: string, aliasId: string): Promise<void> {
    const alias = await this.aliases.buscarAliasDoCliente(clienteId, aliasId);
    if (!alias) throw new ItemNaoEncontradoError(ROTULO_ALIAS);
    await this.aliases.excluirAlias(aliasId);
    await this.registro.registrar(ator, clienteId, 'alias_excluido', {
      tipo: alias.tipo,
      padrao: alias.padrao,
    });
  }
}
