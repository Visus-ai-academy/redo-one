import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FiltroPeriodo } from './FiltroPeriodo';
import { ATALHOS_PROXIMOS, ATALHOS_ULTIMOS } from './periodo';

const PADRAO = { atalhos: ATALHOS_PROXIMOS, rotuloSemPeriodo: 'Desde 30 dias atrás' };

const HOJE = '2026-11-16';

async function escolher(opcao: string) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Período' }));
  await userEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('FiltroPeriodo', () => {
  it('sem período, mostra o padrão da lista e nenhuma data solta', () => {
    render(<FiltroPeriodo {...PADRAO} hoje={HOJE} onMudar={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent(
      'Desde 30 dias atrás',
    );
    expect(screen.queryByLabelText('De')).not.toBeInTheDocument();
  });

  it('o atalho preenche de hoje até hoje + N dias', async () => {
    const onMudar = vi.fn();
    render(<FiltroPeriodo {...PADRAO} hoje={HOJE} onMudar={onMudar} />);

    await escolher('Próximos 7 dias');

    expect(onMudar).toHaveBeenCalledWith({ de: HOJE, ate: '2026-11-23' });
  });

  it('reconhece o atalho escolhido', () => {
    render(<FiltroPeriodo {...PADRAO} hoje={HOJE} de={HOJE} ate={HOJE} onMudar={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('Hoje');
  });

  it('"Personalizado…" abre De e Até e aplica o intervalo', async () => {
    const onMudar = vi.fn();
    render(<FiltroPeriodo {...PADRAO} hoje={HOJE} onMudar={onMudar} />);

    await escolher('Personalizado…');
    const popup = await screen.findByRole('dialog', { name: 'Período personalizado' });
    fireEvent.change(within(popup).getByLabelText('De'), { target: { value: '05/12/2026' } });
    fireEvent.change(within(popup).getByLabelText('Até'), { target: { value: '12/12/2026' } });
    await userEvent.click(within(popup).getByRole('button', { name: 'Aplicar' }));

    expect(onMudar).toHaveBeenCalledWith({ de: '2026-12-05', ate: '2026-12-12' });
  });

  it('não aplica fim antes do início', async () => {
    const onMudar = vi.fn();
    render(<FiltroPeriodo {...PADRAO} hoje={HOJE} onMudar={onMudar} />);

    await escolher('Personalizado…');
    const popup = await screen.findByRole('dialog', { name: 'Período personalizado' });
    fireEvent.change(within(popup).getByLabelText('De'), { target: { value: '12/12/2026' } });
    fireEvent.change(within(popup).getByLabelText('Até'), { target: { value: '05/12/2026' } });
    await userEvent.click(within(popup).getByRole('button', { name: 'Aplicar' }));

    expect(within(popup).getByText('O fim não pode ser antes do início.')).toBeInTheDocument();
    expect(onMudar).not.toHaveBeenCalled();
  });

  it('com intervalo escolhido, o seletor mostra as datas; reabre já preenchido e limpa', async () => {
    const onMudar = vi.fn();
    render(
      <FiltroPeriodo {...PADRAO} hoje={HOJE} de="2026-12-05" ate="2026-12-12" onMudar={onMudar} />,
    );

    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('05/12 a 12/12');
    await escolher('Personalizado…');
    const popup = await screen.findByRole('dialog', { name: 'Período personalizado' });
    expect(within(popup).getByLabelText('De')).toHaveValue('05/12/2026');
    await userEvent.click(within(popup).getByRole('button', { name: 'Limpar' }));

    expect(onMudar).toHaveBeenCalledWith({ de: undefined, ate: undefined });
  });

  it('para trás: os atalhos dos históricos vão de hoje − N até hoje', async () => {
    const onMudar = vi.fn();
    render(
      <FiltroPeriodo
        atalhos={ATALHOS_ULTIMOS}
        hoje={HOJE}
        de="2026-11-09"
        ate={HOJE}
        onMudar={onMudar}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('Últimos 7 dias');
    await escolher('Últimos 30 dias');
    expect(onMudar).toHaveBeenCalledWith({ de: '2026-10-17', ate: HOJE });
  });

  it('sem a opção sem período, ela não aparece', async () => {
    render(
      <FiltroPeriodo
        atalhos={ATALHOS_ULTIMOS}
        hoje={HOJE}
        de={HOJE}
        ate={HOJE}
        onMudar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Período' }));
    expect(screen.queryByRole('option', { name: 'Desde 30 dias atrás' })).not.toBeInTheDocument();
  });
});
