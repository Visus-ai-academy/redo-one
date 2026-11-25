import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { precosControllerAlterar } from '../../gen/clients/precosControllerAlterar';
import { precosControllerEncerrar } from '../../gen/clients/precosControllerEncerrar';
import { precosControllerHistorico } from '../../gen/clients/precosControllerHistorico';
import { precosControllerIncluir } from '../../gen/clients/precosControllerIncluir';
import { precosControllerListar } from '../../gen/clients/precosControllerListar';
import { precosControllerOpcoes } from '../../gen/clients/precosControllerOpcoes';
import type { ItemPrecoDto } from '../../gen/types/ItemPrecoDto';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { opcoesAPartirDe, textoDaFaixa, textoDaVigencia } from './precos';
import { TabelaPrecos } from './tabela-precos';

vi.mock('../../gen/clients/precosControllerListar', () => ({ precosControllerListar: vi.fn() }));
vi.mock('../../gen/clients/precosControllerOpcoes', () => ({ precosControllerOpcoes: vi.fn() }));
vi.mock('../../gen/clients/precosControllerHistorico', () => ({
  precosControllerHistorico: vi.fn(),
}));
vi.mock('../../gen/clients/precosControllerIncluir', () => ({ precosControllerIncluir: vi.fn() }));
vi.mock('../../gen/clients/precosControllerAlterar', () => ({ precosControllerAlterar: vi.fn() }));
vi.mock('../../gen/clients/precosControllerEncerrar', () => ({
  precosControllerEncerrar: vi.fn(),
}));

const resposta = <T,>(valor: T) => ({ unwrap: async () => valor }) as never;

const ITEM: ItemPrecoDto = {
  id: 'p1',
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT',
  valor: 63,
  vigenciaDesde: null,
  vigenciaAte: null,
  nomes: { modalidade: 'MR', especialidade: 'NEURO', categoria: 'SC', prioridade: 'ROTINA' },
  duplicado: false,
  emVigor: true,
};

beforeEach(() => {
  vi.mocked(precosControllerListar).mockReturnValue(
    resposta({
      dono: { nome: 'CEDI_RO', principal: { id: 'p', nome: 'CEDIDIAG' } },
      mesAtual: '2026-11',
      aPartirDeMinimo: '2026-11',
      aPartirDeSugerido: '2026-12',
      itens: [
        ITEM,
        { ...ITEM, id: 'p2', vigenciaDesde: '2027-01', emVigor: false, duplicado: true },
      ],
      total: 2,
      pagina: 1,
      porPagina: 10,
    }),
  );
  vi.mocked(precosControllerOpcoes).mockReturnValue(
    resposta({
      modalidades: [{ id: 'mr', nome: 'MR' }],
      especialidades: [{ id: 'neuro', nome: 'NEURO' }],
      categorias: [{ id: 'sc', nome: 'SC' }],
      prioridades: [{ id: 'rotina', nome: 'ROTINA' }],
      contratados: [],
    }),
  );
  vi.mocked(precosControllerHistorico).mockReturnValue(
    resposta([
      {
        ...ITEM,
        criadoPor: null,
        criadoEm: null,
        encerradoPor: null,
        encerradoEm: null,
      },
      {
        ...ITEM,
        id: 'p0',
        valor: 60,
        vigenciaAte: '2026-08',
        criadoPor: 'Ana',
        criadoEm: '2026-07-01T12:00:00.000Z',
        encerradoPor: 'Bia',
        encerradoEm: '2026-08-20T12:00:00.000Z',
      },
    ]),
  );
  vi.mocked(precosControllerIncluir)
    .mockReset()
    .mockReturnValue(resposta({ id: 'novo' }));
  vi.mocked(precosControllerAlterar)
    .mockReset()
    .mockReturnValue(resposta({ id: 'v2' }));
  vi.mocked(precosControllerEncerrar).mockReset().mockReturnValue(resposta(undefined));
});

describe('textos dos preços', () => {
  it('faixa, vigência e competências do "vale a partir de"', () => {
    expect(textoDaFaixa(null, null)).toBe('Sem faixa');
    expect(textoDaFaixa(300, null)).toBe('A partir de 300');
    expect(textoDaFaixa(1, 299)).toBe('1 a 299');
    expect(textoDaVigencia(null, null)).toBe('Desde sempre');
    expect(textoDaVigencia('2026-11', '2026-12')).toBe('11/2026 a 12/2026');
    expect(opcoesAPartirDe('2026-11', '2026-11')).toHaveLength(13);
  });
});

describe('TabelaPrecos', () => {
  it('lista os preços com programado e duplicado, e avisa na unidade de onde vem o que falta', async () => {
    renderComRotas(<TabelaPrecos tipo="cliente" donoId="c1" podeEditar={false} />);
    expect(await screen.findByText(/pela tabela de CEDIDIAG/)).toBeInTheDocument();
    const linhas = screen.getAllByRole('row');
    expect(within(linhas[2] as HTMLElement).getByText('Programado')).toBeInTheDocument();
    expect(within(linhas[2] as HTMLElement).getByText('Duplicado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Incluir preço' })).not.toBeInTheDocument();
  });

  it('incluir pede os campos obrigatórios e envia com a próxima competência sugerida', async () => {
    renderComRotas(<TabelaPrecos tipo="contratado" donoId="ct" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Incluir preço' }));
    await userEvent.click(screen.getByRole('button', { name: 'Incluir preço' }));
    expect(await screen.findByText('Escolha a modalidade.')).toBeInTheDocument();
    await escolherOpcao('Modalidade', 'MR');
    await escolherOpcao('Especialidade', 'NEURO');
    await escolherOpcao('Categoria', 'SC');
    await escolherOpcao('Prioridade', 'ROTINA');
    await userEvent.type(screen.getByRole('textbox', { name: /Valor/ }), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Incluir preço' }));
    await waitFor(() =>
      expect(precosControllerIncluir).toHaveBeenCalledWith({
        path: { tipo: 'contratado', donoId: 'ct' },
        body: expect.objectContaining({ valor: 70, aPartirDe: '2026-12', faixaInicio: null }),
      }),
    );
  });

  it('abrir um preço mostra o histórico do arranjo; encerrar confirma a consequência', async () => {
    renderComRotas(<TabelaPrecos tipo="cliente" donoId="c1" podeEditar />);
    await userEvent.click((await screen.findAllByText('Desde sempre'))[0] as HTMLElement);
    expect(await screen.findByText('Histórico de vigências')).toBeInTheDocument();
    expect(await screen.findByText(/encerrado em 20\/08\/2026 por Bia/)).toBeInTheDocument();
    expect(screen.getByText('Veio da carga do dashboards-one')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar preço' }));
    expect(await screen.findByText(/deixa de valer a partir de 12\/2026/)).toBeInTheDocument();
    const dialogo = screen.getByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Encerrar preço' }));
    await waitFor(() =>
      expect(precosControllerEncerrar).toHaveBeenCalledWith({
        path: { tipo: 'cliente', donoId: 'c1', precoId: 'p1' },
        body: { aPartirDe: '2026-12' },
      }),
    );
  });
});
