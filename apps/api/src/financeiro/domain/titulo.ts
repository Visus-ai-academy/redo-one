import type { TipoCategoria } from './categoria-financeira';
import { diasEntre, diaValido } from './dias';
import { aparar, exigirSemErros, SituacaoNaoPermiteError } from './erros';

export const TIPOS_TITULO = ['receber', 'pagar'] as const;
export type TipoTitulo = (typeof TIPOS_TITULO)[number];

/** "Vencido" não é situação: é aberto ou parcial com vencimento antes de hoje, calculado na leitura. */
export const SITUACOES_TITULO = ['aberto', 'parcial', 'liquidado', 'cancelado'] as const;
export type SituacaoTitulo = (typeof SITUACOES_TITULO)[number];

/** De onde o título veio. Só o manual nasce pela tela; os outros vêm de outros contextos. */
export const ORIGENS_TITULO = [
  'manual',
  'faturamento',
  'pre_pago',
  'repasse',
  'carga_omie',
] as const;
export type OrigemTitulo = (typeof ORIGENS_TITULO)[number];

export const FORMAS_BAIXA = ['pix', 'boleto', 'ted', 'dinheiro', 'cartao', 'outro'] as const;
export type FormaBaixa = (typeof FORMAS_BAIXA)[number];

export const TIPOS_FAVORECIDO = ['cliente', 'fornecedor', 'medico'] as const;
export type TipoFavorecido = (typeof TIPOS_FAVORECIDO)[number];

/** Quem recebe ou paga: o cliente (a receber), o fornecedor ou o médico (a pagar). */
export interface Favorecido {
  tipo: TipoFavorecido;
  id: string;
}

/** O que a pessoa lança ou edita no título. Datas AAAA-MM-DD; valor em centavos. */
export interface DadosTitulo {
  /** A empresa: o contratado que usa o financeiro do One. */
  contratadoId: string;
  favorecido: Favorecido;
  categoriaId: string;
  descricao: string;
  /** Nº da NF ou do boleto. */
  documento: string | null;
  /** AAAA-MM. */
  competencia: string | null;
  emissaoEm: string;
  vencimento: string;
  /** O que se espera receber ou pagar. */
  valorCentavos: number;
  contaPrevistaId: string | null;
  observacoes: string | null;
}

/** O título como está, para editar e para as ações. */
export interface EstadoTitulo {
  contratadoId: string;
  situacao: SituacaoTitulo;
  valorCentavos: number;
  /** Soma do principal das baixas não estornadas. */
  pagoCentavos: number;
  emissaoEm: string;
  vencimento: string;
  vencimentoOriginal: string | null;
}

/** O que a regra precisa saber do banco para validar o título. */
export interface ContextoTitulo {
  empresaUsaFinanceiro: boolean;
  categoria: { id: string; tipo: TipoCategoria; ativa: boolean } | null;
  /** `unidadeDe`: o cliente é unidade deste principal. */
  favorecido: { ativo: boolean; unidadeDe?: string | null } | null;
  contaPrevista: { contratadoId: string; ativa: boolean } | null;
  /** O título gravado hoje, ao editar. */
  atual?: {
    situacao: SituacaoTitulo;
    pagoCentavos: number;
    origem: OrigemTitulo | 'recorrencia';
    valorCentavos: number;
    favorecido: Favorecido;
    categoriaId: string;
    contaPrevistaId: string | null;
  };
}

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "R$ 1.234,56", para as mensagens. */
export const reais = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORIGEM_POR_EXTENSO: Record<string, string> = {
  faturamento: 'do faturamento',
  pre_pago: 'da recarga do pré-pago',
  repasse: 'do repasse',
  carga_omie: 'da carga inicial',
};

/** "R-0123" / "P-0045". */
export const numeroDoTitulo = (tipo: TipoTitulo, numero: number) =>
  `${tipo === 'receber' ? 'R' : 'P'}-${String(numero).padStart(4, '0')}`;

export function situacaoDo(valorCentavos: number, pagoCentavos: number): SituacaoTitulo {
  if (pagoCentavos <= 0) return 'aberto';
  return pagoCentavos < valorCentavos ? 'parcial' : 'liquidado';
}

/** Dias de atraso hoje; 0 se não vence antes de hoje ou não tem saldo. */
export function diasDeAtraso(
  titulo: { situacao: SituacaoTitulo; vencimento: string },
  hoje: string,
): number {
  if (titulo.situacao !== 'aberto' && titulo.situacao !== 'parcial') return 0;
  return Math.max(0, diasEntre(titulo.vencimento, hoje));
}

/**
 * Valida e normaliza o título. A pagar é de fornecedor ou médico, com categoria de despesa; a
 * receber é de cliente, com categoria de receita. O que já estava no título (favorecido, categoria,
 * conta) vale mesmo se ficou inativo. Título baixado em parte não fica com valor abaixo do pago, e
 * o que veio de outra origem (faturamento...) não muda o valor nem o favorecido.
 */
export function prepararTitulo(
  tipo: TipoTitulo,
  entrada: DadosTitulo,
  contexto: ContextoTitulo,
): DadosTitulo {
  const erros: Record<string, string> = {};
  const { atual } = contexto;
  if (!contexto.empresaUsaFinanceiro) {
    erros.contratadoId = 'Escolha uma empresa que usa o financeiro do One.';
  }

  const favorecidoMudou =
    !atual ||
    atual.favorecido.tipo !== entrada.favorecido.tipo ||
    atual.favorecido.id !== entrada.favorecido.id;
  const tipoCerto =
    tipo === 'receber'
      ? entrada.favorecido.tipo === 'cliente'
      : entrada.favorecido.tipo !== 'cliente';
  if (!tipoCerto) {
    erros.favorecido =
      tipo === 'receber' ? 'Escolha o cliente.' : 'Escolha um fornecedor ou um médico.';
  } else if (!contexto.favorecido) {
    erros.favorecido = 'O favorecido escolhido não existe mais. Escolha outro.';
  } else if (!contexto.favorecido.ativo && favorecidoMudou) {
    erros.favorecido = 'O favorecido está inativo. Reative o cadastro ou escolha outro.';
  } else if (contexto.favorecido.unidadeDe && favorecidoMudou) {
    const principal = contexto.favorecido.unidadeDe;
    erros.favorecido = `Este cliente é unidade de ${principal}: lance o título no ${principal}.`;
  }

  const categoria = contexto.categoria;
  const tipoCategoria: TipoCategoria = tipo === 'receber' ? 'receita' : 'despesa';
  if (!categoria) {
    erros.categoriaId = 'A categoria escolhida não existe mais. Escolha outra.';
  } else if (categoria.tipo !== tipoCategoria) {
    erros.categoriaId =
      tipo === 'receber'
        ? 'O título a receber leva uma categoria de receita.'
        : 'O título a pagar leva uma categoria de despesa.';
  } else if (!categoria.ativa && atual?.categoriaId !== entrada.categoriaId) {
    erros.categoriaId = 'A categoria está inativa. Escolha outra.';
  }

  const descricao = aparar(entrada.descricao);
  if (!descricao) erros.descricao = 'Informe a descrição.';
  else if (descricao.length > 200) erros.descricao = 'Use até 200 caracteres na descrição.';

  if (!diaValido(entrada.emissaoEm)) erros.emissaoEm = 'Informe a data de emissão.';
  if (!diaValido(entrada.vencimento)) erros.vencimento = 'Informe o vencimento.';
  else if (diaValido(entrada.emissaoEm) && entrada.vencimento < entrada.emissaoEm) {
    erros.vencimento = 'O vencimento não pode ser antes da emissão.';
  }

  if (!Number.isInteger(entrada.valorCentavos) || entrada.valorCentavos <= 0) {
    erros.valorCentavos = 'Informe um valor maior que zero.';
  } else if (atual && entrada.valorCentavos < atual.pagoCentavos) {
    erros.valorCentavos = `O valor não pode ficar abaixo do já pago (${reais(atual.pagoCentavos)}).`;
  }

  const origem = atual ? ORIGEM_POR_EXTENSO[atual.origem] : undefined;
  if (atual && origem) {
    if (entrada.valorCentavos !== atual.valorCentavos) {
      erros.valorCentavos = `O valor do título que veio ${origem} não se edita.`;
    }
    if (favorecidoMudou) {
      erros.favorecido = `O ${tipo === 'receber' ? 'cliente' : 'favorecido'} do título que veio ${origem} não se edita.`;
    }
  }

  const competencia = aparar(entrada.competencia);
  if (competencia && !COMPETENCIA.test(competencia)) {
    erros.competencia = 'A competência é o mês, no formato AAAA-MM.';
  }

  const contaPrevistaId = entrada.contaPrevistaId || null;
  if (contaPrevistaId && contaPrevistaId !== atual?.contaPrevistaId) {
    if (!contexto.contaPrevista) {
      erros.contaPrevistaId = 'A conta escolhida não existe mais. Escolha outra.';
    } else if (contexto.contaPrevista.contratadoId !== entrada.contratadoId) {
      erros.contaPrevistaId = 'A conta prevista é de outra empresa. Escolha uma desta.';
    } else if (!contexto.contaPrevista.ativa) {
      erros.contaPrevistaId = 'A conta prevista está inativa. Escolha outra.';
    }
  }
  exigirSemErros(erros);

  return {
    contratadoId: entrada.contratadoId,
    favorecido: { tipo: entrada.favorecido.tipo, id: entrada.favorecido.id },
    categoriaId: entrada.categoriaId,
    descricao: descricao as string,
    documento: aparar(entrada.documento),
    competencia,
    emissaoEm: entrada.emissaoEm,
    vencimento: entrada.vencimento,
    valorCentavos: entrada.valorCentavos,
    contaPrevistaId,
    observacoes: aparar(entrada.observacoes),
  };
}

/** Liquidado e cancelado não se editam nem se prorrogam. */
export function exigirEditavel(titulo: Pick<EstadoTitulo, 'situacao'>) {
  if (titulo.situacao === 'cancelado') {
    throw new SituacaoNaoPermiteError('O título cancelado não se edita.');
  }
  if (titulo.situacao === 'liquidado') {
    throw new SituacaoNaoPermiteError('O título liquidado não se edita. Estorne a baixa antes.');
  }
}

/** Só se cancela título sem baixa ativa (o cancelado fica na lista, com o motivo). */
export function exigirCancelavel(titulo: Pick<EstadoTitulo, 'situacao' | 'pagoCentavos'>) {
  if (titulo.situacao === 'cancelado') {
    throw new SituacaoNaoPermiteError('O título já está cancelado.');
  }
  if (titulo.pagoCentavos > 0) {
    throw new SituacaoNaoPermiteError(
      'Só se cancela título sem baixa ativa. Estorne as baixas antes.',
    );
  }
}

/** Motivo de estorno, cancelamento, prorrogação: obrigatório, fica no histórico. */
export function prepararMotivo(texto: string | null | undefined): string {
  const motivo = aparar(texto);
  if (!motivo) exigirSemErros({ motivo: 'Informe o motivo.' });
  if ((motivo as string).length > 1000) exigirSemErros({ motivo: 'Use até 1.000 caracteres.' });
  return motivo as string;
}

/** Novo vencimento; o primeiro vencimento do título fica guardado. */
export function prepararProrrogacao(titulo: EstadoTitulo, novo: string) {
  exigirEditavel(titulo);
  if (!diaValido(novo)) exigirSemErros({ vencimento: 'Informe o novo vencimento.' });
  if (novo === titulo.vencimento) {
    exigirSemErros({ vencimento: 'Escolha um vencimento diferente do atual.' });
  }
  if (novo < titulo.emissaoEm) {
    exigirSemErros({ vencimento: 'O vencimento não pode ser antes da emissão.' });
  }
  return { vencimento: novo, vencimentoOriginal: titulo.vencimentoOriginal ?? titulo.vencimento };
}

/** O que a pessoa informa ao dar baixa. */
export interface DadosBaixa {
  pagoEm: string;
  contaBancariaId: string;
  /** Quanto abate do saldo. */
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  forma: FormaBaixa;
  observacao: string | null;
}

export interface BaixaPreparada extends DadosBaixa {
  /** Principal + juros + multa − desconto: o que entrou ou saiu do banco. */
  valorMovimentadoCentavos: number;
}

/**
 * Valida a baixa (pagamento ou recebimento) e calcula o novo pago e a situação. Juros e multa ficam
 * fora do saldo: entram só no valor movimentado. A baixa não passa do saldo.
 */
export function prepararBaixa(
  titulo: EstadoTitulo,
  entrada: DadosBaixa,
  contexto: { conta: { contratadoId: string; ativa: boolean } | null; hoje: string },
): { baixa: BaixaPreparada; pagoCentavos: number; situacao: SituacaoTitulo } {
  if (titulo.situacao === 'cancelado' || titulo.situacao === 'liquidado') {
    throw new SituacaoNaoPermiteError(
      titulo.situacao === 'cancelado'
        ? 'O título cancelado não recebe baixa.'
        : 'O título já está liquidado: não há saldo para baixar.',
    );
  }
  const erros: Record<string, string> = {};
  const saldo = titulo.valorCentavos - titulo.pagoCentavos;
  const inteiro = (v: number) => Number.isInteger(v);

  if (!inteiro(entrada.principalCentavos) || entrada.principalCentavos <= 0) {
    erros.principalCentavos = 'Informe um valor maior que zero.';
  } else if (entrada.principalCentavos > saldo) {
    erros.principalCentavos = `O valor passa do saldo do título (${reais(saldo)}).`;
  }
  for (const campo of ['jurosCentavos', 'multaCentavos', 'descontoCentavos'] as const) {
    if (!inteiro(entrada[campo]) || entrada[campo] < 0)
      erros[campo] = 'O valor não pode ser negativo.';
  }

  if (!diaValido(entrada.pagoEm)) erros.pagoEm = 'Informe a data do pagamento.';
  else if (entrada.pagoEm > contexto.hoje) {
    erros.pagoEm = 'A data do pagamento não pode ser depois de hoje.';
  }

  if (!contexto.conta) {
    erros.contaBancariaId = 'A conta escolhida não existe mais. Escolha outra.';
  } else if (contexto.conta.contratadoId !== titulo.contratadoId) {
    erros.contaBancariaId = 'A conta é de outra empresa. Escolha uma desta.';
  } else if (!contexto.conta.ativa) {
    erros.contaBancariaId = 'A conta está inativa. Escolha outra.';
  }

  const bruto = entrada.principalCentavos + entrada.jurosCentavos + entrada.multaCentavos;
  if (!erros.descontoCentavos && entrada.descontoCentavos > Math.max(bruto, 0)) {
    erros.descontoCentavos = 'O desconto não pode passar do valor com juros e multa.';
  }
  exigirSemErros(erros);

  const pagoCentavos = titulo.pagoCentavos + entrada.principalCentavos;
  return {
    baixa: {
      ...entrada,
      observacao: aparar(entrada.observacao),
      valorMovimentadoCentavos: bruto - entrada.descontoCentavos,
    },
    pagoCentavos,
    situacao: situacaoDo(titulo.valorCentavos, pagoCentavos),
  };
}
