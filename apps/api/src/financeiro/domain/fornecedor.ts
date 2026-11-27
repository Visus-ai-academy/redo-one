import type { TipoCategoria } from './categoria-financeira';
import { aparar, exigirSemErros } from './erros';

export const TIPOS_PESSOA = ['PJ', 'PF'] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

export const TIPOS_CHAVE_PIX = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'] as const;
export type TipoChavePix = (typeof TIPOS_CHAVE_PIX)[number];

/** As 27 siglas de UF. */
export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

/** Empresa ou pessoa a quem a empresa paga e que não é médico (aluguel, software, contador...). */
export interface DadosFornecedor {
  tipoPessoa: TipoPessoa;
  /** Razão social (PJ) ou nome (PF). */
  razaoSocial: string;
  nomeFantasia: string | null;
  /** Só dígitos; só na pessoa jurídica. */
  cnpj: string | null;
  /** Só dígitos; só na pessoa física. */
  cpf: string | null;
  email: string | null;
  /** Só dígitos, com DDD. */
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  tipoChavePix: TipoChavePix | null;
  chavePix: string | null;
  bancoCodigo: string | null;
  agencia: string | null;
  conta: string | null;
  /** Sugerida ao lançar uma despesa do fornecedor. */
  categoriaPadraoId: string | null;
  ativo: boolean;
  observacoes: string | null;
}

export const FORNECEDOR_VAZIO: DadosFornecedor = {
  tipoPessoa: 'PJ',
  razaoSocial: '',
  nomeFantasia: null,
  cnpj: null,
  cpf: null,
  email: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  tipoChavePix: null,
  chavePix: null,
  bancoCodigo: null,
  agencia: null,
  conta: null,
  categoriaPadraoId: null,
  ativo: true,
  observacoes: null,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitos = (v: string) => v.replace(/\D/g, '');

const CAMPOS_ENDERECO = [
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
] as const satisfies (keyof DadosFornecedor)[];

/** Endereço começado: sem estes, o cadastro ficaria incompleto (mesma regra do cliente). */
const OBRIGATORIOS_ENDERECO = {
  cep: 'Informe o CEP.',
  logradouro: 'Informe o logradouro.',
  cidade: 'Informe a cidade.',
  uf: 'Escolha a UF.',
} as const;

/** Tamanho, em dígitos, das chaves Pix de documento. */
const DIGITOS_PIX: Partial<Record<TipoChavePix, number>> = { CPF: 11, CNPJ: 14 };

function prepararPix(
  tipo: TipoChavePix | null,
  bruta: string | null,
  erros: Record<string, string>,
): string | null {
  const chave = aparar(bruta);
  if (chave && !tipo) erros.tipoChavePix = 'Escolha o tipo da chave Pix.';
  if (tipo && !chave) erros.chavePix = 'Informe a chave Pix junto com o tipo dela.';
  if (!tipo || !chave) return chave;
  const tamanho = DIGITOS_PIX[tipo];
  if (tamanho) {
    if (digitos(chave).length !== tamanho) {
      erros.chavePix = `A chave Pix de ${tipo} tem ${tamanho} dígitos.`;
    }
    return digitos(chave);
  }
  if (tipo === 'TELEFONE') {
    const d = digitos(chave);
    if (d.length < 10 || d.length > 13)
      erros.chavePix = 'A chave Pix de telefone tem DDD e número.';
    return d;
  }
  if (tipo === 'EMAIL' && !EMAIL.test(chave))
    erros.chavePix = 'A chave Pix de e-mail não parece válida.';
  return chave;
}

/**
 * Valida e normaliza o fornecedor. O documento segue o tipo de pessoa (CNPJ na jurídica, CPF na
 * física, só dígitos); o endereço começado exige CEP, logradouro, cidade e UF; o Pix tem tipo e
 * chave juntos; a categoria padrão é de despesa.
 */
export function prepararFornecedor(
  entrada: DadosFornecedor,
  contexto: { categoria: { tipo: TipoCategoria } | null },
): DadosFornecedor {
  const erros: Record<string, string> = {};
  const razaoSocial = aparar(entrada.razaoSocial);
  if (!razaoSocial) {
    erros.razaoSocial = entrada.tipoPessoa === 'PJ' ? 'Informe a razão social.' : 'Informe o nome.';
  }

  const pj = entrada.tipoPessoa === 'PJ';
  const documento = digitos(aparar(pj ? entrada.cnpj : entrada.cpf) ?? '');
  if (pj && documento.length !== 14) erros.cnpj = 'Informe o CNPJ (14 dígitos).';
  if (!pj && documento.length !== 11) erros.cpf = 'Informe o CPF (11 dígitos).';

  const email = aparar(entrada.email);
  if (email && !EMAIL.test(email)) {
    erros.email = `O e-mail "${email}" não parece válido. Confira o endereço.`;
  }
  const telefoneDigitado = aparar(entrada.telefone);
  const telefone = telefoneDigitado ? digitos(telefoneDigitado) : null;
  if (telefoneDigitado && (telefone?.length ?? 0) < 10) {
    erros.telefone = 'O telefone tem DDD e 8 ou 9 dígitos.';
  } else if ((telefone?.length ?? 0) > 11) {
    erros.telefone = 'O telefone tem DDD e 8 ou 9 dígitos.';
  }

  const cepDigitado = aparar(entrada.cep);
  const endereco = {
    cep: cepDigitado ? digitos(cepDigitado) : null,
    logradouro: aparar(entrada.logradouro),
    numero: aparar(entrada.numero),
    complemento: aparar(entrada.complemento),
    bairro: aparar(entrada.bairro),
    cidade: aparar(entrada.cidade),
    uf: aparar(entrada.uf)?.toUpperCase() ?? null,
  };
  if (CAMPOS_ENDERECO.some((c) => endereco[c] !== null)) {
    for (const [campo, mensagem] of Object.entries(OBRIGATORIOS_ENDERECO)) {
      if (endereco[campo as keyof typeof OBRIGATORIOS_ENDERECO] === null) erros[campo] = mensagem;
    }
  }
  if (cepDigitado && endereco.cep?.length !== 8) erros.cep = 'O CEP tem 8 dígitos.';
  if (endereco.uf && !(UFS as readonly string[]).includes(endereco.uf)) {
    erros.uf = 'Escolha uma UF da lista.';
  }

  const chavePix = prepararPix(entrada.tipoChavePix, entrada.chavePix, erros);
  const bancoCodigo = aparar(entrada.bancoCodigo);
  if (bancoCodigo && !/^\d{3}$/.test(bancoCodigo)) {
    erros.bancoCodigo = 'O código do banco tem 3 dígitos (ex.: 341).';
  }

  const categoriaPadraoId = entrada.categoriaPadraoId || null;
  if (categoriaPadraoId && !contexto.categoria) {
    erros.categoriaPadraoId = 'A categoria escolhida não existe mais. Escolha outra.';
  } else if (categoriaPadraoId && contexto.categoria?.tipo !== 'despesa') {
    erros.categoriaPadraoId = 'A categoria padrão do fornecedor é uma categoria de despesa.';
  }
  exigirSemErros(erros);

  return {
    tipoPessoa: entrada.tipoPessoa,
    razaoSocial: razaoSocial as string,
    nomeFantasia: aparar(entrada.nomeFantasia),
    cnpj: pj ? documento : null,
    cpf: pj ? null : documento,
    email,
    telefone,
    ...endereco,
    tipoChavePix: chavePix ? entrada.tipoChavePix : null,
    chavePix,
    bancoCodigo,
    agencia: aparar(entrada.agencia),
    conta: aparar(entrada.conta),
    categoriaPadraoId,
    ativo: entrada.ativo,
    observacoes: aparar(entrada.observacoes),
  };
}
