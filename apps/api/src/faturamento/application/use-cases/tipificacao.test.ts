import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import {
  NomeTipificacaoEmUsoError,
  RegraTipificacaoNaoEncontradaError,
  TipificacaoInvalidaError,
} from '../../domain/configuracao-tipificacao';
import { ClienteNaoEncontradoError } from '../../domain/vigencia-corte';
import {
  CompetenciasEmMemoria,
  EquipesMedicosEmMemoria,
  TipificacaoEmMemoria,
} from '../../testing/fakes';
import {
  ObterTipificacaoCliente,
  PreviaTipificacaoCliente,
  SalvarRegraTipificacao,
  SalvarSubregraTipificacao,
  SalvarTipificacaoCliente,
} from './tipificacao';

const agora = new Date('2026-11-24T18:00:00Z');
const regra = (id: string, faturaSemSubregra: boolean, padrao = false) => ({
  id,
  nome: id,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  faturaSemSubregra,
  padrao,
  clientes: 0,
});
const sub = (id: string, regraId: string, fatura: boolean) => ({
  id,
  regraId,
  nome: id,
  descricao: null,
  fatura,
  ordem: 0,
  ativo: true,
  clientes: 0,
});
const linhaMi = {
  tipo: 'especialidade' as const,
  valores: ['MI'],
  modoMedico: 'apenas' as const,
  medicos: ['rodrigo'],
  equipes: [],
  subregraId: 'NC-NF',
};
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

  beforeEach(() => {
    repo = new TipificacaoEmMemoria();
    equipes = new EquipesMedicosEmMemoria();
    competencias = new CompetenciasEmMemoria();
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
    it('cria e altera com auditoria; a mudança reclassifica todos', async () => {
      const salvar = new SalvarRegraTipificacao(repo, auditoria, () => agora);
      const id = await salvar.executar('u1', null, {
        nome: ' NC2 ',
        descricao: null,
        cor: '#AABBCC',
        faturaSemSubregra: true,
        ativo: true,
      });
      await salvar.executar('u1', id, {
        nome: 'NC2',
        descricao: null,
        cor: '#aabbcc',
        faturaSemSubregra: false,
        ativo: true,
      });
      expect(repo.regras.get(id)).toMatchObject({ nome: 'NC2', faturaSemSubregra: false });
      expect(auditoria.eventos.map((e) => [e.entidade, e.acao, e.antes, e.depois])).toEqual([
        [
          'regra_tipificacao',
          'criada',
          undefined,
          { nome: 'NC2', descricao: null, cor: '#aabbcc', faturaSemSubregra: true, ativo: true },
        ],
        [
          'regra_tipificacao',
          'alterada',
          { faturaSemSubregra: true },
          { faturaSemSubregra: false },
        ],
      ]);
      expect(repo.reclassificacoes).toEqual([null, null]);
    });

    it('sem mudança, não grava; nome repetido e id ou regra inexistentes são recusados', async () => {
      const salvar = new SalvarRegraTipificacao(repo, auditoria, () => agora);
      await salvar.executar('u1', 'NC', {
        nome: 'NC',
        descricao: null,
        cor: null,
        faturaSemSubregra: false,
        ativo: true,
      });
      expect(repo.reclassificacoes).toEqual([]);
      await expect(
        salvar.executar('u1', null, {
          nome: 'co',
          descricao: null,
          cor: null,
          faturaSemSubregra: true,
          ativo: true,
        }),
      ).rejects.toBeInstanceOf(NomeTipificacaoEmUsoError);
      await expect(
        salvar.executar('u1', 'X', {
          nome: 'X',
          descricao: null,
          cor: null,
          faturaSemSubregra: true,
          ativo: true,
        }),
      ).rejects.toBeInstanceOf(RegraTipificacaoNaoEncontradaError);
      const salvarSub = new SalvarSubregraTipificacao(repo, auditoria, () => agora);
      await expect(
        salvarSub.executar('u1', null, {
          regraId: 'X',
          nome: 'X-FT',
          descricao: null,
          fatura: true,
          ativo: true,
        }),
      ).rejects.toBeInstanceOf(TipificacaoInvalidaError);
      await salvarSub.executar('u1', 'NC-NF', {
        regraId: 'NC',
        nome: 'NC-NF',
        descricao: null,
        fatura: true,
        ativo: true,
      });
      expect(repo.subregras.get('NC-NF')?.fatura).toBe(true);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidade: 'subregra_tipificacao',
        acao: 'alterada',
        antes: { fatura: false },
        depois: { fatura: true },
      });
    });
  });

  describe('configuração do cliente', () => {
    it('a unidade mostra a dela e a do principal; o cliente sem configuração mostra a padrão', async () => {
      repo.configuracoes.set('cedidiag', {
        clienteId: 'cedidiag',
        regraId: 'NC',
        subregraDemaisId: null,
        linhas: [linhaMi],
        atualizadoEm: agora,
        atualizadoPor: 'Ana',
      });
      const obter = new ObterTipificacaoCliente(repo, equipes);
      const daUnidade = await obter.executar('cedi-rj');
      expect(daUnidade).toMatchObject({
        cliente: { nome: 'CEDI_RJ', principalNome: 'CEDIDIAG' },
        configuracao: null,
        doPrincipal: { regraId: 'NC' },
        regraPadraoId: 'CO',
      });
      expect((await obter.executar('cedidiag')).medicos).toEqual([
        { id: 'rodrigo', nome: 'Rodrigo Vaz de Lima' },
      ]);
      await expect(obter.executar('x')).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
    });

    it('salva com auditoria e reclassifica os laudos do principal; vazia apaga a configuração', async () => {
      const salvar = new SalvarTipificacaoCliente(repo, auditoria, () => agora);
      await salvar.executar('u1', 'cedi-rj', {
        regraId: 'NC',
        subregraDemaisId: 'NC-FT',
        linhas: [linhaMi],
      });
      expect(repo.configuracoes.get('cedi-rj')).toMatchObject({ regraId: 'NC', linhas: [linhaMi] });
      expect(repo.reclassificacoes).toEqual([['cedidiag']]);
      expect(auditoria.eventos[0]).toMatchObject({
        entidade: 'cliente_tipificacao',
        entidadeId: 'cedi-rj',
        acao: 'alterada',
        antes: { configuracao: null },
        depois: { configuracao: { regraId: 'NC', subregraDemaisId: 'NC-FT', linhas: [linhaMi] } },
      });

      // Igual: nada muda.
      await salvar.executar('u1', 'cedi-rj', {
        regraId: 'NC',
        subregraDemaisId: 'NC-FT',
        linhas: [linhaMi],
      });
      expect(repo.reclassificacoes).toHaveLength(1);

      await salvar.executar('u1', 'cedi-rj', { regraId: null, subregraDemaisId: null, linhas: [] });
      expect(repo.configuracoes.has('cedi-rj')).toBe(false);
      expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'removida' });
    });

    it('prévia: laudos e volume por resultado, antes e depois, só nas competências abertas', async () => {
      competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
      repo.laudos.push(
        laudo('a'),
        laudo('b', { medicoId: 'outro', volume: 1 }),
        laudo('c', { competencia: '2026-10' }),
        // Da unidade com configuração própria: não é do principal.
        laudo('d', { unidadeId: 'cedi-rj' }),
      );
      repo.configuracoes.set('cedi-rj', {
        clienteId: 'cedi-rj',
        regraId: 'NC',
        subregraDemaisId: null,
        linhas: [],
        atualizadoEm: agora,
        atualizadoPor: 'Ana',
      });
      const previa = new PreviaTipificacaoCliente(repo, equipes, competencias);
      expect(
        await previa.executar('cedidiag', {
          regraId: 'NC',
          subregraDemaisId: 'NC-FT',
          linhas: [linhaMi],
        }),
      ).toEqual([
        {
          competencia: '2026-11',
          regraId: 'CO',
          subregraId: null,
          fatura: true,
          antes: { laudos: 2, volume: 3 },
          depois: { laudos: 0, volume: 0 },
        },
        {
          competencia: '2026-11',
          regraId: 'NC',
          subregraId: 'NC-FT',
          fatura: true,
          antes: { laudos: 0, volume: 0 },
          depois: { laudos: 1, volume: 1 },
        },
        {
          competencia: '2026-11',
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
