import { randomUUID } from 'node:crypto';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import {
  gerarPlanilhaPrecosRepasse,
  lerPlanilhaPrecosRepasse,
  type VigenciaDaLinha,
} from '../../domain/planilha-precos';
import {
  type ArranjoPreco,
  type DadosPrecoRepasse,
  type MudancaPrecoRepasse,
  mesAno,
  mesmaChave,
  planejarAlteracao,
  planejarEncerramento,
  planejarInclusao,
  precosRepetidos,
  type VersaoPrecoRepasse,
} from '../../domain/versoes-preco';
import {
  aPartirDeMinimo,
  type ContextoVigencia,
  proxima,
  validarAPartirDe,
  vigenteEm,
} from '../../domain/vigencia';
import type {
  MudancaPrecoGravada,
  OpcoesPrecoRepasse,
  PrecosRepasseRepository,
  VersaoPrecoComNomes,
} from '../ports/precos-repasse.repository';

/** Entidade dos eventos de auditoria do preço de repasse (a mesma do aviso de preço repetido). */
export const ENTIDADE_PRECO_REPASSE = 'preco_repasse';

export class MedicoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Médico não encontrado.');
  }
}

export class PlanilhaPrecosRepasseInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor(erros: { linha: number; erro: string }[]) {
    super(
      `A planilha tem ${erros.length === 1 ? '1 linha' : `${erros.length} linhas`} com problema; nada foi importado.`,
      { erros },
    );
  }
}

const mesDeBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).slice(0, 7);

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Arranjo pelos nomes; "Todos os clientes" antes dos clientes; depois o início da vigência. */
const ordem = (a: VersaoPrecoComNomes, b: VersaoPrecoComNomes) =>
  a.nomes.modalidade.localeCompare(b.nomes.modalidade) ||
  a.nomes.especialidade.localeCompare(b.nomes.especialidade) ||
  a.nomes.categoria.localeCompare(b.nomes.categoria) ||
  a.nomes.prioridade.localeCompare(b.nomes.prioridade) ||
  (a.nomes.cliente ?? '').localeCompare(b.nomes.cliente ?? '') ||
  (a.vigenciaDesde ?? '').localeCompare(b.vigenciaDesde ?? '');

export interface ItemPrecoRepasse extends VersaoPrecoComNomes {
  /** Outra versão do mesmo arranjo e cliente cruza a vigência. */
  duplicado: boolean;
  emVigor: boolean;
}

export interface TabelaPrecosRepasse {
  medico: { nome: string };
  mesAtual: string;
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
  itens: ItemPrecoRepasse[];
  total: number;
}

abstract class ComMedico {
  constructor(
    protected readonly repo: PrecosRepasseRepository,
    protected readonly agora: () => Date,
  ) {}

  protected async exigirMedico(medicoId: string): Promise<string> {
    const nome = await this.repo.nomeDoMedico(medicoId);
    if (nome === null) throw new MedicoNaoEncontradoError();
    return nome;
  }

  protected async contexto(): Promise<ContextoVigencia> {
    return { mesAtual: mesDeBrasilia(this.agora()), bloqueadas: await this.repo.bloqueadas() };
  }
}

/** Preços do médico em vigor e programados, com busca e paginação; ou só os de um arranjo. */
export class ListarPrecosMedico extends ComMedico {
  async executar(
    medicoId: string,
    filtro: { pagina: number; porPagina: number; busca?: string; arranjo?: ArranjoPreco },
  ): Promise<TabelaPrecosRepasse> {
    const nome = await this.exigirMedico(medicoId);
    const ctx = await this.contexto();
    const atuais = (await this.repo.listarVersoes(medicoId, filtro.arranjo)).filter(
      (v) => v.vigenciaAte === null || v.vigenciaAte >= ctx.mesAtual,
    );
    const repetidos = precosRepetidos(atuais);
    const termos = chave(filtro.busca ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const filtrados = atuais
      .filter((v) => {
        const texto = chave(
          [...Object.values(v.nomes), v.nomes.cliente ?? 'Todos os clientes'].join(' '),
        );
        return termos.every((t) => texto.includes(t));
      })
      .sort(ordem);
    const minimo = aPartirDeMinimo(ctx);
    const sugerido = [proxima(ctx.mesAtual), minimo].sort().at(-1) as string;
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return {
      medico: { nome },
      mesAtual: ctx.mesAtual,
      aPartirDeMinimo: minimo,
      aPartirDeSugerido: sugerido,
      itens: filtrados.slice(inicio, inicio + filtro.porPagina).map((v) => ({
        ...v,
        duplicado: repetidos.has(v.id),
        emVigor: vigenteEm(v, ctx.mesAtual),
      })),
      total: filtrados.length,
    };
  }
}

export interface VersaoHistoricoPrecoRepasse extends VersaoPrecoComNomes {
  criadoPor: string | null;
  criadoEm: Date | null;
  encerradoPor: string | null;
  encerradoEm: Date | null;
}

/** As versões de um arranjo e cliente, da mais nova para a mais antiga, com quem criou e encerrou. */
export class HistoricoPrecoMedico extends ComMedico {
  async executar(
    medicoId: string,
    arranjo: ArranjoPreco,
    clienteId: string | null,
  ): Promise<VersaoHistoricoPrecoRepasse[]> {
    await this.exigirMedico(medicoId);
    const versoes = (await this.repo.listarVersoes(medicoId, arranjo)).filter(
      (v) => v.clienteId === clienteId,
    );
    const eventos = await this.repo.eventos(versoes.map((v) => v.id));
    return versoes
      .sort((a, b) => (b.vigenciaDesde ?? '').localeCompare(a.vigenciaDesde ?? ''))
      .map((v) => {
        const doId = eventos.get(v.id) ?? [];
        const criado = doId.find((e) => e.acao === 'criado');
        const encerrado = doId.filter((e) => e.acao === 'encerrado').at(-1);
        return {
          ...v,
          criadoPor: criado?.quem ?? null,
          criadoEm: criado?.em ?? null,
          encerradoPor: encerrado?.quem ?? null,
          encerradoEm: encerrado?.em ?? null,
        };
      });
  }
}

export interface ResultadoImportacaoRepasse {
  incluidos: number;
  alterados: number;
  iguais: number;
}

/**
 * Incluir, alterar, encerrar e importar os preços do médico. Nada se sobrescreve (ver
 * `versoes-preco`); os eventos de auditoria e as prévias refeitas vão na transação da mudança.
 */
export class MudarPrecosMedico extends ComMedico {
  constructor(
    repo: PrecosRepasseRepository,
    agora: () => Date,
    private readonly novoId: () => string = randomUUID,
  ) {
    super(repo, agora);
  }

  async incluir(usuarioId: string, medicoId: string, dados: DadosPrecoRepasse, aPartirDe: string) {
    const { versoes, ctx } = await this.carregar(medicoId);
    const [id] = await this.gravar(
      usuarioId,
      medicoId,
      planejarInclusao(dados, aPartirDe, versoes, ctx),
      versoes,
      aPartirDe,
    );
    return id as string;
  }

  async alterar(
    usuarioId: string,
    medicoId: string,
    id: string,
    dados: DadosPrecoRepasse,
    aPartirDe: string,
  ) {
    const { versoes, ctx } = await this.carregar(medicoId);
    const [novo] = await this.gravar(
      usuarioId,
      medicoId,
      planejarAlteracao(id, dados, aPartirDe, versoes, ctx),
      versoes,
      aPartirDe,
    );
    return novo as string;
  }

  async encerrar(usuarioId: string, medicoId: string, id: string, aPartirDe: string) {
    const { versoes, ctx } = await this.carregar(medicoId);
    await this.gravar(
      usuarioId,
      medicoId,
      planejarEncerramento(id, aPartirDe, versoes, ctx),
      versoes,
      aPartirDe,
    );
  }

  /**
   * A planilha inteira ou nada, no modelo da exportação (cada linha com o início da versão). A
   * linha casa com a versão desse início: igual, fica; diferente, a programada é trocada na própria
   * competência e a que já vale muda a partir de `aPartirDe`. Coluna vazia: preço novo ou alterado
   * a partir de `aPartirDe`. Se o preço ganhou versão depois da exportação, a linha é recusada.
   * Nada que falta na planilha é encerrado.
   */
  async importar(
    usuarioId: string,
    medicoId: string,
    csv: string,
    aPartirDe: string,
  ): Promise<ResultadoImportacaoRepasse> {
    const { versoes, ctx } = await this.carregar(medicoId);
    validarAPartirDe(aPartirDe, ctx);
    const lida = lerPlanilhaPrecosRepasse(csv, await this.repo.opcoes());
    const erros = [...lida.erros];
    const mudancas: MudancaPrecoRepasse[] = [];
    const r: ResultadoImportacaoRepasse = { incluidos: 0, alterados: 0, iguais: 0 };
    const chaveDe = (d: DadosPrecoRepasse) =>
      [d.modalidadeId, d.especialidadeId, d.categoriaId, d.prioridadeId, d.clienteId].join('|');
    const naPlanilha = new Set(
      lida.linhas.flatMap((l) =>
        l.vigencia.nova ? [] : [JSON.stringify([chaveDe(l.dados), l.vigencia.desde])],
      ),
    );
    const MUDOU =
      'A tabela mudou depois da exportação (há preço mais novo para este arranjo e cliente): exporte de novo.';
    const vistas: { linha: number; dados: DadosPrecoRepasse; vigencia: VigenciaDaLinha }[] = [];
    let menor = aPartirDe;
    // Cada linha planeja sobre as versões já com as mudanças das linhas anteriores.
    let atual: VersaoPrecoRepasse[] = [...versoes];
    for (const { linha, dados, vigencia } of lida.linhas) {
      const repetida = vistas.find(
        (v) =>
          mesmaChave(v.dados, dados) && JSON.stringify(v.vigencia) === JSON.stringify(vigencia),
      );
      if (repetida) {
        erros.push({
          linha,
          erro: `Mesmo arranjo, cliente e vigência da linha ${repetida.linha}.`,
        });
        continue;
      }
      vistas.push({ linha, dados, vigencia });
      const daChave = atual.filter((v) => mesmaChave(v, dados));
      try {
        let alvo: VersaoPrecoRepasse | undefined;
        let desde: string;
        if (vigencia.nova) {
          if (daChave.some((v) => v.vigenciaDesde !== null && v.vigenciaDesde >= ctx.mesAtual)) {
            erros.push({ linha, erro: MUDOU });
            continue;
          }
          alvo = daChave.find((v) => vigenteEm(v, ctx.mesAtual));
          desde = aPartirDe;
        } else {
          alvo = daChave.find((v) => v.vigenciaDesde === vigencia.desde);
          const maisNova = daChave.some(
            (v) =>
              v.id !== alvo?.id &&
              (v.vigenciaDesde ?? '') > (vigencia.desde ?? '') &&
              !naPlanilha.has(JSON.stringify([chaveDe(dados), v.vigenciaDesde])),
          );
          if (maisNova || !alvo) {
            erros.push({ linha, erro: MUDOU });
            continue;
          }
          desde =
            alvo.vigenciaDesde !== null && alvo.vigenciaDesde > ctx.mesAtual
              ? alvo.vigenciaDesde
              : aPartirDe;
        }
        if (alvo && alvo.valorCentavos === dados.valorCentavos) {
          r.iguais += 1;
          continue;
        }
        if (alvo && alvo.vigenciaAte !== null && alvo.vigenciaAte < desde) {
          erros.push({
            linha,
            erro: `Este preço vale só até ${mesAno(alvo.vigenciaAte)}: para mudar o que vem depois, altere a linha do preço seguinte.`,
          });
          continue;
        }
        const planejadas = alvo
          ? planejarAlteracao(alvo.id, dados, desde, atual, ctx)
          : planejarInclusao(dados, desde, atual, ctx);
        const gravadas = planejadas.map((m) =>
          m.tipo === 'criar' ? { ...m, id: this.novoId() } : m,
        );
        mudancas.push(...gravadas);
        atual = aplicarEmMemoria(atual, gravadas);
        if (alvo) r.alterados += 1;
        else r.incluidos += 1;
        if (desde < menor) menor = desde;
      } catch (e) {
        if (!(e instanceof ErroDeDominio)) throw e;
        erros.push({ linha, erro: e.message });
      }
    }
    if (erros.length)
      throw new PlanilhaPrecosRepasseInvalidaError(erros.sort((a, b) => a.linha - b.linha));
    if (mudancas.length) await this.gravar(usuarioId, medicoId, mudancas, versoes, menor);
    return r;
  }

  private async carregar(medicoId: string) {
    await this.exigirMedico(medicoId);
    return {
      versoes: (await this.repo.listarVersoes(medicoId)) as VersaoPrecoRepasse[],
      ctx: await this.contexto(),
    };
  }

  /** Grava com os eventos; devolve os ids das versões criadas, na ordem. */
  private async gravar(
    usuarioId: string,
    medicoId: string,
    planejadas: (MudancaPrecoRepasse | MudancaPrecoGravada)[],
    versoes: VersaoPrecoRepasse[],
    aPartirDe: string,
  ): Promise<string[]> {
    const em = this.agora();
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    const mudancas: MudancaPrecoGravada[] = planejadas.map((m) =>
      m.tipo === 'criar' && !('id' in m) ? { ...m, id: this.novoId() } : (m as MudancaPrecoGravada),
    );
    const eventos: EventoAuditoria[] = mudancas.map((m) => {
      const base = { ator, entidade: ENTIDADE_PRECO_REPASSE, entidadeId: m.id, em };
      if (m.tipo === 'criar')
        return {
          ...base,
          acao: 'criado',
          depois: {
            medicoId,
            ...m.dados,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
          },
        };
      if (m.tipo === 'encerrar' || m.tipo === 'reabrir')
        return {
          ...base,
          acao: m.tipo === 'encerrar' ? 'encerrado' : 'reaberto',
          antes: { medicoId, vigenciaAte: m.vigenciaAteAntes },
          depois: { medicoId, vigenciaAte: m.vigenciaAte },
        };
      const v = versoes.find((x) => x.id === m.id) as VersaoPrecoRepasse & { nomes?: unknown };
      const { id: _id, nomes: _nomes, ...antes } = v ?? { id: m.id };
      return { ...base, acao: 'removido', antes: { medicoId, ...antes } };
    });
    await this.repo.aplicar(medicoId, mudancas, { usuarioId, aPartirDe, eventos });
    return mudancas.flatMap((m) => (m.tipo === 'criar' ? [m.id] : []));
  }
}

/** Aplica as mudanças sobre a lista (para a importação planejar linha a linha). */
function aplicarEmMemoria(
  versoes: VersaoPrecoRepasse[],
  mudancas: MudancaPrecoGravada[],
): VersaoPrecoRepasse[] {
  let r = [...versoes];
  for (const m of mudancas)
    if (m.tipo === 'criar')
      r.push({ id: m.id, ...m.dados, vigenciaDesde: m.vigenciaDesde, vigenciaAte: m.vigenciaAte });
    else if (m.tipo === 'remover') r = r.filter((v) => v.id !== m.id);
    else r = r.map((v) => (v.id === m.id ? { ...v, vigenciaAte: m.vigenciaAte } : v));
  return r;
}

/** A tabela em vigor e a programada, no modelo da importação (importar sem mudar não muda nada). */
export class ExportarPrecosMedico extends ComMedico {
  async executar(medicoId: string): Promise<{ nomeArquivo: string; conteudo: string }> {
    const nome = await this.exigirMedico(medicoId);
    const mes = mesDeBrasilia(this.agora());
    const versoes = (await this.repo.listarVersoes(medicoId))
      .filter((v) => vigenteEm(v, mes) || (v.vigenciaDesde !== null && v.vigenciaDesde > mes))
      .sort(ordem);
    const arquivo = nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return {
      nomeArquivo: `precos-repasse-${arquivo || 'medico'}-${mes}.csv`,
      conteudo: gerarPlanilhaPrecosRepasse(
        versoes.map((v) => ({
          modalidade: v.nomes.modalidade,
          especialidade: v.nomes.especialidade,
          categoria: v.nomes.categoria,
          prioridade: v.nomes.prioridade,
          cliente: v.nomes.cliente,
          valorCentavos: v.valorCentavos,
          desde: v.vigenciaDesde,
        })),
      ),
    };
  }
}

export class OpcoesPrecosRepasse {
  constructor(private readonly repo: PrecosRepasseRepository) {}
  executar(): Promise<OpcoesPrecoRepasse> {
    return this.repo.opcoes();
  }
}
