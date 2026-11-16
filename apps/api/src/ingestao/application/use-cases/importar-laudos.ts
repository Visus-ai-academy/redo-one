import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import type { Celula } from '../../domain/celulas';
import { converterLinha } from '../../domain/linha-planilha';
import { planejarImportacao } from '../../domain/planejar-importacao';
import {
  type LaudoPreparado,
  type PendenciaCadastro,
  prepararLaudo,
  type TipoAviso,
} from '../../domain/preparar-laudo';
import type { AvisosCadastroRepository } from '../ports/avisos-cadastro.repository';
import type { LeitorCadastrosIngestao } from '../ports/cadastros-ingestao';
import type { CompetenciasBloqueadas } from '../ports/competencias-bloqueadas';
import type { ImportacoesRepository, ResultadoImportacao } from '../ports/importacoes.repository';
import type { JanelaLaudos, LaudosRepository } from '../ports/laudos.repository';
import { type LeitorPlanilha, PlanilhaInvalidaError } from '../ports/leitor-planilha';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';
import type { Pseudonimizador } from '../ports/pseudonimizador';

/** Quantos erros de linha ficam guardados na importação (o total vai em `invalidas`). */
const MAXIMO_ERROS_GUARDADOS = 20;

/**
 * Importa a planilha de laudos de uma importação (job `ingestao.importar`): lê o arquivo do
 * storage, prepara cada linha, compara com a janela que o arquivo cobre e grava inserções,
 * atualizações e remoções, os totais e os avisos de cadastro. Idempotente: rodar de novo o mesmo
 * arquivo não muda nada.
 */
export class ImportarLaudos {
  constructor(
    private readonly importacoes: ImportacoesRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly leitor: LeitorPlanilha,
    private readonly cadastros: LeitorCadastrosIngestao,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly laudos: LaudosRepository,
    private readonly avisos: AvisosCadastroRepository,
    private readonly parametros: ParametrosIngestaoRepository,
    private readonly pseudonimizador: Pseudonimizador,
    private readonly agora: () => Date,
  ) {}

  async executar(importacaoId: string): Promise<void> {
    const importacao = await this.importacoes.iniciar(importacaoId, this.agora());
    if (!importacao) return;
    try {
      const resultado = await this.processar(importacaoId, importacao.arquivoChave);
      await this.importacoes.finalizar(importacaoId, resultado.status, resultado, this.agora());
    } catch (erro) {
      const esperado = erro instanceof PlanilhaInvalidaError;
      // Erro inesperado: a mensagem crua pode trazer dado da planilha, então fica genérica.
      const mensagem = esperado
        ? (erro as Error).message
        : 'Erro inesperado ao processar a importação. Tente enviar de novo.';
      await this.importacoes.finalizar(importacaoId, 'erro', { mensagem }, this.agora());
      if (!esperado) throw erro;
    }
  }

  private async processar(importacaoId: string, arquivoChave: string) {
    const planilha = await this.leitor.ler(await this.armazenamento.ler(arquivoChave));
    const [cadastros, bloqueadas, parametros] = await Promise.all([
      this.cadastros.carregar(),
      this.competencias.listar(),
      this.parametros.obter(),
    ]);
    const competenciasBloqueadas = new Set(bloqueadas);
    const origem = planilha.formato === 'compartilhamento' ? 'compartilhamento' : 'normal';
    const pseudonimo = (texto: string) => this.pseudonimizador.pseudonimo(texto);

    const preparados: LaudoPreparado[] = [];
    const linhasBrutas = new Map<string, Record<string, Celula>>();
    const pendencias = new Map<string, PendenciaCadastro & { ocorrencias: number }>();
    const conferidos = new Map<string, { tipo: TipoAviso; chave: string }>();
    const errosLinhas: { linha: number; mensagem: string }[] = [];
    let invalidas = 0;
    let ignoradasCompetenciaFechada = 0;

    for (const { numero, registro } of planilha.linhas) {
      let preparo: ReturnType<typeof prepararLaudo>;
      try {
        preparo = prepararLaudo(converterLinha(registro), origem, cadastros, pseudonimo);
      } catch (erro) {
        invalidas++;
        if (errosLinhas.length < MAXIMO_ERROS_GUARDADOS) {
          errosLinhas.push({ linha: numero, mensagem: (erro as Error).message });
        }
        continue;
      }
      if (competenciasBloqueadas.has(preparo.laudo.competencia)) {
        ignoradasCompetenciaFechada++;
        continue;
      }
      preparados.push(preparo.laudo);
      linhasBrutas.set(preparo.laudo.identidade, registro);
      for (const p of preparo.pendencias) {
        const k = `${p.tipo}:${p.chave}`;
        pendencias.set(k, { ...p, ocorrencias: (pendencias.get(k)?.ocorrencias ?? 0) + 1 });
      }
      for (const c of preparo.conferidos) conferidos.set(`${c.tipo}:${c.chave}`, c);
    }

    const resultado: ResultadoImportacao & { status: 'concluida' | 'recusada' | 'erro' } = {
      status: 'concluida',
      formato: planilha.formato,
      linhasArquivo: planilha.linhas.length,
      invalidas,
      ignoradasCompetenciaFechada,
      errosLinhas,
    };
    if (preparados.length === 0) {
      return {
        ...resultado,
        status: 'erro' as const,
        mensagem: 'Nenhuma linha válida na planilha.',
      };
    }

    const dias = preparados.map((l) => l.diaLaudo).sort();
    const janela: JanelaLaudos = {
      origem,
      inicio: dias[0] ?? '',
      fim: dias[dias.length - 1] ?? '',
      empresas:
        origem === 'compartilhamento'
          ? [...new Set(preparados.map((l) => l.empresaOrigem))]
          : undefined,
      competenciasBloqueadas: bloqueadas,
    };
    const plano = planejarImportacao(preparados, await this.laudos.existentesNaJanela(janela), {
      minimo: parametros.travaRemocaoMinimo,
      fator: parametros.travaRemocaoFator,
    });
    Object.assign(resultado, {
      janelaInicio: janela.inicio,
      janelaFim: janela.fim,
      inseridos: plano.inserir.length,
      atualizados: plano.atualizar.length,
      inalterados: plano.inalterados,
      removidos: plano.remover.length,
    });
    if (plano.recusa) return { ...resultado, status: 'recusada' as const, mensagem: plano.recusa };

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
      },
      this.agora(),
    );
    await this.avisos.registrar(
      importacaoId,
      [...pendencias.values()],
      [...conferidos.values()],
      this.agora(),
    );
    return resultado;
  }
}
