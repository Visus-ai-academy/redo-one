import { randomUUID } from 'node:crypto';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import {
  type AjusteDiaDistribuicao,
  type AjusteDiaEdicao,
  ajusteVazio,
  ateMaximoDoAjuste,
  canonicaAjuste,
  diasDoPeriodoAjuste,
  validarAjusteDia,
} from '../../domain/ajuste-dia';
import { invalida, validarData } from '../../domain/validacao';
import { AlocacaoNaoEncontradaError } from '../erros';
import type {
  AjusteDiaLido,
  AjustesDiaRepository,
  FiltroAjustesDia,
} from '../ports/ajustes-dia.repository';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { AlocacaoDoAjuste, AtorEscala, EscalaDoAjuste } from '../ports/escala-do-ajuste';
import { diferenca, exigirReferencias } from '../referencias';

/** Até onde vai a listagem (a semana e o mês da tela Escala cabem). */
const MAX_DIAS_LISTAGEM = 42;
const DIA_MS = 86_400_000;

async function alocacaoNoRecorte(escala: EscalaDoAjuste, ator: AtorEscala, alocacaoId: string) {
  const alocacao = await escala.alocacaoNoRecorte(ator, alocacaoId);
  if (!alocacao) throw new AlocacaoNaoEncontradaError();
  return alocacao;
}

/** O evento leva médico, turno e frente: é o contexto com que o histórico da escala filtra. */
const foto = (a: AjusteDiaDistribuicao, aloc: AlocacaoDoAjuste): Record<string, unknown> => ({
  alocacaoId: a.alocacaoId,
  data: a.data,
  prioridadeIdsLiberadas: a.prioridadeIdsLiberadas,
  segueSla: a.segueSla,
  clienteId: a.clienteId,
  laudosExtra: a.laudosExtra,
  medicoId: aloc.medicoId,
  turnoId: aloc.turnoId,
  frenteId: aloc.frenteId,
});

const formatar = (data: string) => data.split('-').reverse().join('/');

/** O ajuste da distribuição de uma alocação num dia; null se não houver. */
export class ObterAjusteDia {
  constructor(
    private readonly repo: AjustesDiaRepository,
    private readonly escala: EscalaDoAjuste,
  ) {}

  async executar(
    ator: AtorEscala,
    alocacaoId: string,
    data: string,
  ): Promise<AjusteDiaLido | null> {
    validarData(data);
    await alocacaoNoRecorte(this.escala, ator, alocacaoId);
    return this.repo.obter(alocacaoId, data);
  }
}

/** Os ajustes do período que estão no recorte de quem pede. */
export class ListarAjustesDia {
  constructor(
    private readonly repo: AjustesDiaRepository,
    private readonly escala: EscalaDoAjuste,
  ) {}

  async executar(ator: AtorEscala, filtro: FiltroAjustesDia): Promise<AjusteDiaLido[]> {
    validarData(filtro.de, 'Início do período');
    validarData(filtro.ate, 'Fim do período');
    if (filtro.ate < filtro.de) invalida('O fim do período vem antes do início.');
    const dias = (Date.parse(filtro.ate) - Date.parse(filtro.de)) / DIA_MS + 1;
    if (dias > MAX_DIAS_LISTAGEM) invalida(`Escolha um período de até ${MAX_DIAS_LISTAGEM} dias.`);
    const noRecorte = await this.escala.recorteDo(ator);
    return (await this.repo.listar(filtro)).filter(noRecorte);
  }
}

/** O que a tela mostra antes de gravar com "Até": dias de plantão e quais já têm ajuste. */
export interface PeriodoAjusteDia {
  /** Dias de plantão do vínculo em [data, ate], onde o ajuste seria gravado. */
  dias: string[];
  /** Dias de [data, ate] que já têm ajuste (substituídos ao gravar, tirados ao remover). */
  diasComAjuste: string[];
  /** O último "Até" aceito a partir do dia aberto. */
  ateMaximo: string;
}

export class PreverPeriodoAjusteDia {
  constructor(
    private readonly repo: AjustesDiaRepository,
    private readonly escala: EscalaDoAjuste,
  ) {}

  async executar(
    ator: AtorEscala,
    alocacaoId: string,
    data: string,
    ate: string,
  ): Promise<PeriodoAjusteDia> {
    diasDoPeriodoAjuste(data, ate);
    await alocacaoNoRecorte(this.escala, ator, alocacaoId);
    const [dias, existentes] = await Promise.all([
      this.escala.diasDePlantao(alocacaoId, data, ate),
      this.repo.listar({ de: data, ate, alocacaoId }),
    ]);
    return {
      dias,
      diasComAjuste: existentes.map((a) => a.data).sort(),
      ateMaximo: ateMaximoDoAjuste(data),
    };
  }
}

const semLeitura = (lido: AjusteDiaLido): AjusteDiaDistribuicao => ({
  id: lido.id,
  alocacaoId: lido.alocacaoId,
  data: lido.data,
  prioridadeIdsLiberadas: lido.prioridadeIdsLiberadas,
  segueSla: lido.segueSla,
  clienteId: lido.clienteId,
  laudosExtra: lido.laudosExtra,
});

/**
 * Cria, troca ou remove (ajuste vazio) o ajuste da distribuição de uma alocação do dia aberto até
 * `ate` (padrão: só o dia). O modelo continua por dia: o mesmo ajuste é gravado em cada dia de
 * plantão do período, substituindo o que o dia já tinha, com um evento de auditoria por dia e tudo
 * numa transação só. A ação fica na tela Escala, com o recorte da gestora.
 */
export class DefinirAjusteDia {
  constructor(
    private readonly repo: AjustesDiaRepository,
    private readonly escala: EscalaDoAjuste,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly agora: () => Date,
  ) {}

  async executar(
    ator: AtorEscala,
    alocacaoId: string,
    data: string,
    entrada: AjusteDiaEdicao,
    ate: string = data,
  ): Promise<void> {
    diasDoPeriodoAjuste(data, ate);
    const alocacao = await alocacaoNoRecorte(this.escala, ator, alocacaoId);
    const edicao = canonicaAjuste(entrada);
    validarAjusteDia(edicao);
    const existentes = new Map(
      (await this.repo.listar({ de: data, ate, alocacaoId })).map((l) => [l.data, semLeitura(l)]),
    );
    const evento = (
      acao: string,
      entidadeId: string,
      antes?: Record<string, unknown>,
      depois?: Record<string, unknown>,
    ): EventoAuditoria => ({
      ator: { tipo: 'usuario', id: ator.usuarioId },
      entidade: 'ajuste_dia_distribuicao',
      entidadeId,
      acao,
      ...(antes ? { antes } : {}),
      ...(depois ? { depois } : {}),
      em: this.agora(),
    });

    if (ajusteVazio(edicao)) {
      // Remover não exige que o dia ainda seja de plantão: a escala pode ter mudado depois.
      const removidos = [...existentes.values()];
      if (!removidos.length) return;
      await this.repo.aplicar(
        { gravar: [], removerIds: removidos.map((a) => a.id) },
        removidos.map((a) => evento('excluido', a.id, foto(a, alocacao))),
      );
      return;
    }

    const dias = await this.escala.diasDePlantao(alocacaoId, data, ate);
    if (!dias.length) {
      invalida(
        ate === data
          ? `${formatar(data)} não é dia de plantão deste vínculo. Escolha um dia da escala.`
          : `Nenhum dia de plantão deste vínculo de ${formatar(data)} a ${formatar(ate)}.`,
      );
    }
    await exigirReferencias(this.cadastros, {
      prioridadeOperacao: edicao.prioridadeIdsLiberadas,
      cliente: edicao.clienteId ? [edicao.clienteId] : [],
    });
    const gravar: AjusteDiaDistribuicao[] = [];
    const eventos: EventoAuditoria[] = [];
    for (const dia of dias) {
      const existente = existentes.get(dia);
      const novo: AjusteDiaDistribuicao = {
        id: existente?.id ?? randomUUID(),
        alocacaoId,
        data: dia,
        prioridadeIdsLiberadas: edicao.prioridadeIdsLiberadas,
        segueSla: edicao.segueSla,
        clienteId: edicao.clienteId,
        laudosExtra: edicao.laudosExtra,
      };
      if (!existente) {
        gravar.push(novo);
        eventos.push(evento('criado', novo.id, undefined, foto(novo, alocacao)));
        continue;
      }
      const mudancas = diferenca(foto(canonicaAjuste(existente), alocacao), foto(novo, alocacao));
      if (!mudancas) continue;
      gravar.push(novo);
      eventos.push(
        evento('alterado', existente.id, mudancas.antes, {
          ...mudancas.depois,
          alocacaoId,
          data: dia,
          medicoId: alocacao.medicoId,
          turnoId: alocacao.turnoId,
          frenteId: alocacao.frenteId,
        }),
      );
    }
    if (gravar.length) await this.repo.aplicar({ gravar, removerIds: [] }, eventos);
  }
}
