import { casaNomeMedico, nomeParecido } from '../comum/nome-medico';

/** Médico ativo do One ainda sem `id_mobilemed`. */
export interface MedicoSemConta {
  id: string;
  nome: string;
  crm: string | null;
  /** Outras grafias do médico (`medicos_aliases`), comparadas como o nome. */
  apelidos: string[];
}

/** Conta de médico na MobileMed (só o que o mapeamento e a conferência usam). */
export interface ContaMobileMed {
  id: number;
  nome: string;
  crm: string | null;
  uf: string | null;
  email: string | null;
}

export interface Candidato {
  conta: ContaMobileMed;
  /** `nome`: casa pelo nome; `nome parecido`: só pista para conferir (nunca grava). */
  casamento: 'nome' | 'nome parecido';
}

export interface Pendencia {
  medico: MedicoSemConta;
  situacao: string;
  candidatos: Candidato[];
}

export interface ResultadoMapeamento {
  gravar: { medico: MedicoSemConta; conta: ContaMobileMed }[];
  pendencias: Pendencia[];
}

const digitos = (crm: string) => crm.replace(/\D/g, '').replace(/^0+/, '');
const ufDe = (crm: string) => crm.toUpperCase().match(/\b([A-Z]{2})\b/)?.[1] ?? null;

/** Só diverge com os dois lados preenchidos: CRM sem número ou sem UF não barra. */
function crmDiverge(crm: string | null, conta: ContaMobileMed): boolean {
  if (!crm || !conta.crm) return false;
  const [a, b] = [digitos(crm), digitos(conta.crm)];
  if (a && b && a !== b) return true;
  const uf = ufDe(crm);
  return !!uf && !!conta.uf && uf !== conta.uf.toUpperCase();
}

/**
 * Casa cada médico sem conta com as contas da MobileMed pelo nome (e pelos apelidos). Grava só
 * quando exatamente uma conta casa, não é secundária ("(E2)", "(F)"), o CRM não diverge e a
 * conta não é de outro médico (no cadastro, `donos`, ou casada com outro médico nesta mesma
 * leitura); o resto vira pendência para conferir com o suporte da MobileMed.
 */
export function mapearPorNome(
  medicos: MedicoSemConta[],
  contas: ContaMobileMed[],
  donos: Map<number, string>,
): ResultadoMapeamento {
  const casadas = medicos.map((medico) => {
    const nomes = [medico.nome, ...medico.apelidos];
    return {
      medico,
      nomes,
      contas: contas.filter((c) => nomes.some((n) => casaNomeMedico(c.nome, n))),
    };
  });
  const pretendentes = new Map<number, string[]>();
  for (const { medico, contas: lista } of casadas) {
    const [unica] = lista;
    if (lista.length === 1 && unica) {
      pretendentes.set(unica.id, [...(pretendentes.get(unica.id) ?? []), medico.nome]);
    }
  }

  const resultado: ResultadoMapeamento = { gravar: [], pendencias: [] };
  for (const { medico, nomes, contas: lista } of casadas) {
    const candidatos = lista.map((conta): Candidato => ({ conta, casamento: 'nome' }));
    const [conta] = lista;
    if (!conta) {
      const parecidas = contas.filter((c) => nomes.some((n) => nomeParecido(c.nome, n)));
      resultado.pendencias.push({
        medico,
        situacao: 'sem resultado',
        candidatos: parecidas.map((c) => ({ conta: c, casamento: 'nome parecido' })),
      });
      continue;
    }
    if (lista.length > 1) {
      resultado.pendencias.push({ medico, situacao: `${lista.length} resultados`, candidatos });
      continue;
    }
    const dono = donos.get(conta.id);
    const outros = (pretendentes.get(conta.id) ?? []).filter((n) => n !== medico.nome);
    const situacao = dono
      ? `1 resultado, conta já no cadastro de ${dono}`
      : outros.length
        ? `1 resultado, a mesma conta casou com ${outros.join(', ')}`
        : crmDiverge(medico.crm, conta)
          ? '1 resultado, CRM diferente'
          : // Conta "(E2)", "(F)": o robô legado nunca escolhia pelo nome (decisão de 01/10).
            /\(.*\)/.test(conta.nome)
            ? '1 resultado, só conta secundária'
            : null;
    if (situacao) resultado.pendencias.push({ medico, situacao, candidatos });
    else resultado.gravar.push({ medico, conta });
  }
  return resultado;
}

const COLUNAS = [
  'Médico no One',
  'CRM/UF no One',
  'Situação',
  'Casamento',
  'Id na MobileMed',
  'Nome na MobileMed',
  'CRM/UF na MobileMed',
  'E-mail na MobileMed',
];

const celula = (valor: string) =>
  /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;

/** CSV para o Excel em pt-BR: UTF-8 com BOM, ";" e CRLF; uma linha por candidato. */
export function csvPendencias(pendencias: Pendencia[]): string {
  const linhas = [COLUNAS];
  for (const { medico, situacao, candidatos } of pendencias) {
    const doMedico = [medico.nome, medico.crm ?? '', situacao];
    if (!candidatos.length) linhas.push([...doMedico, '', '', '', '', '']);
    for (const { conta, casamento } of candidatos) {
      const crm = [conta.crm, conta.uf].filter(Boolean).join('/');
      linhas.push([...doMedico, casamento, String(conta.id), conta.nome, crm, conta.email ?? '']);
    }
  }
  return `﻿${linhas.map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`;
}
