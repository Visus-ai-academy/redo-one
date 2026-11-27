import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { gradeRecebimentoControllerObter } from '../../gen/clients/gradeRecebimentoControllerObter';
import { opcoesControllerListas } from '../../gen/clients/opcoesControllerListas';
import { prioridadesOperacaoControllerListar } from '../../gen/clients/prioridadesOperacaoControllerListar';
import { regrasFrenteControllerObterEspecialidade } from '../../gen/clients/regrasFrenteControllerObterEspecialidade';
import { regrasFrenteControllerObterModalidade } from '../../gen/clients/regrasFrenteControllerObterModalidade';
import { regrasFrenteControllerSalvarEspecialidade } from '../../gen/clients/regrasFrenteControllerSalvarEspecialidade';
import { regrasFrenteControllerSalvarModalidade } from '../../gen/clients/regrasFrenteControllerSalvarModalidade';
import { turnosControllerListar } from '../../gen/clients/turnosControllerListar';
import type { RegrasFrenteDto } from '../../gen/types/RegrasFrenteDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { AbaDistribuicaoFrente } from './AbaDistribuicaoFrente';

vi.mock('../../gen/clients/opcoesControllerListas', () => ({ opcoesControllerListas: vi.fn() }));
vi.mock('../../gen/clients/prioridadesOperacaoControllerListar', () => ({
  prioridadesOperacaoControllerListar: vi.fn(),
}));
vi.mock('../../gen/clients/gradeRecebimentoControllerObter', () => ({
  gradeRecebimentoControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/turnosControllerListar', () => ({ turnosControllerListar: vi.fn() }));
vi.mock('../../gen/clients/regrasFrenteControllerObterEspecialidade', () => ({
  regrasFrenteControllerObterEspecialidade: vi.fn(),
}));
vi.mock('../../gen/clients/regrasFrenteControllerObterModalidade', () => ({
  regrasFrenteControllerObterModalidade: vi.fn(),
}));
vi.mock('../../gen/clients/regrasFrenteControllerSalvarEspecialidade', () => ({
  regrasFrenteControllerSalvarEspecialidade: vi.fn(),
}));
vi.mock('../../gen/clients/regrasFrenteControllerSalvarModalidade', () => ({
  regrasFrenteControllerSalvarModalidade: vi.fn(),
}));

const NEUTRAS: RegrasFrenteDto = {
  urgencias: [],
  recebimento: [],
  recolheAoFimDoTurno: true,
  distribuiPeloRobo: true,
  horariosSemRobo: [],
  divisao: 'igualitaria',
  proporcoes: [],
  tetoPorMedico: null,
  segmentos: [],
  mistura: [],
  listaDepoisDosFixos: false,
};

const obterEsp = vi.mocked(regrasFrenteControllerObterEspecialidade);
const obterMod = vi.mocked(regrasFrenteControllerObterModalidade);
const salvarEsp = vi.mocked(regrasFrenteControllerSalvarEspecialidade);
const salvarMod = vi.mocked(regrasFrenteControllerSalvarModalidade);

const comRegras = (regras: RegrasFrenteDto, cadastrada = true) => {
  const resposta = {
    unwrap: async () => ({
      frente: { tipo: 'especialidade', especialidadeId: 'e-mi', modalidadeId: null },
      regras,
      cadastrada,
    }),
  } as never;
  obterEsp.mockReturnValue(resposta);
  obterMod.mockReturnValue(resposta);
};

beforeEach(() => {
  vi.mocked(opcoesControllerListas).mockReturnValue({
    unwrap: async () => ({
      modalidades: [
        { id: 'm-mr', nome: 'MR', cor: null },
        { id: 'm-ct', nome: 'CT', cor: null },
      ],
      especialidades: [{ id: 'e-mi', nome: 'MEDICINA INTERNA', cor: null }],
      subespecialidades: [],
      categoriasExame: [],
      prioridades: [{ id: 'p-rot', nome: 'ROTINA', cor: null }],
      contratados: [],
    }),
  } as never);
  vi.mocked(prioridadesOperacaoControllerListar).mockReturnValue({
    unwrap: async () => [
      {
        id: 'op-urg',
        nome: 'URGÊNCIA',
        posicao: 1,
        urgencia: { tipo: 'sempre', horas: null },
        padrao: false,
        grafias: ['P1'],
      },
      {
        id: 'op-rot',
        nome: 'ROTINA',
        posicao: 3,
        urgencia: { tipo: 'nunca', horas: null },
        padrao: true,
        grafias: ['Rotina'],
      },
    ],
  } as never);
  vi.mocked(gradeRecebimentoControllerObter).mockReturnValue({
    unwrap: async () => ({
      celulas: [
        {
          prioridadeOperacaoId: 'op-rot',
          turnoId: 't-lista',
          regra: { tipo: 'prazo_minimo', horas: 24 },
        },
      ],
    }),
  } as never);
  vi.mocked(turnosControllerListar).mockReturnValue({
    unwrap: async () => ({
      itens: [
        { id: 't-manha', nome: 'Manhã' },
        { id: 't-lista', nome: 'Lista' },
      ],
      total: 2,
      pagina: 1,
      porPagina: 100,
    }),
  } as never);
  comRegras(NEUTRAS, false);
  for (const s of [salvarEsp, salvarMod]) {
    s.mockReset();
    s.mockReturnValue({ unwrap: async () => ({}) } as never);
  }
});

describe('AbaDistribuicaoFrente', () => {
  it('sem regra própria, sobrescreve só a célula ROTINA × Manhã (48 h) e a urgência da URGÊNCIA', async () => {
    renderComRotas(<AbaDistribuicaoFrente tipo="especialidade" id="e-mi" podeEditar />);
    expect(await screen.findByText(/ainda não tem regra própria/)).toBeInTheDocument();
    // A célula herdada mostra a da geral, com a marca "geral".
    const herdada = screen.getByRole('button', { name: /^ROTINA no turno Lista: .*como na geral/ });
    expect(herdada).toHaveTextContent('≥ 24 h');
    expect(herdada).toHaveTextContent('geral');
    await userEvent.click(screen.getByRole('button', { name: /^ROTINA no turno Manhã/ }));
    const editor = await screen.findByRole('dialog', { name: 'ROTINA no turno Manhã' });
    await userEvent.click(within(editor).getByRole('radio', { name: 'Prazo mínimo' }));
    const horas = within(editor).getByRole('textbox', { name: 'Horas mínimas até o prazo' });
    await userEvent.clear(horas);
    await userEvent.type(horas, '48');
    await userEvent.keyboard('{Escape}');
    await escolherOpcao('Urgência de URGÊNCIA nesta frente', 'Nunca');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(salvarEsp).toHaveBeenCalledWith({
      path: { especialidadeId: 'e-mi' },
      body: {
        ...NEUTRAS,
        urgencias: [{ prioridadeOperacaoId: 'op-urg', urgencia: { tipo: 'nunca', horas: null } }],
        recebimento: [
          {
            prioridadeOperacaoId: 'op-rot',
            turnoId: 't-manha',
            regra: { tipo: 'prazo_minimo', horas: 48 },
          },
        ],
      },
    });
    expect(await acharAviso()).toHaveTextContent('Regras da distribuição salvas.');
  });

  it('recusa a proporção que não soma 100, sem chamar a API', async () => {
    comRegras({
      ...NEUTRAS,
      divisao: 'proporcao',
      proporcoes: [
        { modalidadeId: 'm-mr', percentual: 60 },
        { modalidadeId: 'm-ct', percentual: 40 },
      ],
    });
    renderComRotas(<AbaDistribuicaoFrente tipo="especialidade" id="e-mi" podeEditar />);
    const percentual = await screen.findByRole('textbox', {
      name: 'Percentual da modalidade 2 (%)',
    });
    await userEvent.clear(percentual);
    await userEvent.type(percentual, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(await screen.findByText(/precisam somar 100 \(hoje somam 90\)/)).toBeInTheDocument();
    expect(salvarEsp).not.toHaveBeenCalled();

    // Corrigido o percentual, o erro da lista não prende o formulário.
    await userEvent.clear(percentual);
    await userEvent.type(percentual, '40');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    await vi.waitFor(() => expect(salvarEsp).toHaveBeenCalledTimes(1));
  });

  it('adiciona um horário sem robô que vira a meia-noite', async () => {
    renderComRotas(<AbaDistribuicaoFrente tipo="modalidade" id="m-ct" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar horário' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Das' }), '19:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Até' }), '07:00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(salvarMod).toHaveBeenCalledWith({
      path: { modalidadeId: 'm-ct' },
      body: {
        ...NEUTRAS,
        horariosSemRobo: [{ todosDias: true, diasSemana: [], inicio: '19:00', fim: '07:00' }],
      },
    });
  });

  it('na modalidade não há divisão por proporção', async () => {
    renderComRotas(<AbaDistribuicaoFrente tipo="modalidade" id="m-ct" podeEditar />);
    await screen.findByRole('button', { name: 'Salvar regras' });
    expect(
      screen.queryByRole('radio', { name: 'Proporção por modalidade' }),
    ).not.toBeInTheDocument();
  });

  it('adiciona um segmento com a escolha do catálogo', async () => {
    vi.mocked(opcoesControllerListas).mockReturnValue({
      unwrap: async () => ({
        modalidades: [],
        especialidades: [{ id: 'e-mi', nome: 'MEDICINA INTERNA', cor: null }],
        subespecialidades: [
          { id: 's-tor', nome: 'TÓRAX', cor: null, especialidadeIds: ['e-mi'] },
          { id: 's-out', nome: 'OUTRA', cor: null, especialidadeIds: ['e-x'] },
        ],
        categoriasExame: [],
        prioridades: [],
        contratados: [],
      }),
    } as never);
    renderComRotas(<AbaDistribuicaoFrente tipo="especialidade" id="e-mi" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar segmento' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Segmento' }));
    expect(screen.queryByRole('option', { name: 'OUTRA' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'TÓRAX' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Teto por rodada' }), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(salvarEsp).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          segmentos: [
            {
              subespecialidadeId: 's-tor',
              teto: 5,
              tetoReduzido: null,
              piso: null,
              pacoteAParte: false,
            },
          ],
        }),
      }),
    );
  });

  it('mostra a mensagem da API quando ela recusa', async () => {
    salvarEsp.mockReturnValue({
      unwrap: async () => {
        throw new ResponseError({
          status: 400,
          data: { statusCode: 400, message: 'Segmento sem nenhuma regra.' },
        } as never);
      },
    } as never);
    renderComRotas(<AbaDistribuicaoFrente tipo="especialidade" id="e-mi" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar regras' }));
    expect(await screen.findByText('Segmento sem nenhuma regra.')).toBeInTheDocument();
  });

  it('sem editar, mostra o resumo das regras', async () => {
    comRegras({
      ...NEUTRAS,
      recolheAoFimDoTurno: false,
      recebimento: [
        {
          prioridadeOperacaoId: 'op-rot',
          turnoId: 't-manha',
          regra: { tipo: 'prazo_minimo', horas: 48 },
        },
      ],
    });
    renderComRotas(<AbaDistribuicaoFrente tipo="especialidade" id="e-mi" podeEditar={false} />);
    const recolhimento = await screen.findByRole('region', { name: 'Recolhimento' });
    expect(within(recolhimento).getByText('Não recolhe')).toBeInTheDocument();
    expect(screen.getByText('Só com 48 h ou mais até o prazo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar regras' })).not.toBeInTheDocument();
  });

  it('escolhe a proporção por modalidade', async () => {
    renderComRotas(<AbaDistribuicaoFrente tipo="especialidade" id="e-mi" podeEditar />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Proporção por modalidade' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar modalidade' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar modalidade' }));
    await escolherOpcao('Modalidade 1', 'MR');
    await escolherOpcao('Modalidade 2', 'CT');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Percentual da modalidade 1 (%)' }),
      '70',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Percentual da modalidade 2 (%)' }),
      '30',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(salvarEsp).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          divisao: 'proporcao',
          proporcoes: [
            { modalidadeId: 'm-mr', percentual: 70 },
            { modalidadeId: 'm-ct', percentual: 30 },
          ],
        }),
      }),
    );
  });
});
