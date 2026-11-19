import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  DefinirAjusteDia,
  ListarAjustesDia,
  ObterAjusteDia,
} from '../../application/use-cases/ajuste-dia';
import { AjustesDiaController } from './ajuste-dia.controller';

const principal = { tipo: 'usuario', usuarioId: 'g1', acessoTotal: false } as PrincipalUsuario;
const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controller do ajuste do dia da distribuição', () => {
  it('ler pede escala.ver, gravar pede escala.editar (a ação fica na tela Escala)', () => {
    const p = AjustesDiaController.prototype;
    expect(reflector.get(PATH_METADATA, AjustesDiaController)).toBe('distribuicao');
    expect(exigidas(p.listar)).toEqual(['escala.ver']);
    expect(exigidas(p.obter)).toEqual(['escala.ver']);
    expect(exigidas(p.salvar)).toEqual(['escala.editar']);
  });

  it('passa o recorte de quem está logado e embrulha o ajuste', async () => {
    const obter = { executar: vi.fn(async () => null) };
    const definir = { executar: vi.fn(async () => undefined) };
    const listar = { executar: vi.fn(async () => []) };
    const c = new AjustesDiaController(
      obter as unknown as ObterAjusteDia,
      definir as unknown as DefinirAjusteDia,
      listar as unknown as ListarAjustesDia,
    );
    const ator = { usuarioId: 'g1', acessoTotal: false };
    expect(await c.obter(principal, 'a1', '2026-11-18')).toEqual({ ajuste: null });
    expect(obter.executar).toHaveBeenCalledWith(ator, 'a1', '2026-11-18');
    const corpo = {
      prioridadeIdsLiberadas: ['u'],
      segueSla: true,
      clienteId: null,
      laudosExtra: 0,
    };
    await c.salvar(principal, 'a1', '2026-11-18', corpo);
    expect(definir.executar).toHaveBeenCalledWith(ator, 'a1', '2026-11-18', corpo);
    await c.listar(principal, { de: '2026-11-16', ate: '2026-11-22' });
    expect(listar.executar).toHaveBeenCalledWith(ator, { de: '2026-11-16', ate: '2026-11-22' });
  });
});
