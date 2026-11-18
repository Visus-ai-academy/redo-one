import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import {
  AjustesDiaEmMemoria,
  CadastrosEmMemoria,
  EscalaDoAjusteEmMemoria,
} from '../../testing/fakes';
import { AlocacaoNaoEncontradaError } from '../erros';
import { DefinirAjusteDia, ListarAjustesDia, ObterAjusteDia } from './ajuste-dia';

const agora = new Date('2026-11-17T18:00:00Z');
const admin = { usuarioId: 'u1', acessoTotal: true };
const gestora = { usuarioId: 'g1', acessoTotal: false };
const DIA = '2026-11-18';
const liberar = (parcial = {}) => ({
  prioridadeIdsLiberadas: ['urg'],
  segueSla: false,
  clienteId: null,
  ...parcial,
});

describe('ajuste do dia da distribuição', () => {
  let escala: EscalaDoAjusteEmMemoria;
  let repo: AjustesDiaEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterAjusteDia;
  let definir: DefinirAjusteDia;
  let listar: ListarAjustesDia;

  beforeEach(() => {
    escala = new EscalaDoAjusteEmMemoria();
    escala.alocacoes.set('a1', { id: 'a1', medicoId: 'm1', turnoId: 't1', frenteId: 'f-mama' });
    escala.alocacoes.set('a2', { id: 'a2', medicoId: 'm2', turnoId: 't1', frenteId: 'f-neuro' });
    escala.plantoes.set('a1', new Set([DIA]));
    escala.plantoes.set('a2', new Set([DIA]));
    escala.recortes.set('g1', new Set(['f-mama']));
    repo = new AjustesDiaEmMemoria(escala, new Map([['c1', 'CLINICA X']]));
    const cadastros = new CadastrosEmMemoria();
    cadastros.existentes.set('prioridade', new Set(['urg', 'rot']));
    cadastros.existentes.set('cliente', new Set(['c1']));
    auditoria = new InMemoryAuditoria();
    obter = new ObterAjusteDia(repo, escala);
    definir = new DefinirAjusteDia(repo, escala, cadastros, auditoria, () => agora);
    listar = new ListarAjustesDia(repo, escala);
  });

  it('sem ajuste no dia: null', async () => {
    expect(await obter.executar(admin, 'a1', DIA)).toBeNull();
  });

  it('cria e audita com o contexto da escala (médico, turno, frente)', async () => {
    await definir.executar(admin, 'a1', DIA, liberar({ segueSla: true, clienteId: 'c1' }));
    const lido = await obter.executar(admin, 'a1', DIA);
    expect(lido).toMatchObject({
      alocacaoId: 'a1',
      data: DIA,
      prioridadeIdsLiberadas: ['urg'],
      segueSla: true,
      clienteId: 'c1',
      clienteNome: 'CLINICA X',
      medicoId: 'm1',
    });
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'ajuste_dia_distribuicao',
        entidadeId: lido?.id,
        acao: 'criado',
        depois: {
          alocacaoId: 'a1',
          data: DIA,
          prioridadeIdsLiberadas: ['urg'],
          segueSla: true,
          clienteId: 'c1',
          medicoId: 'm1',
          turnoId: 't1',
          frenteId: 'f-mama',
        },
        em: agora,
      },
    ]);
  });

  it('altera só o que mudou (mesmo id); sem mudança não grava', async () => {
    await definir.executar(admin, 'a1', DIA, liberar());
    const id = (await obter.executar(admin, 'a1', DIA))?.id;
    await definir.executar(admin, 'a1', DIA, liberar());
    expect(repo.gravacoes).toBe(1);
    await definir.executar(admin, 'a1', DIA, liberar({ segueSla: true }));
    expect((await obter.executar(admin, 'a1', DIA))?.id).toBe(id);
    expect(auditoria.eventos[1]).toMatchObject({
      acao: 'alterado',
      entidadeId: id,
      antes: { segueSla: false },
      depois: { segueSla: true, medicoId: 'm1', data: DIA },
    });
  });

  it('ajuste vazio remove (com auditoria); remover o que não existe não faz nada', async () => {
    await definir.executar(admin, 'a1', DIA, liberar({ prioridadeIdsLiberadas: [] }));
    expect(repo.gravacoes).toBe(0);
    await definir.executar(admin, 'a1', DIA, liberar());
    await definir.executar(admin, 'a1', DIA, liberar({ prioridadeIdsLiberadas: [] }));
    expect(await obter.executar(admin, 'a1', DIA)).toBeNull();
    expect(auditoria.eventos.map((e) => e.acao)).toEqual(['criado', 'excluido']);
  });

  it('só em dia de plantão do vínculo', async () => {
    await expect(definir.executar(admin, 'a1', '2026-11-19', liberar())).rejects.toThrow(
      /não é dia de plantão/,
    );
  });

  it('recusa data inválida, prioridade ou cliente que não existe', async () => {
    await expect(definir.executar(admin, 'a1', '2026-02-30', liberar())).rejects.toBeInstanceOf(
      ConfiguracaoInvalidaError,
    );
    await expect(
      definir.executar(admin, 'a1', DIA, liberar({ prioridadeIdsLiberadas: ['x'] })),
    ).rejects.toThrow(/Prioridade não encontrada/);
    await expect(definir.executar(admin, 'a1', DIA, liberar({ clienteId: 'x' }))).rejects.toThrow(
      /Cliente não encontrado/,
    );
  });

  it('a gestora só vê e mexe nas alocações do recorte dela', async () => {
    await definir.executar(admin, 'a2', DIA, liberar());
    await expect(obter.executar(gestora, 'a2', DIA)).rejects.toBeInstanceOf(
      AlocacaoNaoEncontradaError,
    );
    await expect(definir.executar(gestora, 'a2', DIA, liberar())).rejects.toBeInstanceOf(
      AlocacaoNaoEncontradaError,
    );
    await definir.executar(gestora, 'a1', DIA, liberar());
    expect(
      (await listar.executar(gestora, { de: DIA, ate: DIA })).map((a) => a.alocacaoId),
    ).toEqual(['a1']);
    expect(await listar.executar(admin, { de: DIA, ate: DIA })).toHaveLength(2);
  });

  it('a listagem pede um período válido de até 42 dias', async () => {
    await expect(listar.executar(admin, { de: '2026-11-18', ate: '2026-11-17' })).rejects.toThrow(
      /período/,
    );
    await expect(listar.executar(admin, { de: '2026-11-01', ate: '2026-12-31' })).rejects.toThrow(
      /42 dias/,
    );
  });
});
