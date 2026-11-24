/** Unidade da MobileMed cuja lista de médicos vale na atribuição. */
export interface UnidadeConta {
  id: number;
  /** Nome na MobileMed; null quando a leitura não o traz (a de destino do compartilhado). */
  nome: string | null;
}

/** Médico escalado sem conta liberada na unidade do exame: vira aviso, nada muda no cadastro. */
export interface ContaForaDaUnidade {
  /** Médico + unidade: um aviso só por par. */
  chave: string;
  /** Ex.: "Dr. Fulano sem conta liberada na unidade CEDI_RJ". */
  valor: string;
  exames: number;
}

export const chaveContaUnidade = (medicoId: string, unidade: number) => `${medicoId}|${unidade}`;

export const valorContaUnidade = (nomeMedico: string, unidade: UnidadeConta) =>
  `${nomeMedico} sem conta liberada na unidade ${unidade.nome ?? `de id ${unidade.id} na MobileMed`}`;

/**
 * Da proposta: os pares médico + unidade em que o médico só não recebeu o exame porque a conta dele
 * não está na lista da unidade (passou da escala, do arranjo, da equipe e da exclusividade), e os
 * pares conferidos (o médico passou da unidade numa lista lida), que resolvem o aviso aberto antes.
 */
export function contasForaDaUnidade(p: {
  exames: readonly {
    idExame: string;
    unidadeMobilemed?: number | null;
    nomeUnidadeMobilemed?: string | null;
  }[];
  designacoes: readonly {
    idExame: string;
    elegiveis: readonly string[];
    barrados: Readonly<Record<string, string>>;
  }[];
  /** Unidades cuja lista foi lida (memória ou agora). */
  conferidas: ReadonlySet<number>;
  /** Médico → nome, para o texto do aviso. */
  nomes: ReadonlyMap<string, string>;
}): { pendentes: ContaForaDaUnidade[]; conferidas: string[] } {
  const exames = new Map(p.exames.map((e) => [e.idExame, e]));
  const pendentes = new Map<string, ContaForaDaUnidade>();
  const conferidas = new Set<string>();
  for (const d of p.designacoes) {
    const e = exames.get(d.idExame);
    const id = e?.unidadeMobilemed;
    if (id == null || !p.conferidas.has(id)) continue;
    const unidade = { id, nome: e?.nomeUnidadeMobilemed?.trim() || null };
    for (const [medicoId, barreira] of Object.entries(d.barrados)) {
      if (barreira === 'fora_da_unidade') {
        const chave = chaveContaUnidade(medicoId, id);
        const atual = pendentes.get(chave);
        if (atual) atual.exames += 1;
        else {
          const nome = p.nomes.get(medicoId) ?? 'Médico sem nome';
          pendentes.set(chave, { chave, valor: valorContaUnidade(nome, unidade), exames: 1 });
        }
      } else if (barreira === 'ja_entregue' || barreira === 'retirado_na_conferencia') {
        conferidas.add(chaveContaUnidade(medicoId, id));
      }
    }
    for (const medicoId of d.elegiveis) conferidas.add(chaveContaUnidade(medicoId, id));
  }
  return {
    pendentes: [...pendentes.values()],
    conferidas: [...conferidas].filter((c) => !pendentes.has(c)),
  };
}
