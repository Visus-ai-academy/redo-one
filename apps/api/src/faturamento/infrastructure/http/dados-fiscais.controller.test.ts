import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  DefinirDadosFiscais,
  ObterDadosFiscais,
} from '../../application/use-cases/dados-fiscais';
import { DADOS_FISCAIS_VAZIOS } from '../../domain/dados-fiscais';
import { DadosFiscaisController } from './dados-fiscais.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('controller dos dados de faturamento do cliente', () => {
  it('ler pede clientes.faturamento.ver, gravar pede clientes.faturamento.editar', () => {
    const p = DadosFiscaisController.prototype;
    expect(reflector.get(PATH_METADATA, DadosFiscaisController)).toBe(
      'faturamento/clientes/:clienteId/dados-fiscais',
    );
    expect(exigidas(p.obter)).toEqual(['clientes.faturamento.ver']);
    expect(exigidas(p.salvar)).toEqual(['clientes.faturamento.editar']);
  });

  it('devolve os dados com o Omie achatado; grava em nome de quem está logado', async () => {
    const em = new Date('2026-03-11T03:23:09.850Z');
    const obter = {
      executar: vi.fn(async () => ({
        dados: { ...DADOS_FISCAIS_VAZIOS, emailsNf: ['a@x.com'] },
        omie: { codigoCliente: '855', sincronizadoEm: em },
        atualizadoEm: em,
        atualizadoPor: 'Ana',
      })),
    };
    const definir = { executar: vi.fn(async () => undefined) };
    const c = new DadosFiscaisController(
      obter as unknown as ObterDadosFiscais,
      definir as unknown as DefinirDadosFiscais,
    );

    expect(await c.obter('c1')).toEqual({
      ...DADOS_FISCAIS_VAZIOS,
      emailsNf: ['a@x.com'],
      omieCodigoCliente: '855',
      omieSincronizadoEm: em,
      atualizadoEm: em,
      atualizadoPor: 'Ana',
    });
    const corpo = { ...DADOS_FISCAIS_VAZIOS, cidade: 'X' };
    await c.salvar(ator, 'c1', corpo);
    expect(definir.executar).toHaveBeenCalledWith('u1', 'c1', corpo);
  });
});
