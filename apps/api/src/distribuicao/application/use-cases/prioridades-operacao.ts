import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import type {
  CelulaRecebimento,
  PrioridadeOperacao,
} from '../../domain/motor/prioridades-operacao';
import {
  canonicaCelulas,
  type EdicaoPrioridadeOperacao,
  grafiasEmOutras,
  normalizarPrioridade,
  validarCelulas,
  validarPrioridadeOperacao,
} from '../../domain/prioridades-operacao';
import { invalida } from '../../domain/validacao';
import { PrioridadeOperacaoNaoEncontradaError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { PrioridadesOperacaoRepository } from '../ports/prioridades-operacao.repository';
import { diferenca, exigirReferencias } from '../referencias';

const ENTIDADE = 'prioridade_operacao';

/** Normaliza, valida e recusa nome ou grafia que já são de outra prioridade. */
async function prepararEdicao(
  repo: PrioridadesOperacaoRepository,
  entrada: EdicaoPrioridadeOperacao,
  id: string | null,
): Promise<EdicaoPrioridadeOperacao> {
  const edicao = normalizarPrioridade(entrada);
  validarPrioridadeOperacao(edicao);
  const outras = (await repo.listar()).filter((p) => p.id !== id);
  if (outras.some((o) => o.nome.toUpperCase() === edicao.nome.toUpperCase())) {
    invalida(`Já existe a prioridade ${edicao.nome}.`);
  }
  const [repetida] = grafiasEmOutras(edicao, outras);
  if (repetida !== undefined) {
    const dona = outras.find((o) =>
      o.grafias.some((g) => g.localeCompare(repetida, 'pt-BR', { sensitivity: 'base' }) === 0),
    );
    invalida(`A grafia "${repetida}" já está em ${dona?.nome ?? 'outra prioridade'}.`);
  }
  return edicao;
}

const foto = ({ id: _, ...campos }: PrioridadeOperacao): Record<string, unknown> => ({
  ...campos,
});

/** Configurações › Distribuição: as prioridades da operação, pela posição. */
export class ListarPrioridadesOperacao {
  constructor(private readonly repo: PrioridadesOperacaoRepository) {}

  executar(): Promise<PrioridadeOperacao[]> {
    return this.repo.listar();
  }
}

export class CriarPrioridadeOperacao {
  constructor(
    private readonly repo: PrioridadesOperacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, entrada: EdicaoPrioridadeOperacao): Promise<string> {
    const edicao = await prepararEdicao(this.repo, entrada, null);
    const id = await this.repo.criar(edicao);
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'criado',
      depois: { ...edicao },
      em: this.agora(),
    });
    return id;
  }
}

export class EditarPrioridadeOperacao {
  constructor(
    private readonly repo: PrioridadesOperacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, id: string, entrada: EdicaoPrioridadeOperacao): Promise<void> {
    const atual = (await this.repo.listar()).find((p) => p.id === id);
    if (!atual) throw new PrioridadeOperacaoNaoEncontradaError();
    const nova = { id, ...(await prepararEdicao(this.repo, entrada, id)) };
    const mudancas = diferenca(foto(atual), foto(nova));
    if (!mudancas) return;
    await this.repo.salvar(nova);
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'alterado',
      antes: mudancas.antes,
      depois: mudancas.depois,
      em: this.agora(),
    });
  }
}

/** Exclui a prioridade com o de-para, as células da grade e as sobrescritas das frentes. */
export class ExcluirPrioridadeOperacao {
  constructor(
    private readonly repo: PrioridadesOperacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, id: string): Promise<void> {
    const atual = (await this.repo.listar()).find((p) => p.id === id);
    if (!atual) throw new PrioridadeOperacaoNaoEncontradaError();
    await this.repo.excluir(id);
    await this.auditoria.registrar({
      ator,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'excluido',
      antes: foto(atual),
      em: this.agora(),
    });
  }
}

/** A grade geral de recebimento (célula ausente = segue o SLA). */
export class ObterGradeRecebimento {
  constructor(private readonly repo: PrioridadesOperacaoRepository) {}

  async executar(): Promise<CelulaRecebimento[]> {
    return canonicaCelulas(await this.repo.obterGrade());
  }
}

/** Troca a grade geral inteira, com auditoria. */
export class DefinirGradeRecebimento {
  constructor(
    private readonly repo: PrioridadesOperacaoRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, entrada: readonly CelulaRecebimento[]): Promise<void> {
    const celulas = canonicaCelulas(entrada);
    validarCelulas(celulas);
    await exigirReferencias(this.cadastros, {
      prioridadeOperacao: celulas.map((c) => c.prioridadeOperacaoId),
      turno: celulas.map((c) => c.turnoId),
    });
    const atuais = canonicaCelulas(await this.repo.obterGrade());
    const mudancas = diferenca({ celulas: atuais }, { celulas });
    if (!mudancas) return;
    await this.repo.salvarGrade(celulas);
    await this.auditoria.registrar({
      ator,
      entidade: 'recebimento_distribuicao',
      entidadeId: 'geral',
      acao: 'alterado',
      antes: mudancas.antes,
      depois: mudancas.depois,
      em: this.agora(),
    });
  }
}
