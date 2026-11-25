import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import {
  diaAnterior,
  diaEmBrasilia,
  type EdicaoExcecaoRecebimento,
  empates,
  podeExcluir,
  type SituacaoExcecao,
  situacaoExcecao,
  validarEdicaoExcecao,
} from '../../domain/excecoes-recebimento';
import type { ExcecaoRecebimento } from '../../domain/motor/prioridades-operacao';
import { invalida } from '../../domain/validacao';
import { ExcecaoRecebimentoNaoEncontradaError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { ExcecoesRecebimentoRepository } from '../ports/excecoes-recebimento.repository';
import { diferenca, exigirReferencias } from '../referencias';

const ENTIDADE = 'excecao_recebimento';

/** Os campos editáveis, na ordem da tela (para o evento de auditoria). */
const foto = (e: EdicaoExcecaoRecebimento): Record<string, unknown> => ({
  turnoId: e.turnoId,
  todasFrentes: e.todasFrentes,
  frente: e.frente,
  todasPrioridades: e.todasPrioridades,
  prioridadeOperacaoId: e.prioridadeOperacaoId,
  regra: e.regra,
  de: e.de,
  ate: e.ate,
});

export interface ExcecaoRecebimentoListada extends ExcecaoRecebimento {
  situacao: SituacaoExcecao;
  podeExcluir: boolean;
  /** As que empatam com esta (mesma especificidade): no empate, vale a criada por último. */
  empatesIds: string[];
}

async function obterOuFalhar(repo: ExcecoesRecebimentoRepository, id: string) {
  const atual = await repo.obter(id);
  if (!atual) throw new ExcecaoRecebimentoNaoEncontradaError();
  return atual;
}

const referencias = (e: EdicaoExcecaoRecebimento) => ({
  turno: [e.turnoId],
  prioridadeOperacao: e.prioridadeOperacaoId ? [e.prioridadeOperacaoId] : [],
  especialidade: e.frente?.especialidadeId ? [e.frente.especialidadeId] : [],
  modalidade: e.frente?.modalidadeId ? [e.frente.modalidadeId] : [],
});

/** Configurações › Distribuição: as exceções, com a situação no dia de hoje em Brasília. */
export class ListarExcecoesRecebimento {
  constructor(
    private readonly repo: ExcecoesRecebimentoRepository,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<ExcecaoRecebimentoListada[]> {
    const hoje = diaEmBrasilia(this.agora());
    const todas = await this.repo.listar();
    return todas.map((e) => ({
      ...e,
      situacao: situacaoExcecao(e, hoje),
      podeExcluir: podeExcluir(e, hoje),
      empatesIds: empates(e, todas).map((o) => o.id),
    }));
  }
}

export class CriarExcecaoRecebimento {
  constructor(
    private readonly repo: ExcecoesRecebimentoRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, edicao: EdicaoExcecaoRecebimento): Promise<string> {
    const em = this.agora();
    validarEdicaoExcecao(null, edicao, diaEmBrasilia(em));
    await exigirReferencias(this.cadastros, referencias(edicao));
    const id = await this.repo.criar({ ...edicao, criadoEm: em });
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'criado',
      depois: foto(edicao),
      em,
    });
    return id;
  }
}

export class EditarExcecaoRecebimento {
  constructor(
    private readonly repo: ExcecoesRecebimentoRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, id: string, edicao: EdicaoExcecaoRecebimento): Promise<void> {
    const atual = await obterOuFalhar(this.repo, id);
    const em = this.agora();
    validarEdicaoExcecao(atual, edicao, diaEmBrasilia(em));
    await exigirReferencias(this.cadastros, referencias(edicao));
    const mudancas = diferenca(foto(atual), foto(edicao));
    if (!mudancas) return;
    await this.repo.salvar({ id, ...edicao });
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'alterado',
      antes: mudancas.antes,
      depois: mudancas.depois,
      em,
    });
  }
}

/** Encerrar = o fim vira ontem; a exceção fica no histórico. */
export class EncerrarExcecaoRecebimento {
  constructor(
    private readonly repo: ExcecoesRecebimentoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, id: string): Promise<void> {
    const atual = await obterOuFalhar(this.repo, id);
    const em = this.agora();
    const hoje = diaEmBrasilia(em);
    if (situacaoExcecao(atual, hoje) === 'encerrada') invalida('A exceção já está encerrada.');
    if (podeExcluir(atual, hoje)) {
      invalida('A exceção ainda não valeu em dia passado: exclua em vez de encerrar.');
    }
    const ate = diaAnterior(hoje);
    await this.repo.salvar({ ...atual, ate });
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'alterado',
      antes: { ate: atual.ate },
      depois: { ate },
      em,
    });
  }
}

/** Só a que ainda não valeu em dia passado; as outras se encerram. */
export class ExcluirExcecaoRecebimento {
  constructor(
    private readonly repo: ExcecoesRecebimentoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, id: string): Promise<void> {
    const atual = await obterOuFalhar(this.repo, id);
    const em = this.agora();
    if (!podeExcluir(atual, diaEmBrasilia(em))) {
      invalida('A exceção já valeu em dias passados: encerre para ela ficar no histórico.');
    }
    await this.repo.excluir(id);
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'excluido',
      antes: foto(atual),
      em,
    });
  }
}
