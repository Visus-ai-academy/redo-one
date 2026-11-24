import { normalizarNomeMedico } from '../comum/nome-medico';
import { type MedicoSemConta, MINIMO_EXAMES } from './mapear-por-nome';

/** Laudos importados que um nome assinou com uma conta MobileMed (assinatura ou reassinatura). */
export interface AssinaturaNosLaudos {
  nome: string;
  idMobilemed: number;
  laudos: number;
}

export interface PendenciaPorLaudos {
  medico: MedicoSemConta;
  situacao: string;
  /** Conta → laudos assinados com o nome do médico. */
  contas: Map<number, number>;
}

export interface ResultadoPorLaudos {
  gravar: { medico: MedicoSemConta; idMobilemed: number; laudos: number }[];
  pendencias: PendenciaPorLaudos[];
}

/**
 * Acha a conta MobileMed de cada médico sem conta pelos laudos importados, que trazem o nome e o
 * id da conta de quem assinou. Casa o nome (e os apelidos) pela grafia normalizada. Grava só
 * quando o nome assina por uma conta só, com pelo menos `MINIMO_EXAMES` laudos, e essa conta não
 * é de outro médico do cadastro (`donos`), não assina com outro nome nem casa com outro médico
 * desta leitura. O resto fica pendente para conferir com o suporte da MobileMed.
 */
export function mapearPorLaudos(
  medicos: MedicoSemConta[],
  assinaturas: AssinaturaNosLaudos[],
  donos: Map<number, string>,
): ResultadoPorLaudos {
  const chavesDe = (m: MedicoSemConta) =>
    new Set([m.nome, ...m.apelidos].map(normalizarNomeMedico).filter(Boolean));
  const nomesDaConta = new Map<number, Map<string, string>>();
  for (const a of assinaturas) {
    const nomes = nomesDaConta.get(a.idMobilemed) ?? new Map<string, string>();
    nomes.set(normalizarNomeMedico(a.nome), a.nome);
    nomesDaConta.set(a.idMobilemed, nomes);
  }

  const lidos = medicos.map((medico) => {
    const chaves = chavesDe(medico);
    const contas = new Map<number, number>();
    for (const a of assinaturas) {
      if (!chaves.has(normalizarNomeMedico(a.nome))) continue;
      contas.set(a.idMobilemed, (contas.get(a.idMobilemed) ?? 0) + a.laudos);
    }
    return { medico, chaves, contas };
  });
  const medicosDaConta = new Map<number, number>();
  for (const { contas } of lidos) {
    for (const id of contas.keys()) medicosDaConta.set(id, (medicosDaConta.get(id) ?? 0) + 1);
  }

  const resultado: ResultadoPorLaudos = { gravar: [], pendencias: [] };
  for (const { medico, chaves, contas } of lidos) {
    const pendente = (situacao: string) => resultado.pendencias.push({ medico, situacao, contas });
    if (contas.size === 0) {
      pendente('sem laudos com conta');
      continue;
    }
    if (contas.size > 1) {
      pendente(`${contas.size} contas para o mesmo nome`);
      continue;
    }
    const [[idMobilemed, laudos]] = [...contas] as [[number, number]];
    const dono = donos.get(idMobilemed);
    const outrosNomes = [...(nomesDaConta.get(idMobilemed) ?? [])]
      .filter(([chave]) => !chaves.has(chave))
      .map(([, nome]) => nome);
    if (dono) pendente(`conta ${idMobilemed} já é de ${dono}`);
    else if ((medicosDaConta.get(idMobilemed) ?? 0) > 1) {
      pendente(`conta ${idMobilemed} casa com mais de um médico`);
    } else if (outrosNomes.length) {
      pendente(`conta ${idMobilemed} também assina como ${outrosNomes.join(', ')}`);
    } else if (laudos < MINIMO_EXAMES) pendente(`poucos laudos (${laudos} < ${MINIMO_EXAMES})`);
    else resultado.gravar.push({ medico, idMobilemed, laudos });
  }
  return resultado;
}
