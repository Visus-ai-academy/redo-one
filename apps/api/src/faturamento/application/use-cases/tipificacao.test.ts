import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import {
  NomeTipificacaoEmUsoError,
  RegraTipificacaoNaoEncontradaError,
  TipificacaoInvalidaError,
} from '../../domain/configuracao-tipificacao';
import { NadaMudouError, VigenciaTipificacaoInvalidaError } from '../../domain/versoes-tipificacao';
import { ClienteNaoEncontradoError } from '../../domain/vigencia-corte';
import {
  CompetenciasEmMemoria,
  EquipesMedicosEmMemoria,
  TipificacaoEmMemoria,
} from '../../testing/fakes';
import {
  ListarTipificacao,
  MudarFaturaTipificacao,
  ObterTipificacaoCliente,
  PreviaTipificacaoCliente,
  RemoverVersaoTipificacaoCliente,
  SalvarRegraTipificacao,
  SalvarSubregraTipificacao,
  SalvarTipificacaoCliente,
} from './tipificacao';

/** Mês atual 11/2026; 10/2026 fechada. */
const agora = new Date('2026-11-24T18:00:00Z');
const relogio = () => agora;
const sempre = (id: string, valor: boolean) => [
  { id, vigenciaDesde: '2024-01', vigenciaAte: null, valor },
];
const regra = (id: string, faturaSemSubregra: boolean, padrao = false) => ({
  id,
  nome: id,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  fatura: sempre(`f-${id}`, faturaSemSubregra),
  padrao,
  clientes: 0,
});
const sub = (id: string, regraId: string, fatura: boolean) => ({
  id,
  regraId,
  nome: id,
  descricao: null,
  fatura: sempre(`f-${id}`, fatura),
  ordem: 0,
  ativo: true,
  clientes: 0,
});
const linhaMi = {
  tipo: 'especialidade' as const,
  valores: ['MI'],
  modoMedico: 'apenas' as const,
  medicos: ['rodrigo'],
  equipes: [] as string[],
  subregraId: 'NC-NF',
};
const VAZIA = { regraId: null, subregraDemaisId: null, linhas: [] };
const laudo = (id: string, campos: Record<string, unknown> = {}) => ({
  id,
  clienteId: 'cedidiag',
  unidadeId: null,
  modalidadeId: 'CT',
  especialidadeId: 'MI',
  prioridadeId: 'ROTINA',
  medicoId: 'rodrigo',
  competencia: '2026-11',
  volume: 2,
  ...campos,
});

describe('tipificação', () => {
  let repo: TipificacaoEmMemoria;
  let equipes: EquipesMedicosEmMemoria;
  let competencias: CompetenciasEmMemoria;
  let auditoria: InMemoryAuditoria;
  let ids: number;
  const novoId = () => `novo-${++ids}`;

  beforeEach(() => {
    ids = 0;
    repo = new TipificacaoEmMemoria();
    equipes = new EquipesMedicosEmMemoria();
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    auditoria = new InMemoryAuditoria();
    repo.regras.set('CO', regra('CO', true, true));
    repo.regras.set('NC', regra('NC', false));
    repo.subregras.set('NC-NF', sub('NC-NF', 'NC', false));
    repo.subregras.set('NC-FT', sub('NC-FT', 'NC', true));
    repo.clientes.set('cedidiag', {
      id: 'cedidiag',
      nome: 'CEDIDIAG',
      unificadoEmId: null,
      principalNome: null,
    });
    repo.clientes.set('cedi-rj', {
      id: 'cedi-rj',
      nome: 'CEDI_RJ',
      unificadoEmId: 'cedidiag',
      principalNome: 'CEDIDIAG',
    });
    equipes.medicos.push({ id: 'rodrigo', nome: 'Rodrigo Vaz de Lima' });
  });

  describe('regras e sub-regras', () => {
    it('cria com a versão inicial do "fatura"; nome, cor, descrição e situação só auditam', async () => {
      const salvar = new SalvarRegraTipificacao(repo, auditoria, competencias, relogio, novoId);
      const id = await salvar.executar(
        'u1',
        null,
        { nome: ' NC2 ', descricao: null, cor: '#AABBCC', ativo: true },
        false,
      );
      expect(repo.regras.get(id)?.fatura).toEqual([
        { id: 'novo-1', vigenciaDesde: '2026-11', vigenciaAte: null, valor: false },
      ]);
      await salvar.executar('u1', id, {
        nome: 'NC2',
        descricao: 'Outra',
        cor: '#aabbcc',
        ativo: false,
      });
      expect(auditoria.eventos.map((e) => [e.entidade, e.acao, e.antes, e.depois])).toEqual([
        [
          'regra_tipificacao',
          'criada',
          undefined,
          { nome: 'NC2', descricao: null, cor: '#aabbcc', ativo: true },
        ],
        [
          'regra_tipificacao_fatura',
          'criada',
          undefined,
          { regraId: id, vigenciaDesde: '2026-11', vigenciaAte: null, faturaSemSubregra: false },
        ],
        [
          'regra_tipificacao',
          'alterada',
          { descricao: null, ativo: true },
          { descricao: 'Outra', ativo: false },
        ],
      ]);
      // Nada disso muda o cálculo.
      expect(repo.reclassificacoes).toEqual([]);
    });

    it('sem mudança, não grava; nome repetido e id ou regra inexistentes são recusados', async () => {
      const salvar = new SalvarRegraTipificacao(repo, auditoria, competencias, relogio);
      await salvar.executar('u1', 'NC', { nome: 'NC', descricao: null, cor: null, ativo: true });
      expect(auditoria.eventos).toEqual([]);
      await expect(
        salvar.executar('u1', null, { nome: 'co', descricao: null, cor: null, ativo: true }),
      ).rejects.toBeInstanceOf(NomeTipificacaoEmUsoError);
      await expect(
        salvar.executar('u1', 'X', { nome: 'X', descricao: null, cor: null, ativo: true }),
      ).rejects.toBeInstanceOf(RegraTipificacaoNaoEncontradaError);
      const salvarSub = new SalvarSubregraTipificacao(repo, auditoria, competencias, relogio);
      await expect(
        salvarSub.executar('u1', null, {
          regraId: 'X',
          nome: 'X-FT',
          descricao: null,
          ativo: true,
        }),
      ).rejects.toBeInstanceOf(TipificacaoInvalidaError);
      // Mudar a regra da sub-regra reclassifica as abertas.
      await salvarSub.executar('u1', 'NC-FT', {
        regraId: 'CO',
        nome: 'NC-FT',
        descricao: null,
        ativo: true,
      });
      expect(repo.reclassificacoes).toEqual([null]);
    });

    it('o "fatura" muda por versão, a partir de competência aberta ou futura, e reclassifica', async () => {
      const mudar = new MudarFaturaTipificacao(repo, competencias, relogio, novoId);
      await mudar.mudar('u1', { tipo: 'subregra', id: 'NC-NF' }, true, '2026-12');
      expect(repo.subregras.get('NC-NF')?.fatura).toEqual([
        { id: 'f-NC-NF', vigenciaDesde: '2024-01', vigenciaAte: '2026-11', valor: false },
        { id: 'novo-1', vigenciaDesde: '2026-12', vigenciaAte: null, valor: true },
      ]);
      expect(repo.reclassificacoes).toEqual([null]);
      expect(repo.aPartirDes).toEqual(['2026-12']);
      expect(repo.eventosGravados.map((e) => [e.entidade, e.entidadeId, e.acao, e.depois])).toEqual(
        [
          [
            'subregra_tipificacao_fatura',
            'f-NC-NF',
            'encerrada',
            { subregraId: 'NC-NF', vigenciaAte: '2026-11' },
          ],
          [
            'subregra_tipificacao_fatura',
            'novo-1',
            'criada',
            { subregraId: 'NC-NF', vigenciaDesde: '2026-12', vigenciaAte: null, fatura: true },
          ],
        ],
      );
      await expect(
        mudar.mudar('u1', { tipo: 'regra', id: 'NC' }, true, '2026-10'),
      ).rejects.toBeInstanceOf(VigenciaTipificacaoInvalidaError);
      await expect(
        mudar.mudar('u1', { tipo: 'regra', id: 'NC' }, false, '2026-12'),
      ).rejects.toBeInstanceOf(NadaMudouError);
      await expect(
        mudar.mudar('u1', { tipo: 'regra', id: 'X' }, false, '2026-12'),
      ).rejects.toBeInstanceOf(RegraTipificacaoNaoEncontradaError);

      // Apagar a programada: a anterior volta a valer sem fim.
      await mudar.remover('u1', { tipo: 'subregra', id: 'NC-NF' }, 'novo-1');
      expect(repo.subregras.get('NC-NF')?.fatura).toEqual(sempre('f-NC-NF', false));
      expect(repo.eventosGravados.slice(-2).map((e) => e.acao)).toEqual(['removida', 'reaberta']);
    });

    it('lista o "fatura" em vigor no mês atual e o histórico com quem e quando', async () => {
      repo.subregras.set('NC-NF', {
        ...sub('NC-NF', 'NC', false),
        fatura: [
          { id: 'a', vigenciaDesde: '2024-01', vigenciaAte: '2026-11', valor: false },
          { id: 'b', vigenciaDesde: '2026-12', vigenciaAte: null, valor: true },
        ],
      });
      const em = new Date('2026-11-20T12:00:00Z');
      repo.eventosPorId.set('b', [{ acao: 'criada', quem: 'Ana', em }]);
      repo.eventosPorId.set('a', [{ acao: 'encerrada', quem: 'Ana', em }]);
      const r = await new ListarTipificacao(repo, competencias, relogio).executar();
      expect(r).toMatchObject({
        mesAtual: '2026-11',
        aPartirDeMinimo: '2026-11',
        aPartirDeSugerido: '2026-12',
      });
      const nf = r.subregras.find((s) => s.id === 'NC-NF');
      expect(nf?.fatura).toBe(false);
      expect(nf?.versoes).toEqual([
        {
          id: 'b',
          vigenciaDesde: '2026-12',
          vigenciaAte: null,
          valor: true,
          criadoPor: 'Ana',
          criadoEm: em,
          encerradoPor: null,
          encerradoEm: null,
        },
        {
          id: 'a',
          vigenciaDesde: '2024-01',
          vigenciaAte: '2026-11',
          valor: false,
          criadoPor: null,
          criadoEm: null,
          encerradoPor: 'Ana',
          encerradoEm: em,
        },
      ]);
    });
  });

  describe('configuração do cliente', () => {
    it('a unidade mostra a dela e a do principal em vigor; o histórico de vigências', async () => {
      repo.configurar('cedidiag', { regraId: 'NC', subregraDemaisId: null, linhas: [linhaMi] });
      const obter = new ObterTipificacaoCliente(repo, equipes, competencias, relogio);
      const daUnidade = await obter.executar('cedi-rj');
      expect(daUnidade).toMatchObject({
        cliente: { nome: 'CEDI_RJ', principalNome: 'CEDIDIAG' },
        configuracao: null,
        doPrincipal: { regraId: 'NC' },
        regraPadraoId: 'CO',
        versoes: [],
        aPartirDeMinimo: '2026-11',
        aPartirDeSugerido: '2026-12',
      });
      const doPrincipal = await obter.executar('cedidiag');
      expect(doPrincipal.medicos).toEqual([{ id: 'rodrigo', nome: 'Rodrigo Vaz de Lima' }]);
      expect(doPrincipal.versoes).toMatchObject([
        { vigenciaDesde: '2024-01', vigenciaAte: null, valor: { regraId: 'NC' } },
      ]);
      await expect(obter.executar('x')).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
    });

    it('a configuração em vigor é a do mês atual; a vazia conta como nenhuma', async () => {
      repo.versoes.set('cedidiag', [
        {
          id: 'a',
          vigenciaDesde: '2024-01',
          vigenciaAte: '2026-10',
          valor: { regraId: 'NC', subregraDemaisId: null, linhas: [] },
        },
        { id: 'b', vigenciaDesde: '2026-11', vigenciaAte: null, valor: VAZIA },
      ]);
      const obter = new ObterTipificacaoCliente(repo, equipes, competencias, relogio);
      expect((await obter.executar('cedidiag')).configuracao).toBeNull();
    });

    it('nova versão: encerra a vigente na competência anterior, audita e reclassifica o principal', async () => {
      repo.configurar('cedi-rj', { regraId: 'NC', subregraDemaisId: null, linhas: [] });
      const salvar = new SalvarTipificacaoCliente(repo, equipes, competencias, relogio, novoId);
      const nova = { regraId: 'NC', subregraDemaisId: 'NC-FT', linhas: [linhaMi] };
      await salvar.executar('u1', 'cedi-rj', nova, '2026-12');
      expect(repo.versoes.get('cedi-rj')).toEqual([
        {
          id: 'v-cedi-rj-2024-01',
          vigenciaDesde: '2024-01',
          vigenciaAte: '2026-11',
          valor: { regraId: 'NC', subregraDemaisId: null, linhas: [] },
        },
        { id: 'novo-1', vigenciaDesde: '2026-12', vigenciaAte: null, valor: nova },
      ]);
      expect(repo.reclassificacoes).toEqual([['cedidiag']]);
      expect(repo.eventosGravados.map((e) => [e.entidade, e.acao])).toEqual([
        ['cliente_tipificacao_versao', 'encerrada'],
        ['cliente_tipificacao_versao', 'criada'],
      ]);
      expect(repo.eventosGravados[1]?.depois).toEqual({
        clienteId: 'cedi-rj',
        vigenciaDesde: '2026-12',
        vigenciaAte: null,
        configuracao: nova,
      });

      // Igual à vigente na competência: nada muda.
      await expect(salvar.executar('u1', 'cedi-rj', nova, '2027-01')).rejects.toBeInstanceOf(
        NadaMudouError,
      );
      // Competência fechada: recusada.
      await expect(salvar.executar('u1', 'cedi-rj', VAZIA, '2026-10')).rejects.toBeInstanceOf(
        VigenciaTipificacaoInvalidaError,
      );
      // A programada que nunca valeu é trocada.
      await salvar.executar('u1', 'cedi-rj', VAZIA, '2026-12');
      expect(
        repo.versoes.get('cedi-rj')?.map((v) => [v.vigenciaDesde, v.vigenciaAte, v.valor]),
      ).toEqual([
        ['2024-01', '2026-11', { regraId: 'NC', subregraDemaisId: null, linhas: [] }],
        ['2026-12', null, VAZIA],
      ]);
      expect(repo.eventosGravados.slice(-2).map((e) => e.acao)).toEqual(['removida', 'criada']);
    });

    it('remover a configuração é uma versão vazia; sem nenhuma, nada muda', async () => {
      const salvar = new SalvarTipificacaoCliente(repo, equipes, competencias, relogio, novoId);
      await expect(salvar.executar('u1', 'cedidiag', VAZIA, '2026-12')).rejects.toBeInstanceOf(
        NadaMudouError,
      );
      repo.configurar('cedidiag', { regraId: 'NC', subregraDemaisId: null, linhas: [] });
      await salvar.executar('u1', 'cedidiag', VAZIA, '2026-12');
      expect(repo.versoes.get('cedidiag')?.at(-1)).toMatchObject({
        vigenciaDesde: '2026-12',
        valor: VAZIA,
      });
    });

    it('apagar a versão programada reabre a anterior; a que já valeu não se apaga', async () => {
      repo.versoes.set('cedidiag', [
        { id: 'a', vigenciaDesde: '2024-01', vigenciaAte: '2026-11', valor: VAZIA },
        {
          id: 'b',
          vigenciaDesde: '2026-12',
          vigenciaAte: null,
          valor: { regraId: 'NC', subregraDemaisId: null, linhas: [] },
        },
      ]);
      const remover = new RemoverVersaoTipificacaoCliente(repo, competencias, relogio);
      await expect(remover.executar('u1', 'cedidiag', 'a')).rejects.toBeInstanceOf(
        VigenciaTipificacaoInvalidaError,
      );
      await remover.executar('u1', 'cedidiag', 'b');
      expect(repo.versoes.get('cedidiag')).toEqual([
        { id: 'a', vigenciaDesde: '2024-01', vigenciaAte: null, valor: VAZIA },
      ]);
      expect(repo.aPartirDes).toEqual(['2026-12']);
      expect(repo.reclassificacoes).toEqual([['cedidiag']]);
    });

    it('id de outro tipo, médico ou equipe inexistente, ou sub-regra inativa nova: 400, nada gravado', async () => {
      const salvar = new SalvarTipificacaoCliente(repo, equipes, competencias, relogio);
      repo.catalogo.especialidades.push('MI');
      const tentar = (linha: typeof linhaMi) =>
        salvar.executar(
          'u1',
          'cedidiag',
          { regraId: null, subregraDemaisId: null, linhas: [linha] },
          '2026-12',
        );
      await expect(tentar({ ...linhaMi, valores: ['CT'] })).rejects.toThrow(
        'Linha 1: especialidade não encontrada.',
      );
      await expect(tentar({ ...linhaMi, medicos: ['ninguem'] })).rejects.toThrow(
        'Linha 1: médico não encontrado.',
      );
      await expect(tentar({ ...linhaMi, equipes: ['eq-x'] })).rejects.toBeInstanceOf(
        TipificacaoInvalidaError,
      );
      repo.subregras.set('NC-NF', { ...sub('NC-NF', 'NC', false), ativo: false });
      await expect(tentar(linhaMi)).rejects.toThrow(
        'Linha 1: sub-regra inativa: escolha uma ativa.',
      );
      expect(repo.reclassificacoes).toEqual([]);
    });

    it('prévia: só as competências a partir da nova versão mudam, e só as abertas contam', async () => {
      repo.laudos.push(
        laudo('a'),
        laudo('b', { medicoId: 'outro', volume: 1 }),
        laudo('c', { competencia: '2026-10' }),
        // Da unidade com configuração própria: não é do principal.
        laudo('d', { unidadeId: 'cedi-rj' }),
        laudo('e', { competencia: '2026-12' }),
      );
      repo.configurar('cedi-rj', { regraId: 'NC', subregraDemaisId: null, linhas: [] });
      const previa = new PreviaTipificacaoCliente(repo, equipes, competencias, relogio);
      expect(
        await previa.executar(
          'cedidiag',
          { regraId: 'NC', subregraDemaisId: 'NC-FT', linhas: [linhaMi] },
          '2026-12',
        ),
      ).toEqual([
        {
          competencia: '2026-11',
          regraId: 'CO',
          subregraId: null,
          fatura: true,
          antes: { laudos: 2, volume: 3 },
          depois: { laudos: 2, volume: 3 },
        },
        {
          competencia: '2026-12',
          regraId: 'CO',
          subregraId: null,
          fatura: true,
          antes: { laudos: 1, volume: 2 },
          depois: { laudos: 0, volume: 0 },
        },
        {
          competencia: '2026-12',
          regraId: 'NC',
          subregraId: 'NC-NF',
          fatura: false,
          antes: { laudos: 0, volume: 0 },
          depois: { laudos: 1, volume: 2 },
        },
      ]);
    });
  });
});
