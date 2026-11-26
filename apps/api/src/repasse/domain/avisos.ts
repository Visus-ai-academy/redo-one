import type { AvisoLevantado } from '../../comum/avisos/registro-avisos';
import type { DemonstrativoCalculado } from './demonstrativo';

/** Identidade do aviso de laudos sem preço: competência, médico e arranjo. */
export const chaveSemPreco = (competencia: string, medicoId: string, arranjo: string) =>
  `${competencia}|${medicoId}|${arranjo}`;

/**
 * Um aviso por médico e arranjo com laudos sem preço de repasse (pagos a zero) na competência; os
 * clientes vão na lista do aviso. O tipo trava o fechamento da competência (configurável).
 */
export function avisosSemPreco(
  competencia: string,
  demonstrativos: readonly DemonstrativoCalculado[],
  nome: (id: string) => string,
): AvisoLevantado[] {
  const porChave = new Map<string, AvisoLevantado & { itens: string[]; ocorrencias: number }>();
  for (const d of demonstrativos)
    for (const g of d.grupos) {
      if (g.origem !== 'sem_preco') continue;
      const ids = [g.modalidadeId, g.especialidadeId, g.categoriaId, g.prioridadeId];
      const arranjo = ids.map((id) => id ?? '-').join('|');
      const chave = chaveSemPreco(competencia, d.medicoId, arranjo);
      const aviso = porChave.get(chave) ?? {
        tipo: 'repasse_sem_preco' as const,
        chave,
        valor: `${nome(d.medicoId)} | ${ids.map((id) => (id ? nome(id) : '(sem cadastro)')).join('|')} sem preço de repasse em ${competencia}`,
        itens: [],
        ocorrencias: 0,
        entidades: [{ tipo: 'medico', id: d.medicoId }],
        competencias: { desde: competencia, ate: competencia },
      };
      const cliente = g.unidadeId ?? g.clienteId;
      const rotulo = cliente ? nome(cliente) : '(sem cliente)';
      if (!aviso.itens.includes(rotulo)) aviso.itens.push(rotulo);
      aviso.ocorrencias += g.laudos.length;
      porChave.set(chave, aviso);
    }
  return [...porChave.values()].map((a) => ({ ...a, itens: [...a.itens].sort() }));
}
