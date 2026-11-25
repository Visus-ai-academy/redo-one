import { describe, expect, it } from 'vitest';

import type { ExcecaoRecebimentoDto } from '../../gen/types/ExcecaoRecebimentoDto';
import {
  esquemaExcecao,
  excecaoParaApi,
  periodoExcecao,
  recorteExcecao,
  separarPorSituacao,
  TODAS,
  valoresDaExcecao,
} from './excecoes-recebimento';

const nomes = new Map([
  ['neuro', 'NEURO'],
  ['ct', 'CT'],
  ['op-rot', 'ROTINA'],
]);
const nome = (id: string) => nomes.get(id) ?? id;

const excecao = (p: Partial<ExcecaoRecebimentoDto> = {}): ExcecaoRecebimentoDto => ({
  id: 'x1',
  turnoId: 'lista',
  todasFrentes: !p.especialidadeId && !p.modalidadeId,
  especialidadeId: null,
  modalidadeId: null,
  todasPrioridades: !p.prioridadeOperacaoId,
  prioridadeOperacaoId: null,
  regra: { tipo: 'segue_sla', horas: null },
  de: '2026-11-25',
  ate: '2026-12-22',
  criadoEm: '2026-11-25T12:00:00Z',
  situacao: 'vigente',
  podeExcluir: true,
  empatesIds: [],
  ...p,
});

describe('exceções da grade: formulário', () => {
  it('nova começa hoje, segue o SLA e vale para todas as frentes e prioridades', () => {
    expect(valoresDaExcecao(undefined, '2026-11-25')).toEqual({
      turnoId: '',
      regra: 'segue_sla',
      horas: '',
      frente: TODAS,
      prioridadeOperacaoId: TODAS,
      de: '2026-11-25',
      ate: '',
    });
  });

  it('a frente vira E|id ou M|id e volta como especialidadeId/modalidadeId', () => {
    const v = valoresDaExcecao(
      excecao({
        modalidadeId: 'ct',
        prioridadeOperacaoId: 'op-rot',
        regra: { tipo: 'prazo_minimo', horas: 12 },
      }),
      '2026-11-25',
    );
    expect(v).toMatchObject({ frente: 'M|ct', prioridadeOperacaoId: 'op-rot', horas: '12' });
    expect(excecaoParaApi(v)).toEqual({
      turnoId: 'lista',
      todasFrentes: false,
      especialidadeId: null,
      modalidadeId: 'ct',
      todasPrioridades: false,
      prioridadeOperacaoId: 'op-rot',
      regra: { tipo: 'prazo_minimo', horas: 12 },
      de: '2026-11-25',
      ate: '2026-12-22',
    });
    expect(
      excecaoParaApi({ ...v, frente: 'E|neuro', prioridadeOperacaoId: TODAS, regra: 'nao_recebe' }),
    ).toMatchObject({
      todasFrentes: false,
      especialidadeId: 'neuro',
      modalidadeId: null,
      todasPrioridades: true,
      prioridadeOperacaoId: null,
      regra: { tipo: 'nao_recebe', horas: null },
    });
  });

  it('"Todas" vira o todasFrentes / todasPrioridades explícito, e volta', () => {
    const v = valoresDaExcecao(excecao(), '2026-11-25');
    expect(v).toMatchObject({ frente: TODAS, prioridadeOperacaoId: TODAS });
    expect(excecaoParaApi(v)).toMatchObject({ todasFrentes: true, todasPrioridades: true });
  });

  it('valida obrigatórios, horas do prazo mínimo e fim antes do início', () => {
    const base = valoresDaExcecao(excecao(), '2026-11-25');
    const erros = (v: typeof base) =>
      esquemaExcecao.safeParse(v).error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(erros(base)).toEqual([]);
    expect(erros({ ...base, turnoId: '', ate: '' })).toEqual(['turnoId', 'ate']);
    expect(erros({ ...base, regra: 'prazo_minimo', horas: '0' })).toEqual(['horas']);
    expect(erros({ ...base, ate: '2026-11-24' })).toEqual(['ate']);
  });
});

describe('exceções da grade: textos e grupos', () => {
  it('recorte e período legíveis', () => {
    expect(recorteExcecao(excecao(), nome)).toBe('Todas as frentes e prioridades');
    expect(recorteExcecao(excecao({ especialidadeId: 'neuro' }), nome)).toBe(
      'Só NEURO, todas as prioridades',
    );
    expect(recorteExcecao(excecao({ prioridadeOperacaoId: 'op-rot' }), nome)).toBe(
      'Todas as frentes, só ROTINA',
    );
    expect(
      recorteExcecao(excecao({ modalidadeId: 'ct', prioridadeOperacaoId: 'op-rot' }), nome),
    ).toBe('Só CT, só ROTINA');
    expect(periodoExcecao(excecao())).toBe('25/11/2026 a 22/12/2026');
    expect(periodoExcecao(excecao({ ate: '2026-11-25' }))).toBe('Só em 25/11/2026');
  });

  it('separa vigentes, futuras e encerradas (estas da que terminou por último)', () => {
    const lista = [
      excecao({ id: 'f', situacao: 'futura' }),
      excecao({ id: 'e1', situacao: 'encerrada', ate: '2026-10-01' }),
      excecao({ id: 'v', situacao: 'vigente' }),
      excecao({ id: 'e2', situacao: 'encerrada', ate: '2026-11-20' }),
    ];
    const g = separarPorSituacao(lista);
    expect(g.vigentes.map((e) => e.id)).toEqual(['v']);
    expect(g.futuras.map((e) => e.id)).toEqual(['f']);
    expect(g.encerradas.map((e) => e.id)).toEqual(['e2', 'e1']);
  });
});
