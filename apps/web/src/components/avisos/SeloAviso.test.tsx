import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderComRotas } from '../../test/render';
import { SeloAviso } from './SeloAviso';

const selo = (id: string, valor: string) => ({
  entidadeId: 'c1',
  id,
  tipo: 'preco_repetido' as const,
  valor,
});

describe('SeloAviso', () => {
  it('sem aviso, nada', async () => {
    renderComRotas(
      <p>
        Cliente <SeloAviso avisos={[]} entidade="cliente" />
      </p>,
    );
    await screen.findByText('Cliente');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('um aviso: o selo leva a ele', async () => {
    renderComRotas(
      <SeloAviso avisos={[selo('a1', 'CT | NEURO: R$ 1 e R$ 2')]} entidade="cliente" />,
    );
    const link = await screen.findByRole('link', {
      name: 'Aviso pendente: CT | NEURO: R$ 1 e R$ 2',
    });
    expect(link).toHaveAttribute('href', '/avisos?id=a1');
    expect(link).toHaveTextContent('Aviso');
  });

  it('mais de um: o selo conta e leva à lista dos avisos do item', async () => {
    renderComRotas(<SeloAviso avisos={[selo('a1', 'A'), selo('a2', 'B')]} entidade="cliente" />);
    const link = await screen.findByRole('link', { name: '2 avisos pendentes' });
    expect(link).toHaveTextContent('2 avisos');
    expect(link.getAttribute('href')).toBe('/avisos?entidade=cliente&entidadeId=c1');
  });
});
