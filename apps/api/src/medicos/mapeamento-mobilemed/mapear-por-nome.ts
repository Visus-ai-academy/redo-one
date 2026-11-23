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
  /** Resumo da evidência do robô antigo (`resolverComEvidencia`). */
  evidencia?: string;
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

/** Exames que o robô antigo entregou ao médico e que o relatório mostra assinados. */
export interface Evidencia {
  n: number;
  /** Conta que assinou (`usuario_id`) → exames. */
  porConta: Map<number, number>;
  /** Conta do 1º laudo (`medico_primeiro_laudo_id`) → exames. */
  porPrimeiro: Map<number, number>;
}

/** Evidência "sem dúvida": a conta dominante tem pelo menos esta fração de pelo menos tantos exames. */
export const DOMINANCIA = 0.9;
export const MINIMO_EXAMES = 10;
/** Com evidência suficiente, a conta do nome com menos que isso dos exames contradiz o nome. */
const CONTRADIZ = 0.5;

const somar = (mapa: Map<number, number>, id: number | null) => {
  if (id !== null) mapa.set(id, (mapa.get(id) ?? 0) + 1);
};

/** Agrupa por médico os exames entregues que aparecem no relatório com quem assinou. */
export function evidenciaPorMedico(
  entregas: { exameId: number; medicoId: string }[],
  laudos: Map<number, { usuarioId: number | null; primeiroId: number | null }>,
): Map<string, Evidencia> {
  const porMedico = new Map<string, Evidencia>();
  for (const { exameId, medicoId } of entregas) {
    const laudo = laudos.get(exameId);
    if (!laudo || laudo.usuarioId === null) continue;
    const ev = porMedico.get(medicoId) ?? { n: 0, porConta: new Map(), porPrimeiro: new Map() };
    ev.n++;
    somar(ev.porConta, laudo.usuarioId);
    somar(ev.porPrimeiro, laudo.primeiroId);
    porMedico.set(medicoId, ev);
  }
  return porMedico;
}

function dominante(ev: Evidencia | undefined): number | null {
  if (!ev || ev.n < MINIMO_EXAMES) return null;
  const [id, n] = [...ev.porConta].sort((a, b) => b[1] - a[1])[0] ?? [];
  return id !== undefined && n !== undefined && n / ev.n >= DOMINANCIA ? id : null;
}

const parcelas = (mapa: Map<number, number>, n: number) =>
  [...mapa]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, k]) => `${id} ${Math.round((100 * k) / n)}%`)
    .join(', ');

export const resumoEvidencia = (ev: Evidencia | undefined) =>
  ev
    ? `n=${ev.n}; assinou: ${parcelas(ev.porConta, ev.n)}; 1º laudo: ${parcelas(ev.porPrimeiro, ev.n)}`
    : 'sem exames do robô antigo no relatório';

export interface ResultadoComEvidencia {
  gravar: { medico: MedicoSemConta; conta: ContaMobileMed; fonte: 'nome' | 'evidência' }[];
  pendencias: Pendencia[];
}

/**
 * Junta o casamento pelo nome com a evidência das entregas do robô antigo. Pelo nome, grava se a
 * evidência não contradiz. Ambíguo ou só com conta secundária, grava a conta dominante
 * (`DOMINANCIA` de `MINIMO_EXAMES`) se ela casa pelo nome, não é de outro médico nem dominante
 * para outro. O resto (e a mesma conta para dois médicos) fica em branco, com a evidência.
 */
export function resolverComEvidencia(
  porNome: ResultadoMapeamento,
  evidencias: Map<string, Evidencia>,
  donos: Map<number, string>,
): ResultadoComEvidencia {
  const dominantes = new Map<number, number>();
  for (const ev of evidencias.values()) {
    const id = dominante(ev);
    if (id !== null) dominantes.set(id, (dominantes.get(id) ?? 0) + 1);
  }
  type Decisao = ResultadoComEvidencia['gravar'][number] & Omit<Pendencia, 'medico'>;
  const decididos: Decisao[] = [];
  const pendencias: Pendencia[] = [];
  const pendente = (p: Pendencia) =>
    pendencias.push({ ...p, evidencia: resumoEvidencia(evidencias.get(p.medico.id)) });

  for (const { medico, conta } of porNome.gravar) {
    const ev = evidencias.get(medico.id);
    const candidatos: Candidato[] = [{ conta, casamento: 'nome' }];
    if (ev && ev.n >= MINIMO_EXAMES && (ev.porConta.get(conta.id) ?? 0) / ev.n < CONTRADIZ) {
      pendente({ medico, situacao: '1 resultado, a evidência contradiz o nome', candidatos });
    } else decididos.push({ medico, conta, fonte: 'nome', situacao: '1 resultado', candidatos });
  }
  for (const p of porNome.pendencias) {
    const resolvivel =
      /^\d+ resultados$/.test(p.situacao) || p.situacao.endsWith('só conta secundária');
    const id = resolvivel ? dominante(evidencias.get(p.medico.id)) : null;
    const conta = p.candidatos.find((c) => c.casamento === 'nome' && c.conta.id === id)?.conta;
    if (conta && !donos.has(conta.id) && dominantes.get(conta.id) === 1) {
      decididos.push({ ...p, conta, fonte: 'evidência' });
    } else pendente(resolvivel ? { ...p, situacao: `${p.situacao}, a evidência não resolve` } : p);
  }

  const gravar: ResultadoComEvidencia['gravar'] = [];
  for (const { medico, conta, fonte, situacao, candidatos } of decididos) {
    const outros = decididos.filter((o) => o.medico !== medico && o.conta.id === conta.id);
    if (!outros.length) gravar.push({ medico, conta, fonte });
    else {
      const nomes = outros.map((o) => o.medico.nome).join(', ');
      pendente({ medico, situacao: `${situacao}, a mesma conta vai para ${nomes}`, candidatos });
    }
  }
  return { gravar, pendencias };
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
  'Evidência do robô antigo (exames entregues: % por conta)',
];

const celula = (valor: string) =>
  /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;

/** CSV para o Excel em pt-BR: UTF-8 com BOM, ";" e CRLF; uma linha por candidato. */
export function csvPendencias(pendencias: Pendencia[]): string {
  const linhas = [COLUNAS];
  for (const { medico, situacao, candidatos, evidencia = '' } of pendencias) {
    const doMedico = [medico.nome, medico.crm ?? '', situacao];
    if (!candidatos.length) linhas.push([...doMedico, '', '', '', '', '', evidencia]);
    for (const { conta, casamento } of candidatos) {
      const crm = [conta.crm, conta.uf].filter(Boolean).join('/');
      linhas.push([
        ...doMedico,
        casamento,
        String(conta.id),
        conta.nome,
        crm,
        conta.email ?? '',
        evidencia,
      ]);
    }
  }
  return `﻿${linhas.map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`;
}
