import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MedicoDetalheDto } from '../../gen/types/MedicoDetalheDto';
import { escolherOpcao } from '../../test/select';
import { PainelMedico, type PainelMedicoProps } from './PainelMedico';

const niveis = [
  { id: 'n-1', nome: 'Nível 1' },
  { id: 'n-2', nome: 'Nível 2' },
];

const medico: MedicoDetalheDto = {
  id: 'm-1',
  nome: 'Dr. Augusto Lima',
  crm: '1234-SP',
  idMobilemed: 77,
  email: 'augusto@clinica.com',
  telefone: null,
  ativo: true,
  ocultoDashboards: false,
  senior: false,
  fellowship: false,
  funcao: 'STAFF',
  nivel: { id: 'n-2', nome: 'Nível 2' },
  dataInicioVinculo: '2024-03-01',
  observacoes: null,
  aliases: [
    {
      id: 'a-1',
      nomeOrigem: 'Dr. A. Lima',
      origem: 'manual',
      verificadoManualmente: true,
      observacoes: null,
    },
  ],
  equipes: [{ id: 'eq-1', nome: 'Equipe 1' }],
};

function montar(props: Partial<PainelMedicoProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onCriarApelido: vi.fn(async () => undefined),
    onExcluirApelido: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(<PainelMedico niveis={niveis} podeEditar {...handlers} {...props} />);
  return handlers;
}

describe('PainelMedico', () => {
  it('cria com os dados do cadastro', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), ' Dra. Carla Souza ');
    await userEvent.type(screen.getByRole('textbox', { name: 'CRM' }), '999-RJ');
    await userEvent.type(screen.getByRole('textbox', { name: 'ID na MobileMed' }), '42');
    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail' }), 'carla@clinica.com');
    await escolherOpcao('Nível', 'Nível 1');
    await escolherOpcao('Função', 'Fellow (em formação)');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sênior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar médico' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'Dra. Carla Souza',
      crm: '999-RJ',
      idMobilemed: 42,
      email: 'carla@clinica.com',
      telefone: null,
      ativo: true,
      ocultoDashboards: false,
      senior: true,
      fellowship: false,
      funcao: 'FELLOW',
      nivelId: 'n-1',
      dataInicioVinculo: null,
      observacoes: null,
    });
  });

  it('exige o nome e confere o e-mail', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail' }), 'carla@');
    await userEvent.click(screen.getByRole('button', { name: 'Criar médico' }));

    expect(await screen.findByText('Informe o nome do médico.')).toBeInTheDocument();
    expect(
      screen.getByText('Informe um e-mail válido, como nome@clinica.com.br.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('criando, não mostra apelidos nem as outras abas', () => {
    montar({ pagamento: <p>pagamento</p>, acesso: <p>acesso</p> });

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Apelidos' })).not.toBeInTheDocument();
  });

  it('editando, mostra as equipes e adiciona e remove apelidos', async () => {
    const { onCriarApelido, onExcluirApelido } = montar({ medico });

    expect(screen.getByRole('textbox', { name: 'Equipes' })).toHaveValue('Equipe 1');
    const apelidos = screen.getByRole('region', { name: 'Apelidos' });
    expect(within(apelidos).getByText('Dr. A. Lima')).toBeInTheDocument();

    await userEvent.type(
      within(apelidos).getByRole('textbox', { name: 'Grafia na origem' }),
      'Augusto C. Lima',
    );
    await userEvent.click(within(apelidos).getByRole('button', { name: 'Adicionar apelido' }));
    expect(onCriarApelido).toHaveBeenCalledWith({
      nomeOrigem: 'Augusto C. Lima',
      observacoes: null,
    });

    await userEvent.click(
      within(apelidos).getByRole('button', { name: 'Remover apelido Dr. A. Lima' }),
    );
    expect(onExcluirApelido).toHaveBeenCalledWith('a-1');
  });

  it('editando, as abas Pagamento e Acesso aparecem só quando há conteúdo para elas', async () => {
    montar({ medico, pagamento: <p>conteúdo do pagamento</p> });

    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Pagamento',
    ]);
    expect(screen.queryByText('conteúdo do pagamento')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Pagamento' }));

    expect(screen.getByText('conteúdo do pagamento')).toBeInTheDocument();
  });

  it('sem permissão de editar, só mostra', () => {
    montar({ medico, podeEditar: false });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nível' })).toHaveValue('Nível 2');
    expect(screen.queryByRole('button', { name: 'Adicionar apelido' })).not.toBeInTheDocument();
  });
});
