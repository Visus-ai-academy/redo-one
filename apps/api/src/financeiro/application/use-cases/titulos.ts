import type { Auditoria } from '../../../auditoria/auditoria';
import { RegistroAuditoria } from '../../../catalogo/comum/registro-auditoria';
import type { Clock } from '../../../identidade/clock';
import { hojeEmBrasilia } from '../../domain/dias';
import { NaoEncontradoError, SituacaoNaoPermiteError } from '../../domain/erros';
import {
  type ContextoTitulo,
  type DadosBaixa,
  type DadosTitulo,
  diasDeAtraso,
  exigirCancelavel,
  exigirEditavel,
  prepararBaixa,
  prepararMotivo,
  prepararProrrogacao,
  prepararTitulo,
  situacaoDo,
  type TipoTitulo,
} from '../../domain/titulo';
import type { CategoriasRepository } from '../ports/categorias.repository';
import type { ContasBancariasRepository } from '../ports/contas-bancarias.repository';
import type { EmpresasFinanceiro } from '../ports/empresas';
import type {
  Favorecidos,
  FiltroTitulos,
  TitulosRepository,
  TituloTravado,
} from '../ports/titulos.repository';
import type { Ator } from './categorias';

const ROTULO = { entidade: 'titulo', singular: 'Título', genero: 'm' } as const;

const naoEncontrado = () => new NaoEncontradoError('Título não encontrado.');

/** O título travado, só se for do tipo da rota (o a pagar não abre por contas a receber). */
function exigirDoTipo(titulo: TituloTravado | null, tipo: TipoTitulo): TituloTravado {
  if (!titulo || titulo.tipo !== tipo) throw naoEncontrado();
  return titulo;
}

/** Lista e detalhe, com os dias de atraso calculados hoje (em Brasília). */
export class ConsultarTitulos {
  constructor(
    private readonly repo: TitulosRepository,
    private readonly clock: Clock,
  ) {}

  async listar(filtro: Omit<FiltroTitulos, 'hoje'>) {
    const hoje = hojeEmBrasilia(this.clock.now());
    const pagina = await this.repo.listar({ ...filtro, hoje });
    return {
      ...pagina,
      itens: pagina.itens.map((t) => ({ ...t, diasDeAtraso: diasDeAtraso(t, hoje) })),
    };
  }

  async obter(tipo: TipoTitulo, id: string) {
    const titulo = await this.repo.buscar(id);
    if (!titulo || titulo.tipo !== tipo) throw naoEncontrado();
    return { ...titulo, diasDeAtraso: diasDeAtraso(titulo, hoje(this.clock)) };
  }
}

const hoje = (clock: Clock) => hojeEmBrasilia(clock.now());

/** Lê dos cadastros o que a regra do título precisa (empresa, categoria, favorecido, conta). */
export class ContextoDoTitulo {
  constructor(
    private readonly empresas: Pick<EmpresasFinanceiro, 'usaFinanceiro'>,
    private readonly categorias: Pick<CategoriasRepository, 'buscar'>,
    private readonly contas: Pick<ContasBancariasRepository, 'buscar'>,
    private readonly favorecidos: Pick<Favorecidos, 'buscar'>,
  ) {}

  async carregar(entrada: DadosTitulo): Promise<ContextoTitulo> {
    // Em série, não em paralelo: o pool de produção é pequeno.
    const empresaUsaFinanceiro = await this.empresas.usaFinanceiro(entrada.contratadoId);
    const categoria = entrada.categoriaId
      ? await this.categorias.buscar(entrada.categoriaId)
      : null;
    const favorecido = entrada.favorecido?.id
      ? await this.favorecidos.buscar(entrada.favorecido)
      : null;
    const conta = entrada.contaPrevistaId
      ? await this.contas.buscar(entrada.contaPrevistaId)
      : null;
    return {
      empresaUsaFinanceiro,
      categoria: categoria && { id: categoria.id, tipo: categoria.tipo, ativa: categoria.ativa },
      favorecido,
      contaPrevista: conta && { contratadoId: conta.contratadoId, ativa: conta.ativa },
    };
  }
}

/** Lançar, editar e prorrogar o título. Toda escrita é auditada. */
export class SalvarTitulo {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: TitulosRepository,
    private readonly contexto: ContextoDoTitulo,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async criar(tipo: TipoTitulo, ator: Ator, entrada: DadosTitulo): Promise<string> {
    const dados = prepararTitulo(tipo, entrada, await this.contexto.carregar(entrada));
    const { id, numero } = await this.repo.criar({ tipo, dados, criadoPorId: ator.usuarioId });
    await this.registro.criado(ator, id, { numero, ...dados });
    return id;
  }

  async atualizar(tipo: TipoTitulo, ator: Ator, id: string, entrada: DadosTitulo) {
    const contexto = await this.contexto.carregar(entrada);
    const { antes, depois } = await this.repo.alterar(id, async (travado, escrita) => {
      const atual = exigirDoTipo(travado, tipo);
      exigirEditavel(atual);
      const dados = prepararTitulo(tipo, entrada, {
        ...contexto,
        atual: {
          situacao: atual.situacao,
          pagoCentavos: atual.pagoCentavos,
          origem: atual.origem,
          valorCentavos: atual.valorCentavos,
          favorecido: atual.dados.favorecido,
          categoriaId: atual.dados.categoriaId,
          contaPrevistaId: atual.dados.contaPrevistaId,
        },
      });
      // A empresa não muda: o número do título é da sequência dela.
      if (dados.contratadoId !== atual.contratadoId) {
        throw new SituacaoNaoPermiteError(
          'A empresa do título não muda. Cancele e lance de novo na outra empresa.',
        );
      }
      // O título que a recorrência gerou, mudado à mão, sai do alcance da edição da recorrência.
      const mudou = JSON.stringify(atual.dados) !== JSON.stringify(dados);
      await escrita.atualizar({
        ...dados,
        situacao: situacaoDo(dados.valorCentavos, atual.pagoCentavos),
        editadoAMao: atual.editadoAMao || (Boolean(atual.recorrenciaId) && mudou),
      });
      return { antes: atual.dados, depois: dados };
    });
    await this.registro.alterado(ator, id, antes, depois);
  }

  async prorrogar(tipo: TipoTitulo, ator: Ator, id: string, novo: string, motivoTexto: string) {
    const motivo = prepararMotivo(motivoTexto);
    const { antes, depois } = await this.repo.alterar(id, async (travado, escrita) => {
      const atual = exigirDoTipo(travado, tipo);
      const mudanca = prepararProrrogacao(atual, novo);
      await escrita.atualizar({
        ...mudanca,
        editadoAMao: atual.editadoAMao || Boolean(atual.recorrenciaId),
      });
      return { antes: { vencimento: atual.vencimento }, depois: mudanca };
    });
    await this.registro.registrar(ator, id, 'vencimento_prorrogado', antes, {
      vencimento: depois.vencimento,
      motivo,
    });
  }
}

/** Dar baixa e estornar. A situação e o pago mudam na mesma transação. */
export class BaixasTitulo {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: TitulosRepository,
    private readonly contas: Pick<ContasBancariasRepository, 'buscar'>,
    auditoria: Auditoria,
    private readonly clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async baixar(tipo: TipoTitulo, ator: Ator, id: string, entrada: DadosBaixa): Promise<string> {
    const conta = entrada.contaBancariaId
      ? await this.contas.buscar(entrada.contaBancariaId)
      : null;
    const { baixaId, antes, depois } = await this.repo.alterar(id, async (travado, escrita) => {
      const atual = exigirDoTipo(travado, tipo);
      const { baixa, pagoCentavos, situacao } = prepararBaixa(atual, entrada, {
        conta: conta && { contratadoId: conta.contratadoId, ativa: conta.ativa },
        hoje: hoje(this.clock),
      });
      const novaId = await escrita.inserirBaixa({ ...baixa, criadoPorId: ator.usuarioId });
      await escrita.atualizar({ pagoCentavos, situacao });
      return {
        baixaId: novaId,
        antes: { situacao: atual.situacao, pagoCentavos: atual.pagoCentavos },
        depois: { baixaId: novaId, ...baixa, situacao, pagoCentavos },
      };
    });
    await this.registro.registrar(ator, id, 'baixa_registrada', antes, depois);
    return baixaId;
  }

  async estornar(tipo: TipoTitulo, ator: Ator, id: string, baixaId: string, motivoTexto: string) {
    const motivo = prepararMotivo(motivoTexto);
    const { antes, depois } = await this.repo.alterar(id, async (travado, escrita) => {
      const atual = exigirDoTipo(travado, tipo);
      const baixa = atual.baixas.find((b) => b.id === baixaId);
      if (!baixa) throw new NaoEncontradoError('Baixa não encontrada.');
      if (baixa.estornadaEm) throw new SituacaoNaoPermiteError('A baixa já foi estornada.');
      const pagoCentavos = atual.pagoCentavos - baixa.principalCentavos;
      const situacao = situacaoDo(atual.valorCentavos, pagoCentavos);
      await escrita.estornarBaixa(baixaId, { em: this.clock.now(), porId: ator.usuarioId, motivo });
      await escrita.atualizar({ pagoCentavos, situacao });
      return {
        antes: { situacao: atual.situacao, pagoCentavos: atual.pagoCentavos },
        depois: { baixaId, motivo, situacao, pagoCentavos },
      };
    });
    await this.registro.registrar(ator, id, 'baixa_estornada', antes, depois);
  }
}

/** Cancelar o título sem baixa ativa, com motivo. Nada se apaga: ele fica como "Cancelado". */
export class CancelarTitulo {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: TitulosRepository,
    auditoria: Auditoria,
    private readonly clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async executar(tipo: TipoTitulo, ator: Ator, id: string, motivoTexto: string) {
    const motivo = prepararMotivo(motivoTexto);
    const antes = await this.repo.alterar(id, async (travado, escrita) => {
      const atual = exigirDoTipo(travado, tipo);
      exigirCancelavel(atual);
      await escrita.atualizar({
        situacao: 'cancelado',
        canceladoEm: this.clock.now(),
        canceladoPorId: ator.usuarioId,
        motivoCancelamento: motivo,
      });
      return { situacao: atual.situacao };
    });
    await this.registro.registrar(ator, id, 'cancelado', antes, { situacao: 'cancelado', motivo });
  }
}

/** Quem pode ser o favorecido do título, para a busca no formulário. */
export class OpcoesDeFavorecido {
  constructor(private readonly favorecidos: Pick<Favorecidos, 'opcoes'>) {}

  listar(tipo: TipoTitulo, busca: string | undefined) {
    return this.favorecidos.opcoes(tipo, busca, 20);
  }
}
