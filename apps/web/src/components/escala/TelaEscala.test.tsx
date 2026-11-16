import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { TelaEscala, type TelaEscalaProps } from './TelaEscala';
import { FRENTE_RM, FRENTE_TC, ocorrencia, turno } from './teste-dados';

const conflito = {
  medicoId: 'm1',
  medicoNome: 'Ana Souza',
  data: '2026-11-16',
  a: {
    foraDoRecorte: false,
    alocacaoId: 'a1',
    data: '2026-11-16',
    turnoId: 't-manha',
    turnoNome: 'Manhã',
    frenteId: 'f-tc',
    frenteRotulo: 'TC Neuro',
    inicio: '2026-11-16T07:00:00-03:00',
    fim: '2026-11-16T13:00:00-03:00',
  },
  b: {
    foraDoRecorte: false,
    alocacaoId: 'a9',
    data: '2026-11-16',
    turnoId: 't-tarde',
    turnoNome: 'Tarde',
    frenteId: 'f-rm',
    frenteRotulo: 'RM Geral',
    inicio: '2026-11-16T12:00:00-03:00',
    fim: '2026-11-16T18:00:00-03:00',
  },
};

async function montar(props: Partial<TelaEscalaProps> = {}) {
  const acoes = {
    onMudar: vi.fn(),
    onAbrirPlantao: vi.fn(),
    onAlocar: vi.fn(),
    onDispensarAvisos: vi.fn(),
    onTentarDeNovo: vi.fn(),
  };
  renderComRotas(
    <TelaEscala
      filtros={{ modo: 'semana', agrupar: 'frente', data: '2026-11-18' }}
      hoje="2026-11-16"
      dados={{
        ocorrencias: [ocorrencia(), ocorrencia({ medicoNome: 'Bruno Lima', alocacaoId: 'b' })],
        conflitos: [],
      }}
      atualizando={false}
      erro={false}
      turnos={[turno()]}
      frentes={[FRENTE_TC, FRENTE_RM]}
      medico={null}
      buscarMedicos={async () => []}
      podeEditar
      podeVerHistorico
      avisos={[]}
      {...acoes}
      {...props}
    />,
  );
  await screen.findByRole('heading', { name: 'Escala', level: 1 });
  return acoes;
}

describe('TelaEscala', () => {
  it('cabeçalho: período, navegação, modo, histórico e alocar', async () => {
    const acoes = await montar();
    expect(screen.getByText('16/11 a 22/11/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Semana seguinte' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ data: '2026-11-25' });
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ data: '2026-11-16' });
    await userEvent.click(screen.getByRole('button', { name: 'Mês' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ modo: 'mes' });
    await userEvent.click(screen.getByRole('button', { name: 'Por turno' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ agrupar: 'turno' });
    expect(screen.getByRole('link', { name: /Histórico/ })).toHaveAttribute(
      'href',
      '/escala/historico',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));
    expect(acoes.onAlocar).toHaveBeenCalledWith({});
  });

  it('sem permissão, sem alocar nem histórico', async () => {
    await montar({ podeEditar: false, podeVerHistorico: false });
    expect(screen.queryByRole('button', { name: 'Alocar médico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Histórico/ })).not.toBeInTheDocument();
  });

  it('a busca aceita espaço ao digitar e manda o texto aparado depois de uma pausa', async () => {
    const acoes = await montar();
    const campo = screen.getByRole('searchbox', { name: 'Buscar médico na escala' });
    await userEvent.type(campo, 'Murilo Si ');
    expect(campo).toHaveValue('Murilo Si ');
    await vi.waitFor(() => expect(acoes.onMudar).toHaveBeenLastCalledWith({ busca: 'Murilo Si' }));
    expect(acoes.onMudar).not.toHaveBeenCalledWith({ busca: 'Murilo' });
  });

  it('a busca de médico filtra os cartões', async () => {
    await montar({
      filtros: { modo: 'semana', agrupar: 'frente', data: '2026-11-18', busca: 'bru' },
    });
    const grade = screen.getByRole('table', { name: 'TC Neuro' });
    expect(within(grade).getByRole('button', { name: /Bruno Lima/ })).toBeInTheDocument();
    expect(within(grade).queryByRole('button', { name: /Ana Souza/ })).not.toBeInTheDocument();
  });

  it('avisos de conflito depois de salvar, sem bloquear', async () => {
    const acoes = await montar({ avisos: [conflito] });
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent(
      '16/11: TC Neuro, Manhã (07:00–13:00) e RM Geral, Tarde (12:00–18:00)',
    );
    await userEvent.click(within(aviso).getByRole('button', { name: 'Entendi' }));
    expect(acoes.onDispensarAvisos).toHaveBeenCalled();
  });

  it('aviso com uma ponta fora do recorte não mostra o detalhe dela', async () => {
    await montar({
      avisos: [{ ...conflito, b: { foraDoRecorte: true, data: '2026-11-16' } }],
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '16/11: TC Neuro, Manhã (07:00–13:00) e um plantão fora do seu recorte nesse dia',
    );
  });

  it('plantão do dia anterior não vira cartão na semana', async () => {
    await montar({
      dados: {
        ocorrencias: [
          ocorrencia({ medicoNome: 'Noturno Antigo', data: '2026-11-15', doDiaAnterior: true }),
          ocorrencia(),
        ],
        conflitos: [],
      },
    });
    expect(screen.queryByRole('button', { name: /Noturno Antigo/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ana Souza/ }).length).toBeGreaterThan(0);
  });

  it('mês: clicar no dia vai para a semana dele', async () => {
    const acoes = await montar({ filtros: { modo: 'mes', agrupar: 'frente', data: '2026-11-18' } });
    expect(screen.getByText('Novembro de 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^16\/11/ }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ modo: 'semana', data: '2026-11-16' });
  });

  it('por médico sem médico escolhido pede a escolha', async () => {
    await montar({
      filtros: { modo: 'medico', agrupar: 'frente', data: '2026-11-18' },
      dados: undefined,
    });
    expect(
      screen.getByText('Escolha um médico para ver a agenda dele no mês.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Médico' })).toBeInTheDocument();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const acoes = await montar({ dados: undefined, erro: true });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(acoes.onTentarDeNovo).toHaveBeenCalled();
  });
});
