import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgendaMedico } from './AgendaMedico';
import { montarGrade } from './agrupar';
import { CartaoPlantao } from './CartaoPlantao';
import { MesCalendario } from './MesCalendario';
import { SemanaGrade, SemanaLista } from './SemanaEscala';
import { FRENTE_RM, FRENTE_TC, frenteDoTurno, ocorrencia, turno } from './teste-dados';

describe('CartaoPlantao', () => {
  it('nome, produtividade e horário só quando difere do turno', () => {
    render(
      <CartaoPlantao
        ocorrencia={ocorrencia({ horarioInicio: '08:00' })}
        horarioDoTurno="07:00–13:00"
        onAbrir={vi.fn()}
      />,
    );
    const cartao = screen.getByRole('button', { name: /Ana Souza/ });
    expect(cartao).toHaveTextContent('08:00–13:00');
    expect(cartao).toHaveTextContent('40 registros');
  });

  it('selos de gratificado, ajustada, cobertura, ausência e conflito', () => {
    render(
      <CartaoPlantao
        ocorrencia={ocorrencia({
          gratificado: true,
          ajustada: true,
          ausente: true,
          tipoAusenciaNome: 'Férias',
          cobertoPor: { alocacaoId: 'c1', medicoId: 'm2', medicoNome: 'Bruno Lima' },
        })}
        emConflito
        onAbrir={vi.fn()}
      />,
    );
    const cartao = screen.getByRole('button', { name: /Ana Souza/ });
    for (const selo of [
      'Gratificado',
      'Ajustada',
      'Ausente: Férias',
      'Coberto por Bruno Lima',
      'Conflito',
    ]) {
      expect(cartao).toHaveTextContent(selo);
    }
  });

  it('na cobertura, diz quem está sendo coberto; clicar abre', async () => {
    const onAbrir = vi.fn();
    render(
      <CartaoPlantao
        ocorrencia={ocorrencia({
          coberturaDe: { alocacaoId: 'a0', medicoId: 'm0', medicoNome: 'Carla Dias' },
        })}
        onAbrir={onAbrir}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Cobrindo Carla Dias/ }));
    expect(onAbrir).toHaveBeenCalled();
  });
});

const dias = [
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-20',
  '2026-11-21',
  '2026-11-22',
];
const grade = montarGrade({
  ocorrencias: [ocorrencia()],
  turnos: [turno({ frentes: [frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo)] })],
  frentes: [FRENTE_TC],
  por: 'frente',
});

describe('SemanaGrade', () => {
  it('uma tabela por seção, com os dias nas colunas e o "+" que abre o alocar', async () => {
    const onAlocar = vi.fn();
    const onAbrir = vi.fn();
    render(
      <SemanaGrade
        secoes={grade}
        dias={dias}
        hoje="2026-11-17"
        conflitos={new Set()}
        horarios={{ 't-manha': '07:00–13:00' }}
        onAbrir={onAbrir}
        onAlocar={onAlocar}
      />,
    );
    const tabela = screen.getByRole('table', { name: 'TC Neuro' });
    expect(within(tabela).getByRole('columnheader', { name: /Ter 17\/11/ })).toHaveAttribute(
      'aria-current',
      'date',
    );
    expect(within(tabela).getByRole('rowheader', { name: /Manhã/ })).toBeInTheDocument();
    await userEvent.click(within(tabela).getByRole('button', { name: /Ana Souza/ }));
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ alocacaoId: 'a1' }));
    await userEvent.click(
      within(tabela).getByRole('button', { name: 'Alocar em TC Neuro, Manhã, Qua 18/11' }),
    );
    expect(onAlocar).toHaveBeenCalledWith({
      data: '2026-11-18',
      frenteId: 'f-tc',
      turnoId: 't-manha',
    });
  });

  it('sem permissão de editar, não há "+"', () => {
    render(
      <SemanaGrade
        secoes={grade}
        dias={dias}
        hoje="2026-11-17"
        conflitos={new Set()}
        horarios={{}}
        onAbrir={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Alocar em/ })).not.toBeInTheDocument();
  });

  it('por frente, o horário fica junto do turno, uma vez por linha', () => {
    render(
      <SemanaGrade
        secoes={grade}
        agrupar="frente"
        dias={dias}
        hoje="2026-11-17"
        conflitos={new Set()}
        horarios={{ 't-manha': '07:00–13:00' }}
        onAbrir={vi.fn()}
      />,
    );
    const tabela = screen.getByRole('table', { name: 'TC Neuro' });
    expect(within(tabela).getByRole('rowheader', { name: /Manhã/ })).toHaveTextContent(
      '07:00–13:00',
    );
    expect(within(tabela).getAllByText('07:00–13:00')).toHaveLength(1);
  });

  it('por turno, o horário vai uma vez no título do turno e sai das linhas de frente', () => {
    const porTurno = montarGrade({
      ocorrencias: [ocorrencia(), ocorrencia({ alocacaoId: 'a2', frenteId: FRENTE_RM.id })],
      turnos: [
        turno({
          frentes: [
            frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo),
            frenteDoTurno(FRENTE_RM.id, FRENTE_RM.rotulo),
          ],
        }),
      ],
      frentes: [FRENTE_TC, FRENTE_RM],
      por: 'turno',
    });
    render(
      <SemanaGrade
        secoes={porTurno}
        agrupar="turno"
        dias={dias}
        hoje="2026-11-17"
        conflitos={new Set()}
        horarios={{ 't-manha': '07:00–13:00' }}
        onAbrir={vi.fn()}
      />,
    );
    const tabela = screen.getByRole('table', { name: 'Manhã · 07:00–13:00' });
    expect(within(tabela).getAllByText(/07:00–13:00/)).toHaveLength(1);
    expect(within(tabela).getByRole('rowheader', { name: 'TC Neuro' })).toBeInTheDocument();
    expect(within(tabela).getByRole('rowheader', { name: 'RM Geral' })).toBeInTheDocument();
  });
});

describe('SemanaLista', () => {
  it('no celular, um bloco por dia com os plantões dele', () => {
    render(
      <SemanaLista
        secoes={grade}
        dias={dias}
        hoje="2026-11-17"
        conflitos={new Set()}
        horarios={{}}
        onAbrir={vi.fn()}
        onAlocar={vi.fn()}
      />,
    );
    const segunda = screen.getByRole('region', { name: 'Segunda, 16/11' });
    expect(within(segunda).getByText('TC Neuro, Manhã')).toBeInTheDocument();
    expect(within(segunda).getByRole('button', { name: /Ana Souza/ })).toBeInTheDocument();
    const terca = screen.getByRole('region', { name: 'Terça, 17/11' });
    expect(within(terca).getByText('Ninguém escalado.')).toBeInTheDocument();
    expect(
      within(terca).getByRole('button', { name: 'Alocar médico em 17/11' }),
    ).toBeInTheDocument();
  });
});

describe('MesCalendario', () => {
  it('conta por turno em cada dia e o clique vai para a semana', async () => {
    const onAbrirDia = vi.fn();
    render(
      <MesCalendario
        data="2026-11-10"
        hoje="2026-11-16"
        ocorrencias={[ocorrencia(), ocorrencia({ medicoId: 'm2' })]}
        onAbrirDia={onAbrirDia}
      />,
    );
    const dia = screen.getByRole('button', { name: /16\/11.*Manhã: 2/ });
    await userEvent.click(dia);
    expect(onAbrirDia).toHaveBeenCalledWith('2026-11-16');
    expect(screen.getByRole('button', { name: /^17\/11, ninguém escalado/ })).toBeInTheDocument();
  });
});

describe('AgendaMedico', () => {
  it('lista só os dias com plantão, com frente e turno', async () => {
    const onAbrir = vi.fn();
    render(
      <AgendaMedico
        ocorrencias={[ocorrencia(), ocorrencia({ data: '2026-11-18', diaSemana: 3 })]}
        conflitos={new Set()}
        horarios={{}}
        onAbrir={onAbrir}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Qua 18/11')).toBeInTheDocument();
    expect(screen.getAllByText('TC Neuro, Manhã')).toHaveLength(2);
  });

  it('vazio diz que não há plantões', () => {
    render(<AgendaMedico ocorrencias={[]} conflitos={new Set()} horarios={{}} onAbrir={vi.fn()} />);
    expect(screen.getByText('Nenhum plantão deste médico no mês.')).toBeInTheDocument();
  });
});
