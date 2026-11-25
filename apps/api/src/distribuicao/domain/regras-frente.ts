import type { RegrasFrente } from './motor/configuracao';
import { canonicaCelulas, validarCelulas, validarRegraUrgencia } from './prioridades-operacao';
import { inteiroEntre, invalida, semRepetidos, validarHorario } from './validacao';

/**
 * Regras da frente (aba Distribuição da especialidade ou modalidade). O motor lê `RegrasFrente`;
 * aqui ficam as invariantes do cadastro. A frente sem linha usa `REGRAS_NEUTRAS`.
 */

export function validarRegrasFrente(r: RegrasFrente): void {
  semRepetidos(
    r.urgencias.map((u) => u.prioridadeOperacaoId),
    'Há prioridade repetida na urgência da frente.',
  );
  for (const u of r.urgencias) validarRegraUrgencia(u.urgencia);
  validarCelulas(r.recebimento);

  if (r.horariosSemRobo.length > 20) invalida('Use no máximo 20 horários sem robô.');
  for (const h of r.horariosSemRobo) {
    validarHorario(h.inicio, 'Início do horário sem robô');
    validarHorario(h.fim, 'Fim do horário sem robô');
    if (h.inicio === h.fim) invalida('Horário sem robô com início e fim iguais.');
    if (h.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      invalida('Dia da semana inválido: use 0 (domingo) a 6 (sábado).');
    }
    if (new Set(h.diasSemana).size !== h.diasSemana.length) {
      invalida('Há dia da semana repetido no horário sem robô.');
    }
    // Vazio nunca é "todos os dias" (25/11/2026): ou "todos os dias", ou ao menos um.
    if (h.todosDias && h.diasSemana.length) {
      invalida('Horário sem robô: escolha "todos os dias" ou os dias, não as duas coisas.');
    }
    if (!h.todosDias && !h.diasSemana.length) {
      invalida('Horário sem robô: marque ao menos um dia (ou "todos os dias").');
    }
  }

  if (r.divisao.metodo === 'proporcao') {
    if (r.frente.tipo !== 'especialidade') {
      invalida('A proporção por modalidade só vale em frente de especialidade.');
    }
    const { proporcoes } = r.divisao;
    if (proporcoes.length < 2) invalida('A proporção precisa de ao menos duas modalidades.');
    semRepetidos(
      proporcoes.map((p) => p.modalidadeId),
      'Há modalidade repetida na proporção.',
    );
    for (const p of proporcoes) inteiroEntre(p.percentual, 1, 100, 'Percentual da modalidade');
    if (proporcoes.reduce((s, p) => s + p.percentual, 0) !== 100) {
      invalida('Os percentuais da proporção precisam somar 100.');
    }
  }

  if (r.tetoPorMedico !== null) inteiroEntre(r.tetoPorMedico, 1, 10_000, 'Teto por médico');

  semRepetidos(
    r.segmentos.map((s) => s.subespecialidadeId),
    'Há segmento repetido nas regras da frente.',
  );
  for (const s of r.segmentos) {
    if (s.tetoReduzido && s.teto === null) invalida('O teto reduzido precisa do teto do segmento.');
    if (s.teto === null && s.piso === null && !s.pacoteAParte) {
      invalida('Segmento sem nenhuma regra: defina teto, piso ou pacote à parte, ou tire-o.');
    }
    if (s.teto !== null) inteiroEntre(s.teto, 1, 10_000, 'Teto do segmento');
    if (s.tetoReduzido) {
      inteiroEntre(s.tetoReduzido.teto, 0, 10_000, 'Teto reduzido do segmento');
      inteiroEntre(s.tetoReduzido.produtividadeAte, 1, 10_000, 'Produtividade do teto reduzido');
      if (s.teto !== null && s.tetoReduzido.teto > s.teto) {
        invalida('O teto reduzido não pode passar do teto do segmento.');
      }
    }
    if (s.piso !== null) {
      inteiroEntre(s.piso, 1, 10_000, 'Piso do segmento');
      if (s.teto !== null && s.piso > s.teto)
        invalida('O piso não pode passar do teto do segmento.');
    }
  }

  if (r.mistura.length === 1) invalida('A mistura precisa de ao menos duas fatias.');
  for (const f of r.mistura) {
    if (f.especialidadeId === null && f.subespecialidadeId === null) {
      invalida('Cada fatia da mistura precisa de uma especialidade ou um segmento.');
    }
  }
  semRepetidos(
    r.mistura.map((f) => `${f.especialidadeId}|${f.subespecialidadeId}`),
    'Há fatia repetida na mistura.',
  );
}

const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Forma comparável e gravável: listas de ids, dias e proporções ordenados. A ordem dos horários
 * e da mistura é a do cadastro (a fatia de um exame é a primeira que casa).
 */
export function canonicaRegras(r: RegrasFrente): RegrasFrente {
  return {
    ...r,
    urgencias: [...r.urgencias].sort((a, b) =>
      porTexto(a.prioridadeOperacaoId, b.prioridadeOperacaoId),
    ),
    recebimento: canonicaCelulas(r.recebimento),
    horariosSemRobo: r.horariosSemRobo.map((h) => ({
      ...h,
      diasSemana: [...h.diasSemana].sort((a, b) => a - b),
    })),
    divisao:
      r.divisao.metodo === 'proporcao'
        ? {
            metodo: 'proporcao',
            proporcoes: [...r.divisao.proporcoes].sort((a, b) =>
              porTexto(a.modalidadeId, b.modalidadeId),
            ),
          }
        : r.divisao,
    segmentos: [...r.segmentos].sort((a, b) =>
      porTexto(a.subespecialidadeId, b.subespecialidadeId),
    ),
  };
}

/** Os ids do catálogo que a regra cita (para recusar o que não existe). */
export function referenciasDasRegras(r: RegrasFrente) {
  return {
    prioridadeOperacao: [
      ...r.urgencias.map((u) => u.prioridadeOperacaoId),
      ...r.recebimento.map((c) => c.prioridadeOperacaoId),
    ],
    turno: r.recebimento.map((c) => c.turnoId),
    modalidade:
      r.divisao.metodo === 'proporcao' ? r.divisao.proporcoes.map((p) => p.modalidadeId) : [],
    subespecialidade: [
      ...r.segmentos.map((s) => s.subespecialidadeId),
      ...r.mistura.flatMap((f) => (f.subespecialidadeId ? [f.subespecialidadeId] : [])),
    ],
    especialidade: r.mistura.flatMap((f) => (f.especialidadeId ? [f.especialidadeId] : [])),
  };
}
