import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../clock';
import { existePermissao, normalizarPermissoes } from '../permissoes/catalogo';
import { type PrincipalUsuario, temPermissao } from '../principal';
import { SESSOES_REPOSITORY, type SessoesRepository } from '../sessoes/sessoes.repository';
import {
  type DadosPapel,
  GESTAO_PAPEIS_REPOSITORY,
  type GestaoPapeisRepository,
  type PapelDetalhe,
  type PapelResumo,
} from './gestao-papeis.repository';
import {
  NomeDePapelDoSistemaError,
  NomeDePapelEmUsoError,
  PapelDeAcessoTotalError,
  PapelDoSistemaError,
  PapelEmUsoError,
  PapelNaoEncontradoError,
  PapelSemPermissaoError,
  PermissaoInexistenteError,
  PermissaoNaoConcedivelError,
} from './papeis.errors';

@Injectable()
export class PapeisService {
  constructor(
    @Inject(GESTAO_PAPEIS_REPOSITORY) private readonly papeis: GestaoPapeisRepository,
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesRepository,
    @Inject(AUDITORIA) private readonly auditoria: Auditoria,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  listar(): Promise<PapelResumo[]> {
    return this.papeis.listar();
  }

  async obter(id: string): Promise<PapelDetalhe> {
    const papel = await this.papeis.buscar(id);
    if (!papel) throw new PapelNaoEncontradoError();
    return papel;
  }

  async criar(ator: PrincipalUsuario, dados: DadosPapel): Promise<string> {
    const validos = await this.validar(ator, dados, null);
    const id = await this.papeis.criar(validos);
    await this.auditar(ator, id, 'criado', undefined, resumo(validos));
    return id;
  }

  /** Mudar as permissões encerra as sessões de quem tem o papel: o acesso novo vale na hora. */
  async atualizar(
    ator: PrincipalUsuario,
    id: string,
    dados: DadosPapel,
  ): Promise<{ sessoesEncerradas: number }> {
    const atual = await this.obter(id);
    // O Administrador vale por `acessoTotal`, não por lista: não há o que editar. Os outros papéis
    // do sistema (Médico) têm permissões editáveis, mas o nome é fixo (o código os acha pelo nome).
    if (atual.acessoTotal) throw new PapelDeAcessoTotalError();
    if (atual.sistema && dados.nome.trim() !== atual.nome) throw new NomeDePapelDoSistemaError();
    const validos = await this.validar(ator, dados, id);
    await this.papeis.atualizar(id, validos);

    const mudouAcesso = atual.permissoes.join() !== validos.permissoes.join();
    const sessoesEncerradas = mudouAcesso
      ? await this.sessoes.encerrarDoPapel(id, this.clock.now())
      : 0;
    await this.auditar(ator, id, 'alterado', resumo(atual), resumo(validos));
    return { sessoesEncerradas };
  }

  async excluir(ator: PrincipalUsuario, id: string): Promise<void> {
    const atual = await this.obter(id);
    if (atual.sistema) throw new PapelDoSistemaError();
    if (atual.totalUsuarios > 0) throw new PapelEmUsoError(atual.totalUsuarios);
    await this.papeis.excluir(id);
    await this.auditar(ator, id, 'excluido', resumo(atual));
  }

  private async validar(
    ator: PrincipalUsuario,
    dados: DadosPapel,
    idAtual: string | null,
  ): Promise<DadosPapel> {
    const nome = dados.nome.trim();
    const mesmoNome = await this.papeis.buscarPorNome(nome);
    if (mesmoNome && mesmoNome.id !== idAtual) throw new NomeDePapelEmUsoError(nome);

    if (dados.permissoes.length === 0) throw new PapelSemPermissaoError();

    const inexistentes = dados.permissoes.filter((chave) => !existePermissao(chave));
    if (inexistentes.length) throw new PermissaoInexistenteError(inexistentes);

    const permissoes = normalizarPermissoes(dados.permissoes);
    const semDireito = permissoes.filter((chave) => !temPermissao(ator, chave));
    if (semDireito.length) throw new PermissaoNaoConcedivelError(semDireito);

    return { nome, descricao: dados.descricao?.trim() || null, permissoes };
  }

  private auditar(
    ator: PrincipalUsuario,
    papelId: string,
    acao: string,
    antes?: Record<string, unknown>,
    depois?: Record<string, unknown>,
  ) {
    return this.auditoria.registrar({
      ator: { tipo: 'usuario', id: ator.usuarioId },
      entidade: 'papel',
      entidadeId: papelId,
      acao,
      antes,
      depois,
      em: this.clock.now(),
    });
  }
}

function resumo(papel: { nome: string; permissoes: string[] }) {
  return { nome: papel.nome, permissoes: papel.permissoes };
}
