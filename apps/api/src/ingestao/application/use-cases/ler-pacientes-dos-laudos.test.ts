import { describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { existePermissao } from '../../../identidade/permissoes/catalogo';
import { LeituraDePacienteProibidaError } from '../erros';
import type { PacientesLaudos } from '../ports/pacientes-laudos';
import { LerPacientesDosLaudos, PERMISSAO_VER_PACIENTE } from './ler-pacientes-dos-laudos';

const gravados: PacientesLaudos = {
  porLaudos: async (ids) =>
    new Map(
      ids
        .filter((id) => id !== 'sem-paciente')
        .map((id) => [id, { nome: `Nome ${id}`, codigo: `C${id}` }]),
    ),
};

describe('LerPacientesDosLaudos', () => {
  const agora = new Date('2026-11-23T12:00:00Z');
  const novo = (auditoria = new InMemoryAuditoria()) => ({
    auditoria,
    ler: new LerPacientesDosLaudos(gravados, auditoria, () => agora),
  });

  it('a permissão está no catálogo de papéis', () => {
    expect(existePermissao(PERMISSAO_VER_PACIENTE)).toBe(true);
  });

  it('sem a permissão é proibido, e nada é lido nem auditado', async () => {
    const { ler, auditoria } = novo();

    await expect(ler.executar({ usuarioId: 'u1', podeVerPaciente: false }, ['l1'])).rejects.toThrow(
      LeituraDePacienteProibidaError,
    );
    expect(auditoria.eventos).toEqual([]);
  });

  it('devolve o nome e o código e audita cada laudo lido, sem o nome no evento', async () => {
    const { ler, auditoria } = novo();

    const r = await ler.executar({ usuarioId: 'u1', podeVerPaciente: true }, [
      'l1',
      'l1',
      'sem-paciente',
      'l2',
    ]);

    expect(r).toEqual(
      new Map([
        ['l1', { nome: 'Nome l1', codigo: 'Cl1' }],
        ['l2', { nome: 'Nome l2', codigo: 'Cl2' }],
      ]),
    );
    expect(auditoria.eventos).toEqual(
      ['l1', 'l2'].map((id) => ({
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'laudo',
        entidadeId: id,
        acao: 'paciente_lido',
        em: agora,
      })),
    );
    expect(JSON.stringify(auditoria.eventos)).not.toContain('Nome');
  });

  it('sem laudos não lê nem audita', async () => {
    const { ler, auditoria } = novo();

    expect(await ler.executar({ usuarioId: 'u1', podeVerPaciente: true }, [])).toEqual(new Map());
    expect(auditoria.eventos).toEqual([]);
  });
});
