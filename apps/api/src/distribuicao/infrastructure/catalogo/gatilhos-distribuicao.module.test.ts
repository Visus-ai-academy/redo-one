import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  CLIENTE_REATIVADO,
  type ClienteReativado,
} from '../../../catalogo/clientes/cliente-reativado';
import {
  type ExecutorAvisos,
  REGISTRO_AVISOS,
  type RegistroAvisos,
} from '../../../comum/avisos/registro-avisos';
import {
  GatilhosDistribuicaoModule,
  resolverAvisoAoReativarCliente,
} from './gatilhos-distribuicao.module';

const CLI = '0195f0a0-0000-7000-8000-000000000001';
const agora = new Date('2026-11-26T12:00:00Z');
const tx = {} as ExecutorAvisos;

function registroFake() {
  const chamadas: Parameters<RegistroAvisos['resolverDasEntidades']>[] = [];
  const registro: RegistroAvisos = {
    registrar: async () => {},
    sincronizar: async () => {},
    resolverDasEntidades: async (...args) => {
      chamadas.push(args);
    },
  };
  return { registro, chamadas };
}

describe('resolverAvisoAoReativarCliente', () => {
  it('resolve na hora, na transação do cadastro, o aviso de cliente inativo do cliente', async () => {
    const { registro, chamadas } = registroFake();
    await resolverAvisoAoReativarCliente(registro, () => agora).aoReativar(tx, CLI);

    expect(chamadas).toEqual([
      [tx, { tipos: ['cliente_inativo'], entidades: [{ tipo: 'cliente', id: CLI }], agora }],
    ]);
  });
});

describe('GatilhosDistribuicaoModule', () => {
  it('entrega ao catálogo a porta de cliente reativado, sobre o registro de avisos', async () => {
    const { registro, chamadas } = registroFake();
    // O registro vem do módulo global de avisos da ingestão; aqui, um fake no lugar dele.
    @Global()
    @Module({
      providers: [{ provide: REGISTRO_AVISOS, useValue: registro }],
      exports: [REGISTRO_AVISOS],
    })
    class AvisosFake {}
    const modulo = await Test.createTestingModule({
      imports: [AvisosFake, GatilhosDistribuicaoModule],
    }).compile();

    await modulo.get<ClienteReativado>(CLIENTE_REATIVADO).aoReativar(tx, CLI);
    expect(chamadas[0]?.[1]).toMatchObject({ entidades: [{ tipo: 'cliente', id: CLI }] });
    await modulo.close();
  });
});
