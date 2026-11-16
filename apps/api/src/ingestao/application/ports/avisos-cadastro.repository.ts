import type { PendenciaCadastro, TipoAviso } from '../../domain/preparar-laudo';

export const AVISOS_CADASTRO_REPOSITORY = Symbol('AVISOS_CADASTRO_REPOSITORY');

export interface AvisosCadastroRepository {
  /**
   * Cria ou atualiza os avisos das pendências (o ignorado continua ignorado) e marca como
   * resolvidos os pendentes que esta importação conferiu no cadastro.
   */
  registrar(
    importacaoId: string,
    pendencias: (PendenciaCadastro & { ocorrencias: number })[],
    conferidos: { tipo: TipoAviso; chave: string }[],
    agora: Date,
  ): Promise<void>;
}
