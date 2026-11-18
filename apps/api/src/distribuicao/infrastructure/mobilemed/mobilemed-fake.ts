import type {
  AtribuidorExames,
  PedidoAtribuicao,
  ResultadoAtribuicao,
} from '../../application/ports/atribuidor-exames';
import type { FilaExames, LeituraFila } from '../../application/ports/fila-exames';
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
}

/** Conta na MobileMed de "alguém de fora" (um médico que pegou o exame sem o robô). */
const CONTA_DE_FORA = 0;

const HORA = 3_600_000;

/** Hash pequeno e estável do id, para escolher as falhas sem sorteio. */
const hashDo = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * MobileMed de mentira, na memória do processo: a fila é a sintética (refeita a cada hora, para os
 * prazos acompanharem o relógio) e a atribuição só registra quem recebeu o quê. Nada sai do
 * processo; reiniciar a API zera as atribuições.
 */
export class MobileMedFake implements FilaExames, AtribuidorExames {
  private readonly atribuidos = new Map<string, number>();
  private readonly tentativas = new Map<string, number>();

  constructor(
    private readonly carregarAmostra: () => Promise<AmostraCatalogo>,
    private readonly agora: () => Date,
    private readonly opcoes: OpcoesMobileMedFake,
  ) {}

  private async gerada(): Promise<LeituraFila> {
    const base = new Date(Math.floor(this.agora().getTime() / HORA) * HORA);
    return gerarFilaSintetica({
      amostra: await this.carregarAmostra(),
      tamanho: this.opcoes.tamanho,
      semente: this.opcoes.semente,
      base,
    });
  }

  async ler(): Promise<LeituraFila> {
    const { semMedico, emMaos } = await this.gerada();
    const atribuidos = semMedico.filter((e) => this.atribuidos.has(e.idExame));
    return {
      semMedico: semMedico.filter((e) => !this.atribuidos.has(e.idExame)),
      emMaos: [
        ...emMaos,
        ...atribuidos.map((e) => ({
          idExame: e.idExame,
          medicoIdMobilemed: this.atribuidos.get(e.idExame) ?? 0,
          estudo: e.estudo,
          unidade: e.unidade,
          modalidade: e.modalidade,
          especialidade: e.especialidade,
          laudos: e.laudos,
          paciente: e.paciente,
        })),
      ],
    };
  }

  async nomesPacientes(idsExame: readonly string[]): Promise<Map<string, string>> {
    const pedidos = new Set(idsExame);
    const { semMedico } = await this.ler();
    return new Map(
      semMedico.filter((e) => pedidos.has(e.idExame)).map((e) => [e.idExame, e.paciente.nome]),
    );
  }

  async semMedico(idsExame: readonly string[]): Promise<Set<string>> {
    const pct = this.opcoes.porForaPct ?? 0;
    for (const id of idsExame) {
      // O hash deslocado não coincide com o das falhas.
      if (pct > 0 && hashDo(`fora:${id}`) % 100 < pct && !this.atribuidos.has(id)) {
        this.atribuidos.set(id, CONTA_DE_FORA);
      }
    }
    const { semMedico } = await this.ler();
    const livres = new Set(semMedico.map((e) => e.idExame));
    return new Set(idsExame.filter((id) => livres.has(id)));
  }

  async atribuir(pedido: PedidoAtribuicao): Promise<ResultadoAtribuicao> {
    const { semMedico } = await this.ler();
    if (!semMedico.some((e) => e.idExame === pedido.idExame)) {
      return {
        status: 'pulada',
        motivo: 'saiu_da_fila',
        detalhe: 'MobileMed: o exame não está mais sem médico.',
        retentavel: false,
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
