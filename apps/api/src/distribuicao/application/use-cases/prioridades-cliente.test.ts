import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { FrenteEscala } from '../../domain/arranjo';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { CadastrosEmMemoria, PrioridadesClienteEmMemoria } from '../../testing/fakes';
import { ClienteNaoEncontradoError } from '../erros';
import { DefinirPrioridadesCliente, ObterPrioridadesCliente } from './prioridades-cliente';

const agora = new Date('2026-11-17T18:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };
const MI: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'mi', modalidadeId: null };
const CT: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' };

describe('prioridade do cliente na distribuição', () => {
  let repo: PrioridadesClienteEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterPrioridadesCliente;
  let definir: DefinirPrioridadesCliente;

  beforeEach(() => {
    repo = new PrioridadesClienteEmMemoria();
    const cadastros = new CadastrosEmMemoria();
    cadastros.existentes.set('cliente', new Set(['c1']));
    cadastros.existentes.set('especialidade', new Set(['mi']));
    cadastros.existentes.set('modalidade', new Set(['ct']));
    auditoria = new InMemoryAuditoria();
    obter = new ObterPrioridadesCliente(repo, cadastros);
    definir = new DefinirPrioridadesCliente(repo, cadastros, auditoria, () => agora);
  });

  it('cliente sem prioridade: lista vazia (normal em tudo)', async () => {
    expect(await obter.executar('c1')).toEqual([]);
  });

  it('cliente que não existe: 404', async () => {
    await expect(obter.executar('x')).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
    await expect(definir.executar(ator, 'x', [])).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
  });

  it('troca a lista e audita antes e depois; sem mudança, nada', async () => {
    await definir.executar(ator, 'c1', [
      { frente: CT, nivel: 2 },
      { frente: MI, nivel: 1 },
    ]);
    await definir.executar(ator, 'c1', [
      { frente: MI, nivel: 1 },
      { frente: CT, nivel: 2 },
    ]);
    expect(repo.gravacoes).toBe(1);
    expect(await obter.executar('c1')).toEqual([
      { frente: MI, nivel: 1 },
      { frente: CT, nivel: 2 },
    ]);
    expect(auditoria.eventos).toEqual([
      {
        ator,
        entidade: 'prioridades_cliente',
        entidadeId: 'c1',
        acao: 'alterado',
        antes: { prioridades: [] },
        depois: {
          prioridades: [
            { frente: MI, nivel: 1 },
            { frente: CT, nivel: 2 },
          ],
        },
        em: agora,
      },
    ]);
  });

  it('recusa nível inválido e frente que não existe', async () => {
    await expect(definir.executar(ator, 'c1', [{ frente: MI, nivel: 5 }])).rejects.toBeInstanceOf(
      ConfiguracaoInvalidaError,
    );
    const outra: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'z', modalidadeId: null };
    await expect(definir.executar(ator, 'c1', [{ frente: outra, nivel: 1 }])).rejects.toThrow(
      /Especialidade não encontrada/,
    );
    expect(repo.gravacoes).toBe(0);
  });
});
