import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PapelResumoDto } from '../../gen/types/PapelResumoDto';
import { ListaPapeis } from './ListaPapeis';

const papel = (id: string, nome: string, extra: Partial<PapelResumoDto> = {}): PapelResumoDto => ({
  id,
  nome,
  descricao: null,
  sistema: false,
  acessoTotal: false,
  totalUsuarios: 0,
  totalPermissoes: 3,
  ...extra,
});

const papeis = [
  papel('p1', 'Administrador', { sistema: true, acessoTotal: true, totalUsuarios: 2 }),
  papel('p2', 'Financeiro', { totalUsuarios: 1 }),
  papel('p3', 'Coordenação', { totalUsuarios: 0 }),
];

describe('ListaPapeis', () => {
  it('mostra nome e quantos usuários têm cada papel, com o cadeado nos do sistema', () => {
    render(<ListaPapeis papeis={papeis} selecionadoId="p2" onEscolher={vi.fn()} />);

    const lista = screen.getByRole('list', { name: 'Papéis' });
    const [admin, financeiro, coordenacao] = within(lista).getAllByRole('button');
    expect(admin).toHaveTextContent('Administrador2 usuários');
    expect(
      within(admin as HTMLElement).getByRole('img', { name: 'Papel do sistema' }),
    ).toBeVisible();
    expect(financeiro).toHaveTextContent('Financeiro1 usuário');
    expect(financeiro).toHaveAttribute('aria-current', 'true');
    expect(coordenacao).toHaveTextContent('CoordenaçãoNenhum usuário');
    expect(within(coordenacao as HTMLElement).queryByRole('img')).not.toBeInTheDocument();
  });

  it('escolher um papel avisa quem usa a lista', async () => {
    const onEscolher = vi.fn();
    render(<ListaPapeis papeis={papeis} onEscolher={onEscolher} />);

    await userEvent.click(screen.getByRole('button', { name: /Coordenação/ }));

    expect(onEscolher).toHaveBeenCalledWith('p3');
  });

  it('pagina de 10 em 10, abrindo na página do papel escolhido', async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => papel(`p${i}`, `Papel ${i + 1}`));
    render(<ListaPapeis papeis={muitos} selecionadoId="p11" onEscolher={vi.fn()} />);

    const lista = screen.getByRole('list', { name: 'Papéis' });
    expect(within(lista).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('11–12 de 12')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(within(lista).getAllByRole('button')).toHaveLength(10);
  });
});
