import type { Auditoria } from '../../../auditoria/auditoria';
import type { Paginacao } from '../../../catalogo/comum/paginacao';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import type { CompetenciasBloqueadas } from '../../../ingestao/application/ports/competencias-bloqueadas';
import { diaBrasilia } from '../../../ingestao/domain/competencia';
import { gerarPlanilhaPrecos, lerPlanilhaPrecos } from '../../domain/planilha-precos';
import { type Arranjo, vigenteEm } from '../../domain/preco';
import {
  arranjosDuplicados,
  type ContextoVigencia,
  type DadosPreco,
  type MudancaPreco,
  planejarAlteracao,
  planejarEncerramento,
  planejarInclusao,
  proxima,
  type VersaoPreco,
  validarAPartirDe,
} from '../../domain/versoes-preco';
import type {
  Dono,
  InfoDono,
  OpcoesPreco,
  PrecosRepository,
  TipoDono,
  VersaoComNomes,
} from '../ports/precos.repository';

/** Entidade dos eventos de auditoria de cada tabela. */
export const ENTIDADE_PRECO: Record<TipoDono, string> = {
  cliente: 'preco_cliente',
  contratado: 'preco_padrao_contratado',
};

export class DonoPrecoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor(tipo: TipoDono) {
    super(tipo === 'cliente' ? 'Cliente não encontrado.' : 'Contratado não encontrado.');
  }
}

export class PlanilhaPrecosInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor(erros: { linha: number; erro: string }[]) {
    super(
      `A planilha tem ${erros.length === 1 ? '1 linha' : `${erros.length} linhas`} com problema; nada foi importado.`,
      { erros },
    );
  }
}

/** Linha da tabela na tela: a versão atual ou programada e se cruza com outra do mesmo arranjo. */
export interface ItemPreco extends VersaoComNomes {
  duplicado: boolean;
  /** Vale no mês atual (as outras são programadas). */
  emVigor: boolean;
}

export interface TabelaPrecos {
  dono: InfoDono;
  mesAtual: string;
  /** A primeira competência em que uma mudança pode valer e a sugerida (a próxima). */
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
  itens: ItemPreco[];
  total: number;
}

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

async function contexto(
  competencias: CompetenciasBloqueadas,
  agora: () => Date,
): Promise<ContextoVigencia> {
  return {
    mesAtual: diaBrasilia(agora()).slice(0, 7),
    bloqueadas: await competencias.listar(),
  };
}

async function exigirDono(repo: PrecosRepository, dono: Dono): Promise<InfoDono> {
  const info = await repo.obterDono(dono);
  if (!info) throw new DonoPrecoNaoEncontradoError(dono.tipo);
  return info;
}

const ordem = (a: VersaoComNomes, b: VersaoComNomes) =>
  a.nomes.modalidade.localeCompare(b.nomes.modalidade) ||
  a.nomes.especialidade.localeCompare(b.nomes.especialidade) ||
  a.nomes.categoria.localeCompare(b.nomes.categoria) ||
  a.nomes.prioridade.localeCompare(b.nomes.prioridade) ||
  (a.faixaInicio ?? -1) - (b.faixaInicio ?? -1) ||
  (a.vigenciaDesde ?? '').localeCompare(b.vigenciaDesde ?? '');

/** Tabela de preços do cliente (ou padrão do contratado): versões em vigor e programadas. */
export class ListarPrecos {
  constructor(
    private readonly repo: PrecosRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(dono: Dono, filtro: Paginacao & { busca?: string }): Promise<TabelaPrecos> {
    const info = await exigirDono(this.repo, dono);
    const ctx = await contexto(this.competencias, this.agora);
    const atuais = (await this.repo.listarVersoes(dono)).filter(
      (v) => v.vigenciaAte === null || v.vigenciaAte >= ctx.mesAtual,
    );
    const duplicados = arranjosDuplicados(atuais);
    const termos = chave(filtro.busca ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const filtrados = atuais
      .filter((v) => {
        const texto = chave(Object.values(v.nomes).join(' '));
        return termos.every((t) => texto.includes(t));
      })
      .sort(ordem);
    const ultima = [...ctx.bloqueadas].sort().at(-1);
    const minimo = ultima ? proxima(ultima) : ctx.mesAtual;
    const [sugerido] = [proxima(ctx.mesAtual), minimo].sort().reverse() as [string];
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return {
      dono: info,
      mesAtual: ctx.mesAtual,
      aPartirDeMinimo: minimo,
      aPartirDeSugerido: sugerido,
      itens: filtrados.slice(inicio, inicio + filtro.porPagina).map((v) => ({
        ...v,
        duplicado: duplicados.has(v.id),
        emVigor: vigenteEm(v, ctx.mesAtual),
      })),
      total: filtrados.length,
    };
  }
}

/** Uma versão no histórico do arranjo, com quem criou e quem encerrou. */
export interface VersaoHistorico extends VersaoComNomes {
  criadoPor: string | null;
  criadoEm: Date | null;
  encerradoPor: string | null;
  encerradoEm: Date | null;
}

/** Todas as versões de um arranjo (todas as faixas), da mais nova para a mais antiga. */
export class HistoricoPreco {
  constructor(private readonly repo: PrecosRepository) {}

  async executar(dono: Dono, arranjo: Arranjo): Promise<VersaoHistorico[]> {
    await exigirDono(this.repo, dono);
    const versoes = await this.repo.listarVersoes(dono, arranjo);
    const eventos = await this.repo.eventos(
      dono,
      versoes.map((v) => v.id),
    );
    return versoes
      .sort(
        (a, b) =>
          (b.vigenciaDesde ?? '').localeCompare(a.vigenciaDesde ?? '') ||
          (a.faixaInicio ?? -1) - (b.faixaInicio ?? -1),
      )
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

export interface ResultadoImportacao {
  incluidos: number;
  alterados: number;
  iguais: number;
}

const mesmaChave = (a: DadosPreco, b: DadosPreco) =>
  a.modalidadeId === b.modalidadeId &&
  a.especialidadeId === b.especialidadeId &&
  a.categoriaId === b.categoriaId &&
  a.prioridadeId === b.prioridadeId &&
  a.faixaInicio === b.faixaInicio &&
  a.faixaFim === b.faixaFim;

/**
 * Incluir, alterar, encerrar e importar preços. Nada se sobrescreve: cada mudança encerra a versão
 * e cria outra (ver `versoes-preco`), sempre a partir de competência aberta ou futura, com evento
 * de auditoria por versão criada, encerrada ou apagada.
 */
export class MudarPrecos {
  constructor(
    private readonly repo: PrecosRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async incluir(usuarioId: string, dono: Dono, dados: DadosPreco, aPartirDe: string) {
    const { versoes, ctx } = await this.carregar(dono);
    const [id] = await this.gravar(
      usuarioId,
      dono,
      planejarInclusao(dados, aPartirDe, versoes, ctx),
      versoes,
    );
    return id as string;
  }

  async alterar(usuarioId: string, dono: Dono, id: string, dados: DadosPreco, aPartirDe: string) {
    const { versoes, ctx } = await this.carregar(dono);
    const [novo] = await this.gravar(
      usuarioId,
      dono,
      planejarAlteracao(id, dados, aPartirDe, versoes, ctx),
      versoes,
    );
    return novo as string;
  }

  async encerrar(usuarioId: string, dono: Dono, id: string, aPartirDe: string) {
    const { versoes, ctx } = await this.carregar(dono);
    await this.gravar(usuarioId, dono, planejarEncerramento(id, aPartirDe, versoes, ctx), versoes);
  }

  /**
   * A planilha inteira ou nada: cada linha inclui o arranjo e faixa que não existem a partir de
   * `aPartirDe` ou altera o que existe (a linha igual fica como está). Não encerra o que a planilha
   * não traz.
   */
  async importar(
    usuarioId: string,
    dono: Dono,
    csv: string,
    aPartirDe: string,
  ): Promise<ResultadoImportacao> {
    const { versoes, ctx } = await this.carregar(dono);
    validarAPartirDe(aPartirDe, ctx);
    const lida = lerPlanilhaPrecos(csv, await this.repo.opcoes());
    const erros = [...lida.erros];
    const mudancas: MudancaPreco[] = [];
    const r: ResultadoImportacao = { incluidos: 0, alterados: 0, iguais: 0 };
    const vistas: { linha: number; dados: DadosPreco }[] = [];
    for (const { linha, dados } of lida.linhas) {
      const repetida = vistas.find((v) => mesmaChave(v.dados, dados));
      if (repetida) {
        erros.push({ linha, erro: `Mesmo arranjo e faixa da linha ${repetida.linha}.` });
        continue;
      }
      vistas.push({ linha, dados });
      try {
        const atual = versoes.find(
          (v) => mesmaChave(v, dados) && (v.vigenciaAte === null || v.vigenciaAte >= aPartirDe),
        );
        if (!atual) {
          mudancas.push(...planejarInclusao(dados, aPartirDe, versoes, ctx));
          r.incluidos += 1;
        } else if (atual.valor === dados.valor && atual.condVolume === dados.condVolume) {
          r.iguais += 1;
        } else {
          mudancas.push(...planejarAlteracao(atual.id, dados, aPartirDe, versoes, ctx));
          r.alterados += 1;
        }
      } catch (e) {
        if (!(e instanceof ErroDeDominio)) throw e;
        erros.push({ linha, erro: e.message });
      }
    }
    if (erros.length)
      throw new PlanilhaPrecosInvalidaError(erros.sort((a, b) => a.linha - b.linha));
    if (mudancas.length) await this.gravar(usuarioId, dono, mudancas, versoes);
    return r;
  }

  private async carregar(dono: Dono) {
    await exigirDono(this.repo, dono);
    return {
      versoes: (await this.repo.listarVersoes(dono)) as VersaoPreco[],
      ctx: await contexto(this.competencias, this.agora),
    };
  }

  private async gravar(
    usuarioId: string,
    dono: Dono,
    mudancas: MudancaPreco[],
    versoes: VersaoPreco[],
  ): Promise<string[]> {
    const criadas = await this.repo.aplicar(dono, mudancas, { usuarioId });
    const em = this.agora();
    const entidade = ENTIDADE_PRECO[dono.tipo];
    const donoCampo = dono.tipo === 'cliente' ? 'clienteId' : 'contratadoId';
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    let i = 0;
    for (const m of mudancas) {
      if (m.tipo === 'criar') {
        await this.auditoria.registrar({
          ator,
          entidade,
          entidadeId: criadas[i++] as string,
          acao: 'criado',
          depois: {
            [donoCampo]: dono.id,
            ...m.dados,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
          },
          em,
        });
      } else if (m.tipo === 'encerrar') {
        await this.auditoria.registrar({
          ator,
          entidade,
          entidadeId: m.id,
          acao: 'encerrado',
          antes: { vigenciaAte: m.vigenciaAteAntes },
          depois: { vigenciaAte: m.vigenciaAte },
          em,
        });
      } else {
        const { id, ...antes } = versoes.find((v) => v.id === m.id) as VersaoPreco;
        await this.auditoria.registrar({
          ator,
          entidade,
          entidadeId: id,
          acao: 'removido',
          antes: { [donoCampo]: dono.id, ...antes },
          em,
        });
      }
    }
    return criadas;
  }
}

/** A tabela em vigor no mês atual, na planilha do modelo da importação. */
export class ExportarPrecos {
  constructor(
    private readonly repo: PrecosRepository,
    private readonly agora: () => Date,
  ) {}

  async executar(dono: Dono): Promise<{ nomeArquivo: string; conteudo: string }> {
    const info = await exigirDono(this.repo, dono);
    const mes = diaBrasilia(this.agora()).slice(0, 7);
    const versoes = (await this.repo.listarVersoes(dono))
      .filter((v) => vigenteEm(v, mes))
      .sort(ordem);
    const nome = info.nome.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
    return {
      nomeArquivo: `precos-${nome || 'tabela'}-${mes}.csv`,
      conteudo: gerarPlanilhaPrecos(
        versoes.map((v) => ({
          ...v.nomes,
          faixaInicio: v.faixaInicio,
          faixaFim: v.faixaFim,
          condVolume: v.condVolume,
          valor: v.valor,
        })),
      ),
    };
  }
}

/** Cadastros para os seletores da tela. */
export class OpcoesPrecos {
  constructor(private readonly repo: PrecosRepository) {}

  executar(): Promise<OpcoesPreco> {
    return this.repo.opcoes();
  }
}
