import { describe, expect, it } from 'vitest';

import { montarRetratoCatalogo } from './retrato-catalogo';

const exame = (id: string, nome: string, ativo = true) => ({
  id,
  nome,
  ativo,
  modalidadeId: 'mod-ct',
  especialidadeId: `esp-${id}`,
  categoriaId: null,
});

describe('montarRetratoCatalogo', () => {
  it('indexa pelas chaves da importação; a primeira ocorrência vence e o inativo fica de fora', () => {
    const r = montarRetratoCatalogo({
      exames: [exame('a', 'TC Torax X3'), exame('b', 'TC TORAX'), exame('c', 'TC Crânio', false)],
      foraDoPadrao: [
        { estudoDescricao: 'TC Especial', valores: 2, exameId: 'c' },
        { estudoDescricao: 'TC Zero', valores: 0, exameId: null },
      ],
      pecas: [
        {
          quebraId: 'q1',
          estudo: 'TC TORAX E ABDOME X1 X6',
          exameId: 'a',
          categoriaExameId: null,
          categoriaPecaId: 'cat',
        },
        {
          quebraId: 'q2',
          estudo: 'TC TORAX E ABDOME',
          exameId: 'b',
          categoriaExameId: null,
          categoriaPecaId: null,
        },
      ],
      modalidades: [{ id: 'mod-ct', codigo: 'CT' }],
      variacoesModalidade: [{ origem: 'TC', modalidadeId: 'mod-ct' }],
      especialidades: [{ id: 'esp-neuro', nome: 'Neuro' }],
      variacoesEspecialidade: [
        { origem: 'Neurologia', especialidadeId: 'esp-neuro', tipo: 'normalizacao' },
        { origem: 'Laudo', especialidadeId: null, tipo: 'invalida' },
      ],
    });

    expect(r.exames.get('tc torax')?.id).toBe('a');
    expect(r.exames.has('tc cranio')).toBe(false);
    // O vínculo do valor fora do padrão vale mesmo com o exame inativo; valor zero não entra.
    expect(r.valoresForaDoPadrao.get('tc especial')).toEqual({
      valores: 2,
      exame: { id: 'c', modalidadeId: 'mod-ct', especialidadeId: 'esp-c', categoriaId: null },
    });
    expect(r.valoresForaDoPadrao.has('tc zero')).toBe(false);
    // Duas regras de quebra com a mesma chave limpa: vale a primeira.
    expect(r.quebras.get('tc torax e abdome')).toEqual([
      { exameId: 'a', categoriaExameId: null, categoriaPecaId: 'cat' },
    ]);
    expect(r.modalidades.get('tc')).toBe('mod-ct');
    expect(r.especialidades.get('neurologia')).toBe('esp-neuro');
    expect([...r.especialidadesInvalidas]).toEqual(['laudo']);
  });
});
