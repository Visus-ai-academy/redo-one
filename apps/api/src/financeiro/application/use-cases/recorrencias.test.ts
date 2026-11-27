import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { SituacaoNaoPermiteError } from '../../domain/erros';
import type { DadosRecorrencia } from '../../domain/recorrencia';
import {
  CategoriasEmMemoria,
  ConfiguracoesEmMemoria,
  ContasBancariasEmMemoria,
  EmpresasEmMemoria,
  FavorecidosEmMemoria,
  RecorrenciasEmMemoria,
  TitulosEmMemoria,
} from '../../testing/fakes';
import {
  AcoesRecorrencia,
  ConsultarRecorrencias,
  GerarTitulosDaRecorrencia,
  SalvarRecorrencia,
} from './recorrencias';
import { ContextoDoTitulo, SalvarTitulo } from './titulos';

const ator = { usuarioId: 'u1' };

describe('recorrências', () => {
  let agora: Date;
  const relogio = { now: () => agora };
  let titulos: TitulosEmMemoria;
  let repo: RecorrenciasEmMemoria;
  let configs: ConfiguracoesEmMemoria;
  let auditoria: InMemoryAuditoria;
  let gerador: GerarTitulosDaRecorrencia;
  let salvar: SalvarRecorrencia;
  let acoes: AcoesRecorrencia;
  let consultar: ConsultarRecorrencias;
  let salvarTitulo: SalvarTitulo;
  let despesa: string;
  let fornecedor: string;

  const dados = (parcial: Partial<DadosRecorrencia> = {}): DadosRecorrencia => ({
    contratadoId: 'emp-1',
    favorecido: { tipo: 'fornecedor', id: fornecedor },
    categoriaId: despesa,
    descricao: 'Aluguel da sala',
    valorCentavos: 950_000,
    modoValor: 'fixo',
    frequencia: 'mensal',
    diaVencimento: 5,
    primeiroVencimento: '2026-12-05',
    ajusteDiaNaoUtil: null,
    termino: 'sem',
    terminoEm: null,
    terminoOcorrencias: null,
    contaPrevistaId: null,
    observacoes: null,
    ...parcial,
  });
  const gerados = (id: string) =>
    [...titulos.linhas.values()]
      .filter((t) => t.recorrenciaId === id)
      .sort((a, b) => (a.ocorrencia ?? 0) - (b.ocorrencia ?? 0));

  beforeEach(async () => {
    // 27/11/2026, meio-dia em Brasília.
    agora = new Date('2026-11-27T15:00:00Z');
    const empresas = new EmpresasEmMemoria([
      { id: 'emp-1', nome: 'TeleImagem', usaFinanceiro: true },
    ]);
    const categorias = new CategoriasEmMemoria();
    despesa = await categorias.criar({
      tipo: 'despesa',
      nome: 'Aluguel',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    });
    const contas = new ContasBancariasEmMemoria(empresas);
    const favorecidos = new FavorecidosEmMemoria();
    fornecedor = favorecidos.adicionar('fornecedor', 'Sala comercial');
    titulos = new TitulosEmMemoria(empresas, favorecidos, categorias, contas);
    repo = new RecorrenciasEmMemoria(titulos, favorecidos);
    configs = new ConfiguracoesEmMemoria();
    auditoria = new InMemoryAuditoria();
    const contexto = new ContextoDoTitulo(empresas, categorias, contas, favorecidos);
    gerador = new GerarTitulosDaRecorrencia(repo, configs, auditoria, relogio);
    salvar = new SalvarRecorrencia(repo, contexto, configs, gerador, auditoria, relogio);
    acoes = new AcoesRecorrencia(repo, configs, gerador, auditoria, relogio);
    consultar = new ConsultarRecorrencias(repo, configs, relogio);
    salvarTitulo = new SalvarTitulo(titulos, contexto, auditoria, relogio);
  });

  it('cria e gera na hora os títulos até o horizonte (3 meses), com o fim de semana postergado', async () => {
    const { id, titulosGerados } = await salvar.criar('pagar', ator, dados());

    expect(titulosGerados).toBe(3);
    // 05/12/2026 é sábado: vai para segunda, 07/12.
    expect(gerados(id).map((t) => [t.ocorrencia, t.vencimento, t.numero])).toEqual([
      [1, '2026-12-07', 1],
      [2, '2027-01-05', 2],
      [3, '2027-02-05', 3],
    ]);
    expect(auditoria.eventos.map((e) => [e.entidade, e.acao])).toEqual([
      ['recorrencia', 'criado'],
      ['titulo', 'criado'],
      ['titulo', 'criado'],
      ['titulo', 'criado'],
    ]);
  });

  it('o job é idempotente e, no mês seguinte, gera só o que entrou no horizonte', async () => {
    const { id } = await salvar.criar('pagar', ator, dados());
    expect(await gerador.todas()).toBe(0);
    agora = new Date('2026-12-28T15:00:00Z');
    expect(await gerador.todas()).toBe(1);
    expect(
      gerados(id)
        .map((t) => t.vencimento)
        .at(-1),
    ).toBe('2027-03-05');
  });

  it('o horizonte e o fim de semana vêm das regras da empresa; a recorrência pode trocar o seu', async () => {
    await configs.salvar(
      'emp-1',
      { faixasInadimplencia: [1, 6], horizonteRecorrenciaMeses: 1, ajusteDiaNaoUtil: 'antecipa' },
      'u1',
    );
    const a = await salvar.criar('pagar', ator, dados());
    expect(gerados(a.id).map((t) => t.vencimento)).toEqual(['2026-12-04']);
    const b = await salvar.criar('pagar', ator, dados({ ajusteDiaNaoUtil: 'mantem' }));
    expect(gerados(b.id).map((t) => t.vencimento)).toEqual(['2026-12-05']);
  });

  it('pausada não gera; retomada gera a partir de hoje, sem o que venceu na pausa', async () => {
    const { id } = await salvar.criar('pagar', ator, dados());
    await acoes.pausar('pagar', ator, id);
    agora = new Date('2027-03-10T15:00:00Z');
    expect(await gerador.todas()).toBe(0);
    await acoes.retomar('pagar', ator, id);
    expect(gerados(id).map((t) => t.ocorrencia)).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it('gerar o próximo agora passa do horizonte e para no término', async () => {
    const { id } = await salvar.criar(
      'pagar',
      ator,
      dados({ termino: 'ocorrencias', terminoOcorrencias: 4 }),
    );
    await acoes.gerarProximo('pagar', ator, id);
    expect(gerados(id).map((t) => t.ocorrencia)).toEqual([1, 2, 3, 4]);
    await expect(acoes.gerarProximo('pagar', ator, id)).rejects.toThrow(
      'A recorrência já gerou todos os vencimentos do término.',
    );
  });

  it('editar com "vale para os gerados" muda só os em aberto, sem baixa e não editados à mão', async () => {
    const { id } = await salvar.criar('pagar', ator, dados());
    const [primeiro, segundo] = gerados(id);
    await salvarTitulo.atualizar('pagar', ator, segundo?.id ?? '', {
      ...(segundo?.dados ?? dados()),
      descricao: 'Aluguel de janeiro (com desconto)',
    } as never);

    expect((await consultar.ajustaveis('pagar', id)).map((t) => t.numero)).toEqual([1, 3]);
    const r = await salvar.atualizar('pagar', ator, id, dados({ valorCentavos: 980_000 }), true);

    expect(r.titulosAtualizados).toBe(2);
    expect(gerados(id).map((t) => t.valorCentavos)).toEqual([980_000, 950_000, 980_000]);
    expect(primeiro?.id).toBeDefined();
  });

  it('editar só para os próximos não mexe nos gerados; a frequência não muda depois de gerar', async () => {
    const { id } = await salvar.criar('pagar', ator, dados());
    await salvar.atualizar('pagar', ator, id, dados({ valorCentavos: 1 }), false);
    expect(gerados(id).every((t) => t.valorCentavos === 950_000)).toBe(true);
    await expect(
      salvar.atualizar('pagar', ator, id, dados({ frequencia: 'trimestral' }), false),
    ).rejects.toThrow('A frequência não muda depois de gerar títulos');
  });

  it('encerrada não gera nem se edita; os títulos em aberto ficam', async () => {
    const { id } = await salvar.criar('pagar', ator, dados());
    await acoes.encerrar('pagar', ator, id, 'mudamos de sala');
    agora = new Date('2027-06-01T15:00:00Z');
    expect(await gerador.todas()).toBe(0);
    expect(gerados(id)).toHaveLength(3);
    await expect(salvar.atualizar('pagar', ator, id, dados(), false)).rejects.toThrow(
      SituacaoNaoPermiteError,
    );
    expect(auditoria.eventos.at(-1)).toMatchObject({
      entidade: 'recorrencia',
      acao: 'encerrada',
      depois: { situacao: 'encerrada', motivo: 'mudamos de sala' },
    });
  });

  it('lista com o previsto por mês das ativas e o detalhe com o próximo a gerar', async () => {
    const { id } = await salvar.criar('pagar', ator, dados());
    await salvar.criar('pagar', ator, dados({ frequencia: 'trimestral', valorCentavos: 300_000 }));
    const pagina = await consultar.listar({
      tipo: 'pagar',
      empresa: 'todas',
      situacao: 'todas',
      frequencia: 'todas',
      pagina: 1,
      porPagina: 25,
    });
    expect(pagina.previstoMensalCentavos).toBe(950_000 + 100_000);
    expect(pagina.itens[0]?.proximoVencimento).toBe('2026-12-07');

    const detalhe = await consultar.obter('pagar', id);
    expect(detalhe).toMatchObject({
      ajusteEfetivo: 'posterga',
      horizonteMeses: 3,
      proximoAGerar: { vencimento: '2027-03-05', geradoEm: '2026-12-05' },
    });
  });

  it('a prévia diz os vencimentos que sairiam agora', async () => {
    expect(
      await consultar.previa({
        contratadoId: 'emp-1',
        frequencia: 'mensal',
        diaVencimento: 5,
        primeiroVencimento: '2026-12-05',
        ajusteDiaNaoUtil: null,
        termino: 'sem',
        terminoEm: null,
        terminoOcorrencias: null,
      }),
    ).toEqual({
      vencimentos: ['2026-12-07', '2027-01-05', '2027-02-05'],
      horizonteMeses: 3,
      ajustePadrao: 'posterga',
    });
  });
});
