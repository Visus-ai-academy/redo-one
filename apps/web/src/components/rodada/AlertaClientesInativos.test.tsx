import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderComRotas } from '../../test/render';
import { AlertaClientesInativos } from './AlertaClientesInativos';

const HOSPITAL = { clienteId: 'c1', nome: 'HOSPITAL A', exames: 3, itens: [] };

describe('AlertaClientesInativos', () => {
  it('sem cliente inativo na fila, nada', async () => {
    renderComRotas(
      <p>
        Fila <AlertaClientesInativos clientes={[]} verAvisos verClientes />
      </p>,
    );
    await screen.findByText('Fila');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('um alerta por cliente: está inativo e N exames dele não estão sendo distribuídos', async () => {
    renderComRotas(
      <AlertaClientesInativos
        clientes={[HOSPITAL, { ...HOSPITAL, clienteId: 'c2', nome: 'CLINICA B', exames: 1 }]}
        verAvisos
        verClientes
      />,
    );
    const alertas = await screen.findAllByRole('alert');
    expect(alertas).toHaveLength(2);
    expect(alertas[0]).toHaveTextContent('HOSPITAL A está inativo');
    expect(alertas[0]).toHaveTextContent('3 exames dele não estão sendo distribuídos');
    expect(alertas[1]).toHaveTextContent('1 exame dele não está sendo distribuído');
    const [aviso] = screen.getAllByRole('link', { name: 'Ver o aviso' });
    expect(aviso).toHaveAttribute(
      'href',
      '/avisos?tipo=cliente_inativo&entidade=cliente&entidadeId=c1',
    );
    expect(screen.getAllByRole('link', { name: 'Abrir o cliente' })[0]).toHaveAttribute(
      'href',
      '/clientes?id=c1',
    );
  });

  it('sem as telas, sem os atalhos', async () => {
    renderComRotas(
      <AlertaClientesInativos clientes={[HOSPITAL]} verAvisos={false} verClientes={false} />,
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
