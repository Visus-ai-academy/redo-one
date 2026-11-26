import type { Auditoria } from '../../../auditoria/auditoria';
import type { CompetenciasBloqueadas } from '../../../ingestao/application/ports/competencias-bloqueadas';
import { diaBrasilia } from '../../../ingestao/domain/competencia';
import {
  alternativasEm,
  type ParametrosDemonstrativo,
  ParametrosInvalidosError,
  parametrosEm,
  validarAlternativa,
} from '../../domain/parametros-demonstrativo';
import {
  aPartirDeMinimo,
  type ContextoVigencia,
  proxima,
  validarAPartirDe,
} from '../../domain/versoes-preco';
import type {
  ParametrosDemonstrativoRepository,
  VersaoAlternativaRegistrada,
  VersaoParametrosRegistrada,
} from '../ports/parametros-demonstrativo.repository';

async function contexto(
  competencias: CompetenciasBloqueadas,
  agora: () => Date,
): Promise<ContextoVigencia> {
  return { mesAtual: diaBrasilia(agora()).slice(0, 7), bloqueadas: await competencias.listar() };
}

/** A primeira competência em que uma mudança pode valer e a sugerida (a próxima). */
function aPartirDe(ctx: ContextoVigencia) {
  const minimo = aPartirDeMinimo(ctx);
  const sugerido = [proxima(ctx.mesAtual), minimo].sort().at(-1) as string;
  return { mesAtual: ctx.mesAtual, aPartirDeMinimo: minimo, aPartirDeSugerido: sugerido };
}

const maisNovaPrimeiro = <T extends { desde: string | null; criadoEm: Date }>(a: T, b: T) =>
  (b.desde ?? '').localeCompare(a.desde ?? '') || b.criadoEm.getTime() - a.criadoEm.getTime();

export interface QuadroParametros {
  mesAtual: string;
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
  /** O que vale no mês atual. */
  vigente: ParametrosDemonstrativo;
  /** Todas as versões, a mais nova primeiro. */
  historico: VersaoParametrosRegistrada[];
}

export class ListarParametrosDemonstrativo {
  constructor(
    private readonly repo: ParametrosDemonstrativoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<QuadroParametros> {
    const [ctx, versoes] = await Promise.all([
      contexto(this.competencias, this.agora),
      this.repo.listarParametros(),
    ]);
    return {
      ...aPartirDe(ctx),
      vigente: parametrosEm(versoes, ctx.mesAtual),
      historico: [...versoes].sort(maisNovaPrimeiro),
    };
  }
}

export interface PedidoParametros extends ParametrosDemonstrativo {
  aPartirDe: string;
}

/** Cria a versão nova dos parâmetros, só a partir de competência aberta ou futura. Auditada. */
export class MudarParametrosDemonstrativo {
  constructor(
    private readonly repo: ParametrosDemonstrativoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, { aPartirDe, ...dados }: PedidoParametros): Promise<string> {
    validarAPartirDe(aPartirDe, await contexto(this.competencias, this.agora));
    if (dados.categoriaPadraoId && !(await this.repo.categoriaExiste(dados.categoriaPadraoId))) {
      throw new ParametrosInvalidosError('A categoria padrão não existe no catálogo.');
    }
    if (dados.prioridadePadraoId && !(await this.repo.prioridadeExiste(dados.prioridadePadraoId))) {
      throw new ParametrosInvalidosError('A prioridade padrão não existe no catálogo.');
    }
    const em = this.agora();
    const id = await this.repo.criarParametros(aPartirDe, dados, { usuarioId, em });
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'parametros_demonstrativo',
      entidadeId: id,
      acao: 'criado',
      depois: { desde: aPartirDe, ...dados },
      em,
    });
    return id;
  }
}

export interface QuadroAlternativas {
  mesAtual: string;
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
  /** Os pares que valem no mês atual. */
  vigentes: { prioridadeId: string; alternativaId: string }[];
  historico: VersaoAlternativaRegistrada[];
}

export class ListarAlternativasPreco {
  constructor(
    private readonly repo: ParametrosDemonstrativoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<QuadroAlternativas> {
    const [ctx, versoes] = await Promise.all([
      contexto(this.competencias, this.agora),
      this.repo.listarAlternativas(),
    ]);
    return {
      ...aPartirDe(ctx),
      vigentes: [...alternativasEm(versoes, ctx.mesAtual)].map(([prioridadeId, alternativaId]) => ({
        prioridadeId,
        alternativaId,
      })),
      historico: [...versoes].sort(maisNovaPrimeiro),
    };
  }
}

export interface PedidoAlternativa {
  aPartirDe: string;
  prioridadeId: string;
  /** Nulo = sem alternativa a partir de `aPartirDe`. */
  alternativaId: string | null;
}

export class MudarAlternativaPreco {
  constructor(
    private readonly repo: ParametrosDemonstrativoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(
    usuarioId: string,
    { aPartirDe, prioridadeId, alternativaId }: PedidoAlternativa,
  ): Promise<string> {
    validarAPartirDe(aPartirDe, await contexto(this.competencias, this.agora));
    validarAlternativa(prioridadeId, alternativaId);
    for (const id of [prioridadeId, alternativaId]) {
      if (id && !(await this.repo.prioridadeExiste(id))) {
        throw new ParametrosInvalidosError('A prioridade não existe no catálogo.');
      }
    }
    const em = this.agora();
    const id = await this.repo.criarAlternativa(
      aPartirDe,
      { prioridadeId, alternativaId },
      { usuarioId, em },
    );
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'prioridade_alternativa_preco',
      entidadeId: id,
      acao: 'criado',
      depois: { desde: aPartirDe, prioridadeId, alternativaId },
      em,
    });
    return id;
  }
}
