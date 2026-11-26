import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import { planejarImportacao } from '../../domain/planejar-importacao';
import type { AvisosCadastroRepository } from '../ports/avisos-cadastro.repository';
import type { LeitorCadastrosIngestao } from '../ports/cadastros-ingestao';
import type { CompetenciasBloqueadas } from '../ports/competencias-bloqueadas';
import type { LeitorCortesCompetencia } from '../ports/cortes-competencia';
import type {
  ImportacaoParaProcessar,
  ImportacoesRepository,
  ResultadoImportacao,
} from '../ports/importacoes.repository';
import type { JanelaLaudos, LaudosRepository } from '../ports/laudos.repository';
import { type LeitorPlanilha, PlanilhaInvalidaError } from '../ports/leitor-planilha';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';
import type { Pseudonimizador } from '../ports/pseudonimizador';
import { type RelatorioMobileMed, RelatorioMobileMedError } from '../ports/relatorio-mobilemed';
import type { LeitorTipificacao } from '../ports/tipificacao-laudos';
import { classificar, prepararLinhas, soUnidadesAceitas } from '../preparar-linhas';

/**
 * Importa os laudos de uma importação (job `ingestao.importar`): lê a planilha do storage (upload)
 * ou o relatório da MobileMed do período, prepara cada linha, compara com a janela coberta e grava
 * inserções, atualizações e remoções, os totais e os avisos de cadastro. Idempotente: rodar de
 * novo o mesmo arquivo (ou o mesmo relatório) não muda nada.
 */
export class ImportarLaudos {
  constructor(
    private readonly importacoes: ImportacoesRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly leitor: LeitorPlanilha,
    private readonly cadastros: LeitorCadastrosIngestao,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly cortesCompetencia: LeitorCortesCompetencia,
    private readonly tipificacao: LeitorTipificacao,
    private readonly laudos: LaudosRepository,
    private readonly avisos: AvisosCadastroRepository,
    private readonly parametros: ParametrosIngestaoRepository,
    private readonly pseudonimizador: Pseudonimizador,
    private readonly relatorio: RelatorioMobileMed,
    private readonly agora: () => Date,
  ) {}

  async executar(importacaoId: string): Promise<void> {
    const importacao = await this.importacoes.iniciar(importacaoId, this.agora());
    if (!importacao) return;
    try {
      const resultado = await this.processar(importacao);
      await this.importacoes.finalizar(importacaoId, resultado.status, resultado, this.agora());
    } catch (erro) {
      const esperado =
        erro instanceof PlanilhaInvalidaError || erro instanceof RelatorioMobileMedError;
      // Erro inesperado: a mensagem crua pode trazer dado da planilha, então fica genérica.
      const mensagem = esperado
        ? (erro as Error).message
        : 'Erro inesperado ao processar a importação. Tente enviar de novo.';
      await this.importacoes.finalizar(importacaoId, 'erro', { mensagem }, this.agora());
      if (!esperado) throw erro;
    }
  }

  private async processar(importacao: ImportacaoParaProcessar) {
    const importacaoId = importacao.id;
    const parametros = await this.parametros.obter();
    const lida =
      importacao.origem === 'mobilemed'
        ? await this.relatorio.buscar(importacao.formato, importacao.periodo, {
            janelaDias: parametros.mobilemedJanelaDias,
            teto: parametros.mobilemedTeto,
          })
        : await this.leitor.ler(await this.armazenamento.ler(importacao.arquivoChave));
    const origem = lida.formato === 'compartilhamento' ? 'compartilhamento' : 'normal';
    const planilha =
      importacao.origem === 'mobilemed'
        ? {
            ...lida,
            linhas: soUnidadesAceitas(
              lida.linhas,
              () => origem,
              parametros.mobilemedCompartilhamentoUnidades,
            ),
          }
        : lida;
    const [cadastros, bloqueadas, cortes, tipificar] = await Promise.all([
      this.cadastros.carregar(),
      this.competencias.listar(),
      this.cortesCompetencia.carregar(),
      this.tipificacao.carregar(),
    ]);
    const competenciasBloqueadas = new Set(bloqueadas);
    // As linhas cuja competência calculada está bloqueada ficam de fora: o gravado fica como está.
    const { preparados, linhasBrutas, pendencias, conferidos, errosLinhas, invalidas, ignoradas } =
      prepararLinhas(
        planilha.linhas,
        () => origem,
        { cadastros, cortes, pseudonimo: (texto) => this.pseudonimizador.pseudonimo(texto) },
        (competencia) => competenciasBloqueadas.has(competencia),
      );

    const resultado: ResultadoImportacao & { status: 'concluida' | 'recusada' | 'erro' } = {
      status: 'concluida',
      formato: planilha.formato,
      linhasArquivo: planilha.linhas.length,
      invalidas,
      ignoradasCompetenciaFechada: ignoradas.size,
      errosLinhas,
    };
    if (preparados.length === 0) {
      const mensagem =
        importacao.origem === 'mobilemed' && planilha.linhas.length === 0
          ? 'A MobileMed não trouxe nenhum laudo no período. Nada foi removido.'
          : 'Nenhuma linha válida na planilha.';
      return { ...resultado, status: 'erro' as const, mensagem };
    }

    // A MobileMed cobre o período pedido inteiro; a planilha, os dias que ela traz.
    const dias = preparados.map((l) => l.diaLaudo).sort();
    const janela: JanelaLaudos = {
      origem,
      inicio: importacao.origem === 'mobilemed' ? importacao.periodo.inicio : (dias[0] ?? ''),
      fim:
        importacao.origem === 'mobilemed' ? importacao.periodo.fim : (dias[dias.length - 1] ?? ''),
      empresas:
        origem === 'compartilhamento'
          ? [...new Set(preparados.map((l) => l.empresaOrigem))]
          : undefined,
      competenciasBloqueadas: bloqueadas,
    };
    const plano = planejarImportacao(
      preparados,
      await this.laudos.existentesNaJanela(janela),
      { minimo: parametros.travaRemocaoMinimo, fator: parametros.travaRemocaoFator },
      { competencias: competenciasBloqueadas, identidadesIgnoradas: ignoradas },
    );
    Object.assign(resultado, {
      // As da competência calculada bloqueada e as do laudo gravado numa bloqueada.
      ignoradasCompetenciaFechada: ignoradas.size + plano.ignoradasBloqueada,
      janelaInicio: janela.inicio,
      janelaFim: janela.fim,
      inseridos: plano.inserir.length,
      atualizados: plano.atualizar.length,
      inalterados: plano.inalterados,
      removidos: plano.remover.length,
    });
    if (plano.recusa) return { ...resultado, status: 'recusada' as const, mensagem: plano.recusa };

    // A linha da competência antes dos laudos: se a gravação cair, a retentativa vê os laudos como
    // inalterados, e a competência ficaria sem linha (sem como fechar). Só as dos laudos gravados.
    const gravados = [...plano.inserir, ...plano.atualizar].map((l) => l.competencia);
    await this.competencias.garantir([...new Set(gravados)].sort());
    const alterados = new Set([...plano.inserir, ...plano.atualizar].map((l) => l.identidade));
    await this.laudos.aplicar(
      importacaoId,
      janela,
      {
        inserir: plano.inserir,
        atualizar: plano.atualizar,
        remover: plano.remover,
        linhasBrutas: new Map(
          [...linhasBrutas].filter(([identidade]) => alterados.has(identidade)),
        ),
        idsMedico: new Map(
          plano.idsMedico.map((l) => [
            l.identidade,
            {
              medicoIdMobilemed: l.medicoIdMobilemed,
              medicoReassinaturaIdMobilemed: l.medicoReassinaturaIdMobilemed,
            },
          ]),
        ),
        pacientes: new Map(
          plano.pacientes.flatMap((l) => (l.paciente ? [[l.identidade, l.paciente] as const] : [])),
        ),
        // Todos os da janela: a configuração mudada chega também aos laudos que não mudaram.
        classificacoes: classificar(preparados, tipificar),
      },
      this.agora(),
    );
    await this.avisos.registrar(importacaoId, pendencias, conferidos, this.agora());
    return resultado;
  }
}
