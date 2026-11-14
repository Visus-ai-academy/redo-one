import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import type { AliasesClienteService } from './aliases-cliente.service';
import { ClientesController } from './clientes.controller';
import type { ClientesService } from './clientes.service';

describe('ClientesController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/clientes; ler exige clientes.ver e mudar (inclusive apelidos) clientes.editar', () => {
    expect(reflector.get(PATH_METADATA, ClientesController)).toBe('catalogo/clientes');
    const exigidas = (m: keyof ClientesController) =>
      reflector.get(PERMISSOES_EXIGIDAS, ClientesController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['clientes.ver'], ['clientes.ver']]);
    for (const m of ['criar', 'atualizar', 'excluir', 'criarAlias', 'excluirAlias'] as const) {
      expect(exigidas(m)).toEqual(['clientes.editar']);
    }
  });

  it('cria apelido no cliente da rota em nome de quem está logado', async () => {
    const aliases = { criar: vi.fn(async () => 'a-1') };
    const controller = new ClientesController(
      {} as ClientesService,
      aliases as unknown as AliasesClienteService,
    );
    const corpo = { tipo: 'exato' as const, padrao: 'PRN2', observacoes: null };

    await expect(
      controller.criarAlias({ usuarioId: 'u-ana' } as PrincipalUsuario, 'c-1', corpo),
    ).resolves.toEqual({ id: 'a-1' });
    expect(aliases.criar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 'c-1', corpo);
  });
});
