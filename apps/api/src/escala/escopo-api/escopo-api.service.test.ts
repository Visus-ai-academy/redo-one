import { beforeEach, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import type { CadastrosEscopoRepository, Referencia } from './cadastros-escopo.repository';
import {
  EscopoDoProprioUsuarioError,
  FrenteInexistenteError,
  RecorteEscalaInvalidoError,
  TurnoInexistenteError,
  UsuarioInexistenteError,
} from './escopo-api.errors';
import { EscopoApiService } from './escopo-api.service';

class FakeCadastros implements CadastrosEscopoRepository {
  readonly eventos: EventoAuditoria[] = [];
  constructor(private readonly escopos: FakeEscopoEscalaRepository) {}

  async gravarRecorte(
    usuarioId: string,
    escopo: { veTodaEscala: boolean; turnoIds: string[]; frenteIds: string[] },
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
    it('vê toda a escala: o "todos" explícito, com as listas vazias', async () => {
      expect(await service.obter('u-carla')).toEqual({
        veTodaEscala: true,
        turnoIds: [],
        frenteIds: [],
        turnos: [],
        frentes: [],
      });
    });

    it('devolve os ids e os nomes dos turnos e frentes do recorte', async () => {
      escopos.escopos.set('u-carla', {
        veTodaEscala: false,
        turnoIds: ['t-tarde'],
        frenteIds: ['f-neuro'],
      });
      expect(await service.obter('u-carla')).toEqual({
        veTodaEscala: false,
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
      escopos.escopos.set('u-carla', { veTodaEscala: false, turnoIds: ['t-manha'], frenteIds: [] });

      await service.definir({ usuarioId: 'u-admin' }, 'u-carla', {
        veTodaEscala: false,
        turnoIds: ['t-tarde', 't-tarde'],
        frenteIds: ['f-neuro'],
      });

      expect(escopos.escopos.get('u-carla')).toEqual({
        veTodaEscala: false,
        turnoIds: ['t-tarde'],
        frenteIds: ['f-neuro'],
      });
      expect(auditoria.eventos).toEqual([
        {
          ator: { tipo: 'usuario', id: 'u-admin' },
          entidade: 'escopo_escala',
          entidadeId: 'u-carla',
          acao: 'definido',
          antes: {
            veTodaEscala: false,
            turnoIds: ['t-manha'],
            frenteIds: [],
            turnos: ['Manhã'],
            frentes: [],
          },
          depois: {
            veTodaEscala: false,
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
      escopos.escopos.set('u-carla', { veTodaEscala: false, turnoIds: ['t-manha'], frenteIds: [] });
      await service.definir({ usuarioId: 'u-admin' }, 'u-carla', {
        veTodaEscala: false,
        turnoIds: ['t-manha'],
        frenteIds: [],
      });
      expect(auditoria.eventos).toEqual([]);
    });

    it('vazio nunca é "toda a escala": sem o "todos", ao menos um turno ou frente', async () => {
      const ator = { usuarioId: 'u-admin' };
      await expect(
        service.definir(ator, 'u-carla', { veTodaEscala: false, turnoIds: [], frenteIds: [] }),
      ).rejects.toBeInstanceOf(RecorteEscalaInvalidoError);
      await expect(
        service.definir(ator, 'u-carla', {
          veTodaEscala: true,
          turnoIds: ['t-manha'],
          frenteIds: [],
        }),
      ).rejects.toThrow(/não as duas/);
      expect(escopos.escopos.size).toBe(0);
    });

    it('"vê toda a escala" grava o "todos" e tira as linhas', async () => {
      escopos.escopos.set('u-carla', { veTodaEscala: false, turnoIds: ['t-manha'], frenteIds: [] });
      await service.definir({ usuarioId: 'u-admin' }, 'u-carla', {
        veTodaEscala: true,
        turnoIds: [],
        frenteIds: [],
      });
      expect(escopos.escopos.get('u-carla')).toEqual({
        veTodaEscala: true,
        turnoIds: [],
        frenteIds: [],
      });
      expect(auditoria.eventos[0]?.depois).toMatchObject({ veTodaEscala: true });
    });

    it('ninguém edita o próprio recorte', async () => {
      await expect(
        service.definir({ usuarioId: 'u-carla' }, 'u-carla', {
          veTodaEscala: true,
          turnoIds: [],
          frenteIds: [],
        }),
      ).rejects.toBeInstanceOf(EscopoDoProprioUsuarioError);
      expect(auditoria.eventos).toEqual([]);
    });

    it('usuário, turno ou frente inexistente', async () => {
      const ator = { usuarioId: 'u-admin' };
      await expect(
        service.definir(ator, 'u-x', { veTodaEscala: true, turnoIds: [], frenteIds: [] }),
      ).rejects.toBeInstanceOf(UsuarioInexistenteError);
      await expect(
        service.definir(ator, 'u-carla', { veTodaEscala: false, turnoIds: ['t-x'], frenteIds: [] }),
      ).rejects.toBeInstanceOf(TurnoInexistenteError);
      await expect(
        service.definir(ator, 'u-carla', { veTodaEscala: false, turnoIds: [], frenteIds: ['f-x'] }),
      ).rejects.toBeInstanceOf(FrenteInexistenteError);
      expect(escopos.escopos.size).toBe(0);
    });
  });

  describe('doPrincipal', () => {
    it('acesso total nunca tem recorte', async () => {
      escopos.escopos.set('u-admin', { veTodaEscala: false, turnoIds: ['t-manha'], frenteIds: [] });
      expect(await service.doPrincipal({ usuarioId: 'u-admin', acessoTotal: true })).toBeNull();
    });

    it('vê toda a escala, null; com recorte, ids e nomes', async () => {
      expect(await service.doPrincipal({ usuarioId: 'u-carla', acessoTotal: false })).toBeNull();
      escopos.escopos.set('u-carla', { veTodaEscala: false, turnoIds: [], frenteIds: ['f-neuro'] });
      expect(await service.doPrincipal({ usuarioId: 'u-carla', acessoTotal: false })).toEqual({
        veTodaEscala: false,
        turnoIds: [],
        frenteIds: ['f-neuro'],
        turnos: [],
        frentes: [{ id: 'f-neuro', nome: 'NEURO' }],
      });
    });
  });
});
