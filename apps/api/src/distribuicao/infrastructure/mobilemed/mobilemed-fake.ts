import type {
  AtribuidorExames,
  LoteAtribuicao,
  PedidoAtribuicao,
  ResultadoAtribuicao,
} from '../../application/ports/atribuidor-exames';
import type {
  ExameComDono,
  ExameDaFila,
  ExameEmMaos,
  FilaExames,
  LeituraFila,
} from '../../application/ports/fila-exames';
import type { UnidadeConta } from '../../domain/rodada/contas-fora-da-unidade';
import { type AmostraCatalogo, gerarFilaSintetica } from './fila-sintetica';

export interface OpcoesMobileMedFake {
  /** Exames na fila sem médico (`DISTRIBUICAO_FAKE_TAMANHO`). */
  tamanho: number;
  semente: number;
  /** % dos exames que falham na 1ª tentativa, retentáveis (`DISTRIBUICAO_FAKE_FALHAS_PCT`). */
  falhasPct: number;
  /**
   * % dos exames que, ao serem conferidos (a retomada confere antes de atribuir), já ganharam médico
   * por fora do robô (`DISTRIBUICAO_FAKE_POR_FORA_PCT`).
   */
  porForaPct?: number;
  /**
   * % dos exames com médico que ele já abriu (LAUDANDO): não são recolhidos e prendem o pacote
   * (`DISTRIBUICAO_FAKE_ABERTOS_PCT`).
   */
  abertosPct?: number;
  /**
   * % dos pares unidade × conta em que a conta do médico NÃO está liberada na unidade: a
   * atribuição pula com `medico_fora_da_unidade` (`DISTRIBUICAO_FAKE_FORA_UNIDADE_PCT`).
   */
  foraDaUnidadePct?: number;
  /**
   * Espera de cada leitura da lista de médicos de uma unidade, para medir o efeito da memória
   * entre rodadas (`DISTRIBUICAO_FAKE_LATENCIA_UNIDADE_MS`, padrão 0).
   */
  latenciaUnidadeMs?: number;
}

/** Conta na MobileMed de "alguém de fora" (um médico que pegou o exame sem o robô). */
const CONTA_DE_FORA = 0;

const HORA = 3_600_000;

/** Hash pequeno e estável do id, para escolher as falhas sem sorteio. */
const hashDo = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Id estável da unidade a partir do nome (a fila sintética só tem o nome). */
const idDaUnidade = (nome: string) => 1_000 + (hashDo(`unidade:${nome}`) % 100_000);

/**
 * MobileMed de mentira, na memória do processo: a fila é a sintética (refeita a cada hora, para os
 * prazos acompanharem o relógio) e a atribuição só registra quem recebeu o quê. As entregas do robô
 * gravadas no banco (designações executadas) contam como atribuídas, para os exames entregues por
 * rodadas anteriores seguirem com o médico depois de reiniciar a API (e poderem ser recolhidos).
 * Nada sai do processo; nenhum exame chega a médico de verdade.
 */
export class MobileMedFake implements FilaExames, AtribuidorExames {
  private readonly atribuidos = new Map<string, number>();
  private readonly tentativas = new Map<string, number>();
  /** Quantas vezes a lista de médicos de uma unidade foi "consultada" (uma por unidade e lote). */
  consultasUnidade = 0;
  private amostra: AmostraCatalogo | null = null;

  constructor(
    private readonly carregarAmostra: () => Promise<AmostraCatalogo>,
    private readonly agora: () => Date,
    private readonly opcoes: OpcoesMobileMedFake,
  ) {}

  private statusDe(idExame: string): string {
    const pct = this.opcoes.abertosPct ?? 0;
    return pct > 0 && hashDo(`aberto:${idExame}`) % 100 < pct ? 'LAUDANDO' : 'NOVO';
  }

  async ler(): Promise<LeituraFila> {
    const amostra = await this.carregarAmostra();
    this.amostra = amostra;
    const base = new Date(Math.floor(this.agora().getTime() / HORA) * HORA);
    const { semMedico, emMaos } = gerarFilaSintetica({
      amostra,
      tamanho: this.opcoes.tamanho,
      semente: this.opcoes.semente,
      base,
    });
    // As entregas gravadas primeiro; o que este processo atribuiu depois vale por cima.
    const donos = new Map<string, number>([
      ...(amostra.entregues ?? []).map((e) => [e.idExame, e.medicoIdMobilemed] as const),
      ...this.atribuidos,
    ]);
    const comDono = (e: ExameEmMaos | ExameDaFila): ExameEmMaos => ({
      idExame: e.idExame,
      unidadeMobilemed: idDaUnidade(e.unidade),
      nomeUnidadeMobilemed: e.unidade,
      medicoIdMobilemed:
        donos.get(e.idExame) ?? ('medicoIdMobilemed' in e ? e.medicoIdMobilemed : 0),
      status: this.statusDe(e.idExame),
      prioridade: e.prioridade,
      estudo: e.estudo,
      unidade: e.unidade,
      modalidade: e.modalidade,
      especialidade: e.especialidade,
      laudos: e.laudos,
      realizadoEm: e.realizadoEm,
      entradaEm: e.entradaEm,
      prazo: e.prazo,
      paciente: e.paciente,
    });
    return {
      semMedico: semMedico
        .filter((e) => !donos.has(e.idExame))
        .map((e) => ({
          ...e,
          unidadeMobilemed: idDaUnidade(e.unidade),
          nomeUnidadeMobilemed: e.unidade,
        })),
      emMaos: [...emMaos, ...semMedico.filter((e) => donos.has(e.idExame))].map(comDono),
    };
  }

  async nomesPacientes(idsExame: readonly string[]): Promise<Map<string, string>> {
    const pedidos = new Set(idsExame);
    const { semMedico, emMaos } = await this.ler();
    return new Map(
      [...semMedico, ...emMaos]
        .filter((e) => pedidos.has(e.idExame))
        .map((e) => [e.idExame, e.paciente.nome]),
    );
  }

  async intocados(exames: readonly ExameComDono[]): Promise<Set<string>> {
    const pct = this.opcoes.porForaPct ?? 0;
    for (const { idExame: id, medicoIdMobilemed } of exames) {
      // O hash deslocado não coincide com o das falhas.
      if (
        medicoIdMobilemed === null &&
        pct > 0 &&
        hashDo(`fora:${id}`) % 100 < pct &&
        !this.atribuidos.has(id)
      ) {
        this.atribuidos.set(id, CONTA_DE_FORA);
      }
    }
    const { semMedico, emMaos } = await this.ler();
    const livres = new Set(semMedico.map((e) => e.idExame));
    const comMedico = new Map(
      emMaos.filter((e) => e.status === 'NOVO').map((e) => [e.idExame, e.medicoIdMobilemed]),
    );
    return new Set(
      exames
        .filter((e) =>
          e.medicoIdMobilemed === null
            ? livres.has(e.idExame)
            : comMedico.get(e.idExame) === e.medicoIdMobilemed,
        )
        .map((e) => e.idExame),
    );
  }

  /** A conta está liberada na unidade? Estável por unidade × conta, sem sorteio. */
  liberada(unidade: number, conta: number): boolean {
    const pct = this.opcoes.foraDaUnidadePct ?? 0;
    return pct <= 0 || hashDo(`unidade:${unidade}|${conta}`) % 100 >= pct;
  }

  atribuir(pedido: PedidoAtribuicao): Promise<ResultadoAtribuicao> {
    return this.lote().atribuir(pedido);
  }

  /** As contas da amostra liberadas na unidade (a lista que a MobileMed devolveria). */
  async medicosDaUnidade(unidade: number): Promise<{ id: number; nome: string }[]> {
    const espera = this.opcoes.latenciaUnidadeMs ?? 0;
    if (espera > 0) await new Promise((pronto) => setTimeout(pronto, espera));
    // A amostra da última leitura da fila (recarregar o catálogo a cada unidade seria lento).
    this.amostra ??= await this.carregarAmostra();
    return this.amostra.medicosMobilemed
      .filter((conta) => this.liberada(unidade, conta))
      .map((id) => ({ id, nome: `Conta ${id}` }));
  }

  lote(): LoteAtribuicao {
    const consultadas = new Set<number>();
    return {
      atribuir: async (pedido) => {
        const { semMedico, emMaos } = await this.ler();
        const e = [...semMedico, ...emMaos].find((x) => x.idExame === pedido.idExame);
        const unidade = e?.unidadeMobilemed;
        if (unidade != null && !consultadas.has(unidade)) {
          consultadas.add(unidade);
          this.consultasUnidade++;
        }
        return this.atribuirNaUnidade(
          pedido,
          unidade == null ? null : { id: unidade, nome: e?.nomeUnidadeMobilemed ?? null },
        );
      },
    };
  }

  private async atribuirNaUnidade(
    pedido: PedidoAtribuicao,
    unidade: UnidadeConta | null,
  ): Promise<ResultadoAtribuicao> {
    const intocado = (
      await this.intocados([
        { idExame: pedido.idExame, medicoIdMobilemed: pedido.deMedicoIdMobilemed },
      ])
    ).has(pedido.idExame);
    if (!intocado) {
      return pedido.deMedicoIdMobilemed === null
        ? {
            status: 'pulada',
            motivo: 'saiu_da_fila',
            detalhe: 'MobileMed: o exame não está mais sem médico.',
            retentavel: false,
          }
        : {
            status: 'pulada',
            motivo: 'mudou_de_dono',
            detalhe:
              'MobileMed: o exame já foi aberto ou trocado de médico desde que foi recolhido.',
            retentavel: false,
          };
    }
    if (unidade && !this.liberada(unidade.id, pedido.medicoIdMobilemed)) {
      return {
        status: 'pulada',
        motivo: 'medico_fora_da_unidade',
        detalhe: 'Conta do médico não liberada nesta unidade na MobileMed (simulada).',
        retentavel: false,
        unidade,
      };
    }
    const tentativa = (this.tentativas.get(pedido.idExame) ?? 0) + 1;
    this.tentativas.set(pedido.idExame, tentativa);
    if (tentativa === 1 && hashDo(pedido.idExame) % 100 < this.opcoes.falhasPct) {
      return {
        status: 'falhou',
        motivo: 'sessao_caiu',
        detalhe: 'MobileMed (simulada): a sessão caiu no meio da atribuição.',
        retentavel: true,
      };
    }
    this.atribuidos.set(pedido.idExame, pedido.medicoIdMobilemed);
    return { status: 'executada' };
  }
}
