import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import {
  CONFIGURACAO_INICIAL,
  type ConfiguracaoGlobal,
  type EdicaoConfiguracaoGlobal,
  normalizarConfiguracao,
  validarConfiguracaoGlobal,
} from '../../domain/configuracao-global';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { ConfiguracaoDistribuicaoRepository } from '../ports/configuracao-distribuicao.repository';
import { diferenca, exigirReferencias, ordenados } from '../referencias';

/** Listas de ids em ordem fixa: comparar e gravar não depende da ordem em que vieram. */
const canonica = (c: ConfiguracaoGlobal): ConfiguracaoGlobal => ({
  ...c,
  turnosPosteriores: c.turnosPosteriores && {
    ...c.turnosPosteriores,
    turnoIds: ordenados(c.turnosPosteriores.turnoIds),
  },
});

/** Configurações › Distribuição. Sem nada salvo, a inicial. */
export class ObterConfiguracaoGlobal {
  constructor(private readonly repo: ConfiguracaoDistribuicaoRepository) {}

  async executar(): Promise<ConfiguracaoGlobal> {
    return (await this.repo.obter()) ?? CONFIGURACAO_INICIAL;
  }
}

/** Troca a configuração inteira, com auditoria dos campos que mudaram. */
export class DefinirConfiguracaoGlobal {
  constructor(
    private readonly repo: ConfiguracaoDistribuicaoRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, entrada: EdicaoConfiguracaoGlobal): Promise<void> {
    const atual = canonica((await this.repo.obter()) ?? CONFIGURACAO_INICIAL);
    const nova = canonica(
      normalizarConfiguracao({
        ...entrada,
        roboAtivo: entrada.roboAtivo ?? atual.roboAtivo,
        expiracaoPropostaMin: entrada.expiracaoPropostaMin ?? atual.expiracaoPropostaMin,
        tetoPorRodada:
          entrada.tetoPorRodada === undefined ? atual.tetoPorRodada : entrada.tetoPorRodada,
      }),
    );
    validarConfiguracaoGlobal(nova);
    await exigirReferencias(this.cadastros, {
      turno: nova.turnosPosteriores?.turnoIds ?? [],
    });
    const mudancas = diferenca({ ...atual }, { ...nova });
    if (!mudancas) return;
    await this.repo.salvar(nova);
    await this.auditoria.registrar({
      ator,
      entidade: 'configuracao_distribuicao',
      entidadeId: 'global',
      acao: 'alterado',
      antes: mudancas.antes,
      depois: mudancas.depois,
      em: this.agora(),
    });
  }
}
