import { randomUUID } from 'node:crypto';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import {
  type DadosRegua,
  expandirRegua,
  type ItemPreenchimento,
  planejarAlteracaoRegua,
  planejarEncerramentoRegua,
  planejarInclusaoRegua,
  planejarPreenchimento,
} from '../../domain/regua-nivel';
import type { MudancaVersao } from '../../domain/versoes';
import { aPartirDeMinimo, type ContextoVigencia, proxima } from '../../domain/vigencia';
import type { PrecosRepasseRepository } from '../ports/precos-repasse.repository';
import type { EventoDaVersao } from '../ports/regras-medico.repository';
import type { LinhaReguaLida, ReguaNivelRepository } from '../ports/regua-nivel.repository';
import { MedicoNaoEncontradoError } from './adicionais';
import { ENTIDADE_PRECO_REPASSE } from './precos-medico';

export const ENTIDADE_REGUA = 'regua_repasse_nivel';

export class NivelNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Nível não encontrado.');
  }
}

export class MedicoSemNivelError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor() {
    super(
      'O médico não tem nível no cadastro: escolha o nível dele antes de preencher pela régua.',
    );
  }
}

const mesDeBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).slice(0, 7);

const autoria = (eventos: EventoDaVersao[] = []) => {
  const criado = eventos.find((e) => e.acao === 'criada');
  const ultimo = (acao: string) => eventos.filter((e) => e.acao === acao).at(-1);
  return {
    criadoPor: criado?.quem ?? null,
    criadoEm: criado?.em ?? null,
    encerradoPor: ultimo('encerrada')?.quem ?? null,
    encerradoEm: ultimo('encerrada')?.em ?? null,
    reabertoPor: ultimo('reaberta')?.quem ?? null,
    reabertoEm: ultimo('reaberta')?.em ?? null,
  };
};

abstract class CasoRegua {
  constructor(
    protected readonly repo: ReguaNivelRepository,
    protected readonly agora: () => Date,
    protected readonly novoId: () => string = randomUUID,
  ) {}

  protected async contexto(): Promise<ContextoVigencia> {
    return { mesAtual: mesDeBrasilia(this.agora()), bloqueadas: await this.repo.bloqueadas() };
  }

  protected async exigirNivel(nivelId: string) {
    if ((await this.repo.nomeDoNivel(nivelId)) === null) throw new NivelNaoEncontradoError();
  }

  protected async gravar(
    usuarioId: string,
    nivelId: string,
    aPartirDe: string,
    mudancas: MudancaVersao[],
    nova: (DadosRegua & { vigenciaDesde: string; vigenciaAte: string | null }) | null,
  ) {
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    const em = this.agora();
    const acao = { encerrar: 'encerrada', remover: 'cancelada', reabrir: 'reaberta' } as const;
    const comId = nova ? { ...nova, id: this.novoId() } : null;
    const eventos: EventoAuditoria[] = [
      ...mudancas.map((m) => ({
        ator,
        entidade: ENTIDADE_REGUA,
        entidadeId: m.id,
        acao: acao[m.tipo],
        em,
        antes: { vigenciaAte: m.vigenciaAteAntes },
        ...(m.tipo === 'remover' ? {} : { depois: { vigenciaAte: m.vigenciaAte } }),
      })),
      ...(comId
        ? [
            {
              ator,
              entidade: ENTIDADE_REGUA,
              entidadeId: comId.id,
              acao: 'criada',
              em,
              depois: { ...comId },
            },
          ]
        : []),
    ];
    await this.repo.gravar({ nivelId, usuarioId, aPartirDe, mudancas, nova: comId, eventos });
    return comId?.id ?? null;
  }
}

/** A régua do nível: todas as versões, com quem criou e encerrou, e as competências da tela. */
export class ListarRegua extends CasoRegua {
  async executar(nivelId: string) {
    await this.exigirNivel(nivelId);
    const ctx = await this.contexto();
    const linhas = await this.repo.listar(nivelId);
    const eventos = await this.repo.eventos(linhas.map((l) => l.id));
    const minimo = aPartirDeMinimo(ctx);
    const nome = (l: LinhaReguaLida) =>
      [
        l.nomes.modalidade,
        l.nomes.especialidade,
        l.nomes.categoria ?? '',
        l.nomes.prioridade ?? '',
      ].join(' ');
    return {
      mesAtual: ctx.mesAtual,
      aPartirDeMinimo: minimo,
      aPartirDeSugerido: [proxima(ctx.mesAtual), minimo].sort().at(-1) as string,
      linhas: linhas
        .sort(
          (a, b) =>
            nome(a).localeCompare(nome(b)) ||
            (b.vigenciaDesde ?? '').localeCompare(a.vigenciaDesde ?? ''),
        )
        .map((l) => ({ ...l, ...autoria(eventos.get(l.id)) })),
    };
  }
}

export class IncluirRegua extends CasoRegua {
  async executar(usuarioId: string, dados: DadosRegua, aPartirDe: string) {
    await this.exigirNivel(dados.nivelId);
    const versoes = await this.repo.listar(dados.nivelId);
    const { mudancas, nova } = planejarInclusaoRegua(
      dados,
      aPartirDe,
      versoes,
      await this.contexto(),
    );
    return (await this.gravar(usuarioId, dados.nivelId, aPartirDe, mudancas, nova)) as string;
  }
}

/** O nível da linha (as linhas ficam por nível; a busca é pelo id da versão). */
async function linhaDoNivel(repo: ReguaNivelRepository, nivelId: string, id: string) {
  const versoes = await repo.listar(nivelId);
  if (!versoes.some((v) => v.id === id)) throw new NivelNaoEncontradoError();
  return versoes;
}

export class AlterarRegua extends CasoRegua {
  async executar(
    usuarioId: string,
    nivelId: string,
    id: string,
    valorCentavos: number,
    aPartirDe: string,
  ) {
    const versoes = await linhaDoNivel(this.repo, nivelId, id);
    const { mudancas, nova } = planejarAlteracaoRegua(
      id,
      valorCentavos,
      aPartirDe,
      versoes,
      await this.contexto(),
    );
    return (await this.gravar(usuarioId, nivelId, aPartirDe, mudancas, nova)) as string;
  }
}

export class EncerrarRegua extends CasoRegua {
  async executar(usuarioId: string, nivelId: string, id: string, aPartirDe: string) {
    const versoes = await linhaDoNivel(this.repo, nivelId, id);
    const mudancas = planejarEncerramentoRegua(id, aPartirDe, versoes, await this.contexto());
    await this.gravar(usuarioId, nivelId, aPartirDe, mudancas, null);
  }
}

export interface PreviaPreenchimento {
  nivel: string;
  aPartirDe: string;
  itens: (ItemPreenchimento & {
    nomes: { modalidade: string; especialidade: string; categoria: string; prioridade: string };
  })[];
}

/**
 * "Preencher pela régua do nível": a prévia do que muda nos preços de todos os clientes do médico
 * e, com `confirmar`, as versões gravadas (com auditoria e prévias do repasse refeitas).
 */
export class PreencherPelaRegua {
  constructor(
    private readonly regua: ReguaNivelRepository,
    private readonly precos: PrecosRepasseRepository,
    private readonly agora: () => Date,
    private readonly novoId: () => string = randomUUID,
  ) {}

  async executar(
    usuarioId: string,
    medicoId: string,
    aPartirDe: string,
    confirmar: boolean,
  ): Promise<PreviaPreenchimento> {
    const nivel = await this.regua.nivelDoMedico(medicoId);
    if (nivel === undefined) throw new MedicoNaoEncontradoError();
    if (nivel === null) throw new MedicoSemNivelError();
    const ctx = {
      mesAtual: mesDeBrasilia(this.agora()),
      bloqueadas: await this.precos.bloqueadas(),
    };
    const [linhas, cat, precos, opcoes] = await Promise.all([
      this.regua.listar(nivel.id),
      this.regua.catalogo(),
      this.precos.listarVersoes(medicoId),
      this.precos.opcoes(),
    ]);
    const categorias = new Map<string, string[]>();
    for (const c of cat.categorias) {
      const k = `${c.modalidadeId}|${c.especialidadeId}`;
      categorias.set(k, [...(categorias.get(k) ?? []), c.categoriaId]);
    }
    const expandida = expandirRegua(linhas, aPartirDe, {
      categoriasDe: (m, e) => categorias.get(`${m}|${e}`) ?? [],
      prioridades: cat.prioridades,
    });
    const { itens, mudancas } = planejarPreenchimento(expandida, precos, aPartirDe, ctx);
    const nomes = new Map(
      [
        ...opcoes.modalidades,
        ...opcoes.especialidades,
        ...opcoes.categorias,
        ...opcoes.prioridades,
      ].map((o) => [o.id, o.nome]),
    );
    const nome = (id: string) => nomes.get(id) ?? id;
    if (confirmar && mudancas.length) {
      const em = this.agora();
      const ator = { tipo: 'usuario' as const, id: usuarioId };
      const gravadas = mudancas.map((m) => (m.tipo === 'criar' ? { ...m, id: this.novoId() } : m));
      await this.precos.aplicar(
        medicoId,
        gravadas as Parameters<PrecosRepasseRepository['aplicar']>[1],
        {
          usuarioId,
          aPartirDe,
          eventos: gravadas.map((m) => ({
            ator,
            entidade: ENTIDADE_PRECO_REPASSE,
            entidadeId: m.id,
            em,
            acao: {
              criar: 'criado',
              encerrar: 'encerrado',
              remover: 'removido',
              reabrir: 'reaberto',
            }[m.tipo],
            ...(m.tipo === 'criar'
              ? {
                  depois: {
                    medicoId,
                    ...m.dados,
                    vigenciaDesde: m.vigenciaDesde,
                    vigenciaAte: m.vigenciaAte,
                    origem: `régua do nível ${nivel.nome}`,
                  },
                }
              : {
                  antes: { medicoId, vigenciaAte: m.vigenciaAteAntes },
                  depois: { medicoId, vigenciaAte: 'vigenciaAte' in m ? m.vigenciaAte : null },
                }),
          })),
        },
      );
    }
    return {
      nivel: nivel.nome,
      aPartirDe,
      itens: itens
        .map((i) => ({
          ...i,
          nomes: {
            modalidade: nome(i.modalidadeId),
            especialidade: nome(i.especialidadeId),
            categoria: nome(i.categoriaId),
            prioridade: nome(i.prioridadeId),
          },
        }))
        .sort((a, b) =>
          Object.values(a.nomes).join(' ').localeCompare(Object.values(b.nomes).join(' ')),
        ),
    };
  }
}
