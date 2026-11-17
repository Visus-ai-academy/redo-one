import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { NomeEmUsoError } from '../../catalogo/comum/catalogo.errors';
import { InMemoryListaRepository } from '../../catalogo/testing/fakes';
import { FixedClock } from '../../identidade/testing/fakes';
import { InMemoryMedicosRepository } from '../testing/fakes';
import { MedicoInexistenteError } from './equipes.errors';
import type { DadosEquipe } from './equipes.repository';
import { EquipesService } from './equipes.service';

const AGORA = new Date('2026-11-14T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const equipe = (extra: Partial<DadosEquipe> = {}): DadosEquipe => ({
  nome: 'Equipe 1',
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  plantao: false,
  medicoIds: [],
  ...extra,
});

describe('EquipesService', () => {
  let repo: InMemoryListaRepository<DadosEquipe>;
  let medicos: InMemoryMedicosRepository;
  let auditoria: InMemoryAuditoria;
  let service: EquipesService;
  let ana: string;
  let bruno: string;

  beforeEach(async () => {
    repo = new InMemoryListaRepository<DadosEquipe>();
    medicos = new InMemoryMedicosRepository();
    auditoria = new InMemoryAuditoria();
    service = new EquipesService(repo, medicos, auditoria, new FixedClock(AGORA));
    const base = {
      crm: null,
      idMobilemed: null,
      email: null,
      telefone: null,
      ativo: true,
      ocultoDashboards: false,
      senior: false,
      fellowship: false,
      funcao: null,
      nivelId: null,
      dataInicioVinculo: null,
      observacoes: null,
    };
    ana = await medicos.criar({ ...base, nome: 'Ana Reis', chaveNormalizada: 'ana reis' });
    bruno = await medicos.criar({ ...base, nome: 'Bruno Alves', chaveNormalizada: 'bruno alves' });
  });

  it('cria com os membros sem repetição e audita como equipe', async () => {
    const id = await service.criar(ator, equipe({ medicoIds: [bruno, ana, bruno] }));

    expect(await service.obter(id)).toMatchObject({ medicoIds: [ana, bruno].sort() });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({ entidade: 'equipe', entidadeId: id, acao: 'criado' }),
    ]);
  });

  it('o cadastro não mexe no plantão (é da aba Distribuição): cria fora e mantém o gravado', async () => {
    const id = await service.criar(ator, equipe({ plantao: true }));
    expect((await service.obter(id)).plantao).toBe(false);

    await repo.atualizar(id, { ...(await service.obter(id)), plantao: true });
    await service.atualizar(ator, id, equipe({ nome: 'Equipe 2', plantao: false }));
    expect(await service.obter(id)).toMatchObject({ nome: 'Equipe 2', plantao: true });
  });

  it('aceita equipe sem membros', async () => {
    const id = await service.criar(ator, equipe());

    expect((await service.obter(id)).medicoIds).toEqual([]);
  });

  it('recusa médico que não existe', async () => {
    await expect(service.criar(ator, equipe({ medicoIds: ['nao-existe'] }))).rejects.toThrow(
      MedicoInexistenteError,
    );
  });

  it('recusa nome repetido', async () => {
    await service.criar(ator, equipe());

    await expect(service.criar(ator, equipe({ nome: 'equipe 1' }))).rejects.toThrow(
      'Já existe uma equipe chamada "equipe 1".',
    );
    await expect(service.criar(ator, equipe({ nome: 'equipe 1' }))).rejects.toThrow(NomeEmUsoError);
  });

  it('audita a troca de membros', async () => {
    const id = await service.criar(ator, equipe({ medicoIds: [ana] }));

    await service.atualizar(ator, id, equipe({ medicoIds: [bruno] }));

    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { medicoIds: [ana] },
      depois: { medicoIds: [bruno] },
    });
  });
});
