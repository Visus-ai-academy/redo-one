import type { Ator as AtorAuditoria, Auditoria } from '../../../auditoria/auditoria';
import { RegistroAuditoria } from '../../../catalogo/comum/registro-auditoria';
import type { Clock } from '../../../identidade/clock';
import {
  CONFIGURACAO_PADRAO,
  type ConfiguracaoFinanceira,
} from '../../domain/configuracao-financeira';
import { diaValido, hojeEmBrasilia } from '../../domain/dias';
import { NaoEncontradoError, SituacaoNaoPermiteError } from '../../domain/erros';
import {
  type AjusteDiaNaoUtil,
  type DadosRecorrencia,
  dataNominal,
  limiteDoHorizonte,
  ocorrenciasAGerar,
  prepararRecorrencia,
  previstoPorMes,
  proximaOcorrencia,
  tituloDaOcorrencia,
  vencimentoAjustado,
} from '../../domain/recorrencia';
import { prepararMotivo, type TipoTitulo } from '../../domain/titulo';
import type { ConfiguracoesFinanceiras } from '../ports/configuracoes-financeiras';
import type {
  FiltroRecorrencias,
  Recorrencia,
  RecorrenciasRepository,
} from '../ports/recorrencias.repository';
import type { Ator } from './categorias';
import type { ContextoDoTitulo } from './titulos';

const ROTULO = { entidade: 'recorrencia', singular: 'Recorrência', genero: 'f' } as const;
const ROTULO_TITULO = { entidade: 'titulo', singular: 'Título', genero: 'm' } as const;

const naoEncontrada = () => new NaoEncontradoError('Recorrência não encontrada.');

async function exigir(repo: RecorrenciasRepository, tipo: TipoTitulo, id: string) {
  const r = await repo.buscar(id);
  if (!r || r.tipo !== tipo) throw naoEncontrada();
  return r;
}

/** Só os campos que a pessoa edita (o que a auditoria compara). */
function editaveis(r: Recorrencia): DadosRecorrencia {
  return {
    contratadoId: r.contratadoId,
    favorecido: r.favorecido,
    categoriaId: r.categoriaId,
    descricao: r.descricao,
    valorCentavos: r.valorCentavos,
    modoValor: r.modoValor,
    frequencia: r.frequencia,
    diaVencimento: r.diaVencimento,
    primeiroVencimento: r.primeiroVencimento,
    ajusteDiaNaoUtil: r.ajusteDiaNaoUtil,
    termino: r.termino,
    terminoEm: r.terminoEm,
    terminoOcorrencias: r.terminoOcorrencias,
    contaPrevistaId: r.contaPrevistaId,
    observacoes: r.observacoes,
  };
}

/** As regras da empresa (ou o padrão, se ela não gravou as suas). */
async function regrasDa(
  configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
  empresaId: string,
): Promise<ConfiguracaoFinanceira> {
  return (await configs.buscar(empresaId)) ?? CONFIGURACAO_PADRAO;
}

const atorDaAuditoria = (ator: Ator | null): AtorAuditoria =>
  ator ? { tipo: 'usuario', id: ator.usuarioId } : { tipo: 'sistema' };

/**
 * Gera os títulos que faltam de uma recorrência ativa, até o horizonte das regras da empresa.
 * O mesmo caso de uso serve ao job diário e às ações da tela (criar, retomar, editar). Rodar duas
 * vezes não duplica: cada ocorrência tem um título só.
 */
export class GerarTitulosDaRecorrencia {
  constructor(
    private readonly repo: RecorrenciasRepository,
    private readonly configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
    private readonly auditoria: Auditoria,
    private readonly clock: Clock,
  ) {}

  async executar(id: string, ator: Ator | null = null): Promise<number> {
    const r = await this.repo.buscar(id);
    if (r?.situacao !== 'ativa') return 0;
    const regras = await regrasDa(this.configs, r.contratadoId);
    const hoje = hojeEmBrasilia(this.clock.now());
    const ajuste = r.ajusteDiaNaoUtil ?? regras.ajusteDiaNaoUtil;
    const novas = ocorrenciasAGerar(r, {
      desde: r.geraAPartirDe,
      ate: limiteDoHorizonte(hoje, regras.horizonteRecorrenciaMeses),
      existentes: new Set(r.ocorrencias),
    });
    if (novas.length === 0) return 0;
    const criados = await this.repo.gerarTitulos(
      id,
      r.tipo,
      novas.map(({ ocorrencia }) => ({
        ocorrencia,
        dados: tituloDaOcorrencia(r, ocorrencia, ajuste, hoje),
      })),
      ator?.usuarioId ?? null,
    );
    await this.auditarCriados(r, criados, ajuste, hoje, ator);
    return criados.length;
  }

  /** Todas as ativas (job diário). Uma que falha não impede as outras; o job tenta de novo. */
  async todas(): Promise<number> {
    let total = 0;
    const falhas: string[] = [];
    for (const id of await this.repo.ativas()) {
      try {
        total += await this.executar(id);
      } catch (erro) {
        falhas.push(`${id}: ${(erro as Error).message}`);
      }
    }
    if (falhas.length) throw new Error(`Recorrências com falha: ${falhas.join('; ')}`);
    return total;
  }

  async auditarCriados(
    r: Recorrencia,
    criados: { id: string; numero: number; ocorrencia: number }[],
    ajuste: AjusteDiaNaoUtil,
    hoje: string,
    ator: Ator | null,
  ) {
    for (const t of criados) {
      await this.auditoria.registrar({
        ator: atorDaAuditoria(ator),
        entidade: ROTULO_TITULO.entidade,
        entidadeId: t.id,
        acao: 'criado',
        depois: {
          numero: t.numero,
          recorrenciaId: r.id,
          ocorrencia: t.ocorrencia,
          ...tituloDaOcorrencia(r, t.ocorrencia, ajuste, hoje),
        },
        em: this.clock.now(),
      });
    }
  }
}

/** Lista, detalhe e prévia das recorrências. */
export class ConsultarRecorrencias {
  constructor(
    private readonly repo: RecorrenciasRepository,
    private readonly configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
    private readonly clock: Clock,
  ) {}

  async listar(filtro: Omit<FiltroRecorrencias, 'hoje'>) {
    const { ativas, ...pagina } = await this.repo.listar({
      ...filtro,
      hoje: hojeEmBrasilia(this.clock.now()),
    });
    return {
      ...pagina,
      previstoMensalCentavos: ativas.reduce(
        (soma, a) => soma + previstoPorMes(a.valorCentavos, a.frequencia),
        0,
      ),
    };
  }

  async obter(tipo: TipoTitulo, id: string) {
    const r = await exigir(this.repo, tipo, id);
    const regras = await regrasDa(this.configs, r.contratadoId);
    const ajusteEfetivo = r.ajusteDiaNaoUtil ?? regras.ajusteDiaNaoUtil;
    const proxima =
      r.situacao === 'ativa'
        ? proximaOcorrencia(r, {
            maiorGerada: Math.max(0, ...r.ocorrencias),
            desde: r.geraAPartirDe,
          })
        : null;
    return {
      ...r,
      ajusteEfetivo,
      horizonteMeses: regras.horizonteRecorrenciaMeses,
      // Quando o job gera o próximo: o vencimento menos o horizonte.
      proximoAGerar: proxima && {
        vencimento: vencimentoAjustado(proxima.nominal, ajusteEfetivo),
        geradoEm: limiteDoHorizonte(proxima.nominal, -regras.horizonteRecorrenciaMeses),
      },
    };
  }

  async ajustaveis(tipo: TipoTitulo, id: string) {
    await exigir(this.repo, tipo, id);
    return (await this.repo.titulosAjustaveis(id)).map((t) => ({
      id: t.id,
      numero: t.numero,
      vencimento: t.dados.vencimento,
    }));
  }

  /** Os vencimentos que a recorrência geraria agora, com as regras da empresa. */
  async previa(
    entrada: Pick<
      DadosRecorrencia,
      | 'contratadoId'
      | 'frequencia'
      | 'diaVencimento'
      | 'primeiroVencimento'
      | 'ajusteDiaNaoUtil'
      | 'termino'
      | 'terminoEm'
      | 'terminoOcorrencias'
    >,
  ) {
    const regras = await regrasDa(this.configs, entrada.contratadoId);
    const hoje = hojeEmBrasilia(this.clock.now());
    const ajuste = entrada.ajusteDiaNaoUtil ?? regras.ajusteDiaNaoUtil;
    const valida =
      diaValido(entrada.primeiroVencimento) &&
      (entrada.frequencia === 'semanal' ||
        (Number.isInteger(entrada.diaVencimento) &&
          (entrada.diaVencimento ?? 0) >= 1 &&
          (entrada.diaVencimento ?? 0) <= 31));
    const vencimentos = valida
      ? ocorrenciasAGerar(entrada as DadosRecorrencia, {
          desde: entrada.primeiroVencimento,
          ate: limiteDoHorizonte(hoje, regras.horizonteRecorrenciaMeses),
          existentes: new Set(),
        }).map((o) => vencimentoAjustado(o.nominal, ajuste))
      : [];
    return {
      vencimentos,
      horizonteMeses: regras.horizonteRecorrenciaMeses,
      ajustePadrao: regras.ajusteDiaNaoUtil,
    };
  }
}

/** Criar e editar a recorrência. Toda escrita é auditada. */
export class SalvarRecorrencia {
  private readonly registro: RegistroAuditoria;
  private readonly registroTitulo: RegistroAuditoria;

  constructor(
    private readonly repo: RecorrenciasRepository,
    private readonly contexto: Pick<ContextoDoTitulo, 'carregar'>,
    private readonly configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
    private readonly gerador: GerarTitulosDaRecorrencia,
    auditoria: Auditoria,
    private readonly clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
    this.registroTitulo = new RegistroAuditoria(ROTULO_TITULO, auditoria, clock);
  }

  private async carregarContexto(entrada: DadosRecorrencia) {
    const { atual: _, ...contexto } = await this.contexto.carregar({
      ...entrada,
      documento: null,
      competencia: null,
      emissaoEm: entrada.primeiroVencimento,
      vencimento: entrada.primeiroVencimento,
    });
    return contexto;
  }

  async criar(tipo: TipoTitulo, ator: Ator, entrada: DadosRecorrencia) {
    const dados = prepararRecorrencia(tipo, entrada, await this.carregarContexto(entrada));
    const id = await this.repo.criar(tipo, dados, {
      geraAPartirDe: dados.primeiroVencimento,
      criadoPorId: ator.usuarioId,
    });
    await this.registro.criado(ator, id, dados);
    const titulosGerados = await this.gerador.executar(id, ator);
    return { id, titulosGerados };
  }

  /**
   * Edita a recorrência. O que ainda não foi gerado sai com os dados novos; com
   * `aplicarAosGerados`, os títulos já gerados em aberto, sem baixa e não editados à mão também.
   */
  async atualizar(
    tipo: TipoTitulo,
    ator: Ator,
    id: string,
    entrada: DadosRecorrencia,
    aplicarAosGerados: boolean,
  ) {
    const atual = await exigir(this.repo, tipo, id);
    if (atual.situacao === 'encerrada') {
      throw new SituacaoNaoPermiteError('A recorrência encerrada não se edita.');
    }
    const antes = editaveis(atual);
    const dados = prepararRecorrencia(tipo, entrada, {
      ...(await this.carregarContexto(entrada)),
      atual: { dados: antes, temTitulos: atual.ocorrencias.length > 0 },
    });
    await this.repo.atualizar(id, dados);
    await this.registro.alterado(ator, id, antes, dados);

    let titulosAtualizados = 0;
    if (aplicarAosGerados) {
      const regras = await regrasDa(this.configs, dados.contratadoId);
      const ajuste = dados.ajusteDiaNaoUtil ?? regras.ajusteDiaNaoUtil;
      const hoje = hojeEmBrasilia(this.clock.now());
      const ajustaveis = await this.repo.titulosAjustaveis(id);
      const mudancas = ajustaveis
        .map((t) => {
          const novo = tituloDaOcorrencia(dados, t.ocorrencia, ajuste, hoje);
          // Emissão, documento, competência e observações do título ficam como estão.
          return {
            antes: t,
            dados: {
              ...novo,
              emissaoEm: [t.dados.emissaoEm, novo.vencimento].sort()[0] as string,
              documento: t.dados.documento,
              competencia: t.dados.competencia,
              observacoes: t.dados.observacoes,
            },
          };
        })
        .filter((m) => JSON.stringify(m.dados) !== JSON.stringify(m.antes.dados));
      const feitos = new Set(
        await this.repo.aplicarNosTitulos(
          mudancas.map((m) => ({ tituloId: m.antes.id, dados: m.dados })),
        ),
      );
      for (const m of mudancas.filter((x) => feitos.has(x.antes.id))) {
        await this.registroTitulo.alterado(ator, m.antes.id, m.antes.dados, m.dados);
      }
      titulosAtualizados = feitos.size;
    }
    await this.gerador.executar(id, ator);
    return { titulosAtualizados };
  }
}

/** Pausar, retomar, encerrar e gerar o próximo agora. Tudo auditado. */
export class AcoesRecorrencia {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: RecorrenciasRepository,
    private readonly configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
    private readonly gerador: GerarTitulosDaRecorrencia,
    auditoria: Auditoria,
    private readonly clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async pausar(tipo: TipoTitulo, ator: Ator, id: string) {
    const r = await exigir(this.repo, tipo, id);
    if (r.situacao !== 'ativa') throw new SituacaoNaoPermiteError('Só a recorrência ativa pausa.');
    await this.repo.atualizar(id, { situacao: 'pausada' });
    await this.registro.registrar(
      ator,
      id,
      'pausada',
      { situacao: 'ativa' },
      { situacao: 'pausada' },
    );
  }

  /** Volta a gerar a partir de hoje: o que venceu enquanto estava pausada não é gerado. */
  async retomar(tipo: TipoTitulo, ator: Ator, id: string) {
    const r = await exigir(this.repo, tipo, id);
    if (r.situacao !== 'pausada') {
      throw new SituacaoNaoPermiteError('Só a recorrência pausada retoma.');
    }
    const hoje = hojeEmBrasilia(this.clock.now());
    const geraAPartirDe = [r.geraAPartirDe, hoje].sort()[1] as string;
    await this.repo.atualizar(id, { situacao: 'ativa', geraAPartirDe });
    await this.registro.registrar(
      ator,
      id,
      'retomada',
      { situacao: 'pausada' },
      { situacao: 'ativa', geraAPartirDe },
    );
    return { titulosGerados: await this.gerador.executar(id, ator) };
  }

  /** Encerrar não se desfaz; os títulos em aberto ficam (cancelam-se à parte). */
  async encerrar(tipo: TipoTitulo, ator: Ator, id: string, motivoTexto: string) {
    const motivo = prepararMotivo(motivoTexto);
    const r = await exigir(this.repo, tipo, id);
    if (r.situacao === 'encerrada') {
      throw new SituacaoNaoPermiteError('A recorrência já está encerrada.');
    }
    await this.repo.atualizar(id, {
      situacao: 'encerrada',
      encerradaEm: this.clock.now(),
      encerradaPorId: ator.usuarioId,
      motivoEncerramento: motivo,
    });
    await this.registro.registrar(
      ator,
      id,
      'encerrada',
      { situacao: r.situacao },
      { situacao: 'encerrada', motivo },
    );
  }

  /** Gera o título da próxima ocorrência, mesmo além do horizonte. */
  async gerarProximo(tipo: TipoTitulo, ator: Ator, id: string): Promise<string> {
    const r = await exigir(this.repo, tipo, id);
    if (r.situacao !== 'ativa') {
      throw new SituacaoNaoPermiteError('Só a recorrência ativa gera títulos.');
    }
    const proxima = proximaOcorrencia(r, {
      maiorGerada: Math.max(0, ...r.ocorrencias),
      desde: r.geraAPartirDe,
    });
    if (!proxima) {
      throw new SituacaoNaoPermiteError('A recorrência já gerou todos os vencimentos do término.');
    }
    const regras = await regrasDa(this.configs, r.contratadoId);
    const ajuste = r.ajusteDiaNaoUtil ?? regras.ajusteDiaNaoUtil;
    const hoje = hojeEmBrasilia(this.clock.now());
    const [criado] = await this.repo.gerarTitulos(
      id,
      r.tipo,
      [
        {
          ocorrencia: proxima.ocorrencia,
          dados: tituloDaOcorrencia(r, proxima.ocorrencia, ajuste, hoje),
        },
      ],
      ator.usuarioId,
    );
    if (!criado)
      throw new SituacaoNaoPermiteError('O próximo título já foi gerado. Atualize a tela.');
    await this.gerador.auditarCriados(r, [criado], ajuste, hoje, ator);
    await this.registro.registrar(ator, id, 'proximo_gerado', undefined, {
      tituloId: criado.id,
      ocorrencia: criado.ocorrencia,
      vencimento: vencimentoAjustado(dataNominal(r, criado.ocorrencia), ajuste),
    });
    return criado.id;
  }
}
