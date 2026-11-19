import { periodoMobileMed } from '../../domain/periodo-mobilemed';
import { ImportacaoMobileMedIndisponivelError } from '../erros';
import type { ImportacoesRepository } from '../ports/importacoes.repository';
import type {
  ParametrosIngestao,
  ParametrosIngestaoRepository,
} from '../ports/parametros-ingestao.repository';

/** O agendador roda a cada minuto: sem a folga, um intervalo de 30 min viraria 31. */
const FOLGA_AGENDADOR_MS = 30_000;

/**
 * Põe na fila a importação da MobileMed do período configurado: uma para os laudos (no padrão e
 * fora do padrão juntos, para a remoção da janela comparar com tudo) e outra para o
 * compartilhamento, que só reconcilia as próprias empresas. Nunca duas ao mesmo tempo.
 */
export class CriarImportacaoMobileMed {
  constructor(
    private readonly importacoes: ImportacoesRepository,
    private readonly parametros: ParametrosIngestaoRepository,
    /** `INGESTAO_MOBILEMED` ligada no ambiente. */
    readonly ligada: boolean,
    private readonly agora: () => Date,
  ) {}

  /** Chamada pelo agendador: cria se o intervalo desde a última já passou. */
  async agendada(): Promise<void> {
    if (!this.ligada) return;
    const parametros = await this.parametros.obter();
    const intervalo = parametros.mobilemedIntervaloMinutos;
    if (intervalo === null) return;
    const ultima = await this.importacoes.ultimaMobileMedEm();
    const desde = ultima ? this.agora().getTime() - ultima.getTime() : Number.POSITIVE_INFINITY;
    if (desde < intervalo * 60_000 - FOLGA_AGENDADOR_MS) return;
    await this.criar(parametros, null);
  }

  /** "Importar agora": ignora o intervalo. */
  async manual(usuarioId: string): Promise<string[]> {
    if (!this.ligada) {
      throw new ImportacaoMobileMedIndisponivelError(
        'A importação da MobileMed está desligada neste ambiente.',
      );
    }
    const ids = await this.criar(await this.parametros.obter(), usuarioId);
    if (!ids) {
      throw new ImportacaoMobileMedIndisponivelError(
        'Já há uma importação da MobileMed na fila ou em andamento.',
      );
    }
    return ids;
  }

  private criar(parametros: ParametrosIngestao, enviadaPorId: string | null) {
    return this.importacoes.criarMobileMed({
      // Sem unidades de destino, o compartilhamento fica de fora (como o RPA sem unidade).
      formatos: parametros.mobilemedCompartilhamentoUnidades.length
        ? ['laudos', 'compartilhamento']
        : ['laudos'],
      periodo: periodoMobileMed(this.agora(), parametros.mobilemedMesesAnteriores),
      enviadaPorId,
      agora: this.agora(),
    });
  }
}
