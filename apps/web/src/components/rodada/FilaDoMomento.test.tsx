import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilaDoMomento } from './FilaDoMomento';
import { FILA, medicoEmTurno } from './teste-dados';

describe('FilaDoMomento', () => {
  it('números do momento, as frentes com a barra por prioridade e os médicos em turno paginados', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    expect(screen.getByText('Exames esperando')).toBeInTheDocument();
    expect(screen.getByText('De 62 habilitados no robô')).toBeInTheDocument();

    const lista = screen.getByRole('list', { name: 'Por frente e prioridade da operação' });
    const neuro = within(lista).getByRole('listitem');
    expect(neuro).toHaveTextContent('NEURO');
    expect(neuro).toHaveTextContent('5 urgentes');
    expect(neuro).toHaveTextContent('30');
    expect(screen.queryByRole('table', { name: /Por frente/ })).not.toBeInTheDocument();
    // A legenda dá o total de cada prioridade (no lugar da linha Total).
    const legenda = screen.getByRole('list', { name: 'Total por prioridade' });
    expect(legenda).toHaveTextContent('Urgência5');
    expect(legenda).toHaveTextContent('Rotina25');

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getByText('No teto')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar médico' }), '11');
    expect(screen.getByText('Médico 11')).toBeInTheDocument();
    expect(screen.queryByText('Médico 01')).not.toBeInTheDocument();
  });

  it('o detalhe da frente por prioridade abre na barra, também pelo teclado', async () => {
    render(<FilaDoMomento fila={FILA} intervalo="1 min" />);
    const barra = screen.getByRole('button', { name: 'NEURO por prioridade' });
    barra.focus();
    await userEvent.keyboard('{Enter}');
    const detalhe = await screen.findByRole('dialog');
    expect(detalhe).toHaveTextContent('NEURO: 30 exames');
    expect(within(detalhe).getByText('Urgência').closest('li')).toHaveTextContent(
      'Urgência5 urgentes5',
    );
    expect(within(detalhe).getByText('Rotina').closest('li')).toHaveTextContent('Rotina25');
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
});
