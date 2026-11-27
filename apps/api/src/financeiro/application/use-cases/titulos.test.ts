import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import {
  DadosInvalidosError,
  NaoEncontradoError,
  SituacaoNaoPermiteError,
} from '../../domain/erros';
import type { DadosBaixa, DadosTitulo } from '../../domain/titulo';
import {
  CategoriasEmMemoria,
  ContasBancariasEmMemoria,
  EmpresasEmMemoria,
  FavorecidosEmMemoria,
  TitulosEmMemoria,
} from '../../testing/fakes';
import {
  BaixasTitulo,
  CancelarTitulo,
  ConsultarTitulos,
  ContextoDoTitulo,
  SalvarTitulo,
} from './titulos';

// 27/11/2026 12h em Brasília.
const relogio = { now: () => new Date('2026-11-27T15:00:00Z') };
const ator = { usuarioId: 'u1' };

describe('títulos', () => {
  let empresas: EmpresasEmMemoria;
  let categorias: CategoriasEmMemoria;
  let contas: ContasBancariasEmMemoria;
  let favorecidos: FavorecidosEmMemoria;
  let repo: TitulosEmMemoria;
  let auditoria: InMemoryAuditoria;
  let salvar: SalvarTitulo;
  let baixas: BaixasTitulo;
  let cancelar: CancelarTitulo;
  let consultar: ConsultarTitulos;
  let despesa: string;
  let fornecedor: string;
  let conta: string;

  const dados = (parcial: Partial<DadosTitulo> = {}): DadosTitulo => ({
    contratadoId: 'emp-1',
    favorecido: { tipo: 'fornecedor', id: fornecedor },
    categoriaId: despesa,
    descricao: 'Honorários de dezembro',
    documento: null,
    competencia: null,
    emissaoEm: '2026-11-01',
    vencimento: '2026-11-05',
    valorCentavos: 120_000,
    contaPrevistaId: null,
    observacoes: null,
    ...parcial,
  });
  const baixa = (parcial: Partial<DadosBaixa> = {}): DadosBaixa => ({
    pagoEm: '2026-11-27',
    contaBancariaId: conta,
    principalCentavos: 120_000,
    jurosCentavos: 0,
    multaCentavos: 0,
    descontoCentavos: 0,
    forma: 'pix',
    observacao: null,
    ...parcial,
  });

  beforeEach(async () => {
    empresas = new EmpresasEmMemoria([{ id: 'emp-1', nome: 'TeleImagem', usaFinanceiro: true }]);
    categorias = new CategoriasEmMemoria();
    despesa = await categorias.criar({
      tipo: 'despesa',
      nome: 'Contabilidade',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    });
    contas = new ContasBancariasEmMemoria(empresas);
    conta = await contas.criar({
      contratadoId: 'emp-1',
      apelido: 'Itaú movimento',
      tipo: 'corrente',
      bancoCodigo: null,
      agencia: null,
      conta: null,
      digito: null,
      saldoInicialCentavos: 0,
      saldoInicialEm: '2026-11-01',
      integracao: 'nenhuma',
      credencial: null,
      padraoRecebimento: false,
      ativa: true,
    });
    favorecidos = new FavorecidosEmMemoria();
    fornecedor = favorecidos.adicionar('fornecedor', 'Contabilidade Ômega');
    repo = new TitulosEmMemoria(empresas, favorecidos, categorias, contas);
    auditoria = new InMemoryAuditoria();
    const contexto = new ContextoDoTitulo(empresas, categorias, contas, favorecidos);
    salvar = new SalvarTitulo(repo, contexto, auditoria, relogio);
    baixas = new BaixasTitulo(repo, contas, auditoria, relogio);
    cancelar = new CancelarTitulo(repo, auditoria, relogio);
    consultar = new ConsultarTitulos(repo, relogio);
  });

  it('lança com número sequencial por empresa e tipo, e audita', async () => {
    const a = await salvar.criar('pagar', ator, dados());
    const b = await salvar.criar('pagar', ator, dados());

    expect((await consultar.obter('pagar', a)).numero).toBe(1);
    expect((await consultar.obter('pagar', b)).numero).toBe(2);
    expect(auditoria.eventos[0]).toMatchObject({
      entidade: 'titulo',
      entidadeId: a,
      acao: 'criado',
      depois: expect.objectContaining({ numero: 1, valorCentavos: 120_000 }),
    });
  });

  it('o título de um tipo não abre pela rota do outro', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await expect(consultar.obter('receber', id)).rejects.toThrow(NaoEncontradoError);
  });

  it('lista com os dias de atraso calculados hoje e os totais em aberto e vencido', async () => {
    await salvar.criar('pagar', ator, dados());
    await salvar.criar('pagar', ator, dados({ vencimento: '2026-12-10', valorCentavos: 50_000 }));

    const pagina = await consultar.listar({
      tipo: 'pagar',
      empresa: 'todas',
      situacao: 'em_aberto',
      origem: 'todas',
      categoria: 'todas',
      pagina: 1,
      porPagina: 25,
    });

    expect(pagina.itens.map((t) => t.diasDeAtraso)).toEqual([22, 0]);
    expect(pagina.totais).toEqual({ abertoCentavos: 170_000, vencidoCentavos: 120_000 });
  });

  it('baixa parcial e depois o resto liquida; o estorno devolve o saldo', async () => {
    const id = await salvar.criar('pagar', ator, dados());

    await baixas.baixar('pagar', ator, id, baixa({ principalCentavos: 20_000 }));
    expect(await consultar.obter('pagar', id)).toMatchObject({
      situacao: 'parcial',
      pagoCentavos: 20_000,
    });

    await baixas.baixar(
      'pagar',
      ator,
      id,
      baixa({ principalCentavos: 100_000, jurosCentavos: 500 }),
    );
    const liquidado = await consultar.obter('pagar', id);
    expect(liquidado).toMatchObject({ situacao: 'liquidado', pagoCentavos: 120_000 });
    expect(liquidado.baixas[0]).toMatchObject({ valorMovimentadoCentavos: 100_500 });

    await baixas.estornar('pagar', ator, id, liquidado.baixas[0]?.id ?? '', ' lançada em dobro ');
    const estornado = await consultar.obter('pagar', id);
    expect(estornado).toMatchObject({ situacao: 'parcial', pagoCentavos: 20_000 });
    expect(estornado.baixas[0]).toMatchObject({ motivoEstorno: 'lançada em dobro' });
    expect(auditoria.eventos.map((e) => e.acao)).toEqual([
      'criado',
      'baixa_registrada',
      'baixa_registrada',
      'baixa_estornada',
    ]);
  });

  it('não estorna duas vezes a mesma baixa', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await baixas.baixar('pagar', ator, id, baixa());
    const [b] = (await consultar.obter('pagar', id)).baixas;
    await baixas.estornar('pagar', ator, id, b?.id ?? '', 'errado');
    await expect(baixas.estornar('pagar', ator, id, b?.id ?? '', 'de novo')).rejects.toThrow(
      'A baixa já foi estornada.',
    );
  });

  it('baixa inválida não grava nada', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await expect(
      baixas.baixar('pagar', ator, id, baixa({ principalCentavos: 999_999 })),
    ).rejects.toThrow(DadosInvalidosError);
    expect((await consultar.obter('pagar', id)).baixas).toEqual([]);
  });

  it('edita o título em aberto; o liquidado não se edita', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await salvar.atualizar('pagar', ator, id, dados({ descricao: 'Honorários de janeiro' }));
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { descricao: 'Honorários de dezembro' },
      depois: { descricao: 'Honorários de janeiro' },
    });

    await baixas.baixar('pagar', ator, id, baixa());
    await expect(salvar.atualizar('pagar', ator, id, dados())).rejects.toThrow(
      SituacaoNaoPermiteError,
    );
  });

  it('subir o valor do título parcial recalcula a situação', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await baixas.baixar('pagar', ator, id, baixa({ principalCentavos: 100_000 }));
    await salvar.atualizar('pagar', ator, id, dados({ valorCentavos: 100_000 }));
    expect((await consultar.obter('pagar', id)).situacao).toBe('liquidado');
  });

  it('prorroga guardando o vencimento original, com o motivo na auditoria', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await salvar.prorrogar('pagar', ator, id, '2026-12-05', 'fornecedor pediu');

    expect(await consultar.obter('pagar', id)).toMatchObject({
      vencimento: '2026-12-05',
      vencimentoOriginal: '2026-11-05',
    });
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'vencimento_prorrogado',
      antes: { vencimento: '2026-11-05' },
      depois: { vencimento: '2026-12-05', motivo: 'fornecedor pediu' },
    });
  });

  it('cancela só sem baixa ativa, com motivo; depois de estornar, cancela', async () => {
    const id = await salvar.criar('pagar', ator, dados());
    await baixas.baixar('pagar', ator, id, baixa({ principalCentavos: 1_000 }));
    await expect(cancelar.executar('pagar', ator, id, 'lançado errado')).rejects.toThrow(
      'Só se cancela título sem baixa ativa. Estorne as baixas antes.',
    );
    const [b] = (await consultar.obter('pagar', id)).baixas;
    await baixas.estornar('pagar', ator, id, b?.id ?? '', 'errado');
    await cancelar.executar('pagar', ator, id, 'lançado errado');

    expect(await consultar.obter('pagar', id)).toMatchObject({
      situacao: 'cancelado',
      motivoCancelamento: 'lançado errado',
    });
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'cancelado',
      depois: { situacao: 'cancelado', motivo: 'lançado errado' },
    });
  });
});
