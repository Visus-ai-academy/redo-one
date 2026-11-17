import {
  type ConfiguracaoDistribuicao,
  horarioSemRoboVigente,
  type RegraSegmento,
  type RegrasFrente,
  type RegrasPorFrente,
} from './configuracao';
import {
  agruparPorPaciente,
  criarNivelDoExame,
  type ExameMotor,
  type GrupoExames,
  montarFila,
  type NivelDoExame,
  type PrioridadeCliente,
} from './fila';
import type { MedicoDisponivel } from './medicos-disponiveis';

/**
 * O motor de distribuição: recebe a fila, os médicos disponíveis e a configuração e devolve quem
 * fica com o quê e, para o que não distribuiu, o motivo. Funções puras (o instante entra como
 * parâmetro). Fonte: dashboards-one `motor.ts` (`distribuir`, `distribuirNaOrdem`). Fora desta
 * etapa: crédito pré-pago, escape, pesos (idosos, monotonia, médico lento), lote e revisão manual
 * por exame.
 *
 * A ordem das etapas não é arbitrária: tira o que não se automatiza, ordena a fila, AGRUPA POR
 * PACIENTE (antes de dividir, nunca depois) e escolhe o médico de cada pacote.
 */

export interface EntradaMotor {
  agora: Date;
  exames: readonly ExameMotor[];
  medicos: readonly MedicoDisponivel[];
  config: ConfiguracaoDistribuicao;
  regras: RegrasPorFrente;
  prioridadesCliente?: readonly PrioridadeCliente[];
  /** Id → nome (segmentos), só para o texto dos motivos; sem ele, o id. */
  nomes?: Readonly<Record<string, string>>;
}

export type MotivoNaoDistribuido =
  | 'horario_sem_robo'
  | 'frente_manual'
  | 'sem_medico_elegivel'
  | 'sem_espaco'
  | 'teto_do_segmento';

export const ROTULO_MOTIVO: Record<MotivoNaoDistribuido, string> = {
  horario_sem_robo: 'Dentro de um horário sem robô da frente',
  frente_manual: 'A frente não é distribuída pelo robô',
  sem_medico_elegivel: 'Nenhum médico elegível disponível',
  sem_espaco: 'Todos os elegíveis estão sem espaço no teto',
  teto_do_segmento: 'Todos os elegíveis atingiram o máximo do segmento',
};

export interface Designacao {
  exameId: string;
  medicoId: string;
  laudos: number;
  /** Paciente (chave) que puxou este exame junto, quando foi o caso. */
  agrupadoCom: string | null;
  /** Saiu pela cota da escala gratificada. */
  gratificado: boolean;
}

export interface NaoDistribuido {
  exameId: string;
  motivo: MotivoNaoDistribuido;
  detalhe: string;
}

/** Em que ordem os pacotes URGENTES disputam os médicos. */
export type OrdemUrgencias = 'prazo' | 'maiores_primeiro';

/** O que cada etapa interna fez, em exames (o funil da rodada). Só conta. */
export interface TrilhaMotor {
  pacotes: number;
  examesAgrupados: number;
  aderencia: number;
  adiados: number;
  cederam: number;
  ordemUrgencias: OrdemUrgencias;
}

export interface ResultadoDistribuicao {
  designacoes: Designacao[];
  naoDistribuidos: NaoDistribuido[];
  cargaPorMedico: { medicoId: string; laudos: number; exames: number }[];
  totais: { exames: number; laudos: number; distribuidos: number; emAberto: number };
  trilha: TrilhaMotor;
}

interface EstadoMedico {
  medico: MedicoDisponivel;
  laudos: number;
  /** Laudos desta rodada que abateram a cota gratificada (fora do teto comum). */
  gratificados: number;
  /** Laudos desta rodada que entraram pela exclusividade (fora do teto comum). */
  reservados: number;
  exames: number;
  porSegmento: Map<string, number>;
  porMarcador: Map<string, number>;
  urgentes: number;
}

type Tentativa = 'ok' | 'sem_espaco' | 'teto_do_segmento';

/** A carga que ocupa o teto da escala: sem a cota gratificada e sem os exclusivos. */
const cargaComum = (st: EstadoMedico) => st.laudos - st.gratificados - st.reservados;

/** Teto de carga do médico: o menor entre o da escala e o da frente, mais margem e tolerância. */
function tetoDe(
  st: EstadoMedico,
  regras: RegrasFrente | null,
  tolerancia: number,
  margemPct = 0,
): number | null {
  const daFrente = regras?.tetoPorMedico ?? null;
  const capacidade = st.medico.capacidade;
  const base =
    daFrente === null
      ? capacidade
      : capacidade === null
        ? daFrente
        : Math.min(daFrente, capacidade);
  return base === null ? null : base + Math.ceil((base * margemPct) / 100) + tolerancia;
}

/** O pacote abate a cota gratificada: falta cota e TODO exame entra pela escala gratificada. */
const pelaCota = (st: EstadoMedico, g: GrupoExames) =>
  st.gratificados < st.medico.cotaGratificada &&
  g.exames.every((e) => st.medico.gratificadoPara(e.id));

const laudosReservados = (st: EstadoMedico, g: GrupoExames) =>
  g.exames.reduce((s, e) => s + (st.medico.reservadoPara(e.id) ? e.laudos : 0), 0);

const pelaReserva = (st: EstadoMedico, g: GrupoExames) =>
  g.exames.every((e) => st.medico.reservadoPara(e.id));

/** Extra do ajuste do dia para o pacote: o MENOR entre os exames (nada entra de carona). */
const extraDoGrupo = (st: EstadoMedico, g: GrupoExames) =>
  Math.min(...g.exames.map((e) => st.medico.extraPara(e.id)));

/** Teto do segmento para o médico: o reduzido para quem tem produtividade até o limite. */
function tetoSegmento(st: EstadoMedico, s: RegraSegmento): number {
  const prod = st.medico.produtividade;
  if (s.tetoReduzido && prod !== null && prod <= s.tetoReduzido.produtividadeAte)
    return s.tetoReduzido.teto;
  return s.teto ?? Number.POSITIVE_INFINITY;
}

/** O pacote passa do teto de algum segmento (rígido: não cede nas passadas)? */
function estouraTetoSegmento(
  st: EstadoMedico,
  g: GrupoExames,
  regras: RegrasFrente | null,
): RegraSegmento | null {
  for (const s of regras?.segmentos ?? []) {
    if (s.teto === null && !s.tetoReduzido) continue;
    if (st.medico.segmentoUnico === s.subespecialidadeId) continue;
    const doGrupo = g.exames.filter((e) => e.subespecialidadeId === s.subespecialidadeId).length;
    if (doGrupo && (st.porSegmento.get(s.subespecialidadeId) ?? 0) + doGrupo > tetoSegmento(st, s))
      return s;
  }
  return null;
}

function ordenarUrgencias(
  grupos: GrupoExames[],
  ordem: OrdemUrgencias,
  nivelDoExame: NivelDoExame | null,
): GrupoExames[] {
  if (ordem === 'prazo') return grupos;
  const nUrg = (g: GrupoExames) => g.exames.filter((e) => e.urgente).length;
  // O tamanho só desempata dentro do mesmo nível de cliente.
  const nivel = (g: GrupoExames) => (nivelDoExame ? Math.min(...g.exames.map(nivelDoExame)) : 0);
  const urgentes = grupos
    .filter((g) => nUrg(g) > 0)
    .sort((a, b) => nivel(a) - nivel(b) || nUrg(b) - nUrg(a) || a.posicao - b.posicao);
  return [...urgentes, ...grupos.filter((g) => nUrg(g) === 0)];
}

/**
 * A distribuição com as urgências "maiores primeiro" (o pacote com mais urgências escolhe antes),
 * desde que isso não deixe de fora nenhuma urgência que a ordem por prazo colocaria.
 */
export function distribuir(entrada: EntradaMotor): ResultadoDistribuicao {
  const porPrazo = distribuirNaOrdem(entrada, 'prazo');
  const maiores = distribuirNaOrdem(entrada, 'maiores_primeiro');
  const urgentes = new Set(entrada.exames.filter((e) => e.urgente).map((e) => e.id));
  const semVaga = (r: ResultadoDistribuicao) =>
    new Set(r.naoDistribuidos.filter((n) => urgentes.has(n.exameId)).map((n) => n.exameId));
  const foraPorPrazo = semVaga(porPrazo);
  for (const id of semVaga(maiores)) if (!foraPorPrazo.has(id)) return porPrazo;
  return maiores;
}

export function distribuirNaOrdem(
  entrada: EntradaMotor,
  ordemUrgencias: OrdemUrgencias = 'prazo',
): ResultadoDistribuicao {
  const { exames, medicos, config, regras, agora } = entrada;
  const nome = (id: string) => entrada.nomes?.[id] ?? id;
  const designacoes: Designacao[] = [];
  const naoDistribuidos: NaoDistribuido[] = [];
  const estados = new Map<string, EstadoMedico>(
    medicos.map((m) => [
      m.id,
      {
        medico: m,
        laudos: m.cargaInicial,
        gratificados: 0,
        reservados: 0,
        exames: 0,
        porSegmento: new Map(),
        porMarcador: new Map(),
        urgentes: 0,
      },
    ]),
  );

  // --- etapa 1: o que nem entra na fila automática ---
  const automatizaveis: ExameMotor[] = [];
  for (const e of exames) {
    // O horário sem robô fecha o PLANTÃO (quem está nele já saiu da elegibilidade); o exame só
    // fica para a mão quando nenhum outro período o pega.
    const horario = [regras.daEspecialidade(e.especialidadeId), regras.daModalidade(e.modalidadeId)]
      .flatMap((r) => r?.horariosSemRobo ?? [])
      .find((h) => horarioSemRoboVigente(h, agora));
    if (horario && !medicos.some((m) => m.elegivelPara(e.id))) {
      naoDistribuidos.push({
        exameId: e.id,
        motivo: 'horario_sem_robo',
        detalhe: `Horário sem robô da frente (${horario.inicio}–${horario.fim}).`,
      });
      continue;
    }
    if (regras.doExame(e)?.distribuiPeloRobo === false) {
      naoDistribuidos.push({
        exameId: e.id,
        motivo: 'frente_manual',
        detalhe: 'A frente está configurada para não ser distribuída pelo robô.',
      });
      continue;
    }
    automatizaveis.push(e);
  }

  // --- etapas 2 e 3: fila e pacote ---
  const nivelDoExame = criarNivelDoExame(entrada.prioridadesCliente);
  const grupos = ordenarUrgencias(
    agruparPorPaciente(
      montarFila(automatizaveis, config, nivelDoExame),
      config,
      regras,
      nivelDoExame,
    ),
    ordemUrgencias,
    nivelDoExame,
  );
  const trilha: TrilhaMotor = {
    pacotes: grupos.length,
    examesAgrupados: grupos.reduce((s, g) => s + (g.exames.length > 1 ? g.exames.length : 0), 0),
    aderencia: 0,
    adiados: 0,
    cederam: 0,
    ordemUrgencias,
  };
  const regrasDoGrupo = (g: GrupoExames) => regras.doExame(g.exames[0] as ExameMotor);

  /** Grava o pacote inteiro no médico e atualiza a contabilidade dele. */
  const registrar = (st: EstadoMedico, g: GrupoExames) => {
    const gratificado = pelaCota(st, g);
    // O exclusivo não se soma à cota: o que saiu pela cota não sai de novo da conta comum.
    const reservados = gratificado ? 0 : laudosReservados(st, g);
    for (const e of g.exames) {
      designacoes.push({
        exameId: e.id,
        medicoId: st.medico.id,
        laudos: e.laudos,
        agrupadoCom: g.exames.length > 1 ? g.paciente : null,
        gratificado,
      });
      if (e.marcador) st.porMarcador.set(e.marcador, (st.porMarcador.get(e.marcador) ?? 0) + 1);
      if (e.urgente) st.urgentes += 1;
      // O exclusivo fica fora das misturas e do teto do segmento, como fica fora do teto.
      if (!gratificado && st.medico.reservadoPara(e.id)) continue;
      if (e.subespecialidadeId) {
        st.porSegmento.set(
          e.subespecialidadeId,
          (st.porSegmento.get(e.subespecialidadeId) ?? 0) + 1,
        );
      }
    }
    st.laudos += g.laudos;
    if (gratificado) st.gratificados += g.laudos;
    st.reservados += reservados;
    st.exames += g.exames.length;
  };

  const registrarSemEspaco = (
    g: GrupoExames,
    r: Exclude<Tentativa, 'ok'>,
    candidatos: EstadoMedico[],
    seg: RegraSegmento | null,
  ) => {
    const regrasG = regrasDoGrupo(g);
    const margem = g.exames.some((e) => e.urgente) ? config.margemUrgenciaPct : 0;
    const quem = candidatos
      .slice(0, 12)
      .map(
        (st) =>
          `${st.medico.nome} ${cargaComum(st)}/${tetoDe(st, regrasG, config.toleranciaAcimaTeto, margem) ?? 'sem teto'}`,
      )
      .join(', ');
    const elegiveis = ` Elegíveis (carga/teto efetivo${margem ? `, com a margem de ${margem}% para urgência` : ''}): ${quem}${
      candidatos.length > 12 ? ` e mais ${candidatos.length - 12}` : ''
    }.`;
    const detalhe =
      r === 'teto_do_segmento'
        ? `Todos os elegíveis já atingiram o máximo de ${nome(seg?.subespecialidadeId ?? '')} neste envio.`
        : regrasG?.tetoPorMedico
          ? `Todos os elegíveis bateram o teto de ${regrasG.tetoPorMedico} por médico da frente ou o da escala.`
          : 'Todos os elegíveis estão sem espaço no teto da escala.';
    for (const e of g.exames)
      naoDistribuidos.push({ exameId: e.id, motivo: r, detalhe: detalhe + elegiveis });
  };

  /** Tenta dar o pacote a alguém entre os candidatos. */
  const tentarDesignar = (
    g: GrupoExames,
    candidatos: EstadoMedico[],
    /** Segmento do piso: vai para quem tem MENOS dele na rodada. */
    rodizioSegmento?: string,
  ): { r: Tentativa; seg: RegraSegmento | null } => {
    const regrasG = regrasDoGrupo(g);
    const urgente = g.exames.some((e) => e.urgente);
    // Margem de urgência: a rotina vai até o teto e a urgência passa dele.
    const margem = urgente ? config.margemUrgenciaPct : 0;
    const comEspaco = candidatos.filter((st) => {
      // A cota gratificada não cede a teto nenhum.
      if (pelaCota(st, g)) return true;
      // O teto mede só a carga comum; no pacote misto, só a parte que não é exclusiva pesa.
      const noTeto = g.laudos - laudosReservados(st, g);
      if (noTeto === 0) return true;
      const teto = tetoDe(st, regrasG, config.toleranciaAcimaTeto, margem);
      return teto === null || cargaComum(st) + noTeto <= teto + extraDoGrupo(st, g);
    });
    if (!comEspaco.length) return { r: 'sem_espaco', seg: null };
    let segBarrou: RegraSegmento | null = null;
    const dentroDoSegmento = comEspaco.filter((st) => {
      if (pelaReserva(st, g)) return true;
      const s = estouraTetoSegmento(st, g, regrasG);
      segBarrou ??= s;
      return s === null;
    });
    if (!dentroDoSegmento.length) return { r: 'teto_do_segmento', seg: segBarrou };

    const marcador = g.exames.find((e) => e.marcador)?.marcador ?? null;
    // Ocupação: a nota divide a carga pelo teto (sem margem nem tolerância). Quem não tem teto
    // entra com a média dos que têm; ninguém com teto, divisor 1 (a carga crua).
    const tetoBase = new Map(dentroDoSegmento.map((st) => [st, tetoDe(st, regrasG, 0)]));
    const conhecidos = [...tetoBase.values()].filter((t): t is number => t !== null);
    const tetoMedio = conhecidos.length
      ? conhecidos.reduce((a, b) => a + b, 0) / conhecidos.length
      : 1;
    const nota = (st: EstadoMedico) => cargaComum(st) / Math.max(1, tetoBase.get(st) ?? tetoMedio);
    const escolhido = dentroDoSegmento.reduce((melhor, st) => {
      // Cota gratificada primeiro: quem ainda deve cota pega antes de todos.
      const gc = pelaCota(st, g);
      if (gc !== pelaCota(melhor, g)) return gc ? st : melhor;
      // Entre dois exclusivos, quem tem menos do recorte (em mãos + nesta rodada).
      if (pelaReserva(st, g) && pelaReserva(melhor, g)) {
        const a = st.medico.cargaReservada + st.reservados;
        const b = melhor.medico.cargaReservada + melhor.reservados;
        if (a !== b) return a < b ? st : melhor;
      }
      if (rodizioSegmento) {
        const a = st.porSegmento.get(rodizioSegmento) ?? 0;
        const b = melhor.porSegmento.get(rodizioSegmento) ?? 0;
        if (a !== b) return a < b ? st : melhor;
      }
      // Marcador de equilíbrio: rodízio próprio, quem tem menos dele na rodada.
      if (marcador) {
        const a = st.porMarcador.get(marcador) ?? 0;
        const b = melhor.porMarcador.get(marcador) ?? 0;
        if (a !== b) return a < b ? st : melhor;
      }
      // Urgência em rodízio: quem recebeu menos urgências na rodada.
      if (urgente && st.urgentes !== melhor.urgentes)
        return st.urgentes < melhor.urgentes ? st : melhor;
      return nota(st) < nota(melhor) ? st : melhor;
    });
    registrar(escolhido, g);
    return { r: 'ok', seg: null };
  };

  const elegiveisDo = (g: GrupoExames) =>
    [...estados.values()].filter((st) => g.exames.every((e) => st.medico.elegivelPara(e.id)));

  // PISO POR SEGMENTO: logo depois das urgências, cada médico do segmento recebe até o piso, em
  // rodízio e na ordem da fila; o fluxo comum completa até o teto.
  const noPiso = new Set<GrupoExames>();
  const aplicarPiso = () => {
    for (const g of grupos) {
      if (g.exames.some((e) => e.urgente || e.medicoAderente)) continue;
      for (const s of regrasDoGrupo(g)?.segmentos ?? []) {
        if (!s.piso || !g.exames.some((e) => e.subespecialidadeId === s.subespecialidadeId))
          continue;
        const abaixo = elegiveisDo(g).filter(
          (st) =>
            (st.porSegmento.get(s.subespecialidadeId) ?? 0) <
            Math.min(s.piso as number, tetoSegmento(st, s)),
        );
        if (abaixo.length && tentarDesignar(g, abaixo, s.subespecialidadeId).r === 'ok')
          noPiso.add(g);
        break;
      }
    }
  };

  // --- etapa 4: escolha do médico ---
  let pisoAplicado = false;
  for (const g of grupos) {
    if (!pisoAplicado && !g.exames.some((e) => e.urgente)) {
      pisoAplicado = true;
      aplicarPiso();
    }
    if (noPiso.has(g)) continue;
    const candidatos = elegiveisDo(g);

    // ADERÊNCIA: o exame vai para quem já está com o paciente, por cima do teto, desde que ele
    // esteja na rodada e possa laudar o pacote inteiro.
    const aderenteId = g.exames.find((e) => e.medicoAderente)?.medicoAderente ?? null;
    const aderente = aderenteId ? estados.get(aderenteId) : undefined;
    if (aderente && candidatos.includes(aderente)) {
      registrar(aderente, g);
      trilha.aderencia += g.exames.length;
      continue;
    }

    if (!candidatos.length) {
      for (const e of g.exames) {
        naoDistribuidos.push({
          exameId: e.id,
          motivo: 'sem_medico_elegivel',
          detalhe:
            g.exames.length > 1
              ? `Nenhum médico elegível para os ${g.exames.length} exames do paciente.`
              : 'Nenhum médico elegível na escala do momento.',
        });
      }
      continue;
    }
    const { r, seg } = tentarDesignar(g, candidatos);
    if (r !== 'ok') registrarSemEspaco(g, r, candidatos, seg);
  }

  const cargaPorMedico = [...estados.values()]
    .filter((st) => st.exames > 0)
    .map((st) => ({ medicoId: st.medico.id, laudos: st.laudos, exames: st.exames }))
    .sort((a, b) => b.laudos - a.laudos);

  return {
    designacoes,
    naoDistribuidos,
    cargaPorMedico,
    totais: {
      exames: exames.length,
      laudos: exames.reduce((s, e) => s + e.laudos, 0),
      distribuidos: designacoes.length,
      emAberto: naoDistribuidos.length,
    },
    trilha,
  };
}
