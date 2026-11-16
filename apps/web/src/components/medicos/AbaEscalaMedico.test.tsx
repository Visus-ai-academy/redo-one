import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ocorrenciasControllerListar } from '../../gen/clients/ocorrenciasControllerListar';
import { renderComRotas } from '../../test/render';
import { ocorrencia } from '../escala/teste-dados';
import { AbaEscalaMedico } from './AbaEscalaMedico';

vi.mock('../../gen/clients/ocorrenciasControllerListar', () => ({
  ocorrenciasControllerListar: vi.fn(),
}));

const listar = vi.mocked(ocorrenciasControllerListar);

function responder(ocorrencias: ReturnType<typeof ocorrencia>[]) {
  listar.mockReturnValue({ unwrap: async () => ({ ocorrencias, conflitos: [] }) } as never);
}

describe('AbaEscalaMedico', () => {
  it('resume as próximas 4 semanas por frente, turno e dias, com o link para a escala', async () => {
    responder([
      ocorrencia({ data: '2026-11-16', diaSemana: 1 }),
      ocorrencia({ data: '2026-11-18', diaSemana: 3 }),
    ]);
    renderComRotas(<AbaEscalaMedico medicoId="m1" hoje="2026-11-16" />);

    expect(await screen.findByText('TC Neuro, Manhã')).toBeInTheDocument();
    expect(screen.getByText('Seg e Qua, 07:00–13:00')).toBeInTheDocument();
    expect(screen.getByText('2 plantões, de 16/11 a 18/11')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { de: '2026-11-16', ate: '2026-12-13', medicoId: 'm1' },
      }),
    );
    const link = screen.getByRole('link', { name: 'Abrir na escala' });
    const url = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(url.pathname).toBe('/escala');
    expect(Object.fromEntries(url.searchParams)).toEqual({ modo: 'medico', medicoId: 'm1' });
  });

  it('sem plantões, diz isso', async () => {
    responder([]);
    renderComRotas(<AbaEscalaMedico medicoId="m1" hoje="2026-11-16" />);
    expect(await screen.findByText('Sem plantões nas próximas 4 semanas.')).toBeInTheDocument();
  });
});
