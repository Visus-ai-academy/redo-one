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
  equipes: [],
};

function montar(distribuicao?: React.ReactNode) {
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
      distribuicao={distribuicao}
    />,
  );
}

describe('PainelMedico: aba Distribuição', () => {
  it('aparece com conteúdo e mostra o que o médico lauda', async () => {
    montar(<p>Arranjos do médico</p>);
    await userEvent.click(await screen.findByRole('tab', { name: 'Distribuição' }));
    expect(screen.getByText('Arranjos do médico')).toBeInTheDocument();
  });

  it('sem conteúdo (sem permissão), não aparece', () => {
    montar();
    expect(screen.queryByRole('tab', { name: 'Distribuição' })).not.toBeInTheDocument();
  });
});
