import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import { FixedClock } from '../../identidade/testing/fakes';
import type { DadosMedico } from '../cadastro/medicos.repository';
import { normalizarNomeMedico } from '../comum/nome-medico';
import { InMemoryMedicosRepository } from '../testing/fakes';
import { OutrasContasMedicoService } from './outras-contas-medico.service';

const AGORA = new Date('2026-11-24T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const medico = (
  nome: string,
  idMobilemed: number | null,
): DadosMedico & {
  chaveNormalizada: string;
} => ({
  nome,
  chaveNormalizada: normalizarNomeMedico(nome),
  crm: null,
  idMobilemed,
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

describe('OutrasContasMedicoService', () => {
  let repo: InMemoryMedicosRepository;
  let auditoria: InMemoryAuditoria;
  let service: OutrasContasMedicoService;
  let james: string;
  let tiago: string;

  beforeEach(async () => {
    repo = new InMemoryMedicosRepository();
    auditoria = new InMemoryAuditoria();
    service = new OutrasContasMedicoService(repo, repo, auditoria, new FixedClock(AGORA));
    james = await repo.criar(medico('James Yared', 7968));
    tiago = await repo.criar(medico('Tiago Lordelo', 14087));
  });

  it('adiciona a conta com a observação, aparece no detalhe e audita no médico', async () => {
    const id = await service.adicionar(ator, james, {
      idMobilemed: 19053,
      observacao: '  login do plantão ',
    });

    expect((await repo.buscar(james))?.outrasContas).toEqual([
      { id, idMobilemed: 19053, observacao: 'login do plantão', criadoEm: expect.any(Date) },
    ]);
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u-ana' },
        entidade: 'medico',
        entidadeId: james,
        acao: 'conta_mobilemed_adicionada',
        depois: { idMobilemed: 19053, observacao: 'login do plantão' },
      }),
    ]);
  });

  it('recusa a conta principal do próprio médico', async () => {
    await expect(
      service.adicionar(ator, james, { idMobilemed: 7968, observacao: null }),
    ).rejects.toThrow('Esse ID já é a conta principal deste médico.');
  });

  it('recusa a conta principal ou outra conta de outro médico', async () => {
    await expect(
      service.adicionar(ator, james, { idMobilemed: 14087, observacao: null }),
    ).rejects.toThrow('Esse ID da MobileMed já está no cadastro de Tiago Lordelo.');
    await service.adicionar(ator, tiago, { idMobilemed: 48605, observacao: null });
    await expect(
      service.adicionar(ator, james, { idMobilemed: 48605, observacao: null }),
    ).rejects.toThrow('Esse ID da MobileMed já está no cadastro de Tiago Lordelo.');
  });

  it('recusa a mesma conta duas vezes no médico', async () => {
    await service.adicionar(ator, james, { idMobilemed: 4964, observacao: null });
    await expect(
      service.adicionar(ator, james, { idMobilemed: 4964, observacao: null }),
    ).rejects.toThrow('Essa conta já está em Outras contas deste médico.');
  });

  it('recusa id que não é inteiro positivo', async () => {
    await expect(
      service.adicionar(ator, james, { idMobilemed: 0, observacao: null }),
    ).rejects.toThrow('Informe o ID da conta na MobileMed, um número inteiro positivo.');
  });

  it('avisa quando o médico não existe', async () => {
    await expect(
      service.adicionar(ator, 'nao-existe', { idMobilemed: 1, observacao: null }),
    ).rejects.toThrow(ItemNaoEncontradoError);
  });

  it('remove a conta do médico e audita', async () => {
    const id = await service.adicionar(ator, james, { idMobilemed: 4964, observacao: 'x' });

    await service.remover(ator, james, id);

    expect((await repo.buscar(james))?.outrasContas).toEqual([]);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'conta_mobilemed_removida',
      antes: { idMobilemed: 4964, observacao: 'x' },
    });
  });

  it('não remove conta de outro médico', async () => {
    const id = await service.adicionar(ator, james, { idMobilemed: 4964, observacao: null });

    await expect(service.remover(ator, tiago, id)).rejects.toThrow('Conta não encontrada.');
  });

  it('o sistema (mapeamento) adiciona com o motivo na auditoria, sem repetir a já gravada', async () => {
    expect(await service.adicionarPeloSistema(tiago, 48605, 'mapeamento pelos laudos')).toBe(true);
    expect(await service.adicionarPeloSistema(tiago, 48605, 'mapeamento pelos laudos')).toBe(false);

    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'sistema' },
        entidadeId: tiago,
        acao: 'conta_mobilemed_adicionada',
        depois: { idMobilemed: 48605, observacao: null, motivo: 'mapeamento pelos laudos' },
      }),
    ]);
  });
});
