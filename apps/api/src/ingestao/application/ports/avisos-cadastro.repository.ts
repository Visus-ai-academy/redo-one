import type { CompetenciasAviso } from '../../../comum/avisos/registro-avisos';
import type { PendenciaCadastro, TipoAviso } from '../../domain/preparar-laudo';

export const AVISOS_CADASTRO_REPOSITORY = Symbol('AVISOS_CADASTRO_REPOSITORY');

/** Pendência da importação com quantos laudos e quais competências ela pegou. */
export type PendenciaRegistrada = PendenciaCadastro & {
  ocorrencias: number;
  competencias?: CompetenciasAviso | null;
};

export interface AvisosCadastroRepository {
  /**
   * Cria ou atualiza os avisos das pendências (o ignorado continua ignorado) e marca como
   * resolvidos os pendentes que esta importação conferiu no cadastro. Sem importação (null), quem
   * registra é a rodada da distribuição.
   */
  registrar(
    importacaoId: string | null,
    pendencias: PendenciaRegistrada[],
    conferidos: { tipo: TipoAviso; chave: string }[],
    agora: Date,
  ): Promise<void>;
}
