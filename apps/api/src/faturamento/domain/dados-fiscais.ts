import { ErroDeDominio } from '../../comum/erro-de-dominio';

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

/**
 * Dados de faturamento do cliente que a tela edita: para onde vai a NF, endereço, contato, banco e
 * a exclusão fiscal.
 */
export interface DadosFiscais {
  emailsNf: string[];
  email: string | null;
  contatoNome: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  bancoCodigo: string | null;
  bancoAgencia: string | null;
  bancoConta: string | null;
  exclusaoFiscal: boolean;
}

/** Cliente sem linha de dados fiscais. */
export const DADOS_FISCAIS_VAZIOS: DadosFiscais = {
  emailsNf: [],
  email: null,
  contatoNome: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  bancoCodigo: null,
  bancoAgencia: null,
  bancoConta: null,
  exclusaoFiscal: false,
};

const CAMPOS_ENDERECO = [
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
] as const satisfies (keyof DadosFiscais)[];

/** Endereço começado: sem estes, o cadastro do cliente para a NF sairia incompleto. */
const OBRIGATORIOS_ENDERECO = {
  cep: 'Informe o CEP.',
  logradouro: 'Informe o logradouro.',
  cidade: 'Informe a cidade.',
  uf: 'Escolha a UF.',
} as const;

/** Um ou mais campos inválidos; `detalhes.campos` diz qual e por quê (a tela põe no campo). */
export class DadosFiscaisInvalidosError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor(campos: Record<string, string>) {
    super(Object.values(campos)[0] ?? 'Dados de faturamento inválidos.', { campos });
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const aparar = (v: string | null) => {
  const t = (v ?? '').trim();
  return t || null;
};

/**
 * Valida e normaliza o que a tela manda: textos aparados (vazio vira nulo), UF em maiúsculas, CEP
 * só com dígitos e e-mails da NF sem vazios nem repetidos, na ordem. Nada é obrigatório, mas o
 * endereço começado exige CEP, logradouro, cidade e UF.
 */
export function prepararDadosFiscais(entrada: DadosFiscais): DadosFiscais {
  const erros: Record<string, string> = {};
  const vistos = new Set<string>();
  const emailsNf: string[] = [];
  // O erro aponta a posição que veio (a tela manda as linhas vazias), não a da lista limpa.
  entrada.emailsNf.forEach((bruto, i) => {
    const email = bruto.trim();
    if (!email || vistos.has(email.toLowerCase())) return;
    vistos.add(email.toLowerCase());
    if (!EMAIL.test(email)) erros[`emailsNf[${i}]`] = emailInvalido(email);
    emailsNf.push(email);
  });

  const cepDigitado = aparar(entrada.cep);
  const dados: DadosFiscais = {
    emailsNf,
    email: aparar(entrada.email),
    contatoNome: aparar(entrada.contatoNome),
    telefone: aparar(entrada.telefone),
    cep: cepDigitado ? cepDigitado.replace(/\D/g, '') || cepDigitado : null,
    logradouro: aparar(entrada.logradouro),
    numero: aparar(entrada.numero),
    complemento: aparar(entrada.complemento),
    bairro: aparar(entrada.bairro),
    cidade: aparar(entrada.cidade),
    uf: aparar(entrada.uf)?.toUpperCase() ?? null,
    bancoCodigo: aparar(entrada.bancoCodigo),
    bancoAgencia: aparar(entrada.bancoAgencia),
    bancoConta: aparar(entrada.bancoConta),
    exclusaoFiscal: entrada.exclusaoFiscal,
  };

  if (dados.email && !EMAIL.test(dados.email)) erros.email = emailInvalido(dados.email);
  if (CAMPOS_ENDERECO.some((c) => dados[c] !== null)) {
    for (const [campo, mensagem] of Object.entries(OBRIGATORIOS_ENDERECO)) {
      if (dados[campo as keyof typeof OBRIGATORIOS_ENDERECO] === null) erros[campo] = mensagem;
    }
  }
  if (dados.cep && !/^\d{8}$/.test(dados.cep)) erros.cep = 'O CEP tem 8 dígitos.';
  if (dados.uf && !(UFS as readonly string[]).includes(dados.uf)) {
    erros.uf = `A UF "${dados.uf}" não existe.`;
  }
  if (Object.keys(erros).length > 0) throw new DadosFiscaisInvalidosError(erros);
  return dados;
}

function emailInvalido(email: string) {
  return `O e-mail "${email}" não é válido.`;
}

/** Só os campos que mudaram (para a auditoria); nulo se nada mudou. */
export function camposAlterados(
  antes: DadosFiscais,
  depois: DadosFiscais,
): { antes: Partial<DadosFiscais>; depois: Partial<DadosFiscais> } | null {
  const mudou = (Object.keys(depois) as (keyof DadosFiscais)[]).filter(
    (c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]),
  );
  if (mudou.length === 0) return null;
  const recorte = (d: DadosFiscais) => Object.fromEntries(mudou.map((c) => [c, d[c]]));
  return { antes: recorte(antes), depois: recorte(depois) };
}
