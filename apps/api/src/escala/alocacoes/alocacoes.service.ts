import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import {
  mensagemSegmentoFora,
  type Segmento,
  segmentoForaDaEspecialidade,
} from '../../comum/segmentos';
import { CLOCK, type Clock } from '../../identidade/clock';
import {
  type ClassificacaoAlocacao,
  classificarAlocacao,
  type DadosCobertura,
  EscalaInvalidaError,
  validarAlocacao,
  validarCobertura,
} from '../domain';
import {
  ESCOPO_ESCALA_REPOSITORY,
  type EscopoEscala,
  type EscopoEscalaRepository,
} from '../escopo/escopo';
import { type ConsultaOcorrencias, OCORRENCIAS_ESCALA } from '../ocorrencias/consulta-ocorrencias';
import {
  ALOCACOES_REPOSITORY,
  type AlocacaoGravada,
  type AlocacoesRepository,
  type ConferirCoberturas,
  type TurnoParaAlocar,
} from './alocacoes.repository';
import {
  type AvisoConflito,
  alocacaoNoEscopo,
  avisosDaAlocacao,
  escopoDo,
  exigirNoEscopo,
} from './apoio';
import { type AtorEscala, EventosEscala } from './eventos';

/** Corpo de criar e editar uma alocação (que não é cobertura). */
export interface EntradaAlocacao {
  medicoId: string;
  turnoId: string;
  frenteId: string;
  diasSemana: number[];
  /** Vazio ou ausente = toda semana. */
  semanasDoMes?: number[];
  /** Ausente = o do turno. */
  horarioInicio?: string | null;
  horarioFim?: string | null;
  dataInicio: string;
  dataFim?: string | null;
  produtividade?: number | null;
  /** Ausente: falso ao criar; na edição, mantém o atual. */
  gratificado?: boolean;
  prioridadeIds?: string[];
  subespecialidadeIds?: string[];
  subespecialidadeGeral?: boolean;
  observacoes?: string | null;
}

export interface EntradaCobertura extends DadosCobertura {
  observacoes?: string | null;
}

export interface AlocacaoDetalhada extends AlocacaoGravada {
  classificacao: ClassificacaoAlocacao;
}

export interface ResultadoEscrita {
  /** Sobreposições do médico no mesmo turno (não bloqueiam); fora do recorte, sem detalhes. */
  avisos: AvisoConflito[];
}

const texto = (valor: string | null | undefined) => valor?.trim() || null;
const formatarData = (data: string) => data.split('-').reverse().join('/');

/**
 * Alocações (o médico num turno e numa frente) e coberturas. A regra vem do domínio
 * (`validarAlocacao`, `validarCobertura`); aqui ficam as referências, o recorte da gestora, a
 * auditoria (gravada na mesma transação) e os avisos de sobreposição.
 * Fonte: dashboards-one `escala-hierarquica.ts` (:701-1030).
 */
@Injectable()
export class AlocacoesService {
  constructor(
    @Inject(ALOCACOES_REPOSITORY) private readonly repo: AlocacoesRepository,
    @Inject(ESCOPO_ESCALA_REPOSITORY) private readonly escopos: EscopoEscalaRepository,
    @Inject(OCORRENCIAS_ESCALA) private readonly consulta: ConsultaOcorrencias,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async obter(ator: AtorEscala, id: string): Promise<AlocacaoDetalhada> {
    const alocacao = await alocacaoNoEscopo(this.repo, await escopoDo(this.escopos, ator), id);
    return { ...alocacao, classificacao: classificarAlocacao(alocacao) };
  }

  async criar(
    ator: AtorEscala,
    entrada: EntradaAlocacao,
  ): Promise<ResultadoEscrita & { id: string }> {
    const escopo = await escopoDo(this.escopos, ator);
    exigirNoEscopo(escopo, entrada);
    await this.exigirMedicoAtivo(entrada.medicoId);
    const alocacao = await this.montar(randomUUID(), entrada, entrada.gratificado === true, null);
    await this.repo.criar(alocacao, [this.eventos(ator).alocacaoCriada(alocacao)]);
    return { id: alocacao.id, avisos: await this.avisos(alocacao, escopo) };
  }

  async atualizar(
    ator: AtorEscala,
    id: string,
    entrada: EntradaAlocacao,
  ): Promise<ResultadoEscrita> {
    const escopo = await escopoDo(this.escopos, ator);
    const atual = await alocacaoNoEscopo(this.repo, escopo, id);
    if (atual.coberturaDeId !== null) {
      throw new EscalaInvalidaError('Este vínculo é uma cobertura: edite-o pela cobertura.');
    }
    exigirNoEscopo(escopo, entrada);
    if (entrada.medicoId !== atual.medicoId) await this.exigirMedicoAtivo(entrada.medicoId);
    // Como no dashboards-one, gratificado ausente na edição não troca a situação.
    const alocacao = await this.montar(
      id,
      entrada,
      entrada.gratificado ?? atual.gratificado,
      atual,
    );
    await this.exigirCoberturasNoVinculo(atual, alocacao);

    const evento = this.eventos(ator).alocacaoAlterada(atual, alocacao);
    await this.repo.atualizar(alocacao, evento ? [evento] : []);
    return { avisos: await this.avisos(alocacao, escopo) };
  }

  /**
   * Remove a alocação; as coberturas e os ajustes dela caem junto, cada um com seu evento. O que cai
   * é lido pelo repositório na transação do delete, com a alocação travada.
   */
  async remover(ator: AtorEscala, id: string): Promise<void> {
    const atual = await alocacaoNoEscopo(this.repo, await escopoDo(this.escopos, ator), id);
    const eventos = this.eventos(ator);
    await this.repo.remover(id, (removidas, ajustes) => {
      const porId = new Map(removidas.map((a) => [a.id, a]));
      return [
        ...removidas.map((a) => eventos.alocacaoRemovida(a)),
        ...ajustes.map((aj) => eventos.ajusteRemovido(aj, porId.get(aj.alocacaoId) ?? atual)),
      ];
    });
  }

  /** Outro médico assume o vínculo `titularId` num período. */
  async criarCobertura(
    ator: AtorEscala,
    titularId: string,
    entrada: EntradaCobertura,
  ): Promise<ResultadoEscrita & { id: string }> {
    const escopo = await escopoDo(this.escopos, ator);
    const titular = await alocacaoNoEscopo(this.repo, escopo, titularId);
    await this.exigirMedicoAtivo(entrada.medicoId);
    const { cobertura, conferir } = await this.montarCobertura(randomUUID(), entrada, titular);
    await this.repo.criarCobertura(
      cobertura,
      [this.eventos(ator).alocacaoCriada(cobertura)],
      conferir,
    );
    return { id: cobertura.id, avisos: await this.avisos(cobertura, escopo) };
  }

  async atualizarCobertura(
    ator: AtorEscala,
    id: string,
    entrada: EntradaCobertura,
  ): Promise<ResultadoEscrita> {
    const escopo = await escopoDo(this.escopos, ator);
    const atual = await alocacaoNoEscopo(this.repo, escopo, id);
    if (atual.coberturaDeId === null) {
      throw new EscalaInvalidaError('Este vínculo não é uma cobertura.');
    }
    if (entrada.medicoId !== atual.medicoId) await this.exigirMedicoAtivo(entrada.medicoId);
    const titular = await this.repo.buscar(atual.coberturaDeId);
    if (!titular) throw new EscalaInvalidaError('O vínculo coberto não existe mais.');
    const { cobertura, conferir } = await this.montarCobertura(id, entrada, titular);

    const evento = this.eventos(ator).alocacaoAlterada(atual, cobertura);
    await this.repo.atualizarCobertura(cobertura, evento ? [evento] : [], conferir);
    return { avisos: await this.avisos(cobertura, escopo) };
  }

  private avisos(alocacao: AlocacaoGravada, escopo: EscopoEscala | null) {
    return avisosDaAlocacao(this.consulta, this.clock, alocacao, escopo);
  }

  private eventos(ator: AtorEscala) {
    return new EventosEscala(ator, this.clock.now());
  }

  private async montar(
    id: string,
    entrada: EntradaAlocacao,
    gratificado: boolean,
    /** O vínculo como está gravado (na edição), para a regra do segmento valer só no que muda. */
    atual: AlocacaoGravada | null,
  ): Promise<AlocacaoGravada> {
    const turno = await this.turnoComFrente(entrada.turnoId, entrada.frenteId);
    const validada = validarAlocacao({ ...entrada, gratificado }, turno);
    const prioridadeIds = [...new Set(entrada.prioridadeIds ?? [])];
    const subespecialidadeIds = [...new Set(entrada.subespecialidadeIds ?? [])];
    if ((await this.repo.prioridadesExistentes(prioridadeIds)).length !== prioridadeIds.length) {
      throw new EscalaInvalidaError(
        'Prioridade não encontrada. Atualize a tela e escolha de novo.',
      );
    }
    const segmentos = await this.repo.segmentos(subespecialidadeIds);
    if (segmentos.length !== subespecialidadeIds.length) {
      throw new EscalaInvalidaError(
        'Subespecialidade não encontrada. Atualize a tela e escolha de novo.',
      );
    }
    await this.exigirSegmentosDaFrente(entrada.frenteId, subespecialidadeIds, segmentos, atual);
    return {
      id,
      medicoId: entrada.medicoId,
      turnoId: entrada.turnoId,
      frenteId: entrada.frenteId,
      ...validada,
      subespecialidadeGeral: entrada.subespecialidadeGeral === true,
      prioridadeIds,
      subespecialidadeIds,
      coberturaDeId: null,
      observacoes: texto(entrada.observacoes),
    };
  }

  /**
   * Cobertura: turno, frente e recortes são os do titular, lidos na expansão. Valida contra as
   * coberturas de agora (para recusar cedo) e devolve `conferir`, que o repositório roda de novo
   * com as coberturas lidas na transação, com o titular travado.
   */
  private async montarCobertura(
    id: string,
    entrada: EntradaCobertura,
    titular: AlocacaoGravada,
  ): Promise<{ cobertura: AlocacaoGravada; conferir: ConferirCoberturas }> {
    const turno = await this.repo.turno(titular.turnoId);
    if (!turno) throw new EscalaInvalidaError('Turno não encontrado.');
    const validar = (outras: AlocacaoGravada[]) =>
      validarCobertura(
        entrada,
        titular,
        turno,
        outras.map((o) => ({ ...o, dataFim: o.dataFim ?? o.dataInicio })),
        { ignorarId: id },
      );
    const validada = validar(await this.repo.coberturasDe(titular.id));
    const cobertura: AlocacaoGravada = {
      id,
      turnoId: titular.turnoId,
      frenteId: titular.frenteId,
      ...validada,
      subespecialidadeGeral: false,
      prioridadeIds: [],
      subespecialidadeIds: [],
      observacoes: texto(entrada.observacoes),
    };
    return { cobertura, conferir: (outras) => void validar(outras) };
  }

  /**
   * Segmento é recorte da especialidade: na frente de especialidade, só os segmentos que ela tem.
   * A frente de modalidade (RX, TC) junta especialidades e aceita qualquer segmento. Na edição, o
   * segmento que já estava no vínculo, na mesma frente, não passa pela regra (gravado antes dela).
   */
  private async exigirSegmentosDaFrente(
    frenteId: string,
    subespecialidadeIds: string[],
    segmentos: Segmento[],
    atual: AlocacaoGravada | null,
  ) {
    const jaGravados = atual?.frenteId === frenteId ? atual.subespecialidadeIds : [];
    const novos = subespecialidadeIds.filter((s) => !jaGravados.includes(s));
    if (!novos.length) return;
    const especialidadeId = await this.repo.especialidadeDaFrente(frenteId);
    if (!especialidadeId) return;
    const fora = segmentoForaDaEspecialidade(segmentos, novos, especialidadeId);
    if (fora) throw new EscalaInvalidaError(mensagemSegmentoFora(fora, 'desta frente'));
  }

  private async turnoComFrente(turnoId: string, frenteId: string): Promise<TurnoParaAlocar> {
    const turno = await this.repo.turno(turnoId);
    if (!turno) throw new EscalaInvalidaError('Turno não encontrado.');
    // No redo-one a frente do turno é cadastro: alocar não cria a coluna sozinho.
    if (!turno.frenteIds.includes(frenteId)) {
      throw new EscalaInvalidaError(
        `Esta frente não está no turno ${turno.nome}. Cadastre a frente no turno antes de escalar.`,
      );
    }
    return turno;
  }

  private async exigirMedicoAtivo(medicoId: string) {
    const medico = await this.repo.medico(medicoId);
    if (!medico) throw new EscalaInvalidaError('Médico não encontrado.');
    if (!medico.ativo) {
      throw new EscalaInvalidaError(
        'Médico inativo não pode ser escalado. Reative o cadastro antes.',
      );
    }
  }

  /**
   * As coberturas leem turno, frente e médico do titular: com cobertura cadastrada, esses não
   * mudam, e a nova vigência precisa conter cada cobertura.
   */
  private async exigirCoberturasNoVinculo(atual: AlocacaoGravada, novo: AlocacaoGravada) {
    const coberturas = await this.repo.coberturasDe(atual.id);
    if (!coberturas.length) return;
    if (
      novo.medicoId !== atual.medicoId ||
      novo.turnoId !== atual.turnoId ||
      novo.frenteId !== atual.frenteId
    ) {
      throw new EscalaInvalidaError(
        'Este vínculo tem coberturas: remova-as antes de trocar o médico, o turno ou a frente.',
      );
    }
    for (const c of coberturas) {
      const fim = c.dataFim ?? c.dataInicio;
      if (c.dataInicio < novo.dataInicio || (novo.dataFim !== null && fim > novo.dataFim)) {
        throw new EscalaInvalidaError(
          `A cobertura de ${formatarData(c.dataInicio)} a ${formatarData(fim)} sai da nova ` +
            'vigência. Ajuste ou remova a cobertura antes.',
        );
      }
    }
  }
}
