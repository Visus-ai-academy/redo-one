import { describe, expect, it } from 'vitest';

import type { FrenteEscala } from './arranjo';
import {
  type EdicaoExcecaoRecebimento,
  empates,
  podeExcluir,
  situacaoExcecao,
  validarEdicaoExcecao,
  validarExcecao,
} from './excecoes-recebimento';
import type { ExcecaoRecebimento } from './motor/prioridades-operacao';

const NEURO: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'neuro', modalidadeId: null };
const CT: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' };
const HOJE = '2026-11-25';

const edicao = (p: Partial<EdicaoExcecaoRecebimento> = {}): EdicaoExcecaoRecebimento => ({
  turnoId: 'lista',
  todasFrentes: !p.frente,
  frente: null,
  todasPrioridades: !p.prioridadeOperacaoId,
  prioridadeOperacaoId: null,
  regra: { tipo: 'segue_sla' },
  de: HOJE,
  ate: '2026-12-22',
  ...p,
});
let seq = 0;
const excecao = (p: Partial<ExcecaoRecebimento> = {}): ExcecaoRecebimento => ({
  id: `x${++seq}`,
  criadoEm: new Date('2026-11-20T12:00:00Z'),
  ...edicao(p),
  ...p,
});

describe('validarExcecao', () => {
  it('aceita "toda a Lista segue o SLA até 22/12"', () => {
    expect(() => validarExcecao(edicao())).not.toThrow();
  });

  it('recusa data inválida e fim antes do início', () => {
    expect(() => validarExcecao(edicao({ de: '2026-02-30' }))).toThrow(/Início.*inválida/);
    expect(() => validarExcecao(edicao({ ate: '2026-11-24' }))).toThrow(
      /fim não pode ser antes do início/,
    );
  });

  it('recusa prazo mínimo fora da faixa', () => {
    expect(() => validarExcecao(edicao({ regra: { tipo: 'prazo_minimo', horas: 0 } }))).toThrow(
      /prazo mínimo/,
    );
  });

  it('vazio nunca é "todas": sem "todas", a frente e a prioridade são obrigatórias', () => {
    expect(() => validarExcecao(edicao({ todasFrentes: false }))).toThrow(/Escolha a frente/);
    expect(() => validarExcecao(edicao({ todasPrioridades: false }))).toThrow(
      /Escolha a prioridade/,
    );
    expect(() => validarExcecao(edicao({ todasFrentes: true, frente: NEURO }))).toThrow(
      /não as duas/,
    );
    expect(() =>
      validarExcecao(edicao({ todasPrioridades: true, prioridadeOperacaoId: 'rotina' })),
    ).toThrow(/não as duas/);
  });

  it('recusa período longo demais (mais de um ano)', () => {
    expect(() => validarExcecao(edicao({ ate: '2027-12-01' }))).toThrow(/até 366 dias/);
  });
});

describe('situacaoExcecao', () => {
  it('futura, vigente (inclusive nos dias das pontas) e encerrada', () => {
    expect(situacaoExcecao({ de: '2026-11-26', ate: '2026-12-01' }, HOJE)).toBe('futura');
    expect(situacaoExcecao({ de: HOJE, ate: HOJE }, HOJE)).toBe('vigente');
    expect(situacaoExcecao({ de: '2026-11-01', ate: '2026-11-24' }, HOJE)).toBe('encerrada');
  });
});

describe('validarEdicaoExcecao', () => {
  it('nova: não começa no passado', () => {
    expect(() => validarEdicaoExcecao(null, edicao({ de: '2026-11-24' }), HOJE)).toThrow(
      /não pode começar antes de hoje/,
    );
    expect(() => validarEdicaoExcecao(null, edicao(), HOJE)).not.toThrow();
  });

  it('encerrada fica no histórico e não muda', () => {
    const velha = excecao({ de: '2026-11-01', ate: '2026-11-10' });
    expect(() =>
      validarEdicaoExcecao(velha, { ...velha, regra: { tipo: 'nao_recebe' } }, HOJE),
    ).toThrow(/encerrada/);
  });

  it('vigente: o início que já passou não muda; encerrar = fim ontem', () => {
    const vigente = excecao({ de: '2026-11-20', ate: '2026-12-22' });
    expect(() => validarEdicaoExcecao(vigente, { ...vigente, de: '2026-11-21' }, HOJE)).toThrow(
      /início de uma exceção que já começou/,
    );
    expect(() =>
      validarEdicaoExcecao(vigente, { ...vigente, ate: '2026-11-24' }, HOJE),
    ).not.toThrow();
    expect(() => validarEdicaoExcecao(vigente, { ...vigente, ate: '2026-11-23' }, HOJE)).toThrow(
      /fim não pode ser antes de ontem/,
    );
  });

  it('futura: pode mudar tudo, mas não para o passado', () => {
    const futura = excecao({ de: '2026-12-01', ate: '2026-12-10' });
    expect(() =>
      validarEdicaoExcecao(
        futura,
        { ...futura, de: '2026-11-26', todasFrentes: false, frente: CT },
        HOJE,
      ),
    ).not.toThrow();
    expect(() => validarEdicaoExcecao(futura, { ...futura, de: '2026-11-24' }, HOJE)).toThrow(
      /não pode começar antes de hoje/,
    );
  });
});

describe('podeExcluir', () => {
  it('só a que ainda não valeu em dia passado (futura ou que começa hoje)', () => {
    expect(podeExcluir({ de: '2026-12-01' }, HOJE)).toBe(true);
    expect(podeExcluir({ de: HOJE }, HOJE)).toBe(true);
    expect(podeExcluir({ de: '2026-11-24' }, HOJE)).toBe(false);
  });
});

describe('empates', () => {
  it('acha a de mesmo turno, mesma especificidade, recortes que se cruzam e períodos que se tocam', () => {
    const a = excecao({ frente: NEURO, de: '2026-12-01', ate: '2026-12-10' });
    const mesmoRecorte = excecao({ frente: NEURO, de: '2026-12-10', ate: '2026-12-20' });
    const outroPeriodo = excecao({ frente: NEURO, de: '2026-12-11', ate: '2026-12-20' });
    const outraFrente = excecao({ frente: CT, de: '2026-12-01', ate: '2026-12-10' });
    const outroTurno = excecao({ frente: NEURO, turnoId: 'manha' });
    // Mais específica não empata: ela vence sem ambiguidade.
    const maisEspecifica = excecao({ frente: NEURO, prioridadeOperacaoId: 'op-rot' });
    // Só frente × só prioridade: mesma especificidade e se cruzam (NEURO + ROTINA).
    const soPrioridade = excecao({ prioridadeOperacaoId: 'op-rot', de: '2026-12-05' });
    expect(
      empates(a, [
        a,
        mesmoRecorte,
        outroPeriodo,
        outraFrente,
        outroTurno,
        maisEspecifica,
        soPrioridade,
      ]).map((e) => e.id),
    ).toEqual([mesmoRecorte.id, soPrioridade.id]);
  });
});
