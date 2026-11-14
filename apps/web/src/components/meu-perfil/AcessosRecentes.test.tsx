import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { AcessoRecenteDto } from '../../gen/types/AcessoRecenteDto';
import { renderComRotas } from '../../test/render';
import { AcessosRecentes } from './AcessosRecentes';

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const acessos: AcessoRecenteDto[] = [
  {
    em: '2026-11-14T12:12:00.000Z',
    sucesso: true,
    ip: '177.32.10.200',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
  },
  { em: '2026-11-12T22:31:00.000Z', sucesso: false, ip: '45.10.1.1', userAgent: null },
];

describe('AcessosRecentes', () => {
  it('lista as entradas com quando, resultado, aparelho e IP parcial', async () => {
    renderComRotas(<AcessosRecentes acessos={acessos} agora={AGORA} />);

    const secao = await screen.findByRole('region', { name: 'Acessos recentes' });
    expect(secao).toHaveTextContent('Entradas na sua conta nos últimos 30 dias');
    const [cabecalho, primeira, segunda] = within(secao).getAllByRole('row');
    expect(cabecalho).toHaveTextContent('QuandoResultadoAparelhoIP');
    expect(primeira).toHaveTextContent('Hoje, 09:12EntrouChrome no Windows177.32.x.x');
    expect(segunda).toHaveTextContent('12/11 19:31RecusadoAparelho não identificado45.10.x.x');
  });

  it('diz quando não há entradas', async () => {
    renderComRotas(<AcessosRecentes acessos={[]} agora={AGORA} />);

    expect(await screen.findByText('Nenhuma entrada nos últimos 30 dias.')).toBeInTheDocument();
  });

  it('pagina de 10 em 10', async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({
      ...acessos[0],
      em: `2026-11-1${i % 4}T12:${String(i).padStart(2, '0')}:00.000Z`,
    })) as AcessoRecenteDto[];
    renderComRotas(<AcessosRecentes acessos={muitos} agora={AGORA} />);

    const secao = await screen.findByRole('region', { name: 'Acessos recentes' });
    expect(within(secao).getAllByRole('row')).toHaveLength(11);
    expect(within(secao).getByText('1–10 de 12')).toBeInTheDocument();
    await userEvent.click(within(secao).getByRole('button', { name: 'Próxima página' }));
    expect(within(secao).getAllByRole('row')).toHaveLength(3);
  });
});
