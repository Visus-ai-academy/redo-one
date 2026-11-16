import { beforeEach, describe, expect, it } from 'vitest';

import { AcaoProibidaEscalaError, EscalaInvalidaError } from '../domain';
import { ContaSemMedicoError } from './ausencias.errors';
import { type PedidoAusencia, PortalAusenciasService } from './portal-ausencias.service';
import { FakeAusenciasRepository } from './testing';

const AGORA = new Date('2026-11-16T15:00:00Z');
const ana = { usuarioId: 'u-ana' };

function montar() {
  const repo = new FakeAusenciasRepository();
  repo.medicos.set('m-ana', 'Ana');
  repo.medicos.set('m-bia', 'Bia');
  repo.usuarios.set('u-ana', { nome: 'Ana', medicoId: 'm-ana' });
  repo.usuarios.set('u-gestor', { nome: 'Gestor', medicoId: null });
  repo.tipos.set('t-ferias', {
    id: 't-ferias',
    nome: 'Férias',
    cor: null,
    soGestor: false,
    ativo: true,
  });
  repo.tipos.set('t-dispensa', {
    id: 't-dispensa',
    nome: 'Dispensado',
    cor: null,
    soGestor: true,
    ativo: true,
  });
  repo.tipos.set('t-velho', {
    id: 't-velho',
    nome: 'Velho',
    cor: null,
    soGestor: false,
    ativo: false,
  });
  repo.turnos.set('tu-manha', 'Manhã');
  return { repo, service: new PortalAusenciasService(repo, { now: () => AGORA }) };
}

const pedido = (extra: Partial<PedidoAusencia> = {}): PedidoAusencia => ({
  tipoId: 't-ferias',
  dataInicio: '2026-12-01',
  dataFim: '2026-12-05',
  observacoes: 'Congresso',
  ...extra,
});

describe('PortalAusenciasService', () => {
  let ctx: ReturnType<typeof montar>;
  beforeEach(() => {
    ctx = montar();
  });

  it('conta sem médico não usa o portal', async () => {
    const gestor = { usuarioId: 'u-gestor' };
    await expect(ctx.service.listar(gestor, { pagina: 1, porPagina: 25 })).rejects.toThrow(
      ContaSemMedicoError,
    );
    await expect(ctx.service.solicitar(gestor, pedido())).rejects.toThrow(ContaSemMedicoError);
    await expect(ctx.service.cancelar(gestor, 'x')).rejects.toThrow(ContaSemMedicoError);
  });

  it('o pedido nasce pendente, de origem médico, sem frentes, com turno e dias permitidos', async () => {
    const { service, repo } = ctx;

    const id = await service.solicitar(ana, pedido({ turnoIds: ['tu-manha'], diasSemana: [1, 2] }));

    expect(await repo.buscar(id)).toMatchObject({
      medico: { id: 'm-ana' },
      situacao: 'pendente',
      origem: 'medico',
      frentes: [],
      turnos: [{ id: 'tu-manha' }],
      diasSemana: [1, 2],
      observacoes: 'Congresso',
      solicitadaPor: { id: 'u-ana' },
    });
    expect(repo.eventos).toEqual([
      expect.objectContaining({
        acao: 'solicitada',
        ator: { tipo: 'usuario', id: 'u-ana' },
        depois: expect.objectContaining({
          medicoId: 'm-ana',
          frenteIds: [],
          observacoesAlteradas: true,
        }),
      }),
    ]);
    expect(JSON.stringify(repo.eventos)).not.toContain('Congresso');
  });

  it('exige motivo, tipo ativo que o médico pode pedir e turno existente', async () => {
    const { service } = ctx;

    await expect(service.solicitar(ana, pedido({ observacoes: ' a ' }))).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.solicitar(ana, pedido({ tipoId: 't-dispensa' }))).rejects.toThrow(
      AcaoProibidaEscalaError,
    );
    await expect(service.solicitar(ana, pedido({ tipoId: 't-velho' }))).rejects.toThrow(/inativo/);
    await expect(service.solicitar(ana, pedido({ tipoId: 't-x' }))).rejects.toThrow(/Tipo/);
    await expect(service.solicitar(ana, pedido({ turnoIds: ['tu-x'] }))).rejects.toThrow(/Turno/);
  });

  it('lista paginadas as do próprio médico, mais recentes primeiro, em todas as situações', async () => {
    const { service, repo } = ctx;
    for (let i = 0; i < 62; i++) {
      const dia = String((i % 28) + 1).padStart(2, '0');
      const mes = String(Math.floor(i / 28) + 1).padStart(2, '0');
      await service.solicitar(
        ana,
        pedido({ dataInicio: `2026-${mes}-${dia}`, dataFim: `2026-${mes}-${dia}` }),
      );
    }
    repo.copiar([...repo.ausencias.keys()][0] ?? '', 'da-bia', {
      medicoId: 'm-bia',
      dataInicio: '2027-01-01',
      dataFim: '2027-01-01',
    });

    const primeira = await service.listar(ana, { pagina: 1, porPagina: 25 });
    const ultima = await service.listar(ana, { pagina: 3, porPagina: 25 });

    expect(primeira.total).toBe(62);
    expect(primeira.itens).toHaveLength(25);
    expect(primeira.itens.every((a) => a.medico.id === 'm-ana')).toBe(true);
    expect(primeira.itens[0]?.dataInicio).toBe('2026-03-06');
    expect(ultima.itens).toHaveLength(12);
    expect(ultima.itens.at(-1)?.dataInicio).toBe('2026-01-01');
  });

  it('cancela só o próprio pedido pendente, apagando com auditoria', async () => {
    const { service, repo } = ctx;
    const id = await service.solicitar(ana, pedido());

    await service.cancelar(ana, id);

    expect(repo.ausencias.has(id)).toBe(false);
    expect(repo.eventos.at(-1)).toMatchObject({ acao: 'cancelada', antes: { medicoId: 'm-ana' } });
    await expect(service.cancelar(ana, id)).rejects.toThrow(/não encontrada/);
  });

  it('não cancela pedido de outro médico, já revisado ou lançado pelo gestor', async () => {
    const { service, repo } = ctx;
    const id = await service.solicitar(ana, pedido());
    const atual = repo.ausencias.get(id);
    if (!atual) throw new Error('sem pedido');

    repo.ausencias.set('da-bia', { ...atual, id: 'da-bia', medicoId: 'm-bia' });
    await expect(service.cancelar(ana, 'da-bia')).rejects.toThrow(/não encontrada/);

    repo.ausencias.set(id, { ...atual, situacao: 'aprovada' });
    await expect(service.cancelar(ana, id)).rejects.toThrow(/pendente/);

    repo.ausencias.set(id, { ...atual, origem: 'gestor' });
    await expect(service.cancelar(ana, id)).rejects.toThrow(AcaoProibidaEscalaError);
    expect(repo.ausencias.size).toBe(2);
  });
});
