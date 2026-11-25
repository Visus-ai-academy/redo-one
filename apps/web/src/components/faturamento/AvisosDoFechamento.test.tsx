import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { AvisosDoFechamento } from './AvisosDoFechamento';

const recusa = (podeFecharComAvisos: boolean) => ({
  statusCode: 409,
  message: 'Há 2 avisos pendentes que impedem fechar a competência.',
  codigo: 'avisos_pendentes' as const,
  avisos: {
    total: 3,
    itens: [
      { id: 'a1', tipo: 'cliente', valor: 'CLINICA NOVA' },
      { id: 'a2', tipo: 'preco_repetido', valor: 'CLINICA X | CT' },
    ],
  },
  podeFecharComAvisos,
});

describe('AvisosDoFechamento', () => {
  it('sem a permissão: lista os avisos e leva à lista da competência, sem fechar', async () => {
    renderComRotas(
      <AvisosDoFechamento
        competencia="2026-10"
        recusa={recusa(false)}
        onFecharMesmoAssim={vi.fn()}
        onFechar={() => undefined}
      />,
    );
    expect(
      await screen.findByRole('dialog', { name: 'A competência 10/2026 tem avisos pendentes' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CLINICA NOVA' })).toHaveAttribute(
      'href',
      '/avisos?id=a1',
    );
    expect(screen.getByText('E mais 1 aviso na lista.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver os avisos' })).toHaveAttribute(
      'href',
      '/avisos?competencia=2026-10',
    );
    expect(screen.queryByRole('button', { name: 'Fechar mesmo assim' })).not.toBeInTheDocument();
  });

  it('com a permissão: o motivo é obrigatório para fechar mesmo assim', async () => {
    const onFecharMesmoAssim = vi.fn(async () => undefined);
    renderComRotas(
      <AvisosDoFechamento
        competencia="2026-10"
        recusa={recusa(true)}
        onFecharMesmoAssim={onFecharMesmoAssim}
        onFechar={() => undefined}
      />,
    );
    const fechar = await screen.findByRole('button', { name: 'Fechar mesmo assim' });
    await userEvent.click(fechar);
    expect(
      await screen.findByText('Informe por que a competência fecha com avisos pendentes.'),
    ).toBeInTheDocument();
    expect(onFecharMesmoAssim).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox', { name: /Motivo/ }), ' Fatura urgente ');
    await userEvent.click(fechar);
    expect(onFecharMesmoAssim).toHaveBeenCalledWith('Fatura urgente');
  });
});
