import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import { arranjoDeTeste } from '../../test/arranjo';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { ArranjosDistribuicao, type ArranjosDistribuicaoProps } from './ArranjosDistribuicao';

const arranjo = (mudar: Partial<ArranjoDto> = {}): ArranjoDto =>
  arranjoDeTeste({ especialidadeId: null, modalidadeId: null, ...mudar });

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
    { id: 'e-neuro', nome: 'NEURO', cor: '#4E8C88' },
    { id: 'e-mama', nome: 'MAMA', cor: null },
    { id: 'e-mi', nome: 'MI', cor: null },
    { id: 'e-msk', nome: 'MSK', cor: null },
  ],
  modalidades: [
    { id: 'm-tc', nome: 'TC', cor: '#8A4A4A' },
    { id: 'm-rm', nome: 'RM', cor: null },
    { id: 'm-rx', nome: 'RX', cor: null },
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
    expect(within(cartao).getByText('NEURO · TC')).toBeInTheDocument();
    expect(within(cartao).getByText('URGÊNCIA')).toBeInTheDocument();
    expect(within(cartao).getByText('Só Clínica Alfa')).toBeInTheDocument();
    expect(within(cartao).getByText('Clínicas exclusivas')).toBeInTheDocument();
  });

  it('sem permissão de editar, só lê', async () => {
    montar({ podeEditar: false });
    expect(await screen.findByText('NEURO · TC')).toBeInTheDocument();
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
    await escolherOpcao('Frente', 'MAMA');
    // Começa em "Todas": desmarcar ROTINA deixa só a URGÊNCIA.
    expect(screen.getByRole('checkbox', { name: 'Todas' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'ROTINA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(onSalvar).toHaveBeenCalledWith([
      NEURO,
      arranjo({ especialidadeId: 'e-mama', prioridadeIds: ['p-urg'] }),
    ]);
    expect(await acharAviso()).toHaveTextContent('Arranjo criado.');
    expect(await screen.findByRole('button', { name: 'Novo arranjo' })).toBeInTheDocument();
  });

  it('frente de modalidade: escolhe as especialidades ("RX de MI e MSK"), sem modalidades nem segmentos', async () => {
    const { onSalvar } = montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    expect(screen.queryByRole('combobox', { name: 'Modalidades' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Especialidades' })).not.toBeInTheDocument();
    await escolherOpcao('Frente', 'RX');
    expect(screen.queryByRole('combobox', { name: 'Modalidades' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Especialidades' }));
    await userEvent.click(await screen.findByRole('option', { name: 'MI' }));
    await userEvent.click(await screen.findByRole('option', { name: 'MSK' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(onSalvar).toHaveBeenCalledWith([
      arranjo({ modalidadeId: 'm-rx', especialidadeIds: ['e-mi', 'e-msk'] }),
    ]);
  });

  it('trocar a frente tira o recorte da outra dimensão e começa a nova em "Todas"', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('button', { name: /NEURO/ }));
    await escolherOpcao('Frente', 'RX');
    expect(screen.getByRole('combobox', { name: /Especialidades/ })).toHaveTextContent('Todas');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith([
      {
        ...NEURO,
        especialidadeId: null,
        modalidadeId: 'm-rx',
        modalidadeIds: [],
        todasEspecialidades: true,
        todasModalidades: false,
        todosSegmentos: false,
      },
    ]);
  });

  it('especialidades sem nenhuma (nem "Todas") não salva', async () => {
    const { onSalvar } = montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    await escolherOpcao('Frente', 'RX');
    await userEvent.click(screen.getByRole('combobox', { name: /Especialidades/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Todas' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(await screen.findByText('Escolha ao menos uma especialidade.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('prioridades sem nenhuma marcada não salva', async () => {
    const { onSalvar } = montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    await escolherOpcao('Frente', 'NEURO');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(await screen.findByText('Marque ao menos uma prioridade.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('sem frente não salva', async () => {
    const { onSalvar } = montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(await screen.findByText('Escolha a frente.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('frente com a cor do catálogo, em especialidades e modalidades', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    expect(
      (await screen.findByRole('option', { name: 'NEURO' })).querySelector('[data-cor]'),
    ).toHaveStyle({ backgroundColor: '#4E8C88' });
    expect(screen.getByRole('option', { name: 'TC' }).querySelector('[data-cor]')).toHaveStyle({
      backgroundColor: '#8A4A4A',
    });
    await userEvent.click(screen.getByRole('option', { name: 'NEURO' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Modalidades' }));
    expect(
      (await screen.findByRole('option', { name: 'TC' })).querySelector('[data-cor]'),
    ).toHaveStyle({ backgroundColor: '#8A4A4A' });
  });

  it('edita o arranjo aberto, mantendo os outros', async () => {
    const outro = arranjo({ especialidadeId: 'e-mama' });
    const { onSalvar } = montar({ arranjos: [NEURO, outro] });
    await userEvent.click(await screen.findByRole('button', { name: /NEURO/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'ROTINA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    // Marcar a que faltava é marcar todas: vira "Todas" explícito.
    expect(onSalvar).toHaveBeenCalledWith([
      { ...NEURO, todasPrioridades: true, prioridadeIds: [] },
      outro,
    ]);
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
    await escolherOpcao('Frente', 'NEURO');
    const clientes = screen.getByRole('radiogroup', { name: 'Clientes' });
    await userEvent.click(within(clientes).getByRole('radio', { name: 'Só estes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(await screen.findByText('Escolha ao menos um cliente.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('a frente é obrigatória: asterisco e legenda', async () => {
    montar({ arranjos: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    expect(screen.getByRole('combobox', { name: 'Frente' })).toBeInTheDocument();
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('clientes de fora: um campo só, com os escolhidos como chips', async () => {
    const { onSalvar } = montar();
    await userEvent.click(await screen.findByRole('button', { name: /NEURO/ }));
    const clientes = screen.getByRole('radiogroup', { name: 'Clientes' });
    await userEvent.click(within(clientes).getByRole('radio', { name: 'Todos, exceto estes' }));
    const campo = screen.getByRole('combobox', { name: 'Clientes de fora' });
    // Alfa aparece como chip na lista de fora e na das exclusivas.
    expect(screen.getAllByRole('button', { name: 'Remover Clínica Alfa' })).toHaveLength(2);
    await userEvent.type(campo, 'bet');
    await userEvent.click(await screen.findByRole('option', { name: 'Hospital Beta' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Remover Hospital Beta' })).toBeInTheDocument();
    // A exclusiva tem de estar entre os atendidos: sai da lista de fora e das exclusivas.
    for (const remover of screen.getAllByRole('button', { name: 'Remover Clínica Alfa' })) {
      await userEvent.click(remover);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith([
      { ...NEURO, modoClientes: 'exceto', clienteIds: ['c2'], clientesExclusivosIds: [] },
    ]);
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
