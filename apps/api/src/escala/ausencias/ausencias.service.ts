import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';
import { CLOCK, type Clock } from '../../identidade/clock';
import {
  adicionarDias,
  aprovarAusencia,
  EscalaInvalidaError,
  recusarAusencia,
  type SituacaoAusencia,
  validarAusencia,
  validarData,
} from '../domain';
import {
  ESCOPO_ESCALA_REPOSITORY,
  type EscopoEscala,
  type EscopoEscalaRepository,
  estaNoEscopo,
} from '../escopo/escopo';
import {
  AusenciaNaoEncontradaError,
  CadastroInexistenteError,
  FrenteForaDoRecorteError,
  MedicoForaDoRecorteError,
  SemMedicoError,
  TipoAusenciaInativoError,
} from './ausencias.errors';
import {
  AUSENCIAS_REPOSITORY,
  type AusenciaDetalhada,
  type AusenciasRepository,
  type DadosAusenciaGravada,
  type NovaAusencia,
  type TipoAusenciaCadastro,
} from './ausencias.repository';
import {
  camposDeCriacao,
  camposDeRevisao,
  camposDoEvento,
  diferenca,
  eventoAusencia,
  type FotoAusencia,
} from './evento-ausencia';

/** Quem opera a tela de ausências. */
export interface Gestor {
  usuarioId: string;
  acessoTotal: boolean;
}

/** Os dados de uma ausência no formulário do gestor. */
export interface EntradaAusencia {
  tipoId: string;
  dataInicio: string;
  dataFim: string;
  /** Vazio = todas as frentes (para a gestora com recorte, as do recorte). */
  frenteIds?: string[];
  /** Vazio = o dia inteiro. */
  turnoIds?: string[];
  /** 0 = domingo … 6 = sábado. Vazio = todos. */
  diasSemana?: number[];
  observacoes?: string | null;
}

/** O formulário cria a mesma ausência para vários médicos de uma vez. */
export interface EntradaAusencias extends EntradaAusencia {
  medicoIds: string[];
}

export interface ConsultaAusencias extends Paginacao {
  situacao?: SituacaoAusencia;
  tipoId?: string;
  frenteId?: string;
  medicoId?: string;
  busca?: string;
  /** `AAAA-MM-DD`. Padrão: hoje − 30 dias (Brasília). */
  de?: string;
  ate?: string;
}

/** Quantos dias para trás a lista mostra quando não se escolhe o início. */
const DIAS_PARA_TRAS = 30;
/** Brasília não tem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const hojeEmBrasilia = (agora: Date) =>
  new Date(agora.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 10);

const texto = (valor: string | null | undefined) => valor?.trim() || null;
const ordenados = (ids: readonly string[]) => [...ids].sort();

/** Foto da ausência gravada, para a auditoria e a comparação na edição. */
export function fotoDe(a: AusenciaDetalhada): FotoAusencia {
  return {
    medicoId: a.medico.id,
    tipoId: a.tipo.id,
    dataInicio: a.dataInicio,
    dataFim: a.dataFim,
    diasSemana: [...a.diasSemana],
    frenteIds: ordenados(a.frentes.map((f) => f.id)),
    turnoIds: ordenados(a.turnos.map((t) => t.id)),
    observacoes: a.observacoes,
    situacao: a.situacao,
    origem: a.origem,
  };
}

/**
 * Ausências pela tela do gestor. A gestora com recorte só vê e mexe nas ausências de médicos com
 * alguma alocação vigente no período da ausência dentro do recorte (o dashboards-one só conferia
 * isso na escrita, e sem olhar a vigência).
 */
@Injectable()
export class AusenciasService {
  constructor(
    @Inject(AUSENCIAS_REPOSITORY) private readonly repo: AusenciasRepository,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(gestor: Gestor, consulta: ConsultaAusencias): Promise<Pagina<AusenciaDetalhada>> {
    const de = validarData(
      consulta.de ?? adicionarDias(hojeEmBrasilia(this.clock.now()), -DIAS_PARA_TRAS),
    );
    const ate = consulta.ate ? validarData(consulta.ate) : undefined;
    if (ate && ate < de) {
      throw new EscalaInvalidaError('A data inicial do período é depois da final.');
    }
    return this.repo.listar({
      ...(consulta.situacao ? { situacao: consulta.situacao } : {}),
      ...(consulta.tipoId ? { tipoId: consulta.tipoId } : {}),
      ...(consulta.frenteId ? { frenteId: consulta.frenteId } : {}),
      ...(consulta.medicoId ? { medicoId: consulta.medicoId } : {}),
      ...(consulta.busca ? { busca: consulta.busca } : {}),
      de,
      ...(ate ? { ate } : {}),
      escopo: await this.escopoDe(gestor),
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    });
  }

  async obter(gestor: Gestor, id: string): Promise<AusenciaDetalhada> {
    return this.visivel(gestor, id);
  }

  async contarPendentes(gestor: Gestor): Promise<number> {
    return this.repo.contarPendentes(await this.escopoDe(gestor));
  }

  /** Cria uma ausência aprovada por médico. Devolve os ids, na ordem dos médicos. */
  async criar(gestor: Gestor, entrada: EntradaAusencias): Promise<string[]> {
    const medicoIds = [...new Set(entrada.medicoIds)];
    if (!medicoIds.length) throw new SemMedicoError();
    if ((await this.repo.medicosExistentes(medicoIds)).length !== medicoIds.length) {
      throw new CadastroInexistenteError('medico');
    }
    const tipo = await this.tipoAtivo(entrada.tipoId);
    const validada = validarAusencia({ ...entrada, origem: 'gestor', tipo });
    await this.conferirCadastros(validada.frenteIds, validada.turnoIds);
    const frentesPorMedico = await this.frentesNoRecorte(
      await this.escopoDe(gestor),
      medicoIds,
      validada,
    );

    const em = this.clock.now();
    const novas: NovaAusencia[] = medicoIds.map((medicoId) => ({
      id: randomUUID(),
      medicoId,
      tipoId: tipo.id,
      dataInicio: validada.dataInicio,
      dataFim: validada.dataFim,
      diasSemana: validada.diasSemana,
      frenteIds: frentesPorMedico.get(medicoId) ?? ordenados(validada.frenteIds),
      turnoIds: ordenados(validada.turnoIds),
      observacoes: texto(entrada.observacoes),
      situacao: validada.situacao,
      origem: 'gestor',
      solicitadaPorId: gestor.usuarioId,
    }));
    await this.repo.criar(
      novas,
      novas.map((nova) =>
        eventoAusencia(gestor.usuarioId, nova.id, 'criada', em, {
          depois: camposDeCriacao(nova),
        }),
      ),
    );
    return novas.map((n) => n.id);
  }

  /** Edita uma ausência; o médico, a situação e a origem não mudam. */
  async atualizar(gestor: Gestor, id: string, entrada: EntradaAusencia): Promise<void> {
    const atual = await this.visivel(gestor, id);
    const tipo = await this.tipoParaEdicao(entrada.tipoId, atual.tipo.id);
    const validada = validarAusencia({ ...entrada, origem: 'gestor', tipo });
    await this.conferirCadastros(validada.frenteIds, validada.turnoIds);
    const frentes = await this.frentesNoRecorte(
      await this.escopoDe(gestor),
      [atual.medico.id],
      validada,
    );

    const antes = fotoDe(atual);
    const dados: DadosAusenciaGravada = {
      medicoId: atual.medico.id,
      tipoId: tipo.id,
      dataInicio: validada.dataInicio,
      dataFim: validada.dataFim,
      diasSemana: validada.diasSemana,
      frenteIds: frentes.get(atual.medico.id) ?? ordenados(validada.frenteIds),
      turnoIds: ordenados(validada.turnoIds),
      observacoes: texto(entrada.observacoes),
    };
    const mudanca = diferenca(antes, { ...antes, ...dados });
    if (!mudanca) return;
    await this.repo.atualizar(
      id,
      dados,
      eventoAusencia(gestor.usuarioId, id, 'alterada', this.clock.now(), mudanca),
    );
  }

  async excluir(gestor: Gestor, id: string): Promise<void> {
    const atual = await this.visivel(gestor, id);
    const evento = eventoAusencia(gestor.usuarioId, id, 'excluida', this.clock.now(), {
      antes: camposDoEvento(fotoDe(atual)),
    });
    if (!(await this.repo.excluir(id, evento))) throw new AusenciaNaoEncontradaError();
  }

  async aprovar(gestor: Gestor, id: string): Promise<void> {
    const atual = await this.visivel(gestor, id);
    const em = this.clock.now();
    const revisao = aprovarAusencia(atual, { usuarioId: gestor.usuarioId, em });
    await this.gravarRevisao(gestor, atual, revisao, em);
  }

  async recusar(gestor: Gestor, id: string, motivo: string): Promise<void> {
    const atual = await this.visivel(gestor, id);
    const em = this.clock.now();
    const revisao = recusarAusencia(atual, motivo, { usuarioId: gestor.usuarioId, em });
    await this.gravarRevisao(gestor, atual, revisao, em);
  }

  private async gravarRevisao(
    gestor: Gestor,
    atual: AusenciaDetalhada,
    revisao: Parameters<AusenciasRepository['revisar']>[1],
    em: Date,
  ) {
    const evento = eventoAusencia(
      gestor.usuarioId,
      atual.id,
      revisao.situacao === 'aprovada' ? 'aprovada' : 'recusada',
      em,
      camposDeRevisao(fotoDe(atual), revisao.situacao),
    );
    // Outra pessoa revisou entre a leitura e a escrita: mesma resposta do domínio.
    if (!(await this.repo.revisar(atual.id, revisao, evento))) {
      throw new EscalaInvalidaError('Esta solicitação já foi revisada.');
    }
  }

  private escopoDe(gestor: Gestor): Promise<EscopoEscala | null> {
    return gestor.acessoTotal ? Promise.resolve(null) : this.escopos.doUsuario(gestor.usuarioId);
  }

  /** A ausência, se existe e está no recorte de quem pede; senão, "não encontrada". */
  private async visivel(gestor: Gestor, id: string): Promise<AusenciaDetalhada> {
    const ausencia = await this.repo.buscar(id);
    if (!ausencia) throw new AusenciaNaoEncontradaError();
    const escopo = await this.escopoDe(gestor);
    if (escopo) {
      const alocacoes = await this.repo.alocacoesVigentes(
        [ausencia.medico.id],
        ausencia.dataInicio,
        ausencia.dataFim,
      );
      if (!alocacoes.some((a) => estaNoEscopo(escopo, a))) throw new AusenciaNaoEncontradaError();
    }
    return ausencia;
  }

  private async tipoAtivo(id: string): Promise<TipoAusenciaCadastro> {
    const tipo = await this.repo.tipo(id);
    if (!tipo) throw new CadastroInexistenteError('tipo');
    if (!tipo.ativo) throw new TipoAusenciaInativoError();
    return tipo;
  }

  /** Na edição, o tipo inativo que a ausência já tem continua valendo. */
  private async tipoParaEdicao(id: string, atualId: string): Promise<TipoAusenciaCadastro> {
    if (id !== atualId) return this.tipoAtivo(id);
    const tipo = await this.repo.tipo(id);
    if (!tipo) throw new CadastroInexistenteError('tipo');
    return tipo;
  }

  private async conferirCadastros(frenteIds: string[], turnoIds: string[]) {
    if ((await this.repo.frentesExistentes(frenteIds)).length !== frenteIds.length) {
      throw new CadastroInexistenteError('frente');
    }
    if ((await this.repo.turnosExistentes(turnoIds)).length !== turnoIds.length) {
      throw new CadastroInexistenteError('turno');
    }
  }

  /**
   * Recorte da gestora ao lançar: cada médico precisa de alocação vigente no período dentro do
   * recorte. As frentes liberadas para um médico são as do recorte mais as das alocações dele nos
   * turnos do recorte; "todas as frentes" vira essa lista (a ausência não pode tirar o médico de
   * frente que a gestora não coordena). Sem recorte, devolve um mapa vazio (vale o pedido).
   */
  private async frentesNoRecorte(
    escopo: EscopoEscala | null,
    medicoIds: string[],
    periodo: { dataInicio: string; dataFim: string; frenteIds: string[] },
  ): Promise<Map<string, string[]>> {
    const resultado = new Map<string, string[]>();
    if (!escopo) return resultado;
    const alocacoes = await this.repo.alocacoesVigentes(
      medicoIds,
      periodo.dataInicio,
      periodo.dataFim,
    );
    for (const medicoId of medicoIds) {
      const doMedico = alocacoes.filter((a) => a.medicoId === medicoId && estaNoEscopo(escopo, a));
      if (!doMedico.length) throw new MedicoForaDoRecorteError();
      const liberadas = new Set([
        ...escopo.frenteIds,
        ...doMedico.filter((a) => escopo.turnoIds.has(a.turnoId)).map((a) => a.frenteId),
      ]);
      if (periodo.frenteIds.some((f) => !liberadas.has(f))) throw new FrenteForaDoRecorteError();
      resultado.set(
        medicoId,
        ordenados(periodo.frenteIds.length ? periodo.frenteIds : [...liberadas]),
      );
    }
    return resultado;
  }
}
