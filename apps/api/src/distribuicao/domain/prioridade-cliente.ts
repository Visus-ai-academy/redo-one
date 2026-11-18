import type { FrenteEscala } from './arranjo';
import { invalida, semRepetidos } from './validacao';

/** Prioridade de um cliente numa frente (aba Distribuição do cliente). Sem linha = normal. */
export interface PrioridadeDaFrente {
  frente: FrenteEscala;
  /** 1 = Alta, 2 = Média (menor passa na frente). */
  nivel: number;
}

const NIVEIS = new Set([1, 2]);

const chave = (f: FrenteEscala) =>
  f.tipo === 'especialidade' ? `E|${f.especialidadeId}` : `M|${f.modalidadeId}`;

export function validarPrioridadesCliente(itens: readonly PrioridadeDaFrente[]): void {
  for (const i of itens) {
    if (!NIVEIS.has(i.nivel)) invalida('Nível de prioridade inválido: use 1 (Alta) ou 2 (Média).');
  }
  semRepetidos(
    itens.map((i) => chave(i.frente)),
    'Há frente repetida na prioridade do cliente.',
  );
}

/** Ordem fixa (especialidades, depois modalidades, por id) para comparar e auditar. */
export const canonicaPrioridades = (itens: readonly PrioridadeDaFrente[]) =>
  [...itens].sort((a, b) => (chave(a.frente) < chave(b.frente) ? -1 : 1));
