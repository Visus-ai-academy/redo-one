import { describe, expect, it } from 'vitest';

import { mensagemSegmentoFora, segmentoForaDaEspecialidade } from './segmentos';

const COLUNAS = { id: 's-colunas', nome: 'COLUNAS', especialidadeIds: ['e-neuro', 'e-msk'] };
const AVC = { id: 's-avc', nome: 'AVC', especialidadeIds: ['e-neuro'] };

describe('segmentoForaDaEspecialidade', () => {
  it('aceita segmento que pertence à especialidade, inclusive o que é de várias', () => {
    expect(segmentoForaDaEspecialidade([COLUNAS, AVC], ['s-colunas', 's-avc'], 'e-neuro')).toBe(
      null,
    );
    expect(segmentoForaDaEspecialidade([COLUNAS], ['s-colunas'], 'e-msk')).toBe(null);
  });

  it('devolve o primeiro segmento que a especialidade não tem', () => {
    expect(segmentoForaDaEspecialidade([COLUNAS, AVC], ['s-colunas', 's-avc'], 'e-msk')).toBe(AVC);
  });

  it('sem especialidade, nenhum segmento cabe', () => {
    expect(segmentoForaDaEspecialidade([AVC], ['s-avc'], null)).toBe(AVC);
  });

  it('ignora id que não está entre os segmentos lidos (a checagem de existência é outra)', () => {
    expect(segmentoForaDaEspecialidade([AVC], ['s-sumiu'], 'e-msk')).toBe(null);
  });

  it('a mensagem cita o segmento e diz como resolver', () => {
    expect(mensagemSegmentoFora(AVC, 'do arranjo')).toBe(
      'O segmento AVC não existe na especialidade do arranjo. Escolha um segmento dela ou deixe sem segmento.',
    );
  });
});
