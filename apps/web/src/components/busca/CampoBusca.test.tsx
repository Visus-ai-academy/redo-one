import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CampoBusca } from './CampoBusca';

function Controlado() {
  const [termo, setTermo] = useState('');
  return (
    <>
      <CampoBusca
        rotulo="Buscar médicos"
        placeholder="Nome ou CRM"
        valor={termo}
        onMudar={setTermo}
      />
      <output>{termo}</output>
    </>
  );
}

describe('CampoBusca', () => {
  it('é um campo de busca com nome acessível e devolve o que se digita', async () => {
    render(<Controlado />);

    const campo = screen.getByRole('searchbox', { name: 'Buscar médicos' });
    expect(campo).toHaveAttribute('placeholder', 'Nome ou CRM');
    await userEvent.type(campo, 'ana');

    expect(screen.getByRole('status')).toHaveTextContent('ana');
  });
});
