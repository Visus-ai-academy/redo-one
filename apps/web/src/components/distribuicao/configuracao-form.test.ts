import { describe, expect, it } from 'vitest';

import type { ConfiguracaoDistribuicaoDto } from '../../gen/types/ConfiguracaoDistribuicaoDto';
import {
  configuracaoParaApi,
  esquemaConfiguracao,
  resumoConfiguracao,
  type ValoresConfiguracao,
  valoresDaConfiguracao,
} from './configuracao-form';

const PRODUCAO: ConfiguracaoDistribuicaoDto = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 10,
  folgaProporcaoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: ['ONCO'],
  escalaRestringeEspecialidade: true,
  diasJaEntregue: 7,
  turnosPosteriores: { turnoIds: ['t-tarde'], cheiaEm: '10:50' },
  recolhimentoAposTurnoMin: 60,
  roboAtivo: true,
  expiracaoPropostaMin: 45,
  tetoPorRodada: null,
};

const erros = (v: ValoresConfiguracao) => {
  const r = esquemaConfiguracao.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('configuração global no formulário', () => {
  it('ida e volta sem mudar nada', () => {
    const v = valoresDaConfiguracao(PRODUCAO);
    expect(erros(v)).toEqual([]);
    expect(configuracaoParaApi(v)).toEqual(PRODUCAO);
  });

  it('desligados viram nulo: turnos posteriores e recolhimento', () => {
    const v: ValoresConfiguracao = {
      ...valoresDaConfiguracao(PRODUCAO),
      temTurnosPosteriores: false,
      recolhe: false,
    };
    const api = configuracaoParaApi(v);
    expect(api.turnosPosteriores).toBeNull();
    expect(api.recolhimentoAposTurnoMin).toBeNull();
  });

  it('marcadores separados por vírgula, aparados e sem vazios', () => {
    const v = { ...valoresDaConfiguracao(PRODUCAO), marcadores: ' ONCO, PED ,, ' };
    expect(configuracaoParaApi(v).marcadoresEquilibrio).toEqual(['ONCO', 'PED']);
  });

  it('robô: ligado, validade da proposta e teto por rodada (sem teto = nulo)', () => {
    const v = valoresDaConfiguracao({ ...PRODUCAO, roboAtivo: false, tetoPorRodada: 300 });
    expect(v).toMatchObject({
      roboAtivo: false,
      expiracaoPropostaMin: '45',
      temTeto: true,
      tetoPorRodada: '300',
    });
    expect(configuracaoParaApi(v)).toMatchObject({ roboAtivo: false, tetoPorRodada: 300 });
    expect(configuracaoParaApi({ ...v, temTeto: false })).toMatchObject({ tetoPorRodada: null });
    expect(erros({ ...v, expiracaoPropostaMin: '0', tetoPorRodada: '0' })).toEqual([
      'expiracaoPropostaMin: Use um número inteiro de 1 a 1440.',
      'tetoPorRodada: Use um número inteiro de 1 a 100000.',
    ]);
  });

  it('valida faixas, turnos posteriores e marcadores repetidos', () => {
    const v: ValoresConfiguracao = {
      ...valoresDaConfiguracao(PRODUCAO),
      cicloMinutos: '0',
      margemUrgenciaPct: '101',
      turnoIds: [],
      cheiaEm: '1050',
      marcadores: 'ONCO, onco',
      ordemFila: [],
    };
    expect(erros(v)).toEqual([
      'ordemFila: A fila precisa de ao menos um critério.',
      'margemUrgenciaPct: Use um número inteiro de 0 a 100.',
      'cicloMinutos: Use um número inteiro de 1 a 1440.',
      'turnoIds: Escolha ao menos um turno, ou desmarque os turnos posteriores.',
      'cheiaEm: Use HH:MM, como 10:50.',
      'marcadores: Há marcador repetido.',
    ]);
  });
});

describe('resumo da configuração (só leitura)', () => {
  it('descreve cada grupo com os nomes', () => {
    const grupos = resumoConfiguracao(PRODUCAO, {
      turnos: [{ id: 't-tarde', nome: 'Tarde' }],
    });
    const tudo = Object.fromEntries(
      grupos.flatMap((g) => g.linhas.map((l) => [`${g.titulo} › ${l.rotulo}`, l.valor])),
    );
    expect(tudo['Fila › Ordem da fila']).toBe(
      '1. Posição da prioridade: posição 1 primeiro; 2. Prazo: vence antes primeiro; 3. Chegada: mais antigo primeiro',
    );
    expect(Object.keys(tudo).some((k) => k.startsWith('Lista padrão'))).toBe(false);
    expect(tudo['Rodada › Turnos posteriores']).toBe('Tarde, cheios na rodada das 10:50');
    expect(tudo['Rodada › Recolhimento']).toBe('60 min depois do fim do turno');
    expect(tudo['Equilíbrio › Marcadores no nome do exame']).toBe('ONCO');
    expect(tudo['Robô › Robô']).toBe('Ligado');
    expect(tudo['Robô › Validade da proposta']).toBe('45 min');
    expect(tudo['Robô › Teto de exames por rodada']).toBe('Sem teto');
  });
});
