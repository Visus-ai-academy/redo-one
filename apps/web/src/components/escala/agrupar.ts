import type { ConflitoEscalaDto } from '../../gen/types/ConflitoEscalaDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { PlantaoDoAvisoDto } from '../../gen/types/PlantaoDoAvisoDto';
import type { TipoFrenteEscalaKey } from '../../gen/types/TipoFrenteEscala';
import { diaDaSemana, NOMES_DIAS } from './calendario';
import { type FrenteParaOpcao, opcoesDeFrentes } from './opcoes-frentes';

export type Agrupamento = 'frente' | 'turno';

/** O que a grade precisa saber de um turno e de uma frente da configuração. */
export type TurnoDaGrade = {
  id: string;
  nome: string;
  cor: string | null;
  ordem: number;
  horarioInicio: string;
  horarioFim: string;
  frentes: { id: string; rotulo: string }[];
};
export type FrenteDaGrade = {
  id: string;
  rotulo: string;
  cor: string | null;
  ordem: number;
  /** Separa as opções do filtro em especialidades e modalidades. */
  tipo?: TipoFrenteEscalaKey;
};

export type LinhaGrade = {
  id: string;
  rotulo: string;
  cor: string | null;
  turnoId: string;
  frenteId: string;
  /** Plantões por dia (`AAAA-MM-DD`), em ordem de nome. */
  porDia: Record<string, OcorrenciaDto[]>;
};

export type SecaoGrade = { id: string; rotulo: string; cor: string | null; linhas: LinhaGrade[] };

type Item = { id: string; rotulo: string; cor: string | null; ordem: number };

const porOrdem = (a: Item, b: Item) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo);

/**
 * Seções (frente ou turno) com uma linha por par turno × frente. Os pares saem da configuração
 * (turnos e as frentes de cada um, já filtrados), para o "+" existir em célula vazia, e de todo
 * plantão que a API devolveu: plantão nunca some da grade, mesmo em par que mudou na configuração.
 */
export function montarGrade({
  ocorrencias,
  turnos,
  frentes,
  por,
}: {
  ocorrencias: readonly OcorrenciaDto[];
  turnos: readonly TurnoDaGrade[];
  frentes: readonly FrenteDaGrade[];
  por: Agrupamento;
}): SecaoGrade[] {
  const turnosPorId = new Map<string, Item>();
  const frentesPorId = new Map<string, Item>();
  for (const f of frentes) frentesPorId.set(f.id, { ...f });
  const pares = new Map<string, { turnoId: string; frenteId: string }>();
  const parear = (turnoId: string, frenteId: string) =>
    pares.set(`${turnoId}|${frenteId}`, { turnoId, frenteId });

  for (const t of turnos) {
    turnosPorId.set(t.id, { id: t.id, rotulo: t.nome, cor: t.cor, ordem: t.ordem });
    for (const f of t.frentes) if (frentesPorId.has(f.id)) parear(t.id, f.id);
  }
  for (const o of ocorrencias) {
    if (!turnosPorId.has(o.turnoId)) {
      turnosPorId.set(o.turnoId, {
        id: o.turnoId,
        rotulo: o.turnoNome,
        cor: o.turnoCor,
        ordem: o.turnoOrdem,
      });
    }
    if (!frentesPorId.has(o.frenteId)) {
      frentesPorId.set(o.frenteId, {
        id: o.frenteId,
        rotulo: o.frenteRotulo,
        cor: o.frenteCor,
        ordem: o.frenteOrdem,
      });
    }
    parear(o.turnoId, o.frenteId);
  }

  const celulas = new Map<string, Record<string, OcorrenciaDto[]>>();
  for (const o of ocorrencias) {
    const chave = `${o.turnoId}|${o.frenteId}`;
    const dias = celulas.get(chave) ?? {};
    dias[o.data] = [...(dias[o.data] ?? []), o];
    celulas.set(chave, dias);
  }
  for (const dias of celulas.values()) {
    for (const lista of Object.values(dias)) {
      lista.sort((a, b) => a.medicoNome.localeCompare(b.medicoNome));
    }
  }

  const [secoes, linhas] =
    por === 'frente' ? [frentesPorId, turnosPorId] : [turnosPorId, frentesPorId];
  return [...secoes.values()]
    .sort(porOrdem)
    .map((secao) => {
      const daSecao = [...pares.values()].filter(
        (p) => (por === 'frente' ? p.frenteId : p.turnoId) === secao.id,
      );
      const itens = daSecao
        .map((p) => ({ par: p, item: linhas.get(por === 'frente' ? p.turnoId : p.frenteId) }))
        .filter((x): x is { par: typeof x.par; item: Item } => Boolean(x.item))
        .sort((a, b) => porOrdem(a.item, b.item));
      return {
        id: secao.id,
        rotulo: secao.rotulo,
        cor: secao.cor,
        linhas: itens.map(({ par, item }) => ({
          id: item.id,
          rotulo: item.rotulo,
          cor: item.cor,
          turnoId: par.turnoId,
          frenteId: par.frenteId,
          porDia: celulas.get(`${par.turnoId}|${par.frenteId}`) ?? {},
        })),
      };
    })
    .filter((secao) => secao.linhas.length > 0);
}

/** Um médico no dia do calendário, com a cor da faixa (do turno, por frente; da frente, por turno). */
export type LinhaDoDia = {
  ocorrencia: OcorrenciaDto;
  /** O turno (por frente) ou a frente (por turno) da linha: o que junta os médicos num bloco. */
  grupo: string;
  cor: string | null;
};

export type BlocoDoDia = { id: string; cor: string | null; linhas: LinhaDoDia[] };

/** Os médicos seguidos do mesmo turno (ou frente) num bloco só, com a cor dele. */
export function emBlocos(linhas: readonly LinhaDoDia[]): BlocoDoDia[] {
  const blocos: BlocoDoDia[] = [];
  for (const linha of linhas) {
    const ultimo = blocos.at(-1);
    if (ultimo?.id === linha.grupo) ultimo.linhas.push(linha);
    else blocos.push({ id: linha.grupo, cor: linha.cor, linhas: [linha] });
  }
  return blocos;
}

export type CalendarioDaSemana = {
  id: string;
  rotulo: string;
  cor: string | null;
  /** O que o "+" do dia já traz: a frente (por frente) ou o turno (por turno). */
  frenteId?: string;
  turnoId?: string;
  /** Médicos-dia na semana e quantos médicos diferentes. */
  plantoes: number;
  medicos: number;
  /** Por dia (`AAAA-MM-DD`): uma lista só, pela ordem das linhas da grade e depois do nome. */
  porDia: Record<string, LinhaDoDia[]>;
};

export type ItemDaLegenda = { id: string; rotulo: string; cor: string | null };

/**
 * A semana em calendários: um por frente (ou por turno), cada dia com uma lista só de médicos.
 * Sai da mesma grade de pares turno × frente, para não perder plantão nem o "+" em dia vazio.
 * A legenda é o que pinta as faixas: os turnos (por frente) ou as frentes (por turno).
 */
export function montarCalendarios(entrada: {
  ocorrencias: readonly OcorrenciaDto[];
  turnos: readonly TurnoDaGrade[];
  frentes: readonly FrenteDaGrade[];
  por: Agrupamento;
}): { calendarios: CalendarioDaSemana[]; legenda: ItemDaLegenda[] } {
  const legenda = new Map<string, ItemDaLegenda>();
  const calendarios = montarGrade(entrada).map((secao) => {
    const porDia: Record<string, LinhaDoDia[]> = {};
    const medicos = new Set<string>();
    let plantoes = 0;
    for (const linha of secao.linhas) {
      if (!legenda.has(linha.id)) {
        legenda.set(linha.id, { id: linha.id, rotulo: linha.rotulo, cor: linha.cor });
      }
      for (const [dia, lista] of Object.entries(linha.porDia)) {
        for (const o of lista) {
          porDia[dia] = [
            ...(porDia[dia] ?? []),
            { ocorrencia: o, grupo: linha.id, cor: linha.cor },
          ];
          medicos.add(o.medicoId);
          plantoes += 1;
        }
      }
    }
    return {
      id: secao.id,
      rotulo: secao.rotulo,
      cor: secao.cor,
      ...(entrada.por === 'frente' ? { frenteId: secao.id } : { turnoId: secao.id }),
      plantoes,
      medicos: medicos.size,
      porDia,
    };
  });
  return { calendarios, legenda: [...legenda.values()] };
}

/** O que o modo "Ausências da semana" precisa de uma ausência aprovada. */
export type AusenciaDaSemana = {
  id: string;
  medico: { id: string; nome: string };
  tipo: { id: string; nome: string; cor: string | null };
  dataInicio: string;
  dataFim: string;
  /** Vazio: todos os dias do período. */
  diasSemana: number[];
};

export type BarraDeAusencia = {
  ausenciaId: string;
  tipoNome: string;
  cor: string | null;
  /** Colunas da semana (0 = segunda) onde a barra começa e termina. */
  de: number;
  ate: number;
  dataInicio: string;
  dataFim: string;
};

export type LinhaDeAusencia = { medicoId: string; medicoNome: string; barras: BarraDeAusencia[] };

/**
 * "Ausências da semana": uma linha por médico, com uma barra por trecho seguido de dias em que ele
 * está ausente na semana (dentro do período e nos dias da semana marcados).
 */
export function barrasDeAusencia(
  ausencias: readonly AusenciaDaSemana[],
  dias: readonly string[],
): LinhaDeAusencia[] {
  const linhas = new Map<string, LinhaDeAusencia>();
  for (const a of ausencias) {
    const ausenteEm = dias.map(
      (dia) =>
        dia >= a.dataInicio &&
        dia <= a.dataFim &&
        (a.diasSemana.length === 0 || a.diasSemana.includes(diaDaSemana(dia))),
    );
    const barras: BarraDeAusencia[] = [];
    ausenteEm.forEach((ausente, i) => {
      if (!ausente) return;
      const ultima = barras.at(-1);
      if (ultima && ultima.ate === i - 1) ultima.ate = i;
      else
        barras.push({
          ausenciaId: a.id,
          tipoNome: a.tipo.nome,
          cor: a.tipo.cor,
          de: i,
          ate: i,
          dataInicio: a.dataInicio,
          dataFim: a.dataFim,
        });
    });
    if (barras.length === 0) continue;
    const linha = linhas.get(a.medico.id) ?? {
      medicoId: a.medico.id,
      medicoNome: a.medico.nome,
      barras: [],
    };
    linha.barras.push(...barras);
    linhas.set(a.medico.id, linha);
  }
  for (const linha of linhas.values()) linha.barras.sort((x, y) => x.de - y.de);
  return [...linhas.values()].sort((x, y) => x.medicoNome.localeCompare(y.medicoNome));
}

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Busca de médico na tela: parte do nome, sem acento nem maiúscula. */
export function filtrarPorMedico(ocorrencias: readonly OcorrenciaDto[], termo: string) {
  const busca = semAcento(termo.trim());
  if (!busca) return [...ocorrencias];
  return ocorrencias.filter((o) => semAcento(o.medicoNome).includes(busca));
}

export const chavePlantao = (alocacaoId: string, data: string) => `${alocacaoId}|${data}`;

/** Plantões que se sobrepõem a outro do mesmo médico no mesmo turno. */
export function chavesEmConflito(conflitos: readonly ConflitoEscalaDto[]) {
  const chaves = new Set<string>();
  for (const c of conflitos) {
    chaves.add(chavePlantao(c.a.alocacaoId, c.data));
    chaves.add(chavePlantao(c.b.alocacaoId, c.data));
  }
  return chaves;
}

export type ContagemTurno = { turnoId: string; nome: string; cor: string | null; total: number };

/** Mês: quantos médicos trabalham em cada turno de cada dia (ausentes não contam). */
export function contarPorDia(ocorrencias: readonly OcorrenciaDto[]) {
  const porDia = new Map<string, (ContagemTurno & { ordem: number })[]>();
  for (const o of ocorrencias) {
    if (o.ausente) continue;
    const lista = porDia.get(o.data) ?? [];
    const item = lista.find((c) => c.turnoId === o.turnoId);
    if (item) item.total += 1;
    else
      lista.push({
        turnoId: o.turnoId,
        nome: o.turnoNome,
        cor: o.turnoCor,
        ordem: o.turnoOrdem,
        total: 1,
      });
    porDia.set(o.data, lista);
  }
  const resultado = new Map<string, ContagemTurno[]>();
  for (const [dia, lista] of porDia) {
    resultado.set(
      dia,
      lista
        .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
        .map(({ ordem: _ordem, ...c }) => c),
    );
  }
  return resultado;
}

/** "Seg, Qua e Sex" (semana começando na segunda). */
export function rotuloDias(dias: Iterable<number>) {
  const nomes = [...new Set(dias)]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => NOMES_DIAS[d] as string);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

export type ResumoAlocacao = {
  chave: string;
  frente: string;
  turno: string;
  horario: string;
  dias: string;
  plantoes: number;
  primeiro: string;
  ultimo: string;
};

/** Painel do médico: os plantões da janela agrupados por frente, turno e horário. */
export function resumoDoMedico(ocorrencias: readonly OcorrenciaDto[]): ResumoAlocacao[] {
  const grupos = new Map<string, { o: OcorrenciaDto; dias: Set<number>; datas: string[] }>();
  for (const o of ocorrencias) {
    const chave = `${o.frenteId}|${o.turnoId}|${o.horarioInicio}|${o.horarioFim}`;
    const grupo = grupos.get(chave) ?? { o, dias: new Set<number>(), datas: [] };
    grupo.dias.add(o.diaSemana);
    grupo.datas.push(o.data);
    grupos.set(chave, grupo);
  }
  return [...grupos.entries()]
    .sort(
      ([, a], [, b]) =>
        a.o.frenteOrdem - b.o.frenteOrdem ||
        a.o.turnoOrdem - b.o.turnoOrdem ||
        a.o.horarioInicio.localeCompare(b.o.horarioInicio),
    )
    .map(([chave, { o, dias, datas }]) => {
      const ordenadas = [...datas].sort();
      return {
        chave,
        frente: o.frenteRotulo,
        turno: o.turnoNome,
        horario: `${o.horarioInicio}–${o.horarioFim}`,
        dias: rotuloDias(dias),
        plantoes: datas.length,
        primeiro: ordenadas[0] as string,
        ultimo: ordenadas.at(-1) as string,
      };
    });
}

/**
 * O recorte da gestora (`escopos/meu`): vale o par turno × frente cujo turno OU frente está nele.
 * Devolve os turnos só com as frentes liberadas (e sem os que ficaram sem nenhuma) e as frentes que
 * aparecem em algum par. Sem recorte (`null`), tudo.
 */
export function aplicarRecorte<
  T extends { id: string; frentes: { id: string; rotulo: string }[] },
  F extends { id: string },
>(
  turnos: readonly T[],
  frentes: readonly F[],
  recorte: { turnoIds: string[]; frenteIds: string[] } | null,
): { turnos: T[]; frentes: F[] } {
  if (!recorte) return { turnos: [...turnos], frentes: [...frentes] };
  const liberados = turnos
    .map((t) => ({
      ...t,
      frentes: t.frentes.filter(
        (f) => recorte.turnoIds.includes(t.id) || recorte.frenteIds.includes(f.id),
      ),
    }))
    .filter((t) => t.frentes.length > 0);
  const usadas = new Set(liberados.flatMap((t) => t.frentes.map((f) => f.id)));
  return { turnos: liberados, frentes: frentes.filter((f) => usadas.has(f.id)) };
}

/** Uma ponta de um aviso de conflito: sem detalhe quando está fora do recorte de quem salvou. */
export function descreverPonta(p: PlantaoDoAvisoDto) {
  if (p.foraDoRecorte) return 'um plantão fora do seu recorte nesse dia';
  const horario = p.inicio && p.fim ? ` (${p.inicio.slice(11, 16)}–${p.fim.slice(11, 16)})` : '';
  return `${p.frenteRotulo}, ${p.turnoNome}${horario}`;
}

/**
 * A API devolve também os plantões de `de − 1` que ainda correm à meia-noite (servem aos
 * conflitos). Na grade e no calendário eles não têm coluna.
 */
export function semDiaAnterior<T extends { doDiaAnterior: boolean }>(ocorrencias: readonly T[]) {
  return ocorrencias.filter((o) => !o.doDiaAnterior);
}

/**
 * Opções dos filtros: os turnos e frentes ativos e, no fim, os inativos que ainda têm plantão no
 * período (datas passadas), marcados como inativos.
 */
export function opcoesComInativos(
  turnos: readonly { id: string; nome: string; cor: string | null }[],
  frentes: readonly FrenteParaOpcao[],
  ocorrencias: readonly OcorrenciaDto[],
) {
  const turnosOp = turnos.map((t) => ({ valor: t.id, rotulo: t.nome, cor: t.cor }));
  const frentesOp = opcoesDeFrentes(frentes);
  for (const o of ocorrencias) {
    if (!turnosOp.some((t) => t.valor === o.turnoId))
      turnosOp.push({ valor: o.turnoId, rotulo: `${o.turnoNome} (inativo)`, cor: o.turnoCor });
    // Sem o tipo no plantão: vai para o fim da lista, sem subtítulo.
    if (!frentesOp.some((f) => f.valor === o.frenteId))
      frentesOp.push({
        valor: o.frenteId,
        rotulo: `${o.frenteRotulo} (inativa)`,
        cor: o.frenteCor,
      });
  }
  return { turnos: turnosOp, frentes: frentesOp };
}
