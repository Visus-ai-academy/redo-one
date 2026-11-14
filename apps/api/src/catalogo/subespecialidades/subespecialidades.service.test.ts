import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import type { DadosSubespecialidade } from '../listas/lista.repository';
import { InMemoryListaRepository } from '../testing/fakes';
import {
  EspecialidadeInexistenteError,
  SubespecialidadeSemEspecialidadeError,
} from './subespecialidades.errors';
import { SubespecialidadesService } from './subespecialidades.service';

const ator = { usuarioId: 'u-ana' };
const base = { descricao: null, cor: null, ordem: 0, ativo: true };

describe('SubespecialidadesService', () => {
  let especialidades: InMemoryListaRepository;
  let service: SubespecialidadesService;
  let neuro: string;
  let msk: string;

  beforeEach(async () => {
    especialidades = new InMemoryListaRepository();
    neuro = await especialidades.criar({ ...base, nome: 'NEURO' });
    msk = await especialidades.criar({ ...base, nome: 'MUSCULO ESQUELETICO' });
    service = new SubespecialidadesService(
      new InMemoryListaRepository<DadosSubespecialidade>(),
      especialidades,
      new InMemoryAuditoria(),
      new FixedClock(new Date('2026-11-14T12:00:00Z')),
    );
  });

  it('pertence a uma ou mais especialidades (COLUNAS é de NEURO e de MSK)', async () => {
    const id = await service.criar(ator, {
      ...base,
      nome: 'COLUNAS',
      especialidadeIds: [neuro, msk, neuro],
    });

    expect((await service.obter(id)).especialidadeIds.sort()).toEqual([neuro, msk].sort());
  });

  it('exige ao menos uma especialidade', async () => {
    await expect(
      service.criar(ator, { ...base, nome: 'AVC', especialidadeIds: [] }),
    ).rejects.toThrow(SubespecialidadeSemEspecialidadeError);
  });

  it('recusa especialidade que não existe', async () => {
    await expect(
      service.criar(ator, { ...base, nome: 'AVC', especialidadeIds: ['nao-existe'] }),
    ).rejects.toThrow(EspecialidadeInexistenteError);
  });
});
