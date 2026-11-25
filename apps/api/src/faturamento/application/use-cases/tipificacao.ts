import type { Auditoria } from '../../../auditoria/auditoria';
import {
  type Conhecidos,
  NomeTipificacaoEmUsoError,
  prepararConfiguracao,
  prepararRegra,
  RegraTipificacaoNaoEncontradaError,
  TipificacaoInvalidaError,
} from '../../domain/configuracao-tipificacao';
import {
  type ConfiguracaoCliente,
  type ConfiguracaoTipificacao,
  montarTipificador,
} from '../../domain/tipificacao';
import { ClienteNaoEncontradoError } from '../../domain/vigencia-corte';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import type { EquipesMedicos } from '../ports/equipes-medicos';
import type {
  ClienteDaTipificacao,
  ConfiguracaoRegistrada,
  DadosRegra,
  DadosSubregra,
  Opcao,
  OpcoesTipificacao,
  RegraRegistrada,
  SubregraRegistrada,
  TipificacaoRepository,
} from '../ports/tipificacao.repository';

type Configuracao = Omit<ConfiguracaoCliente, 'clienteId'>;

/** Os campos que mudaram, antes e depois (nulo se nada mudou). */
function mudanca<T extends object>(antes: T, depois: T) {
  const campos = (Object.keys(depois) as (keyof T)[]).filter(
    (k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]),
  );
  if (!campos.length) return null;
  return {
    antes: Object.fromEntries(campos.map((k) => [k, antes[k]])),
    depois: Object.fromEntries(campos.map((k) => [k, depois[k]])),
  };
}

/** Configurações → Faturamento → Tipificação: as regras e as sub-regras. */
export class ListarTipificacao {
  constructor(private readonly repo: TipificacaoRepository) {}

  async executar(): Promise<{ regras: RegraRegistrada[]; subregras: SubregraRegistrada[] }> {
    const [regras, subregras] = await Promise.all([
      this.repo.listarRegras(),
      this.repo.listarSubregras(),
    ]);
    return { regras, subregras };
  }
}

/** Cria ou altera uma regra (CO/NC/NC1...). Auditada; a mudança reclassifica as abertas. */
export class SalvarRegraTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, id: string | null, entrada: DadosRegra): Promise<string> {
    const dados = prepararRegra(entrada);
    const atual = id ? (await this.repo.listarRegras()).find((r) => r.id === id) : undefined;
    if (id && !atual) throw new RegraTipificacaoNaoEncontradaError();
    const mesmoNome = await this.repo.regraComNome(dados.nome);
    if (mesmoNome && mesmoNome !== id) throw new NomeTipificacaoEmUsoError();
    const antes: DadosRegra | undefined = atual && {
      nome: atual.nome,
      descricao: atual.descricao,
      cor: atual.cor,
      faturaSemSubregra: atual.faturaSemSubregra,
      ativo: atual.ativo,
    };
    const diferenca = antes ? mudanca(antes, dados) : null;
    if (antes && !diferenca) return id as string;
    // Nome, cor, descrição e situação não mudam a tipificação de nenhum laudo (inativa segue
    // classificando onde já está, como no dashboards-one); regra nova ainda não é usada.
    const reclassificar = Boolean(antes && antes.faturaSemSubregra !== dados.faturaSemSubregra);
    const salvo = await this.repo.salvarRegra(id, dados, reclassificar);
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'regra_tipificacao',
      entidadeId: salvo,
      acao: antes ? 'alterada' : 'criada',
      ...(diferenca ?? { depois: { ...dados } }),
      em: this.agora(),
    });
    return salvo;
  }
}

/** Cria ou altera uma sub-regra (CO-FT, NC-NF...), com o "fatura". Auditada; reclassifica. */
export class SalvarSubregraTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, id: string | null, entrada: DadosSubregra): Promise<string> {
    const dados = prepararRegra(entrada);
    const [regras, subregras] = await Promise.all([
      this.repo.listarRegras(),
      this.repo.listarSubregras(),
    ]);
    const atual = id ? subregras.find((s) => s.id === id) : undefined;
    if (id && !atual) throw new RegraTipificacaoNaoEncontradaError('Sub-regra');
    if (!regras.some((r) => r.id === dados.regraId))
      throw new TipificacaoInvalidaError('Regra da sub-regra não encontrada.');
    const mesmoNome = await this.repo.subregraComNome(dados.nome);
    if (mesmoNome && mesmoNome !== id) throw new NomeTipificacaoEmUsoError();
    const antes: DadosSubregra | undefined = atual && {
      regraId: atual.regraId,
      nome: atual.nome,
      descricao: atual.descricao,
      fatura: atual.fatura,
      ativo: atual.ativo,
    };
    const diferenca = antes ? mudanca(antes, dados) : null;
    if (antes && !diferenca) return id as string;
    const reclassificar = Boolean(
      antes && (antes.fatura !== dados.fatura || antes.regraId !== dados.regraId),
    );
    const salvo = await this.repo.salvarSubregra(id, dados, reclassificar);
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'subregra_tipificacao',
      entidadeId: salvo,
      acao: antes ? 'alterada' : 'criada',
      ...(diferenca ?? { depois: { ...dados } }),
      em: this.agora(),
    });
    return salvo;
  }
}

/** Listas do editor: catálogo e equipes. */
export class ListarOpcoesTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
  ) {}

  async executar(): Promise<OpcoesTipificacao & { equipes: Opcao[] }> {
    const [opcoes, equipes] = await Promise.all([
      this.repo.listarOpcoes(),
      this.equipes.listarEquipes(),
    ]);
    return { ...opcoes, equipes };
  }
}

/** Médicos pelo nome, para o filtro da linha. */
export class BuscarMedicosTipificacao {
  constructor(private readonly equipes: EquipesMedicos) {}

  executar(busca: string) {
    return this.equipes.buscarMedicos(busca.trim(), 20);
  }
}

async function exigirCliente(
  repo: TipificacaoRepository,
  clienteId: string,
): Promise<ClienteDaTipificacao> {
  const cliente = await repo.obterCliente(clienteId);
  if (!cliente) throw new ClienteNaoEncontradoError();
  return cliente;
}

export interface TipificacaoDoCliente {
  cliente: ClienteDaTipificacao;
  /** A configuração do próprio cliente ou unidade; nula = segue a do principal ou a padrão. */
  configuracao: ConfiguracaoRegistrada | null;
  /** Na unidade: a do principal, que vale enquanto ela não tem a sua. */
  doPrincipal: ConfiguracaoRegistrada | null;
  regraPadraoId: string | null;
  /** Nome dos médicos citados nas linhas. */
  medicos: { id: string; nome: string }[];
}

/** Aba Faturamento do cliente → Tipificação. */
export class ObterTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
  ) {}

  async executar(clienteId: string): Promise<TipificacaoDoCliente> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const [configuracao, doPrincipal, regras] = await Promise.all([
      this.repo.obterConfiguracaoCliente(clienteId),
      cliente.unificadoEmId ? this.repo.obterConfiguracaoCliente(cliente.unificadoEmId) : null,
      this.repo.listarRegras(),
    ]);
    const ids = [...(configuracao?.linhas ?? []), ...(doPrincipal?.linhas ?? [])].flatMap(
      (l) => l.medicos,
    );
    return {
      cliente,
      configuracao,
      doPrincipal,
      regraPadraoId: regras.find((r) => r.padrao)?.id ?? null,
      medicos: await this.equipes.nomesMedicos([...new Set(ids)]),
    };
  }
}

const semAutor = (c: ConfiguracaoRegistrada | null): Configuracao | null =>
  c && { regraId: c.regraId, subregraDemaisId: c.subregraDemaisId, linhas: c.linhas };

/** O que a configuração pode citar, conferido no banco (ids de catálogo, médicos e equipes). */
async function conhecidos(
  repo: TipificacaoRepository,
  equipes: EquipesMedicos,
  entrada: Configuracao,
  gravada: Configuracao | null,
): Promise<Conhecidos> {
  const doTipo = (tipo: Configuracao['linhas'][number]['tipo']) =>
    entrada.linhas.filter((l) => l.tipo === tipo).flatMap((l) => l.valores);
  const [regras, subregras, catalogo, medicos, equipesExistentes] = await Promise.all([
    repo.listarRegras(),
    repo.listarSubregras(),
    repo.catalogoExistente({
      modalidades: doTipo('modalidade'),
      especialidades: doTipo('especialidade'),
      prioridades: doTipo('prioridade'),
    }),
    equipes.nomesMedicos([...new Set(entrada.linhas.flatMap((l) => l.medicos))]),
    equipes.equipesExistentes([...new Set(entrada.linhas.flatMap((l) => l.equipes))]),
  ]);
  return {
    regras: new Set(regras.map((r) => r.id)),
    subregras: new Set(subregras.map((s) => s.id)),
    inativas: new Set([...regras, ...subregras].filter((r) => !r.ativo).map((r) => r.id)),
    jaGravados: new Set(
      gravada
        ? [
            gravada.regraId,
            gravada.subregraDemaisId,
            ...gravada.linhas.map((l) => l.subregraId),
          ].filter((id): id is string => Boolean(id))
        : [],
    ),
    valores: {
      modalidade: new Set(catalogo.modalidades),
      especialidade: new Set(catalogo.especialidades),
      prioridade: new Set(catalogo.prioridades),
    },
    medicos: new Set(medicos.map((m) => m.id)),
    equipes: new Set(equipesExistentes),
  };
}

/**
 * Troca a configuração do cliente ou da unidade (vazia apaga: segue a do principal ou a padrão).
 * Auditada; na mesma transação, a reclassificação dos laudos do principal nas competências abertas.
 */
export class SalvarTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, clienteId: string, entrada: Configuracao): Promise<void> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const atual = semAutor(await this.repo.obterConfiguracaoCliente(clienteId));
    const nova = prepararConfiguracao(
      entrada,
      await conhecidos(this.repo, this.equipes, entrada, atual),
    );
    if (JSON.stringify(atual) === JSON.stringify(nova)) return;
    const em = this.agora();
    await this.repo.salvarConfiguracaoCliente(
      clienteId,
      nova,
      cliente.unificadoEmId ?? cliente.id,
      { usuarioId, em },
    );
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'cliente_tipificacao',
      entidadeId: clienteId,
      acao: nova ? 'alterada' : 'removida',
      antes: { configuracao: atual },
      depois: { configuracao: nova },
      em,
    });
  }
}

export interface ContagemPrevia {
  laudos: number;
  volume: number;
}

export interface LinhaPrevia {
  competencia: string;
  regraId: string;
  subregraId: string | null;
  fatura: boolean;
  antes: ContagemPrevia;
  depois: ContagemPrevia;
}

const LOTE = 5000;

/**
 * Prévia da configuração antes de salvar: laudos e volume das competências abertas em cada
 * resultado (regra, sub-regra, fatura), com a configuração gravada e com a nova. No principal, os
 * laudos das unidades com configuração própria ficam de fora (não seguem a dele).
 */
export class PreviaTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
    private readonly competencias: CompetenciasRepository,
  ) {}

  async executar(clienteId: string, entrada: Configuracao): Promise<LinhaPrevia[]> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const gravada = semAutor(await this.repo.obterConfiguracaoCliente(clienteId));
    const nova = prepararConfiguracao(
      entrada,
      await conhecidos(this.repo, this.equipes, entrada, gravada),
    );
    const [atual, membros, bloqueadas] = await Promise.all([
      this.repo.carregarConfiguracao(),
      this.equipes.membros(),
      this.competencias.listar(),
    ]);
    if (!atual) throw new TipificacaoInvalidaError('Cadastre as regras de tipificação antes.');
    const antes: ConfiguracaoTipificacao = { ...atual, equipes: membros };
    const depois: ConfiguracaoTipificacao = {
      ...antes,
      clientes: [
        ...atual.clientes.filter((c) => c.clienteId !== clienteId),
        ...(nova ? [{ clienteId, ...nova }] : []),
      ],
    };
    const comConfiguracao = new Set(depois.clientes.map((c) => c.clienteId));
    const tipificarAntes = montarTipificador(antes);
    const tipificarDepois = montarTipificador(depois);
    const unidadeId = cliente.unificadoEmId ? cliente.id : null;

    const linhas = new Map<string, LinhaPrevia>();
    const contar = (
      competencia: string,
      t: ReturnType<typeof tipificarAntes>,
      quando: 'antes' | 'depois',
      volume: number,
    ) => {
      const k = JSON.stringify([competencia, t.regraId, t.subregraId, t.fatura]);
      const linha = linhas.get(k) ?? {
        competencia,
        ...t,
        antes: { laudos: 0, volume: 0 },
        depois: { laudos: 0, volume: 0 },
      };
      linha[quando].laudos += 1;
      linha[quando].volume += volume;
      linhas.set(k, linha);
    };
    let depoisDe: string | null = null;
    for (;;) {
      const lote = await this.repo.lerParaPrevia({
        clienteId: cliente.unificadoEmId ?? cliente.id,
        unidadeId,
        competenciasBloqueadas: bloqueadas,
        depoisDe,
        limite: LOTE,
      });
      for (const l of lote) {
        if (!unidadeId && l.unidadeId && comConfiguracao.has(l.unidadeId)) continue;
        contar(l.competencia, tipificarAntes(l), 'antes', l.volume);
        contar(l.competencia, tipificarDepois(l), 'depois', l.volume);
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }
    return [...linhas.values()].sort(
      (a, b) =>
        a.competencia.localeCompare(b.competencia) ||
        a.regraId.localeCompare(b.regraId) ||
        (a.subregraId ?? '').localeCompare(b.subregraId ?? ''),
    );
  }
}
