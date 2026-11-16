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
  AusenciaForaDoRecorteError,
  AusenciaNaoEncontradaError,
  CadastroInexistenteError,
  MedicoForaDoRecorteError,
  SemMedicoError,
  TipoAusenciaInativoError,
  TurnoOuFrenteForaDoRecorteError,
} from './ausencias.errors';
import {
  type AlocacaoDoMedico,
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
  /** Tem `ausencias.observacoes.ver` (ou acesso total): lê as observações e o motivo da recusa. */
  veObservacoes: boolean;
}

/** A ausência como sai para o gestor: sem o texto (dado de saúde) para quem não pode vê-lo. */
export type AusenciaVisivel = AusenciaDetalhada & {
  /** Há observação gravada, mesmo quando o texto não vem. */
  temObservacoes: boolean;
};

function paraQuemVe(gestor: Gestor, ausencia: AusenciaDetalhada): AusenciaVisivel {
  const temObservacoes = ausencia.observacoes !== null;
  return gestor.veObservacoes
    ? { ...ausencia, temObservacoes }
    : { ...ausencia, observacoes: null, motivoRecusa: null, temObservacoes };
}

/** Os dados de uma ausência no formulário do gestor. */
export interface EntradaAusencia {
  tipoId: string;
  dataInicio: string;
  dataFim: string;
  /**
   * Vazio = todas as frentes. Na edição, ausente (ou igual ao gravado) mantém o que está gravado.
   * Para a gestora com recorte, ver `recortar`.
   */
  frenteIds?: string[];
  /** Vazio = o dia inteiro. Na edição, ausente (ou igual ao gravado) mantém o que está gravado. */
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
const mesmos = (a: readonly string[], b: readonly string[]) =>
  new Set(a).size === new Set(b).size && a.every((id) => b.includes(id));

/** Turnos e frentes de uma ausência. Lista vazia = todos / todas. */
interface Alcance {
  turnoIds: string[];
  frenteIds: string[];
}

/**
 * A ausência cobre os pares turno × frente das duas listas (vazia = todos), e o par está no
 * recorte se o turno OU a frente estiver (`estaNoEscopo`). Todos os pares estão no recorte se, e só
 * se, todos os turnos estão no recorte ou todas as frentes estão. "Todos" / "todas" nunca está
 * contido num recorte (vale também para turno ou frente que a gestora não coordena).
 */
export function inteiraNoRecorte(escopo: EscopoEscala, alcance: Alcance): boolean {
  const contida = (ids: string[], recorte: ReadonlySet<string>) =>
    ids.length > 0 && ids.every((id) => recorte.has(id));
  return contida(alcance.turnoIds, escopo.turnoIds) || contida(alcance.frenteIds, escopo.frenteIds);
}

/**
 * Ajusta o pedido da gestora com recorte para a ausência ficar inteira no recorte, sem nunca
 * ampliar o pedido: só uma lista vazia ("todos" / "todas") é estreitada, e o que foi escolhido à
 * mão nunca muda (se não couber, recusa).
 *
 * - Já inteira no recorte: fica como pedida.
 * - Turnos vazios e o recorte tem turnos: os turnos viram todos os turnos do recorte (sem cruzar
 *   com as alocações do médico, como já se fazia com as frentes: turno sem alocação não tira o
 *   médico de nada, e a ausência continua valendo se ele for escalado ali no período).
 * - Frentes vazias e o recorte tem frentes: as frentes viram as do recorte.
 * - Se as duas servem (as duas listas vazias e o recorte tem turnos e frentes), a união dos dois
 *   alcances não cabe em duas listas; fica o dos turnos se o médico tem alocação vigente num turno
 *   do recorte, senão o das frentes (o caminho por onde ele está no recorte).
 */
export function recortar(
  escopo: EscopoEscala,
  pedido: Alcance,
  alocacoesNoRecorte: readonly AlocacaoDoMedico[],
): Alcance {
  if (inteiraNoRecorte(escopo, pedido)) return pedido;
  const pelosTurnos =
    !pedido.turnoIds.length && escopo.turnoIds.size
      ? { turnoIds: ordenados([...escopo.turnoIds]), frenteIds: pedido.frenteIds }
      : null;
  const pelasFrentes =
    !pedido.frenteIds.length && escopo.frenteIds.size
      ? { turnoIds: pedido.turnoIds, frenteIds: ordenados([...escopo.frenteIds]) }
      : null;
  const nosTurnos = alocacoesNoRecorte.some((a) => escopo.turnoIds.has(a.turnoId));
  const ajustado = nosTurnos ? (pelosTurnos ?? pelasFrentes) : (pelasFrentes ?? pelosTurnos);
  if (!ajustado) throw new TurnoOuFrenteForaDoRecorteError();
  return ajustado;
}

const ordenado = ({ turnoIds, frenteIds }: Alcance): Alcance => ({
  turnoIds: ordenados(turnoIds),
  frenteIds: ordenados(frenteIds),
});

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
 * Ausências pela tela do gestor. A gestora com recorte só vê as ausências de médicos com alguma
 * alocação vigente no período da ausência dentro do recorte (o dashboards-one só conferia isso na
 * escrita, e sem olhar a vigência); para editar, excluir, aprovar ou recusar, a ausência ainda tem
 * de valer só dentro do recorte (`inteiraNoRecorte`), e o que ela lança fica inteiro nele.
 */
@Injectable()
export class AusenciasService {
  constructor(
    @Inject(AUSENCIAS_REPOSITORY) private readonly repo: AusenciasRepository,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(gestor: Gestor, consulta: ConsultaAusencias): Promise<Pagina<AusenciaVisivel>> {
    const de = validarData(
      consulta.de ?? adicionarDias(hojeEmBrasilia(this.clock.now()), -DIAS_PARA_TRAS),
    );
    const ate = consulta.ate ? validarData(consulta.ate) : undefined;
    if (ate && ate < de) {
      throw new EscalaInvalidaError('A data inicial do período é depois da final.');
    }
    const pagina = await this.repo.listar({
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
    return { ...pagina, itens: pagina.itens.map((a) => paraQuemVe(gestor, a)) };
  }

  async obter(gestor: Gestor, id: string): Promise<AusenciaVisivel> {
    return paraQuemVe(gestor, await this.visivel(gestor, id));
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
    const alcances = await this.alcanceNoRecorte(await this.escopoDe(gestor), medicoIds, validada);

    const em = this.clock.now();
    const novas: NovaAusencia[] = medicoIds.map((medicoId) => ({
      id: randomUUID(),
      medicoId,
      tipoId: tipo.id,
      dataInicio: validada.dataInicio,
      dataFim: validada.dataFim,
      diasSemana: validada.diasSemana,
      ...ordenado(alcances.get(medicoId) ?? validada),
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

  /**
   * Edita uma ausência; o médico, a situação e a origem não mudam. Frentes e turnos que não vieram
   * (ou vieram iguais) ficam como estão. A gestora com recorte só edita a ausência inteira no
   * recorte, e o resultado também tem de ficar inteiro nele.
   */
  async atualizar(gestor: Gestor, id: string, entrada: EntradaAusencia): Promise<void> {
    const { ausencia: atual, escopo } = await this.inteiraVisivel(gestor, id);
    const antes = fotoDe(atual);
    const tipo = await this.tipoParaEdicao(entrada.tipoId, atual.tipo.id);
    const manter = (pedido: string[] | undefined, gravado: string[]) =>
      pedido === undefined || mesmos(pedido, gravado) ? gravado : pedido;
    const validada = validarAusencia({
      ...entrada,
      frenteIds: manter(entrada.frenteIds, antes.frenteIds),
      turnoIds: manter(entrada.turnoIds, antes.turnoIds),
      origem: 'gestor',
      tipo,
    });
    await this.conferirCadastros(validada.frenteIds, validada.turnoIds);
    const alcances = await this.alcanceNoRecorte(escopo, [atual.medico.id], validada);

    const dados: DadosAusenciaGravada = {
      medicoId: atual.medico.id,
      tipoId: tipo.id,
      dataInicio: validada.dataInicio,
      dataFim: validada.dataFim,
      diasSemana: validada.diasSemana,
      ...ordenado(alcances.get(atual.medico.id) ?? validada),
      // Quem não vê as observações recebeu `null` na tela: mantém a gravada.
      observacoes: gestor.veObservacoes ? texto(entrada.observacoes) : atual.observacoes,
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
    const { ausencia: atual } = await this.inteiraVisivel(gestor, id);
    const evento = eventoAusencia(gestor.usuarioId, id, 'excluida', this.clock.now(), {
      antes: camposDoEvento(fotoDe(atual)),
    });
    if (!(await this.repo.excluir(id, evento))) throw new AusenciaNaoEncontradaError();
  }

  async aprovar(gestor: Gestor, id: string): Promise<void> {
    const { ausencia: atual } = await this.inteiraVisivel(gestor, id);
    const em = this.clock.now();
    const revisao = aprovarAusencia(atual, { usuarioId: gestor.usuarioId, em });
    await this.gravarRevisao(gestor, atual, revisao, em);
  }

  async recusar(gestor: Gestor, id: string, motivo: string): Promise<void> {
    const { ausencia: atual } = await this.inteiraVisivel(gestor, id);
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
    return (await this.visivelComEscopo(gestor, id)).ausencia;
  }

  /**
   * Para mexer (editar, excluir, aprovar, recusar): além de visível, a ausência tem de valer só
   * dentro do recorte; senão 403 (ver `inteiraNoRecorte`).
   */
  private async inteiraVisivel(gestor: Gestor, id: string) {
    const resultado = await this.visivelComEscopo(gestor, id);
    const { ausencia, escopo } = resultado;
    if (
      escopo &&
      !inteiraNoRecorte(escopo, {
        turnoIds: ausencia.turnos.map((t) => t.id),
        frenteIds: ausencia.frentes.map((f) => f.id),
      })
    ) {
      throw new AusenciaForaDoRecorteError();
    }
    return resultado;
  }

  private async visivelComEscopo(
    gestor: Gestor,
    id: string,
  ): Promise<{ ausencia: AusenciaDetalhada; escopo: EscopoEscala | null }> {
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
    return { ausencia, escopo };
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
   * Recorte da gestora ao lançar ou editar: cada médico precisa de alocação vigente no período
   * dentro do recorte, e a ausência fica inteira no recorte (`recortar`). Sem recorte, devolve um
   * mapa vazio (vale o pedido).
   */
  private async alcanceNoRecorte(
    escopo: EscopoEscala | null,
    medicoIds: string[],
    pedido: Alcance & { dataInicio: string; dataFim: string },
  ): Promise<Map<string, Alcance>> {
    const resultado = new Map<string, Alcance>();
    if (!escopo) return resultado;
    const alocacoes = await this.repo.alocacoesVigentes(
      medicoIds,
      pedido.dataInicio,
      pedido.dataFim,
    );
    for (const medicoId of medicoIds) {
      const doMedico = alocacoes.filter((a) => a.medicoId === medicoId && estaNoEscopo(escopo, a));
      if (!doMedico.length) throw new MedicoForaDoRecorteError();
      resultado.set(medicoId, recortar(escopo, pedido, doMedico));
    }
    return resultado;
  }
}
