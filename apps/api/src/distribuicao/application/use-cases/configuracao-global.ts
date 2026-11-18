import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import {
  CONFIGURACAO_INICIAL,
  type ConfiguracaoGlobal,
  normalizarConfiguracao,
  validarConfiguracaoGlobal,
} from '../../domain/configuracao-global';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { ConfiguracaoDistribuicaoRepository } from '../ports/configuracao-distribuicao.repository';
import { diferenca, exigirReferencias, ordenados } from '../referencias';

/** Listas de ids em ordem fixa: comparar e gravar não depende da ordem em que vieram. */
const canonica = (c: ConfiguracaoGlobal): ConfiguracaoGlobal => ({
  ...c,
  prioridadeIdsUrgentes: ordenados(c.prioridadeIdsUrgentes),
  turnosPosteriores: c.turnosPosteriores && {
    ...c.turnosPosteriores,
    turnoIds: ordenados(c.turnosPosteriores.turnoIds),
  },
  lista: { ...c.lista, prioridadeIds: ordenados(c.lista.prioridadeIds) },
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

  async executar(ator: Ator, entrada: ConfiguracaoGlobal): Promise<void> {
    const nova = canonica(normalizarConfiguracao(entrada));
    validarConfiguracaoGlobal(nova);
    await exigirReferencias(this.cadastros, {
      prioridade: [...nova.prioridadeIdsUrgentes, ...nova.lista.prioridadeIds],
      turno: nova.turnosPosteriores?.turnoIds ?? [],
    });
    const atual = canonica((await this.repo.obter()) ?? CONFIGURACAO_INICIAL);
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
