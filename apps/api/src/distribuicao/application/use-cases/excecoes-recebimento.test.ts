import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { EdicaoExcecaoRecebimento } from '../../domain/excecoes-recebimento';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { CadastrosEmMemoria, ExcecoesRecebimentoEmMemoria } from '../../testing/fakes';
import { ExcecaoRecebimentoNaoEncontradaError } from '../erros';
import {
  CriarExcecaoRecebimento,
  EditarExcecaoRecebimento,
  EncerrarExcecaoRecebimento,
  ExcluirExcecaoRecebimento,
  ListarExcecoesRecebimento,
} from './excecoes-recebimento';

/** 25/11/2026 às 01h UTC ainda é 24/11 em Brasília. */
const NOITE_DE_24 = new Date('2026-11-25T01:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };

const edicao = (p: Partial<EdicaoExcecaoRecebimento> = {}): EdicaoExcecaoRecebimento => ({
  turnoId: 'lista',
  todasFrentes: !p.frente,
  frente: null,
  todasPrioridades: !p.prioridadeOperacaoId,
  prioridadeOperacaoId: null,
  regra: { tipo: 'segue_sla' },
  de: '2026-11-24',
  ate: '2026-12-22',
  ...p,
});

describe('exceções temporárias da grade de recebimento', () => {
  let repo: ExcecoesRecebimentoEmMemoria;
  let cadastros: CadastrosEmMemoria;
  let auditoria: InMemoryAuditoria;
  let agora: Date;
  let criar: CriarExcecaoRecebimento;
  let editar: EditarExcecaoRecebimento;
  let encerrar: EncerrarExcecaoRecebimento;
  let excluir: ExcluirExcecaoRecebimento;
  let listar: ListarExcecoesRecebimento;

  beforeEach(() => {
    repo = new ExcecoesRecebimentoEmMemoria();
    cadastros = new CadastrosEmMemoria();
    auditoria = new InMemoryAuditoria();
    agora = NOITE_DE_24;
    const relogio = () => agora;
    criar = new CriarExcecaoRecebimento(repo, cadastros, auditoria, relogio);
    editar = new EditarExcecaoRecebimento(repo, cadastros, auditoria, relogio);
    encerrar = new EncerrarExcecaoRecebimento(repo, auditoria, relogio);
    excluir = new ExcluirExcecaoRecebimento(repo, auditoria, relogio);
    listar = new ListarExcecoesRecebimento(repo, relogio);
  });

  it('cria "toda a Lista segue o SLA até 22/12" a partir de hoje em Brasília, e audita', async () => {
    const id = await criar.executar(ator, edicao());
    expect(await listar.executar()).toEqual([
      expect.objectContaining({
        id,
        ...edicao(),
        situacao: 'vigente',
        podeExcluir: true,
        empatesIds: [],
      }),
    ]);
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        entidade: 'excecao_recebimento',
        entidadeId: id,
        acao: 'criado',
        depois: edicao(),
      }),
    ]);
  });

  it('recusa turno, prioridade ou frente que não existem', async () => {
    cadastros.existentes.set('turno', new Set(['manha']));
    await expect(criar.executar(ator, edicao())).rejects.toThrow(/Turno não encontrado/);
    cadastros.existentes.set('turno', new Set(['lista']));
    cadastros.existentes.set('especialidade', new Set(['neuro']));
    await expect(
      criar.executar(
        ator,
        edicao({ frente: { tipo: 'especialidade', especialidadeId: 'mama', modalidadeId: null } }),
      ),
    ).rejects.toThrow(/Especialidade não encontrada/);
  });

  it('recusa começar no passado', async () => {
    await expect(criar.executar(ator, edicao({ de: '2026-11-23' }))).rejects.toBeInstanceOf(
      ConfiguracaoInvalidaError,
    );
  });

  it('a lista marca os empates (mesma especificidade) dos dois lados', async () => {
    const a = await criar.executar(ator, edicao());
    const b = await criar.executar(
      ator,
      edicao({ regra: { tipo: 'nao_recebe' }, de: '2026-12-01' }),
    );
    const lista = await listar.executar();
    expect(lista.find((e) => e.id === a)?.empatesIds).toEqual([b]);
    expect(lista.find((e) => e.id === b)?.empatesIds).toEqual([a]);
  });

  it('edita com auditoria só do que mudou; nada mudou, nada grava', async () => {
    const id = await criar.executar(ator, edicao());
    await editar.executar(ator, id, edicao());
    expect(auditoria.eventos).toHaveLength(1);
    await editar.executar(ator, id, edicao({ ate: '2026-12-31' }));
    expect(auditoria.eventos[1]).toMatchObject({
      acao: 'alterado',
      antes: { ate: '2026-12-22' },
      depois: { ate: '2026-12-31' },
    });
    expect((await repo.obter(id))?.ate).toBe('2026-12-31');
  });

  it('encerrar traz o fim para ontem; a encerrada fica no histórico, não muda nem se exclui', async () => {
    const id = await criar.executar(ator, edicao());
    agora = new Date('2026-11-26T12:00:00Z');
    await expect(excluir.executar(ator, id)).rejects.toThrow(/encerre/);
    await encerrar.executar(ator, id);
    expect((await repo.obter(id))?.ate).toBe('2026-11-25');
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { ate: '2026-12-22' },
      depois: { ate: '2026-11-25' },
    });
    expect((await listar.executar())[0]).toMatchObject({ situacao: 'encerrada' });
    await expect(encerrar.executar(ator, id)).rejects.toThrow(/já está encerrada/);
    await expect(editar.executar(ator, id, edicao({ ate: '2026-11-25' }))).rejects.toThrow(
      /histórico/,
    );
  });

  it('exclui a que ainda não valeu em dia passado, com auditoria', async () => {
    const id = await criar.executar(ator, edicao({ de: '2026-12-01' }));
    await expect(encerrar.executar(ator, id)).rejects.toThrow(/exclua/);
    await excluir.executar(ator, id);
    expect(await repo.obter(id)).toBeNull();
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'excluido',
      antes: edicao({ de: '2026-12-01' }),
    });
  });

  it('id que não existe', async () => {
    await expect(excluir.executar(ator, 'nada')).rejects.toBeInstanceOf(
      ExcecaoRecebimentoNaoEncontradaError,
    );
  });
});
