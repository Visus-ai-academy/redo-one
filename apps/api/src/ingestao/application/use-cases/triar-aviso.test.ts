import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { AvisoNaoEncontradoError } from '../erros';
import type { AvisoCadastro, ConsultaAvisos } from '../ports/avisos.consulta';
import { TriarAviso } from './triar-aviso';

const agora = new Date('2026-11-16T12:00:00Z');

describe('TriarAviso', () => {
  let avisos: Map<string, AvisoCadastro>;
  let auditoria: InMemoryAuditoria;
  let triar: TriarAviso;

  beforeEach(() => {
    const base = {
      tipo: 'cliente' as const,
      valor: 'CLINICA NOVA',
      ocorrencias: 3,
      primeiraVezEm: agora,
      ultimaVezEm: agora,
      decididoPor: null,
      decididoEm: null,
      motivo: null,
    };
    avisos = new Map([
      ['p', { ...base, id: 'p', status: 'pendente' }],
      ['i', { ...base, id: 'i', status: 'ignorado', motivo: 'teste' }],
      ['r', { ...base, id: 'r', status: 'resolvido' }],
    ]);
    const consulta: ConsultaAvisos = {
      listar: async () => ({ itens: [], total: 0 }),
      obter: async (id) => avisos.get(id) ?? null,
      decidir: async (id, d) => {
        const aviso = avisos.get(id);
        if (aviso) Object.assign(aviso, { status: d.status, motivo: d.motivo, decididoEm: d.em });
      },
    };
    auditoria = new InMemoryAuditoria();
    triar = new TriarAviso(consulta, auditoria, () => agora);
  });

  it('ignora o pendente com o motivo e audita', async () => {
    await triar.ignorar('u1', 'p', 'Cliente de teste da MobileMed');

    expect(avisos.get('p')).toMatchObject({
      status: 'ignorado',
      motivo: 'Cliente de teste da MobileMed',
    });
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'aviso_cadastro',
        entidadeId: 'p',
        acao: 'ignorado',
        antes: { status: 'pendente', motivo: null },
        depois: { status: 'ignorado', motivo: 'Cliente de teste da MobileMed' },
        em: agora,
      },
    ]);
  });

  it('reabre o ignorado, que volta a pendente sem motivo', async () => {
    await triar.reabrir('u1', 'i');

    expect(avisos.get('i')).toMatchObject({ status: 'pendente', motivo: null });
    expect(auditoria.eventos[0]?.acao).toBe('reaberto');
  });

  it('só ignora o pendente e só reabre o ignorado', async () => {
    await expect(triar.ignorar('u1', 'r', 'teste')).rejects.toThrow(
      'Só um aviso pendente pode ser ignorado.',
    );
    await expect(triar.reabrir('u1', 'p')).rejects.toThrow(
      'Só um aviso ignorado pode ser reaberto.',
    );
    expect(auditoria.eventos).toEqual([]);
  });

  it('aviso que não existe é erro de não encontrado', async () => {
    await expect(triar.ignorar('u1', 'x', 'teste')).rejects.toThrow(AvisoNaoEncontradoError);
  });
});
