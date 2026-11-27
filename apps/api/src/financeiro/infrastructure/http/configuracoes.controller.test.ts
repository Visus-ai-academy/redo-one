import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type {
  ConsultarConfiguracoes,
  ConsultarInadimplencia,
  SalvarConfiguracao,
} from '../../application/use-cases/configuracoes';
import {
  ConfiguracoesFinanceirasController,
  InadimplenciaController,
} from './configuracoes.controller';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);

describe('controllers das regras financeiras e da inadimplência', () => {
  it('regras pedem financeiro-config; a inadimplência vem com o ver de contas a receber', () => {
    expect(exigidas(ConfiguracoesFinanceirasController.prototype.listar)).toEqual([
      'financeiro-config.ver',
    ]);
    expect(exigidas(ConfiguracoesFinanceirasController.prototype.atualizar)).toEqual([
      'financeiro-config.editar',
    ]);
    expect(exigidas(InadimplenciaController.prototype.listar)).toEqual(['contas-receber.ver']);
  });

  it('"todas" é explícito; salvar é de quem está logado', async () => {
    const consultar = { listar: vi.fn(async () => ({ itens: [], total: 0 })) };
    const c = new InadimplenciaController(consultar as unknown as ConsultarInadimplencia);
    await c.listar({ empresa: 'todas', faixa: 6, pagina: 1, porPagina: 25 });
    expect(consultar.listar).toHaveBeenCalledWith(
      expect.objectContaining({ empresa: 'todas', faixa: 6 }),
    );
    const salvar = { executar: vi.fn() };
    const r = new ConfiguracoesFinanceirasController(
      {} as ConsultarConfiguracoes,
      salvar as unknown as SalvarConfiguracao,
    );
    const corpo = {
      faixasInadimplencia: [1, 5],
      horizonteRecorrenciaMeses: 3,
      ajusteDiaNaoUtil: 'posterga' as const,
    };
    await r.atualizar({ usuarioId: 'u1' } as PrincipalUsuario, 'e1', corpo);
    expect(salvar.executar).toHaveBeenCalledWith({ usuarioId: 'u1' }, 'e1', corpo);
  });
});
