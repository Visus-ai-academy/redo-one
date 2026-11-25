import { beforeEach, describe, expect, it } from 'vitest';

import { FakeEscopoEscalaRepository } from '../testing/fakes';
import { PeriodoHistoricoInvalidoError } from './historico.errors';
import type {
  FiltroHistoricoEscala,
  HistoricoEscalaRepository,
  ItemHistoricoEscala,
} from './historico.repository';
import { HistoricoEscalaService } from './historico.service';

class FakeHistorico implements HistoricoEscalaRepository {
  filtros: FiltroHistoricoEscala[] = [];
  async listar(filtro: FiltroHistoricoEscala) {
    this.filtros.push(filtro);
    return { itens: [] as ItemHistoricoEscala[], total: 0, nomes: {} };
  }
}

describe('HistoricoEscalaService', () => {
  let escopos: FakeEscopoEscalaRepository;
  let historico: FakeHistorico;
  let service: HistoricoEscalaService;
  const gestora = { usuarioId: 'u-carla', acessoTotal: false };

  beforeEach(() => {
    escopos = new FakeEscopoEscalaRepository();
    historico = new FakeHistorico();
    service = new HistoricoEscalaService(historico, escopos);
  });

  it('dias de Brasília viram instantes: de às 00:00 -03 e até exclusivo no dia seguinte', async () => {
    await service.listar(gestora, {
      de: '2026-11-01',
      ate: '2026-11-15',
      pagina: 2,
      porPagina: 25,
    });
    expect(historico.filtros[0]).toEqual({
      de: new Date('2026-11-01T03:00:00Z'),
      ateExclusivo: new Date('2026-11-16T03:00:00Z'),
      escopo: null,
      pagina: 2,
      porPagina: 25,
    });
  });

  it('repassa médico e entidade', async () => {
    await service.listar(gestora, {
      medicoId: 'm-1',
      entidade: 'ausencia',
      pagina: 1,
      porPagina: 25,
    });
    expect(historico.filtros[0]).toMatchObject({ medicoId: 'm-1', entidade: 'ausencia' });
  });

  it('início depois do fim é período inválido', async () => {
    await expect(
      service.listar(gestora, { de: '2026-11-16', ate: '2026-11-15', pagina: 1, porPagina: 25 }),
    ).rejects.toBeInstanceOf(PeriodoHistoricoInvalidoError);
  });

  it('aplica o recorte de quem consulta; acesso total nunca tem recorte', async () => {
    escopos.escopos.set('u-carla', { veTodaEscala: false, turnoIds: ['t-manha'], frenteIds: [] });
    escopos.escopos.set('u-admin', { veTodaEscala: false, turnoIds: ['t-manha'], frenteIds: [] });

    await service.listar(gestora, { pagina: 1, porPagina: 25 });
    await service.listar({ usuarioId: 'u-admin', acessoTotal: true }, { pagina: 1, porPagina: 25 });

    expect(historico.filtros[0]?.escopo).toEqual({
      turnoIds: new Set(['t-manha']),
      frenteIds: new Set(),
    });
    expect(historico.filtros[1]?.escopo).toBeNull();
  });
});
