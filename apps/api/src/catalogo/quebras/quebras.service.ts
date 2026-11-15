import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { normalizarNome } from '../comum/nomes';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import { QuebraInvalidaError, QuebraRepetidaError } from './quebras.errors';
import {
  type DadosPeca,
  type FiltroQuebras,
  type Peca,
  QUEBRAS_REPOSITORY,
  type QuebraDetalhe,
  type QuebraResumo,
  type QuebrasRepository,
} from './quebras.repository';

const ROTULO = { entidade: 'quebra_estudo', singular: 'Quebra', genero: 'f' } as const;
const ROTULO_PECA = { entidade: 'quebra_estudo', singular: 'Peça', genero: 'f' } as const;

const pecaParaAuditoria = (p: Peca) => ({
  exame: p.exame.nome,
  categoria: p.categoria?.nome ?? null,
  ativo: p.ativo,
});

/**
 * Quebras de estudo: o estudo que chega da MobileMed (em geral um combinado, como "TC TÓRAX E
 * ABDOME") e os exames do cadastro em que ele vira na cobrança, cada um valendo 1. A quebra é do
 * nome do estudo, não de um exame do cadastro, como no dashboards-one.
 */
@Injectable()
export class QuebrasService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(QUEBRAS_REPOSITORY) private readonly repo: QuebrasRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  listar(filtro: FiltroQuebras): Promise<Pagina<QuebraResumo>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<QuebraDetalhe> {
    const quebra = await this.repo.buscar(id);
    if (!quebra) throw new ItemNaoEncontradoError(ROTULO);
    return quebra;
  }

  async criar(ator: AtorCatalogo, dados: { estudoOrigem: string }): Promise<string> {
    const validos = await this.validarEstudo(dados.estudoOrigem, null);
    const id = await this.repo.criar(validos);
    await this.registro.criado(ator, id, { estudoOrigem: validos.estudoOrigem });
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: { estudoOrigem: string }) {
    const atual = await this.obter(id);
    const validos = await this.validarEstudo(dados.estudoOrigem, id);
    await this.repo.atualizar(id, validos);
    await this.registro.alterado(
      ator,
      id,
      { estudoOrigem: atual.estudoOrigem },
      { estudoOrigem: validos.estudoOrigem },
    );
  }

  async excluir(ator: AtorCatalogo, id: string) {
    const atual = await this.obter(id);
    await this.repo.excluir(id);
    await this.registro.excluido(ator, id, {
      estudoOrigem: atual.estudoOrigem,
      pecas: atual.pecas.map((p) => p.exame.nome),
    });
  }

  async adicionarPeca(ator: AtorCatalogo, id: string, dados: DadosPeca): Promise<string> {
    const quebra = await this.obter(id);
    await this.validarPeca(quebra, dados, null);
    const pecaId = await this.repo.criarPeca(id, dados);
    const criada = await this.peca(id, pecaId);
    await this.registro.registrar(
      ator,
      id,
      'peca_adicionada',
      undefined,
      pecaParaAuditoria(criada),
    );
    return pecaId;
  }

  async atualizarPeca(ator: AtorCatalogo, id: string, pecaId: string, dados: DadosPeca) {
    const antes = await this.peca(id, pecaId);
    await this.validarPeca(await this.obter(id), dados, pecaId);
    await this.repo.atualizarPeca(pecaId, dados);
    const depois = await this.peca(id, pecaId);
    await this.registro.registrar(
      ator,
      id,
      'peca_alterada',
      pecaParaAuditoria(antes),
      pecaParaAuditoria(depois),
    );
  }

  async removerPeca(ator: AtorCatalogo, id: string, pecaId: string) {
    const peca = await this.peca(id, pecaId);
    await this.repo.excluirPeca(pecaId);
    await this.registro.registrar(ator, id, 'peca_removida', pecaParaAuditoria(peca));
  }

  /** A peça, desde que seja da quebra da rota. */
  private async peca(id: string, pecaId: string): Promise<Peca> {
    const peca = (await this.obter(id)).pecas.find((p) => p.id === pecaId);
    if (!peca) throw new ItemNaoEncontradoError(ROTULO_PECA);
    return peca;
  }

  private async validarEstudo(estudoOrigem: string, id: string | null) {
    const nome = estudoOrigem.trim();
    const chave = normalizarNome(nome);
    if (!chave) throw new QuebraInvalidaError('Informe o estudo como chega da MobileMed.');
    const existente = await this.repo.buscarPorChave(chave);
    if (existente && existente.id !== id) {
      throw new QuebraRepetidaError(`Já existe uma quebra para "${existente.estudoOrigem}".`);
    }
    return { estudoOrigem: nome, chaveNormalizada: chave };
  }

  private async validarPeca(quebra: QuebraDetalhe, dados: DadosPeca, pecaId: string | null) {
    const exame = await this.repo.buscarExame(dados.exameId);
    if (!exame) throw new QuebraInvalidaError('Exame não encontrado.');
    if (exame.chaveNormalizada === quebra.chaveNormalizada) {
      throw new QuebraInvalidaError('O estudo não pode se quebrar nele mesmo.');
    }
    const repetida = quebra.pecas.find((p) => p.exame.id === dados.exameId && p.id !== pecaId);
    if (repetida) throw new QuebraRepetidaError(`Este estudo já se quebra em ${exame.nome}.`);
  }
}
