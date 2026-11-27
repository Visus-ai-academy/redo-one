import type { Auditoria } from '../../../auditoria/auditoria';
import {
  type MudancaVersao,
  planejarAlteracaoVersao,
  planejarCancelamento,
  programada,
  VersaoNaoEncontradaRepasseError,
} from '../../domain/versoes';
import {
  aPartirDeMinimo,
  type ContextoVigencia,
  proxima,
  VigenciaRepasseInvalidaError,
} from '../../domain/vigencia';
import type { AgendadorRepasse } from '../ports/agendador-repasse';
import type {
  AlternativaPrecoRepasse,
  ConfiguracaoRepasseRepository,
  ParametrosRepasse,
  Reclassificacao,
} from '../ports/configuracao-repasse.repository';
import type { EventoDaVersao } from '../ports/regras-medico.repository';
import type { VersoesConfiguracaoRepository } from '../ports/versoes-configuracao.repository';
import { ConfiguracaoInvalidaError, validarReclassificacao } from './configuracao';

const ENTIDADE = {
  reclassificacao: 'reclassificacao_repasse',
  alternativa: 'alternativa_preco_repasse',
  parametros: 'parametros_repasse',
} as const;

const mesDeBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).slice(0, 7);

/** Quem criou, encerrou, cancelou e reabriu (dos eventos); sem evento de criação = veio da carga. */
export interface AutoriaVersao {
  criadoPor: string | null;
  criadoEm: Date | null;
  encerradoPor: string | null;
  encerradoEm: Date | null;
  reabertoPor: string | null;
  reabertoEm: Date | null;
}

const autoriaDe = (eventos: EventoDaVersao[] = []): AutoriaVersao => {
  const ultimo = (...acoes: string[]) => eventos.filter((e) => acoes.includes(e.acao)).at(-1);
  const criado = eventos.find((e) => e.acao === 'criada' || e.acao === 'criado');
  const encerrado = ultimo('encerrada', 'encerrado');
  const reaberto = ultimo('reaberta');
  return {
    criadoPor: criado?.quem ?? null,
    criadoEm: criado?.em ?? null,
    encerradoPor: encerrado?.quem ?? null,
    encerradoEm: encerrado?.em ?? null,
    reabertoPor: reaberto?.quem ?? null,
    reabertoEm: reaberto?.em ?? null,
  };
};

export interface VigenciaDaTelaConfiguracao {
  mesAtual: string;
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
}

const daTela = (ctx: ContextoVigencia): VigenciaDaTelaConfiguracao => {
  const minimo = aPartirDeMinimo(ctx);
  return {
    mesAtual: ctx.mesAtual,
    aPartirDeMinimo: minimo,
    aPartirDeSugerido: [proxima(ctx.mesAtual), minimo].sort().at(-1) as string,
  };
};

abstract class CasoVersoes {
  constructor(
    protected readonly repo: ConfiguracaoRepasseRepository,
    protected readonly versoes: VersoesConfiguracaoRepository,
    protected readonly auditoria: Auditoria,
    protected readonly agendador: AgendadorRepasse,
    protected readonly agora: () => Date,
  ) {}

  protected async contexto(): Promise<ContextoVigencia> {
    return { mesAtual: mesDeBrasilia(this.agora()), bloqueadas: await this.repo.bloqueadas() };
  }

  protected async registrar(
    usuarioId: string,
    entidade: string,
    mudancas: MudancaVersao[],
    nova: { id: string; depois: Record<string, unknown> } | null,
  ) {
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    const em = this.agora();
    const acao = { encerrar: 'encerrada', remover: 'cancelada', reabrir: 'reaberta' } as const;
    for (const m of mudancas)
      await this.auditoria.registrar({
        ator,
        entidade,
        entidadeId: m.id,
        acao: acao[m.tipo],
        antes: { vigenciaAte: m.vigenciaAteAntes },
        ...(m.tipo === 'remover' ? {} : { depois: { vigenciaAte: m.vigenciaAte } }),
        em,
      });
    if (nova)
      await this.auditoria.registrar({
        ator,
        entidade,
        entidadeId: nova.id,
        acao: 'criada',
        depois: nova.depois,
        em,
      });
  }
}

/** Nomes de cada recorte para a tela (o id que sumiu do catálogo aparece como está). */
export interface NomesReclassificacao {
  modalidades: string[] | null;
  especialidades: string[] | null;
  categorias: string[] | null;
  equipes: string[] | null;
  especialidadeDestino: string | null;
  categoriaDestino: string | null;
}

export interface NomesAlternativa {
  especialidade: string | null;
  categoriaOrigem: string | null;
  categoriaDestino: string;
}

/** Reclassificações e alternativas, todas as versões, com os nomes e quem mexeu. */
export class ListarRegrasComNomes extends CasoVersoes {
  async executar() {
    const [reclassificacoes, alternativas, nomes, ctx] = await Promise.all([
      this.repo.listarReclassificacoes(),
      this.repo.listarAlternativas(),
      this.versoes.nomes(),
      this.contexto(),
    ]);
    const nome = (id: string) => nomes.get(id) ?? id;
    const lista = (ids: string[] | null) => (ids === null ? null : ids.map(nome));
    const [evR, evA] = await Promise.all([
      this.versoes.eventos(
        ENTIDADE.reclassificacao,
        reclassificacoes.map((r) => r.id),
      ),
      this.versoes.eventos(
        ENTIDADE.alternativa,
        alternativas.map((a) => a.id),
      ),
    ]);
    return {
      ...daTela(ctx),
      reclassificacoes: reclassificacoes.map((r) => ({
        ...r,
        ...autoriaDe(evR.get(r.id)),
        nomes: {
          modalidades: lista(r.modalidadeIds),
          especialidades: lista(r.especialidadeIds),
          categorias: lista(r.categoriaIds),
          equipes: lista(r.equipeIds),
          especialidadeDestino: r.especialidadeDestinoId ? nome(r.especialidadeDestinoId) : null,
          categoriaDestino: r.categoriaDestinoId ? nome(r.categoriaDestinoId) : null,
        } satisfies NomesReclassificacao,
      })),
      alternativas: alternativas.map((a) => ({
        ...a,
        ...autoriaDe(evA.get(a.id)),
        nomes: {
          especialidade: a.especialidadeId ? nome(a.especialidadeId) : null,
          categoriaOrigem: a.categoriaOrigemId ? nome(a.categoriaOrigemId) : null,
          categoriaDestino: nome(a.categoriaDestinoId),
        } satisfies NomesAlternativa,
      })),
    };
  }
}

/** Versões dos parâmetros (a mais nova primeiro), com o contratado pelo nome e quem criou. */
export class ListarParametrosComAutoria extends CasoVersoes {
  async executar() {
    const [parametros, nomes, ctx] = await Promise.all([
      this.repo.listarParametros(),
      this.versoes.nomes(),
      this.contexto(),
    ]);
    const eventos = await this.versoes.eventos(
      ENTIDADE.parametros,
      parametros.map((p) => p.id),
    );
    // Os parâmetros não têm fim gravado: cada versão vale até a véspera da seguinte.
    const ordenados = [...parametros].sort((a, b) =>
      b.vigenciaDesde.localeCompare(a.vigenciaDesde),
    );
    return {
      ...daTela(ctx),
      versoes: ordenados.map((p, i) => ({
        ...p,
        ...autoriaDe(eventos.get(p.id)),
        vigenciaAte:
          i === 0 ? null : anteriorDe((ordenados[i - 1] as ParametrosRepasse).vigenciaDesde),
        contratadoRegistro: p.contratadoRegistroId
          ? (nomes.get(p.contratadoRegistroId) ?? null)
          : null,
      })),
    };
  }
}

const anteriorDe = (c: string) => {
  const [a, m] = c.split('-').map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

type DadosReclassificacao = Omit<Reclassificacao, 'id' | 'vigenciaDesde' | 'vigenciaAte'>;
type DadosAlternativa = Omit<AlternativaPrecoRepasse, 'id' | 'vigenciaDesde' | 'vigenciaAte'>;

/** Editar a reclassificação: a versão vale até a véspera e a nova começa em `aPartirDe`. */
export class AlterarReclassificacao extends CasoVersoes {
  async executar(
    usuarioId: string,
    id: string,
    aPartirDe: string,
    dados: DadosReclassificacao,
  ): Promise<string> {
    validarReclassificacao(dados);
    const validada = { ...dados, descricao: dados.descricao.trim() };
    const lista = await this.repo.listarReclassificacoes();
    const { mudancas, vigenciaAte } = planejarAlteracaoVersao(
      id,
      aPartirDe,
      lista,
      await this.contexto(),
    );
    const novoId = (await this.versoes.gravarReclassificacao(
      mudancas,
      { ...validada, vigenciaDesde: aPartirDe, vigenciaAte },
      usuarioId,
      this.agora(),
    )) as string;
    await this.registrar(usuarioId, ENTIDADE.reclassificacao, mudancas, {
      id: novoId,
      depois: { aPartirDe, ...validada },
    });
    await this.agendador.previas();
    return novoId;
  }
}

export class AlterarAlternativaPreco extends CasoVersoes {
  async executar(
    usuarioId: string,
    id: string,
    aPartirDe: string,
    a: DadosAlternativa,
  ): Promise<string> {
    if (a.semCategoria === (a.categoriaOrigemId !== null))
      throw new ConfiguracaoInvalidaError(
        'Escolha a categoria de origem ou marque "laudo sem categoria".',
      );
    const lista = await this.repo.listarAlternativas();
    const { mudancas, vigenciaAte } = planejarAlteracaoVersao(
      id,
      aPartirDe,
      lista,
      await this.contexto(),
    );
    const novoId = (await this.versoes.gravarAlternativa(
      mudancas,
      { ...a, vigenciaDesde: aPartirDe, vigenciaAte },
      usuarioId,
      this.agora(),
    )) as string;
    await this.registrar(usuarioId, ENTIDADE.alternativa, mudancas, {
      id: novoId,
      depois: { aPartirDe, ...a },
    });
    await this.agendador.previas();
    return novoId;
  }
}

/**
 * Cancelar a versão programada criada por engano. Reclassificação e alternativa: a versão de
 * mesma ordem que ela encerrou volta a valer. Parâmetros: a versão anterior segue valendo.
 */
export class CancelarVersaoConfiguracao extends CasoVersoes {
  async executar(
    usuarioId: string,
    qual: 'reclassificacao' | 'alternativa' | 'parametros',
    id: string,
  ): Promise<void> {
    const ctx = await this.contexto();
    let mudancas: MudancaVersao[];
    if (qual === 'parametros') {
      const p = (await this.repo.listarParametros()).find((x) => x.id === id);
      if (!p) throw new VersaoNaoEncontradaRepasseError();
      if (!programada({ ...p, vigenciaAte: null }, ctx) || p.vigenciaDesde < aPartirDeMinimo(ctx))
        throw new VigenciaRepasseInvalidaError(
          'Só a versão programada (que ainda não valeu) pode ser cancelada; para mudar a que vale, crie uma versão nova.',
        );
      if (!(await this.versoes.excluirParametros(id))) throw new VersaoNaoEncontradaRepasseError();
      mudancas = [{ tipo: 'remover', id, vigenciaAteAntes: null }];
    } else {
      const lista: (Reclassificacao | AlternativaPrecoRepasse)[] =
        qual === 'reclassificacao'
          ? await this.repo.listarReclassificacoes()
          : await this.repo.listarAlternativas();
      mudancas = planejarCancelamento(id, lista, ctx, (a, b) => a.ordem === b.ordem);
      if (qual === 'reclassificacao')
        await this.versoes.gravarReclassificacao(mudancas, null, usuarioId, this.agora());
      else await this.versoes.gravarAlternativa(mudancas, null, usuarioId, this.agora());
    }
    await this.registrar(usuarioId, ENTIDADE[qual], mudancas, null);
    await this.agendador.previas();
  }
}
