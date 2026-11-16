import { describe, expect, it } from 'vitest';

import { AcaoProibidaEscalaError, EscalaInvalidaError } from '../domain';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import { ConsultaOcorrenciasEscala } from './consulta-ocorrencias';
import { OcorrenciasService } from './ocorrencias.service';
import {
  alocacaoEscala,
  dadosEscala,
  FakeCarregadorEscala,
  FakeMedicoDoUsuarioRepository,
} from './testing';

function montar() {
  const carregador = new FakeCarregadorEscala(
    dadosEscala({
      alocacoes: [
        alocacaoEscala({ id: 'a1' }),
        alocacaoEscala({ id: 'a2', medicoId: 'm-bruno', frenteId: 'f-tc' }),
      ],
    }),
  );
  const escopos = new FakeEscopoEscalaRepository();
  const medicos = new FakeMedicoDoUsuarioRepository();
  const service = new OcorrenciasService(
    new ConsultaOcorrenciasEscala(carregador),
    escopos,
    medicos,
  );
  return { service, escopos, medicos, carregador };
}

const gestor = { usuarioId: 'u-gestor', acessoTotal: false };
const admin = { usuarioId: 'u-admin', acessoTotal: true };

describe('OcorrenciasService', () => {
  it('lista a janela com filtros', async () => {
    const { service } = montar();
    const r = await service.listar(gestor, {
      de: '2026-11-16',
      ate: '2026-11-16',
      frenteIds: ['f-tc'],
    });
    expect(r.ocorrencias.map((o) => o.alocacaoId)).toEqual(['a2']);
  });

  it('a gestora com recorte só vê as ocorrências dele; acesso total ignora o recorte', async () => {
    const { service, escopos } = montar();
    await escopos.definir('u-gestor', { turnoIds: [], frenteIds: ['f-neuro'] });
    await escopos.definir('u-admin', { turnoIds: [], frenteIds: ['f-neuro'] });

    const daGestora = await service.listar(gestor, { de: '2026-11-16', ate: '2026-11-16' });
    expect(daGestora.ocorrencias.map((o) => o.alocacaoId)).toEqual(['a1']);

    const doAdmin = await service.listar(admin, { de: '2026-11-16', ate: '2026-11-16' });
    expect(doAdmin.ocorrencias).toHaveLength(2);
  });

  it('recusa janela de mais de 62 dias, invertida ou com data inválida', async () => {
    const { service } = montar();
    await expect(service.listar(admin, { de: '2026-11-01', ate: '2027-01-02' })).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.listar(admin, { de: '2026-11-01', ate: '2027-01-02' })).rejects.toThrow(
      /62 dias/,
    );
    await expect(service.listar(admin, { de: '2026-11-10', ate: '2026-11-01' })).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.listar(admin, { de: '2026-02-31', ate: '2026-03-01' })).rejects.toThrow(
      EscalaInvalidaError,
    );
    // 62 dias com as duas pontas passam.
    await expect(
      service.listar(admin, { de: '2026-11-01', ate: '2027-01-01' }),
    ).resolves.toBeDefined();
  });

  describe('minha escala (portal)', () => {
    it('devolve só as ocorrências do médico vinculado à conta', async () => {
      const { service, medicos } = montar();
      medicos.vinculos.set('u-bruno', 'm-bruno');

      const r = await service.minhaEscala('u-bruno', { de: '2026-11-16', ate: '2026-11-17' });

      expect(r.ocorrencias.map((o) => [o.alocacaoId, o.data])).toEqual([
        ['a2', '2026-11-16'],
        ['a2', '2026-11-17'],
      ]);
    });

    it('conta sem médico vinculado é proibida', async () => {
      const { service } = montar();
      await expect(
        service.minhaEscala('u-sem', { de: '2026-11-16', ate: '2026-11-16' }),
      ).rejects.toThrow(AcaoProibidaEscalaError);
    });

    it('também limita a janela', async () => {
      const { service, medicos } = montar();
      medicos.vinculos.set('u-bruno', 'm-bruno');
      await expect(
        service.minhaEscala('u-bruno', { de: '2026-01-01', ate: '2026-12-31' }),
      ).rejects.toThrow(EscalaInvalidaError);
    });
  });
});
