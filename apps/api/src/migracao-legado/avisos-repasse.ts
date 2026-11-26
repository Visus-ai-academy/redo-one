import { type AvisoLevantado, COMPETENCIA_DESDE_SEMPRE } from '../comum/avisos/registro-avisos';
import type { PrecoRepetidoRepasse } from './mapear-repasse';

const reais = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(c / 100)
    .replace(/ /g, ' ');

/** Cada preço de repasse repetido com valores diferentes vira aviso (vale o mais recente). */
export function avisosDoRepasse(repetidos: readonly PrecoRepetidoRepasse[]): AvisoLevantado[] {
  return repetidos.map((r) => ({
    tipo: 'preco_repasse_repetido',
    chave: r.precoId,
    valor: `${r.medico} | ${r.arranjo}${r.cliente ? ` | ${r.cliente}` : ''}: ${r.valores.map(reais).join(' × ')}; ficou ${reais(r.escolhidoCentavos)}`,
    ocorrencias: r.valores.length,
    entidades: [
      { tipo: 'medico', id: r.medicoId },
      { tipo: 'preco_repasse', id: r.precoId },
    ],
    competencias: { desde: COMPETENCIA_DESDE_SEMPRE, ate: null },
  }));
}
