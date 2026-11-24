import { z } from 'zod';

import type { DadosFiscaisClienteDto } from '../../gen/types/DadosFiscaisClienteDto';
import type { DadosFiscaisDto } from '../../gen/types/DadosFiscaisDto';
import { soDigitos } from '../../lib/documentos';
import { aplicarMascara } from '../../lib/mascaras';

/** As 27 siglas de UF, na ordem alfabética. */
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
];

/** O formulário: tudo texto (vazio = não informado), os e-mails da NF como lista. */
export type ValoresDadosFaturamento = {
  emailsNf: string[];
  exclusaoFiscal: boolean;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  contatoNome: string;
  email: string;
  telefone: string;
  bancoCodigo: string;
  bancoAgencia: string;
  bancoConta: string;
};

const ENDERECO = [
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
] as const satisfies (keyof ValoresDadosFaturamento)[];

/** Algum campo do endereço preenchido: CEP, logradouro, cidade e UF passam a ser obrigatórios. */
export const enderecoComecado = (v: ValoresDadosFaturamento) =>
  ENDERECO.some((c) => v[c].trim() !== '');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const esquemaDadosFaturamento = z
  .object({
    emailsNf: z.array(z.string()),
    exclusaoFiscal: z.boolean(),
    cep: z.string(),
    logradouro: z.string(),
    numero: z.string(),
    complemento: z.string(),
    bairro: z.string(),
    cidade: z.string(),
    uf: z.string(),
    contatoNome: z.string(),
    email: z.string(),
    telefone: z.string(),
    bancoCodigo: z.string(),
    bancoAgencia: z.string(),
    bancoConta: z.string(),
  })
  .superRefine((v, ctx) => {
    const erro = (campo: string | [string, number], message: string) =>
      ctx.addIssue({ code: 'custom', path: Array.isArray(campo) ? campo : [campo], message });
    const vistos = new Set<string>();
    v.emailsNf.forEach((bruto, i) => {
      const email = bruto.trim().toLowerCase();
      if (!email) return;
      if (!EMAIL.test(email))
        erro(['emailsNf', i], 'Informe um e-mail válido, como nf@empresa.com.br.');
      else if (vistos.has(email)) erro(['emailsNf', i], 'Este e-mail já está na lista.');
      vistos.add(email);
    });
    if (v.email.trim() && !EMAIL.test(v.email.trim())) {
      erro('email', 'Informe um e-mail válido, como financeiro@empresa.com.br.');
    }
    if (enderecoComecado(v)) {
      if (!v.cep.trim()) erro('cep', 'Informe o CEP.');
      if (!v.logradouro.trim()) erro('logradouro', 'Informe o logradouro.');
      if (!v.cidade.trim()) erro('cidade', 'Informe a cidade.');
      if (!v.uf) erro('uf', 'Escolha a UF.');
    }
    if (v.cep.trim() && soDigitos(v.cep).length !== 8) erro('cep', 'O CEP tem 8 dígitos.');
  });

/**
 * Valores iniciais do formulário. CEP e telefone vêm como estão: a máscara do campo formata ao
 * mostrar, e o que a carga trouxe fora do formato aparece como erro ao editar.
 */
export function valoresIniciais(d: DadosFiscaisClienteDto): ValoresDadosFaturamento {
  return {
    emailsNf: d.emailsNf.length > 0 ? [...d.emailsNf] : [''],
    exclusaoFiscal: d.exclusaoFiscal,
    cep: d.cep ?? '',
    logradouro: d.logradouro ?? '',
    numero: d.numero ?? '',
    complemento: d.complemento ?? '',
    bairro: d.bairro ?? '',
    cidade: d.cidade ?? '',
    uf: d.uf ?? '',
    contatoNome: d.contatoNome ?? '',
    email: d.email ?? '',
    telefone: d.telefone ?? '',
    bancoCodigo: d.bancoCodigo ?? '',
    bancoAgencia: d.bancoAgencia ?? '',
    bancoConta: d.bancoConta ?? '',
  };
}

const opcional = (texto: string) => texto.trim() || null;

/**
 * O corpo do PUT. CEP vai só com os dígitos; o telefone também, a não ser que a pessoa não o
 * tenha mexido (o que veio da carga, como "Luísa (11) … / Felipe (11) …", fica como está).
 */
export function corpoDosDados(
  v: ValoresDadosFaturamento,
  salvo: DadosFiscaisClienteDto,
): DadosFiscaisDto {
  const telefoneMexido = v.telefone !== (salvo.telefone ?? '');
  return {
    emailsNf: v.emailsNf.map((e) => e.trim()).filter(Boolean),
    exclusaoFiscal: v.exclusaoFiscal,
    cep: opcional(soDigitos(v.cep)),
    logradouro: opcional(v.logradouro),
    numero: opcional(v.numero),
    complemento: opcional(v.complemento),
    bairro: opcional(v.bairro),
    cidade: opcional(v.cidade),
    uf: opcional(v.uf),
    contatoNome: opcional(v.contatoNome),
    email: opcional(v.email),
    telefone: telefoneMexido ? opcional(soDigitos(v.telefone)) : salvo.telefone,
    bancoCodigo: opcional(v.bancoCodigo),
    bancoAgencia: opcional(v.bancoAgencia),
    bancoConta: opcional(v.bancoConta),
  };
}

/** Telefone para leitura: com a máscara quando é um número só; senão, como está. */
export function telefoneParaLer(telefone: string | null) {
  if (!telefone) return '—';
  const digitos = soDigitos(telefone);
  return digitos === telefone.replace(/[\s()-]/g, '') && digitos.length >= 10
    ? aplicarMascara('telefone', digitos)
    : telefone;
}
