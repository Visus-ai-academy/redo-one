import { describe, expect, it } from 'vitest';

import type { EntradaDemonstrativo } from '../../domain/demonstrativo';
import { PARAMETROS_INICIAIS } from '../../domain/parametros-demonstrativo';
import type { DemonstrativosRepository } from '../ports/demonstrativos.repository';
import type { EntradasDemonstrativo } from '../ports/entradas-demonstrativo';
import {
  DemonstrativoNaoEncontradoError,
  DetalharLaudoDemonstrativo,
  ObterDemonstrativo,
} from './consultar-demonstrativos';

const entrada: EntradaDemonstrativo = {
  competencia: '2026-11',
  clientes: new Map([['c1', { ativo: true, unidade: false, contratadoId: null }]]),
  laudos: [
    {
      id: 'l1',
      clienteId: 'c1',
      unidadeId: null,
      diaLaudo: '2026-11-03',
      modalidadeId: 'MR',
      especialidadeId: 'NEURO',
      categoriaId: 'SC',
      prioridadeId: 'ROTINA',
      volume: 1,
      duplicado: false,
      assinado: true,
      tipificacao: { fatura: true },
      pecas: [],
      medicoId: null,
    },
  ],
  precosPorCliente: new Map(),
  precosPorContratado: new Map(),
  parametros: { ...PARAMETROS_INICIAIS },
  alternativas: new Map(),
  reclassificacoes: [],
  equipesDoMedico: new Map(),
  ajustes: new Map(),
};

describe('consultar os demonstrativos', () => {
  const entradas: EntradasDemonstrativo = {
    carregar: async (_c, opcoes) => {
      expect(opcoes).toEqual({ clienteId: 'c1' });
      return {
        entrada,
        nomes: {
          clientes: new Map(),
          modalidades: new Map(),
          especialidades: new Map(),
          categorias: new Map(),
          prioridades: new Map(),
        },
      };
    },
    localizarLaudo: async (id) =>
      id === 'l1'
        ? {
            id: 'l1',
            competencia: '2026-11',
            clienteId: 'c1',
            unidadeId: null,
            estudo: 'RM CRANIO',
            diaLaudo: '2026-11-03',
            volume: 1,
            status: 'Assinado',
          }
        : null,
  };

  it('o detalhe do laudo é calculado na hora, com só os laudos do cliente dele', async () => {
    const d = await new DetalharLaudoDemonstrativo(entradas).executar('l1');
    expect(d).toMatchObject({
      laudo: { id: 'l1', estudo: 'RM CRANIO' },
      situacao: 'fatura',
      ajuste: null,
      parcelas: [{ unitarioCentavos: null, quantidade: 1 }],
    });
  });

  it('laudo inexistente ou sem cliente: não encontrado', async () => {
    await expect(new DetalharLaudoDemonstrativo(entradas).executar('x')).rejects.toBeInstanceOf(
      DemonstrativoNaoEncontradoError,
    );
  });

  it('demonstrativo sem versão para o cliente: não encontrado', async () => {
    const repo = {
      obter: async () => null,
      versoes: async () => [],
    } as unknown as DemonstrativosRepository;
    await expect(new ObterDemonstrativo(repo).executar('2026-11', 'c1')).rejects.toBeInstanceOf(
      DemonstrativoNaoEncontradoError,
    );
  });
});
