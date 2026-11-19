import type { ConfiguracaoDistribuicaoRepository } from '../ports/configuracao-distribuicao.repository';
import type { RetratoFilaRepository } from '../ports/retrato-fila.repository';
import { configuracaoAtual, mensagemDo } from './rodadas/comum';
import type { FilaDoMomento } from './rodadas/consultas';

const MINUTO = 60_000;
/** O agendamento roda na virada do minuto e a leitura leva segundos: sem folga, pularia um ciclo. */
const FOLGA_MS = 30_000;

const maisNova = (...datas: (Date | null | undefined)[]) =>
  Math.max(0, ...datas.map((d) => d?.getTime() ?? 0));

/**
 * O job: lê a fila (a mesma conta da fila do momento) e troca o retrato. Falhou, o retrato
 * anterior fica e a falha é anotada. Devolve a mensagem da falha (null = leu) para o log.
 */
export class LerRetratoFila {
  constructor(
    private readonly montar: { executar(): Promise<FilaDoMomento> },
    private readonly repo: RetratoFilaRepository,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<string | null> {
    try {
      await this.repo.gravar(await this.montar.executar());
      return null;
    } catch (erro) {
      const mensagem = mensagemDo(erro);
      await this.repo.registrarFalha(this.agora(), mensagem);
      return mensagem;
    }
  }
}

/** "Ler agora": enfileira a leitura única (pedir de novo enquanto espera não duplica). */
export class PedirLeituraFila {
  constructor(
    private readonly repo: RetratoFilaRepository,
    private readonly agora: () => Date,
  ) {}

  executar(): Promise<void> {
    return this.repo.pedirLeitura(this.agora());
  }
}

/**
 * Roda a cada minuto: pede a leitura quando a última tentativa (leitura, falha ou pedido) tem o
 * intervalo da configuração. Desligado (null), nunca pede. Devolve se pediu.
 */
export class AgendarLeituraFila {
  constructor(
    private readonly configuracao: ConfiguracaoDistribuicaoRepository,
    private readonly repo: RetratoFilaRepository,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<boolean> {
    const { retratoFilaMin } = await configuracaoAtual({ configuracao: this.configuracao });
    if (retratoFilaMin === null) return false;
    const r = await this.repo.obter();
    const agora = this.agora();
    const ultima = maisNova(r.fila?.lidaEm, r.falhouEm, r.pedidaEm);
    if (agora.getTime() - ultima < retratoFilaMin * MINUTO - FOLGA_MS) return false;
    await this.repo.pedirLeitura(agora);
    return true;
  }
}

export interface SituacaoRetratoFila {
  /** O último retrato bom; null = a fila ainda não foi lida. */
  fila: FilaDoMomento | null;
  pedidaEm: Date | null;
  /** Há leitura pedida e ainda não terminada. */
  lendo: boolean;
  /** A última leitura falhou (o retrato é o da anterior); null = a última leu bem. */
  falha: { em: Date; erro: string } | null;
  /** O intervalo da leitura automática; null = desligada. */
  intervaloMin: number | null;
}

/** O que a tela mostra: o retrato gravado (sem ler a MobileMed) e como anda a leitura. */
export class ConsultarRetratoFila {
  constructor(
    private readonly repo: RetratoFilaRepository,
    private readonly configuracao: ConfiguracaoDistribuicaoRepository,
  ) {}

  async executar(): Promise<SituacaoRetratoFila> {
    const [r, config] = await Promise.all([
      this.repo.obter(),
      configuracaoAtual({ configuracao: this.configuracao }),
    ]);
    return {
      // Ligar ou desligar o robô vale na hora, não na próxima leitura.
      fila: r.fila && { ...r.fila, roboAtivo: config.roboAtivo },
      pedidaEm: r.pedidaEm,
      lendo: r.pedidaEm !== null && r.pedidaEm.getTime() > maisNova(r.fila?.lidaEm, r.falhouEm),
      falha: r.falhouEm ? { em: r.falhouEm, erro: r.erro ?? '' } : null,
      intervaloMin: config.retratoFilaMin,
    };
  }
}
