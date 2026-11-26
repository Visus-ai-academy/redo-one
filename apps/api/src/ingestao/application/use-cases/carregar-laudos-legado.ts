import type { Celula } from '../../domain/celulas';
import type { PeriodoDias } from '../../domain/periodo-mobilemed';
import type { LaudoPreparado, OrigemLaudo } from '../../domain/preparar-laudo';
import type { AvisosCadastroRepository } from '../ports/avisos-cadastro.repository';
import type { LeitorCadastrosIngestao } from '../ports/cadastros-ingestao';
import type { CompetenciasBloqueadas } from '../ports/competencias-bloqueadas';
import type { LeitorCortesCompetencia } from '../ports/cortes-competencia';
import type { ImportacoesRepository } from '../ports/importacoes.repository';
import type { LaudosRepository } from '../ports/laudos.repository';
import type { ParametrosIngestaoRepository } from '../ports/parametros-ingestao.repository';
import type { Pseudonimizador } from '../ports/pseudonimizador';
import type { LeitorTipificacao } from '../ports/tipificacao-laudos';
import { classificar, prepararLinhas, soUnidadesAceitas } from '../preparar-linhas';

/** Linhas do dashboards-one (a linha crua da MobileMed que ele guardou), competências e dias lidos. */
export interface PedidoCargaLegado {
  linhas: { numero: number; registro: Record<string, Celula> }[];
  /** Só os laudos cuja competência, calculada pelo redo-one, está aqui entram. */
  competencias: string[];
  /** Dias do laudo (Brasília) que as linhas cobrem; fica registrado na carga. */
  janela: PeriodoDias;
  /** Sem gravar, só conta o que entraria. */
  gravar: boolean;
}

export interface ResumoCargaLegado {
  importacaoId: string | null;
  linhas: number;
  /** Linhas de compartilhamento de unidade que a importação não aceita. */
  unidadesRecusadas: number;
  invalidas: number;
  errosLinhas: { linha: number; mensagem: string }[];
  /** Laudos de competência fora das pedidas. */
  foraDasCompetencias: number;
  /** Laudos que já estão no redo-one (pela identidade): ficam como estão. */
  jaGravados: number;
  /** Laudos que entrariam (os que não estão no redo-one). */
  novos: number;
  inseridos: number;
  porCompetencia: Record<string, { inseridos: number; jaGravados: number }>;
  pendencias: number;
}

/** A linha crua do relatório de compartilhamento traz o destino (CRD_APOIO). */
const origemDoRegistro = (l: { registro: Record<string, Celula> }): OrigemLaudo =>
  'COMPARTILHAMENTO_ENVIADO_PARA' in l.registro ? 'compartilhamento' : 'normal';

/**
 * Carga dos laudos do dashboards-one: as linhas cruas da MobileMed que ele guardou passam pelo
 * mesmo preparo da importação (cadastros, competência, volume, cliente e unidade, peças da quebra,
 * tipificação, avisos de cadastro) e só os laudos que o redo-one ainda não tem entram. Nunca
 * atualiza nem remove: o laudo já gravado, em qualquer competência, fica como está. Grava também na
 * competência fechada pedida, sem mudar o demonstrativo fechado nem a trava dela (a importação
 * continua sem mexer nela). Idempotente: de novo, nada entra.
 */
export class CarregarLaudosLegado {
  constructor(
    private readonly importacoes: ImportacoesRepository,
    private readonly cadastros: LeitorCadastrosIngestao,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly cortesCompetencia: LeitorCortesCompetencia,
    private readonly tipificacao: LeitorTipificacao,
    private readonly laudos: LaudosRepository,
    private readonly avisos: AvisosCadastroRepository,
    private readonly parametros: ParametrosIngestaoRepository,
    private readonly pseudonimizador: Pseudonimizador,
    private readonly agora: () => Date,
  ) {}

  async executar(pedido: PedidoCargaLegado): Promise<ResumoCargaLegado> {
    const parametros = await this.parametros.obter();
    const aceitas = soUnidadesAceitas(
      pedido.linhas,
      origemDoRegistro,
      parametros.mobilemedCompartilhamentoUnidades,
    );
    const [cadastros, cortes, tipificar] = await Promise.all([
      this.cadastros.carregar(),
      this.cortesCompetencia.carregar(),
      this.tipificacao.carregar(),
    ]);
    const pedidas = new Set(pedido.competencias);
    const preparo = prepararLinhas(
      aceitas,
      origemDoRegistro,
      { cadastros, cortes, pseudonimo: (texto) => this.pseudonimizador.pseudonimo(texto) },
      (competencia) => !pedidas.has(competencia),
    );

    // A mesma identidade duas vezes nas linhas: vale a primeira.
    const vistas = new Set<string>();
    const unicos = preparo.preparados.filter(
      (l) => !vistas.has(l.identidade) && vistas.add(l.identidade),
    );
    const gravados = await this.laudos.identidadesGravadas(unicos.map((l) => l.identidade));
    const novos = unicos.filter((l) => !gravados.has(l.identidade));

    const resumo: ResumoCargaLegado = {
      importacaoId: null,
      linhas: pedido.linhas.length,
      unidadesRecusadas: pedido.linhas.length - aceitas.length,
      invalidas: preparo.invalidas,
      errosLinhas: preparo.errosLinhas,
      foraDasCompetencias: preparo.ignoradas.size,
      jaGravados: gravados.size,
      novos: novos.length,
      inseridos: 0,
      porCompetencia: {},
      pendencias: preparo.pendencias.length,
    };
    if (!pedido.gravar) return resumo;

    const agora = this.agora();
    const importacaoId = await this.importacoes.registrarCargaLegado({
      janela: pedido.janela,
      agora,
    });
    resumo.importacaoId = importacaoId;
    try {
      await this.competencias.garantir([...new Set(novos.map((l) => l.competencia))].sort());
      resumo.inseridos = await this.laudos.inserirNovos(
        importacaoId,
        {
          inserir: novos,
          linhasBrutas: new Map(
            novos.flatMap((l) => {
              const r = preparo.linhasBrutas.get(l.identidade);
              return r ? [[l.identidade, r] as const] : [];
            }),
          ),
          pacientes: new Map(
            novos.flatMap((l) => (l.paciente ? [[l.identidade, l.paciente] as const] : [])),
          ),
          classificacoes: classificar(novos, tipificar),
        },
        agora,
      );
      resumo.porCompetencia = porCompetencia(novos, unicos, gravados);
      await this.avisos.registrar(importacaoId, preparo.pendencias, preparo.conferidos, agora);
      await this.importacoes.finalizar(
        importacaoId,
        'concluida',
        {
          formato: 'laudos',
          janelaInicio: pedido.janela.inicio,
          janelaFim: pedido.janela.fim,
          linhasArquivo: pedido.linhas.length,
          inseridos: resumo.inseridos,
          atualizados: 0,
          inalterados: resumo.jaGravados,
          removidos: 0,
          invalidas: resumo.invalidas,
          ignoradasCompetenciaFechada: 0,
          errosLinhas: resumo.errosLinhas,
          mensagem: `Carga do dashboards-one das competências ${pedido.competencias.join(', ')}: ${resumo.foraDasCompetencias} laudo(s) de outras competências e ${resumo.unidadesRecusadas} de unidade de compartilhamento não aceita ficaram de fora.`,
        },
        this.agora(),
      );
    } catch (erro) {
      await this.importacoes.finalizar(
        importacaoId,
        'erro',
        { mensagem: 'Erro inesperado na carga dos laudos do dashboards-one.' },
        this.agora(),
      );
      throw erro;
    }
    return resumo;
  }
}

function porCompetencia(
  novos: LaudoPreparado[],
  unicos: LaudoPreparado[],
  gravados: ReadonlySet<string>,
): ResumoCargaLegado['porCompetencia'] {
  const saida: ResumoCargaLegado['porCompetencia'] = {};
  const de = (c: string) => {
    saida[c] ??= { inseridos: 0, jaGravados: 0 };
    return saida[c];
  };
  for (const l of novos) de(l.competencia).inseridos++;
  for (const l of unicos) if (gravados.has(l.identidade)) de(l.competencia).jaGravados++;
  return saida;
}
