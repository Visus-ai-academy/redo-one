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
});
