import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { escopoApiControllerDefinir } from '../../gen/clients/escopoApiControllerDefinir';
import { escopoApiControllerObter } from '../../gen/clients/escopoApiControllerObter';
import { frentesControllerListar } from '../../gen/clients/frentesControllerListar';
import { turnosControllerListar } from '../../gen/clients/turnosControllerListar';
import type { EscopoDto } from '../../gen/types/EscopoDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { RecorteEscala, type RecorteEscalaProps } from './RecorteEscala';

vi.mock('../../gen/clients/escopoApiControllerObter');
vi.mock('../../gen/clients/escopoApiControllerDefinir');
vi.mock('../../gen/clients/turnosControllerListar');
vi.mock('../../gen/clients/frentesControllerListar');

const obter = vi.mocked(escopoApiControllerObter);
const definir = vi.mocked(escopoApiControllerDefinir);
const listarTurnos = vi.mocked(turnosControllerListar);
const listarFrentes = vi.mocked(frentesControllerListar);

const SEM_RECORTE: EscopoDto = {
  veTodaEscala: true,
  turnoIds: [],
  frenteIds: [],
  turnos: [],
  frentes: [],
};
const COM_RECORTE: EscopoDto = {
  veTodaEscala: false,
  turnoIds: ['t-manha'],
  frenteIds: ['f-neuro'],
  turnos: [{ id: 't-manha', nome: 'Manhã' }],
  frentes: [{ id: 'f-neuro', nome: 'Neuro' }],
};

const turno = (id: string, nome: string) => ({
  id,
  nome,
  tipo: 'fixo' as const,
  horarioInicio: '07:00',
  horarioFim: '13:00',
  duracaoMin: 360,
  frentes: [],
  descricao: null,
  cor: null,
  ordem: 1,
  ativo: true,
});
const frente = (id: string, rotulo: string) => ({
  id,
  tipo: 'especialidade' as const,
  especialidadeId: id,
  modalidadeId: null,
  destinoNome: rotulo,
  rotulo,
  descricao: null,
  cor: null,
  ordem: 1,
  ativo: true,
});

const resposta = (dados: unknown) => ({ unwrap: async () => dados }) as never;

function montar(escopo: EscopoDto, props: Partial<RecorteEscalaProps> = {}) {
  obter.mockReturnValue(resposta(escopo));
  return renderComRotas(
    <RecorteEscala usuarioId="u-maria" proprio={false} podeEditar podeVerCadastros {...props} />,
  );
}

describe('RecorteEscala', () => {
  beforeEach(() => {
    for (const mock of [obter, definir, listarTurnos, listarFrentes]) mock.mockReset();
    definir.mockReturnValue(resposta(undefined));
    listarTurnos.mockReturnValue(
      resposta({
        itens: [turno('t-manha', 'Manhã'), turno('t-tarde', 'Tarde')],
        total: 2,
        pagina: 1,
        porPagina: 100,
      }),
    );
    listarFrentes.mockReturnValue(
      resposta({
        itens: [frente('f-neuro', 'Neuro'), frente('f-mama', 'Mama')],
        total: 2,
        pagina: 1,
        porPagina: 100,
      }),
    );
  });

  it('sem permissão de editar, diz que vê toda a escala', async () => {
    montar(SEM_RECORTE, { podeEditar: false });

    expect(await screen.findByText('Vê toda a escala.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('sem "vê toda a escala" e sem turno nem frente, diz que não vê a escala', async () => {
    montar({ ...SEM_RECORTE, veTodaEscala: false }, { podeEditar: false });

    expect(await screen.findByText('Sem turno nem frente: não vê a escala.')).toBeInTheDocument();
  });

  it('sem permissão de editar, mostra os turnos e as frentes do recorte', async () => {
    montar(COM_RECORTE, { podeEditar: false });

    const turnos = await screen.findByRole('list', { name: 'Turnos' });
    expect(within(turnos).getByText('Manhã')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Frentes' })).getByText('Neuro')).toBeVisible();
  });

  it('sem ver a escala, mostra o recorte só para leitura, sem buscar os cadastros', async () => {
    montar(COM_RECORTE, { podeVerCadastros: false });

    expect(await screen.findByRole('list', { name: 'Turnos' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(listarTurnos).not.toHaveBeenCalled();
  });

  it('o próprio recorte fica só para leitura', async () => {
    montar(COM_RECORTE, { proprio: true });

    expect(await screen.findByText('Você não pode alterar o próprio recorte.')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('marca turnos e frentes e salva o recorte', async () => {
    montar(COM_RECORTE);

    const manha = await screen.findByRole('checkbox', { name: 'Manhã' });
    expect(manha).toBeChecked();
    expect(
      screen.getByText(
        'A gestora vê e edita só as alocações e ausências desses turnos ou dessas frentes. Para ela ver tudo, ligue "Vê toda a escala".',
      ),
    ).toBeVisible();
    const salvar = screen.getByRole('button', { name: 'Salvar recorte' });
    expect(salvar).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Tarde' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Neuro' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mama' }));
    await userEvent.click(salvar);

    await waitFor(() =>
      expect(definir).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { usuarioId: 'u-maria' },
          body: { veTodaEscala: false, turnoIds: ['t-manha', 't-tarde'], frenteIds: ['f-mama'] },
        }),
      ),
    );
    expect(await acharAviso()).toHaveTextContent('Recorte da escala salvo.');
  });

  it('"Vê toda a escala" esconde os turnos e as frentes e salva o "todos" explícito', async () => {
    montar(COM_RECORTE);

    await userEvent.click(await screen.findByRole('switch', { name: 'Vê toda a escala' }));
    expect(screen.queryByRole('checkbox', { name: 'Manhã' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar recorte' }));

    await waitFor(() =>
      expect(definir).toHaveBeenCalledWith(
        expect.objectContaining({ body: { veTodaEscala: true, turnoIds: [], frenteIds: [] } }),
      ),
    );
  });

  it('vazio nunca é "toda a escala": sem o "todos" e sem nada marcado, não salva', async () => {
    montar(COM_RECORTE);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Manhã' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Neuro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar recorte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Marque ao menos um turno ou uma frente (ou "Vê toda a escala").',
    );
    expect(definir).not.toHaveBeenCalled();
  });

  it('avisa quem usa quando há marcação não salva (o painel pergunta antes de fechar)', async () => {
    const onAlterado = vi.fn();
    montar(COM_RECORTE, { onAlterado });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Tarde' }));

    await waitFor(() => expect(onAlterado).toHaveBeenLastCalledWith(true));
  });

  it('mantém marcado o turno do recorte que foi desativado', async () => {
    montar({
      ...COM_RECORTE,
      turnoIds: ['t-velho'],
      turnos: [{ id: 't-velho', nome: 'Noite antiga' }],
    });

    expect(await screen.findByRole('checkbox', { name: 'Noite antiga' })).toBeChecked();
  });

  it('avisa quando não consegue salvar', async () => {
    definir.mockReturnValue({
      unwrap: async () => {
        throw new Error('falhou');
      },
    } as never);
    montar({ ...SEM_RECORTE, veTodaEscala: false });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Manhã' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar recorte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar o recorte da escala. Confira sua conexão e tente de novo.',
    );
  });
});
