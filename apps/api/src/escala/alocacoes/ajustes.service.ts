import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../identidade/clock';
import { EscalaInvalidaError, validarData, validarProdutividade } from '../domain';
import { ESCOPO_ESCALA_REPOSITORY, type EscopoEscalaRepository } from '../escopo/escopo';
import { ALOCACOES_REPOSITORY, type AlocacoesRepository } from './alocacoes.repository';
import { alocacaoNoEscopo, ehDiaDePlantao, escopoDo } from './apoio';
import { type AtorEscala, EventosEscala } from './eventos';

export interface EntradaAjuste {
  /** Nulo remove o ajuste: o dia volta à produtividade da escala. */
  produtividade: number | null;
  observacoes?: string | null;
}

const formatarData = (data: string) => data.split('-').reverse().join('/');

/**
 * Produtividade de um dia só de uma alocação, sem mexer na escala.
 * Fonte: dashboards-one `escala-hierarquica.ts` `definirAjusteProdutividade` (:1587-1638), que
 * aceitava qualquer data; aqui o dia precisa ser de plantão do vínculo.
 */
@Injectable()
export class AjustesProdutividadeService {
  constructor(
    @Inject(ALOCACOES_REPOSITORY) private readonly repo: AlocacoesRepository,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async definir(
    ator: AtorEscala,
    alocacaoId: string,
    data: string,
    entrada: EntradaAjuste,
  ): Promise<void> {
    const alocacao = await alocacaoNoEscopo(
      this.repo,
      await escopoDo(this.escopos, ator),
      alocacaoId,
    );
    if (alocacao.gratificado) {
      throw new EscalaInvalidaError('Na escala gratificada a produtividade é a cota do período.');
    }
    const dia = validarData(data);
    const existente = await this.repo.ajuste(alocacao.id, dia);
    const eventos = new EventosEscala(ator, this.clock.now());

    if (entrada.produtividade === null) {
      // Remover não exige que o dia ainda seja de plantão: a escala pode ter mudado depois.
      if (existente) {
        await this.repo.removerAjuste(existente.id, [eventos.ajusteRemovido(existente, alocacao)]);
      }
      return;
    }

    const produtividade = validarProdutividade(entrada.produtividade) as number;
    if (!(await ehDiaDePlantao(this.repo, alocacao, dia))) {
      throw new EscalaInvalidaError(
        `${formatarData(dia)} não é dia de plantão deste vínculo. Escolha um dia da escala.`,
      );
    }
    const ajuste = {
      id: existente?.id ?? randomUUID(),
      alocacaoId: alocacao.id,
      data: dia,
      produtividade,
      observacoes: entrada.observacoes?.trim() || null,
    };
    const evento = existente
      ? eventos.ajusteAlterado(existente, ajuste, alocacao)
      : eventos.ajusteCriado(ajuste, alocacao);
    await this.repo.salvarAjuste(ajuste, evento ? [evento] : []);
  }
}
