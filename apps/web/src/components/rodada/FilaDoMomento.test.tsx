import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilaCarregando, FilaDoMomento } from './FilaDoMomento';
import { FILA, medicoEmTurno } from './teste-dados';

/** O detalhe por prioridade (Tooltip do Base UI, sem papel ARIA próprio), achado pelo título. */
const dicaDe = async (titulo: string) =>
  (await screen.findByText(titulo, { selector: 'p' })).parentElement as HTMLElement;

describe('FilaDoMomento', () => {
  it('números do momento, as frentes com a barra por prioridade e os médicos em turno paginados', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    expect(screen.getByText('Exames esperando')).toBeInTheDocument();
    expect(screen.getByText('De 62 habilitados no robô')).toBeInTheDocument();

    const lista = screen.getByRole('list', { name: 'Por frente e prioridade da operação' });
    const [neuro, rx] = within(lista).getAllByRole('listitem');
    expect(neuro).toHaveTextContent('NEURO');
    expect(neuro).toHaveTextContent('5 urgentes');
    expect(neuro).toHaveTextContent('26');
    expect(rx).toHaveTextContent('RX4');
    expect(screen.queryByRole('table', { name: /Por frente/ })).not.toBeInTheDocument();
    // A legenda dá o total de cada prioridade (no lugar da linha Total).
    const legenda = screen.getByRole('list', { name: 'Total por prioridade' });
    expect(legenda).toHaveTextContent('Urgência5');
    expect(legenda).toHaveTextContent('Rotina25');
    // A cor cadastrada da prioridade na legenda; sem cor, um neutro.
    const bolinha = (nome: string) =>
      within(legenda).getByText(nome).closest('li')?.querySelector<HTMLElement>('[data-cor]');
    expect(bolinha('Urgência')?.style.backgroundColor).toBe('rgb(181, 83, 90)');
    expect(bolinha('Rotina')?.style.backgroundColor).toMatch(/color-mix/);

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getByText('No teto')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar médico' }), '11');
    expect(screen.getByText('Médico 11')).toBeInTheDocument();
    expect(screen.queryByText('Médico 01')).not.toBeInTheDocument();
  });

  it('passar o mouse na frente mostra os exames de cada prioridade (só as com exame) e o total', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    await userEvent.hover(screen.getByRole('button', { name: /^NEURO/ }));
    const dica = await dicaDe('NEURO');
    expect(within(dica).getByText('Urgência').closest('li')).toHaveTextContent('Urgência5');
    expect(within(dica).getByText('Rotina').closest('li')).toHaveTextContent('Rotina21');
    expect(dica).toHaveTextContent('Total26');
    await userEvent.unhover(screen.getByRole('button', { name: /^NEURO/ }));

    // Frente sem exame de urgência: a prioridade zerada não aparece.
    await userEvent.hover(screen.getByRole('button', { name: /^RX/ }));
    const dicaRx = await dicaDe('RX');
    expect(dicaRx).toHaveTextContent('Total4');
    expect(within(dicaRx).queryByText('Urgência')).not.toBeInTheDocument();
  });

  it('o detalhe por prioridade também abre no foco pelo teclado', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    const neuro = screen.getByRole('button', { name: /^NEURO/ });
    for (let i = 0; i < 20 && document.activeElement !== neuro; i++) await userEvent.tab();
    expect(neuro).toHaveFocus();
    expect(await dicaDe('NEURO')).toHaveTextContent('Total26');
  });

  it('no toque, tocar na barra abre o detalhe sem expandir a frente', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    const neuro = screen.getByRole('button', { name: /^NEURO/ });
    const barra = within(neuro).getByRole('img');
    fireEvent.pointerDown(barra, { pointerType: 'touch' });
    fireEvent.click(barra);
    expect(await dicaDe('NEURO')).toHaveTextContent('Total26');
    expect(neuro).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicar na frente mostra as subespecialidades, cada uma com a sua barra; a aberta sobrevive à atualização', async () => {
    const { rerender } = render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    const neuro = screen.getByRole('button', { name: /^NEURO/ });
    expect(neuro).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('CRÂNIO')).not.toBeInTheDocument();
    await userEvent.click(neuro);
    expect(neuro).toHaveAttribute('aria-expanded', 'true');
    const subs = screen.getByRole('list', { name: 'Subespecialidades de NEURO' });
    const [cranio, sem] = within(subs).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(cranio).toHaveTextContent('CRÂNIO3 urgentes18');
    expect(sem).toHaveTextContent('Sem subespecialidade2 urgentes8');
    expect(within(cranio).getByRole('img')).toHaveAccessibleName('Urgência: 3, Rotina: 15');

    // A subespecialidade tem o mesmo detalhe ao passar o mouse.
    await userEvent.hover(within(cranio).getByRole('button'));
    expect(await dicaDe('NEURO › CRÂNIO')).toHaveTextContent('Total18');

    // A atualização de 1 min traz outro objeto: a frente continua aberta.
    rerender(<FilaDoMomento fila={structuredClone(FILA)} intervalo="1 min" />);
    expect(screen.getByRole('button', { name: /^NEURO/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(subs).getByText('CRÂNIO')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^NEURO/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole('list', { name: 'Subespecialidades de NEURO' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('frente sem subespecialidade (modalidade) não expande', () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    expect(screen.getByRole('button', { name: /^RX/ })).not.toHaveAttribute('aria-expanded');
  });

  it('vencidos separados dos que vencem na próxima hora', () => {
    const { unmount } = render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    expect(screen.getByText('Vencidos').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByText('Nenhum fora do prazo')).toBeInTheDocument();
    expect(screen.getByText('Vencem na próxima hora').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('O primeiro às 10:52')).toBeInTheDocument();
    unmount();

    render(
      <FilaDoMomento
        fila={{
          ...FILA,
          vencidos: 3,
          vencemProximaHora: 0,
          primeiroVencimento: '2026-11-17T12:24:00Z',
          proximoVencimento: '2026-11-18T20:00:00Z',
        }}
        intervalo="1 min"
      />,
    );
    expect(screen.getByText('Vencidos').nextElementSibling).toHaveTextContent('3');
    expect(screen.getByText('O mais antigo desde ontem, 09:24')).toBeInTheDocument();
    expect(screen.getByText('Nenhum na próxima hora')).toBeInTheDocument();
  });

  it('as explicações ficam na ajuda ao lado do título, não em nota de rodapé', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    expect(screen.queryByText(/Frente é a da escala/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Carga é o que o médico/)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sobre a frente e a prioridade da operação' }),
    );
    expect(await screen.findByText(/Frente é a da escala/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Sobre a carga' }));
    expect(await screen.findByText(/Carga é o que o médico/)).toBeInTheDocument();
  });

  it('no computador, a tabela de frentes fica com 1/3 e os médicos em turno com 2/3', () => {
    const { unmount } = render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    const secao = (nome: string) => screen.getByRole('heading', { name: nome }).closest('section');
    expect(secao('Por frente e prioridade da operação')?.parentElement).toHaveClass(
      'lg:grid-cols-3',
    );
    expect(secao('Por frente e prioridade da operação')).toHaveClass('lg:col-span-1');
    expect(secao('Médicos em turno agora')).toHaveClass('lg:col-span-2');
    unmount();

    // Sem exame na fila não há tabela de frentes: os médicos ocupam a largura toda.
    render(<FilaDoMomento fila={{ ...FILA, total: 0, porFrente: [] }} intervalo="1 min" />);
    expect(secao('Médicos em turno agora')).toHaveClass('lg:col-span-3');
  });

  it('fila vazia diz que todo exame já tem médico', () => {
    render(<FilaDoMomento fila={{ ...FILA, total: 0, porFrente: [] }} intervalo="1 min" />);
    expect(screen.getByText('Nenhum exame esperando na fila')).toBeInTheDocument();
  });

  it('sem leitura agora: aviso com os números da última e "Tentar agora"', async () => {
    const tentar = vi.fn();
    render(<FilaDoMomento fila={FILA} intervalo="1 min" erro onTentarDeNovo={tentar} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível ler a fila agora');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(tentar).toHaveBeenCalled();
  });

  it('ninguém em turno: o estado vazio leva à escala', () => {
    render(<FilaDoMomento fila={{ ...FILA, medicosEmTurno: [] }} intervalo="1 min" />);
    expect(screen.getByText('Ninguém em turno agora')).toBeInTheDocument();
  });
  it('médicos em turno: filtros de turno, frente e subespecialidade antes da paginação, com as cores', async () => {
    const CABECA = { id: 'cab', nome: 'Cabeça e pescoço', cor: '#3E8E5E' };
    const fila = {
      ...FILA,
      medicosEmTurno: [
        ...Array.from({ length: 11 }, (_, i) =>
          medicoEmTurno(`m${i}`, `Médico ${String(i).padStart(2, '0')}`, 1, 60),
        ),
        medicoEmTurno('t1', 'Tarde Um', 1, 60, {
          turnoId: 't2',
          turno: 'Tarde',
          turnoCor: null,
          segmentosRecortados: true,
          segmentos: [CABECA],
        }),
        medicoEmTurno('t2', 'Tarde Dois', 1, 60, { turnoId: 't2', turno: 'Tarde' }),
      ],
    };
    render(<FilaDoMomento fila={fila} intervalo="1 min" />);
    expect(screen.getByText('1–10 de 13')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByTitle('NEURO · Cabeça e pescoço')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Turnos' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tarde' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('1–2 de 2')).toBeInTheDocument();
    expect(screen.getByText('Tarde Um')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Subespecialidades' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cabeça e pescoço' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('1 de 1')).toBeInTheDocument();
    expect(screen.queryByText('Tarde Dois')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('1–10 de 13')).toBeInTheDocument();
  });

  it('carregando imita a fila: cinco números, frentes em 1/3 e médicos em 2/3', () => {
    const { container } = render(<FilaCarregando />);
    expect(screen.getByText('Carregando a distribuição')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-numero]')).toHaveLength(5);
    expect(container.querySelector('[data-frentes]')).toHaveClass('lg:col-span-1');
    expect(container.querySelector('[data-medicos]')).toHaveClass('lg:col-span-2');
  });
});
