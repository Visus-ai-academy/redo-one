/** Demonstrativo de um médico, dos dois lados, por arranjo ("MOD|ESP|CAT|PRIO" com os nomes do redo-one). */
export interface DemonstrativoParidade {
  medicoId: string;
  medico: string;
  examesCentavos: number;
  adicionaisCentavos: number;
  totalCentavos: number;
  arranjos: ReadonlyMap<string, { volume: number; totalCentavos: number }>;
}

export type CausaDivergencia =
  /** O médico só tem demonstrativo de um lado. */
  | 'medico_so_legado'
  | 'medico_so_redo'
  /** O arranjo só aparece de um lado (classificação: especialidade, categoria, coluna...). */
  | 'arranjo_so_legado'
  | 'arranjo_so_redo'
  /** Mesmo arranjo, volume diferente (laudos que entram de um lado e não do outro). */
  | 'volume'
  /** Mesmo arranjo e volume, valor diferente (preço). */
  | 'preco'
  /** Adicionais e extras das regras. */
  | 'adicionais';

export interface Divergencia {
  causa: CausaDivergencia;
  medico: string;
  arranjo: string | null;
  /** redo − legado, em centavos. */
  diferencaCentavos: number;
  detalhe: string;
}

export interface RelatorioParidadeRepasse {
  legado: {
    medicos: number;
    examesCentavos: number;
    adicionaisCentavos: number;
    totalCentavos: number;
  };
  redo: {
    medicos: number;
    examesCentavos: number;
    adicionaisCentavos: number;
    totalCentavos: number;
  };
  medicosIguais: number;
  medicosDivergentes: number;
  /** Por causa: quantos casos e a soma da diferença. */
  porCausa: { causa: CausaDivergencia; casos: number; diferencaCentavos: number }[];
  divergencias: Divergencia[];
}

const soma = (ds: readonly DemonstrativoParidade[]) => ({
  medicos: ds.length,
  examesCentavos: ds.reduce((s, d) => s + d.examesCentavos, 0),
  adicionaisCentavos: ds.reduce((s, d) => s + d.adicionaisCentavos, 0),
  totalCentavos: ds.reduce((s, d) => s + d.totalCentavos, 0),
});

/**
 * Compara, médico a médico e arranjo a arranjo, o repasse do redo-one com o demonstrativo fechado
 * do dashboards-one, e dá a causa de cada diferença (iguais em centavos não aparecem).
 */
export function compararRepasse(
  legado: readonly DemonstrativoParidade[],
  redo: readonly DemonstrativoParidade[],
): RelatorioParidadeRepasse {
  const porMedicoLegado = new Map(legado.map((d) => [d.medicoId, d]));
  const porMedicoRedo = new Map(redo.map((d) => [d.medicoId, d]));
  const divergencias: Divergencia[] = [];
  let iguais = 0;
  let divergentes = 0;

  for (const id of new Set([...porMedicoLegado.keys(), ...porMedicoRedo.keys()])) {
    const l = porMedicoLegado.get(id);
    const r = porMedicoRedo.get(id);
    if (!l || !r) {
      const d = (l ?? r) as DemonstrativoParidade;
      divergentes++;
      divergencias.push({
        causa: l ? 'medico_so_legado' : 'medico_so_redo',
        medico: d.medico,
        arranjo: null,
        diferencaCentavos: l ? -l.totalCentavos : d.totalCentavos,
        detalhe: `total ${d.totalCentavos}`,
      });
      continue;
    }
    if (l.totalCentavos === r.totalCentavos && l.examesCentavos === r.examesCentavos) {
      iguais++;
      continue;
    }
    divergentes++;
    if (l.adicionaisCentavos !== r.adicionaisCentavos)
      divergencias.push({
        causa: 'adicionais',
        medico: l.medico,
        arranjo: null,
        diferencaCentavos: r.adicionaisCentavos - l.adicionaisCentavos,
        detalhe: `${l.adicionaisCentavos} → ${r.adicionaisCentavos}`,
      });
    for (const arranjo of new Set([...l.arranjos.keys(), ...r.arranjos.keys()])) {
      const a = l.arranjos.get(arranjo);
      const b = r.arranjos.get(arranjo);
      if (a && b && a.volume === b.volume && a.totalCentavos === b.totalCentavos) continue;
      const causa: CausaDivergencia = !a
        ? 'arranjo_so_redo'
        : !b
          ? 'arranjo_so_legado'
          : a.volume !== b.volume
            ? 'volume'
            : 'preco';
      divergencias.push({
        causa,
        medico: l.medico,
        arranjo,
        diferencaCentavos: (b?.totalCentavos ?? 0) - (a?.totalCentavos ?? 0),
        detalhe: `volume ${a?.volume ?? 0} → ${b?.volume ?? 0}; total ${a?.totalCentavos ?? 0} → ${b?.totalCentavos ?? 0}`,
      });
    }
  }

  const causas = new Map<CausaDivergencia, { casos: number; diferencaCentavos: number }>();
  for (const d of divergencias) {
    const c = causas.get(d.causa) ?? { casos: 0, diferencaCentavos: 0 };
    c.casos++;
    c.diferencaCentavos += d.diferencaCentavos;
    causas.set(d.causa, c);
  }
  return {
    legado: soma(legado),
    redo: soma(redo),
    medicosIguais: iguais,
    medicosDivergentes: divergentes,
    porCausa: [...causas].map(([causa, c]) => ({ causa, ...c })),
    divergencias: divergencias.sort(
      (x, y) => Math.abs(y.diferencaCentavos) - Math.abs(x.diferencaCentavos),
    ),
  };
}
