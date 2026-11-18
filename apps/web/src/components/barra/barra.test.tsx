import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BarraEmpilhada } from './BarraEmpilhada';
import { FaixaDeNumeros } from './FaixaDeNumeros';

describe('BarraEmpilhada', () => {
  it('descreve a barra ao leitor de tela e limita cada segmento a 0–100%', () => {
    render(
      <BarraEmpilhada
        rotulo="82 de 90"
        segmentos={[
          { pct: 20, tom: 'forte' },
          { pct: 140, tom: 'suave' },
        ]}
      />,
    );
    const barra = screen.getByRole('img', { name: '82 de 90' });
    const [a, b] = barra.querySelectorAll('span');
    expect(a).toHaveStyle({ width: '20%' });
    expect(b).toHaveStyle({ width: '100%' });
  });
});

describe('BarraEmpilhada com cor de dado', () => {
  it('pinta o segmento com a cor cadastrada e separa os segmentos, sem os vazios', () => {
    render(
      <BarraEmpilhada
        rotulo="NEURO"
        separados
        segmentos={[
          { pct: 60, cor: '#2F6FB2' },
          { pct: 0, cor: '#7A5AB5' },
          { pct: 40, tom: 'neutro' },
        ]}
      />,
    );
    const barra = screen.getByRole('img', { name: 'NEURO' });
    const segs = barra.querySelectorAll('span');
    expect(segs).toHaveLength(2);
    expect(segs[0]).toHaveStyle({ width: '60%', backgroundColor: '#2F6FB2' });
    expect(segs[0]).toHaveClass('border-r-2');
    expect(segs[1]).not.toHaveClass('border-r-2');
  });
});

describe('FaixaDeNumeros', () => {
  it('rótulo, valor e legenda de cada número', () => {
    render(
      <FaixaDeNumeros
        aria-label="Fila do momento"
        numeros={[{ rotulo: 'Exames esperando', valor: '1.487', legenda: 'Status NOVO' }]}
      />,
    );
    expect(screen.getByText('Exames esperando')).toBeInTheDocument();
    expect(screen.getByText('1.487')).toBeInTheDocument();
    expect(screen.getByText('Status NOVO')).toBeInTheDocument();
  });

  it('com cinco números, cinco colunas no computador e duas no celular', () => {
    render(
      <FaixaDeNumeros
        aria-label="Fila"
        numeros={['a', 'b', 'c', 'd', 'e'].map((r) => ({ rotulo: r, valor: 1 }))}
      />,
    );
    const faixa = screen.getByLabelText('Fila');
    expect(faixa).toHaveClass('grid-cols-2', 'xl:grid-cols-5');
  });
});
