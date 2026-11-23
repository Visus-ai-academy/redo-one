// A proposta da rodada agrupada para a conferência: por frente da escala e, dentro dela, por médico.
import type { DesignacaoDto } from '../gen/types/DesignacaoDto';
import type { MedicoDaRodadaDto } from '../gen/types/MedicoDaRodadaDto';
import { horaDeBrasilia } from './acesso';
import { juntarNomes } from './rodada';

export type MedicoNaFrente = {
  medico: MedicoDaRodadaDto;
  /** Os exames dele nesta frente, na ordem da fila. */
  exames: DesignacaoDto[];
  urgentes: number;
  /** Quantos exames ele recebe nas outras frentes desta proposta. */
  emOutrasFrentes: number;
};

export type FrenteDaProposta = {
  /** Id da frente da escala, ou `sem-frente`. */
  chave: string;
  nome: string;
  cor: string | null;
  exames: number;
  urgentes: number;
  /** O maior número de exames de um médico na frente (a base das barras de equilíbrio). */
  maior: number;
  medicos: MedicoNaFrente[];
};

const SEM_FRENTE = 'sem-frente';

/** Quem recebeu na conferência sem estar no retrato da leitura: só o nome, sem escala nem teto. */
const medicoSemRetrato = (id: string, nome: string): MedicoDaRodadaDto => ({
  medicoId: id,
  nome,
  turnos: [],
  frentes: [],
  aComecar: [],
  capacidade: null,
  cargaEmMaos: 0,
  unidadeTeto: null,
  propostos: 0,
  urgencias: 0,
  pacotes: 0,
  previstas: 0,
  laudosPrevistos: 0,
  executadas: 0,
  puladas: 0,
  falharam: 0,
  naMao: 0,
});

/**
 * Agrupa as previstas por frente (a do exame) e por médico. Cada exame aparece uma vez, na frente
 * dele: o médico de duas frentes aparece nas duas, cada uma com os seus exames. Médico sem exame
 * proposto não aparece. Frentes e médicos do maior para o menor (no empate da frente, a com mais
 * urgências); "Sem frente" por último.
 */
export function agruparProposta(
  itens: readonly DesignacaoDto[],
  medicos: readonly MedicoDaRodadaDto[],
): FrenteDaProposta[] {
  const porId = new Map(medicos.map((m) => [m.medicoId, m]));
  const totalDoMedico = new Map<string, number>();
  const frentes = new Map<string, FrenteDaProposta & { porMedico: Map<string, MedicoNaFrente> }>();
  for (const d of itens) {
    if (!d.medico) continue;
    const chave = d.frente?.id ?? SEM_FRENTE;
    const f = frentes.get(chave) ?? {
      chave,
      nome: d.frente?.nome ?? 'Sem frente',
      cor: d.frente?.cor ?? null,
      exames: 0,
      urgentes: 0,
      maior: 0,
      medicos: [],
      porMedico: new Map(),
    };
    frentes.set(chave, f);
    f.exames++;
    if (d.urgente) f.urgentes++;
    const m = f.porMedico.get(d.medico.id) ?? {
      medico: porId.get(d.medico.id) ?? medicoSemRetrato(d.medico.id, d.medico.nome),
      exames: [],
      urgentes: 0,
      emOutrasFrentes: 0,
    };
    f.porMedico.set(d.medico.id, m);
    m.exames.push(d);
    if (d.urgente) m.urgentes++;
    totalDoMedico.set(d.medico.id, (totalDoMedico.get(d.medico.id) ?? 0) + 1);
  }
  return [...frentes.values()]
    .map(({ porMedico, ...f }) => {
      const lista = [...porMedico.values()]
        .map((m) => ({
          ...m,
          emOutrasFrentes: (totalDoMedico.get(m.medico.medicoId) ?? 0) - m.exames.length,
        }))
        .sort(
          (a, b) =>
            b.exames.length - a.exames.length ||
            a.medico.nome.localeCompare(b.medico.nome, 'pt-BR'),
        );
      return { ...f, medicos: lista, maior: lista[0]?.exames.length ?? 0 };
    })
    .sort(
      (a, b) =>
        Number(a.chave === SEM_FRENTE) - Number(b.chave === SEM_FRENTE) ||
        b.exames - a.exames ||
        b.urgentes - a.urgentes ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

/**
 * O turno do médico no dia, para a proposta: o em andamento e o que ainda vai começar, com a hora
 * ("Manhã e Tarde (começa 13:00)"). Sem turno no dia, o motivo de estar na rodada.
 */
export function turnoDoMedico(m: MedicoDaRodadaDto, incluidos: readonly string[]) {
  const turnos = [
    ...m.turnos,
    ...m.aComecar.map((a) => `${a.turno} (começa ${horaDeBrasilia(a.inicio)})`),
  ];
  if (turnos.length) return juntarNomes(turnos);
  if (incluidos.includes(m.medicoId)) return 'Incluído na rodada';
  if (m.naMao > 0) return 'Atribuído na conferência';
  return 'Sem turno hoje';
}
