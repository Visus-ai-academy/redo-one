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
  prioridadeIdsUrgentes: ['p-urg'],
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
  lista: { prioridadeIds: ['p-rot'], prazoMinimoHoras: 24 },
  recolhimentoAposTurnoMin: 60,
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

  it('desligados viram nulo: turnos posteriores, recolhimento e a Lista pelo SLA', () => {
    const v: ValoresConfiguracao = {
      ...valoresDaConfiguracao(PRODUCAO),
      temTurnosPosteriores: false,
      recolhe: false,
      listaPrazo: 'sla',
    };
    const api = configuracaoParaApi(v);
    expect(api.turnosPosteriores).toBeNull();
    expect(api.recolhimentoAposTurnoMin).toBeNull();
    expect(api.lista.prazoMinimoHoras).toBeNull();
  });

  it('marcadores separados por vírgula, aparados e sem vazios', () => {
    const v = { ...valoresDaConfiguracao(PRODUCAO), marcadores: ' ONCO, PED ,, ' };
    expect(configuracaoParaApi(v).marcadoresEquilibrio).toEqual(['ONCO', 'PED']);
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
      prioridades: [
        { id: 'p-urg', nome: 'URGÊNCIA' },
        { id: 'p-rot', nome: 'ROTINA' },
      ],
      turnos: [{ id: 't-tarde', nome: 'Tarde' }],
    });
    const tudo = Object.fromEntries(
      grupos.flatMap((g) => g.linhas.map((l) => [`${g.titulo} › ${l.rotulo}`, l.valor])),
    );
    expect(tudo['Fila › Ordem da fila']).toBe(
      '1. Prioridade: urgente primeiro; 2. Prazo: vence antes primeiro; 3. Chegada: mais antigo primeiro',
    );
    expect(tudo['Fila › Prioridades urgentes']).toBe('URGÊNCIA');
    expect(tudo['Lista padrão › Prazo para entrar na Lista']).toBe(
      'Só com 24 h ou mais até o prazo',
    );
    expect(tudo['Rodada › Turnos posteriores']).toBe('Tarde, cheios na rodada das 10:50');
    expect(tudo['Rodada › Recolhimento']).toBe('60 min depois do fim do turno');
    expect(tudo['Equilíbrio › Marcadores no nome do exame']).toBe('ONCO');
  });
});
