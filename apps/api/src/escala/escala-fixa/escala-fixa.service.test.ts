import { describe, expect, it, vi } from 'vitest';

import type { AlocacaoGravada } from '../alocacoes/alocacoes.repository';
import { AcaoProibidaEscalaError, EscalaInvalidaError } from '../domain';
import type { ConflitoEscala, ConsultaOcorrencias } from '../ocorrencias/consulta-ocorrencias';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import { EscalaFixaService } from './escala-fixa.service';
import { FakeEscalaFixaRepository } from './testing';

// Hoje: segunda, 16/11/2026, em Brasília.
const agora = new Date('2026-11-16T12:00:00Z');
const admin = { usuarioId: 'u-admin', acessoTotal: true };
const gestora = { usuarioId: 'u-gestora', acessoTotal: false };
const A_PARTIR_DE = '2026-11-23';
const SEG = 1;
const TER = 2;
const QUA = 3;
const QUI = 4;
const SEX = 5;

function montar(conflitos: ConflitoEscala[] = []) {
  const repo = new FakeEscalaFixaRepository();
  repo.turnos.set('t-lista', {
    id: 't-lista',
    nome: 'Lista',
    tipo: 'lista',
    horarioInicio: '00:00',
    horarioFim: '00:00',
    frenteIds: ['f-neuro'],
  });
  repo.turnos.set('t-manha', {
    id: 't-manha',
    nome: 'Manhã',
    tipo: 'fixo',
    horarioInicio: '07:00',
    horarioFim: '13:00',
    frenteIds: ['f-neuro', 'f-tc'],
  });
  repo.turnos.set('t-tarde', {
    id: 't-tarde',
    nome: 'Tarde',
    tipo: 'fixo',
    horarioInicio: '13:00',
    horarioFim: '19:00',
    frenteIds: ['f-tc'],
  });
  repo.medicos.set('m-ana', { ativo: true });
  repo.medicos.set('m-inativo', { ativo: false });
  const escopos = new FakeEscopoEscalaRepository();
  const consulta = { listar: vi.fn(async () => ({ ocorrencias: [], conflitos })) };
  const service = new EscalaFixaService(repo, escopos, consulta as unknown as ConsultaOcorrencias, {
    now: () => agora,
  });
  return { repo, escopos, consulta, service };
}

const alocacao = (campos: Partial<AlocacaoGravada> & { id: string }): AlocacaoGravada => ({
  medicoId: 'm-ana',
  turnoId: 't-lista',
  frenteId: 'f-neuro',
  diasSemana: [SEG],
  semanasDoMes: [],
  horarioInicio: '00:00',
  horarioFim: '00:00',
  dataInicio: '2026-01-05',
  dataFim: null,
  produtividade: 30,
  gratificado: false,
  subespecialidadeGeral: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  coberturaDeId: null,
  observacoes: null,
  ...campos,
});

const celula = (turnoId: string, diaSemana: number, produtividade: number | null) => ({
  turnoId,
  diaSemana,
  produtividade,
});

const exemplo = [
  celula('t-lista', SEG, 30),
  celula('t-lista', TER, 25),
  celula('t-lista', QUA, 40),
  celula('t-lista', QUI, 25),
  celula('t-lista', SEX, 30),
];

const doMedico = (repo: FakeEscalaFixaRepository) =>
  [...repo.alocacoes.values()].sort(
    (a, b) =>
      a.dataInicio.localeCompare(b.dataInicio) || (a.diasSemana[0] ?? 0) - (b.diasSemana[0] ?? 0),
  );

describe('EscalaFixaService', () => {
  describe('obter', () => {
    it('abre as fixas da grade em células e conta as fora dela', async () => {
      const { repo, service } = montar();
      for (const a of [
        alocacao({ id: 'a', diasSemana: [SEG, SEX], produtividade: 30 }),
        alocacao({ id: 'b', diasSemana: [TER], produtividade: null }),
        alocacao({ id: 'recorte', diasSemana: [QUA], prioridadeIds: ['p'] }),
        alocacao({ id: 'unico', diasSemana: [QUA], dataFim: '2026-12-31' }),
        alocacao({ id: 'outra-frente', frenteId: 'f-tc', turnoId: 't-manha' }),
        alocacao({ id: 'outro-medico', medicoId: 'm-bruno' }),
      ]) {
        repo.alocacoes.set(a.id, a);
      }

      expect(await service.obter(admin, 'm-ana', 'f-neuro')).toEqual({
        medicoId: 'm-ana',
        frenteId: 'f-neuro',
        celulas: [
          celula('t-lista', SEG, 30),
          celula('t-lista', SEX, 30),
          celula('t-lista', TER, null),
        ],
        foraDaGrade: 1,
      });
    });

    it('para a gestora, turnos e frentes fora do recorte não aparecem', async () => {
      const { repo, escopos, service } = montar();
      await escopos.definir(gestora.usuarioId, { turnoIds: ['t-manha'], frenteIds: [] });
      repo.alocacoes.set('lista', alocacao({ id: 'lista' }));
      repo.alocacoes.set(
        'lista-recorte',
        alocacao({ id: 'lista-recorte', diasSemana: [TER], prioridadeIds: ['p'] }),
      );
      repo.alocacoes.set(
        'manha',
        alocacao({
          id: 'manha',
          turnoId: 't-manha',
          horarioInicio: '07:00',
          horarioFim: '13:00',
          produtividade: 10,
        }),
      );

      expect(await service.obter(gestora, 'm-ana', 'f-neuro')).toMatchObject({
        celulas: [celula('t-manha', SEG, 10)],
        foraDaGrade: 0,
      });
    });
  });

  describe('definir', () => {
    it('cria do zero uma alocação por turno + produtividade, a partir da data', async () => {
      const { repo, service } = montar();

      const resultado = await service.definir(admin, 'm-ana', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: exemplo,
      });

      expect(resultado).toEqual({
        criadas: 3,
        encerradas: 0,
        removidas: 0,
        mantidas: 0,
        avisos: [],
      });
      expect(
        doMedico(repo).map((a) => [a.diasSemana, a.produtividade, a.dataInicio, a.dataFim]),
      ).toEqual([
        [[SEG, SEX], 30, A_PARTIR_DE, null],
        [[TER, QUI], 25, A_PARTIR_DE, null],
        [[QUA], 40, A_PARTIR_DE, null],
      ]);
      expect(doMedico(repo)[0]).toMatchObject({
        medicoId: 'm-ana',
        turnoId: 't-lista',
        frenteId: 'f-neuro',
        horarioInicio: '00:00',
        horarioFim: '00:00',
        semanasDoMes: [],
        gratificado: false,
        prioridadeIds: [],
        coberturaDeId: null,
      });
      expect(repo.eventos.map((e) => [e.entidade, e.acao])).toEqual([
        ['alocacao', 'criado'],
        ['alocacao', 'criado'],
        ['alocacao', 'criado'],
      ]);
      expect(repo.eventos[0]?.ator).toEqual({ tipo: 'usuario', id: 'u-admin' });
      expect(repo.eventos[0]?.depois).toMatchObject({
        medicoId: 'm-ana',
        turnoId: 't-lista',
        frenteId: 'f-neuro',
      });
    });

    it('mudar um dia: o grupo que mudou é encerrado na véspera, o igual fica', async () => {
      const { repo, service } = montar();
      repo.alocacoes.set('a', alocacao({ id: 'a', diasSemana: [SEG, SEX], produtividade: 30 }));
      repo.alocacoes.set('b', alocacao({ id: 'b', diasSemana: [TER, QUI], produtividade: 25 }));

      const resultado = await service.definir(admin, 'm-ana', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: [
          celula('t-lista', SEG, 30),
          celula('t-lista', SEX, 30),
          celula('t-lista', TER, 25),
          celula('t-lista', QUA, 25),
        ],
      });

      expect(resultado).toMatchObject({ criadas: 1, encerradas: 1, removidas: 0, mantidas: 1 });
      expect(repo.alocacoes.get('a')?.dataFim).toBeNull();
      expect(repo.alocacoes.get('b')?.dataFim).toBe('2026-11-22');
      const nova = doMedico(repo).find((a) => a.dataInicio === A_PARTIR_DE);
      expect(nova).toMatchObject({ diasSemana: [TER, QUA], produtividade: 25 });
      const encerrado = repo.eventos.find((e) => e.acao === 'encerrado');
      expect(encerrado).toMatchObject({
        entidade: 'alocacao',
        entidadeId: 'b',
        antes: { dataFim: null },
        depois: {
          dataFim: '2026-11-22',
          medicoId: 'm-ana',
          turnoId: 't-lista',
          frenteId: 'f-neuro',
        },
      });
    });

    it('mudar a produtividade troca a alocação; começou depois do "a partir de": remove', async () => {
      const { repo, service } = montar();
      repo.alocacoes.set('futura', alocacao({ id: 'futura', dataInicio: '2026-12-01' }));
      repo.alocacoes.set(
        'cobre',
        alocacao({
          id: 'cobre',
          medicoId: 'm-bruno',
          coberturaDeId: 'futura',
          dataInicio: '2026-12-07',
          dataFim: '2026-12-07',
        }),
      );
      repo.ajustes.set('aj', {
        id: 'aj',
        alocacaoId: 'futura',
        data: '2026-12-07',
        produtividade: 5,
        observacoes: null,
      });

      const resultado = await service.definir(admin, 'm-ana', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: [celula('t-lista', SEG, 35)],
      });

      expect(resultado).toMatchObject({ criadas: 1, encerradas: 0, removidas: 1, mantidas: 0 });
      expect(repo.alocacoes.has('futura')).toBe(false);
      expect(repo.alocacoes.has('cobre')).toBe(false);
      expect(repo.ajustes.size).toBe(0);
      expect(
        repo.eventos
          .map((e) => [e.entidade, e.entidadeId, e.acao])
          .filter(([, , a]) => a !== 'criado'),
      ).toEqual([
        ['alocacao', 'futura', 'excluido'],
        ['alocacao', 'cobre', 'excluido'],
        ['ajuste_produtividade', 'aj', 'excluido'],
      ]);
    });

    it('grade vazia encerra ou remove todas as da grade e não toca nas de fora', async () => {
      const { repo, service } = montar();
      repo.alocacoes.set('a', alocacao({ id: 'a' }));
      repo.alocacoes.set('recorte', alocacao({ id: 'recorte', subespecialidadeGeral: true }));

      const resultado = await service.definir(admin, 'm-ana', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: [],
      });

      expect(resultado).toMatchObject({ criadas: 0, encerradas: 1, removidas: 0, mantidas: 0 });
      expect(repo.alocacoes.get('recorte')?.dataFim).toBeNull();
    });

    it('a gestora só mexe nas alocações do recorte', async () => {
      const { repo, escopos, service } = montar();
      await escopos.definir(gestora.usuarioId, { turnoIds: ['t-manha'], frenteIds: [] });
      repo.alocacoes.set('lista', alocacao({ id: 'lista' }));

      await service.definir(gestora, 'm-ana', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: [celula('t-manha', SEG, 10)],
      });

      expect(repo.alocacoes.get('lista')?.dataFim).toBeNull();
    });

    it('recusa célula fora do recorte da gestora', async () => {
      const { escopos, service } = montar();
      await escopos.definir(gestora.usuarioId, { turnoIds: ['t-manha'], frenteIds: [] });

      await expect(
        service.definir(gestora, 'm-ana', {
          frenteId: 'f-neuro',
          aPartirDe: A_PARTIR_DE,
          celulas: [celula('t-lista', SEG, 10)],
        }),
      ).rejects.toBeInstanceOf(AcaoProibidaEscalaError);
    });

    it('recusa célula repetida, turno sem a frente, médico inativo e data inválida', async () => {
      const { repo, service } = montar();
      const definir = (medicoId: string, campos: object) =>
        service.definir(admin, medicoId, {
          frenteId: 'f-neuro',
          aPartirDe: A_PARTIR_DE,
          celulas: exemplo,
          ...campos,
        });

      await expect(
        definir('m-ana', { celulas: [celula('t-lista', SEG, 1), celula('t-lista', SEG, 2)] }),
      ).rejects.toThrow(/repetida/);
      await expect(definir('m-ana', { celulas: [celula('t-tarde', SEG, 1)] })).rejects.toThrow(
        /não está no turno Tarde/,
      );
      await expect(definir('m-ana', { celulas: [celula('t-x', SEG, 1)] })).rejects.toThrow(
        /Turno não encontrado/,
      );
      await expect(definir('m-inativo', {})).rejects.toThrow(/inativo/);
      await expect(definir('m-nada', {})).rejects.toThrow(/Médico não encontrado/);
      await expect(definir('m-ana', { aPartirDe: '2026-02-30' })).rejects.toBeInstanceOf(
        EscalaInvalidaError,
      );
      expect(repo.alocacoes.size).toBe(0);
    });

    it('médico inativo pode ter a grade esvaziada', async () => {
      const { repo, service } = montar();
      repo.alocacoes.set('a', alocacao({ id: 'a', medicoId: 'm-inativo' }));

      await service.definir(admin, 'm-inativo', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: [],
      });

      expect(repo.alocacoes.get('a')?.dataFim).toBe('2026-11-22');
    });

    it('devolve os avisos de sobreposição das criadas, sem repetir', async () => {
      const plantao = (alocacaoId: string) => ({
        alocacaoId,
        data: '2026-11-23',
        turnoId: 't-lista',
        turnoNome: 'Lista',
        frenteId: 'f-neuro',
        frenteRotulo: 'NEURO',
        inicio: '2026-11-23T00:00:00-03:00',
        fim: '2026-11-24T00:00:00-03:00',
      });
      const { repo, service, consulta } = montar();
      const ids: string[] = [];
      consulta.listar.mockImplementation(async () => {
        if (!ids.length) ids.push(...doMedico(repo).map((a) => a.id));
        return {
          ocorrencias: [],
          conflitos: [
            {
              medicoId: 'm-ana',
              medicoNome: 'Ana',
              data: '2026-11-23',
              a: plantao(ids[0] ?? ''),
              b: plantao(ids[1] ?? ''),
            },
          ],
        };
      });

      const { avisos } = await service.definir(admin, 'm-ana', {
        frenteId: 'f-neuro',
        aPartirDe: A_PARTIR_DE,
        celulas: [celula('t-lista', SEG, 30), celula('t-lista', TER, 25)],
      });

      expect(avisos).toHaveLength(1);
      expect(avisos[0]?.a).toMatchObject({ foraDoRecorte: false, alocacaoId: ids[0] });
    });
  });
});
