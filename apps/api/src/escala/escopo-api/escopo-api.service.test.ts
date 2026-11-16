import { beforeEach, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import type { CadastrosEscopoRepository, Referencia } from './cadastros-escopo.repository';
import {
  EscopoDoProprioUsuarioError,
  FrenteInexistenteError,
  TurnoInexistenteError,
  UsuarioInexistenteError,
} from './escopo-api.errors';
import { EscopoApiService } from './escopo-api.service';

class FakeCadastros implements CadastrosEscopoRepository {
  readonly eventos: EventoAuditoria[] = [];
  constructor(private readonly escopos: FakeEscopoEscalaRepository) {}

  async gravarRecorte(
    usuarioId: string,
    escopo: { turnoIds: string[]; frenteIds: string[] },
    eventos: EventoAuditoria[],
  ) {
    await this.escopos.definir(usuarioId, escopo);
    this.eventos.push(...eventos);
  }

  usuarios = new Set(['u-carla', 'u-admin']);
  turnosCadastrados: Referencia[] = [
    { id: 't-manha', nome: 'Manhã' },
    { id: 't-tarde', nome: 'Tarde' },
  ];
  frentesCadastradas: Referencia[] = [{ id: 'f-neuro', nome: 'NEURO' }];

  async usuarioExiste(id: string) {
    return this.usuarios.has(id);
  }
  async turnos(ids: string[]) {
    return this.turnosCadastrados.filter((t) => ids.includes(t.id));
  }
  async frentes(ids: string[]) {
    return this.frentesCadastradas.filter((f) => ids.includes(f.id));
  }
}

const em = new Date('2026-11-16T12:00:00Z');

describe('EscopoApiService', () => {
  let escopos: FakeEscopoEscalaRepository;
  let auditoria: FakeCadastros;
  let service: EscopoApiService;

  beforeEach(() => {
    escopos = new FakeEscopoEscalaRepository();
    // O recorte e o evento são gravados juntos, na mesma transação, pelo repositório.
    auditoria = new FakeCadastros(escopos);
    service = new EscopoApiService(escopos, auditoria, { now: () => em });
  });

  describe('obter', () => {
    it('sem recorte, devolve listas vazias', async () => {
      expect(await service.obter('u-carla')).toEqual({
        turnoIds: [],
        frenteIds: [],
        turnos: [],
        frentes: [],
      });
    });

    it('devolve os ids e os nomes dos turnos e frentes do recorte', async () => {
      escopos.escopos.set('u-carla', { turnoIds: ['t-tarde'], frenteIds: ['f-neuro'] });
      expect(await service.obter('u-carla')).toEqual({
        turnoIds: ['t-tarde'],
        frenteIds: ['f-neuro'],
        turnos: [{ id: 't-tarde', nome: 'Tarde' }],
        frentes: [{ id: 'f-neuro', nome: 'NEURO' }],
      });
    });

    it('usuário inexistente', async () => {
      await expect(service.obter('u-x')).rejects.toBeInstanceOf(UsuarioInexistenteError);
    });
  });

  describe('definir', () => {
    it('grava o recorte e audita antes e depois com ids e nomes', async () => {
      escopos.escopos.set('u-carla', { turnoIds: ['t-manha'], frenteIds: [] });

      await service.definir({ usuarioId: 'u-admin' }, 'u-carla', {
        turnoIds: ['t-tarde', 't-tarde'],
        frenteIds: ['f-neuro'],
      });

      expect(escopos.escopos.get('u-carla')).toEqual({
        turnoIds: ['t-tarde'],
        frenteIds: ['f-neuro'],
      });
      expect(auditoria.eventos).toEqual([
        {
          ator: { tipo: 'usuario', id: 'u-admin' },
          entidade: 'escopo_escala',
          entidadeId: 'u-carla',
          acao: 'definido',
          antes: { turnoIds: ['t-manha'], frenteIds: [], turnos: ['Manhã'], frentes: [] },
          depois: {
            turnoIds: ['t-tarde'],
            frenteIds: ['f-neuro'],
            turnos: ['Tarde'],
            frentes: ['NEURO'],
          },
          em,
        },
      ]);
    });

    it('nada mudou: não grava evento', async () => {
      escopos.escopos.set('u-carla', { turnoIds: ['t-manha'], frenteIds: [] });
      await service.definir({ usuarioId: 'u-admin' }, 'u-carla', {
        turnoIds: ['t-manha'],
        frenteIds: [],
      });
      expect(auditoria.eventos).toEqual([]);
    });

    it('ninguém edita o próprio recorte', async () => {
      await expect(
        service.definir({ usuarioId: 'u-carla' }, 'u-carla', { turnoIds: [], frenteIds: [] }),
      ).rejects.toBeInstanceOf(EscopoDoProprioUsuarioError);
      expect(auditoria.eventos).toEqual([]);
    });

    it('usuário, turno ou frente inexistente', async () => {
      const ator = { usuarioId: 'u-admin' };
      await expect(
        service.definir(ator, 'u-x', { turnoIds: [], frenteIds: [] }),
      ).rejects.toBeInstanceOf(UsuarioInexistenteError);
      await expect(
        service.definir(ator, 'u-carla', { turnoIds: ['t-x'], frenteIds: [] }),
      ).rejects.toBeInstanceOf(TurnoInexistenteError);
      await expect(
        service.definir(ator, 'u-carla', { turnoIds: [], frenteIds: ['f-x'] }),
      ).rejects.toBeInstanceOf(FrenteInexistenteError);
      expect(escopos.escopos.size).toBe(0);
    });
  });

  describe('doPrincipal', () => {
    it('acesso total nunca tem recorte', async () => {
      escopos.escopos.set('u-admin', { turnoIds: ['t-manha'], frenteIds: [] });
      expect(await service.doPrincipal({ usuarioId: 'u-admin', acessoTotal: true })).toBeNull();
    });

    it('sem linhas, null; com recorte, ids e nomes', async () => {
      expect(await service.doPrincipal({ usuarioId: 'u-carla', acessoTotal: false })).toBeNull();
      escopos.escopos.set('u-carla', { turnoIds: [], frenteIds: ['f-neuro'] });
      expect(await service.doPrincipal({ usuarioId: 'u-carla', acessoTotal: false })).toEqual({
        turnoIds: [],
        frenteIds: ['f-neuro'],
        turnos: [],
        frentes: [{ id: 'f-neuro', nome: 'NEURO' }],
      });
    });
  });
});
