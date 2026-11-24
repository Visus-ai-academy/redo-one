import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tipificacaoClienteControllerObter } from '../../gen/clients/tipificacaoClienteControllerObter';
import { tipificacaoClienteControllerPrevia } from '../../gen/clients/tipificacaoClienteControllerPrevia';
import { tipificacaoClienteControllerSalvar } from '../../gen/clients/tipificacaoClienteControllerSalvar';
import { tipificacaoControllerListar } from '../../gen/clients/tipificacaoControllerListar';
import { tipificacaoControllerOpcoes } from '../../gen/clients/tipificacaoControllerOpcoes';
import type { TipificacaoClienteDto } from '../../gen/types/TipificacaoClienteDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { EditorTipificacao } from './editor-tipificacao';

vi.mock('../../gen/clients/tipificacaoClienteControllerObter', () => ({
  tipificacaoClienteControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/tipificacaoClienteControllerPrevia', () => ({
  tipificacaoClienteControllerPrevia: vi.fn(),
}));
vi.mock('../../gen/clients/tipificacaoClienteControllerSalvar', () => ({
  tipificacaoClienteControllerSalvar: vi.fn(),
}));
vi.mock('../../gen/clients/tipificacaoControllerListar', () => ({
  tipificacaoControllerListar: vi.fn(),
}));
vi.mock('../../gen/clients/tipificacaoControllerOpcoes', () => ({
  tipificacaoControllerOpcoes: vi.fn(),
}));

const AGORA = new Date('2026-11-24T15:00:00.000Z');
const resolve = (dados: unknown) => ({ unwrap: async () => dados }) as never;
const regra = (id: string, faturaSemSubregra: boolean, padrao = false) => ({
  id,
  nome: id.toUpperCase(),
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  faturaSemSubregra,
  padrao,
  clientes: 0,
});
const sub = (id: string, regraId: string, fatura: boolean) => ({
  id,
  regraId,
  nome: id.toUpperCase(),
  descricao: null,
  fatura,
  ordem: 0,
  ativo: true,
  clientes: 0,
});
const LINHA = {
  tipo: 'especialidade' as const,
  valores: ['mi'],
  modoMedico: 'apenas' as const,
  medicos: ['rodrigo'],
  equipes: [],
  subregraId: 'nc-nf',
};
const CONFIG: TipificacaoClienteDto = {
  cliente: { id: 'c-1', nome: 'RMPADUA', unificadoEmId: null, principalNome: null },
  configuracao: {
    regraId: 'nc',
    subregraDemaisId: 'nc-ft',
    linhas: [
      LINHA,
      { ...LINHA, valores: ['cardio'], modoMedico: 'todos', medicos: [], subregraId: 'co-ft' },
    ],
    atualizadoEm: '2026-11-20T12:00:00.000Z',
    atualizadoPor: null,
  },
  doPrincipal: null,
  regraPadraoId: 'co',
  medicos: [{ id: 'rodrigo', nome: 'Rodrigo Vaz de Lima' }],
};

beforeEach(() => {
  vi.mocked(tipificacaoClienteControllerObter).mockReturnValue(resolve(CONFIG));
  vi.mocked(tipificacaoControllerListar).mockReturnValue(
    resolve({
      regras: [regra('co', true, true), regra('nc', false)],
      subregras: [sub('co-ft', 'co', true), sub('nc-ft', 'nc', true), sub('nc-nf', 'nc', false)],
    }),
  );
  vi.mocked(tipificacaoControllerOpcoes).mockReturnValue(
    resolve({
      modalidades: [{ id: 'rx', nome: 'RX', cor: null }],
      especialidades: [
        { id: 'mi', nome: 'MEDICINA INTERNA', cor: null },
        { id: 'cardio', nome: 'CARDIO', cor: null },
      ],
      prioridades: [{ id: 'plantao', nome: 'PLANTÃO', cor: null }],
      equipes: [{ id: 'eq2', nome: 'Equipe 2', cor: null }],
    }),
  );
  vi.mocked(tipificacaoClienteControllerPrevia).mockReset();
  vi.mocked(tipificacaoClienteControllerSalvar).mockReset();
  vi.mocked(tipificacaoClienteControllerSalvar).mockReturnValue(resolve(undefined));
});

const abrir = (props: Partial<Parameters<typeof EditorTipificacao>[0]> = {}) =>
  renderComRotas(<EditorTipificacao clienteId="c-1" podeEditar agora={AGORA} {...props} />);

describe('EditorTipificacao', () => {
  it('sem editar: lê a regra, as linhas como frases e o "todos os demais"', async () => {
    abrir({ podeEditar: false });
    expect(
      await screen.findByText(
        'Se especialidade for MEDICINA INTERNA e o médico for apenas Rodrigo Vaz de Lima → NC-NF',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Se especialidade for CARDIO → CO-FT')).toBeInTheDocument();
    expect(screen.getByText('NC-FT')).toBeInTheDocument();
    expect(screen.getByText(/na carga do dashboards-one/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver prévia' })).not.toBeInTheDocument();
  });

  it('a unidade sem configuração própria diz que segue a do principal', async () => {
    vi.mocked(tipificacaoClienteControllerObter).mockReturnValue(
      resolve({
        ...CONFIG,
        cliente: { id: 'c-1', nome: 'CEDI_RJ', unificadoEmId: 'p', principalNome: 'CEDIDIAG' },
        configuracao: null,
      }),
    );
    abrir();
    expect(
      await screen.findByText(/não tem configuração própria: os laudos dela seguem a do principal/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nenhuma linha: todos os laudos vão para "todos os demais" ou ficam na regra principal.',
      ),
    ).toBeInTheDocument();
  });

  it('reordena pelos botões, pede a prévia e só então salva', async () => {
    const user = userEvent.setup();
    const onAlterado = vi.fn();
    vi.mocked(tipificacaoClienteControllerPrevia).mockReturnValue(
      resolve([
        {
          competencia: '2026-11',
          regraId: 'nc',
          subregraId: 'nc-nf',
          fatura: false,
          antes: { laudos: 10, volume: 12 },
          depois: { laudos: 4, volume: 5 },
        },
      ]),
    );
    abrir({ onAlterado });
    const subir = await screen.findByRole('button', { name: 'Subir linha 2' });
    await user.click(subir);
    expect(onAlterado).toHaveBeenLastCalledWith(true);
    const linhas = within(screen.getByRole('list', { name: 'Linhas da tipificação' })).getAllByRole(
      'listitem',
    );
    expect(linhas[0]).toHaveTextContent('Se especialidade for CARDIO → CO-FT');
    expect(screen.getByText('Linha 2 movida para a posição 1.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Prévia nas competências abertas')).toBeInTheDocument();
    expect(screen.getByText('6 laudos voltam a faturar.')).toBeInTheDocument();
    expect(tipificacaoClienteControllerSalvar).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Salvar tipificação' }));
    await waitFor(() => expect(tipificacaoClienteControllerSalvar).toHaveBeenCalled());
    expect(vi.mocked(tipificacaoClienteControllerSalvar).mock.calls[0]?.[0]).toMatchObject({
      path: { clienteId: 'c-1' },
      body: {
        regraId: 'nc',
        subregraDemaisId: 'nc-ft',
        linhas: [
          { valores: ['cardio'], modoMedico: 'todos', medicos: [], subregraId: 'co-ft' },
          { valores: ['mi'], modoMedico: 'apenas', medicos: ['rodrigo'], subregraId: 'nc-nf' },
        ],
      },
    });
    expect(await acharAviso()).toHaveTextContent(/Tipificação salva/);
  });

  it('linha nova incompleta não pede prévia: mostra o que falta', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Adicionar linha' }));
    await user.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Escolha pelo menos um valor.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a sub-regra.')).toBeInTheDocument();
    expect(tipificacaoClienteControllerPrevia).not.toHaveBeenCalled();
  });
});
