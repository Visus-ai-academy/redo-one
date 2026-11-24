import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MedicoDetalheDto } from '../../gen/types/MedicoDetalheDto';
import { PainelMedico } from './PainelMedico';

const medico: MedicoDetalheDto = {
  id: 'm-1',
  nome: 'Dr. Augusto Lima',
  crm: null,
  idMobilemed: null,
  email: null,
  telefone: null,
  ativo: true,
  ocultoDashboards: false,
  senior: false,
  fellowship: false,
  funcao: null,
  nivel: null,
  dataInicioVinculo: null,
  observacoes: null,
  aliases: [],
  outrasContas: [],
  equipes: [],
};

function montar(escala?: React.ReactNode) {
  render(
    <PainelMedico
      medico={medico}
      niveis={[]}
      podeEditar={false}
      podeCriar={false}
      podeExcluir={false}
      onSalvar={vi.fn()}
      onCriarApelido={vi.fn()}
      onExcluirApelido={vi.fn()}
      onFechar={vi.fn()}
      escala={escala}
    />,
  );
}

describe('PainelMedico: aba Escala', () => {
  it('aparece com conteúdo e mostra a escala do médico', async () => {
    montar(<p>Resumo da escala</p>);
    await userEvent.click(await screen.findByRole('tab', { name: 'Escala' }));
    expect(screen.getByText('Resumo da escala')).toBeInTheDocument();
  });

  it('sem conteúdo (sem permissão), não aparece', async () => {
    montar();
    await screen.findByRole('dialog');
    expect(screen.queryByRole('tab', { name: 'Escala' })).not.toBeInTheDocument();
  });
});
