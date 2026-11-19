import { z } from 'zod';
import type { CelulaRecebimentoDto } from '../../gen/types/CelulaRecebimentoDto';
import type { ConfiguracaoDistribuicaoDto } from '../../gen/types/ConfiguracaoDistribuicaoDto';
import type { ItemOrdemFilaDto } from '../../gen/types/ItemOrdemFilaDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { errosDaGrade, type Grade, gradeDasCelulas } from './recebimento';
import type { GrupoResumo } from './regras-frente-form';

type Criterio = ItemOrdemFilaDto['criterio'];
type Direcao = ItemOrdemFilaDto['direcao'];

/** Os critérios da fila e o que cada direção quer dizer para quem opera. */
export const CRITERIOS_FILA: Record<
  Criterio,
  { rotulo: string; direcoes: Record<Direcao, string> }
> = {
  prioridade: {
    rotulo: 'Posição da prioridade',
    direcoes: { desc: 'posição 1 primeiro', asc: 'posição 1 por último' },
  },
  prazo: {
    rotulo: 'Prazo',
    direcoes: { asc: 'vence antes primeiro', desc: 'vence depois primeiro' },
  },
  antiguidade: {
    rotulo: 'Chegada',
    direcoes: { asc: 'mais antigo primeiro', desc: 'mais novo primeiro' },
  },
};
export const ORDEM_CRITERIOS: Criterio[] = ['prioridade', 'prazo', 'antiguidade'];
/** A direção que se espera ao acrescentar o critério. */
export const DIRECAO_PADRAO: Record<Criterio, Direcao> = {
  prioridade: 'desc',
  prazo: 'asc',
  antiguidade: 'asc',
};

/** Números como texto (o `NumberField` do kit guarda texto). */
export type ValoresConfiguracao = {
  ordemFila: { criterio: Criterio; direcao: Direcao }[];
  prazoCriticoMin: string;
  agruparPorPaciente: boolean;
  janelaPacienteHoras: string;
  toleranciaAcimaTeto: string;
  margemUrgenciaPct: string;
  folgaProporcaoPct: string;
  cicloMinutos: string;
  antecedenciaPeriodoMin: string;
  temTurnosPosteriores: boolean;
  turnoIds: string[];
  cheiaEm: string;
  recolhe: boolean;
  recolhimentoAposTurnoMin: string;
  recolhimentoAposListaMin: string;
  diasJaEntregue: string;
  escalaRestringeEspecialidade: boolean;
  /** Separados por vírgula. */
  marcadores: string;
  /** A grade geral de recebimento (salva junto, no mesmo botão). */
  recebimento: Grade;
  roboAtivo: boolean;
  expiracaoPropostaMin: string;
  temTeto: boolean;
  tetoPorRodada: string;
  /** Leitura automática da fila do momento ligada. */
  lerFila: boolean;
  retratoFilaMin: string;
};

export function valoresDaConfiguracao(
  c: ConfiguracaoDistribuicaoDto,
  celulas: readonly CelulaRecebimentoDto[] = [],
): ValoresConfiguracao {
  return {
    ordemFila: c.ordemFila.map((i) => ({ criterio: i.criterio, direcao: i.direcao })),
    prazoCriticoMin: String(c.prazoCriticoMin),
    agruparPorPaciente: c.agruparPorPaciente,
    janelaPacienteHoras: String(c.janelaPacienteHoras),
    toleranciaAcimaTeto: String(c.toleranciaAcimaTeto),
    margemUrgenciaPct: String(c.margemUrgenciaPct),
    folgaProporcaoPct: String(c.folgaProporcaoPct),
    cicloMinutos: String(c.cicloMinutos),
    antecedenciaPeriodoMin: String(c.antecedenciaPeriodoMin),
    temTurnosPosteriores: c.turnosPosteriores !== null,
    turnoIds: c.turnosPosteriores?.turnoIds ?? [],
    cheiaEm: c.turnosPosteriores?.cheiaEm ?? '',
    recolhe: c.recolhimentoAposTurnoMin !== null,
    recolhimentoAposTurnoMin:
      c.recolhimentoAposTurnoMin === null ? '' : String(c.recolhimentoAposTurnoMin),
    recolhimentoAposListaMin: String(c.recolhimentoAposListaMin ?? 1440),
    diasJaEntregue: String(c.diasJaEntregue),
    escalaRestringeEspecialidade: c.escalaRestringeEspecialidade,
    marcadores: c.marcadoresEquilibrio.join(', '),
    recebimento: gradeDasCelulas(celulas),
    roboAtivo: c.roboAtivo ?? true,
    expiracaoPropostaMin: String(c.expiracaoPropostaMin ?? 45),
    temTeto: c.tetoPorRodada != null,
    tetoPorRodada: c.tetoPorRodada == null ? '' : String(c.tetoPorRodada),
    lerFila: c.retratoFilaMin !== null,
    // Desligada, religar sugere os 5 min de padrão.
    retratoFilaMin: String(c.retratoFilaMin ?? 5),
  };
}

const marcadoresDe = (texto: string) =>
  texto
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

const hora = (t: string) => {
  const limpo = t.trim();
  return limpo.length === 4 ? `0${limpo}` : limpo;
};

export function configuracaoParaApi(v: ValoresConfiguracao): ConfiguracaoDistribuicaoDto {
  return {
    ordemFila: v.ordemFila,
    agruparPorPaciente: v.agruparPorPaciente,
    janelaPacienteHoras: Number(v.janelaPacienteHoras),
    toleranciaAcimaTeto: Number(v.toleranciaAcimaTeto),
    margemUrgenciaPct: Number(v.margemUrgenciaPct),
    folgaProporcaoPct: Number(v.folgaProporcaoPct),
    prazoCriticoMin: Number(v.prazoCriticoMin),
    antecedenciaPeriodoMin: Number(v.antecedenciaPeriodoMin),
    cicloMinutos: Number(v.cicloMinutos),
    marcadoresEquilibrio: marcadoresDe(v.marcadores),
    escalaRestringeEspecialidade: v.escalaRestringeEspecialidade,
    diasJaEntregue: Number(v.diasJaEntregue),
    turnosPosteriores: v.temTurnosPosteriores
      ? { turnoIds: v.turnoIds, cheiaEm: hora(v.cheiaEm) }
      : null,
    recolhimentoAposTurnoMin: v.recolhe ? Number(v.recolhimentoAposTurnoMin) : null,
    recolhimentoAposListaMin: Number(v.recolhimentoAposListaMin),
    roboAtivo: v.roboAtivo,
    expiracaoPropostaMin: Number(v.expiracaoPropostaMin),
    tetoPorRodada: v.temTeto ? Number(v.tetoPorRodada) : null,
    retratoFilaMin: v.lerFila ? Number(v.retratoFilaMin) : null,
  };
}

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

const valoresSchema = z.object({
  ordemFila: z.array(
    z.object({
      criterio: z.enum(['prioridade', 'prazo', 'antiguidade']),
      direcao: z.enum(['asc', 'desc']),
    }),
  ),
  prazoCriticoMin: z.string(),
  agruparPorPaciente: z.boolean(),
  janelaPacienteHoras: z.string(),
  toleranciaAcimaTeto: z.string(),
  margemUrgenciaPct: z.string(),
  folgaProporcaoPct: z.string(),
  cicloMinutos: z.string(),
  antecedenciaPeriodoMin: z.string(),
  temTurnosPosteriores: z.boolean(),
  turnoIds: z.array(z.string()),
  cheiaEm: z.string(),
  recolhe: z.boolean(),
  recolhimentoAposTurnoMin: z.string(),
  recolhimentoAposListaMin: z.string(),
  diasJaEntregue: z.string(),
  escalaRestringeEspecialidade: z.boolean(),
  marcadores: z.string(),
  recebimento: z.record(
    z.string(),
    z.object({
      tipo: z.enum(['geral', 'segue_sla', 'prazo_minimo', 'nao_recebe']),
      horas: z.string(),
    }),
  ),
  roboAtivo: z.boolean(),
  expiracaoPropostaMin: z.string(),
  temTeto: z.boolean(),
  tetoPorRodada: z.string(),
  lerFila: z.boolean(),
  retratoFilaMin: z.string(),
});

/** As faixas do domínio (`configuracao-global.ts` da API), na ordem dos campos. */
const FAIXAS: [keyof ValoresConfiguracao, number, number][] = [
  ['prazoCriticoMin', 0, 1440],
  ['janelaPacienteHoras', 0, 720],
  ['toleranciaAcimaTeto', 0, 100],
  ['margemUrgenciaPct', 0, 100],
  ['folgaProporcaoPct', 0, 100],
];

export const esquemaConfiguracao = valoresSchema.superRefine((v, ctx) => {
  const erro = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  const faixa = (campo: keyof ValoresConfiguracao, min: number, max: number) => {
    const t = String(v[campo]).trim();
    if (!/^\d+$/.test(t) || Number(t) < min || Number(t) > max) {
      erro(campo, `Use um número inteiro de ${min} a ${max}.`);
    }
  };

  faixa('expiracaoPropostaMin', 1, 1440);
  if (v.temTeto) faixa('tetoPorRodada', 1, 100_000);
  if (v.lerFila) faixa('retratoFilaMin', 1, 1440);
  if (v.ordemFila.length === 0) erro('ordemFila', 'A fila precisa de ao menos um critério.');
  for (const [campo, min, max] of FAIXAS) faixa(campo, min, max);
  faixa('cicloMinutos', 1, 1440);
  faixa('antecedenciaPeriodoMin', 0, 1440);
  if (v.temTurnosPosteriores) {
    if (v.turnoIds.length === 0) {
      erro('turnoIds', 'Escolha ao menos um turno, ou desmarque os turnos posteriores.');
    }
    if (!HORA.test(v.cheiaEm.trim())) erro('cheiaEm', 'Use HH:MM, como 10:50.');
  }
  if (v.recolhe) {
    faixa('recolhimentoAposTurnoMin', 0, 1440);
    faixa('recolhimentoAposListaMin', 0, 10_080);
  }
  faixa('diasJaEntregue', 0, 90);
  const marcadores = marcadoresDe(v.marcadores).map((m) => m.toUpperCase());
  if (marcadores.some((m) => m.length > 40)) erro('marcadores', 'Use até 40 letras por marcador.');
  if (new Set(marcadores).size !== marcadores.length) erro('marcadores', 'Há marcador repetido.');
  if (Object.keys(errosDaGrade(v.recebimento)).length) {
    erro('recebimento', 'Informe as horas do prazo mínimo (1 a 720) nas células marcadas.');
  }
});

// --- Resumo (quem só pode ver) ---

const nomes = (lista: readonly RotuloDto[], ids: readonly string[]) =>
  ids.map((id) => lista.find((x) => x.id === id)?.nome ?? '(fora do catálogo)').join(', ');

export function resumoConfiguracao(
  c: ConfiguracaoDistribuicaoDto,
  ref: { turnos: RotuloDto[] },
): GrupoResumo[] {
  const minutos = (n: number) => `${n} min`;
  return [
    {
      titulo: 'Robô',
      linhas: [
        { rotulo: 'Robô', valor: (c.roboAtivo ?? true) ? 'Ligado' : 'Desligado' },
        { rotulo: 'Validade da proposta', valor: minutos(c.expiracaoPropostaMin ?? 45) },
        {
          rotulo: 'Teto de exames por rodada',
          valor: c.tetoPorRodada == null ? 'Sem teto' : `${c.tetoPorRodada} exames`,
        },
        {
          rotulo: 'Leitura da fila do momento',
          valor:
            c.retratoFilaMin == null ? 'Só pelo "Ler agora"' : `A cada ${c.retratoFilaMin} min`,
        },
      ],
    },
    {
      titulo: 'Fila',
      linhas: [
        {
          rotulo: 'Ordem da fila',
          valor: c.ordemFila
            .map((i, n) => {
              const info = CRITERIOS_FILA[i.criterio];
              return `${n + 1}. ${info.rotulo}: ${info.direcoes[i.direcao]}`;
            })
            .join('; '),
        },
        { rotulo: 'Prazo crítico', valor: minutos(c.prazoCriticoMin) },
        {
          rotulo: 'Pacote do paciente',
          valor: c.agruparPorPaciente
            ? c.janelaPacienteHoras === 0
              ? 'Exames do mesmo paciente vão juntos, sem limite de tempo'
              : `Exames do mesmo paciente vão juntos, até ${c.janelaPacienteHoras} h de distância`
            : 'Cada exame vai sozinho',
        },
      ],
    },
    {
      titulo: 'Capacidade',
      linhas: [
        { rotulo: 'Folga acima do teto', valor: `${c.toleranciaAcimaTeto} exames` },
        { rotulo: 'Margem de urgência acima do teto', valor: `${c.margemUrgenciaPct}%` },
        {
          rotulo: 'Folga da proporção para exame atrasado ou vencendo',
          valor: `${c.folgaProporcaoPct} pontos %`,
        },
      ],
    },
    {
      titulo: 'Rodada',
      linhas: [
        { rotulo: 'Intervalo entre rodadas', valor: minutos(c.cicloMinutos) },
        { rotulo: 'Antecedência do turno', valor: minutos(c.antecedenciaPeriodoMin) },
        {
          rotulo: 'Turnos posteriores',
          valor: c.turnosPosteriores
            ? `${nomes(ref.turnos, c.turnosPosteriores.turnoIds)}, cheios na rodada das ${c.turnosPosteriores.cheiaEm}`
            : 'Nenhum',
        },
        {
          rotulo: 'Recolhimento',
          valor:
            c.recolhimentoAposTurnoMin === null
              ? 'Desligado'
              : `${c.recolhimentoAposTurnoMin} min depois do fim do turno; ${c.recolhimentoAposListaMin} min depois do fim da Lista`,
        },
        { rotulo: 'Não volta ao mesmo médico por', valor: `${c.diasJaEntregue} dias` },
        {
          rotulo: 'Frente da escala',
          valor: c.escalaRestringeEspecialidade
            ? 'O médico só recebe da frente em que está escalado'
            : 'A frente da escala não limita',
        },
      ],
    },
    {
      titulo: 'Equilíbrio',
      linhas: [
        {
          rotulo: 'Marcadores no nome do exame',
          valor: c.marcadoresEquilibrio.length ? c.marcadoresEquilibrio.join(', ') : 'Nenhum',
        },
      ],
    },
  ];
}
