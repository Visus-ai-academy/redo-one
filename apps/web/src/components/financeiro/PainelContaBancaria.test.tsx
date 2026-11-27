import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ContaBancariaDetalheDto } from '../../gen/types/ContaBancariaDetalheDto';
import { escolherOpcao } from '../../test/select';
import { PainelContaBancaria } from './PainelContaBancaria';

const empresas = [{ id: 'tele', nome: '001 TELEIMAGEM' }];

const conta: ContaBancariaDetalheDto = {
  id: 'c1',
  contratadoId: 'tele',
  empresaNome: '001 TELEIMAGEM',
  apelido: 'Itaú cobrança',
  tipo: 'corrente',
  bancoCodigo: '341',
  agencia: '0123',
  conta: '45678',
  digito: '9',
  saldoInicialCentavos: 25_000_000,
  saldoInicialEm: '2026-12-01',
  saldoAtualCentavos: 25_000_000,
  integracao: 'itau',
  credencial: 'ITAU_TELE',
  padraoRecebimento: true,
  ativa: true,
  variaveisCredencial: [
    { nome: 'ITAU_TELE_CLIENT_ID', configurada: true },
    { nome: 'ITAU_TELE_CLIENT_SECRET', configurada: false },
  ],
};

describe('PainelContaBancaria', () => {
  it('cria com o saldo em centavos (negativo vale) e a única empresa já escolhida', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <PainelContaBancaria empresas={empresas} podeEditar onSalvar={onSalvar} onFechar={vi.fn()} />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Apelido' }), 'Caixa interno');
    await escolherOpcao('Tipo', 'Caixa');
    await userEvent.type(screen.getByRole('textbox', { name: 'Saldo inicial (R$)' }), '-1.250,5');
    await userEvent.type(screen.getByRole('textbox', { name: 'Saldo em' }), '01/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith({
        contratadoId: 'tele',
        apelido: 'Caixa interno',
        tipo: 'caixa',
        bancoCodigo: null,
        agencia: null,
        conta: null,
        digito: null,
        saldoInicialCentavos: -125_050,
        saldoInicialEm: '2026-12-01',
        integracao: 'nenhuma',
        credencial: null,
        padraoRecebimento: false,
        ativa: true,
      }),
    );
  });

  it('exige apelido, saldo e data; com o Itaú, a credencial', async () => {
    const onSalvar = vi.fn();
    render(
      <PainelContaBancaria empresas={empresas} podeEditar onSalvar={onSalvar} onFechar={vi.fn()} />,
    );

    await escolherOpcao('Integração', 'Itaú');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Informe o apelido da conta.')).toBeInTheDocument();
    expect(
      screen.getByText('Informe o saldo inicial, com vírgula nos centavos.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Informe a data do saldo inicial.')).toBeInTheDocument();
    expect(
      screen.getByText('Informe o prefixo das variáveis da credencial (ex.: ITAU_TELEIMAGEM).'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('mostra o prefixo da credencial e se cada variável existe no servidor, nunca o valor', () => {
    render(
      <PainelContaBancaria
        conta={conta}
        empresas={empresas}
        podeEditar
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Credencial' })).toHaveValue('ITAU_TELE');
    expect(screen.getByText('ITAU_TELE_CLIENT_ID')).toBeInTheDocument();
    expect(screen.getByText('Configurada no servidor')).toBeInTheDocument();
    expect(screen.getByText('Não encontrada no servidor')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Saldo inicial (R$)' })).toHaveValue('250.000,00');
  });
});
