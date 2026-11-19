import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { ArranjosDistribuicao, type ArranjosDistribuicaoProps } from './ArranjosDistribuicao';

const arranjo = (mudar: Partial<ArranjoDto> = {}): ArranjoDto => ({
  especialidadeId: null,
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
  ...mudar,
});

const NEURO = arranjo({
  especialidadeId: 'e-neuro',
  modalidadeIds: ['m-tc'],
  prioridadeIds: ['p-urg'],
  modoClientes: 'apenas',
  clienteIds: ['c1'],
  clientesExclusivosIds: ['c1'],
});

const CATALOGO: ArranjosDistribuicaoProps['catalogo'] = {
  especialidades: [
    { id: 'e-neuro', nome: 'NEURO' },
    { id: 'e-mama', nome: 'MAMA' },
  ],
  modalidades: [
    { id: 'm-tc', nome: 'TC' },
    { id: 'm-rm', nome: 'RM' },
  ],
  subespecialidades: [{ id: 's-cab', nome: 'Cabeça', especialidadeIds: ['e-neuro'] }],
  prioridades: [
    { id: 'p-rot', nome: 'ROTINA', cor: '#5A9A64' },
    { id: 'p-urg', nome: 'URGÊNCIA', cor: null },
  ],
};

function montar(props: Partial<ArranjosDistribuicaoProps> = {}) {
  const onSalvar = vi.fn(async (_arranjos: ArranjoDto[]) => undefined);
  renderComRotas(
    <ArranjosDistribuicao
      dono="medico"
      arranjos={[NEURO]}
      nomes={{ clientes: [{ id: 'c1', nome: 'Clínica Alfa' }], exames: [] }}
      catalogo={CATALOGO}
      podeEditar
      buscarClientes={async () => [{ valor: 'c2', rotulo: 'Hospital Beta' }]}
      buscarExames={async () => [{ valor: 'x1', rotulo: 'TC de crânio' }]}
      onSalvar={onSalvar}
      {...props}
    />,
  );
  return { onSalvar };
}

describe('ArranjosDistribuicao', () => {
  it('mostra cada arranjo em linhas legíveis', async () => {
    montar();
    const cartao = await screen.findByRole('button', { name: /NEURO/ });
    expect(within(cartao).getByText('TC')).toBeInTheDocument();
    expect(within(cartao).getByText('URGÊNCIA')).toBeInTheDocument();
    expect(within(cartao).getByText('Só Clínica Alfa')).toBeInTheDocument();
    expect(within(cartao).getByText('Clínicas exclusivas')).toBeInTheDocument();
  });

  it('sem permissão de editar, só lê', async () => {
    montar({ podeEditar: false });
    expect(await screen.findByText('NEURO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /NEURO/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo arranjo' })).not.toBeInTheDocument();
  });

  it('sem arranjo, diz o que acontece', async () => {
    montar({ arranjos: [] });
    expect(await screen.findByText(/Nenhum arranjo/)).toBeInTheDocument();
  });

  it('cria um arranjo e volta à lista com o aviso', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    await escolherOpcao('Especialidade', 'MAMA');
    await userEvent.click(screen.getByRole('checkbox', { name: 'ROTINA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(onSalvar).toHaveBeenCalledWith([
      NEURO,
      arranjo({ especialidadeId: 'e-mama', prioridadeIds: ['p-rot'] }),
    ]);
    expect(await acharAviso()).toHaveTextContent('Arranjo criado.');
    expect(await screen.findByRole('button', { name: 'Novo arranjo' })).toBeInTheDocument();
  });

  it('edita o arranjo aberto, mantendo os outros', async () => {
    const outro = arranjo({ especialidadeId: 'e-mama' });
    const { onSalvar } = montar({ arranjos: [NEURO, outro] });
    await userEvent.click(await screen.findByRole('button', { name: /NEURO/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'ROTINA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith([{ ...NEURO, prioridadeIds: ['p-urg', 'p-rot'] }, outro]);
    expect(await acharAviso()).toHaveTextContent('Arranjo salvo.');
  });

  it('exclui com confirmação', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('button', { name: /NEURO/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir arranjo' }));
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir arranjo' }));
    expect(onSalvar).toHaveBeenCalledWith([]);
    expect(await acharAviso()).toHaveTextContent('Arranjo excluído.');
  });

  it('"só estes clientes" sem nenhum não salva', async () => {
    const { onSalvar } = montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    const clientes = screen.getByRole('radiogroup', { name: 'Clientes' });
    await userEvent.click(within(clientes).getByRole('radio', { name: 'Só estes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(await screen.findByText('Escolha ao menos um cliente.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('legenda do obrigatório só com campo obrigatório na tela', async () => {
    montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    expect(screen.queryByText('Campo obrigatório')).not.toBeInTheDocument();
    const exames = screen.getByRole('radiogroup', { name: 'Exames' });
    await userEvent.click(within(exames).getByRole('radio', { name: 'Todos, exceto estes' }));
    expect(screen.queryByText('Campo obrigatório')).not.toBeInTheDocument();
    await userEvent.click(within(exames).getByRole('radio', { name: 'Só estes' }));
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('mostra o erro da API sem sair do formulário', async () => {
    const onSalvar = vi.fn(async () => {
      throw new Error('falhou');
    });
    montar({ onSalvar });
    await userEvent.click(await screen.findByRole('button', { name: /NEURO/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('equipe não tem clínica exclusiva', async () => {
    montar({ dono: 'equipe', arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    expect(screen.getByRole('radiogroup', { name: 'Exames' })).toBeInTheDocument();
    expect(screen.queryByText('Clínicas exclusivas')).not.toBeInTheDocument();
  });
});
