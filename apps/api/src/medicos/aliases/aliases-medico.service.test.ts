import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import { FixedClock } from '../../identidade/testing/fakes';
import type { DadosMedico } from '../cadastro/medicos.repository';
import { normalizarNomeMedico } from '../comum/nome-medico';
import { InMemoryMedicosRepository } from '../testing/fakes';
import { AliasMedicoEmUsoError, AliasMedicoInvalidoError } from './aliases-medico.errors';
import { AliasesMedicoService } from './aliases-medico.service';

const AGORA = new Date('2026-11-14T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const medico = (nome: string): DadosMedico & { chaveNormalizada: string } => ({
  nome,
  chaveNormalizada: normalizarNomeMedico(nome),
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
});

describe('AliasesMedicoService', () => {
  let repo: InMemoryMedicosRepository;
  let auditoria: InMemoryAuditoria;
  let service: AliasesMedicoService;
  let augusto: string;
  let carla: string;

  beforeEach(async () => {
    repo = new InMemoryMedicosRepository();
    auditoria = new InMemoryAuditoria();
    service = new AliasesMedicoService(repo, repo, auditoria, new FixedClock(AGORA));
    augusto = await repo.criar(medico('Augusto Lima'));
    carla = await repo.criar(medico('Carla Souza'));
  });

  it('cria a grafia como veio, conferida à mão, e audita no médico', async () => {
    const id = await service.criar(ator, augusto, {
      nomeOrigem: '  Dr. Augusto C. Lima (E2) ',
      observacoes: ' grafia da MobileMed ',
    });

    expect(repo.aliases.get(id)).toMatchObject({
      medicoId: augusto,
      nomeOrigem: 'Dr. Augusto C. Lima (E2)',
      chaveNormalizada: 'augusto c lima',
      origem: 'manual',
      verificadoManualmente: true,
      observacoes: 'grafia da MobileMed',
    });
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        entidade: 'medico',
        entidadeId: augusto,
        acao: 'alias_criado',
        depois: { nomeOrigem: 'Dr. Augusto C. Lima (E2)', observacoes: 'grafia da MobileMed' },
      }),
    ]);
  });

  it('recusa grafia sem letras', async () => {
    await expect(
      service.criar(ator, augusto, { nomeOrigem: ' (E2) ', observacoes: null }),
    ).rejects.toThrow(AliasMedicoInvalidoError);
  });

  it('recusa a grafia que já é a do próprio médico', async () => {
    await expect(
      service.criar(ator, augusto, { nomeOrigem: 'Dr. AUGUSTO LIMA', observacoes: null }),
    ).rejects.toThrow('Essa grafia já é a do próprio médico: não precisa de apelido.');
  });

  it('recusa a grafia que é o nome de outro médico', async () => {
    await expect(
      service.criar(ator, augusto, { nomeOrigem: 'Dra. Carla Souza', observacoes: null }),
    ).rejects.toThrow('Essa grafia é o nome do médico Carla Souza.');
  });

  it('recusa grafia repetida, dizendo de quem ela é', async () => {
    await service.criar(ator, carla, { nomeOrigem: 'C. Souza', observacoes: null });

    await expect(
      service.criar(ator, augusto, { nomeOrigem: 'c souza', observacoes: null }),
    ).rejects.toThrow(AliasMedicoEmUsoError);
    await expect(
      service.criar(ator, augusto, { nomeOrigem: 'c souza', observacoes: null }),
    ).rejects.toThrow('Essa grafia já está ligada a Carla Souza.');
    await expect(
      service.criar(ator, carla, { nomeOrigem: 'c souza', observacoes: null }),
    ).rejects.toThrow('Esse apelido já existe para este médico.');
  });

  it('avisa quando o médico não existe', async () => {
    await expect(
      service.criar(ator, 'nao-existe', { nomeOrigem: 'Fulano', observacoes: null }),
    ).rejects.toThrow(ItemNaoEncontradoError);
  });

  it('exclui o apelido do médico e audita', async () => {
    const id = await service.criar(ator, augusto, { nomeOrigem: 'A. Lima', observacoes: null });

    await service.excluir(ator, augusto, id);

    expect(repo.aliases.has(id)).toBe(false);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alias_excluido',
      antes: { nomeOrigem: 'A. Lima' },
    });
  });

  it('não exclui apelido de outro médico', async () => {
    const id = await service.criar(ator, augusto, { nomeOrigem: 'A. Lima', observacoes: null });

    await expect(service.excluir(ator, carla, id)).rejects.toThrow('Apelido não encontrado.');
    expect(repo.aliases.has(id)).toBe(true);
  });
});
