import type {
  ContasPorUnidade,
  LeituraContasUnidade,
} from '../../application/ports/contas-por-unidade';

/** Quem sabe ler a lista de médicos de uma unidade (o adaptador real ou o fake da MobileMed). */
export interface FonteMedicosUnidade {
  medicosDaUnidade(unidade: number): Promise<{ id: number }[]>;
}

const MIN = 60_000;

/**
 * As listas de médicos por unidade guardadas na memória do processo, com a hora da leitura: a que
 * está dentro da validade vale; a vencida ou nunca lida é lida na fonte, uma por vez (o cliente da
 * MobileMed já limita a concorrência e o freio). A leitura que falha não é guardada. Reiniciar a
 * API esvazia tudo.
 */
export class ContasPorUnidadeEmMemoria implements ContasPorUnidade {
  private readonly listas = new Map<number, { em: number; contas: ReadonlySet<number> }>();

  constructor(
    private readonly fonte: FonteMedicosUnidade,
    private readonly agora: () => Date,
  ) {}

  async liberadas(unidades: readonly number[], validadeMin: number): Promise<LeituraContasUnidade> {
    const porUnidade = new Map<number, ReadonlySet<number>>();
    const falharam: number[] = [];
    let lidasAgora = 0;
    for (const unidade of new Set(unidades)) {
      const guardada = this.listas.get(unidade);
      const agora = this.agora().getTime();
      if (guardada && validadeMin > 0 && agora - guardada.em < validadeMin * MIN) {
        porUnidade.set(unidade, guardada.contas);
        continue;
      }
      try {
        const contas = new Set((await this.fonte.medicosDaUnidade(unidade)).map((m) => m.id));
        lidasAgora++;
        this.listas.set(unidade, { em: agora, contas });
        porUnidade.set(unidade, contas);
      } catch {
        // Sem a lista, a proposta não filtra esta unidade; a execução confere ao vivo.
        falharam.push(unidade);
      }
    }
    return { porUnidade, falharam, lidasAgora };
  }
}
