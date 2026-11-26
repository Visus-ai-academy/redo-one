import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { CompetenciaNaoEncontradaError } from '../../domain/competencia-status';
import {
  CompetenciaNaoFechadaError,
  ContextoSemRecalculoError,
  MotivoRecalculoObrigatorioError,
} from '../../domain/recalculo-competencia';
import { CompetenciaInvalidaError } from '../../domain/vigencia-corte';
import { CompetenciasEmMemoria, RecalculosEmMemoria } from '../../testing/fakes';
import { RegistroRecalculadores } from '../recalculadores';
import { ListarRecalculos, RecalcularCompetenciaFechada } from './recalcular-competencia';

const agora = new Date('2026-11-26T15:00:00Z');

describe('recalcular competência fechada', () => {
  let competencias: CompetenciasEmMemoria;
  let recalculos: RecalculosEmMemoria;
  let registro: RegistroRecalculadores;
  let auditoria: InMemoryAuditoria;
  let enfileirados: { contexto: string; recalculoId: string; competencia: string }[];
  const caso = () =>
    new RecalcularCompetenciaFechada(competencias, recalculos, registro, auditoria, () => agora);

  beforeEach(() => {
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-09', { status: 'fechada', importacaoTravada: false });
    competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: false });
    recalculos = new RecalculosEmMemoria();
    auditoria = new InMemoryAuditoria();
    enfileirados = [];
    registro = new RegistroRecalculadores();
    registro.registrar({
      contexto: 'faturamento',
      enfileirar: async (_executor, pedido) => {
        enfileirados.push({ contexto: 'faturamento', ...pedido });
      },
    });
  });

  it('registra o pedido com motivo e autor, enfileira o recálculo do contexto e audita', async () => {
    const id = await caso().executar('u1', '2026-09', 'faturamento', '  exame com valor errado ');

    expect(recalculos.pedidos).toEqual([
      {
        id,
        competencia: '2026-09',
        contexto: 'faturamento',
        motivo: 'exame com valor errado',
        solicitadoPorId: 'u1',
        solicitadoEm: agora,
        concluidoEm: null,
      },
    ]);
    expect(enfileirados).toEqual([
      { contexto: 'faturamento', recalculoId: id, competencia: '2026-09' },
    ]);
    expect(auditoria.eventos).toEqual([
      {
        ator: { tipo: 'usuario', id: 'u1' },
        entidade: 'competencia',
        entidadeId: '2026-09',
        acao: 'recalculo_solicitado',
        depois: { recalculoId: id, contexto: 'faturamento', motivo: 'exame com valor errado' },
        em: agora,
      },
    ]);
  });

  it('exige o motivo', async () => {
    await expect(caso().executar('u1', '2026-09', 'faturamento', '   ')).rejects.toBeInstanceOf(
      MotivoRecalculoObrigatorioError,
    );
    expect(recalculos.pedidos).toEqual([]);
  });

  it('recusa competência aberta: ela se recalcula sozinha', async () => {
    await expect(caso().executar('u1', '2026-11', 'faturamento', 'x')).rejects.toBeInstanceOf(
      CompetenciaNaoFechadaError,
    );
  });

  it('recusa competência inexistente ou fora do formato', async () => {
    await expect(caso().executar('u1', '2026-08', 'faturamento', 'x')).rejects.toBeInstanceOf(
      CompetenciaNaoEncontradaError,
    );
    await expect(caso().executar('u1', '2026-13', 'faturamento', 'x')).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    );
  });

  it('recusa contexto que não registrou como se recalcula', async () => {
    await expect(caso().executar('u1', '2026-09', 'repasse', 'x')).rejects.toBeInstanceOf(
      ContextoSemRecalculoError,
    );
    expect(recalculos.pedidos).toEqual([]);
  });

  it('lista os pedidos da competência, o mais novo primeiro', async () => {
    const primeiro = await caso().executar('u1', '2026-09', 'faturamento', 'um');
    await recalculos.concluir(primeiro, agora);
    const segundo = await caso().executar('u2', '2026-09', 'faturamento', 'dois');

    const lista = await new ListarRecalculos(competencias, recalculos).executar('2026-09');

    expect(lista.map((r) => [r.id, r.concluidoEm])).toEqual([
      [segundo, null],
      [primeiro, agora],
    ]);
  });
});

describe('registro de recalculadores', () => {
  it('não aceita o mesmo contexto duas vezes', () => {
    const registro = new RegistroRecalculadores();
    const r = { contexto: 'repasse' as const, enfileirar: async () => {} };
    registro.registrar(r);
    expect(() => registro.registrar(r)).toThrow(/repasse/);
  });
});
