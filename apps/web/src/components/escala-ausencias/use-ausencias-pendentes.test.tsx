import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ausenciasControllerContarPendentes } from '../../gen/clients/ausenciasControllerContarPendentes';
import { useAusenciasPendentes } from './use-ausencias-pendentes';

vi.mock('../../gen/clients/ausenciasControllerContarPendentes');

const embrulho = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('useAusenciasPendentes', () => {
  beforeEach(() => {
    vi.mocked(ausenciasControllerContarPendentes).mockReset();
    vi.mocked(ausenciasControllerContarPendentes).mockReturnValue({
      unwrap: async () => ({ pendentes: 4 }),
    } as never);
  });

  it('conta os pedidos pendentes', async () => {
    const { result } = renderHook(() => useAusenciasPendentes(true), { wrapper: embrulho });

    await waitFor(() => expect(result.current).toBe(4));
  });

  it('sem permissão de aprovar, nem consulta', () => {
    const { result } = renderHook(() => useAusenciasPendentes(false), { wrapper: embrulho });

    expect(result.current).toBeUndefined();
    expect(ausenciasControllerContarPendentes).not.toHaveBeenCalled();
  });
});
