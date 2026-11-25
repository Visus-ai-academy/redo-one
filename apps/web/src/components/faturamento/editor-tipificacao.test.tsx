import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tipificacaoClienteControllerObter } from '../../gen/clients/tipificacaoClienteControllerObter';
import { tipificacaoClienteControllerPrevia } from '../../gen/clients/tipificacaoClienteControllerPrevia';
import { tipificacaoClienteControllerRemoverVersao } from '../../gen/clients/tipificacaoClienteControllerRemoverVersao';
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
vi.mock('../../gen/clients/tipificacaoClienteControllerRemoverVersao', () => ({
  tipificacaoClienteControllerRemoverVersao: vi.fn(),
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
const EM_VIGOR = {
  regraId: 'nc',
  subregraDemaisId: 'nc-ft',
  linhas: [
    LINHA,
    {
      ...LINHA,
      valores: ['cardio'],
      modoMedico: 'todos' as const,
      medicos: [],
      subregraId: 'co-ft',
    },
  ],
};
const CONFIG: TipificacaoClienteDto = {
  cliente: { id: 'c-1', nome: 'RMPADUA', unificadoEmId: null, principalNome: null },
  configuracao: EM_VIGOR,
  doPrincipal: null,
  regraPadraoId: 'co',
  medicos: [{ id: 'rodrigo', nome: 'Rodrigo Vaz de Lima' }],
  mesAtual: '2026-11',
  aPartirDeMinimo: '2026-11',
  aPartirDeSugerido: '2026-12',
  versoes: [
    {
      id: 'v-1',
      vigenciaDesde: '2025-03',
      vigenciaAte: null,
      configuracao: EM_VIGOR,
      criadoPor: null,
      criadoEm: null,
      encerradoPor: null,
      encerradoEm: null,
    },
  ],
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
    const historico = screen.getByRole('listitem', { name: 'A partir de 03/2025' });
    expect(within(historico).getByText('Em vigor')).toBeInTheDocument();
    expect(
      within(historico).getByText('Regra principal NC; 2 linhas; todos os demais: NC-FT.'),
    ).toBeInTheDocument();
    expect(within(historico).getByText('Veio da carga do dashboards-one')).toBeInTheDocument();
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
        aPartirDe: '2026-12',
        regraId: 'nc',
        subregraDemaisId: 'nc-ft',
        linhas: [
          { valores: ['cardio'], modoMedico: 'todos', medicos: [], subregraId: 'co-ft' },
          { valores: ['mi'], modoMedico: 'apenas', medicos: ['rodrigo'], subregraId: 'nc-nf' },
        ],
      },
    });
    expect(await acharAviso()).toHaveTextContent(
      'Tipificação salva a partir de 12/2026. Os laudos das competências abertas são reclassificados em seguida.',
    );
  });

  it('"vale a partir de" vai na prévia; a competência antes dela aparece como sem mudança', async () => {
    const user = userEvent.setup();
    vi.mocked(tipificacaoClienteControllerPrevia).mockReturnValue(
      resolve([
        {
          competencia: '2026-11',
          regraId: 'nc',
          subregraId: 'nc-nf',
          fatura: false,
          antes: { laudos: 3, volume: 3 },
          depois: { laudos: 3, volume: 3 },
        },
      ]),
    );
    abrir();
    await user.click(await screen.findByRole('combobox', { name: /Vale a partir de/ }));
    const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opcoes[0]).toBe('11/2026');
    await user.click(screen.getByRole('option', { name: '01/2027' }));
    await user.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText(/antes da nova versão, não muda/)).toBeInTheDocument();
    expect(vi.mocked(tipificacaoClienteControllerPrevia).mock.calls[0]?.[0]).toMatchObject({
      body: { aPartirDe: '2027-01' },
    });
  });

  it('remover a configuração própria salva uma versão vazia', async () => {
    const user = userEvent.setup();
    vi.mocked(tipificacaoClienteControllerPrevia).mockReturnValue(resolve([]));
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Remover configuração própria' }));
    await user.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await user.click(await screen.findByRole('button', { name: 'Salvar tipificação' }));
    await waitFor(() => expect(tipificacaoClienteControllerSalvar).toHaveBeenCalled());
    expect(vi.mocked(tipificacaoClienteControllerSalvar).mock.calls[0]?.[0]).toMatchObject({
      body: { aPartirDe: '2026-12', regraId: null, subregraDemaisId: null, linhas: [] },
    });
    expect(await acharAviso()).toHaveTextContent(
      /Configuração própria removida a partir de 12\/2026/,
    );
  });

  it('a versão programada aparece no histórico e pode ser excluída', async () => {
    const user = userEvent.setup();
    vi.mocked(tipificacaoClienteControllerRemoverVersao).mockReturnValue(resolve(undefined));
    vi.mocked(tipificacaoClienteControllerObter).mockReturnValue(
      resolve({
        ...CONFIG,
        versoes: [
          {
            id: 'v-2',
            vigenciaDesde: '2026-12',
            vigenciaAte: null,
            configuracao: { regraId: null, subregraDemaisId: null, linhas: [] },
            criadoPor: 'Ana',
            criadoEm: '2026-11-20T12:00:00.000Z',
            encerradoPor: null,
            encerradoEm: null,
          },
          { ...CONFIG.versoes[0], vigenciaAte: '2026-11' },
        ],
      }),
    );
    abrir();
    expect(
      await screen.findByText(/Há uma versão programada a partir de 12\/2026/),
    ).toBeInTheDocument();
    const programada = screen.getByRole('listitem', { name: 'A partir de 12/2026' });
    expect(
      within(programada).getByText('Sem configuração própria: vale a regra padrão (CO).'),
    ).toBeInTheDocument();
    await user.click(within(programada).getByRole('button', { name: 'Excluir versão programada' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Excluir versão programada',
      }),
    );
    expect(tipificacaoClienteControllerRemoverVersao).toHaveBeenCalledWith({
      path: { clienteId: 'c-1', versaoId: 'v-2' },
    });
    expect(await acharAviso()).toHaveTextContent(/Versão de 12\/2026 excluída/);
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
