import type { Auditoria } from '../../../auditoria/auditoria';
import type { Pagina } from '../../../catalogo/comum/paginacao';
import { RegistroAuditoria } from '../../../catalogo/comum/registro-auditoria';
import type { Clock } from '../../../identidade/clock';
import {
  type DadosContaBancaria,
  prepararContaBancaria,
  variaveisDaCredencial,
} from '../../domain/conta-bancaria';
import { DadoEmUsoError, EmUsoError, NaoEncontradoError } from '../../domain/erros';
import type {
  ContaBancaria,
  ContasBancariasRepository,
  FiltroContasBancarias,
} from '../ports/contas-bancarias.repository';
import type { EmpresaFinanceiro, EmpresasFinanceiro } from '../ports/empresas';
import type { VariaveisAmbiente } from '../ports/variaveis-ambiente';
import type { Ator } from './categorias';

const ROTULO = { entidade: 'conta_bancaria', singular: 'Conta bancária', genero: 'f' } as const;

/** A conta com o que a tela mostra da credencial: o nome de cada variável e se ela existe. */
export interface ContaBancariaDetalhe extends ContaBancaria {
  variaveisCredencial: { nome: string; configurada: boolean }[];
}

async function exigir(repo: ContasBancariasRepository, id: string): Promise<ContaBancaria> {
  const conta = await repo.buscar(id);
  if (!conta) throw new NaoEncontradoError('Conta bancária não encontrada.');
  return conta;
}

/** Só os campos que a pessoa edita (o que a auditoria compara). */
function editaveis(c: DadosContaBancaria): DadosContaBancaria {
  return {
    contratadoId: c.contratadoId,
    apelido: c.apelido,
    tipo: c.tipo,
    bancoCodigo: c.bancoCodigo,
    agencia: c.agencia,
    conta: c.conta,
    digito: c.digito,
    saldoInicialCentavos: c.saldoInicialCentavos,
    saldoInicialEm: c.saldoInicialEm,
    integracao: c.integracao,
    credencial: c.credencial,
    padraoRecebimento: c.padraoRecebimento,
    ativa: c.ativa,
  };
}

/** As empresas que usam o financeiro do One (o filtro e o campo Empresa). */
export class ListarEmpresas {
  constructor(private readonly empresas: EmpresasFinanceiro) {}

  executar(): Promise<EmpresaFinanceiro[]> {
    return this.empresas.listar();
  }
}

export class ConsultarContasBancarias {
  constructor(
    private readonly repo: ContasBancariasRepository,
    private readonly variaveis: VariaveisAmbiente,
  ) {}

  listar(filtro: FiltroContasBancarias): Promise<Pagina<ContaBancaria>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<ContaBancariaDetalhe> {
    const conta = await exigir(this.repo, id);
    return {
      ...conta,
      variaveisCredencial: variaveisDaCredencial(conta.integracao, conta.credencial).map(
        (nome) => ({ nome, configurada: this.variaveis.existe(nome) }),
      ),
    };
  }
}

/** Criar e editar a conta; marcar como padrão para recebimento desmarca a anterior da empresa. */
export class SalvarContaBancaria {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: ContasBancariasRepository,
    private readonly empresas: EmpresasFinanceiro,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async criar(ator: Ator, entrada: DadosContaBancaria): Promise<string> {
    const dados = await this.validar(entrada, null);
    await this.desmarcarPadraoAnterior(ator, dados, null);
    const id = await this.repo.criar(dados);
    await this.registro.criado(ator, id, dados);
    return id;
  }

  async atualizar(ator: Ator, id: string, entrada: DadosContaBancaria): Promise<void> {
    const atual = await exigir(this.repo, id);
    const dados = await this.validar(entrada, id);
    await this.desmarcarPadraoAnterior(ator, dados, id);
    await this.repo.atualizar(id, dados);
    await this.registro.alterado(ator, id, editaveis(atual), dados);
  }

  private async validar(entrada: DadosContaBancaria, idAtual: string | null) {
    const dados = prepararContaBancaria(entrada, {
      empresaUsaFinanceiro: await this.empresas.usaFinanceiro(entrada.contratadoId),
    });
    const mesmo = await this.repo.buscarPorApelido(dados.contratadoId, dados.apelido);
    if (mesmo && mesmo.id !== idAtual) {
      throw new DadoEmUsoError('apelido', `A empresa já tem uma conta chamada "${dados.apelido}".`);
    }
    return dados;
  }

  private async desmarcarPadraoAnterior(
    ator: Ator,
    dados: DadosContaBancaria,
    idAtual: string | null,
  ) {
    if (!dados.padraoRecebimento) return;
    const anterior = await this.repo.buscarPadrao(dados.contratadoId);
    if (!anterior || anterior.id === idAtual) return;
    await this.repo.desmarcarPadrao(anterior.id);
    await this.registro.alterado(
      ator,
      anterior.id,
      { padraoRecebimento: true },
      { padraoRecebimento: false },
    );
  }
}

/** Excluir só a conta sem baixas nem títulos; a usada se desativa. */
export class ExcluirContaBancaria {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly repo: ContasBancariasRepository,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async executar(ator: Ator, id: string): Promise<void> {
    const atual = await exigir(this.repo, id);
    if (!(await this.repo.excluir(id))) {
      throw new EmUsoError('A conta tem baixas ou títulos ligados. Desative-a em vez de excluir.');
    }
    await this.registro.excluido(ator, id, editaveis(atual));
  }
}
