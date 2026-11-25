import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import type { AlocacaoItemDto } from '../../gen/types/AlocacaoItemDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import { escolherOpcao } from '../../test/select';
import { PainelAlocacao, type PainelAlocacaoProps } from './PainelAlocacao';
import { frenteDoTurno, turno } from './teste-dados';

/** A caixa "Sem restrição" de um campo de recorte (Prioridades ou Segmentos). */
const semRestricao = (campo: 'Prioridades' | 'Segmentos') =>
  within(screen.getByRole('group', { name: campo })).getByRole('checkbox', {
    name: 'Sem restrição',
  });

const frente = (
  id: string,
  rotulo: string,
  especialidadeId: string | null = null,
): FrenteItemDto => ({
  id,
  tipo: 'especialidade',
  especialidadeId,
  modalidadeId: null,
  destinoNome: rotulo,
  rotulo,
  descricao: null,
  cor: null,
  ordem: 1,
  ativo: true,
});

const FRENTES = [frente('f-tc', 'TC Neuro', 'e-neuro'), frente('f-rm', 'RM Geral')];
const TURNOS = [
  turno(),
  turno({
    id: 't-lista',
    nome: 'Lista 24 h',
    tipo: 'lista',
    horarioInicio: '00:00',
    horarioFim: '00:00',
    frentes: [frenteDoTurno('f-tc', 'TC Neuro')],
  }),
  turno({ id: 't-noite', nome: 'Noite', frentes: [frenteDoTurno('f-rm', 'RM Geral')] }),
];

function montar(props: Partial<PainelAlocacaoProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelAlocacao
        hoje="2026-11-16"
        turnos={TURNOS}
        frentes={FRENTES}
        prioridades={[
          { id: 'p-urg', nome: 'URGÊNCIA', cor: '#B5535A' },
          { id: 'p-int', nome: 'INTERNADO', cor: null },
        ]}
        subespecialidades={[
          { id: 's-cab', nome: 'Cabeça', ativo: true, especialidadeIds: ['e-neuro'] },
          { id: 's-msk', nome: 'Joelho', ativo: true, especialidadeIds: ['e-msk'] },
          { id: 's-avc', nome: 'AVC', ativo: false, especialidadeIds: ['e-neuro'] },
        ]}
        buscarMedicos={async () => [{ valor: 'm1', rotulo: 'Ana Souza' }]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSalvar };
}

const ALOCACAO: AlocacaoItemDto = {
  id: 'a1',
  medicoId: 'm1',
  turnoId: 't-manha',
  frenteId: 'f-tc',
  vigencia: 'fixa',
  diasSemana: [1],
  semanasDoMes: [],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  dataInicio: '2026-11-02',
  dataFim: null,
  produtividade: null,
  gratificado: false,
  subespecialidadeGeral: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  coberturaDeId: null,
  observacoes: null,
  classificacao: 'fixa',
};

async function escolherMedico() {
  await userEvent.type(screen.getByRole('combobox', { name: 'Médico' }), 'Ana');
  await userEvent.click(await screen.findByRole('option', { name: 'Ana Souza' }));
}

describe('PainelAlocacao', () => {
  it('aloca pela escala fixa: horário vem do turno', async () => {
    const { onSalvar } = montar();
    expect(screen.getByRole('dialog', { name: 'Alocar médico' })).toBeInTheDocument();

    await escolherMedico();
    await escolherOpcao('Frente', 'TC Neuro');
    await escolherOpcao('Turno', 'Manhã');
    expect(screen.getByRole('textbox', { name: 'Horário início' })).toHaveValue('07:00');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Segunda' }));
    await userEvent.click(semRestricao('Prioridades'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'URGÊNCIA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        medicoId: 'm1',
        frenteId: 'f-tc',
        turnoId: 't-manha',
        diasSemana: [1],
        dataInicio: '2026-11-16',
        dataFim: null,
        horarioInicio: '07:00',
        horarioFim: '13:00',
        prioridadeIds: ['p-urg'],
      }),
    );
  });

  it('o turno só oferece os que têm a frente; subespecialidades as da especialidade e o geral', async () => {
    montar({ inicial: { frenteId: 'f-tc' } });
    await userEvent.click(screen.getByRole('combobox', { name: 'Turno' }));
    expect(await screen.findByRole('option', { name: 'Manhã' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Noite' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('checkbox', { name: 'Cabeça' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Joelho' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Geral (sem segmento)' })).toBeInTheDocument();
  });

  it('sem frente, ou com frente sem subespecialidades, não mostra a lista de subespecialidades', async () => {
    montar();
    expect(screen.queryByRole('group', { name: 'Segmentos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Cabeça' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'RM Geral' }));
    expect(
      screen.queryByRole('checkbox', { name: 'Geral (sem segmento)' }),
    ).not.toBeInTheDocument();
  });

  it('trocar a frente desmarca as subespecialidades que não são dela', async () => {
    montar({ inicial: { frenteId: 'f-tc' } });
    await userEvent.click(semRestricao('Segmentos'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cabeça' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Geral (sem segmento)' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'RM Geral' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'TC Neuro' }));
    // RM Geral não tem segmentos: os marcados saem e o recorte volta a "Sem restrição".
    expect(semRestricao('Segmentos')).toBeChecked();
  });

  it('turno fica desativado até escolher uma frente que algum turno tenha', () => {
    montar();
    const turno = screen.getByRole('combobox', { name: 'Turno' });
    expect(turno).toBeDisabled();
    expect(turno).toHaveTextContent('Escolha a frente primeiro');
  });

  it('frente sem turno: turno desativado, dizendo isso', () => {
    montar({ frentes: [...FRENTES, frente('f-mg', 'MG')], inicial: { frenteId: 'f-mg' } });
    const turno = screen.getByRole('combobox', { name: 'Turno' });
    expect(turno).toBeDisabled();
    expect(turno).toHaveTextContent('Nenhum turno tem essa frente');
  });

  it('oferece as prioridades da operação (Internado à parte) e só as subespecialidades ativas', () => {
    montar({ inicial: { frenteId: 'f-tc' } });
    expect(screen.getByRole('checkbox', { name: 'URGÊNCIA' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'INTERNADO' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cabeça' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'AVC' })).not.toBeInTheDocument();
  });

  it('na edição mantém marcadas a prioridade e a subespecialidade inativa já gravadas', async () => {
    const { onSalvar } = montar({
      alocacao: { ...ALOCACAO, prioridadeIds: ['p-int'], subespecialidadeIds: ['s-avc'] },
      medicoNome: 'Ana Souza',
    });
    expect(screen.getByRole('checkbox', { name: 'INTERNADO' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'AVC' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'URGÊNCIA' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ prioridadeIds: ['p-int'], subespecialidadeIds: ['s-avc'] }),
    );
  });

  it('não mostra mais o aviso de catálogo', () => {
    montar();
    expect(screen.queryByText(/não vê o catálogo/)).not.toBeInTheDocument();
  });

  it('semanas do mês e recortes começam com a caixa "Todas" marcada, sem "Nada marcado"', async () => {
    montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    expect(screen.getByRole('checkbox', { name: 'Toda semana' })).toBeChecked();
    expect(semRestricao('Prioridades')).toBeChecked();
    expect(semRestricao('Segmentos')).toBeChecked();
    expect(screen.queryByText(/Nada marcado/)).not.toBeInTheDocument();
  });

  it('desmarcar "Toda semana" pede ao menos uma semana', async () => {
    const { onSalvar } = montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    await escolherMedico();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Segunda' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Toda semana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));
    expect(await screen.findByText('Marque ao menos uma semana.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('escala fixa tem "Até" opcional: vazio é sem fim, preenchido manda o fim', async () => {
    const { onSalvar } = montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    await escolherMedico();
    const ate = screen.getByLabelText('Até');
    expect(ate).not.toBeRequired();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Segunda' }));
    await userEvent.type(ate, '31/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ vigencia: 'fixa', dataFim: '2026-12-31' }),
    );
  });

  it('na edição da fixa com fim, o "Até" vem preenchido e se pode apagar', async () => {
    const { onSalvar } = montar({
      alocacao: { ...ALOCACAO, dataFim: '2026-12-31' },
      medicoNome: 'Ana Souza',
    });
    expect(screen.getByRole('radio', { name: 'Escala fixa' })).toBeChecked();
    const ate = screen.getByLabelText('Até');
    expect(ate).toHaveValue('31/12/2026');
    await userEvent.clear(ate);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ vigencia: 'fixa', dataFim: null }),
    );
  });

  it('período único marca todos os dias e pede início e fim', async () => {
    const { onSalvar } = montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    await escolherMedico();
    await userEvent.click(screen.getByRole('radio', { name: 'Período único' }));
    expect(screen.getByRole('checkbox', { name: 'Domingo' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));
    expect(await screen.findByText('Informe o fim do período.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('gratificado só em turno lista, e pede a cota', async () => {
    montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    expect(screen.queryByRole('checkbox', { name: 'Gratificado' })).not.toBeInTheDocument();
    await escolherOpcao('Turno', 'Lista 24 h');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gratificado' }));
    expect(screen.getByRole('textbox', { name: 'Cota de registros no período' })).toBeRequired();
  });

  it('na edição o médico fica travado e o erro da API aparece', async () => {
    const onSalvar = vi.fn(async () => {
      throw new ResponseError({
        status: 400,
        data: { message: 'O horário não cabe no turno.' },
        statusText: '',
        request: new Request('http://x'),
        response: new Response(),
      });
    });
    montar({ alocacao: ALOCACAO, medicoNome: 'Ana Souza', onSalvar });
    expect(screen.getByRole('dialog', { name: 'Editar alocação' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Médico' })).toHaveValue('Ana Souza');
    expect(screen.getByRole('textbox', { name: 'Médico' })).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('O horário não cabe no turno.')).toBeInTheDocument();
  });

  it('a frente separa especialidades e modalidades, com a cor', async () => {
    montar({
      frentes: [
        { ...frente('f-tc', 'TC'), tipo: 'modalidade', cor: '#8A4A4A' },
        frente('f-neuro', 'NEURO'),
      ],
    });
    await userEvent.click(screen.getByRole('combobox', { name: /Frente/ }));
    const esp = await screen.findByRole('group', { name: 'Especialidades' });
    expect(within(esp).getByRole('option', { name: 'NEURO' })).toBeInTheDocument();
    const tc = within(screen.getByRole('group', { name: 'Modalidades' })).getByRole('option', {
      name: 'TC',
    });
    expect(tc.querySelector('[data-cor]')).toHaveStyle({ backgroundColor: '#8A4A4A' });
  });

  describe('pré-preenchimento pelos arranjos do médico', () => {
    const sugestao = {
      todasPrioridades: false,
      prioridadeIds: ['p-urg'],
      todosSegmentos: false,
      subespecialidadeIds: ['s-cab'],
      subespecialidadeGeral: true,
    };

    it('ao escolher médico e frente, marca prioridades e subespecialidades sem travar as outras', async () => {
      const buscarSugestao = vi.fn(async () => sugestao);
      montar({ buscarSugestao });
      await escolherMedico();
      await escolherOpcao('Frente', 'TC Neuro');
      expect(await screen.findByRole('checkbox', { name: 'Cabeça' })).toBeChecked();
      expect(buscarSugestao).toHaveBeenCalledWith('m1', 'f-tc');
      expect(screen.getByRole('checkbox', { name: 'URGÊNCIA' })).toBeChecked();
      const geral = screen.getByRole('checkbox', { name: 'Geral (sem segmento)' });
      expect(geral).toBeChecked();
      expect(screen.getAllByText(/Veio dos arranjos do médico/)).toHaveLength(2);
      await userEvent.click(geral);
      expect(geral).not.toBeChecked();
      expect(screen.getAllByText(/Veio dos arranjos do médico/)).toHaveLength(1);
    });

    it('não sobrescreve o que a pessoa já marcou', async () => {
      const buscarSugestao = vi.fn(async () => sugestao);
      montar({ buscarSugestao, inicial: { frenteId: 'f-tc' } });
      await userEvent.click(semRestricao('Segmentos'));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Geral (sem segmento)' }));
      await escolherMedico();
      expect(await screen.findByRole('checkbox', { name: 'URGÊNCIA' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Cabeça' })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Geral (sem segmento)' })).toBeChecked();
    });

    it('trocar para um médico sem arranjo da frente desfaz a sugestão', async () => {
      const buscarSugestao = vi
        .fn<(medicoId: string, frenteId: string) => Promise<typeof sugestao | null>>()
        .mockResolvedValueOnce(sugestao)
        .mockResolvedValueOnce(null);
      montar({ buscarSugestao, inicial: { frenteId: 'f-tc' } });
      await escolherMedico();
      expect(await screen.findByRole('checkbox', { name: 'URGÊNCIA' })).toBeChecked();
      await escolherOpcao('Frente', 'RM Geral');
      await escolherOpcao('Frente', 'TC Neuro');
      // Sem a sugestão, volta a "Sem restrição" (todas marcadas).
      await vi.waitFor(() => expect(semRestricao('Prioridades')).toBeChecked());
    });

    it('na edição não busca sugestão', async () => {
      const buscarSugestao = vi.fn(async () => sugestao);
      montar({ buscarSugestao, alocacao: ALOCACAO, medicoNome: 'Ana Souza' });
      await screen.findByRole('dialog', { name: 'Editar alocação' });
      expect(buscarSugestao).not.toHaveBeenCalled();
    });
  });

  it('fechar com o formulário alterado pergunta antes de descartar', async () => {
    const onFechar = vi.fn();
    montar({ onFechar });
    await userEvent.type(screen.getByRole('textbox', { name: /Produtividade/ }), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
    ).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
  });
});
