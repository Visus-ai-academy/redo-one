import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import { renderComRotas } from '../../test/render';
import { CelulaMedico, CelulaPeriodo } from './celulas';

const AUSENCIA: AusenciaItemDto = {
  id: 'a-1',
  medico: { id: 'm-ana', nome: 'Ana Reis' },
  tipo: { id: 't-1', nome: 'Licença', cor: '#7C3AED' },
  dataInicio: '2026-12-01',
  dataFim: '2026-12-03',
  todosDias: false,
  diasSemana: [1, 3],
  todasFrentes: false,
  frentes: [{ id: 'f-1', nome: 'NEURO' }],
  todosTurnos: false,
  turnos: [{ id: 'tu-1', nome: 'Tarde' }],
  situacao: 'aprovada',
  origem: 'gestor',
  observacoes: null,
  temObservacoes: false,
  motivoRecusa: null,
  revisadaEm: null,
  criadoEm: '2026-11-10T12:00:00.000Z',
  solicitadaPor: null,
  revisadaPor: null,
};

describe('CelulaMedico', () => {
  it('o nome é um link para a ausência (Ctrl+clique abre em outra aba) e a faixa tem a cor do tipo', async () => {
    const { container } = renderComRotas(<CelulaMedico ausencia={AUSENCIA} />);

    const link = await screen.findByRole('link', { name: 'Ana Reis' });
    expect(link.getAttribute('href')).toContain('id=a-1');

    const faixa = container.querySelector('[data-faixa-tipo]');
    expect(faixa).toHaveAttribute('aria-hidden', 'true');
    expect(faixa).toHaveStyle({ backgroundColor: '#7C3AED' });
  });

  it('tipo sem cor: sem faixa', async () => {
    const { container } = renderComRotas(
      <CelulaMedico ausencia={{ ...AUSENCIA, tipo: { ...AUSENCIA.tipo, cor: null } }} />,
    );
    await screen.findByRole('link', { name: 'Ana Reis' });
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
        ausencia={{
          ...AUSENCIA,
          todosDias: true,
          diasSemana: [],
          todasFrentes: true,
          frentes: [],
          todosTurnos: true,
          turnos: [],
        }}
        hoje="2026-11-16"
      />,
    );
    expect(screen.queryByRole('list', { name: 'Onde vale' })).not.toBeInTheDocument();
  });
});
