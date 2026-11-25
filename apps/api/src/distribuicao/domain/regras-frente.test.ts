import { describe, expect, it } from 'vitest';

import type { FrenteEscala } from './arranjo';
import { REGRAS_NEUTRAS, type RegrasFrente } from './motor/configuracao';
import { canonicaRegras, referenciasDasRegras, validarRegrasFrente } from './regras-frente';

const NEURO: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'neuro', modalidadeId: null };
const CT: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' };

const regras = (
  parcial: Partial<RegrasFrente> = {},
  frente: FrenteEscala = NEURO,
): RegrasFrente => ({
  frente,
  ...REGRAS_NEUTRAS,
  ...parcial,
});

const falha = (r: RegrasFrente, trecho: RegExp) =>
  expect(() => validarRegrasFrente(r)).toThrow(trecho);

describe('regras da frente', () => {
  it('a neutra é válida, nas duas frentes', () => {
    expect(() => validarRegrasFrente(regras())).not.toThrow();
    expect(() => validarRegrasFrente(regras({}, CT))).not.toThrow();
  });

  it('aceita as regras de produção (NEURO com teto de CP e mistura; MAMA seguindo o SLA)', () => {
    expect(() =>
      validarRegrasFrente(
        regras({
          recebimento: [
            { prioridadeOperacaoId: 'op-rot', turnoId: 'lista', regra: { tipo: 'segue_sla' } },
          ],
          recolheAoFimDoTurno: false,
          segmentos: [
            {
              subespecialidadeId: 'cp',
              teto: 7,
              tetoReduzido: { produtividadeAte: 15, teto: 4 },
              piso: null,
              pacoteAParte: false,
            },
          ],
          mistura: [
            { todasEspecialidades: true, especialidadeId: null, subespecialidadeId: 'colunas' },
            { todasEspecialidades: false, especialidadeId: 'neuro', subespecialidadeId: null },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('urgência e recebimento: sem repetir a prioridade (ou a célula) e com horas válidas', () => {
    const sempre = { prioridadeOperacaoId: 'r', urgencia: { tipo: 'sempre' as const } };
    falha(regras({ urgencias: [sempre, sempre] }), /prioridade repetida/);
    falha(
      regras({ urgencias: [{ prioridadeOperacaoId: 'r', urgencia: { tipo: 'prazo', horas: 0 } }] }),
      /horas do prazo/,
    );
    const celula = (horas: number) => ({
      prioridadeOperacaoId: 'r',
      turnoId: 'manha',
      regra: { tipo: 'prazo_minimo' as const, horas },
    });
    falha(regras({ recebimento: [celula(48), celula(24)] }), /célula repetida/);
    falha(regras({ recebimento: [celula(-1)] }), /prazo mínimo/);
    expect(() => validarRegrasFrente(regras({ recebimento: [celula(48)] }))).not.toThrow();
  });

  it('horários sem robô: HH:MM, início diferente do fim, dias de 0 a 6 sem repetir', () => {
    const h = (inicio: string, fim: string, diasSemana: number[] = []) =>
      regras({ horariosSemRobo: [{ inicio, fim, todosDias: !diasSemana.length, diasSemana }] });
    expect(() => validarRegrasFrente(h('19:00', '07:00'))).not.toThrow();
    falha(h('19:00', '7h'), /HH:MM/);
    falha(h('19:00', '19:00'), /início e fim iguais/);
    // Vazio nunca é "todos os dias".
    falha(
      regras({
        horariosSemRobo: [{ inicio: '19:00', fim: '07:00', todosDias: false, diasSemana: [] }],
      }),
      /ao menos um dia/,
    );
    falha(
      regras({
        horariosSemRobo: [{ inicio: '19:00', fim: '07:00', todosDias: true, diasSemana: [1] }],
      }),
      /não as duas/,
    );
    falha(h('19:00', '07:00', [7]), /Dia da semana inválido/);
    falha(h('19:00', '07:00', [1, 1]), /dia da semana repetido/);
  });

  it('proporção: só em frente de especialidade, duas ou mais modalidades somando 100', () => {
    const p = (
      proporcoes: { modalidadeId: string; percentual: number }[],
      frente: FrenteEscala = NEURO,
    ) => regras({ divisao: { metodo: 'proporcao', proporcoes } }, frente);
    const mi = [
      { modalidadeId: 'mr', percentual: 60 },
      { modalidadeId: 'ct', percentual: 40 },
    ];
    expect(() => validarRegrasFrente(p(mi))).not.toThrow();
    falha(p(mi, CT), /só vale em frente de especialidade/);
    falha(p([{ modalidadeId: 'mr', percentual: 100 }]), /duas modalidades/);
    falha(
      p([
        { modalidadeId: 'mr', percentual: 50 },
        { modalidadeId: 'mr', percentual: 50 },
      ]),
      /modalidade repetida/,
    );
    falha(
      p([
        { modalidadeId: 'mr', percentual: 60 },
        { modalidadeId: 'ct', percentual: 30 },
      ]),
      /somar 100/,
    );
    falha(
      p([
        { modalidadeId: 'mr', percentual: 100 },
        { modalidadeId: 'ct', percentual: 0 },
      ]),
      /Percentual/,
    );
  });

  it('teto por médico: vazio ou inteiro positivo', () => {
    expect(() => validarRegrasFrente(regras({ tetoPorMedico: null }))).not.toThrow();
    falha(regras({ tetoPorMedico: 0 }), /Teto por médico/);
  });

  it('segmentos: sem repetir, com alguma regra, reduzido abaixo do teto e piso até o teto', () => {
    const s = (seg: Partial<RegrasFrente['segmentos'][number]>) => ({
      subespecialidadeId: 'cp',
      teto: null,
      tetoReduzido: null,
      piso: null,
      pacoteAParte: false,
      ...seg,
    });
    expect(() =>
      validarRegrasFrente(regras({ segmentos: [s({ pacoteAParte: true })] })),
    ).not.toThrow();
    falha(regras({ segmentos: [s({ teto: 1 }), s({ teto: 2 })] }), /segmento repetido/);
    falha(regras({ segmentos: [s({})] }), /sem nenhuma regra/);
    falha(regras({ segmentos: [s({ teto: 0 })] }), /Teto do segmento/);
    falha(
      regras({ segmentos: [s({ tetoReduzido: { produtividadeAte: 15, teto: 4 } })] }),
      /reduzido precisa do teto/,
    );
    falha(
      regras({ segmentos: [s({ teto: 4, tetoReduzido: { produtividadeAte: 15, teto: 5 } })] }),
      /não pode passar do teto/,
    );
    falha(regras({ segmentos: [s({ teto: 4, piso: 5 })] }), /piso não pode passar do teto/);
  });

  it('mistura: duas ou mais fatias, cada uma com especialidade ou segmento, sem repetir', () => {
    const f = (especialidadeId: string | null, subespecialidadeId: string | null) => ({
      todasEspecialidades: especialidadeId === null,
      especialidadeId,
      subespecialidadeId,
    });
    falha(regras({ mistura: [f('neuro', null)] }), /duas fatias/);
    falha(regras({ mistura: [f(null, null), f('neuro', null)] }), /precisa de um segmento/);
    falha(regras({ mistura: [f('neuro', null), f('neuro', null)] }), /fatia repetida/);
    // Vazio nunca é "qualquer especialidade".
    falha(
      regras({
        mistura: [{ ...f(null, 'colunas'), todasEspecialidades: false }, f('neuro', null)],
      }),
      /escolha a especialidade/,
    );
    falha(
      regras({
        mistura: [{ ...f('neuro', 'colunas'), todasEspecialidades: true }, f('neuro', null)],
      }),
      /não as duas/,
    );
  });

  it('canônica: listas de ids e dias ordenados (a ordem da mistura conta)', () => {
    const r = canonicaRegras(
      regras({
        urgencias: [
          { prioridadeOperacaoId: 'b', urgencia: { tipo: 'nunca' } },
          { prioridadeOperacaoId: 'a', urgencia: { tipo: 'sempre' } },
        ],
        recebimento: [
          { prioridadeOperacaoId: 'b', turnoId: 't1', regra: { tipo: 'nao_recebe' } },
          { prioridadeOperacaoId: 'a', turnoId: 't2', regra: { tipo: 'nao_recebe' } },
          { prioridadeOperacaoId: 'a', turnoId: 't1', regra: { tipo: 'nao_recebe' } },
        ],
        horariosSemRobo: [{ inicio: '19:00', fim: '07:00', todosDias: false, diasSemana: [5, 1] }],
        divisao: {
          metodo: 'proporcao',
          proporcoes: [
            { modalidadeId: 'mr', percentual: 60 },
            { modalidadeId: 'ct', percentual: 40 },
          ],
        },
        mistura: [
          { todasEspecialidades: false, especialidadeId: 'z', subespecialidadeId: null },
          { todasEspecialidades: false, especialidadeId: 'a', subespecialidadeId: null },
        ],
      }),
    );
    expect(r.urgencias.map((u) => u.prioridadeOperacaoId)).toEqual(['a', 'b']);
    expect(r.recebimento.map((c) => `${c.prioridadeOperacaoId}${c.turnoId}`)).toEqual([
      'at1',
      'at2',
      'bt1',
    ]);
    expect(r.horariosSemRobo[0]?.diasSemana).toEqual([1, 5]);
    expect(r.divisao).toEqual({
      metodo: 'proporcao',
      proporcoes: [
        { modalidadeId: 'ct', percentual: 40 },
        { modalidadeId: 'mr', percentual: 60 },
      ],
    });
    expect(r.mistura.map((x) => x.especialidadeId)).toEqual(['z', 'a']);
  });

  it('referências: o que a regra cita do catálogo', () => {
    expect(
      referenciasDasRegras(
        regras({
          urgencias: [{ prioridadeOperacaoId: 'amb', urgencia: { tipo: 'nunca' } }],
          recebimento: [
            { prioridadeOperacaoId: 'rot', turnoId: 'manha', regra: { tipo: 'segue_sla' } },
          ],
          divisao: {
            metodo: 'proporcao',
            proporcoes: [
              { modalidadeId: 'mr', percentual: 60 },
              { modalidadeId: 'ct', percentual: 40 },
            ],
          },
          segmentos: [
            {
              subespecialidadeId: 'cp',
              teto: 7,
              tetoReduzido: null,
              piso: null,
              pacoteAParte: false,
            },
          ],
          mistura: [
            { todasEspecialidades: true, especialidadeId: null, subespecialidadeId: 'colunas' },
            { todasEspecialidades: false, especialidadeId: 'msk', subespecialidadeId: null },
          ],
        }),
      ),
    ).toEqual({
      prioridadeOperacao: ['amb', 'rot'],
      turno: ['manha'],
      modalidade: ['mr', 'ct'],
      subespecialidade: ['cp', 'colunas'],
      especialidade: ['msk'],
    });
  });
});
