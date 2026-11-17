import { describe, expect, it } from 'vitest';

import {
  type ConfiguracaoDistribuicao,
  REGRAS_NEUTRAS,
  type RegraSegmento,
  type RegrasFrente,
  RegrasPorFrente,
} from './configuracao';
import type { ExameMotor, PrioridadeCliente } from './fila';
import type { MedicoDisponivel } from './medicos-disponiveis';
import { distribuir, distribuirNaOrdem, type EntradaMotor } from './motor';

const MI = 'esp-mi';
const MSK = 'esp-msk';
const NEURO = 'esp-neuro';
const CT = 'mod-ct';
const MR = 'mod-mr';
const CP = 'seg-cp';
const COLUNAS = 'seg-colunas';

const CONFIG: ConfiguracaoDistribuicao = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  prioridadeIdsUrgentes: [],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 0,
  folgaAtrasadoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: ['ONCO'],
  escalaRestringeEspecialidade: false,
  diasJaEntregue: 7,
  turnosPosteriores: null,
};

const agora = new Date('2026-10-16T13:00:00Z');
let seq = 0;
const exame = (p: Partial<ExameMotor> = {}): ExameMotor => {
  const id = p.id ?? `e${++seq}`;
  return {
    id,
    laudos: 1,
    especialidadeId: MSK,
    modalidadeId: MR,
    subespecialidadeId: null,
    clienteId: null,
    urgente: false,
    paciente: `P${id}`,
    restanteMin: 600,
    entradaEm: new Date(agora.getTime() - (100_000 - ++seq) * 60_000),
    marcador: null,
    medicoAderente: null,
    ...p,
  };
};
const varios = (n: number, p: Partial<ExameMotor> = {}) =>
  Array.from({ length: n }, () => exame(p));

const medico = (id: string, p: Partial<MedicoDisponivel> = {}): MedicoDisponivel => ({
  id,
  nome: id,
  elegivelPara: () => true,
  capacidade: 10,
  produtividade: null,
  cargaInicial: 0,
  cotaGratificada: 0,
  gratificadoPara: () => false,
  reservadoPara: () => false,
  cargaReservada: 0,
  segmentoUnico: null,
  extraPara: () => 0,
  ...p,
});

const rodar = (p: Partial<EntradaMotor>) =>
  distribuir({
    agora,
    exames: [],
    medicos: [],
    config: CONFIG,
    regras: new RegrasPorFrente([]),
    ...p,
  });
type Resultado = ReturnType<typeof rodar>;
const de = (r: Resultado, id: string) => r.designacoes.filter((d) => d.medicoId === id);
const ids = (r: Resultado) => r.designacoes.map((d) => d.exameId);

const frenteEsp = (especialidadeId: string, p: Partial<RegrasFrente> = {}): RegrasFrente => ({
  ...REGRAS_NEUTRAS,
  frente: { tipo: 'especialidade', especialidadeId, modalidadeId: null },
  ...p,
});

describe('ocupação: o exame vai para quem tem a menor fração do teto', () => {
  it('100/200 (50%) perde para 150/400 (37,5%)', () => {
    const r = rodar({
      exames: varios(1),
      medicos: [
        medico('X', { capacidade: 200, cargaInicial: 100 }),
        medico('Y', { capacidade: 400, cargaInicial: 150 }),
      ],
    });
    expect(de(r, 'Y')).toHaveLength(1);
  });

  it('Y recebe sozinho até 50%, depois 1 para X a cada 2 para Y', () => {
    const r = rodar({
      exames: varios(80),
      medicos: [
        medico('X', { capacidade: 200, cargaInicial: 100 }),
        medico('Y', { capacidade: 400, cargaInicial: 150 }),
      ],
    });
    expect(de(r, 'X')).toHaveLength(10);
    expect(de(r, 'Y')).toHaveLength(70);
  });

  it('sem teto para ninguém, a carga crua; sem teto para um, a média dos outros', () => {
    let r = rodar({
      exames: varios(1),
      medicos: [
        medico('X', { capacidade: null, cargaInicial: 100 }),
        medico('Y', { capacidade: null, cargaInicial: 150 }),
      ],
    });
    expect(de(r, 'X')).toHaveLength(1);
    r = rodar({
      exames: varios(1),
      medicos: [
        medico('S', { capacidade: null, cargaInicial: 100 }),
        medico('X', { capacidade: 200, cargaInicial: 80 }),
        medico('Y', { capacidade: 400, cargaInicial: 150 }),
      ],
    });
    expect(de(r, 'S')).toHaveLength(1);
  });
});

describe('teto, tolerância, margem de urgência, teto por médico e ajuste do dia', () => {
  it('a rotina vai até o teto; a urgência passa dele pela margem', () => {
    const cfg = (margemUrgenciaPct: number) => ({ ...CONFIG, margemUrgenciaPct });
    const um = [medico('A', { capacidade: 20 })];
    expect(rodar({ exames: varios(25), medicos: um, config: cfg(10) }).designacoes).toHaveLength(
      20,
    );
    expect(
      rodar({ exames: varios(25, { urgente: true }), medicos: um, config: cfg(10) }).designacoes,
    ).toHaveLength(22);
    expect(
      rodar({ exames: varios(25, { urgente: true }), medicos: um, config: cfg(0) }).designacoes,
    ).toHaveLength(20);
    const cheio = [medico('A', { capacidade: 20, cargaInicial: 20 })];
    expect(rodar({ exames: varios(25), medicos: cheio, config: cfg(10) }).designacoes).toHaveLength(
      0,
    );
    expect(
      rodar({ exames: varios(25, { urgente: true }), medicos: cheio, config: cfg(10) }).designacoes,
    ).toHaveLength(2);
  });

  it('a tolerância deixa passar do teto', () => {
    const r = rodar({
      exames: varios(15),
      medicos: [medico('A')],
      config: { ...CONFIG, toleranciaAcimaTeto: 2 },
    });
    expect(r.designacoes).toHaveLength(12);
  });

  it('o teto por médico da frente vale junto com o da escala (o menor)', () => {
    const r = rodar({
      exames: varios(15),
      medicos: [medico('A')],
      regras: new RegrasPorFrente([frenteEsp(MSK, { tetoPorMedico: 4 })]),
    });
    expect(r.designacoes).toHaveLength(4);
  });

  it('o extra do ajuste do dia passa do teto, só no recorte e no pacote inteiro', () => {
    const medicos = [medico('A', { extraPara: () => 10 }), medico('B')];
    let r = rodar({ exames: varios(30), medicos });
    expect(de(r, 'A')).toHaveLength(20);
    expect(de(r, 'B')).toHaveLength(10);
    // Pacote misto: um exame no recorte, outro não → extra 0.
    const doPacote = [exame({ id: 'ct', paciente: 'Z' }), exame({ id: 'mr', paciente: 'Z' })];
    r = rodar({
      exames: doPacote,
      medicos: [medico('A', { cargaInicial: 10, extraPara: (e) => (e === 'ct' ? 10 : 0) })],
    });
    expect(r.naoDistribuidos).toHaveLength(2);
    // Sem teto continua sem teto.
    r = rodar({
      exames: varios(30),
      medicos: [medico('A', { capacidade: null, extraPara: () => 10 })],
    });
    expect(r.designacoes).toHaveLength(30);
  });

  it('o motivo de quem ficou sem espaço diz quem estava cheio', () => {
    const r = rodar({ exames: varios(3), medicos: [medico('Ana', { capacidade: 2 })] });
    expect(r.naoDistribuidos[0]).toMatchObject({ motivo: 'sem_espaco' });
    expect(r.naoDistribuidos[0]?.detalhe).toContain('Ana 2/2');
  });
});

describe('cota da escala gratificada: piso, não teto', () => {
  it('só gratificado, cota 8 e 5 em mãos: recebe os 8 primeiro, marcados', () => {
    const r = rodar({
      exames: varios(12),
      medicos: [
        medico('G', {
          capacidade: 0,
          cargaInicial: 5,
          cotaGratificada: 8,
          gratificadoPara: () => true,
        }),
        medico('C'),
      ],
    });
    expect(de(r, 'G')).toHaveLength(8);
    expect(de(r, 'G').every((d) => d.gratificado)).toBe(true);
    expect(de(r, 'C')).toHaveLength(4);
    expect(de(r, 'C').every((d) => !d.gratificado)).toBe(true);
  });

  it('a cota não ocupa a vaga do turno: fixo 3 + cota 4 = 7', () => {
    const r = rodar({
      exames: varios(30),
      medicos: [
        medico('G', { capacidade: 3, cotaGratificada: 4, gratificadoPara: () => true }),
        medico('C', { capacidade: 20 }),
      ],
    });
    expect(de(r, 'G').filter((d) => d.gratificado)).toHaveLength(4);
    expect(de(r, 'G')).toHaveLength(7);
  });

  it('o pacote não se divide: a margem é para cima', () => {
    const r = rodar({
      exames: varios(3, { paciente: 'PX' }),
      medicos: [
        medico('G', { capacidade: 0, cotaGratificada: 2, gratificadoPara: () => true }),
        medico('C'),
      ],
    });
    expect(de(r, 'G')).toHaveLength(3);
  });

  it('exame que não entra pela gratificada não abate a cota', () => {
    const r = rodar({
      exames: varios(4),
      medicos: [medico('G', { capacidade: 0, cotaGratificada: 4 }), medico('C')],
    });
    expect(de(r, 'G')).toHaveLength(0);
  });
});

describe('clínica exclusiva: fora do teto', () => {
  const daCli = (id: string) => id.startsWith('CLI');
  const fila = (n: number, prefixo: string, paciente?: string) =>
    Array.from({ length: n }, () =>
      exame({ id: `${prefixo}-${++seq}`, ...(paciente ? { paciente } : {}) }),
    );
  const bruno = (p: Partial<MedicoDisponivel> = {}) =>
    medico('BRUNO', { capacidade: 25, reservadoPara: daCli, ...p });
  const outro = (id: string) => medico(id, { capacidade: 25, elegivelPara: (e) => !daCli(e) });

  it('a clínica inteira entra, e o teto inteiro fica para o resto (20/10)', () => {
    const r = rodar({
      exames: [...fila(10, 'CLI'), ...fila(40, 'OUT')],
      medicos: [bruno({ cargaInicial: 3, cargaReservada: 13 })],
    });
    expect(de(r, 'BRUNO').filter((d) => daCli(d.exameId))).toHaveLength(10);
    expect(de(r, 'BRUNO').filter((d) => !daCli(d.exameId))).toHaveLength(22);
  });

  it('com o teto cheio, o exclusivo continua entrando', () => {
    expect(
      de(rodar({ exames: fila(5, 'CLI'), medicos: [bruno({ cargaInicial: 25 })] }), 'BRUNO'),
    ).toHaveLength(5);
  });

  it('o exclusivo em mãos não ocupa a vaga na divisão com os outros', () => {
    const r = rodar({
      exames: fila(20, 'OUT'),
      medicos: [bruno({ cargaReservada: 13 }), outro('FELIPE')],
    });
    expect(de(r, 'BRUNO')).toHaveLength(10);
    expect(de(r, 'FELIPE')).toHaveLength(10);
  });

  it('entre dois exclusivos vai para quem tem menos do recorte', () => {
    const r = rodar({
      exames: fila(10, 'CLI'),
      medicos: [
        bruno({ cargaInicial: 20 }),
        medico('B2', { capacidade: 25, reservadoPara: daCli, cargaReservada: 4 }),
      ],
    });
    expect(de(r, 'BRUNO')).toHaveLength(7);
    expect(de(r, 'B2')).toHaveLength(3);
  });

  it('pacote misto: só a parte comum pesa no teto', () => {
    let r = rodar({
      exames: [...fila(1, 'CLI', 'PX'), ...fila(1, 'OUT', 'PX')],
      medicos: [bruno({ cargaInicial: 24 })],
    });
    expect(de(r, 'BRUNO')).toHaveLength(2);
    r = rodar({
      exames: [...fila(1, 'CLI', 'PY'), ...fila(1, 'OUT', 'PY')],
      medicos: [bruno({ cargaInicial: 25 })],
    });
    expect(de(r, 'BRUNO')).toHaveLength(0);
  });
});

describe('teto e piso por segmento', () => {
  const segCp = (p: Partial<RegraSegmento> = {}): RegraSegmento => ({
    subespecialidadeId: CP,
    teto: 7,
    tetoReduzido: { produtividadeAte: 15, teto: 4 },
    piso: null,
    pacoteAParte: false,
    ...p,
  });
  const neuro = (seg: RegraSegmento | null) =>
    new RegrasPorFrente([frenteEsp(NEURO, { segmentos: seg ? [seg] : [] })]);
  const cp = Array.from({ length: 30 }, (_, i) =>
    exame({
      id: `cp${i}`,
      especialidadeId: NEURO,
      modalidadeId: CT,
      subespecialidadeId: CP,
      restanteMin: 60,
    }),
  );
  const gerais = Array.from({ length: 60 }, (_, i) =>
    exame({ id: `g${i}`, especialidadeId: NEURO, modalidadeId: CT, restanteMin: 60 }),
  );
  const ehCp = (id: string) => id.startsWith('cp');
  const neuroMed = (id: string, prod = 20, p: Partial<MedicoDisponivel> = {}) =>
    medico(id, { capacidade: prod, produtividade: prod, ...p });
  const contaCp = (r: Resultado, m: string, sim = true) =>
    de(r, m).filter((d) => ehCp(d.exameId) === sim).length;

  it('teto de 7 por médico; a sobra espera o próximo envio com o motivo', () => {
    const r = rodar({
      exames: [...cp, ...gerais],
      medicos: [
        neuroMed('A'),
        neuroMed('B'),
        neuroMed('C', 20, { elegivelPara: (id) => !ehCp(id) }),
      ],
      regras: neuro(segCp()),
      nomes: { [CP]: 'CABEÇA E PESCOÇO' },
    });
    expect([contaCp(r, 'A'), contaCp(r, 'B'), contaCp(r, 'C')]).toEqual([7, 7, 0]);
    expect([contaCp(r, 'A', false), contaCp(r, 'B', false), contaCp(r, 'C', false)]).toEqual([
      13, 13, 20,
    ]);
    const sobra = r.naoDistribuidos.filter((n) => ehCp(n.exameId));
    expect(sobra).toHaveLength(16);
    expect(sobra[0]?.motivo).toBe('teto_do_segmento');
    expect(sobra[0]?.detalhe).toMatch(/máximo de CABEÇA E PESCOÇO/);
  });

  it('faixa reduzida pela produtividade cheia, não pela capacidade', () => {
    const r = rodar({
      exames: [...cp, ...gerais],
      medicos: [neuroMed('A'), neuroMed('D', 15), neuroMed('E', 20, { capacidade: 11 })],
      regras: neuro(segCp()),
    });
    expect([contaCp(r, 'A'), contaCp(r, 'D'), contaCp(r, 'E')]).toEqual([7, 4, 7]);
  });

  it('sem teto no segmento, nada muda', () => {
    const r = rodar({
      exames: [...cp, ...gerais],
      medicos: [neuroMed('A'), neuroMed('B')],
      regras: neuro(null),
    });
    expect(r.designacoes.filter((d) => ehCp(d.exameId))).toHaveLength(30);
  });

  it('piso: cada médico do segmento recebe o piso logo depois das urgências', () => {
    const cpTarde = cp.slice(0, 20).map((e) => ({ ...e, restanteMin: 600 }));
    const urg = Array.from({ length: 6 }, (_, i) =>
      exame({
        id: `u${i}`,
        especialidadeId: NEURO,
        modalidadeId: CT,
        restanteMin: 60,
        urgente: true,
      }),
    );
    const medicos = [neuroMed('A'), neuroMed('B'), neuroMed('D', 15)];
    const r = rodar({
      exames: [...gerais, ...cpTarde, ...urg],
      medicos,
      regras: neuro(segCp({ piso: 5 })),
    });
    expect([contaCp(r, 'A'), contaCp(r, 'B'), contaCp(r, 'D')]).toEqual([5, 5, 4]);
    expect(r.designacoes.filter((d) => d.exameId.startsWith('u'))).toHaveLength(6);
    const semPiso = rodar({
      exames: [...gerais, ...cpTarde, ...urg],
      medicos,
      regras: neuro(segCp()),
    });
    expect(semPiso.designacoes.filter((d) => ehCp(d.exameId))).toHaveLength(0);
  });

  it('quem só tem o segmento a laudar não tem o teto dele', () => {
    const r = rodar({
      exames: [...cp, ...gerais],
      medicos: [neuroMed('S', 20, { elegivelPara: ehCp, segmentoUnico: CP }), neuroMed('A')],
      regras: neuro(segCp()),
    });
    expect(contaCp(r, 'S')).toBe(20);
    expect(contaCp(r, 'A')).toBe(7);
  });
});

describe('pacote, aderência e rodízios', () => {
  it('dois exames do mesmo paciente e especialidade ficam com um médico só', () => {
    const r = rodar({
      exames: [
        exame({ id: 'torax', paciente: 'JOSE', restanteMin: 30 }),
        exame({ id: 'outro', restanteMin: 40 }),
        exame({ id: 'abdome', paciente: 'JOSE', restanteMin: 50 }),
      ],
      medicos: [medico('A', { capacidade: null }), medico('B', { capacidade: null })],
    });
    const dono = (id: string) => r.designacoes.find((d) => d.exameId === id)?.medicoId;
    expect(dono('torax')).toBeDefined();
    expect(dono('torax')).toBe(dono('abdome'));
    expect(r.designacoes.find((d) => d.exameId === 'torax')?.agrupadoCom).toBe('JOSE');
  });

  it('segmento à parte (COLUNAS de MSK): a coluna vai para um, os joelhos juntos para outro', () => {
    const regras = new RegrasPorFrente([
      frenteEsp(MSK, {
        segmentos: [
          {
            subespecialidadeId: COLUNAS,
            teto: null,
            tetoReduzido: null,
            piso: null,
            pacoteAParte: true,
          },
        ],
      }),
    ]);
    const fila = [
      exame({ id: 'coluna', paciente: 'F', restanteMin: -370, subespecialidadeId: COLUNAS }),
      exame({ id: 'joelhoD', paciente: 'F', restanteMin: -370 }),
      exame({ id: 'joelhoE', paciente: 'F', restanteMin: -370 }),
      exame({ id: 'avulso', paciente: 'O', restanteMin: 6 }),
    ];
    const r = rodar({
      exames: fila,
      regras,
      medicos: [
        medico('MSK', { capacidade: 2, elegivelPara: (id) => id !== 'coluna' }),
        medico('COL', { capacidade: 5, elegivelPara: (id) => id === 'coluna' }),
      ],
    });
    const dono = new Map(r.designacoes.map((d) => [d.exameId, d.medicoId]));
    expect([dono.get('joelhoD'), dono.get('joelhoE'), dono.get('coluna')]).toEqual([
      'MSK',
      'MSK',
      'COL',
    ]);
    expect(r.naoDistribuidos.find((n) => n.exameId === 'avulso')?.motivo).toBe('sem_espaco');
  });

  it('fora do segmento à parte o pacote não se divide: ninguém pega os dois, ninguém pega nenhum', () => {
    const r = rodar({
      exames: [exame({ id: 'joelho', paciente: 'P2' }), exame({ id: 'bacia', paciente: 'P2' })],
      medicos: [
        medico('J', { elegivelPara: (id) => id === 'joelho' }),
        medico('B', { elegivelPara: (id) => id === 'bacia' }),
      ],
    });
    expect(r.naoDistribuidos.map((n) => n.motivo)).toEqual([
      'sem_medico_elegivel',
      'sem_medico_elegivel',
    ]);
  });

  it('o pacote maior do mesmo prazo entra antes dos avulsos', () => {
    const avulsos = ['A', 'B', 'C'].map((p) => exame({ paciente: p, restanteMin: 170 }));
    const pacote = Array.from({ length: 4 }, () => exame({ paciente: 'PACOTE', restanteMin: 170 }));
    const r = rodar({
      exames: [...avulsos, ...pacote, exame({ paciente: 'LONGO', restanteMin: 2000 })],
      medicos: [medico('M', { capacidade: 4 })],
    });
    expect(r.designacoes.map((d) => d.agrupadoCom)).toEqual([
      'PACOTE',
      'PACOTE',
      'PACOTE',
      'PACOTE',
    ]);
  });

  it('aderência: o exame vai para quem já tem o paciente, por cima do teto', () => {
    const r = rodar({
      exames: [exame({ medicoAderente: 'B' })],
      medicos: [medico('A'), medico('B', { cargaInicial: 10 })],
    });
    expect(de(r, 'B')).toHaveLength(1);
    expect(r.trilha.aderencia).toBe(1);
  });

  it('urgências em rodízio: quem entra mais vazio não leva todas', () => {
    const r = rodar({
      exames: [1, 2, 3, 4].map((i) => exame({ urgente: true, restanteMin: i })),
      medicos: [
        medico('vazio', { capacidade: null }),
        medico('cheio', { capacidade: null, cargaInicial: 4 }),
      ],
    });
    expect([de(r, 'vazio').length, de(r, 'cheio').length]).toEqual([2, 2]);
  });

  it('marcador de equilíbrio (ONCO) em rodízio próprio', () => {
    const r = rodar({
      exames: varios(4, { marcador: 'ONCO' }),
      medicos: [
        medico('A', { capacidade: 100 }),
        medico('B', { capacidade: 100, cargaInicial: 10 }),
      ],
    });
    expect([de(r, 'A').length, de(r, 'B').length]).toEqual([2, 2]);
  });
});

describe('urgências maiores primeiro, protegendo o prazo', () => {
  const so = (lista: string[]) => (id: string) => lista.includes(id);
  const todos = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6a', 'p6b', 'p6c'];
  const msk: Partial<EntradaMotor> = {
    exames: [
      exame({ id: 'p1', urgente: true, restanteMin: 1 }),
      exame({ id: 'p2', urgente: true, restanteMin: 2 }),
      exame({ id: 'p3', urgente: true, restanteMin: 3 }),
      exame({ id: 'p4', urgente: true, restanteMin: 4 }),
      exame({ id: 'p5', urgente: true, restanteMin: 5 }),
      ...['p6a', 'p6b', 'p6c'].map((id) =>
        exame({ id, urgente: true, restanteMin: 6, paciente: 'SEIS' }),
      ),
    ],
    medicos: [
      medico('Jan', {
        capacidade: null,
        cargaInicial: 5,
        elegivelPara: so(todos.filter((i) => i !== 'p1' && i !== 'p3')),
      }),
      medico('Jadiel', {
        capacidade: null,
        cargaInicial: 8,
        elegivelPara: so(todos.filter((i) => i !== 'p2')),
      }),
      medico('Renan', {
        capacidade: 9,
        cargaInicial: 7,
        elegivelPara: so(['p4', 'p5', 'p6a', 'p6b', 'p6c']),
      }),
    ],
    config: { ...CONFIG, margemUrgenciaPct: 10 },
  };
  const divisao = (r: Resultado) =>
    ['Jan', 'Jadiel', 'Renan'].map((m) => de(r, m).length).join('/');
  const entrada = (p: Partial<EntradaMotor>): EntradaMotor => ({
    agora,
    exames: [],
    medicos: [],
    config: CONFIG,
    regras: new RegrasPorFrente([]),
    ...p,
  });

  it('o pacote de 3 urgências entra antes e a divisão fica 4/2/2 (01/10 16:21)', () => {
    expect(divisao(distribuirNaOrdem(entrada(msk), 'prazo'))).toBe('5/2/1');
    expect(divisao(distribuir(entrada(msk)))).toBe('4/2/2');
  });

  it('se o maior primeiro deixar de fora urgência que o prazo poria, vale o prazo', () => {
    const escassa = entrada({
      exames: [
        exame({ id: 'antes', urgente: true, restanteMin: 10 }),
        ...['g1', 'g2', 'g3'].map((id) =>
          exame({ id, urgente: true, restanteMin: 90, paciente: 'GRANDE' }),
        ),
      ],
      medicos: [medico('Unico', { capacidade: 3 })],
    });
    expect(
      distribuirNaOrdem(escassa, 'maiores_primeiro').naoDistribuidos.some(
        (n) => n.exameId === 'antes',
      ),
    ).toBe(true);
    expect(distribuir(escassa).designacoes.some((d) => d.exameId === 'antes')).toBe(true);
  });
});

describe('prioridade do cliente no motor', () => {
  const vip = (especialidadeId: string): PrioridadeCliente[] => [
    {
      clienteId: 'VIP',
      frente: { tipo: 'especialidade', especialidadeId, modalidadeId: null },
      nivel: 1,
    },
  ];
  const exames = [
    exame({ id: 'nAtr', clienteId: 'N', restanteMin: -200, especialidadeId: MI }),
    exame({ id: 'vAtr', clienteId: 'VIP', restanteMin: -10, especialidadeId: MI }),
    exame({ id: 'nAtr2', clienteId: 'N', restanteMin: -100, especialidadeId: MI }),
  ];
  const r = (prioridadesCliente?: PrioridadeCliente[]) =>
    ids(rodar({ exames, medicos: [medico('M', { capacidade: 2 })], prioridadesCliente })).sort();

  it('a vaga vai pelo nível dentro da faixa, só no recorte', () => {
    expect(r(vip(MI))).toEqual(['nAtr', 'vAtr']);
    expect(r()).toEqual(['nAtr', 'nAtr2']);
    expect(r(vip(MSK))).toEqual(['nAtr', 'nAtr2']);
  });

  it('a urgência maior de outro não passa na frente da urgência do VIP', () => {
    const res = rodar({
      exames: [
        exame({
          id: 'n1',
          clienteId: 'N',
          urgente: true,
          restanteMin: 100,
          paciente: 'PN',
          especialidadeId: MI,
        }),
        exame({
          id: 'n2',
          clienteId: 'N',
          urgente: true,
          restanteMin: 100,
          paciente: 'PN',
          especialidadeId: MI,
        }),
        exame({
          id: 'v1',
          clienteId: 'VIP',
          urgente: true,
          restanteMin: 300,
          paciente: 'PV',
          especialidadeId: MI,
        }),
      ],
      medicos: [medico('M', { capacidade: 2 })],
      prioridadesCliente: vip(MI),
    });
    expect(ids(res)).toContain('v1');
  });
});

describe('o que o robô não distribui', () => {
  const ct = new RegrasPorFrente([
    {
      ...REGRAS_NEUTRAS,
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: CT },
      horariosSemRobo: [{ diasSemana: [], inicio: '19:00', fim: '07:00' }],
    },
  ]);
  const madrugada = new Date('2026-10-16T09:42:00Z'); // 06:42 em Brasília

  it('no horário sem robô o exame só fica para a mão quando ninguém além do plantão o pegaria', () => {
    const tc = [exame({ id: 'TC', modalidadeId: CT, especialidadeId: 'cardio' })];
    expect(
      rodar({ agora: madrugada, regras: ct, exames: tc, medicos: [medico('A')] }).designacoes,
    ).toHaveLength(1);
    const r = rodar({
      agora: madrugada,
      regras: ct,
      exames: tc,
      medicos: [medico('A', { elegivelPara: () => false })],
    });
    expect(r.naoDistribuidos[0]?.motivo).toBe('horario_sem_robo');
    expect(r.naoDistribuidos[0]?.detalhe).toContain('19:00–07:00');
  });

  it('frente que não distribui pelo robô fica toda para a mão', () => {
    const r = rodar({
      regras: new RegrasPorFrente([frenteEsp(MSK, { distribuiPeloRobo: false })]),
      exames: varios(2),
      medicos: [medico('A')],
    });
    expect(r.naoDistribuidos.map((n) => n.motivo)).toEqual(['frente_manual', 'frente_manual']);
  });

  it('os totais fecham', () => {
    const r = rodar({ exames: varios(5), medicos: [medico('A', { capacidade: 3 })] });
    expect(r.totais).toEqual({ exames: 5, laudos: 5, distribuidos: 3, emAberto: 2 });
    expect(r.cargaPorMedico).toEqual([{ medicoId: 'A', laudos: 3, exames: 3 }]);
  });
});

// Usado nos casos de mistura e adiados (próximo bloco).
void [CP, CT, MR];
