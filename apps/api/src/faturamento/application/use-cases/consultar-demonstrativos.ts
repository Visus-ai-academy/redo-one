import type { Paginacao } from '../../../catalogo/comum/paginacao';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import {
  type AjusteDoLaudo,
  montarDemonstrativos,
  type RastroLaudo,
} from '../../domain/demonstrativo';
import { exigirCompetencia } from '../../domain/vigencia-corte';
import type {
  DemonstrativoDetalhado,
  DemonstrativosRepository,
  ResumoDemonstrativo,
  TotaisCompetencia,
} from '../ports/demonstrativos.repository';
import type { EntradasDemonstrativo, LaudoLocalizado } from '../ports/entradas-demonstrativo';

export class DemonstrativoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor(o = 'Demonstrativo') {
    super(`${o} não encontrado.`);
  }
}

/** Os demonstrativos vigentes da competência (pelo nome do cliente) e os totais dela. */
export class ListarDemonstrativos {
  constructor(private readonly repo: DemonstrativosRepository) {}

  async executar(
    competencia: string,
    paginacao: Paginacao,
  ): Promise<{ itens: ResumoDemonstrativo[]; total: number; totais: TotaisCompetencia }> {
    exigirCompetencia(competencia);
    const [pagina, totais] = await Promise.all([
      this.repo.listar(competencia, paginacao),
      this.repo.totais(competencia),
    ]);
    return { ...pagina, totais };
  }
}

/** O demonstrativo do cliente (o vigente ou a versão pedida), com os itens e todas as versões. */
export class ObterDemonstrativo {
  constructor(private readonly repo: DemonstrativosRepository) {}

  async executar(
    competencia: string,
    clienteId: string,
    versao?: number,
  ): Promise<{ demonstrativo: DemonstrativoDetalhado; versoes: ResumoDemonstrativo[] }> {
    exigirCompetencia(competencia);
    const [demonstrativo, versoes] = await Promise.all([
      this.repo.obter(competencia, clienteId, versao),
      this.repo.versoes(competencia, clienteId),
    ]);
    if (!demonstrativo) throw new DemonstrativoNaoEncontradoError();
    return { demonstrativo, versoes };
  }
}

export interface DetalheLaudo extends RastroLaudo {
  laudo: LaudoLocalizado;
  ajuste: AjusteDoLaudo | null;
}

/**
 * O cálculo de um laudo feito na hora, com os dados de agora (laudos do cliente dele na
 * competência, preços, parâmetros, reclassificações e ajustes): a situação e cada parcela com o
 * preço achado. Na competência fechada, mostra o que o recálculo daria, não o retrato gravado.
 */
export class DetalharLaudoDemonstrativo {
  constructor(private readonly entradas: EntradasDemonstrativo) {}

  async executar(laudoId: string): Promise<DetalheLaudo> {
    const laudo = await this.entradas.localizarLaudo(laudoId);
    if (!laudo?.clienteId) throw new DemonstrativoNaoEncontradoError('Laudo');
    const { entrada } = await this.entradas.carregar(laudo.competencia, {
      clienteId: laudo.clienteId,
    });
    const rastro = montarDemonstrativos(entrada, new Set([laudoId])).rastro.get(laudoId);
    if (!rastro) throw new DemonstrativoNaoEncontradoError('Laudo');
    return { laudo, ajuste: entrada.ajustes.get(laudoId) ?? null, ...rastro };
  }
}
