import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CampoData } from './CampoData';

function Controlado({
  inicial = '',
  onMudar,
  ...props
}: Partial<React.ComponentProps<typeof CampoData>> & {
  inicial?: string;
  onMudar?: (v: string) => void;
}) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <label htmlFor="data">Até</label>
      <CampoData
        id="data"
        hoje="2026-11-25"
        {...props}
        value={valor}
        onValueChange={(v) => {
          setValor(v);
          onMudar?.(v);
        }}
      />
      <button type="button">Outro</button>
    </>
  );
}

const abrir = () => userEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));

describe('CampoData', () => {
  it('mostra o valor AAAA-MM-DD como dd/mm/aaaa', () => {
    render(<Controlado inicial="2026-11-05" />);
    expect(screen.getByLabelText('Até')).toHaveValue('05/11/2026');
  });

  it('aceita a data digitada, com as barras postas sozinhas', async () => {
    const onMudar = vi.fn();
    render(<Controlado onMudar={onMudar} />);
    await userEvent.type(screen.getByLabelText('Até'), '05112026');
    expect(screen.getByLabelText('Até')).toHaveValue('05/11/2026');
    expect(onMudar).toHaveBeenLastCalledWith('2026-11-05');
  });

  it('volta para a última data válida ao sair com texto incompleto', async () => {
    const onMudar = vi.fn();
    render(<Controlado inicial="2026-11-05" onMudar={onMudar} />);
    const campo = screen.getByLabelText('Até');
    await userEvent.clear(campo);
    expect(onMudar).toHaveBeenLastCalledWith('');
    await userEvent.type(campo, '1203');
    await userEvent.tab();
    expect(campo).toHaveValue('');
  });

  it('abre o calendário em português no mês do valor, com a semana começando na segunda', async () => {
    render(<Controlado inicial="2026-03-10" />);
    await abrir();
    const grade = screen.getByRole('table', { name: 'Março de 2026' });
    const cabecalhos = within(grade)
      .getAllByRole('columnheader')
      .map((c) => c.textContent);
    expect(cabecalhos).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    expect(screen.getByRole('button', { name: /, 10 de março de 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('escolhe o dia com o clique e fecha', async () => {
    const onMudar = vi.fn();
    render(<Controlado onMudar={onMudar} />);
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: /^sexta-feira, 27 de novembro/ }));
    expect(onMudar).toHaveBeenLastCalledWith('2026-11-27');
    expect(screen.getByLabelText('Até')).toHaveValue('27/11/2026');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('navega pelo teclado: foco no dia de hoje, setas andam, Enter escolhe', async () => {
    const onMudar = vi.fn();
    render(<Controlado onMudar={onMudar} />);
    await abrir();
    // O Base UI move o foco para o dia logo depois de abrir.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /, 25 de novembro de 2026/ })).toHaveFocus(),
    );
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('button', { name: /, 3 de dezembro de 2026/ })).toHaveFocus();
    expect(screen.getByRole('table', { name: 'Dezembro de 2026' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(onMudar).toHaveBeenLastCalledWith('2026-12-03');
  });

  it('Esc fecha sem mudar o valor', async () => {
    const onMudar = vi.fn();
    render(<Controlado inicial="2026-11-05" onMudar={onMudar} />);
    await abrir();
    await userEvent.keyboard('{ArrowRight}{Escape}');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(onMudar).not.toHaveBeenCalled();
  });

  it('troca de mês pelos botões', async () => {
    render(<Controlado />);
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByRole('table', { name: 'Dezembro de 2026' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByRole('table', { name: 'Outubro de 2026' })).toBeInTheDocument();
  });

  it('desabilita os dias fora do mínimo e do máximo', async () => {
    render(<Controlado min="2026-11-20" max="2026-11-28" />);
    await abrir();
    expect(screen.getByRole('button', { name: /, 19 de novembro/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /, 29 de novembro/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /, 20 de novembro/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();
  });

  it('"Hoje" escolhe o dia de hoje', async () => {
    const onMudar = vi.fn();
    render(<Controlado onMudar={onMudar} />);
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(onMudar).toHaveBeenLastCalledWith('2026-11-25');
  });

  it('"Limpar" só aparece quando o campo não é obrigatório e tem valor', async () => {
    const onMudar = vi.fn();
    const { unmount } = render(<Controlado inicial="2026-11-05" required />);
    await abrir();
    expect(screen.queryByRole('button', { name: 'Limpar' })).not.toBeInTheDocument();
    unmount();

    render(<Controlado inicial="2026-11-05" onMudar={onMudar} />);
    await abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onMudar).toHaveBeenLastCalledWith('');
    expect(screen.getByLabelText('Até')).toHaveValue('');
  });

  it('seta para baixo no campo abre o calendário', async () => {
    render(<Controlado />);
    await userEvent.click(screen.getByLabelText('Até'));
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
