import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AvisoDto } from '../../gen/types/AvisoDto';
import { DetalheAviso } from './DetalheAviso';

const pendente: AvisoDto = {
  id: 'a1',
  tipo: 'cliente',
  valor: 'CLINICA NOVA',
  status: 'pendente',
  ocorrencias: 42,
  primeiraVezEm: '2026-11-10T12:00:00Z',
  ultimaVezEm: '2026-11-16T12:00:00Z',
  decididoPor: null,
  decididoEm: null,
  motivo: null,
};

describe('DetalheAviso', () => {
  it('mostra o que chegou e em quantos laudos', () => {
    render(<DetalheAviso aviso={pendente} podeTriar={false} />);
    expect(screen.getByText('Cliente').nextSibling).toHaveTextContent('CLINICA NOVA');
    expect(screen.getByText('Laudos na última importação').nextSibling).toHaveTextContent('42');
    expect(screen.queryByRole('button', { name: 'Ignorar aviso' })).not.toBeInTheDocument();
  });

  it('ignora o pendente com o motivo opcional', async () => {
    const onIgnorar = vi.fn(async () => undefined);
    render(<DetalheAviso aviso={pendente} podeTriar onIgnorar={onIgnorar} />);

    await userEvent.type(screen.getByLabelText('Motivo'), 'Cliente de teste da MobileMed');
    await userEvent.click(screen.getByRole('button', { name: 'Ignorar aviso' }));

    expect(onIgnorar).toHaveBeenCalledWith('Cliente de teste da MobileMed');
  });

  it('o ignorado mostra quem decidiu e o motivo, e pode ser reaberto', async () => {
    const onReabrir = vi.fn(async () => undefined);
    render(
      <DetalheAviso
        aviso={{
          ...pendente,
          status: 'ignorado',
          motivo: 'Teste',
          decididoPor: { id: 'u1', nome: 'Maria Souza' },
          decididoEm: '2026-11-16T13:00:00Z',
        }}
        podeTriar
        onReabrir={onReabrir}
      />,
    );

    expect(screen.getByText('Ignorado por').nextSibling).toHaveTextContent('Maria Souza');
    expect(screen.getByText('Motivo').nextSibling).toHaveTextContent('Teste');
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir aviso' }));
    expect(onReabrir).toHaveBeenCalled();
  });

  it('se a triagem falha, mostra o erro no painel', async () => {
    render(
      <DetalheAviso
        aviso={pendente}
        podeTriar
        onIgnorar={vi.fn(async () => Promise.reject(new Error('x')))}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ignorar aviso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ignorar agora.');
  });

  it('o resolvido explica que o cadastro foi feito, sem ações', () => {
    render(<DetalheAviso aviso={{ ...pendente, status: 'resolvido' }} podeTriar />);
    expect(screen.getByRole('status')).toHaveTextContent('Uma importação achou o cadastro');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
