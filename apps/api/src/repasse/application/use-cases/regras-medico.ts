import { randomUUID } from 'node:crypto';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import {
  type MudancaVersao,
  planejarAlteracaoVersao,
  planejarCancelamento,
  planejarEncerramentoVersao,
  planejarVersaoUnica,
} from '../../domain/versoes';
import {
  aPartirDeMinimo,
  type ContextoVigencia,
  proxima,
  validarAPartirDe,
} from '../../domain/vigencia';
import type {
  DadosRegraApuracao,
  EventoDaVersao,
  ModoContagem,
  RecorteContagem,
  RegraApuracaoGravada,
  RegrasMedicoRepository,
  VersaoContagem,
} from '../ports/regras-medico.repository';
import { MedicoNaoEncontradoError } from './precos-medico';

export const ENTIDADE_CONTAGEM = 'configuracao_medico_repasse';
export const ENTIDADE_REGRA_APURACAO = 'regra_apuracao_repasse';

export class RegraRepasseInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

const mesDeBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).slice(0, 7);

/** Quem encerrou e quem reabriu cada versão (o criador vem da própria linha). */
export interface ComEncerramento {
  encerradoPor: string | null;
  encerradoEm: Date | null;
  reabertoPor: string | null;
  reabertoEm: Date | null;
}

const doEvento = (eventos: EventoDaVersao[] | undefined, acao: string) => {
  const e = (eventos ?? []).filter((x) => x.acao === acao).at(-1);
  return { quem: e?.quem ?? null, em: e?.em ?? null };
};

const comEncerramento = <V extends { id: string }>(
  versoes: V[],
  eventos: Map<string, EventoDaVersao[]>,
): (V & ComEncerramento)[] =>
  versoes.map((v) => {
    const enc = doEvento(eventos.get(v.id), 'encerrada');
    const reab = doEvento(eventos.get(v.id), 'reaberta');
    return {
      ...v,
      encerradoPor: enc.quem,
      encerradoEm: enc.em,
      reabertoPor: reab.quem,
      reabertoEm: reab.em,
    };
  });

/** Da mais nova para a mais antiga (a sem início por último). */
const maisNovaPrimeiro = (
  a: { vigenciaDesde: string | null },
  b: { vigenciaDesde: string | null },
) => (b.vigenciaDesde ?? '').localeCompare(a.vigenciaDesde ?? '');

export interface VigenciaDaTela {
  mesAtual: string;
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
}

const vigenciaDaTela = (ctx: ContextoVigencia): VigenciaDaTela => {
  const minimo = aPartirDeMinimo(ctx);
  return {
    mesAtual: ctx.mesAtual,
    aPartirDeMinimo: minimo,
    aPartirDeSugerido: [proxima(ctx.mesAtual), minimo].sort().at(-1) as string,
  };
};

abstract class CasoRegras {
  constructor(
    protected readonly repo: RegrasMedicoRepository,
    protected readonly agora: () => Date,
    protected readonly novoId: () => string = randomUUID,
  ) {}

  protected async exigir(medicoId: string) {
    if ((await this.repo.nomeDoMedico(medicoId)) === null) throw new MedicoNaoEncontradoError();
  }

  protected async contexto(): Promise<ContextoVigencia> {
    return { mesAtual: mesDeBrasilia(this.agora()), bloqueadas: await this.repo.bloqueadas() };
  }

  /** Eventos de auditoria das mudanças e da versão nova (com o que ela diz). */
  protected eventos(
    usuarioId: string,
    entidade: string,
    mudancas: MudancaVersao[],
    nova: { id: string; [k: string]: unknown } | null,
    extra: Record<string, unknown>,
  ): EventoAuditoria[] {
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    const em = this.agora();
    const acao = { encerrar: 'encerrada', remover: 'cancelada', reabrir: 'reaberta' } as const;
    return [
      ...mudancas.map((m) => ({
        ator,
        entidade,
        entidadeId: m.id,
        acao: acao[m.tipo],
        em,
        antes: { ...extra, vigenciaAte: m.vigenciaAteAntes },
        ...(m.tipo === 'remover' ? {} : { depois: { ...extra, vigenciaAte: m.vigenciaAte } }),
      })),
      ...(nova
        ? [
            {
              ator,
              entidade,
              entidadeId: nova.id,
              acao: 'criada',
              em,
              depois: { ...extra, ...nova },
            },
          ]
        : []),
    ];
  }
}

// --- Como os laudos contam ---

export interface ContagemDoMedico extends VigenciaDaTela {
  versoes: (VersaoContagem & ComEncerramento)[];
}

export class ListarContagemMedico extends CasoRegras {
  async executar(medicoId: string): Promise<ContagemDoMedico> {
    await this.exigir(medicoId);
    const versoes = (await this.repo.listarContagem(medicoId)).sort(maisNovaPrimeiro);
    const eventos = await this.repo.eventos(
      ENTIDADE_CONTAGEM,
      versoes.map((v) => v.id),
    );
    return { ...vigenciaDaTela(await this.contexto()), versoes: comEncerramento(versoes, eventos) };
  }
}

function validarRecortes(modo: ModoContagem, recortes: RecorteContagem[]): RecorteContagem[] {
  if (modo !== 'recortes') return [];
  if (!recortes.length)
    throw new RegraRepasseInvalidaError(
      'Inclua ao menos um recorte cliente × especialidade (ou escolha "Todos os laudos").',
    );
  const chaves = recortes.map((r) => `${r.clienteId}|${r.especialidadeId}`);
  if (new Set(chaves).size !== chaves.length)
    throw new RegraRepasseInvalidaError('Há recortes repetidos.');
  if (recortes.some((r) => r.clienteId === null && r.especialidadeId === null))
    throw new RegraRepasseInvalidaError(
      'Todos os clientes com todas as especialidades é o mesmo que "Todos os laudos": escolha essa opção.',
    );
  return recortes;
}

/** Nova versão de "como os laudos contam", a partir de uma competência aberta ou futura. */
export class NovaVersaoContagem extends CasoRegras {
  async executar(
    usuarioId: string,
    medicoId: string,
    dados: { modo: ModoContagem; recortes: RecorteContagem[] },
    aPartirDe: string,
  ): Promise<string> {
    await this.exigir(medicoId);
    const recortes = validarRecortes(dados.modo, dados.recortes);
    const versoes = await this.repo.listarContagem(medicoId);
    const mudancas = planejarVersaoUnica(aPartirDe, versoes, await this.contexto());
    const nova = {
      id: this.novoId(),
      modo: dados.modo,
      recortes,
      vigenciaDesde: aPartirDe,
      vigenciaAte: null,
    };
    await this.repo.gravarContagem({
      medicoId,
      usuarioId,
      aPartirDe,
      mudancas,
      nova,
      eventos: this.eventos(usuarioId, ENTIDADE_CONTAGEM, mudancas, nova, { medicoId }),
    });
    return nova.id;
  }
}

/** Cancelar a versão programada criada por engano: a anterior volta a valer. */
export class CancelarVersaoContagem extends CasoRegras {
  async executar(usuarioId: string, medicoId: string, id: string): Promise<void> {
    await this.exigir(medicoId);
    const versoes = await this.repo.listarContagem(medicoId);
    const mudancas = planejarCancelamento(id, versoes, await this.contexto(), () => true);
    const v = versoes.find((x) => x.id === id) as VersaoContagem;
    await this.repo.gravarContagem({
      medicoId,
      usuarioId,
      aPartirDe: v.vigenciaDesde as string,
      mudancas,
      nova: null,
      eventos: this.eventos(usuarioId, ENTIDADE_CONTAGEM, mudancas, null, { medicoId }),
    });
  }
}

// --- Regras de apuração ---

export interface RegrasApuracaoDoMedico extends VigenciaDaTela {
  regras: (RegraApuracaoGravada & ComEncerramento)[];
}

export class ListarRegrasApuracao extends CasoRegras {
  async executar(medicoId: string): Promise<RegrasApuracaoDoMedico> {
    await this.exigir(medicoId);
    const regras = (await this.repo.listarRegras(medicoId)).sort(
      (a, b) => a.descricao.localeCompare(b.descricao) || maisNovaPrimeiro(a, b),
    );
    const eventos = await this.repo.eventos(
      ENTIDADE_REGRA_APURACAO,
      regras.map((r) => r.id),
    );
    return { ...vigenciaDaTela(await this.contexto()), regras: comEncerramento(regras, eventos) };
  }
}

/** Limite das colunas `integer`. */
const MAXIMO = 2_147_483_647;

function validarRegra(d: DadosRegraApuracao): DadosRegraApuracao {
  const descricao = d.descricao.trim();
  if (!descricao) throw new RegraRepasseInvalidaError('Descreva a regra.');
  if (d.tipo === 'percentual_repasse') {
    if (!(Number.isInteger(d.percentualPpm) && (d.percentualPpm as number) > 0))
      throw new RegraRepasseInvalidaError('Informe o percentual, maior que zero.');
    if ((d.percentualPpm as number) > 1_000_000)
      throw new RegraRepasseInvalidaError('O percentual vai até 100%.');
  } else if (
    !(Number.isInteger(d.valorCentavos) && (d.valorCentavos as number) > 0) ||
    (d.valorCentavos as number) > MAXIMO
  )
    throw new RegraRepasseInvalidaError('Informe o valor, maior que zero.');
  if (!(Number.isInteger(d.divisor) && d.divisor >= 1 && d.divisor <= 1000))
    throw new RegraRepasseInvalidaError('"Dividir por" é um número inteiro de 1 a 1000.');
  for (const [lista, rotulo] of [
    [d.modalidadeIds, 'Modalidades'],
    [d.especialidadeIds, 'Especialidades'],
    [d.prioridadeIds, 'Prioridades'],
  ] as const)
    if (lista !== null && lista.length === 0)
      throw new RegraRepasseInvalidaError(
        `${rotulo}: escolha ao menos uma ou marque "Todas" (vazio nunca é todas).`,
      );
  return {
    ...d,
    descricao,
    valorCentavos: d.tipo === 'percentual_repasse' ? null : d.valorCentavos,
    percentualPpm: d.tipo === 'percentual_repasse' ? d.percentualPpm : null,
  };
}

/** A regra da mesma "chave": mesmo tipo e mesma descrição (a versão anterior dela). */
const mesmaRegra = (a: RegraApuracaoGravada, b: RegraApuracaoGravada) =>
  a.tipo === b.tipo && a.descricao === b.descricao;

const cruzam = (
  a: { vigenciaDesde: string | null; vigenciaAte: string | null },
  b: { vigenciaDesde: string | null; vigenciaAte: string | null },
) =>
  (a.vigenciaAte === null || b.vigenciaDesde === null || b.vigenciaDesde <= a.vigenciaAte) &&
  (b.vigenciaAte === null || a.vigenciaDesde === null || a.vigenciaDesde <= b.vigenciaAte);

/** Tarifa própria substitui os preços: uma só por vez. */
function exigirUmaTarifa(
  d: DadosRegraApuracao,
  periodo: { vigenciaDesde: string; vigenciaAte: string | null },
  regras: RegraApuracaoGravada[],
  ignorar?: string,
) {
  if (
    d.tipo === 'tarifa_laudo' &&
    regras.some((r) => r.id !== ignorar && r.tipo === 'tarifa_laudo' && cruzam(r, periodo))
  )
    throw new RegraRepasseInvalidaError(
      'O médico já tem tarifa própria nesse período: altere a que existe.',
    );
}

export class CriarRegraApuracao extends CasoRegras {
  async executar(
    usuarioId: string,
    medicoId: string,
    dados: DadosRegraApuracao,
    aPartirDe: string,
  ): Promise<string> {
    await this.exigir(medicoId);
    validarAPartirDe(aPartirDe, await this.contexto());
    const d = validarRegra(dados);
    const regras = await this.repo.listarRegras(medicoId);
    exigirUmaTarifa(d, { vigenciaDesde: aPartirDe, vigenciaAte: null }, regras);
    const nova = { ...d, id: this.novoId(), vigenciaDesde: aPartirDe, vigenciaAte: null };
    await this.repo.gravarRegra({
      medicoId,
      usuarioId,
      aPartirDe,
      mudancas: [],
      nova,
      eventos: this.eventos(usuarioId, ENTIDADE_REGRA_APURACAO, [], nova, { medicoId }),
    });
    return nova.id;
  }
}

/** Alterar = encerrar a versão na véspera e criar a nova dali até onde ela ia. */
export class AlterarRegraApuracao extends CasoRegras {
  async executar(
    usuarioId: string,
    medicoId: string,
    id: string,
    dados: DadosRegraApuracao,
    aPartirDe: string,
  ): Promise<string> {
    await this.exigir(medicoId);
    const d = validarRegra(dados);
    const regras = await this.repo.listarRegras(medicoId);
    const { mudancas, vigenciaAte } = planejarAlteracaoVersao(
      id,
      aPartirDe,
      regras,
      await this.contexto(),
    );
    exigirUmaTarifa(d, { vigenciaDesde: aPartirDe, vigenciaAte }, regras, id);
    const nova = { ...d, id: this.novoId(), vigenciaDesde: aPartirDe, vigenciaAte };
    await this.repo.gravarRegra({
      medicoId,
      usuarioId,
      aPartirDe,
      mudancas,
      nova,
      eventos: this.eventos(usuarioId, ENTIDADE_REGRA_APURACAO, mudancas, nova, { medicoId }),
    });
    return nova.id;
  }
}

/** Encerrar a regra a partir de uma competência; a programada é cancelada. */
export class EncerrarRegraApuracao extends CasoRegras {
  async executar(usuarioId: string, medicoId: string, id: string, aPartirDe: string) {
    await this.exigir(medicoId);
    const regras = await this.repo.listarRegras(medicoId);
    const mudancas = planejarEncerramentoVersao(
      id,
      aPartirDe,
      regras,
      await this.contexto(),
      mesmaRegra,
    );
    await this.repo.gravarRegra({
      medicoId,
      usuarioId,
      aPartirDe,
      mudancas,
      nova: null,
      eventos: this.eventos(usuarioId, ENTIDADE_REGRA_APURACAO, mudancas, null, { medicoId }),
    });
  }
}

export class CancelarRegraApuracao extends CasoRegras {
  async executar(usuarioId: string, medicoId: string, id: string) {
    await this.exigir(medicoId);
    const regras = await this.repo.listarRegras(medicoId);
    const mudancas = planejarCancelamento(id, regras, await this.contexto(), mesmaRegra);
    const r = regras.find((x) => x.id === id) as RegraApuracaoGravada;
    await this.repo.gravarRegra({
      medicoId,
      usuarioId,
      aPartirDe: r.vigenciaDesde as string,
      mudancas,
      nova: null,
      eventos: this.eventos(usuarioId, ENTIDADE_REGRA_APURACAO, mudancas, null, { medicoId }),
    });
  }
}
