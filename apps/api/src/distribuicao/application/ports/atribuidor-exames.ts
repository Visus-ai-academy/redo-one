export const ATRIBUIDOR_EXAMES = Symbol('ATRIBUIDOR_EXAMES');

export interface PedidoAtribuicao {
  /** Id do exame na MobileMed. */
  idExame: string;
  /** Conta do médico na MobileMed (`medicos.id_mobilemed`). */
  medicoIdMobilemed: number;
  /**
   * Recolhido: a conta de quem tinha o exame; a MobileMed só troca se ele segue com esse médico e
   * NOVO. Null = o exame estava sem médico.
   */
  deMedicoIdMobilemed: number | null;
}

/**
 * O que a MobileMed respondeu para um exame. `pulada`: a MobileMed recusou de propósito (o exame
 * já tem médico, saiu da fila); `falhou`: erro de comunicação ou da MobileMed. `retentavel` diz se
 * vale tentar de novo ao retomar a rodada (sessão caiu, tempo esgotado): só o adaptador sabe.
 */
export type ResultadoAtribuicao =
  | { status: 'executada' }
  | {
      status: 'pulada' | 'falhou';
      /** Código curto (ex.: `ja_tem_medico`, `sessao_caiu`). */
      motivo: string;
      /** Texto para a pessoa, dizendo que a falha veio da MobileMed; nunca com dado de paciente. */
      detalhe: string | null;
      retentavel: boolean;
    };

/**
 * Atribuição do exame ao médico na MobileMed, um por vez (a execução confere a pausa entre um e
 * outro). Adaptadores em `infrastructure/mobilemed`: o fake (padrão, só registra na memória) e o
 * real (`DISTRIBUICAO_MOBILEMED=real`: `PUT /exame` com o corpo mínimo, conferindo antes e
 * relendo depois).
 */
export interface AtribuidorExames extends LoteAtribuicao {
  /**
   * Um lote de atribuições (uma execução da rodada): o que o adaptador confere uma vez por unidade
   * (a lista de médicos liberados nela na MobileMed) vale até o fim do lote, sem consultar a cada
   * exame. Fora do lote, `atribuir` confere tudo de novo.
   */
  lote(): LoteAtribuicao;
}

export interface LoteAtribuicao {
  atribuir(pedido: PedidoAtribuicao): Promise<ResultadoAtribuicao>;
}
