import { describe, expect, it } from 'vitest';

import {
  ajusteDeMedicos,
  aprovar,
  cancelar,
  desfechoExecucao,
  encerrar,
  estaViva,
  exigirProposta,
  expirou,
  falhar,
  iniciarExecucao,
  iniciarLeitura,
  pausar,
  propor,
  RodadaEmEstadoInvalidoError,
  reler,
  retomar,
  type StatusRodada,
} from './maquina';

const agora = new Date('2026-11-18T12:00:00Z');
const minutos = (n: number) => new Date(agora.getTime() + n * 60_000);
const rodada = (status: StatusRodada, expiraEm: Date | null = null) => ({ status, expiraEm });

const TODOS: StatusRodada[] = [
  'solicitada',
  'lendo',
  'aguardando_aprovacao',
  'aprovada',
  'executando',
  'pausada',
  'parcial',
  'concluida',
  'expirada',
  'cancelada',
  'falhou',
];
const exceto = (...s: StatusRodada[]) => TODOS.filter((x) => !s.includes(x));

describe('máquina de estados da rodada', () => {
  it('caminho feliz: solicitada → lendo → aguardando → aprovada → executando → concluída', () => {
    expect(iniciarLeitura(rodada('solicitada'))).toBe('lendo');
    expect(propor(rodada('lendo'), agora, 45)).toEqual({
      status: 'aguardando_aprovacao',
      expiraEm: minutos(45),
    });
    expect(aprovar(rodada('aguardando_aprovacao', minutos(10)), agora)).toBe('aprovada');
    expect(iniciarExecucao(rodada('aprovada'))).toBe('executando');
    expect(
      desfechoExecucao({ restam: 0, executadas: 3, falhas: 0, retentaveis: 0, pausada: false }),
    ).toBe('concluida');
  });

  it('vivas são as que ainda vão a algum lugar (parcial e pausada inclusive)', () => {
    expect(TODOS.filter((s) => estaViva(s))).toEqual([
      'solicitada',
      'lendo',
      'aguardando_aprovacao',
      'aprovada',
      'executando',
      'pausada',
      'parcial',
    ]);
  });

  it('só lê a rodada solicitada e só propõe a que está lendo', () => {
    for (const s of exceto('solicitada')) {
      expect(() => iniciarLeitura(rodada(s))).toThrow(RodadaEmEstadoInvalidoError);
    }
    for (const s of exceto('lendo')) expect(() => propor(rodada(s), agora, 45)).toThrow();
  });

  it('a proposta só se ajusta enquanto aguarda aprovação e não venceu', () => {
    expect(() => exigirProposta(rodada('aguardando_aprovacao', minutos(5)), agora)).not.toThrow();
    expect(() => exigirProposta(rodada('aguardando_aprovacao', minutos(-5)), agora)).toThrow(
      /expirou/,
    );
    expect(() => exigirProposta(rodada('aprovada'), agora)).toThrow(/ajustada/);
  });

  it('a proposta vencida expira e não pode mais ser aprovada', () => {
    const vencida = rodada('aguardando_aprovacao', minutos(-1));
    expect(expirou(vencida, agora)).toBe(true);
    expect(expirou(rodada('aguardando_aprovacao', minutos(1)), agora)).toBe(false);
    expect(expirou(rodada('aprovada', minutos(-1)), agora)).toBe(false);
    expect(() => aprovar(vencida, agora)).toThrow(/expirou/);
    expect(() => aprovar(rodada('expirada', minutos(-1)), agora)).toThrow(/expirou/);
    for (const s of exceto('aguardando_aprovacao', 'expirada')) {
      expect(() => aprovar(rodada(s), agora)).toThrow(RodadaEmEstadoInvalidoError);
    }
  });

  it('só executa a aprovada', () => {
    for (const s of exceto('aprovada')) expect(() => iniciarExecucao(rodada(s))).toThrow();
  });

  it('pausa só o que está distribuindo (aprovada ou executando)', () => {
    expect(pausar(rodada('aprovada'))).toBe('pausada');
    expect(pausar(rodada('executando'))).toBe('pausada');
    for (const s of exceto('aprovada', 'executando')) expect(() => pausar(rodada(s))).toThrow();
  });

  it('retoma a pausada, a parcial, a que falhou ou a travada executando, se ainda há o que atribuir', () => {
    for (const s of ['pausada', 'parcial', 'falhou', 'executando'] as const) {
      expect(retomar(rodada(s), { restam: 2 })).toBe('aprovada');
    }
    expect(() => retomar(rodada('pausada'), { restam: 0 })).toThrow(/pendentes/);
    for (const s of exceto('pausada', 'parcial', 'falhou', 'executando')) {
      expect(() => retomar(rodada(s), { restam: 2 })).toThrow(RodadaEmEstadoInvalidoError);
    }
  });

  it('encerra e cancela só a rodada viva', () => {
    for (const s of TODOS) {
      if (estaViva(s)) {
        expect(encerrar(rodada(s))).toBe('concluida');
        expect(cancelar(rodada(s))).toBe('cancelada');
        expect(falhar(rodada(s))).toBe('falhou');
      } else {
        expect(() => encerrar(rodada(s))).toThrow(/encerrada/);
        expect(() => cancelar(rodada(s))).toThrow(/encerrada/);
        expect(falhar(rodada(s))).toBeNull();
      }
    }
  });

  it('relê só sem execução, a partir da proposta, da que falhou ou da parcial', () => {
    for (const s of ['aguardando_aprovacao', 'falhou', 'parcial'] as const) {
      expect(reler(rodada(s), { executadas: 0 })).toBe('solicitada');
    }
    expect(() => reler(rodada('parcial'), { executadas: 1 })).toThrow(/já atribuiu 1/);
    for (const s of exceto('aguardando_aprovacao', 'falhou', 'parcial')) {
      expect(() => reler(rodada(s), { executadas: 0 })).toThrow(RodadaEmEstadoInvalidoError);
    }
  });

  it('a proposta expirada fica no histórico como está: não se relê, pede-se outra rodada', () => {
    expect(() => reler(rodada('expirada'), { executadas: 0 })).toThrow(/histórico/);
  });

  it('ajustar médicos: antes da leitura só grava; com a proposta pronta, relê; lendo ou executando, recusa', () => {
    expect(ajusteDeMedicos(rodada('solicitada'), { executadas: 0 })).toBe('gravar');
    expect(ajusteDeMedicos(rodada('aguardando_aprovacao'), { executadas: 0 })).toBe('reler');
    expect(() => ajusteDeMedicos(rodada('expirada'), { executadas: 0 })).toThrow(/histórico/);
    expect(() => ajusteDeMedicos(rodada('lendo'), { executadas: 0 })).toThrow(/lendo/);
    expect(() => ajusteDeMedicos(rodada('executando'), { executadas: 0 })).toThrow();
    expect(() => ajusteDeMedicos(rodada('parcial'), { executadas: 2 })).toThrow(/já atribuiu/);
  });

  it('desfecho da execução: sobra prevista ou retentável = parcial; nada atribuído com falha = falhou', () => {
    const base = { restam: 0, executadas: 0, falhas: 0, retentaveis: 0, pausada: false };
    expect(desfechoExecucao({ ...base, restam: 2, executadas: 1 })).toBe('parcial');
    expect(desfechoExecucao({ ...base, falhas: 3 })).toBe('falhou');
    expect(desfechoExecucao({ ...base, executadas: 2, falhas: 1, retentaveis: 1 })).toBe('parcial');
    expect(desfechoExecucao({ ...base, executadas: 2, falhas: 1 })).toBe('concluida');
    expect(desfechoExecucao({ ...base, erroGeral: 'MobileMed fora do ar' })).toBe('falhou');
  });

  it('a pausa pedida no meio continua pausada, a não ser que tudo tenha sido atribuído', () => {
    const base = { restam: 3, executadas: 1, falhas: 0, retentaveis: 0, pausada: true };
    expect(desfechoExecucao(base)).toBe('pausada');
    expect(desfechoExecucao({ ...base, restam: 0 })).toBe('concluida');
  });
});
