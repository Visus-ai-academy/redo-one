import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { FecharCompetencia } from '../../application/use-cases/fechar-competencia';
import type { ListarCompetencias } from '../../application/use-cases/listar-competencias';
import type { ReabrirCompetencia } from '../../application/use-cases/reabrir-competencia';
import type {
  DestravarImportacao,
  TravarImportacao,
} from '../../application/use-cases/travar-importacao';
import { CompetenciasController } from './competencias.controller';
import { CompetenciaParamDto } from './dto/competencia.dto';

const reflector = new Reflector();
const exigidas = (alvo: object) => reflector.get(PERMISSOES_EXIGIDAS, alvo as never);
const caso = <T>(executar: (...a: never[]) => unknown) => ({ executar: vi.fn(executar) }) as T;
const ator = {
  tipo: 'usuario',
  usuarioId: 'u1',
  acessoTotal: false,
  permissoes: new Set<string>(),
} as unknown as PrincipalUsuario;

describe('controller das competências', () => {
  it('listar pede faturamento.ver; cada ação pede a sua permissão', () => {
    const p = CompetenciasController.prototype;
    expect(reflector.get(PATH_METADATA, CompetenciasController)).toBe('faturamento/competencias');
    expect(exigidas(p.listar)).toEqual(['faturamento.ver']);
    expect(exigidas(p.fechar)).toEqual(['faturamento.competencia.fechar']);
    expect(exigidas(p.reabrir)).toEqual(['faturamento.competencia.reabrir']);
    expect(exigidas(p.travar)).toEqual(['faturamento.competencia.travar']);
    expect(exigidas(p.destravar)).toEqual(['faturamento.competencia.travar']);
  });

  it('devolve a página com a paginação pedida e age em nome de quem está logado', async () => {
    const listar = caso<ListarCompetencias>(async () => ({ itens: [], total: 0 }));
    const fechar = caso<FecharCompetencia>(async () => undefined);
    const reabrir = caso<ReabrirCompetencia>(async () => undefined);
    const travar = caso<TravarImportacao>(async () => undefined);
    const destravar = caso<DestravarImportacao>(async () => undefined);
    const c = new CompetenciasController(listar, fechar, reabrir, travar, destravar);

    expect(await c.listar({ pagina: 2, porPagina: 10 })).toEqual({
      itens: [],
      total: 0,
      pagina: 2,
      porPagina: 10,
    });
    await c.fechar(ator, { competencia: '2026-10' });
    expect(fechar.executar).toHaveBeenCalledWith('u1', '2026-10', {
      podeFecharComAvisos: false,
      motivoAvisos: null,
    });
    await c.reabrir(ator, { competencia: '2026-10' });
    await c.travar(ator, { competencia: '2026-10' });
    await c.destravar(ator, { competencia: '2026-10' });
    for (const m of [reabrir, travar, destravar]) {
      expect(m.executar).toHaveBeenCalledWith('u1', '2026-10');
    }
  });

  it('fechar com avisos: repassa o motivo e se quem pede tem a permissão própria', async () => {
    const fechar = caso<FecharCompetencia>(async () => undefined);
    const nada = caso<never>(async () => undefined);
    const c = new CompetenciasController(nada, fechar, nada, nada, nada);
    const comPermissao = {
      ...ator,
      permissoes: new Set(['faturamento.competencia.fechar_com_avisos']),
    } as PrincipalUsuario;

    await c.fechar(comPermissao, { competencia: '2026-10' }, { motivoAvisos: 'Urgente.' });

    expect(fechar.executar).toHaveBeenCalledWith('u1', '2026-10', {
      podeFecharComAvisos: true,
      motivoAvisos: 'Urgente.',
    });
  });

  it('a competência da rota tem de ser AAAA-MM com mês de 01 a 12', () => {
    const erros = (competencia: string) =>
      validateSync(plainToInstance(CompetenciaParamDto, { competencia })).length;
    expect(erros('2026-10')).toBe(0);
    for (const ruim of ['2026-13', '2026-00', '2026-1', '202610', '2026-10-01']) {
      expect(erros(ruim)).toBe(1);
    }
  });
});
