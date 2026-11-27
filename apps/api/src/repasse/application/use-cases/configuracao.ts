import type { Auditoria } from '../../../auditoria/auditoria';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import { anterior, validarAPartirDe } from '../../domain/vigencia';
import type { AgendadorRepasse } from '../ports/agendador-repasse';
import type {
  AlternativaPrecoRepasse,
  ConfiguracaoRepasseRepository,
  DadosParametros,
  ParametrosRepasse,
  Reclassificacao,
} from '../ports/configuracao-repasse.repository';

export class ConfiguracaoInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class VersaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Versão não encontrada (ou já encerrada antes dessa competência).');
  }
}

/** Mês atual em Brasília ("AAAA-MM"). */
const mesAtual = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).slice(0, 7);

/** Base dos casos de uso da configuração: vigência validada, auditoria e prévias refeitas. */
abstract class MudancaConfiguracao {
  constructor(
    protected readonly repo: ConfiguracaoRepasseRepository,
    protected readonly auditoria: Auditoria,
    protected readonly agendador: AgendadorRepasse,
    protected readonly agora: () => Date,
  ) {}

  protected async validar(aPartirDe: string) {
    validarAPartirDe(aPartirDe, {
      mesAtual: mesAtual(this.agora()),
      bloqueadas: await this.repo.bloqueadas(),
    });
  }

  protected async registrar(
    usuarioId: string,
    entidade: string,
    entidadeId: string,
    acao: string,
    depois: Record<string, unknown>,
  ) {
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade,
      entidadeId,
      acao,
      depois,
      em: this.agora(),
    });
    await this.agendador.previas();
  }
}

const dia = (n: number, rotulo: string) => {
  if (!Number.isInteger(n) || n < 1 || n > 28)
    throw new ConfiguracaoInvalidaError(`${rotulo}: um dia de 1 a 28.`);
};
const positivo = (n: number, rotulo: string) => {
  if (!Number.isInteger(n) || n <= 0)
    throw new ConfiguracaoInvalidaError(`${rotulo}: um valor maior que zero.`);
};

/** Parâmetros: só se cria versão nova ("vale a partir de"); a vigente vale até a véspera dela. */
export class CriarVersaoParametros extends MudancaConfiguracao {
  async executar(usuarioId: string, aPartirDe: string, dados: DadosParametros): Promise<string> {
    await this.validar(aPartirDe);
    positivo(dados.tarifaPeerReviewCentavos, 'Tarifa do Peer Review');
    positivo(dados.tarifaPlantaoCentavos, 'Tarifa do Plantão');
    dia(dados.diaVencimento, 'Dia do vencimento');
    dia(dados.diaCorteAntecipacao, 'Dia do corte da antecipação');
    if (!dados.categoriaFinanceiraSocio.trim() || !dados.categoriaFinanceiraNaoSocio.trim())
      throw new ConfiguracaoInvalidaError(
        'Informe as categorias financeiras de sócio e não sócio.',
      );
    const exames = dados.faixasListaAtraso.map((f) => f.exames);
    if (
      new Set(exames).size !== exames.length ||
      dados.faixasListaAtraso.some(
        (f) =>
          !Number.isInteger(f.exames) ||
          f.exames < 1 ||
          !Number.isInteger(f.valorCentavos) ||
          f.valorCentavos < 0,
      )
    )
      throw new ConfiguracaoInvalidaError(
        'Faixas da lista em atraso: exames distintos, a partir de 1.',
      );
    if (
      dados.contratadoRegistroId &&
      !(await this.repo.contratadoExiste(dados.contratadoRegistroId))
    )
      throw new ConfiguracaoInvalidaError('Contratado não encontrado.');
    if ((await this.repo.listarParametros()).some((p) => p.vigenciaDesde === aPartirDe))
      throw new ConfiguracaoInvalidaError('Já há uma versão dos parâmetros nessa competência.');
    const id = await this.repo.criarParametros(aPartirDe, dados, usuarioId, this.agora());
    await this.registrar(usuarioId, 'parametros_repasse', id, 'criado', { aPartirDe, ...dados });
    return id;
  }
}

export class ListarParametros {
  constructor(private readonly repo: ConfiguracaoRepasseRepository) {}
  executar(): Promise<ParametrosRepasse[]> {
    return this.repo.listarParametros();
  }
}

type Recorte = string[] | null;
const recorte = (lista: Recorte, rotulo: string) => {
  if (lista !== null && lista.length === 0)
    throw new ConfiguracaoInvalidaError(
      `${rotulo}: escolha ao menos um ou marque "todos" (vazio nunca é todos).`,
    );
};

/** Descrição, recortes com "todos" explícito e ao menos um destino (criar e alterar). */
export function validarReclassificacao(
  r: Omit<Reclassificacao, 'id' | 'vigenciaDesde' | 'vigenciaAte'>,
): void {
  if (!r.descricao.trim()) throw new ConfiguracaoInvalidaError('Descreva a reclassificação.');
  recorte(r.modalidadeIds, 'Modalidades');
  recorte(r.especialidadeIds, 'Especialidades');
  recorte(r.categoriaIds, 'Categorias');
  recorte(r.equipeIds, 'Equipes');
  if (!r.especialidadeDestinoId && !r.categoriaDestinoId)
    throw new ConfiguracaoInvalidaError('Informe a especialidade ou a categoria de destino.');
}

export class CriarReclassificacao extends MudancaConfiguracao {
  async executar(
    usuarioId: string,
    aPartirDe: string,
    r: Omit<Reclassificacao, 'id' | 'vigenciaDesde' | 'vigenciaAte'>,
  ): Promise<string> {
    await this.validar(aPartirDe);
    validarReclassificacao(r);
    const id = await this.repo.criarReclassificacao(
      { ...r, descricao: r.descricao.trim(), vigenciaDesde: aPartirDe },
      usuarioId,
      this.agora(),
    );
    await this.registrar(usuarioId, 'reclassificacao_repasse', id, 'criada', { aPartirDe, ...r });
    return id;
  }
}

export class CriarAlternativaPreco extends MudancaConfiguracao {
  async executar(
    usuarioId: string,
    aPartirDe: string,
    a: Omit<AlternativaPrecoRepasse, 'id' | 'vigenciaDesde' | 'vigenciaAte'>,
  ): Promise<string> {
    await this.validar(aPartirDe);
    if (a.semCategoria === (a.categoriaOrigemId !== null))
      throw new ConfiguracaoInvalidaError(
        'Escolha a categoria de origem ou marque "laudo sem categoria".',
      );
    const id = await this.repo.criarAlternativa(
      { ...a, vigenciaDesde: aPartirDe },
      usuarioId,
      this.agora(),
    );
    await this.registrar(usuarioId, 'alternativa_preco_repasse', id, 'criada', { aPartirDe, ...a });
    return id;
  }
}

/** Encerra a reclassificação ou a alternativa: deixa de valer a partir da competência informada. */
export class EncerrarConfiguracao extends MudancaConfiguracao {
  async executar(
    usuarioId: string,
    qual: 'reclassificacao' | 'alternativa',
    id: string,
    aPartirDe: string,
  ): Promise<void> {
    await this.validar(aPartirDe);
    const ate = anterior(aPartirDe);
    const ok =
      qual === 'reclassificacao'
        ? await this.repo.encerrarReclassificacao(id, ate)
        : await this.repo.encerrarAlternativa(id, ate);
    if (!ok) throw new VersaoNaoEncontradaError();
    const entidade =
      qual === 'reclassificacao' ? 'reclassificacao_repasse' : 'alternativa_preco_repasse';
    await this.registrar(usuarioId, entidade, id, 'encerrada', { vigenciaAte: ate });
  }
}

export class ListarRegrasDoRepasse {
  constructor(private readonly repo: ConfiguracaoRepasseRepository) {}
  async executar() {
    return {
      reclassificacoes: await this.repo.listarReclassificacoes(),
      alternativas: await this.repo.listarAlternativas(),
    };
  }
}
