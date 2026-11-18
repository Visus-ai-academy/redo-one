import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { EdicaoPrioridadeOperacao } from '../../domain/prioridades-operacao';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { CadastrosEmMemoria, PrioridadesOperacaoEmMemoria } from '../../testing/fakes';
import { PrioridadeOperacaoNaoEncontradaError } from '../erros';
import {
  CriarPrioridadeOperacao,
  DefinirGradeRecebimento,
  EditarPrioridadeOperacao,
  ExcluirPrioridadeOperacao,
  ListarPrioridadesOperacao,
  ObterGradeRecebimento,
} from './prioridades-operacao';

const agora = new Date('2026-11-18T12:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };

const edicao = (p: Partial<EdicaoPrioridadeOperacao> = {}): EdicaoPrioridadeOperacao => ({
  nome: 'AMBULATÓRIO',
  posicao: 2,
  urgencia: { tipo: 'prazo', horas: 24 },
  padrao: false,
  grafias: ['Ambulatório', 'P6'],
  cor: null,
  ...p,
});

describe('prioridades da operação', () => {
  let repo: PrioridadesOperacaoEmMemoria;
  let cadastros: CadastrosEmMemoria;
  let auditoria: InMemoryAuditoria;
  let criar: CriarPrioridadeOperacao;
  let editar: EditarPrioridadeOperacao;
  let excluir: ExcluirPrioridadeOperacao;
  let listar: ListarPrioridadesOperacao;

  beforeEach(() => {
    repo = new PrioridadesOperacaoEmMemoria();
    cadastros = new CadastrosEmMemoria();
    auditoria = new InMemoryAuditoria();
    const relogio = () => agora;
    criar = new CriarPrioridadeOperacao(repo, auditoria, relogio);
    editar = new EditarPrioridadeOperacao(repo, auditoria, relogio);
    excluir = new ExcluirPrioridadeOperacao(repo, auditoria, relogio);
    listar = new ListarPrioridadesOperacao(repo);
  });

  it('cria com o nome e as grafias aparados e em ordem, sem grafia repetida (sem acento e maiúsculas), e audita', async () => {
    const id = await criar.executar(
      ator,
      edicao({
        nome: ' AMBULATÓRIO ',
        grafias: [' Ambulatório', 'AMBULATORIO', 'Ambulatorio', ''],
      }),
    );
    expect(await listar.executar()).toEqual([{ id, ...edicao({ grafias: ['Ambulatório'] }) }]);
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator,
        entidade: 'prioridade_operacao',
        entidadeId: id,
        acao: 'criado',
        em: agora,
      }),
    ]);
  });

  it('guarda a cor em #RRGGBB aparada (vazia vira sem cor) e audita a troca', async () => {
    const id = await criar.executar(ator, edicao({ cor: ' #5677B8 ' }));
    expect((await listar.executar())[0]?.cor).toBe('#5677B8');
    await editar.executar(ator, id, edicao({ cor: '' }));
    expect((await listar.executar())[0]?.cor).toBeNull();
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { cor: '#5677B8' },
      depois: { cor: null },
    });
    await expect(
      criar.executar(ator, edicao({ nome: 'OUTRA', grafias: [], cor: 'azul' })),
    ).rejects.toThrow(/Cor/);
  });

  it('lista pela posição (empate pelo nome)', async () => {
    await criar.executar(ator, edicao({ nome: 'ROTINA', posicao: 3, grafias: ['Rotina'] }));
    await criar.executar(ator, edicao({ nome: 'INTERNADO', posicao: 3, grafias: ['P3'] }));
    await criar.executar(ator, edicao({ nome: 'URGÊNCIA', posicao: 1, grafias: ['P1'] }));
    expect((await listar.executar()).map((p) => p.nome)).toEqual([
      'URGÊNCIA',
      'INTERNADO',
      'ROTINA',
    ]);
  });

  it('recusa nome repetido e grafia que já está no de-para de outra', async () => {
    await criar.executar(ator, edicao());
    await expect(criar.executar(ator, edicao({ grafias: [] }))).rejects.toThrow(/Já existe/);
    await expect(
      criar.executar(ator, edicao({ nome: 'OUTRA', grafias: ['ambulatorio'] })),
    ).rejects.toThrow(/"ambulatorio" já está em AMBULATÓRIO/);
  });

  it('recusa regra inválida', async () => {
    await expect(
      criar.executar(ator, edicao({ urgencia: { tipo: 'prazo', horas: 0 } })),
    ).rejects.toBeInstanceOf(ConfiguracaoInvalidaError);
    await expect(criar.executar(ator, edicao({ posicao: 0 }))).rejects.toThrow(/Posição/);
    await expect(criar.executar(ator, edicao({ nome: '  ' }))).rejects.toThrow(/nome/);
  });

  it('a padrão é uma só: marcar outra tira a marca da anterior', async () => {
    const rotina = await criar.executar(
      ator,
      edicao({ nome: 'ROTINA', padrao: true, grafias: ['Rotina'] }),
    );
    const outra = await criar.executar(ator, edicao({ padrao: true }));
    const todas = await listar.executar();
    expect(todas.find((p) => p.id === rotina)?.padrao).toBe(false);
    expect(todas.find((p) => p.id === outra)?.padrao).toBe(true);
  });

  it('edita, audita só o que mudou e não grava sem mudança', async () => {
    const id = await criar.executar(ator, edicao());
    await editar.executar(ator, id, edicao({ grafias: ['P6', 'Ambulatório'] }));
    expect(repo.gravacoes).toBe(1);
    await editar.executar(ator, id, edicao({ urgencia: { tipo: 'nunca' } }));
    expect(auditoria.eventos[1]).toMatchObject({
      acao: 'alterado',
      antes: { urgencia: { tipo: 'prazo', horas: 24 } },
      depois: { urgencia: { tipo: 'nunca' } },
    });
    // A própria grafia não conflita com ela mesma.
    await editar.executar(ator, id, edicao({ grafias: ['AMBULATORIO'] }));
  });

  it('editar ou excluir o que não existe: 404', async () => {
    await expect(editar.executar(ator, 'x', edicao())).rejects.toBeInstanceOf(
      PrioridadeOperacaoNaoEncontradaError,
    );
    await expect(excluir.executar(ator, 'x')).rejects.toBeInstanceOf(
      PrioridadeOperacaoNaoEncontradaError,
    );
  });

  it('exclui e audita o que havia', async () => {
    const id = await criar.executar(ator, edicao());
    await excluir.executar(ator, id);
    expect(await listar.executar()).toEqual([]);
    expect(auditoria.eventos[1]).toMatchObject({
      acao: 'excluido',
      entidadeId: id,
      antes: { nome: 'AMBULATÓRIO' },
    });
  });

  describe('grade geral de recebimento', () => {
    let obterGrade: ObterGradeRecebimento;
    let definirGrade: DefinirGradeRecebimento;
    let rotina: string;

    beforeEach(async () => {
      obterGrade = new ObterGradeRecebimento(repo);
      definirGrade = new DefinirGradeRecebimento(repo, cadastros, auditoria, () => agora);
      rotina = await criar.executar(ator, edicao({ nome: 'ROTINA', grafias: ['Rotina'] }));
      cadastros.existentes.set('prioridadeOperacao', new Set([rotina]));
      cadastros.existentes.set('turno', new Set(['lista', 'manha']));
    });

    it('troca a grade inteira, em ordem fixa, e audita antes e depois', async () => {
      const lista = {
        prioridadeOperacaoId: rotina,
        turnoId: 'lista',
        regra: { tipo: 'prazo_minimo' as const, horas: 24 },
      };
      const manha = {
        prioridadeOperacaoId: rotina,
        turnoId: 'manha',
        regra: { tipo: 'nao_recebe' as const },
      };
      await definirGrade.executar(ator, [manha, lista]);
      expect(await obterGrade.executar()).toEqual([lista, manha]);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidade: 'recebimento_distribuicao',
        entidadeId: 'geral',
        antes: { celulas: [] },
        depois: { celulas: [lista, manha] },
      });
      const gravacoes = repo.gravacoes;
      await definirGrade.executar(ator, [lista, manha]);
      expect(repo.gravacoes).toBe(gravacoes);
    });

    it('recusa célula repetida, prazo inválido e prioridade ou turno que não existe', async () => {
      const c = (turnoId: string, horas = 24, prioridadeOperacaoId = rotina) => ({
        prioridadeOperacaoId,
        turnoId,
        regra: { tipo: 'prazo_minimo' as const, horas },
      });
      await expect(definirGrade.executar(ator, [c('lista'), c('lista', 12)])).rejects.toThrow(
        /célula repetida/,
      );
      await expect(definirGrade.executar(ator, [c('lista', 0)])).rejects.toThrow(/prazo mínimo/);
      await expect(definirGrade.executar(ator, [c('sumiu')])).rejects.toThrow(/Turno/);
      await expect(definirGrade.executar(ator, [c('lista', 24, 'sumiu')])).rejects.toThrow(
        /Prioridade da operação/,
      );
    });
  });
});
