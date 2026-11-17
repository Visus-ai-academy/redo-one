import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { CadastrosEmMemoria, ParametrosEquipeEmMemoria } from '../../testing/fakes';
import { EquipeNaoEncontradaError } from '../erros';
import { DefinirUsoEquipe, ObterUsoEquipe } from './uso-equipe';

const agora = new Date('2026-11-17T18:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };

describe('uso da equipe pelo robô', () => {
  let parametros: ParametrosEquipeEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterUsoEquipe;
  let definir: DefinirUsoEquipe;

  beforeEach(() => {
    parametros = new ParametrosEquipeEmMemoria();
    parametros.itens.set('eq1', { plantao: false });
    const cadastros = new CadastrosEmMemoria();
    cadastros.equipes.add('eq1');
    auditoria = new InMemoryAuditoria();
    obter = new ObterUsoEquipe(parametros, cadastros);
    definir = new DefinirUsoEquipe(parametros, cadastros, auditoria, () => agora);
  });

  it('lê se a equipe é de plantão', async () => {
    expect(await obter.executar('eq1')).toEqual({ plantao: false });
  });

  it('passa a equipe para o plantão e audita o campo plantao da equipe', async () => {
    await definir.executar(ator, 'eq1', { plantao: true });
    expect(await obter.executar('eq1')).toEqual({ plantao: true });
    expect(auditoria.eventos).toEqual([
      {
        ator,
        entidade: 'equipe',
        entidadeId: 'eq1',
        acao: 'alterado',
        antes: { plantao: false },
        depois: { plantao: true },
        em: agora,
      },
    ]);
  });

  it('sem mudança, não grava nem audita', async () => {
    await definir.executar(ator, 'eq1', { plantao: false });
    expect(auditoria.eventos).toEqual([]);
  });

  it('equipe inexistente dá não encontrada', async () => {
    await expect(obter.executar('x')).rejects.toThrow(EquipeNaoEncontradaError);
    await expect(definir.executar(ator, 'x', { plantao: true })).rejects.toThrow(
      EquipeNaoEncontradaError,
    );
  });
});
