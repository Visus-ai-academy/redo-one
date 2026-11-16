import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import { CelulaMedico, CelulaPeriodo } from './celulas';

const AUSENCIA: AusenciaItemDto = {
  id: 'a-1',
  medico: { id: 'm-ana', nome: 'Ana Reis' },
  tipo: { id: 't-1', nome: 'Licença', cor: '#7C3AED' },
  dataInicio: '2026-12-01',
  dataFim: '2026-12-03',
  diasSemana: [1, 3],
  frentes: [{ id: 'f-1', nome: 'NEURO' }],
  turnos: [{ id: 'tu-1', nome: 'Tarde' }],
  situacao: 'aprovada',
  origem: 'gestor',
  observacoes: null,
  motivoRecusa: null,
  revisadaEm: null,
  criadoEm: '2026-11-10T12:00:00.000Z',
  solicitadaPor: null,
  revisadaPor: null,
};

describe('CelulaMedico', () => {
  it('abre a ausência pelo nome e pinta a faixa lateral com a cor do tipo', async () => {
    const onAbrir = vi.fn();
    const { container } = render(<CelulaMedico ausencia={AUSENCIA} onAbrir={onAbrir} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ana Reis' }));
    expect(onAbrir).toHaveBeenCalled();

    const faixa = container.querySelector('[data-faixa-tipo]');
    expect(faixa).toHaveAttribute('aria-hidden', 'true');
    expect(faixa).toHaveStyle({ backgroundColor: '#7C3AED' });
  });

  it('tipo sem cor: sem faixa', () => {
    const { container } = render(
      <CelulaMedico
        ausencia={{ ...AUSENCIA, tipo: { ...AUSENCIA.tipo, cor: null } }}
        onAbrir={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-faixa-tipo]')).toBeNull();
  });
});

describe('CelulaPeriodo', () => {
  it('mostra o período e, abaixo, cada recorte em destaque', () => {
    render(<CelulaPeriodo ausencia={AUSENCIA} hoje="2026-11-16" />);

    expect(screen.getByText('01/12 – 03/12')).toBeInTheDocument();
    const recortes = screen.getByRole('list', { name: 'Onde vale' });
    expect(recortes).toHaveTextContent('só seg, qua');
    expect(recortes).toHaveTextContent('só Tarde');
    expect(recortes).toHaveTextContent('só NEURO');
  });

  it('sem recorte, só o período', () => {
    render(
      <CelulaPeriodo
        ausencia={{ ...AUSENCIA, diasSemana: [], frentes: [], turnos: [] }}
        hoje="2026-11-16"
      />,
    );
    expect(screen.queryByRole('list', { name: 'Onde vale' })).not.toBeInTheDocument();
  });
});
