import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { HistoricoCadastroController } from './historico-cadastro.controller';
import type { HistoricoCadastroService } from './historico-cadastro.service';

describe('HistoricoCadastroController', () => {
  const reflector = new Reflector();
  const p = HistoricoCadastroController.prototype;

  it('uma rota por cadastro, cada uma com o ver do cadastro', () => {
    expect(
      [p.doMedico, p.doCliente, p.doExame, p.doFornecedor, p.doTituloPagar].map((h) =>
        reflector.get(PATH_METADATA, h),
      ),
    ).toEqual([
      'medicos/:id/historico',
      'catalogo/clientes/:id/historico',
      'catalogo/exames/:id/historico',
      'financeiro/fornecedores/:id/historico',
      'financeiro/contas-pagar/titulos/:id/historico',
    ]);
    expect(
      [p.doMedico, p.doCliente, p.doExame, p.doFornecedor, p.doTituloPagar].map((h) =>
        reflector.get(PERMISSOES_EXIGIDAS, h),
      ),
    ).toEqual([
      ['medicos.ver'],
      ['clientes.ver'],
      ['exames.ver'],
      ['fornecedores.ver'],
      ['contas-pagar.ver'],
    ]);
  });

  it('passa quem consulta (para o recorte do médico) e devolve a página', async () => {
    const pagina = { itens: [], total: 3, nomes: { a: 'Ana' } };
    const service = {
      doMedico: vi.fn(async () => pagina),
      doCliente: vi.fn(async () => pagina),
      doExame: vi.fn(async () => pagina),
      doFornecedor: vi.fn(async () => pagina),
    };
    const controller = new HistoricoCadastroController(
      service as unknown as HistoricoCadastroService,
    );
    const principal = { usuarioId: 'u-1' } as PrincipalUsuario;
    const query = { pagina: 2, porPagina: 10 };

    expect(await controller.doMedico(principal, 'm-1', query)).toEqual({
      ...pagina,
      pagina: 2,
      porPagina: 10,
    });
    expect(service.doMedico).toHaveBeenCalledWith(principal, 'm-1', query);
    await controller.doCliente('c-1', query);
    expect(service.doCliente).toHaveBeenCalledWith('c-1', query);
    await controller.doExame('x-1', query);
    expect(service.doExame).toHaveBeenCalledWith('x-1', query);
    await controller.doFornecedor('f-1', query);
    expect(service.doFornecedor).toHaveBeenCalledWith('f-1', query);
  });
});
