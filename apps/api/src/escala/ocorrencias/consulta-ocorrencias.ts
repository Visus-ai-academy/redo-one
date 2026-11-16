import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../identidade/clock';
import {
  AUSENCIA_COBERTURA,
  adicionarDias,
  conflitosDoMedico,
  diaEmBrasilia,
  expandirOcorrencias,
  type Ocorrencia,
} from '../domain';
import { type EscopoEscala, estaNoEscopo } from '../escopo/escopo';
import { CARREGADOR_ESCALA, type CarregadorEscala } from './carregador-escala';

/**
 * Ocorrências da escala (plantão de um médico num dia) para outros contextos: distribuição, portal,
 * indicadores. Carrega o que a expansão precisa e devolve as ocorrências com os nomes.
 */
export const OCORRENCIAS_ESCALA = Symbol('OCORRENCIAS_ESCALA');

export interface FiltrosOcorrencias {
  medicoId?: string;
  /** Vazio ou ausente = todos. */
  turnoIds?: readonly string[];
  /** Vazio ou ausente = todas. */
  frenteIds?: readonly string[];
  /** Recorte da gestora; `null` ou ausente = sem recorte. */
  escopo?: EscopoEscala | null;
}

/** Ponta da ligação titular ↔ cobertura. */
export interface VinculoDaCobertura {
  alocacaoId: string;
  medicoId: string;
  medicoNome: string;
}

export interface OcorrenciaDetalhada
  extends Omit<Ocorrencia, 'prioridadeIds' | 'subespecialidadeIds'> {
  prioridadeIds: string[];
  subespecialidadeIds: string[];
  medicoNome: string;
  turnoNome: string;
  turnoCor: string | null;
  turnoOrdem: number;
  frenteRotulo: string;
  frenteCor: string | null;
  frenteOrdem: number;
  /** Nulo sem ausência ou quando a marca é a cobertura (`tipoAusenciaId = 'cobertura'`). */
  tipoAusenciaNome: string | null;
  tipoAusenciaCor: string | null;
  /** Nesta cobertura: o titular. */
  coberturaDe: VinculoDaCobertura | null;
  /** No titular coberto neste dia: quem cobre. */
  cobertoPor: VinculoDaCobertura | null;
}

/** Uma ponta do conflito, com o que a tela precisa para descrevê-la. */
export interface PlantaoEmConflito {
  alocacaoId: string;
  data: string;
  turnoId: string;
  turnoNome: string;
  frenteId: string;
  frenteRotulo: string;
  inicio: string;
  fim: string;
}

/** Dois plantões do mesmo médico com horários sobrepostos (aviso, não bloqueia). */
export interface ConflitoEscala {
  medicoId: string;
  medicoNome: string;
  /** Dia do plantão que começa primeiro. */
  data: string;
  a: PlantaoEmConflito;
  b: PlantaoEmConflito;
}

export interface ResultadoOcorrencias {
  ocorrencias: OcorrenciaDetalhada[];
  conflitos: ConflitoEscala[];
}

export interface ConsultaOcorrencias {
  /**
   * Janela [de, ate] em dias de Brasília ("YYYY-MM-DD"), até o limite da expansão. Traz também os
   * plantões de `de` − 1 ainda em curso à meia-noite de `de` (`doDiaAnterior: true`). Inativos
   * (médico, turno, frente) não geram ocorrência de hoje em diante; antes de hoje, sim.
   */
  listar(de: string, ate: string, filtros?: FiltrosOcorrencias): Promise<ResultadoOcorrencias>;
}

@Injectable()
export class ConsultaOcorrenciasEscala implements ConsultaOcorrencias {
  constructor(
    @Inject(CARREGADOR_ESCALA) private readonly carregador: CarregadorEscala,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(
    de: string,
    ate: string,
    filtros: FiltrosOcorrencias = {},
  ): Promise<ResultadoOcorrencias> {
    // Desde o dia anterior: o plantão que vira a meia-noite ainda está em curso no começo de `de`.
    const dados = await this.carregador.carregar(adicionarDias(de, -1), ate);
    const ocorrencias = expandirOcorrencias({
      de,
      ate,
      hoje: diaEmBrasilia(this.clock.now()),
      alocacoes: dados.alocacoes,
      turnos: dados.turnos,
      frentes: dados.frentes,
      medicosAtivos: dados.medicos.filter((m) => m.ativo).map((m) => m.id),
      ausencias: dados.ausencias,
      tiposAusencia: dados.tiposAusencia,
      ajustes: dados.ajustes,
    });

    const turnos = new Map(dados.turnos.map((t) => [t.id, t]));
    const frentes = new Map(dados.frentes.map((f) => [f.id, f]));
    const nomes = new Map(dados.medicos.map((m) => [m.id, m.nome]));
    const tipos = new Map(dados.tiposAusencia.map((t) => [t.id, t]));
    const medicoDaAlocacao = new Map(dados.alocacoes.map((a) => [a.id, a.medicoId]));
    const vinculo = (alocacaoId: string | null): VinculoDaCobertura | null => {
      if (alocacaoId === null) return null;
      const medicoId = medicoDaAlocacao.get(alocacaoId) ?? '';
      return { alocacaoId, medicoId, medicoNome: nomes.get(medicoId) ?? '' };
    };

    const turnoIds = new Set(filtros.turnoIds ?? []);
    const frenteIds = new Set(filtros.frenteIds ?? []);
    const escolhidas = ocorrencias.filter(
      (o) =>
        (!filtros.medicoId || o.medicoId === filtros.medicoId) &&
        (turnoIds.size === 0 || turnoIds.has(o.turnoId)) &&
        (frenteIds.size === 0 || frenteIds.has(o.frenteId)) &&
        estaNoEscopo(filtros.escopo ?? null, o),
    );

    const detalhadas = escolhidas.map((o): OcorrenciaDetalhada => {
      const turno = turnos.get(o.turnoId);
      const frente = frentes.get(o.frenteId);
      const tipo =
        o.tipoAusenciaId && o.tipoAusenciaId !== AUSENCIA_COBERTURA
          ? tipos.get(o.tipoAusenciaId)
          : undefined;
      return {
        ...o,
        prioridadeIds: [...o.prioridadeIds],
        subespecialidadeIds: [...o.subespecialidadeIds],
        medicoNome: nomes.get(o.medicoId) ?? '',
        turnoNome: turno?.nome ?? '',
        turnoCor: turno?.cor ?? null,
        turnoOrdem: turno?.ordem ?? 0,
        frenteRotulo: frente?.rotulo ?? '',
        frenteCor: frente?.cor ?? null,
        frenteOrdem: frente?.ordem ?? 0,
        tipoAusenciaNome: tipo?.nome ?? null,
        tipoAusenciaCor: tipo?.cor ?? null,
        coberturaDe: vinculo(o.coberturaDeId),
        cobertoPor: vinculo(o.cobertoPorAlocacaoId),
      };
    });

    const plantao = (o: OcorrenciaDetalhada): PlantaoEmConflito => ({
      alocacaoId: o.alocacaoId,
      data: o.data,
      turnoId: o.turnoId,
      turnoNome: o.turnoNome,
      frenteId: o.frenteId,
      frenteRotulo: o.frenteRotulo,
      inicio: o.inicio,
      fim: o.fim,
    });
    const conflitos = conflitosDoMedico(detalhadas).map((c) => ({
      medicoId: c.medicoId,
      medicoNome: c.a.medicoNome,
      data: c.a.data,
      a: plantao(c.a),
      b: plantao(c.b),
    }));

    return { ocorrencias: detalhadas, conflitos };
  }
}
