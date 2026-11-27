import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { precosRepasseControllerIncluir } from '../../gen/clients/precosRepasseControllerIncluir';
import { precosRepasseControllerListar } from '../../gen/clients/precosRepasseControllerListar';
import { precosRepasseControllerOpcoes } from '../../gen/clients/precosRepasseControllerOpcoes';
import { regrasMedicoControllerContagem } from '../../gen/clients/regrasMedicoControllerContagem';
import { regrasMedicoControllerNovaContagem } from '../../gen/clients/regrasMedicoControllerNovaContagem';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { AbaRepasseMedico, type AbaRepasseMedicoProps } from './AbaRepasseMedico';
import { arranjoDoAtalho } from './fonte-precos';
import { campoDoPpm, percentualDePpm, ppmDoCampo } from './textos';

vi.mock('../../gen/clients/precosRepasseControllerListar', () => ({
  precosRepasseControllerListar: vi.fn(),
}));
vi.mock('../../gen/clients/precosRepasseControllerOpcoes', () => ({
  precosRepasseControllerOpcoes: vi.fn(),
}));
vi.mock('../../gen/clients/precosRepasseControllerIncluir', () => ({
  precosRepasseControllerIncluir: vi.fn(),
}));
vi.mock('../../gen/clients/regrasMedicoControllerContagem', () => ({
  regrasMedicoControllerContagem: vi.fn(),
}));
vi.mock('../../gen/clients/regrasMedicoControllerNovaContagem', () => ({
  regrasMedicoControllerNovaContagem: vi.fn(),
}));

const resposta = <T,>(valor: T) => ({ unwrap: async () => valor }) as never;
const ID = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const [MR, NEURO, SC, ROTINA, HOSP] = [ID(1), ID(2), ID(3), ID(4), ID(5)];

beforeEach(() => {
  vi.mocked(precosRepasseControllerListar).mockReturnValue(
    resposta({
      medico: { nome: 'Ana' },
      mesAtual: '2026-11',
      aPartirDeMinimo: '2026-11',
      aPartirDeSugerido: '2026-12',
      itens: [
        {
          id: 'p1',
          modalidadeId: MR,
          especialidadeId: NEURO,
          categoriaId: SC,
          prioridadeId: ROTINA,
          todosClientes: true,
          clienteId: null,
          valor: 32.07,
          vigenciaDesde: null,
          vigenciaAte: null,
          nomes: {
            modalidade: 'MR',
            especialidade: 'NEURO',
            categoria: 'SC',
            prioridade: 'ROTINA',
            cliente: null,
          },
          duplicado: false,
          emVigor: true,
        },
      ],
      total: 1,
      pagina: 1,
      porPagina: 10,
    }),
  );
  vi.mocked(precosRepasseControllerOpcoes).mockReturnValue(
    resposta({
      modalidades: [{ id: MR, nome: 'MR' }],
      especialidades: [{ id: NEURO, nome: 'NEURO' }],
      categorias: [{ id: SC, nome: 'SC' }],
      prioridades: [{ id: ROTINA, nome: 'ROTINA' }],
      clientes: [{ id: HOSP, nome: 'HOSPITAL X' }],
      equipes: [],
      contratados: [],
    }),
  );
  vi.mocked(precosRepasseControllerIncluir)
    .mockReset()
    .mockReturnValue(resposta({ id: 'novo' }));
  vi.mocked(regrasMedicoControllerContagem).mockReturnValue(
    resposta({
      mesAtual: '2026-11',
      aPartirDeMinimo: '2026-11',
      aPartirDeSugerido: '2026-12',
      versoes: [],
    }),
  );
  vi.mocked(regrasMedicoControllerNovaContagem)
    .mockReset()
    .mockReturnValue(resposta({ id: 'c1' }));
});

const aba = (extra: Partial<AbaRepasseMedicoProps> = {}) => (
  <AbaRepasseMedico
    medicoId="m1"
    medicoNome="Ana"
    podeLancar={false}
    podeLancarNaFechada={false}
    podeEditarPrecos
    podeEditarRegras
    veAvisos={false}
    {...extra}
  />
);

describe('AbaRepasseMedico', () => {
  it('preços: arranjo × cliente com "Todos os clientes" explícito', async () => {
    renderComRotas(aba());
    expect(await screen.findByText('Todos os clientes')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toBeInTheDocument();
  });

  it('o atalho do aviso abre "Incluir preço" já com o arranjo; o cliente é obrigatório', async () => {
    renderComRotas(aba({ arranjo: arranjoDoAtalho([MR, NEURO, SC, ROTINA].join('.')) }));
    expect(await screen.findByRole('heading', { name: 'Novo preço' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Modalidade/ })).toHaveTextContent('MR');
    await userEvent.type(screen.getByRole('textbox', { name: /Valor/ }), '45,00');
    await userEvent.click(screen.getByRole('button', { name: 'Incluir preço' }));
    expect(
      await screen.findByText('Escolha o cliente ou "Todos os clientes".'),
    ).toBeInTheDocument();
    await escolherOpcao('Cliente', 'HOSPITAL X');
    await userEvent.click(screen.getByRole('button', { name: 'Incluir preço' }));
    await waitFor(() =>
      expect(precosRepasseControllerIncluir).toHaveBeenCalledWith({
        path: { medicoId: 'm1' },
        body: expect.objectContaining({
          modalidadeId: MR,
          todosClientes: false,
          clienteId: HOSP,
          valor: 45,
          aPartirDe: '2026-12',
        }),
      }),
    );
  });

  it('regras: nova versão com recortes, "Todos os clientes" explícito', async () => {
    renderComRotas(aba({ parteInicial: 'regras' }));
    expect(await screen.findByText('Como os laudos contam hoje')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('radio', { name: 'Só os recortes cliente × especialidade' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Incluir recorte' }));
    await escolherOpcao('Cliente do recorte 1', 'Todos os clientes');
    await escolherOpcao('Especialidade do recorte 1', 'NEURO');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));
    await waitFor(() =>
      expect(regrasMedicoControllerNovaContagem).toHaveBeenCalledWith({
        path: { medicoId: 'm1' },
        body: {
          aPartirDe: '2026-12',
          modo: 'recortes',
          recortes: [
            {
              todosClientes: true,
              clienteId: null,
              todasEspecialidades: false,
              especialidadeId: NEURO,
            },
          ],
        },
      }),
    );
  });
});

describe('textos do repasse do médico', () => {
  it('percentual em partes por milhão', () => {
    expect(percentualDePpm(60000)).toBe('6%');
    expect(ppmDoCampo('2.5')).toBe(25000);
    expect(ppmDoCampo('')).toBeNull();
    expect(campoDoPpm(25000)).toBe('2.5');
    expect(campoDoPpm(null)).toBe('');
  });

  it('percentual vai e volta do campo sem mudar o valor gravado', () => {
    for (const ppm of [1, 25000, 60000, 123456, 1_000_000, 333_333]) {
      expect(ppmDoCampo(campoDoPpm(ppm))).toBe(ppm);
    }
    expect(arranjoDoAtalho('x.y')).toBeUndefined();
  });
});
