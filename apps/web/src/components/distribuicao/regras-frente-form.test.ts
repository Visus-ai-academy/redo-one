import { describe, expect, it } from 'vitest';

import type { RegrasFrenteDto } from '../../gen/types/RegrasFrenteDto';
import {
  esquemaRegras,
  regrasParaApi,
  resumoRegras,
  type ValoresRegras,
  valoresDasRegras,
} from './regras-frente-form';

const NEUTRAS: RegrasFrenteDto = {
  listaPrioridadeIds: null,
  listaPrazo: 'padrao',
  listaPrazoMinimoHoras: null,
  recolheAoFimDoTurno: true,
  distribuiPeloRobo: true,
  horariosSemRobo: [],
  divisao: 'igualitaria',
  proporcoes: [],
  tetoPorMedico: null,
  segmentos: [],
  mistura: [],
  listaDepoisDosFixos: false,
};

const CATALOGO = {
  especialidades: [
    { id: 'e-neuro', nome: 'NEURO' },
    { id: 'e-msk', nome: 'MSK' },
  ],
  modalidades: [
    { id: 'm-mr', nome: 'MR' },
    { id: 'm-ct', nome: 'CT' },
  ],
  subespecialidades: [
    { id: 's-col', nome: 'COLUNAS', especialidadeIds: ['e-neuro', 'e-msk'] },
    { id: 's-cp', nome: 'CABEÇA E PESCOÇO', especialidadeIds: ['e-neuro'] },
  ],
  prioridades: [
    { id: 'p-rot', nome: 'ROTINA' },
    { id: 'p-urg', nome: 'URGÊNCIA' },
  ],
};

const erros = (valores: ValoresRegras, tipo: 'especialidade' | 'modalidade' = 'especialidade') => {
  const r = esquemaRegras(tipo).safeParse(valores);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('regras da frente no formulário', () => {
  it('ida e volta das regras neutras não muda nada', () => {
    expect(regrasParaApi(valoresDasRegras(NEUTRAS), 'especialidade')).toEqual(NEUTRAS);
    expect(erros(valoresDasRegras(NEUTRAS))).toEqual([]);
  });

  it('ida e volta de uma regra completa', () => {
    const regras: RegrasFrenteDto = {
      ...NEUTRAS,
      listaPrioridadeIds: ['p-rot'],
      listaPrazo: 'minimo',
      listaPrazoMinimoHoras: 12,
      horariosSemRobo: [{ diasSemana: [1, 2], inicio: '19:00', fim: '07:00' }],
      divisao: 'proporcao',
      proporcoes: [
        { modalidadeId: 'm-mr', percentual: 60 },
        { modalidadeId: 'm-ct', percentual: 40 },
      ],
      tetoPorMedico: 30,
      segmentos: [
        {
          subespecialidadeId: 's-cp',
          teto: 7,
          tetoReduzido: { produtividadeAte: 20, teto: 4 },
          piso: 2,
          pacoteAParte: false,
        },
      ],
      mistura: [
        { especialidadeId: null, subespecialidadeId: 's-col' },
        { especialidadeId: 'e-neuro', subespecialidadeId: null },
      ],
    };
    const valores = valoresDasRegras(regras);
    expect(erros(valores)).toEqual([]);
    expect(regrasParaApi(valores, 'especialidade')).toEqual(regras);
  });

  it('prioridades próprias sem nenhuma marcada são todas (lista vazia)', () => {
    const v = { ...valoresDasRegras(NEUTRAS), listaPrioridades: 'proprias' as const };
    expect(regrasParaApi(v, 'especialidade').listaPrioridadeIds).toEqual([]);
  });

  it('a modalidade nunca manda proporção', () => {
    const v: ValoresRegras = {
      ...valoresDasRegras(NEUTRAS),
      divisao: 'proporcao',
      proporcoes: [{ modalidadeId: 'm-mr', percentual: '100' }],
    };
    const api = regrasParaApi(v, 'modalidade');
    expect(api.divisao).toBe('igualitaria');
    expect(api.proporcoes).toEqual([]);
  });

  it('exige o prazo mínimo quando a Lista tem prazo próprio', () => {
    const v = { ...valoresDasRegras(NEUTRAS), listaPrazo: 'minimo' as const };
    expect(erros(v)).toEqual(['listaPrazoMinimoHoras: Informe as horas, de 0 a 720.']);
  });

  it('recusa horário fora do formato e início igual ao fim', () => {
    const v: ValoresRegras = {
      ...valoresDasRegras(NEUTRAS),
      horariosSemRobo: [
        { diasSemana: [], inicio: '25:00', fim: '07:00' },
        { diasSemana: [], inicio: '07:00', fim: '07:00' },
      ],
    };
    expect(erros(v)).toEqual([
      'horariosSemRobo.0.inicio: Use HH:MM, como 19:00.',
      'horariosSemRobo.1.fim: O fim precisa ser diferente do início.',
    ]);
  });

  it('a proporção precisa de duas modalidades diferentes somando 100', () => {
    const base = { ...valoresDasRegras(NEUTRAS), divisao: 'proporcao' as const };
    expect(erros({ ...base, proporcoes: [{ modalidadeId: 'm-mr', percentual: '100' }] })).toEqual([
      'proporcoes: Escolha ao menos duas modalidades.',
    ]);
    expect(
      erros({
        ...base,
        proporcoes: [
          { modalidadeId: 'm-mr', percentual: '60' },
          { modalidadeId: 'm-mr', percentual: '30' },
        ],
      }),
    ).toEqual([
      'proporcoes.1.modalidadeId: Modalidade repetida.',
      'proporcoes: Os percentuais precisam somar 100 (hoje somam 90).',
    ]);
  });

  it('segmento precisa de alguma regra, e o reduzido e o piso não passam do teto', () => {
    const seg = {
      subespecialidadeId: 's-cp',
      teto: '',
      reduzido: false,
      produtividadeAte: '',
      tetoReduzido: '',
      piso: '',
      pacoteAParte: false,
    };
    const base = valoresDasRegras(NEUTRAS);
    expect(erros({ ...base, segmentos: [seg] })).toEqual([
      'segmentos.0.teto: Defina teto, piso ou pacote à parte, ou tire o segmento.',
    ]);
    expect(
      erros({
        ...base,
        segmentos: [
          {
            ...seg,
            teto: '5',
            reduzido: true,
            produtividadeAte: '20',
            tetoReduzido: '6',
            piso: '7',
          },
        ],
      }),
    ).toEqual([
      'segmentos.0.tetoReduzido: O teto reduzido não pode passar do teto.',
      'segmentos.0.piso: O piso não pode passar do teto.',
    ]);
  });

  it('a mistura tem zero ou duas fatias ou mais, sem repetir', () => {
    const base = valoresDasRegras(NEUTRAS);
    expect(
      erros({ ...base, mistura: [{ especialidadeId: 'e-neuro', subespecialidadeId: '' }] }),
    ).toEqual(['mistura: A mistura precisa de ao menos duas fatias (ou nenhuma).']);
    expect(
      erros({
        ...base,
        mistura: [
          { especialidadeId: '', subespecialidadeId: '' },
          { especialidadeId: 'e-neuro', subespecialidadeId: '' },
          { especialidadeId: 'e-neuro', subespecialidadeId: '' },
        ],
      }),
    ).toEqual([
      'mistura.0.subespecialidadeId: Escolha a especialidade ou o segmento.',
      'mistura.2.subespecialidadeId: Fatia repetida.',
    ]);
  });
});

describe('resumo das regras (só leitura)', () => {
  it('descreve as regras neutras pelo padrão', () => {
    const grupos = resumoRegras(NEUTRAS, CATALOGO, 'especialidade');
    expect(grupos.map((g) => g.titulo)).toEqual([
      'Lista',
      'Robô',
      'Recolhimento',
      'Divisão e teto',
      'Segmentos',
      'Mistura entre segmentos',
    ]);
    expect(grupos[0]?.linhas).toEqual([
      { rotulo: 'Prioridades aceitas', valor: 'As da regra padrão' },
      { rotulo: 'Prazo', valor: 'O da regra padrão' },
      { rotulo: 'Guardar para os turnos posteriores', valor: 'Não' },
    ]);
  });

  it('descreve proporção, horários, segmentos e mistura com os nomes', () => {
    const grupos = resumoRegras(
      {
        ...NEUTRAS,
        listaPrioridadeIds: [],
        listaPrazo: 'sla',
        distribuiPeloRobo: true,
        horariosSemRobo: [{ diasSemana: [], inicio: '19:00', fim: '07:00' }],
        recolheAoFimDoTurno: false,
        divisao: 'proporcao',
        proporcoes: [
          { modalidadeId: 'm-mr', percentual: 60 },
          { modalidadeId: 'm-ct', percentual: 40 },
        ],
        tetoPorMedico: 30,
        segmentos: [
          {
            subespecialidadeId: 's-cp',
            teto: 7,
            tetoReduzido: { produtividadeAte: 20, teto: 4 },
            piso: null,
            pacoteAParte: true,
          },
        ],
        mistura: [
          { especialidadeId: null, subespecialidadeId: 's-col' },
          { especialidadeId: 'e-neuro', subespecialidadeId: null },
        ],
      },
      CATALOGO,
      'especialidade',
    );
    const valor = (titulo: string) =>
      grupos
        .find((g) => g.titulo === titulo)
        ?.linhas.map((l) => `${l.rotulo}: ${l.valor}`)
        .join(' | ');
    expect(valor('Lista')).toBe(
      'Prioridades aceitas: Todas | Prazo: Segue o SLA | Guardar para os turnos posteriores: Não',
    );
    expect(valor('Robô')).toBe(
      'Distribui pelo robô: Sim | Horários sem robô: Todos os dias, 19:00–07:00',
    );
    expect(valor('Recolhimento')).toBe('Ao fim do turno: Não recolhe');
    expect(valor('Divisão e teto')).toBe(
      'Método: Por modalidade: MR 60%, CT 40% | Teto por médico: 30 por rodada',
    );
    expect(valor('Segmentos')).toBe(
      'CABEÇA E PESCOÇO: teto 7 (4 com produtividade até 20), pacote à parte',
    );
    expect(valor('Mistura entre segmentos')).toBe(
      'Ordem: 1. COLUNAS (qualquer especialidade); 2. NEURO (geral)',
    );
  });

  it('na modalidade, sem proporção', () => {
    const grupos = resumoRegras(NEUTRAS, CATALOGO, 'modalidade');
    expect(grupos.find((g) => g.titulo === 'Divisão e teto')?.linhas).toEqual([
      { rotulo: 'Teto por médico', valor: 'Só o da escala' },
    ]);
  });
});
