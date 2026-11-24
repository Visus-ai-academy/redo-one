import { normalizarNomeMedico } from '../comum/nome-medico';
import { DOMINANCIA, type MedicoSemConta, MINIMO_EXAMES } from './mapear-por-nome';

/** Laudos importados que um nome assinou com uma conta MobileMed (assinatura ou reassinatura). */
export interface AssinaturaNosLaudos {
  nome: string;
  idMobilemed: number;
  laudos: number;
}

/** O médico como o mapeamento o lê: a principal (se já tem) e as outras contas já gravadas. */
export interface MedicoDoMapeamento extends MedicoSemConta {
  idMobilemed: number | null;
  outrasContas: number[];
}

/** Quem já tem a conta no cadastro (como principal ou como outra conta). */
export interface DonoDaConta {
  medicoId: string;
  nome: string;
}

export interface PendenciaPorLaudos {
  medico: MedicoDoMapeamento;
  situacao: string;
  /** Conta → laudos assinados com o nome do médico. */
  contas: Map<number, number>;
}

export interface ContaSugerida {
  medico: MedicoDoMapeamento;
  idMobilemed: number;
  laudos: number;
}

export interface ResultadoPorLaudos {
  /** Conta principal para quem não tem. */
  gravar: ContaSugerida[];
  /** Outras contas do médico (além da principal). */
  extras: ContaSugerida[];
  pendencias: PendenciaPorLaudos[];
}

/**
 * Acha as contas MobileMed de cada médico pelos laudos importados, que trazem o nome e o id da
 * conta de quem assinou. Casa o nome (e os apelidos) pela grafia normalizada. Uma conta só é
 * sugerida com pelo menos `MINIMO_EXAMES` laudos, se não é de outro médico do cadastro (`donos`),
 * não assina com outro nome nem casa com outro médico desta leitura. Sem principal, a conta que
 * assina sozinha ou a dominante (`DOMINANCIA` dos laudos) vira a principal e as demais, outras
 * contas; com principal, as contas novas viram outras contas. O resto fica pendente para conferir
 * com o suporte da MobileMed.
 */
export function mapearPorLaudos(
  medicos: MedicoDoMapeamento[],
  assinaturas: AssinaturaNosLaudos[],
  donos: Map<number, DonoDaConta>,
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

  const resultado: ResultadoPorLaudos = { gravar: [], extras: [], pendencias: [] };
  for (const { medico, chaves, contas } of lidos) {
    const pendente = (situacao: string) => resultado.pendencias.push({ medico, situacao, contas });
    /** Por que a conta não pode ser sugerida a este médico; null = pode. */
    const problema = (idMobilemed: number, laudos: number): string | null => {
      const dono = donos.get(idMobilemed);
      const outrosNomes = [...(nomesDaConta.get(idMobilemed) ?? [])]
        .filter(([chave]) => !chaves.has(chave))
        .map(([, nome]) => nome);
      if (dono && dono.medicoId !== medico.id) return `já é de ${dono.nome}`;
      if ((medicosDaConta.get(idMobilemed) ?? 0) > 1) return 'casa com mais de um médico';
      if (outrosNomes.length) return `também assina como ${outrosNomes.join(', ')}`;
      if (laudos < MINIMO_EXAMES) return `poucos laudos (${laudos} < ${MINIMO_EXAMES})`;
      return null;
    };
    const sugerirExtras = (novas: [number, number][]) => {
      for (const [idMobilemed, laudos] of novas) {
        const p = problema(idMobilemed, laudos);
        if (p) pendente(`conta ${idMobilemed}: ${p}`);
        else resultado.extras.push({ medico, idMobilemed, laudos });
      }
    };

    if (medico.idMobilemed !== null) {
      const dele = new Set([medico.idMobilemed, ...medico.outrasContas]);
      sugerirExtras([...contas].filter(([id]) => !dele.has(id)));
      continue;
    }
    if (contas.size === 0) {
      pendente('sem laudos com conta');
      continue;
    }
    const ordenadas = [...contas].sort((a, b) => b[1] - a[1]);
    const total = ordenadas.reduce((soma, [, n]) => soma + n, 0);
    const [[idMobilemed, laudos], ...resto] = ordenadas as [
      [number, number],
      ...[number, number][],
    ];
    if (resto.length && laudos < total * DOMINANCIA) {
      pendente(
        `${contas.size} contas para o mesmo nome, nenhuma com ${DOMINANCIA * 100}% dos laudos`,
      );
      continue;
    }
    const p = problema(idMobilemed, laudos);
    if (p) {
      pendente(`conta ${idMobilemed}: ${p}`);
      continue;
    }
    resultado.gravar.push({ medico, idMobilemed, laudos });
    sugerirExtras(resto.filter(([id]) => !medico.outrasContas.includes(id)));
  }
  return resultado;
}
