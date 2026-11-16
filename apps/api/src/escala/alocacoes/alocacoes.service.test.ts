import { describe, expect, it, vi } from 'vitest';

import {
  AcaoProibidaEscalaError,
  ConflitoEscalaError,
  EscalaInvalidaError,
  RegistroEscalaNaoEncontradoError,
} from '../domain';
import type { ConflitoEscala, ConsultaOcorrencias } from '../ocorrencias/consulta-ocorrencias';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import type { AlocacaoGravada } from './alocacoes.repository';
import { AlocacoesService, type EntradaAlocacao } from './alocacoes.service';
import { FakeAlocacoesRepository } from './testing';

// Hoje: segunda, 16/11/2026, em Brasília.
const agora = new Date('2026-11-16T12:00:00Z');
const admin = { usuarioId: 'u-admin', acessoTotal: true };
const gestora = { usuarioId: 'u-gestora', acessoTotal: false };

function montar(conflitos: ConflitoEscala[] = []) {
  const repo = new FakeAlocacoesRepository();
  repo.turnos.set('t-manha', {
    id: 't-manha',
    nome: 'Manhã',
    tipo: 'fixo',
    horarioInicio: '07:00',
    horarioFim: '13:00',
    frenteIds: ['f-neuro', 'f-tc'],
  });
  repo.turnos.set('t-lista', {
    id: 't-lista',
    nome: 'Lista',
    tipo: 'lista',
    horarioInicio: '00:00',
    horarioFim: '00:00',
    frenteIds: ['f-neuro'],
  });
  repo.medicos.set('m-ana', { ativo: true });
  repo.medicos.set('m-bruno', { ativo: true });
  repo.medicos.set('m-inativo', { ativo: false });
  repo.prioridades.add('p-urgente');
  repo.subespecialidades.add('s-avc');
  const escopos = new FakeEscopoEscalaRepository();
  const consulta = { listar: vi.fn(async () => ({ ocorrencias: [], conflitos })) };
  const service = new AlocacoesService(repo, escopos, consulta as unknown as ConsultaOcorrencias, {
    now: () => agora,
  });
  return { repo, escopos, consulta, service };
}

const entrada = (campos: Partial<EntradaAlocacao> = {}): EntradaAlocacao => ({
  medicoId: 'm-ana',
  turnoId: 't-manha',
  frenteId: 'f-neuro',
  diasSemana: [1, 3, 5],
  dataInicio: '2026-11-01',
  ...campos,
});

function conflito(a: string, b: string): ConflitoEscala {
  const plantao = (alocacaoId: string) => ({
    alocacaoId,
    data: '2026-11-16',
    turnoId: 't',
    turnoNome: 'T',
    frenteId: 'f',
    frenteRotulo: 'F',
    inicio: '2026-11-16T07:00:00-03:00',
    fim: '2026-11-16T13:00:00-03:00',
  });
  return { medicoId: 'm-ana', medicoNome: 'Ana', data: '2026-11-16', a: plantao(a), b: plantao(b) };
}

describe('AlocacoesService', () => {
  describe('criar', () => {
    it('grava com o horário do turno, os recortes e o evento com o contexto', async () => {
      const { repo, service } = montar();

      const { id, avisos } = await service.criar(
        admin,
        entrada({
          produtividade: 20,
          prioridadeIds: ['p-urgente', 'p-urgente'],
          subespecialidadeIds: ['s-avc'],
          subespecialidadeGeral: true,
          observacoes: '  só NEURO  ',
        }),
      );

      expect(avisos).toEqual([]);
      const gravada = await repo.buscar(id);
      expect(gravada).toEqual({
        id,
        medicoId: 'm-ana',
        turnoId: 't-manha',
        frenteId: 'f-neuro',
        diasSemana: [1, 3, 5],
        semanasDoMes: [],
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataInicio: '2026-11-01',
        dataFim: null,
        produtividade: 20,
        gratificado: false,
        subespecialidadeGeral: true,
        prioridadeIds: ['p-urgente'],
        subespecialidadeIds: ['s-avc'],
        coberturaDeId: null,
        observacoes: 'só NEURO',
      });
      expect(repo.eventos).toEqual([
        {
          ator: { tipo: 'usuario', id: 'u-admin' },
          entidade: 'alocacao',
          entidadeId: id,
          acao: 'criado',
          depois: expect.objectContaining({
            medicoId: 'm-ana',
            turnoId: 't-manha',
            frenteId: 'f-neuro',
            produtividade: 20,
          }),
          em: agora,
        },
      ]);
    });

    it('escala sem arranjo nem recorte é permitido', async () => {
      const { service } = montar();
      await expect(service.criar(admin, entrada())).resolves.toMatchObject({ avisos: [] });
    });

    it('recusa frente que não está cadastrada no turno', async () => {
      const { repo, service } = montar();
      repo.turnos.get('t-manha')?.frenteIds.splice(1, 1);
      await expect(service.criar(admin, entrada({ frenteId: 'f-tc' }))).rejects.toThrow(
        /frente não está no turno Manhã/,
      );
    });

    it('recusa turno inexistente, médico inativo ou inexistente e recortes inexistentes', async () => {
      const { service } = montar();
      await expect(service.criar(admin, entrada({ turnoId: 't-x' }))).rejects.toThrow(
        EscalaInvalidaError,
      );
      await expect(service.criar(admin, entrada({ medicoId: 'm-inativo' }))).rejects.toThrow(
        /inativo/,
      );
      await expect(service.criar(admin, entrada({ medicoId: 'm-x' }))).rejects.toThrow(
        EscalaInvalidaError,
      );
      await expect(service.criar(admin, entrada({ prioridadeIds: ['p-x'] }))).rejects.toThrow(
        /Prioridade/,
      );
      await expect(service.criar(admin, entrada({ subespecialidadeIds: ['s-x'] }))).rejects.toThrow(
        /Subespecialidade/,
      );
    });

    it('usa a regra do domínio (horário fora do turno, gratificado fora da lista)', async () => {
      const { service } = montar();
      await expect(
        service.criar(admin, entrada({ horarioInicio: '06:00', horarioFim: '12:00' })),
      ).rejects.toThrow(/não cabe no turno/);
      await expect(
        service.criar(
          admin,
          entrada({ gratificado: true, dataFim: '2026-11-30', produtividade: 5 }),
        ),
      ).rejects.toThrow(/turno do tipo lista/);
    });

    it('a gestora com recorte só cria dentro dele', async () => {
      const { escopos, service } = montar();
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-tc'] });

      await expect(service.criar(gestora, entrada())).rejects.toThrow(AcaoProibidaEscalaError);
      await expect(service.criar(gestora, entrada({ frenteId: 'f-tc' }))).resolves.toBeDefined();
    });

    it('avisa os conflitos da nova alocação nas próximas 8 semanas, sem bloquear', async () => {
      const { consulta, service, repo } = montar();
      consulta.listar.mockImplementation(async () => {
        const [id] = [...repo.alocacoes.keys()];
        return {
          ocorrencias: [],
          conflitos: [conflito('outra', 'x'), conflito('outra', id ?? '')],
        };
      });

      const { id, avisos } = await service.criar(admin, entrada());

      expect(consulta.listar).toHaveBeenCalledWith('2026-11-16', '2027-01-10', {
        medicoId: 'm-ana',
      });
      expect(avisos).toEqual([conflito('outra', id)]);
    });

    it('janela dos avisos começa no início futuro e para no fim da alocação', async () => {
      const { consulta, service } = montar();
      await service.criar(admin, entrada({ dataInicio: '2026-12-01', dataFim: '2026-12-10' }));
      expect(consulta.listar).toHaveBeenCalledWith('2026-12-01', '2026-12-10', {
        medicoId: 'm-ana',
      });

      consulta.listar.mockClear();
      await service.criar(admin, entrada({ dataInicio: '2026-10-01', dataFim: '2026-10-30' }));
      expect(consulta.listar).not.toHaveBeenCalled();
    });
  });

  describe('obter', () => {
    it('devolve com a classificação; fora do recorte é não encontrada', async () => {
      const { escopos, service } = montar();
      const { id } = await service.criar(admin, entrada({ dataFim: '2026-11-30' }));

      expect(await service.obter(admin, id)).toMatchObject({ id, classificacao: 'periodo_unico' });

      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-tc'] });
      await expect(service.obter(gestora, id)).rejects.toThrow(RegistroEscalaNaoEncontradoError);
      await expect(service.obter(admin, 'nao-existe')).rejects.toThrow(
        RegistroEscalaNaoEncontradoError,
      );
    });
  });

  describe('atualizar', () => {
    it('registra só os campos que mudaram, sempre com o contexto', async () => {
      const { repo, service } = montar();
      const { id } = await service.criar(admin, entrada({ produtividade: 10 }));
      repo.eventos.length = 0;

      await service.atualizar(admin, id, entrada({ produtividade: 12 }));

      expect(repo.eventos).toEqual([
        expect.objectContaining({
          entidade: 'alocacao',
          entidadeId: id,
          acao: 'alterado',
          antes: { produtividade: 10 },
          depois: { produtividade: 12, medicoId: 'm-ana', turnoId: 't-manha', frenteId: 'f-neuro' },
        }),
      ]);

      repo.eventos.length = 0;
      await service.atualizar(admin, id, entrada({ produtividade: 12 }));
      expect(repo.eventos).toEqual([]);
    });

    it('gratificado ausente na edição mantém a situação atual', async () => {
      const { repo, service } = montar();
      const { id } = await service.criar(
        admin,
        entrada({
          turnoId: 't-lista',
          gratificado: true,
          dataInicio: '2026-11-16',
          dataFim: '2026-11-20',
          produtividade: 30,
        }),
      );

      await service.atualizar(
        admin,
        id,
        entrada({
          turnoId: 't-lista',
          dataInicio: '2026-11-16',
          dataFim: '2026-11-21',
          produtividade: 30,
        }),
      );

      expect((await repo.buscar(id))?.gratificado).toBe(true);
    });

    it('médico inativo só barra quando o médico muda', async () => {
      const { repo, service } = montar();
      const { id } = await service.criar(admin, entrada());
      repo.medicos.set('m-ana', { ativo: false });

      // Encerrar a escala de quem saiu continua possível.
      await expect(
        service.atualizar(admin, id, entrada({ dataFim: '2026-11-30' })),
      ).resolves.toBeDefined();
      await expect(
        service.atualizar(admin, id, entrada({ medicoId: 'm-inativo' })),
      ).rejects.toThrow(/inativo/);
    });

    it('não edita cobertura pela rota da alocação', async () => {
      const { service } = montar();
      const { id } = await service.criar(admin, entrada());
      const cob = await service.criarCobertura(admin, id, {
        medicoId: 'm-bruno',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-16',
      });
      await expect(service.atualizar(admin, cob.id, entrada())).rejects.toThrow(/cobertura/);
    });

    it('com coberturas, não troca médico, turno nem frente, e a vigência precisa contê-las', async () => {
      const { service } = montar();
      const { id } = await service.criar(admin, entrada());
      await service.criarCobertura(admin, id, {
        medicoId: 'm-bruno',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-20',
      });

      await expect(service.atualizar(admin, id, entrada({ frenteId: 'f-tc' }))).rejects.toThrow(
        /coberturas/,
      );
      await expect(
        service.atualizar(admin, id, entrada({ dataFim: '2026-11-18' })),
      ).rejects.toThrow(/cobertura/);
      await expect(
        service.atualizar(admin, id, entrada({ dataFim: '2026-11-30', produtividade: 3 })),
      ).resolves.toBeDefined();
    });

    it('a gestora só edita dentro do recorte, antes e depois da mudança', async () => {
      const { escopos, service } = montar();
      const { id: neuro } = await service.criar(admin, entrada());
      const { id: tc } = await service.criar(admin, entrada({ frenteId: 'f-tc' }));
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-tc'] });

      await expect(
        service.atualizar(gestora, neuro, entrada({ frenteId: 'f-tc' })),
      ).rejects.toThrow(RegistroEscalaNaoEncontradoError);
      await expect(service.atualizar(gestora, tc, entrada())).rejects.toThrow(
        AcaoProibidaEscalaError,
      );
      await expect(
        service.atualizar(gestora, tc, entrada({ frenteId: 'f-tc', produtividade: 4 })),
      ).resolves.toBeDefined();
    });
  });

  describe('remover', () => {
    it('remove o titular e registra também as coberturas e ajustes que caem em cascata', async () => {
      const { repo, service } = montar();
      const { id } = await service.criar(admin, entrada());
      const cob = await service.criarCobertura(admin, id, {
        medicoId: 'm-bruno',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-16',
      });
      repo.ajustes.set('aj1', {
        id: 'aj1',
        alocacaoId: cob.id,
        data: '2026-11-16',
        produtividade: 3,
        observacoes: null,
      });
      repo.eventos.length = 0;

      await service.remover(admin, id);

      expect(repo.alocacoes.size).toBe(0);
      expect(repo.eventos.map((e) => [e.entidade, e.entidadeId, e.acao])).toEqual([
        ['alocacao', id, 'excluido'],
        ['alocacao', cob.id, 'excluido'],
        ['ajuste_produtividade', 'aj1', 'excluido'],
      ]);
      for (const e of repo.eventos) {
        expect(e.depois).toBeUndefined();
        expect(e.antes).toMatchObject({ turnoId: 't-manha', frenteId: 'f-neuro' });
      }
      expect(repo.eventos[1]?.antes).toMatchObject({ medicoId: 'm-bruno', coberturaDeId: id });
      expect(repo.eventos[2]?.antes).toMatchObject({ medicoId: 'm-bruno', produtividade: 3 });
    });

    it('fora do recorte é não encontrada', async () => {
      const { escopos, service } = montar();
      const { id } = await service.criar(admin, entrada());
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-tc'] });
      await expect(service.remover(gestora, id)).rejects.toThrow(RegistroEscalaNaoEncontradoError);
    });
  });

  describe('coberturas', () => {
    async function comTitular(campos: Partial<EntradaAlocacao> = {}) {
      const montado = montar();
      const { id } = await montado.service.criar(
        admin,
        entrada({ produtividade: 20, prioridadeIds: ['p-urgente'], ...campos }),
      );
      return { ...montado, titularId: id };
    }

    it('cria com turno e frente do titular, sem recortes próprios', async () => {
      const { repo, service, titularId } = await comTitular();

      const { id, avisos } = await service.criarCobertura(admin, titularId, {
        medicoId: 'm-bruno',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-20',
        diasSemana: [1, 2, 3],
        observacoes: 'férias da Ana',
      });

      expect(avisos).toEqual([]);
      expect(await repo.buscar(id)).toEqual<AlocacaoGravada>({
        id,
        medicoId: 'm-bruno',
        turnoId: 't-manha',
        frenteId: 'f-neuro',
        diasSemana: [1, 3],
        semanasDoMes: [],
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-20',
        produtividade: 20,
        gratificado: false,
        subespecialidadeGeral: false,
        prioridadeIds: [],
        subespecialidadeIds: [],
        coberturaDeId: titularId,
        observacoes: 'férias da Ana',
      });
      expect(repo.eventos.at(-1)).toMatchObject({
        entidade: 'alocacao',
        entidadeId: id,
        acao: 'criado',
        depois: {
          medicoId: 'm-bruno',
          turnoId: 't-manha',
          frenteId: 'f-neuro',
          coberturaDeId: titularId,
        },
      });
    });

    it('recusa médico inativo, titular inexistente e cobertura sobreposta', async () => {
      const { service, titularId } = await comTitular();
      const dados = { medicoId: 'm-bruno', dataInicio: '2026-11-16', dataFim: '2026-11-20' };

      await expect(
        service.criarCobertura(admin, titularId, { ...dados, medicoId: 'm-inativo' }),
      ).rejects.toThrow(/inativo/);
      await expect(service.criarCobertura(admin, 'x', dados)).rejects.toThrow(
        RegistroEscalaNaoEncontradoError,
      );
      await service.criarCobertura(admin, titularId, dados);
      await expect(
        service.criarCobertura(admin, titularId, { ...dados, dataInicio: '2026-11-18' }),
      ).rejects.toThrow(ConflitoEscalaError);
    });

    it('edita a cobertura sem conflitar com ela mesma', async () => {
      const { repo, service, titularId } = await comTitular();
      const { id } = await service.criarCobertura(admin, titularId, {
        medicoId: 'm-bruno',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-20',
      });
      repo.eventos.length = 0;

      await service.atualizarCobertura(admin, id, {
        medicoId: 'm-bruno',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-18',
      });

      expect((await repo.buscar(id))?.dataFim).toBe('2026-11-18');
      expect(repo.eventos).toEqual([
        expect.objectContaining({
          acao: 'alterado',
          antes: { dataFim: '2026-11-20' },
          depois: {
            dataFim: '2026-11-18',
            medicoId: 'm-bruno',
            turnoId: 't-manha',
            frenteId: 'f-neuro',
          },
        }),
      ]);
      await expect(
        service.atualizarCobertura(admin, titularId, {
          medicoId: 'm-bruno',
          dataInicio: '2026-11-16',
          dataFim: '2026-11-18',
        }),
      ).rejects.toThrow(/não é uma cobertura/);
    });

    it('a gestora só cobre vínculo do recorte', async () => {
      const { escopos, service, titularId } = await comTitular();
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-tc'] });
      await expect(
        service.criarCobertura(gestora, titularId, {
          medicoId: 'm-bruno',
          dataInicio: '2026-11-16',
          dataFim: '2026-11-20',
        }),
      ).rejects.toThrow(RegistroEscalaNaoEncontradoError);
    });
  });
});
