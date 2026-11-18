import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  DefinirPrioridadesCliente,
  ObterPrioridadesCliente,
} from '../../application/use-cases/prioridades-cliente';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { PrioridadesClienteController } from './prioridades-cliente.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const MI = { tipo: 'especialidade' as const, especialidadeId: 'mi', modalidadeId: null };

describe('controller da prioridade do cliente', () => {
  const montar = () => {
    const obter = { executar: vi.fn(async () => [{ frente: MI, nivel: 1 }]) };
    const definir = { executar: vi.fn(async () => undefined) };
    const c = new PrioridadesClienteController(
      obter as unknown as ObterPrioridadesCliente,
      definir as unknown as DefinirPrioridadesCliente,
    );
    return { c, definir };
  };

  it('ler pede clientes.distribuicao.ver, gravar pede clientes.distribuicao.editar', () => {
    const p = PrioridadesClienteController.prototype;
    expect(reflector.get(PATH_METADATA, PrioridadesClienteController)).toBe(
      'distribuicao/clientes/:clienteId/prioridades',
    );
    expect(exigidas(p.obter)).toEqual(['clientes.distribuicao.ver']);
    expect(exigidas(p.salvar)).toEqual(['clientes.distribuicao.editar']);
  });

  it('devolve especialidade ou modalidade e o nível; grava em nome de quem está logado', async () => {
    const { c, definir } = montar();
    expect(await c.obter('c1')).toEqual({
      prioridades: [{ especialidadeId: 'mi', modalidadeId: null, nivel: 1 }],
    });
    await c.salvar(ator, 'c1', {
      prioridades: [
        { especialidadeId: 'mi', modalidadeId: null, nivel: 1 },
        { especialidadeId: null, modalidadeId: 'ct', nivel: 2 },
      ],
    });
    expect(definir.executar).toHaveBeenCalledWith({ tipo: 'usuario', id: 'u1' }, 'c1', [
      { frente: MI, nivel: 1 },
      { frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' }, nivel: 2 },
    ]);
  });

  it('recusa item sem frente ou com as duas', async () => {
    const { c } = montar();
    for (const item of [
      { especialidadeId: null, modalidadeId: null, nivel: 1 },
      { especialidadeId: 'mi', modalidadeId: 'ct', nivel: 1 },
    ]) {
      expect(() => c.salvar(ator, 'c1', { prioridades: [item] })).toThrow(
        ConfiguracaoInvalidaError,
      );
    }
  });
});
