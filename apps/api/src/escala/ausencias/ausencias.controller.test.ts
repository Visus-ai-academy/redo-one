import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import {
  PERMISSOES_EXIGIDAS,
  ROTA_DE_ROBO,
  ROTA_PUBLICA,
} from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { AusenciasController } from './ausencias.controller';
import type { AusenciasService } from './ausencias.service';
import { PortalAusenciasController } from './portal-ausencias.controller';
import type { PortalAusenciasService } from './portal-ausencias.service';

const gestora = { usuarioId: 'u-g', acessoTotal: false } as PrincipalUsuario;
const quem = { usuarioId: 'u-g', acessoTotal: false };
const corpo = { tipoId: 't-1', dataInicio: '2026-12-01', dataFim: '2026-12-02' };
const item = {
  id: 'a-1',
  medico: { id: 'm-1', nome: 'Ana' },
  tipo: { id: 't-1', nome: 'Férias', cor: null },
  dataInicio: '2026-12-01',
  dataFim: '2026-12-02',
  diasSemana: [],
  frentes: [],
  turnos: [],
  situacao: 'pendente' as const,
  origem: 'medico' as const,
  observacoes: 'x',
  motivoRecusa: null,
  solicitadaPor: { id: 'u-a', nome: 'Ana' },
  revisadaPor: null,
  revisadaEm: null,
  criadoEm: new Date(0),
};

const reflector = new Reflector();
const meta = (chave: string, alvo: object, metodo: string) =>
  reflector.get(chave, (alvo as Record<string, object>)[metodo] as never);

describe('AusenciasController', () => {
  function montar() {
    const service = {
      listar: vi.fn(async () => ({ itens: [item], total: 1 })),
      obter: vi.fn(async () => item),
      contarPendentes: vi.fn(async () => 3),
      criar: vi.fn(async () => ['a-1', 'a-2']),
      atualizar: vi.fn(async () => undefined),
      excluir: vi.fn(async () => undefined),
      aprovar: vi.fn(async () => undefined),
      recusar: vi.fn(async () => undefined),
    };
    return { service, controller: new AusenciasController(service as unknown as AusenciasService) };
  }

  it('fica em /escala/ausencias com a permissão de cada ação', () => {
    const p = AusenciasController.prototype;
    expect(reflector.get(PATH_METADATA, AusenciasController)).toBe('escala/ausencias');
    const esperado: Record<string, string> = {
      listar: 'escala.ver',
      obter: 'escala.ver',
      contarPendentes: 'escala.ausencia.aprovar',
      criar: 'escala.ausencia.editar',
      atualizar: 'escala.ausencia.editar',
      excluir: 'escala.ausencia.editar',
      aprovar: 'escala.ausencia.aprovar',
      recusar: 'escala.ausencia.aprovar',
    };
    for (const [metodo, chave] of Object.entries(esperado)) {
      expect(meta(PERMISSOES_EXIGIDAS, p, metodo)).toEqual([chave]);
    }
    expect(meta(PATH_METADATA, p, 'contarPendentes')).toBe('pendentes/contagem');
  });

  it('lista com os filtros e devolve a página pedida', async () => {
    const { controller, service } = montar();

    await expect(
      controller.listar(gestora, { pagina: 2, porPagina: 10, situacao: 'pendente', busca: 'an' }),
    ).resolves.toEqual({ itens: [item], total: 1, pagina: 2, porPagina: 10 });
    expect(service.listar).toHaveBeenCalledWith(quem, {
      pagina: 2,
      porPagina: 10,
      situacao: 'pendente',
      busca: 'an',
    });
  });

  it('repassa quem pede a cada ação', async () => {
    const { controller, service } = montar();

    await expect(controller.obter(gestora, 'a-1')).resolves.toBe(item);
    await expect(controller.contarPendentes(gestora)).resolves.toEqual({ pendentes: 3 });
    await expect(
      controller.criar(gestora, { ...corpo, medicoIds: ['m-1', 'm-2'] }),
    ).resolves.toEqual({
      ids: ['a-1', 'a-2'],
    });
    expect(service.criar).toHaveBeenCalledWith(quem, { ...corpo, medicoIds: ['m-1', 'm-2'] });
    await controller.atualizar(gestora, 'a-1', corpo);
    expect(service.atualizar).toHaveBeenCalledWith(quem, 'a-1', corpo);
    await controller.excluir(gestora, 'a-1');
    expect(service.excluir).toHaveBeenCalledWith(quem, 'a-1');
    await controller.aprovar(gestora, 'a-1');
    expect(service.aprovar).toHaveBeenCalledWith(quem, 'a-1');
    await controller.recusar(gestora, 'a-1', { motivo: 'cheia' });
    expect(service.recusar).toHaveBeenCalledWith(quem, 'a-1', 'cheia');
  });
});

describe('PortalAusenciasController', () => {
  function montar() {
    const service = {
      listar: vi.fn(async () => [item]),
      solicitar: vi.fn(async () => 'a-9'),
      cancelar: vi.fn(async () => undefined),
    };
    return {
      service,
      controller: new PortalAusenciasController(service as unknown as PortalAusenciasService),
    };
  }

  it('fica em /escala/portal/ausencias, só com sessão de pessoa (sem permissão de tela)', () => {
    const p = PortalAusenciasController.prototype;
    expect(reflector.get(PATH_METADATA, PortalAusenciasController)).toBe('escala/portal/ausencias');
    for (const metodo of ['listar', 'solicitar', 'cancelar']) {
      expect(meta(PERMISSOES_EXIGIDAS, p, metodo)).toBeUndefined();
      expect(meta(ROTA_PUBLICA, p, metodo)).toBeUndefined();
      expect(meta(ROTA_DE_ROBO, p, metodo)).toBeUndefined();
    }
  });

  it('lista sem quem pediu nem quem revisou', async () => {
    const { controller, service } = montar();

    const [primeira] = await controller.listar(gestora);

    expect(service.listar).toHaveBeenCalledWith({ usuarioId: 'u-g' });
    expect(primeira).not.toHaveProperty('solicitadaPor');
    expect(primeira).not.toHaveProperty('revisadaPor');
    expect(primeira).toMatchObject({ id: 'a-1', observacoes: 'x' });
  });

  it('pede e cancela em nome da conta logada', async () => {
    const { controller, service } = montar();
    const pedido = { ...corpo, observacoes: 'Congresso' };

    await expect(controller.solicitar(gestora, pedido)).resolves.toEqual({ id: 'a-9' });
    expect(service.solicitar).toHaveBeenCalledWith({ usuarioId: 'u-g' }, pedido);
    await controller.cancelar(gestora, 'a-9');
    expect(service.cancelar).toHaveBeenCalledWith({ usuarioId: 'u-g' }, 'a-9');
  });
});
