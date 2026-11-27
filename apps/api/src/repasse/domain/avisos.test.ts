import { describe, expect, it } from 'vitest';

import { avisosSemPreco, chaveSemPreco } from './avisos';
import type { DemonstrativoCalculado, GrupoCalculado } from './demonstrativo';

const grupo = (p: Partial<GrupoCalculado>): GrupoCalculado => ({
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'plantao',
  clienteId: 'cli',
  unidadeId: null,
  volume: 3,
  unitarioCentavos: 0,
  totalCentavos: 0,
  origem: 'sem_preco',
  precoId: null,
  categoriaPrecoId: null,
  laudos: [
    { laudoId: 'l1', peca: 0, volume: 2, totalCentavos: 0 },
    { laudoId: 'l2', peca: 0, volume: 1, totalCentavos: 0 },
  ],
  ...p,
});
const demo = (grupos: GrupoCalculado[]) => ({ medicoId: 'ana', grupos }) as DemonstrativoCalculado;
const NOMES: Record<string, string> = {
  ana: 'Dra. Ana',
  mr: 'MR',
  neuro: 'NEURO',
  sc: 'SC',
  plantao: 'PLANTÃO',
  cli: 'CLINICADIA',
};

describe('avisosSemPreco', () => {
  it('um aviso por médico e arranjo sem preço, ligado à competência', () => {
    const avisos = avisosSemPreco(
      '2026-11',
      [demo([grupo({}), grupo({ origem: 'todos' })])],
      (id) => NOMES[id] ?? id,
    );
    expect(avisos).toEqual([
      {
        tipo: 'repasse_sem_preco',
        chave: chaveSemPreco('2026-11', 'ana', 'mr|neuro|sc|plantao'),
        valor: 'Dra. Ana | MR|NEURO|SC|PLANTÃO sem preço de repasse em 2026-11',
        itens: ['CLINICADIA'],
        ocorrencias: 2,
        // O médico e o arranjo: o atalho abre o preço já com o arranjo escolhido.
        entidades: [
          { tipo: 'medico', id: 'ana' },
          { tipo: 'modalidade', id: 'mr' },
          { tipo: 'especialidade', id: 'neuro' },
          { tipo: 'categoria', id: 'sc' },
          { tipo: 'prioridade', id: 'plantao' },
        ],
        competencias: { desde: '2026-11', ate: '2026-11' },
      },
    ]);
  });

  it('junta os clientes do mesmo arranjo num aviso só', () => {
    const avisos = avisosSemPreco(
      '2026-11',
      [demo([grupo({}), grupo({ clienteId: 'outro' })])],
      (id) => NOMES[id] ?? id,
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ itens: ['CLINICADIA', 'outro'], ocorrencias: 4 });
  });
});
