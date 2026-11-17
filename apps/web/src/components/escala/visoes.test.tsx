import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { AgendaMedico } from './AgendaMedico';
import { AusenciasDaSemana } from './AusenciasDaSemana';
import { montarCalendarios } from './agrupar';
import { descreverPlantao } from './descricao-plantao';
import { MesCalendario } from './MesCalendario';
import { SemanaCalendarios, SemanaLista, type SemanaProps } from './SemanaEscala';
import { FRENTE_RM, FRENTE_TC, frenteDoTurno, ocorrencia, turno } from './teste-dados';

const dias = [
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-20',
  '2026-11-21',
  '2026-11-22',
];
const semanaPorFrente = montarCalendarios({
  ocorrencias: [
    ocorrencia(),
    ocorrencia({
      alocacaoId: 'a2',
      medicoId: 'm2',
      medicoNome: 'Bruno Lima',
      turnoId: 't-tarde',
      turnoNome: 'Tarde',
      turnoCor: '#7A4D00',
      turnoOrdem: 2,
      horarioInicio: '13:00',
      horarioFim: '19:00',
    }),
  ],
  turnos: [
    turno(),
    turno({
      id: 't-tarde',
      nome: 'Tarde',
      cor: '#7A4D00',
      ordem: 2,
      horarioInicio: '13:00',
      horarioFim: '19:00',
      frentes: [frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo)],
    }),
  ],
  frentes: [FRENTE_TC, FRENTE_RM],
  por: 'frente',
});
const HORARIOS = { 't-manha': '07:00–13:00', 't-tarde': '13:00–19:00' };

function propsSemana(extra: Partial<SemanaProps> = {}): SemanaProps {
  return {
    ...semanaPorFrente,
    agrupar: 'frente',
    dias,
    hoje: '2026-11-17',
    conflitos: new Set(),
    horarios: HORARIOS,
    descrever: (o) =>
      descreverPlantao(o, { prioridades: new Map(), subespecialidades: new Map(), conflitos: [] }),
    onAbrir: vi.fn(),
    ...extra,
  };
}

describe('SemanaCalendarios', () => {
  it('por frente: um calendário por frente, com a contagem e uma lista só por dia', () => {
    render(<SemanaCalendarios {...propsSemana()} />);
    const tc = screen.getByRole('table', { name: 'TC Neuro' });
    expect(tc).toHaveTextContent('2 médicos, 2 plantões');
    expect(within(tc).getByRole('columnheader', { name: 'Ter 17/11' })).toHaveAttribute(
      'aria-current',
      'date',
    );
    const ana = within(tc).getByRole('button', { name: /Ana Souza/ });
    const bruno = within(tc).getByRole('button', { name: /Bruno Lima/ });
    // Uma lista só no dia, pela ordem do turno; cada turno num bloco com a faixa na cor dele.
    expect(ana.compareDocumentPosition(bruno) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ana.closest('[data-bloco]')).toHaveStyle({ borderLeftColor: '#214037' });
    expect(bruno.closest('[data-bloco]')).toHaveStyle({ borderLeftColor: '#7A4D00' });
    expect(screen.getByRole('table', { name: 'RM Geral' })).toHaveTextContent(
      'Ninguém nesta semana',
    );
  });

  it('médicos do mesmo turno no dia ficam colados num bloco só, com uma faixa', () => {
    const { calendarios, legenda } = montarCalendarios({
      ocorrencias: [ocorrencia(), ocorrencia({ alocacaoId: 'b', medicoNome: 'Bruno Lima' })],
      turnos: [turno()],
      frentes: [FRENTE_TC],
      por: 'frente',
    });
    render(<SemanaCalendarios {...propsSemana({ calendarios, legenda })} />);
    const ana = screen.getByRole('button', { name: /Ana Souza/ }).closest('[data-bloco]');
    const bruno = screen.getByRole('button', { name: /Bruno Lima/ }).closest('[data-bloco]');
    expect(ana).toBe(bruno);
  });

  it('legenda das cores dos turnos com o horário', () => {
    render(<SemanaCalendarios {...propsSemana()} />);
    const legenda = screen.getByRole('list', { name: 'Cores dos turnos' });
    expect(legenda).toHaveTextContent('Manhã07:00–13:00');
    expect(legenda).toHaveTextContent('Tarde13:00–19:00');
  });

  it('linha enxuta: horário só fora do turno, produtividade ajustada destacada', () => {
    const { calendarios, legenda } = montarCalendarios({
      ocorrencias: [
        ocorrencia({ horarioInicio: '08:00', produtividade: 5, ajustada: true }),
        ocorrencia({ alocacaoId: 'b', medicoNome: 'Bruno Lima' }),
      ],
      turnos: [turno()],
      frentes: [FRENTE_TC],
      por: 'frente',
    });
    render(<SemanaCalendarios {...propsSemana({ calendarios, legenda })} />);
    const ana = screen.getByRole('button', { name: /Ana Souza/ });
    expect(ana).toHaveTextContent('08:00–13:00');
    expect(ana).toHaveTextContent('5 reg. (ajustada neste dia)');
    const bruno = screen.getByRole('button', { name: /Bruno Lima/ });
    expect(bruno).not.toHaveTextContent('07:00');
    expect(bruno).toHaveTextContent('40 reg.');
  });

  it('selos curtos: ausência na cor do tipo, cobertura, gratificado e conflito', () => {
    const { calendarios, legenda } = montarCalendarios({
      ocorrencias: [
        ocorrencia({
          ausente: true,
          tipoAusenciaNome: 'Férias',
          tipoAusenciaCor: '#2F6FB2',
          cobertoPor: { alocacaoId: 'c', medicoId: 'm3', medicoNome: 'Carla Dias' },
        }),
        ocorrencia({ alocacaoId: 'g', medicoNome: 'Bruno Lima', gratificado: true }),
      ],
      turnos: [turno()],
      frentes: [FRENTE_TC],
      por: 'frente',
    });
    render(
      <SemanaCalendarios
        {...propsSemana({ calendarios, legenda, conflitos: new Set(['g|2026-11-16']) })}
      />,
    );
    const ana = screen.getByRole('button', { name: /Ana Souza/ });
    expect(
      within(ana).getByText('Férias').parentElement?.querySelector('[aria-hidden]'),
    ).toHaveStyle({
      backgroundColor: '#2F6FB2',
    });
    expect(ana).toHaveTextContent('Coberto por Carla Dias');
    const bruno = screen.getByRole('button', { name: /Bruno Lima/ });
    expect(bruno).toHaveTextContent('Gratificado');
    expect(bruno).toHaveTextContent('Conflito');
    expect(bruno).toHaveTextContent('cota 40');
  });

  it('o clique abre o plantão; o "+" do dia abre o alocar com a frente', async () => {
    const onAbrir = vi.fn();
    const onAlocar = vi.fn();
    render(<SemanaCalendarios {...propsSemana({ onAbrir, onAlocar })} />);
    await userEvent.click(screen.getByRole('button', { name: /Ana Souza/ }));
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ alocacaoId: 'a1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Alocar em TC Neuro, Qua 18/11' }));
    expect(onAlocar).toHaveBeenCalledWith({ data: '2026-11-18', frenteId: 'f-tc' });
  });

  it('sem permissão de editar, não há "+"', () => {
    render(<SemanaCalendarios {...propsSemana()} />);
    expect(screen.queryByRole('button', { name: /Alocar em/ })).not.toBeInTheDocument();
  });

  it('o cartão é só informativo: some quando o mouse sai da linha, mesmo indo para ele', async () => {
    render(<SemanaCalendarios {...propsSemana()} />);
    const ana = screen.getByRole('button', { name: /Ana Souza/ });
    await userEvent.hover(ana);
    const onde = await screen.findByText('Onde', {}, { timeout: 2000 });
    const popup = onde.closest('[data-side]') ?? onde.parentElement;
    expect(popup?.closest('.pointer-events-none')).not.toBeNull();
    await userEvent.unhover(ana);
    await vi.waitFor(() => expect(screen.queryByText('Onde')).not.toBeInTheDocument());
  });

  it('passando o mouse de linha em linha, o cartão acompanha todas, sem pular nenhuma', async () => {
    const { calendarios, legenda } = montarCalendarios({
      ocorrencias: ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Davi Reis'].map((nome, i) =>
        ocorrencia({ alocacaoId: `x${i}`, medicoId: `m${i}`, medicoNome: nome }),
      ),
      turnos: [turno()],
      frentes: [FRENTE_TC],
      por: 'frente',
    });
    render(<SemanaCalendarios {...propsSemana({ calendarios, legenda })} />);
    for (const nome of ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Davi Reis']) {
      await userEvent.hover(screen.getByRole('button', { name: new RegExp(nome) }));
      await vi.waitFor(
        () => expect(screen.getByText('Vigência').closest('[data-side]')).toHaveTextContent(nome),
        { timeout: 2000 },
      );
    }
  });

  it('o cartão tem as cores: frente e turno em Onde, o tipo da ausência e o selo da cobertura', async () => {
    const { calendarios, legenda } = montarCalendarios({
      ocorrencias: [
        ocorrencia({
          ausente: true,
          tipoAusenciaNome: 'Férias',
          tipoAusenciaCor: '#2F6FB2',
          cobertoPor: { alocacaoId: 'c', medicoId: 'm3', medicoNome: 'Carla Dias' },
        }),
      ],
      turnos: [turno()],
      frentes: [FRENTE_TC],
      por: 'frente',
    });
    render(<SemanaCalendarios {...propsSemana({ calendarios, legenda })} />);
    await userEvent.tab();
    const cartao = (await screen.findByText('Vigência', {}, { timeout: 2000 })).closest(
      '[data-side]',
    ) as HTMLElement;
    const cor = (texto: string) =>
      within(cartao).getByText(texto).parentElement?.querySelector('[aria-hidden]');
    expect(cor('TC Neuro')).toHaveStyle({ backgroundColor: '#1F7A4D' });
    expect(cor('Manhã')).toHaveStyle({ backgroundColor: '#214037' });
    expect(cor('Férias')).toHaveStyle({ backgroundColor: '#2F6FB2' });
    expect(within(cartao).getByText('Coberto por Carla Dias')).toHaveClass('truncate');
  });

  it('o foco na linha abre o cartão com a descrição do plantão', async () => {
    render(<SemanaCalendarios {...propsSemana()} />);
    await userEvent.tab();
    expect(await screen.findByText('Onde', {}, { timeout: 2000 })).toBeInTheDocument();
    const cartao = screen.getByText('Onde').closest('[data-side]') as HTMLElement;
    expect(within(cartao).getByText('TC Neuro')).toBeInTheDocument();
    expect(within(cartao).getByText('Manhã')).toBeInTheDocument();
    expect(screen.getByText('Sem restrição')).toBeInTheDocument();
  });

  it('por turno: o horário uma vez no título, a faixa na cor da frente e o "+" com o turno', async () => {
    const onAlocar = vi.fn();
    const porTurno = montarCalendarios({
      ocorrencias: [ocorrencia()],
      turnos: [turno()],
      frentes: [FRENTE_TC, FRENTE_RM],
      por: 'turno',
    });
    render(<SemanaCalendarios {...propsSemana({ ...porTurno, agrupar: 'turno', onAlocar })} />);
    const manha = screen.getByRole('table', { name: 'Manhã' });
    expect(within(manha).getAllByText('07:00–13:00')).toHaveLength(1);
    expect(
      within(manha)
        .getByRole('button', { name: /Ana Souza/ })
        .closest('[data-bloco]'),
    ).toHaveStyle({ borderLeftColor: '#1F7A4D' });
    expect(screen.getByRole('list', { name: 'Cores das frentes' })).toHaveTextContent('TC Neuro');
    await userEvent.click(screen.getByRole('button', { name: 'Alocar em Manhã, Seg 16/11' }));
    expect(onAlocar).toHaveBeenCalledWith({ data: '2026-11-16', turnoId: 't-manha' });
  });
});

describe('SemanaLista', () => {
  it('no celular, um bloco por dia com os médicos e a mesma faixa', () => {
    render(<SemanaLista {...propsSemana({ onAlocar: vi.fn() })} />);
    const segunda = screen.getByRole('region', { name: 'Segunda, 16/11' });
    expect(within(segunda).getByText('TC Neuro')).toBeInTheDocument();
    expect(
      within(segunda)
        .getByRole('button', { name: /Ana Souza/ })
        .closest('[data-bloco]'),
    ).toHaveStyle({ borderLeftColor: '#214037' });
    const terca = screen.getByRole('region', { name: 'Terça, 17/11' });
    expect(within(terca).getByText('Ninguém escalado.')).toBeInTheDocument();
    expect(
      within(terca).getByRole('button', { name: 'Alocar médico em 17/11' }),
    ).toBeInTheDocument();
  });
});

describe('AusenciasDaSemana', () => {
  it('uma linha por médico com a barra na cor do tipo, que abre a ausência', async () => {
    const onIrPara = vi.fn();
    renderComRotas(
      <AusenciasDaSemana
        dias={dias}
        hoje="2026-11-17"
        linhas={[
          {
            medicoId: 'm1',
            medicoNome: 'Ana Souza',
            barras: [
              {
                ausenciaId: 'x1',
                tipoNome: 'Férias',
                cor: '#2F6FB2',
                de: 0,
                ate: 2,
                dataInicio: '2026-11-10',
                dataFim: '2026-11-18',
              },
            ],
          },
        ]}
        pagina={1}
        porPagina={20}
        total={1}
        onIrPara={onIrPara}
      />,
    );
    const barra = await screen.findByRole('link', { name: 'Ana Souza: Férias, de 10/11 a 18/11' });
    expect(barra).toHaveAttribute('href', '/escala/ausencias?id=x1');
    expect(barra).toHaveStyle({ gridColumn: '2 / 5' });
    expect(screen.getByText('1 de 1')).toBeInTheDocument();
  });

  it('sem ninguém ausente, diz', async () => {
    renderComRotas(
      <AusenciasDaSemana
        dias={dias}
        hoje="2026-11-17"
        linhas={[]}
        pagina={1}
        porPagina={20}
        total={0}
        onIrPara={vi.fn()}
      />,
    );
    expect(await screen.findByText('Ninguém ausente nesta semana.')).toBeInTheDocument();
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

  it('sáb e dom vazios no mês não viram coluna; com plantão, a coluna aparece', () => {
    const { rerender } = render(
      <MesCalendario
        data="2026-11-10"
        hoje="2026-11-16"
        ocorrencias={[ocorrencia()]}
        onAbrirDia={vi.fn()}
      />,
    );
    expect(screen.queryByText('Sáb')).not.toBeInTheDocument();
    expect(screen.queryByText('Dom')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^21\/11/ })).not.toBeInTheDocument();

    rerender(
      <MesCalendario
        data="2026-11-10"
        hoje="2026-11-16"
        ocorrencias={[ocorrencia({ data: '2026-11-08', diaSemana: 0 })]}
        onAbrirDia={vi.fn()}
      />,
    );
    expect(screen.getByText('Dom')).toBeInTheDocument();
    expect(screen.queryByText('Sáb')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^22\/11/ })).toBeInTheDocument();

    rerender(
      <MesCalendario
        data="2026-11-10"
        hoje="2026-11-16"
        ocorrencias={[]}
        mostrarFimDeSemana
        onAbrirDia={vi.fn()}
      />,
    );
    expect(screen.getByText('Sáb')).toBeInTheDocument();
    expect(screen.getByText('Dom')).toBeInTheDocument();
  });
});

describe('AgendaMedico', () => {
  const descrever = (o: Parameters<typeof descreverPlantao>[0]) =>
    descreverPlantao(o, { prioridades: new Map(), subespecialidades: new Map(), conflitos: [] });
  const tarde = {
    turnoId: 't-tarde',
    turnoNome: 'Tarde',
    turnoCor: '#2F6FB2',
    turnoOrdem: 2,
    horarioInicio: '13:00',
    horarioFim: '19:00',
    inicio: '2026-11-16T13:00:00-03:00',
  };

  it('dias com plantão; no dia, os plantões por turno, com a cor do turno e da frente', () => {
    render(
      <AgendaMedico
        ocorrencias={[
          ocorrencia({ alocacaoId: 't', ...tarde, frenteId: 'f-rm', frenteRotulo: 'RM Geral' }),
          ocorrencia(),
          ocorrencia({ data: '2026-11-18', diaSemana: 3 }),
        ]}
        conflitos={new Set()}
        horarios={{ 't-manha': '07:00–13:00' }}
        descrever={descrever}
        onAbrir={vi.fn()}
      />,
    );
    expect(screen.getByText('Seg 16/11')).toBeInTheDocument();
    expect(screen.getByText('Qua 18/11')).toBeInTheDocument();
    const dia = screen.getByText('Seg 16/11').closest('li') as HTMLElement;
    const plantoes = within(dia).getAllByRole('button');
    // Sem o nome do médico (a agenda é dele): frente · turno, horário e produtividade.
    expect(plantoes.map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^TC Neuro · Manhã07:00–13:0040 reg\.$/),
      expect.stringMatching(/^RM Geral · Tarde13:00–19:0040 reg\.$/),
    ]);
    expect(plantoes[0]).not.toHaveTextContent('Ana Souza');
    // Faixa na cor do turno e bolinha na cor da frente.
    expect(plantoes[0]?.closest('[data-plantao]')).toHaveStyle({ borderLeftColor: '#214037' });
    expect(plantoes[0]?.querySelector('[data-cor-frente]')).toHaveStyle({
      backgroundColor: '#1F7A4D',
    });
  });

  it('selos como na semana, clique abre e o mouse mostra o cartão', async () => {
    const onAbrir = vi.fn();
    render(
      <AgendaMedico
        ocorrencias={[
          ocorrencia({
            ausente: true,
            tipoAusenciaNome: 'Férias',
            tipoAusenciaCor: '#2F6FB2',
            cobertoPor: { alocacaoId: 'c', medicoId: 'm3', medicoNome: 'Carla Dias' },
          }),
          ocorrencia({ alocacaoId: 'g', ...tarde, gratificado: true }),
        ]}
        conflitos={new Set(['g|2026-11-16'])}
        horarios={{}}
        descrever={descrever}
        onAbrir={onAbrir}
      />,
    );
    const manha = screen.getByRole('button', { name: /Manhã/ });
    expect(manha).toHaveTextContent('Férias');
    expect(manha).toHaveTextContent('Coberto por Carla Dias');
    const outro = screen.getByRole('button', { name: /Tarde/ });
    expect(outro).toHaveTextContent('Gratificado');
    expect(outro).toHaveTextContent('Conflito');
    expect(outro).toHaveTextContent('cota 40');

    await userEvent.hover(outro);
    expect(await screen.findByText('Onde', {}, { timeout: 2000 })).toBeInTheDocument();
    await userEvent.unhover(outro);
    await userEvent.click(manha);
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ alocacaoId: 'a1' }));
  });

  it('vazio diz que não há plantões', () => {
    render(
      <AgendaMedico
        ocorrencias={[]}
        conflitos={new Set()}
        horarios={{}}
        descrever={descrever}
        onAbrir={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum plantão deste médico no mês.')).toBeInTheDocument();
  });
});
