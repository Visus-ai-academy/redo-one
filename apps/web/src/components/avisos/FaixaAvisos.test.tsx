import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderComRotas } from '../../test/render';
import { FaixaAvisos } from './FaixaAvisos';

const agora = new Date('2026-11-25T15:00:00Z');

describe('FaixaAvisos', () => {
  it('diz quantos e o mais antigo, com o link para a lista dos meus, sem fechar', async () => {
    renderComRotas(
      <FaixaAvisos
        resumo={{ total: 3, maisAntigoEm: '2026-11-21T10:00:00Z', tipos: ['cliente'] }}
        agora={agora}
      />,
    );
    const faixa = await screen.findByRole('region', { name: 'Avisos seus pendentes' });
    expect(faixa).toHaveTextContent('3 avisos seus pendentes; o mais antigo há 4 dias');
    expect(screen.getByRole('link', { name: 'Ver os meus avisos' })).toHaveAttribute(
      'href',
      '/avisos?meus=1',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sem avisos (ou sem ser responsável), nada', async () => {
    renderComRotas(
      <>
        <p>Tela</p>
        <FaixaAvisos resumo={{ total: 0, maisAntigoEm: null, tipos: [] }} />
        <FaixaAvisos resumo={undefined} />
      </>,
    );
    await screen.findByText('Tela');
    expect(screen.queryByRole('region', { name: 'Avisos seus pendentes' })).not.toBeInTheDocument();
  });
});
