import { beforeEach, describe, expect, it } from 'vitest';

import type { DadosPreco } from '../../domain/versoes-preco';
import { VigenciaPrecoInvalidaError } from '../../domain/versoes-preco';
import { CompetenciasEmMemoria, PrecosEmMemoria } from '../../testing/fakes';
import type { Dono } from '../ports/precos.repository';
import {
  DonoPrecoNaoEncontradoError,
  ExportarPrecos,
  HistoricoPreco,
  ListarPrecos,
  MudarPrecos,
  PlanilhaPrecosInvalidaError,
} from './precos';

const DONO: Dono = { tipo: 'cliente', id: 'c1' };
const PADRAO: Dono = { tipo: 'contratado', id: 'ct1' };
const DADOS: DadosPreco = {
  modalidadeId: 'MR',
  especialidadeId: 'NEURO',
  categoriaId: 'SC',
  prioridadeId: 'ROTINA',
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT',
  valor: 63,
};
/** 15/11/2026 em Brasília. */
const agora = () => new Date('2026-11-15T15:00:00Z');
const PAGINA = { pagina: 1, porPagina: 25 };

describe('preços do cliente e tabela padrão', () => {
  let repo: PrecosEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let mudar: MudarPrecos;
  let listar: ListarPrecos;

  beforeEach(() => {
    repo = new PrecosEmMemoria();
    repo.donos.set('cliente:c1', { nome: 'CLINICA', principal: null });
    repo.donos.set('contratado:ct1', { nome: 'TELEIMAGEM', principal: null });
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: false });
    mudar = new MudarPrecos(repo, competencias, agora);
    listar = new ListarPrecos(repo, competencias, agora);
  });

  it('incluir cria a versão e audita; a lista sugere a próxima competência', async () => {
    const id = await mudar.incluir('u1', DONO, DADOS, '2026-12');
    expect(repo.eventosGravados).toEqual([
      expect.objectContaining({
        entidade: 'preco_cliente',
        entidadeId: id,
        acao: 'criado',
        depois: expect.objectContaining({ clienteId: 'c1', valor: 63, vigenciaDesde: '2026-12' }),
      }),
    ]);
    const t = await listar.executar(DONO, PAGINA);
    expect(t).toMatchObject({
      mesAtual: '2026-11',
      aPartirDeMinimo: '2026-11',
      aPartirDeSugerido: '2026-12',
      total: 1,
    });
    expect(t.itens[0]).toMatchObject({ id, emVigor: false, duplicado: false });
  });

  it('alterar guarda o histórico: a versão antiga é encerrada, nunca reescrita', async () => {
    const v1 = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    const v2 = await mudar.alterar('u2', DONO, v1, { ...DADOS, valor: 70 }, '2026-12');
    expect(repo.versoes.map((v) => [v.id, v.valor, v.vigenciaDesde, v.vigenciaAte])).toEqual([
      [v1, 63, '2026-11', '2026-11'],
      [v2, 70, '2026-12', null],
    ]);
    expect(repo.eventosGravados.map((e) => [e.entidadeId, e.acao, e.antes, e.depois])).toEqual([
      [v1, 'criado', undefined, expect.anything()],
      [
        v1,
        'encerrado',
        { clienteId: 'c1', vigenciaAte: null },
        { clienteId: 'c1', vigenciaAte: '2026-11' },
      ],
      [v2, 'criado', undefined, expect.objectContaining({ valor: 70 })],
    ]);
    // A lista mostra as duas (a de novembro ainda vale no mês atual).
    expect((await listar.executar(DONO, PAGINA)).itens.map((i) => [i.valor, i.emVigor])).toEqual([
      [63, true],
      [70, false],
    ]);
  });

  it('excluir encerra; só apaga a versão programada que nunca valeu', async () => {
    const vigente = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    await mudar.encerrar('u1', DONO, vigente, '2026-12');
    expect(repo.versoes).toHaveLength(1);
    expect(repo.versoes[0]?.vigenciaAte).toBe('2026-11');

    const programada = await mudar.incluir(
      'u1',
      DONO,
      { ...DADOS, prioridadeId: 'URGÊNCIA' },
      '2027-01',
    );
    await mudar.encerrar('u1', DONO, programada, '2027-01');
    expect(repo.versoes.map((v) => v.id)).toEqual([vigente]);
    expect(repo.eventosGravados.at(-1)).toMatchObject({
      entidadeId: programada,
      acao: 'removido',
      antes: expect.objectContaining({ valor: 63, vigenciaDesde: '2027-01' }),
    });
  });

  it('competência fechada ou travada nunca tem o preço mudado', async () => {
    const id = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    await expect(
      mudar.incluir('u1', DONO, { ...DADOS, faixaInicio: 9 }, '2026-10'),
    ).rejects.toThrow(VigenciaPrecoInvalidaError);
    competencias.competencias.set('2026-12', { status: 'aberta', importacaoTravada: true });
    await expect(mudar.encerrar('u1', DONO, id, '2026-12')).rejects.toThrow(
      VigenciaPrecoInvalidaError,
    );
    await expect(mudar.alterar('u1', DONO, id, { ...DADOS, valor: 1 }, '2026-12')).rejects.toThrow(
      VigenciaPrecoInvalidaError,
    );
    expect(repo.versoes).toHaveLength(1);
  });

  it('a tabela padrão do contratado segue as mesmas regras, com a própria entidade', async () => {
    const id = await mudar.incluir('u1', PADRAO, DADOS, '2026-12');
    await mudar.encerrar('u1', PADRAO, id, '2026-12');
    expect(repo.versoes).toEqual([]);
    expect(repo.eventosGravados.map((e) => [e.entidade, e.acao])).toEqual([
      ['preco_padrao_contratado', 'criado'],
      ['preco_padrao_contratado', 'removido'],
    ]);
  });

  it('cliente inexistente', async () => {
    await expect(listar.executar({ tipo: 'cliente', id: 'x' }, PAGINA)).rejects.toThrow(
      DonoPrecoNaoEncontradoError,
    );
  });

  it('lista com busca sem acento, paginada e com aviso de arranjo duplicado', async () => {
    await mudar.incluir('u1', DONO, DADOS, '2026-11');
    await mudar.incluir('u1', DONO, { ...DADOS, faixaInicio: 300 }, '2026-11');
    await mudar.incluir('u1', DONO, { ...DADOS, prioridadeId: 'URGÊNCIA' }, '2026-11');
    const t = await listar.executar(DONO, { pagina: 1, porPagina: 2, busca: 'urgencia' });
    expect(t.total).toBe(1);
    const todos = await listar.executar(DONO, { pagina: 1, porPagina: 2 });
    expect(todos.total).toBe(3);
    expect(todos.itens.map((i) => i.duplicado)).toEqual([true, true]);
  });

  it('o histórico traz todas as versões do arranjo com quem criou e quem encerrou', async () => {
    const v1 = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    const v2 = await mudar.alterar('u1', DONO, v1, { ...DADOS, valor: 70 }, '2026-12');
    const em = new Date('2026-11-15T15:00:00Z');
    repo.eventosPorId.set(v1, [
      { acao: 'criado', quem: 'Ana', em },
      { acao: 'encerrado', quem: 'Bia', em },
    ]);
    const h = await new HistoricoPreco(repo).executar(DONO, DADOS);
    expect(h.map((v) => [v.id, v.criadoPor, v.encerradoPor])).toEqual([
      [v2, null, null],
      [v1, 'Ana', 'Bia'],
    ]);
  });

  it('importa a planilha inteira ou nada: inclui, altera e deixa as iguais', async () => {
    // Versões da carga (desde sempre).
    const carga = (id: string, d: DadosPreco) =>
      repo.versoes.push({ id, dono: 'cliente:c1', ...d, vigenciaDesde: null, vigenciaAte: null });
    const existente = 'carga-1';
    carga(existente, DADOS);
    carga('carga-2', { ...DADOS, prioridadeId: 'URGÊNCIA' });
    const cab =
      'Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor;Vale a partir de\n';
    const csv = `${cab}MR;NEURO;SC;ROTINA;;;;65;\nMR;NEURO;SC;URGÊNCIA;;;;63;\nCT;NEURO;SC;ROTINA;;;;40;\n`;
    expect(await mudar.importar('u1', DONO, csv, '2026-12')).toEqual({
      incluidos: 1,
      alterados: 1,
      iguais: 1,
    });
    expect(repo.versoes.find((v) => v.id === existente)?.vigenciaAte).toBe('2026-11');

    const antes = repo.versoes.length;
    const ruim = `${cab}MR;NEURO;SC;ROTINA;;;;66;\nXX;NEURO;SC;ROTINA;;;;1;\nMR;NEURO;SC;ROTINA;;;;67;\n`;
    await expect(mudar.importar('u1', DONO, ruim, '2027-01')).rejects.toMatchObject({
      constructor: PlanilhaPrecosInvalidaError,
      detalhes: {
        erros: [
          {
            linha: 2,
            erro: 'A tabela mudou depois da exportação (há preço mais novo para este arranjo e faixa): exporte de novo.',
          },
          { linha: 3, erro: 'Modalidade "XX" não existe no catálogo.' },
          { linha: 4, erro: 'Mesmo arranjo, faixa e vigência da linha 2.' },
        ],
      },
    });
    expect(repo.versoes).toHaveLength(antes);
  });

  it('exporta a tabela em vigor no mês atual', async () => {
    await mudar.incluir('u1', DONO, DADOS, '2026-11');
    await mudar.incluir('u1', DONO, { ...DADOS, prioridadeId: 'URGÊNCIA' }, '2027-01');
    const r = await new ExportarPrecos(repo, agora).executar(DONO);
    expect(r.nomeArquivo).toBe('precos-CLINICA-2026-11.csv');
    expect(r.conteudo.split('\r\n').slice(1)).toEqual([
      'MR;NEURO;SC;ROTINA;;;MOD/ESP/CAT;63,00;11/2026',
      'MR;NEURO;SC;URGÊNCIA;;;MOD/ESP/CAT;63,00;01/2027',
      '',
    ]);
  });

  it('exportar e importar sem mudar nada não muda nada (nem a versão programada)', async () => {
    const atual = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    await mudar.alterar('u1', DONO, atual, { ...DADOS, valor: 80 }, '2027-01');
    await mudar.incluir('u1', DONO, { ...DADOS, prioridadeId: 'URGÊNCIA' }, '2026-11');
    const antes = JSON.stringify(repo.versoes);
    const { conteudo } = await new ExportarPrecos(repo, agora).executar(DONO);
    expect(await mudar.importar('u1', DONO, conteudo, '2026-12')).toEqual({
      incluidos: 0,
      alterados: 0,
      iguais: 3,
    });
    expect(JSON.stringify(repo.versoes)).toBe(antes);
  });

  it('a importação muda o preço de hoje sem mexer na versão programada', async () => {
    const atual = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    const programada = await mudar.alterar('u1', DONO, atual, { ...DADOS, valor: 80 }, '2027-01');
    const { conteudo } = await new ExportarPrecos(repo, agora).executar(DONO);
    const editado = conteudo.replace(
      'ROTINA;;;MOD/ESP/CAT;63,00;11/2026',
      'ROTINA;;;MOD/ESP/CAT;65,00;11/2026',
    );
    expect(await mudar.importar('u1', DONO, editado, '2026-12')).toMatchObject({ alterados: 1 });
    const p = repo.versoes.find((v) => v.id === programada);
    expect([p?.valor, p?.vigenciaDesde, p?.vigenciaAte]).toEqual([80, '2027-01', null]);
    expect(
      repo.versoes.filter((v) => v.valor === 65).map((v) => [v.vigenciaDesde, v.vigenciaAte]),
    ).toEqual([['2026-12', '2026-12']]);
  });

  it('apagar o reajuste programado devolve o preço anterior, com auditoria', async () => {
    const atual = await mudar.incluir('u1', DONO, DADOS, '2026-11');
    const programada = await mudar.alterar('u1', DONO, atual, { ...DADOS, valor: 80 }, '2027-01');
    await mudar.encerrar('u2', DONO, programada, '2027-01');
    expect(repo.versoes.map((v) => [v.id, v.vigenciaAte])).toEqual([[atual, null]]);
    expect(
      repo.eventosGravados.slice(-2).map((e) => [e.entidadeId, e.acao, e.antes, e.depois]),
    ).toEqual([
      [programada, 'removido', expect.objectContaining({ valor: 80, clienteId: 'c1' }), undefined],
      [
        atual,
        'reaberto',
        { clienteId: 'c1', vigenciaAte: '2026-12' },
        { clienteId: 'c1', vigenciaAte: null },
      ],
    ]);
  });

  it('exportada em 30/11 com reajuste a partir de 12/2026, importada sem mudar em 01/12: nada muda', async () => {
    const em30 = () => new Date('2026-11-30T15:00:00Z');
    const em01 = () => new Date('2026-12-01T15:00:00Z');
    repo.versoes.push({
      id: 'a',
      dono: 'cliente:c1',
      ...DADOS,
      valor: 100,
      vigenciaDesde: null,
      vigenciaAte: null,
    });
    await new MudarPrecos(repo, competencias, em30).alterar(
      'u1',
      DONO,
      'a',
      { ...DADOS, valor: 120 },
      '2026-12',
    );
    const antes = JSON.stringify(repo.versoes);
    const { conteudo } = await new ExportarPrecos(repo, em30).executar(DONO);
    expect(conteudo.split('\r\n').slice(1, 3)).toEqual([
      'MR;NEURO;SC;ROTINA;;;MOD/ESP/CAT;100,00;desde sempre',
      'MR;NEURO;SC;ROTINA;;;MOD/ESP/CAT;120,00;12/2026',
    ]);
    expect(
      await new MudarPrecos(repo, competencias, em01).importar('u1', DONO, conteudo, '2027-01'),
    ).toEqual({ incluidos: 0, alterados: 0, iguais: 2 });
    expect(JSON.stringify(repo.versoes)).toBe(antes);
  });

  it('linha de uma versão que ganhou outra mais nova depois da exportação é recusada', async () => {
    repo.versoes.push({
      id: 'a',
      dono: 'cliente:c1',
      ...DADOS,
      valor: 100,
      vigenciaDesde: null,
      vigenciaAte: null,
    });
    const { conteudo } = await new ExportarPrecos(repo, agora).executar(DONO);
    await mudar.alterar('u2', DONO, 'a', { ...DADOS, valor: 120 }, '2027-01');
    const antes = JSON.stringify(repo.versoes);
    const editado = conteudo.replace('100,00;desde sempre', '110,00;desde sempre');
    for (const csv of [conteudo, editado])
      await expect(mudar.importar('u1', DONO, csv, '2026-12')).rejects.toMatchObject({
        detalhes: {
          erros: [
            {
              linha: 2,
              erro: 'A tabela mudou depois da exportação (há preço mais novo para este arranjo e faixa): exporte de novo.',
            },
          ],
        },
      });
    expect(JSON.stringify(repo.versoes)).toBe(antes);
  });
});
