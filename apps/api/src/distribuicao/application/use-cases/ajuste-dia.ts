import { randomUUID } from 'node:crypto';

import type { Auditoria } from '../../../auditoria/auditoria';
import {
  type AjusteDiaDistribuicao,
  type AjusteDiaEdicao,
  ajusteVazio,
  canonicaAjuste,
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
  listaSegueSla: a.listaSegueSla,
  clienteId: a.clienteId,
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

/**
 * Cria, troca ou remove (ajuste vazio) o ajuste da distribuição de uma alocação num dia, com
 * auditoria. A ação fica na tela Escala, com o recorte da gestora.
 */
export class DefinirAjusteDia {
  constructor(
    private readonly repo: AjustesDiaRepository,
    private readonly escala: EscalaDoAjuste,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(
    ator: AtorEscala,
    alocacaoId: string,
    data: string,
    entrada: AjusteDiaEdicao,
  ): Promise<void> {
    validarData(data);
    const alocacao = await alocacaoNoRecorte(this.escala, ator, alocacaoId);
    const edicao = canonicaAjuste(entrada);
    validarAjusteDia(edicao);
    const lido = await this.repo.obter(alocacaoId, data);
    const existente: AjusteDiaDistribuicao | null = lido && {
      id: lido.id,
      alocacaoId: lido.alocacaoId,
      data: lido.data,
      prioridadeIdsLiberadas: lido.prioridadeIdsLiberadas,
      listaSegueSla: lido.listaSegueSla,
      clienteId: lido.clienteId,
    };
    const registrar = (
      acao: string,
      antes?: Record<string, unknown>,
      depois?: Record<string, unknown>,
      id?: string,
    ) =>
      this.auditoria.registrar({
        ator: { tipo: 'usuario', id: ator.usuarioId },
        entidade: 'ajuste_dia_distribuicao',
        entidadeId: id ?? existente?.id ?? '',
        acao,
        ...(antes ? { antes } : {}),
        ...(depois ? { depois } : {}),
        em: this.agora(),
      });

    if (ajusteVazio(edicao)) {
      // Remover não exige que o dia ainda seja de plantão: a escala pode ter mudado depois.
      if (existente) {
        await this.repo.remover(existente.id);
        await registrar('excluido', foto(existente, alocacao));
      }
      return;
    }

    if (!(await this.escala.ehDiaDePlantao(alocacaoId, data))) {
      invalida(`${formatar(data)} não é dia de plantão deste vínculo. Escolha um dia da escala.`);
    }
    await exigirReferencias(this.cadastros, {
      prioridade: edicao.prioridadeIdsLiberadas,
      cliente: edicao.clienteId ? [edicao.clienteId] : [],
    });
    const novo: AjusteDiaDistribuicao = {
      id: existente?.id ?? randomUUID(),
      alocacaoId,
      data,
      prioridadeIdsLiberadas: edicao.prioridadeIdsLiberadas,
      listaSegueSla: edicao.listaSegueSla,
      clienteId: edicao.clienteId,
    };
    if (!existente) {
      await this.repo.salvar(novo);
      await registrar('criado', undefined, foto(novo, alocacao), novo.id);
      return;
    }
    const mudancas = diferenca(foto(canonicaAjuste(existente), alocacao), foto(novo, alocacao));
    if (!mudancas) return;
    await this.repo.salvar(novo);
    await registrar('alterado', mudancas.antes, {
      ...mudancas.depois,
      alocacaoId,
      data,
      medicoId: alocacao.medicoId,
      turnoId: alocacao.turnoId,
      frenteId: alocacao.frenteId,
    });
  }
}
