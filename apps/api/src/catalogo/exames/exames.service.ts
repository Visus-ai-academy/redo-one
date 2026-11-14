import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemEmUsoError, ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { textoOpcional } from '../comum/documentos';
import { normalizarNome } from '../comum/nomes';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import { RegraQuebraInvalidaError, RegraQuebraRepetidaError } from './exames.errors';
import {
  type DadosExame,
  type DadosRegraQuebra,
  EXAMES_REPOSITORY,
  type ExameDetalhe,
  type ExameResumo,
  type ExamesRepository,
  type FiltroExames,
  type RegraQuebra,
} from './exames.repository';

const ROTULO = { entidade: 'exame', singular: 'Exame', genero: 'm' } as const;
const ROTULO_REGRA = {
  entidade: 'regra_quebra_exame',
  singular: 'Regra de quebra',
  genero: 'f',
} as const;

const regraParaAuditoria = (r: RegraQuebra) => ({
  exameDestino: r.exameDestino.nome,
  categoria: r.categoria?.nome ?? null,
  ativo: r.ativo,
});

/** Catálogo de exames e as regras de quebra (um exame laudado que vira outros na cobrança). */
@Injectable()
export class ExamesService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(EXAMES_REPOSITORY) private readonly repo: ExamesRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  listar(filtro: FiltroExames): Promise<Pagina<ExameResumo>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<ExameDetalhe> {
    const exame = await this.repo.buscar(id);
    if (!exame) throw new ItemNaoEncontradoError(ROTULO);
    return exame;
  }

  async criar(ator: AtorCatalogo, dados: DadosExame): Promise<string> {
    const validos = limpar(dados);
    const id = await this.repo.criar({
      ...validos,
      chaveNormalizada: normalizarNome(validos.nome),
    });
    await this.registro.criado(ator, id, validos);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: DadosExame): Promise<void> {
    const { id: _, regrasQuebra: __, ...atual } = await this.obter(id);
    const validos = limpar(dados);
    await this.repo.atualizar(id, { ...validos, chaveNormalizada: normalizarNome(validos.nome) });
    await this.registro.alterado(ator, id, atual, validos);
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const { id: _, regrasQuebra: __, ...atual } = await this.obter(id);
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO);
    await this.registro.excluido(ator, id, atual);
  }

  async criarRegraQuebra(ator: AtorCatalogo, exameId: string, dados: DadosRegraQuebra) {
    const origem = await this.obter(exameId);
    await this.validarRegra(origem, dados, null);
    const regraId = await this.repo.criarRegraQuebra(exameId, dados);
    const criada = await this.regra(exameId, regraId);
    await this.registro.registrar(
      ator,
      exameId,
      'regra_quebra_criada',
      undefined,
      regraParaAuditoria(criada),
    );
    return regraId;
  }

  async atualizarRegraQuebra(
    ator: AtorCatalogo,
    exameId: string,
    regraId: string,
    dados: DadosRegraQuebra,
  ) {
    const antes = await this.regra(exameId, regraId);
    await this.validarRegra(await this.obter(exameId), dados, regraId);
    await this.repo.atualizarRegraQuebra(regraId, dados);
    const depois = await this.regra(exameId, regraId);
    await this.registro.registrar(
      ator,
      exameId,
      'regra_quebra_alterada',
      regraParaAuditoria(antes),
      regraParaAuditoria(depois),
    );
  }

  async excluirRegraQuebra(ator: AtorCatalogo, exameId: string, regraId: string) {
    const regra = await this.regra(exameId, regraId);
    await this.repo.excluirRegraQuebra(regraId);
    await this.registro.registrar(
      ator,
      exameId,
      'regra_quebra_excluida',
      regraParaAuditoria(regra),
    );
  }

  /** A regra, desde que seja do exame da rota. */
  private async regra(exameId: string, regraId: string): Promise<RegraQuebra> {
    const exame = await this.obter(exameId);
    const regra = exame.regrasQuebra.find((r) => r.id === regraId);
    if (!regra) throw new ItemNaoEncontradoError(ROTULO_REGRA);
    return regra;
  }

  private async validarRegra(
    origem: ExameDetalhe,
    dados: DadosRegraQuebra,
    regraId: string | null,
  ) {
    if (dados.exameDestinoId === origem.id) {
      throw new RegraQuebraInvalidaError('O exame não pode se quebrar nele mesmo.');
    }
    const destino = await this.repo.buscar(dados.exameDestinoId);
    if (!destino) throw new RegraQuebraInvalidaError('Exame de destino não encontrado.');
    const repetida = origem.regrasQuebra.find(
      (r) => r.exameDestino.id === dados.exameDestinoId && r.id !== regraId,
    );
    if (repetida) throw new RegraQuebraRepetidaError(`Este exame já se quebra em ${destino.nome}.`);
  }
}

function limpar(dados: DadosExame): DadosExame {
  return {
    ...dados,
    nome: dados.nome.trim(),
    codigo: textoOpcional(dados.codigo),
    descricao: textoOpcional(dados.descricao),
  };
}
