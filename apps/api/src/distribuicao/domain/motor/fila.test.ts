import { describe, expect, it } from 'vitest';

import { type ConfiguracaoDistribuicao, REGRAS_NEUTRAS, RegrasPorFrente } from './configuracao';
import {
  agruparPorPaciente,
  chavePacote,
  criarNivelDoExame,
  type ExameMotor,
  montarFila,
  type PrioridadeCliente,
  recortarClinicas,
  recortarPrioridades,
} from './fila';

const MI = 'esp-mi';
const MSK = 'esp-msk';
const NEURO = 'esp-neuro';
const CT = 'mod-ct';
const MG = 'mod-mg';
const COLUNAS = 'seg-colunas';

const CONFIG: ConfiguracaoDistribuicao = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 0,
  folgaProporcaoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: [],
  escalaRestringeEspecialidade: false,
  diasJaEntregue: 7,
  turnosPosteriores: null,
};
const SEM_REGRAS = new RegrasPorFrente([]);
const MSK_COLUNAS_A_PARTE = new RegrasPorFrente([
  {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'especialidade', especialidadeId: MSK, modalidadeId: null },
    segmentos: [
      {
        subespecialidadeId: COLUNAS,
        teto: null,
        tetoReduzido: null,
        piso: null,
        pacoteAParte: true,
      },
    ],
  },
]);

const agora = new Date('2026-11-03T10:00:00Z');
let seq = 0;
const exame = (id: string, p: Partial<ExameMotor> = {}): ExameMotor => ({
  id,
  laudos: 1,
  especialidadeId: MI,
  modalidadeId: CT,
  subespecialidadeId: null,
  clienteId: null,
  posicao: 3,
  urgente: false,
  paciente: id,
  restanteMin: 600,
  entradaEm: new Date(agora.getTime() - (1000 - ++seq) * 60_000),
  marcador: null,
  medicoAderente: null,
  ...p,
});
const vip = (clienteId: string, especialidadeId: string, nivel: number): PrioridadeCliente => ({
  clienteId,
  frente: { tipo: 'especialidade', especialidadeId, modalidadeId: null },
  nivel,
});
const ordem = (exames: ExameMotor[], prioridades?: PrioridadeCliente[]) =>
  montarFila(exames, CONFIG, criarNivelDoExame(prioridades)).map((e) => e.id);
const grupos = (exames: ExameMotor[], prioridades?: PrioridadeCliente[], regras = SEM_REGRAS) => {
  const nivel = criarNivelDoExame(prioridades);
  return agruparPorPaciente(montarFila(exames, CONFIG, nivel), CONFIG, regras, nivel).map(
    (g) => `${g.paciente}:${g.exames.length}`,
  );
};

describe('montarFila', () => {
  it('a posição da prioridade da operação ordena; no empate, o prazo', () => {
    expect(
      ordem([
        exame('rotina', { restanteMin: 10 }),
        exame('internado', { posicao: 3, restanteMin: 5 }),
        exame('ambulatorio', { posicao: 2, restanteMin: 900 }),
        exame('urgencia', { posicao: 1, urgente: true, restanteMin: 500 }),
      ]),
    ).toEqual(['urgencia', 'ambulatorio', 'internado', 'rotina']);
  });

  it('urgência sobe, mesmo com prazo mais longo', () => {
    expect(
      ordem([
        exame('rotina', { restanteMin: 10 }),
        exame('urg', { posicao: 1, urgente: true, restanteMin: 500 }),
      ])[0],
    ).toBe('urg');
  });

  it('prioridade do cliente: dentro de cada faixa Alta primeiro; com folga não passa o atrasado', () => {
    const exames = [
      exame('normalAtrasado', { clienteId: 'N', restanteMin: -300 }),
      exame('vipAtrasado', { clienteId: 'VIP', restanteMin: -10 }),
      exame('normalNoPrazo', { clienteId: 'N', restanteMin: 120 }),
      exame('vipNoPrazo', { clienteId: 'VIP', restanteMin: 300 }),
    ];
    expect(ordem(exames, [vip('VIP', MI, 1)])).toEqual([
      'vipAtrasado',
      'normalAtrasado',
      'vipNoPrazo',
      'normalNoPrazo',
    ]);
    expect(ordem(exames)).toEqual(['normalAtrasado', 'vipAtrasado', 'normalNoPrazo', 'vipNoPrazo']);
    expect(ordem(exames, [])).toEqual([
      'normalAtrasado',
      'vipAtrasado',
      'normalNoPrazo',
      'vipNoPrazo',
    ]);
  });

  it('urgência do VIP antes da do normal; urgência de qualquer um antes da rotina do VIP', () => {
    const exames = [
      exame('vipRotina', { clienteId: 'VIP', restanteMin: -100 }),
      exame('normalUrg', { clienteId: 'N', restanteMin: 30, posicao: 1, urgente: true }),
      exame('vipUrg', { clienteId: 'VIP', restanteMin: 200, posicao: 1, urgente: true }),
    ];
    expect(ordem(exames, [vip('VIP', MI, 1)])).toEqual(['vipUrg', 'normalUrg', 'vipRotina']);
  });

  it('só no recorte: o VIP da MI é normal no MSK', () => {
    const exames = [
      exame('vipMsk', { clienteId: 'VIP', restanteMin: 300, especialidadeId: MSK }),
      exame('normalMsk', { clienteId: 'N', restanteMin: 120, especialidadeId: MSK }),
    ];
    expect(ordem(exames, [vip('VIP', MI, 1)])).toEqual(['normalMsk', 'vipMsk']);
  });

  it('várias clínicas e níveis por recorte; mesmo nível desempata pelo prazo', () => {
    const p = [
      vip('A', MI, 1),
      vip('B', MI, 1),
      vip('C', MI, 2),
      vip('D', MSK, 1),
      vip('E', MSK, 2),
    ];
    const mi = [
      exame('miN', { clienteId: 'N', restanteMin: 100 }),
      exame('miC', { clienteId: 'C', restanteMin: 400 }),
      exame('miB', { clienteId: 'B', restanteMin: 300 }),
      exame('miA', { clienteId: 'A', restanteMin: 500 }),
      exame('miD', { clienteId: 'D', restanteMin: 150 }),
    ];
    expect(ordem(mi, p)).toEqual(['miB', 'miA', 'miC', 'miN', 'miD']);
    const msk = [
      exame('mskN', { clienteId: 'N', restanteMin: 100, especialidadeId: MSK }),
      exame('mskE', { clienteId: 'E', restanteMin: 300, especialidadeId: MSK }),
      exame('mskD', { clienteId: 'D', restanteMin: 500, especialidadeId: MSK }),
      exame('mskA', { clienteId: 'A', restanteMin: 90, especialidadeId: MSK }),
    ];
    expect(ordem(msk, p)).toEqual(['mskD', 'mskE', 'mskA', 'mskN']);
  });

  it('recorte de modalidade casa pela modalidade do exame', () => {
    const p: PrioridadeCliente[] = [
      {
        clienteId: 'VIP',
        frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: MG },
        nivel: 1,
      },
    ];
    const exames = [
      exame('normalMg', {
        clienteId: 'N',
        restanteMin: 100,
        modalidadeId: MG,
        especialidadeId: 'mama',
      }),
      exame('vipMg', {
        clienteId: 'VIP',
        restanteMin: 400,
        modalidadeId: MG,
        especialidadeId: 'mama',
      }),
    ];
    expect(ordem(exames, p)).toEqual(['vipMg', 'normalMg']);
  });
});

describe('agruparPorPaciente', () => {
  const doPaciente = (paciente: string, restanteMin: number, p: Partial<ExameMotor> = {}) =>
    exame(`${paciente}-${seq}`, { paciente, restanteMin, especialidadeId: MSK, ...p });

  it('mesmo prazo: o pacote maior passa à frente dos avulsos que chegaram antes', () => {
    const fila = [
      doPaciente('A', 170),
      doPaciente('B', 170),
      doPaciente('C', 170),
      ...[1, 2, 3, 4].map(() => doPaciente('PACOTE', 170)),
    ];
    expect(grupos(fila)).toEqual(['PACOTE:4', 'A:1', 'B:1', 'C:1']);
  });

  it('prazo diferente: o avulso mais curto continua na frente; a urgência segue acima', () => {
    expect(
      grupos([doPaciente('CURTO', 60), ...[1, 2, 3].map(() => doPaciente('P3', 170))]),
    ).toEqual(['CURTO:1', 'P3:3']);
    expect(
      grupos([
        doPaciente('U', 170, { posicao: 1, urgente: true }),
        ...[1, 2].map(() => doPaciente('P2', 170)),
      ]),
    ).toEqual(['U:1', 'P2:2']);
  });

  it('pacote maior só no mesmo nível de cliente', () => {
    const fila = [
      exame('v', { clienteId: 'VIP', restanteMin: 200 }),
      exame('n1', { clienteId: 'N', restanteMin: 200, paciente: 'PN' }),
      exame('n2', { clienteId: 'N', restanteMin: 200, paciente: 'PN' }),
    ];
    expect(grupos(fila, [vip('VIP', MI, 1)])).toEqual(['v:1', 'PN:2']);
  });

  it('o pacote é por paciente e especialidade; outra especialidade é outro pacote', () => {
    const fila = [
      exame('t', { paciente: 'ANA', especialidadeId: MI }),
      exame('s', { paciente: 'ANA', especialidadeId: NEURO }),
      exame('a', { paciente: 'ANA', especialidadeId: MI }),
    ];
    expect(grupos(fila).sort()).toEqual(['ANA:1', 'ANA:2']);
  });

  it('sem agrupar, cada exame é um pacote; com janela, exames distantes se separam', () => {
    const fila = [exame('x', { paciente: 'P' }), exame('y', { paciente: 'P' })];
    expect(
      agruparPorPaciente(fila, { ...CONFIG, agruparPorPaciente: false }, SEM_REGRAS, null),
    ).toHaveLength(2);
    const longe = [
      exame('x', { paciente: 'P', entradaEm: new Date('2026-11-01T10:00:00Z') }),
      exame('y', { paciente: 'P', entradaEm: new Date('2026-11-03T10:00:00Z') }),
    ];
    expect(
      agruparPorPaciente(longe, { ...CONFIG, janelaPacienteHoras: 24 }, SEM_REGRAS, null),
    ).toHaveLength(2);
    expect(agruparPorPaciente(longe, CONFIG, SEM_REGRAS, null)).toHaveLength(1);
  });
});

describe('chavePacote', () => {
  it('o segmento "pacote à parte" da frente separa (COLUNAS de MSK); fora dela, não', () => {
    const chave = (especialidadeId: string, subespecialidadeId: string | null) =>
      chavePacote({ paciente: 'ana', especialidadeId, subespecialidadeId }, MSK_COLUNAS_A_PARTE);
    expect(chave(MSK, COLUNAS)).not.toBe(chave(MSK, null));
    expect(chave(NEURO, COLUNAS)).toBe(chave(NEURO, null));
    expect(chave(MSK, 'seg-joelho')).toBe(chave(MSK, null));
  });
});

describe('recortes da rodada', () => {
  it('prioridades: passa o marcado, e o pacote do paciente vai junto', () => {
    const fila = [
      {
        id: '1',
        paciente: 'ANA',
        especialidadeId: NEURO,
        subespecialidadeId: null,
        prioridadeId: 'urg',
      },
      {
        id: '2',
        paciente: 'ANA',
        especialidadeId: NEURO,
        subespecialidadeId: null,
        prioridadeId: 'rot',
      },
      {
        id: '3',
        paciente: 'ANA',
        especialidadeId: MI,
        subespecialidadeId: null,
        prioridadeId: 'rot',
      },
      {
        id: '4',
        paciente: 'BIA',
        especialidadeId: NEURO,
        subespecialidadeId: null,
        prioridadeId: 'rot',
      },
      {
        id: '5',
        paciente: 'CAU',
        especialidadeId: NEURO,
        subespecialidadeId: null,
        prioridadeId: 'plantao',
      },
    ];
    expect([...recortarPrioridades(fila, ['urg', 'plantao'], SEM_REGRAS)].sort()).toEqual([
      '3',
      '4',
    ]);
    expect(recortarPrioridades(fila, [], SEM_REGRAS).size).toBe(0);
  });

  it('clínicas: o exame de outra clínica ou sem cliente fica de fora', () => {
    const fila = [
      { id: '1', clienteId: 'A' },
      { id: '2', clienteId: 'B' },
      { id: '3', clienteId: null },
    ];
    expect([...recortarClinicas(fila, ['A'])].sort()).toEqual(['2', '3']);
    expect(recortarClinicas(fila, []).size).toBe(0);
  });
});
