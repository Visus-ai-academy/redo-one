import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../identidade/clock';
import type { AlocacaoGravada, TurnoParaAlocar } from '../alocacoes/alocacoes.repository';
import { type AvisoConflito, avisosDaAlocacao, escopoDo, exigirNoEscopo } from '../alocacoes/apoio';
import { type AtorEscala, EventosEscala } from '../alocacoes/eventos';
import { EscalaInvalidaError, validarAlocacao, validarData } from '../domain';
import {
  type CelulaEscalaFixa,
  celulasDaGrade,
  ehAlocacaoDaGrade,
  type PlanoEscalaFixa,
  planejarEscalaFixa,
  validarCelulas,
} from '../domain/escala-fixa';
import {
  ESCOPO_ESCALA_REPOSITORY,
  type EscopoEscala,
  type EscopoEscalaRepository,
  estaNoEscopo,
} from '../escopo/escopo';
import { type ConsultaOcorrencias, OCORRENCIAS_ESCALA } from '../ocorrencias/consulta-ocorrencias';
import {
  type AlocacaoFixa,
  ESCALA_FIXA_REPOSITORY,
  type EscalaFixaRepository,
} from './escala-fixa.repository';

export interface EscalaFixa {
  medicoId: string;
  frenteId: string;
  celulas: CelulaEscalaFixa[];
  /** Fixas do médico na frente com regra especial: continuam valendo e a grade não as toca. */
  foraDaGrade: number;
}

export interface EntradaEscalaFixa {
  frenteId: string;
  aPartirDe: string;
  celulas: CelulaEscalaFixa[];
}

export interface ResultadoEscalaFixa {
  criadas: number;
  encerradas: number;
  removidas: number;
  mantidas: number;
  avisos: AvisoConflito[];
}

/**
 * "Montar escala do médico": a grade turnos × dias de um médico numa frente. Ler abre as fixas da
 * grade em células; salvar compara com elas (`planejarEscalaFixa`) e grava tudo numa transação,
 * com auditoria. Só as alocações do recorte da gestora entram, nos dois sentidos.
 */
@Injectable()
export class EscalaFixaService {
  constructor(
    @Inject(ESCALA_FIXA_REPOSITORY) private readonly repo: EscalaFixaRepository,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(OCORRENCIAS_ESCALA) private readonly consulta: ConsultaOcorrencias,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async obter(ator: AtorEscala, medicoId: string, frenteId: string): Promise<EscalaFixa> {
    const escopo = await escopoDo(this.escopos, ator);
    const { daGrade, foraDaGrade } = separar(
      await this.repo.fixasDoMedico(medicoId, frenteId),
      escopo,
    );
    return { medicoId, frenteId, celulas: celulasDaGrade(daGrade), foraDaGrade };
  }

  async definir(
    ator: AtorEscala,
    medicoId: string,
    entrada: EntradaEscalaFixa,
  ): Promise<ResultadoEscalaFixa> {
    const escopo = await escopoDo(this.escopos, ator);
    const aPartirDe = validarData(entrada.aPartirDe);
    validarCelulas(entrada.celulas);
    for (const c of entrada.celulas) exigirNoEscopo(escopo, { ...c, frenteId: entrada.frenteId });
    const turnos = await this.turnosDaFrente(entrada.celulas, entrada.frenteId);
    await this.exigirMedico(medicoId, entrada.celulas.length > 0);

    let plano: PlanoEscalaFixa = { manter: [], criar: [], encerrar: [], remover: [] };
    let criadas: AlocacaoGravada[] = [];
    const eventos = new EventosEscala(ator, this.clock.now());
    await this.repo.definir(
      medicoId,
      entrada.frenteId,
      (fixas) => {
        plano = planejarEscalaFixa(separar(fixas, escopo).daGrade, entrada.celulas, aPartirDe);
        criadas = plano.criar.map((grupo) => {
          const turno = turnos.get(grupo.turnoId) as TurnoParaAlocar;
          return {
            id: randomUUID(),
            medicoId,
            turnoId: grupo.turnoId,
            frenteId: entrada.frenteId,
            ...validarAlocacao(
              { ...grupo, vigencia: 'fixa', todasSemanas: true, dataInicio: aPartirDe },
              turno,
            ),
            // A grade só tem alocação sem recorte (ver `ehAlocacaoDaGrade`).
            todasPrioridades: true,
            todosSegmentos: true,
            subespecialidadeGeral: false,
            prioridadeIds: [],
            subespecialidadeIds: [],
            coberturaDeId: null,
            observacoes: null,
          };
        });
        return { criar: criadas, encerrar: plano.encerrar, remover: plano.remover };
      },
      (gravado) => {
        const porId = new Map(gravado.removidas.map((a) => [a.id, a]));
        return [
          ...gravado.removidas.map((a) => eventos.alocacaoRemovida(a)),
          ...gravado.ajustesRemovidos.flatMap((aj) => {
            const alocacao = porId.get(aj.alocacaoId);
            return alocacao ? [eventos.ajusteRemovido(aj, alocacao)] : [];
          }),
          ...gravado.encerradas.map((e) => eventos.alocacaoEncerrada(e.antes, e.depois)),
          ...gravado.criadas.map((a) => eventos.alocacaoCriada(a)),
        ];
      },
    );

    return {
      criadas: criadas.length,
      encerradas: plano.encerrar.length,
      removidas: plano.remover.length,
      mantidas: plano.manter.length,
      avisos: await this.avisos(criadas, escopo),
    };
  }

  /** Avisos de sobreposição das criadas; o mesmo conflito entre duas criadas vem uma vez. */
  private async avisos(criadas: AlocacaoGravada[], escopo: EscopoEscala | null) {
    const unicos = new Map<string, AvisoConflito>();
    for (const alocacao of criadas) {
      for (const aviso of await avisosDaAlocacao(this.consulta, this.clock, alocacao, escopo)) {
        unicos.set(JSON.stringify(aviso), aviso);
      }
    }
    return [...unicos.values()];
  }

  private async turnosDaFrente(celulas: CelulaEscalaFixa[], frenteId: string) {
    const turnos = new Map<string, TurnoParaAlocar>();
    for (const turnoId of new Set(celulas.map((c) => c.turnoId))) {
      const turno = await this.repo.turno(turnoId);
      if (!turno) throw new EscalaInvalidaError('Turno não encontrado.');
      if (!turno.frenteIds.includes(frenteId)) {
        throw new EscalaInvalidaError(
          `Esta frente não está no turno ${turno.nome}. Cadastre a frente no turno antes de escalar.`,
        );
      }
      turnos.set(turnoId, turno);
    }
    return turnos;
  }

  /** O médico precisa existir; ativo só para escalar (esvaziar a grade de um inativo pode). */
  private async exigirMedico(medicoId: string, vaiEscalar: boolean) {
    const medico = await this.repo.medico(medicoId);
    if (!medico) throw new EscalaInvalidaError('Médico não encontrado.');
    if (vaiEscalar && !medico.ativo) {
      throw new EscalaInvalidaError(
        'Médico inativo não pode ser escalado. Reative o cadastro antes.',
      );
    }
  }
}

/** As fixas do recorte, separadas entre as da grade e as com regra especial (só contadas). */
function separar(fixas: AlocacaoFixa[], escopo: EscopoEscala | null) {
  const noRecorte = fixas.filter((a) => estaNoEscopo(escopo, a));
  const daGrade = noRecorte.filter((a) => ehAlocacaoDaGrade(a, a.horarioDoTurno));
  return { daGrade, foraDaGrade: noRecorte.length - daGrade.length };
}
