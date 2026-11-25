import { describe, expect, it } from 'vitest';

import { EscalaInvalidaError, RegistroEscalaNaoEncontradoError } from '../domain';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import { AjustesProdutividadeService } from './ajustes.service';
import type { AlocacaoGravada } from './alocacoes.repository';
import { FakeAlocacoesRepository } from './testing';

const agora = new Date('2026-11-16T12:00:00Z');
const admin = { usuarioId: 'u-admin', acessoTotal: true };
const gestora = { usuarioId: 'u-gestora', acessoTotal: false };

const alocacao = (campos: Partial<AlocacaoGravada> & { id: string }): AlocacaoGravada => ({
  medicoId: 'm-ana',
  turnoId: 't-manha',
  frenteId: 'f-neuro',
  // Segunda, quarta e sexta.
  diasSemana: [1, 3, 5],
  semanasDoMes: [],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  dataInicio: '2026-11-01',
  dataFim: null,
  produtividade: 20,
  gratificado: false,
  subespecialidadeGeral: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  coberturaDeId: null,
  observacoes: null,
  ...campos,
  vigencia: campos.vigencia ?? (campos.dataFim ? 'periodo' : 'fixa'),
  // Sem o "todas" explícito, o recorte que não veio é "todas" (só nos testes).
  todasSemanas: campos.todasSemanas ?? !campos.semanasDoMes?.length,
  todasPrioridades: campos.todasPrioridades ?? !campos.prioridadeIds?.length,
  todosSegmentos:
    campos.todosSegmentos ?? (!campos.subespecialidadeIds?.length && !campos.subespecialidadeGeral),
});

function montar() {
  const repo = new FakeAlocacoesRepository();
  repo.alocacoes.set('a1', alocacao({ id: 'a1' }));
  const escopos = new FakeEscopoEscalaRepository();
  const service = new AjustesProdutividadeService(repo, escopos, { now: () => agora });
  return { repo, escopos, service };
}

// 16/11/2026 é segunda; 17/11, terça.
describe('AjustesProdutividadeService', () => {
  it('cria, troca e remove (valor nulo) o ajuste do dia, com eventos e contexto', async () => {
    const { repo, service } = montar();

    await service.definir(admin, 'a1', '2026-11-16', {
      produtividade: 5,
      observacoes: ' reunião ',
    });
    const [criado] = [...repo.ajustes.values()];
    expect(criado).toMatchObject({
      alocacaoId: 'a1',
      data: '2026-11-16',
      produtividade: 5,
      observacoes: 'reunião',
    });

    await service.definir(admin, 'a1', '2026-11-16', { produtividade: 8, observacoes: 'reunião' });
    expect([...repo.ajustes.values()]).toEqual([{ ...criado, produtividade: 8 }]);

    await service.definir(admin, 'a1', '2026-11-16', { produtividade: null });
    expect(repo.ajustes.size).toBe(0);

    const contexto = { medicoId: 'm-ana', turnoId: 't-manha', frenteId: 'f-neuro' };
    expect(repo.eventos).toEqual([
      expect.objectContaining({
        entidade: 'ajuste_produtividade',
        entidadeId: criado?.id,
        acao: 'criado',
        depois: {
          alocacaoId: 'a1',
          data: '2026-11-16',
          produtividade: 5,
          observacoes: 'reunião',
          ...contexto,
        },
      }),
      expect.objectContaining({
        acao: 'alterado',
        antes: { produtividade: 5 },
        depois: { produtividade: 8, data: '2026-11-16', ...contexto },
      }),
      expect.objectContaining({
        acao: 'excluido',
        antes: expect.objectContaining({ produtividade: 8, ...contexto }),
      }),
    ]);
  });

  it('valor nulo sem ajuste não faz nada', async () => {
    const { repo, service } = montar();
    await service.definir(admin, 'a1', '2026-11-16', { produtividade: null });
    expect(repo.eventos).toEqual([]);
  });

  it('recusa gratificada, dia sem plantão, data e valor inválidos', async () => {
    const { repo, service } = montar();
    repo.alocacoes.set(
      'g',
      alocacao({ id: 'g', gratificado: true, dataFim: '2026-11-30', produtividade: 30 }),
    );

    await expect(service.definir(admin, 'g', '2026-11-16', { produtividade: 3 })).rejects.toThrow(
      /gratificada/,
    );
    await expect(service.definir(admin, 'a1', '2026-11-17', { produtividade: 3 })).rejects.toThrow(
      /17\/11\/2026 não é dia de plantão/,
    );
    await expect(service.definir(admin, 'a1', '2026-10-30', { produtividade: 3 })).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.definir(admin, 'a1', '2026-02-30', { produtividade: 3 })).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.definir(admin, 'a1', '2026-11-16', { produtividade: -1 })).rejects.toThrow(
      EscalaInvalidaError,
    );
  });

  it('na cobertura, o dia precisa ser plantão do titular nos dias e no período dela', async () => {
    const { repo, service } = montar();
    repo.alocacoes.set(
      'cob',
      alocacao({
        id: 'cob',
        medicoId: 'm-bruno',
        coberturaDeId: 'a1',
        diasSemana: [1],
        dataInicio: '2026-11-16',
        dataFim: '2026-11-25',
      }),
    );

    await expect(
      service.definir(admin, 'cob', '2026-11-23', { produtividade: 4 }),
    ).resolves.toBeUndefined();
    // Quarta é do titular, mas não da cobertura; 30/11 fica fora do período.
    await expect(service.definir(admin, 'cob', '2026-11-18', { produtividade: 4 })).rejects.toThrow(
      /não é dia de plantão/,
    );
    await expect(service.definir(admin, 'cob', '2026-11-30', { produtividade: 4 })).rejects.toThrow(
      /não é dia de plantão/,
    );
  });

  it('remover um ajuste antigo não exige que o dia ainda seja de plantão', async () => {
    const { repo, service } = montar();
    repo.ajustes.set('aj', {
      id: 'aj',
      alocacaoId: 'a1',
      data: '2026-11-17',
      produtividade: 2,
      observacoes: null,
    });
    await service.definir(admin, 'a1', '2026-11-17', { produtividade: null });
    expect(repo.ajustes.size).toBe(0);
  });

  it('fora do recorte da gestora a alocação não existe', async () => {
    const { escopos, service } = montar();
    await escopos.definir('u-gestora', { turnoIds: ['t-tarde'], frenteIds: [] });
    await expect(
      service.definir(gestora, 'a1', '2026-11-16', { produtividade: 1 }),
    ).rejects.toThrow(RegistroEscalaNaoEncontradoError);
  });
});
