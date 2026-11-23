import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { renderComRotas } from '../../test/render';
import { PainelPlantao, type PainelPlantaoProps } from './PainelPlantao';
import { ocorrencia } from './teste-dados';

const TODAS = { criar: true, editar: true, excluir: true };
const NENHUMA = { criar: false, editar: false, excluir: false };

async function montar(o: OcorrenciaDto, props: Partial<PainelPlantaoProps> = {}) {
  const acoes = {
    onEditar: vi.fn(),
    onCobertura: vi.fn(),
    onRemover: vi.fn(async () => undefined),
    onAjustar: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  renderComRotas(
    <PainelPlantao
      ocorrencia={o}
      conflitos={[]}
      permissoes={TODAS}
      podeDefinirAusencia
      {...acoes}
      {...props}
    />,
  );
  await screen.findByRole('dialog');
  return acoes;
}

describe('PainelPlantao', () => {
  it('mostra o plantão e leva às ações', async () => {
    const acoes = await montar(ocorrencia());
    expect(screen.getByRole('dialog', { name: 'Ana Souza' })).toHaveTextContent(
      'Segunda, 16/11/2026',
    );
    expect(screen.getByText('Escala fixa desde 05/01/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar alocação' }));
    expect(acoes.onEditar).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cobertura' }));
    expect(acoes.onCobertura).toHaveBeenCalled();
  });

  it('onde e ausência com as cores da frente, do turno e do tipo', async () => {
    await montar(
      ocorrencia({ ausente: true, tipoAusenciaNome: 'Férias', tipoAusenciaCor: '#5677B8' }),
    );
    const cor = (texto: string) =>
      screen.getByText(texto).parentElement?.querySelector('[data-cor]');
    expect(cor('TC Neuro')).toHaveStyle({ backgroundColor: '#1F7A4D' });
    expect(cor('Manhã')).toHaveStyle({ backgroundColor: '#214037' });
    expect(cor('Férias')).toHaveStyle({ backgroundColor: '#5677B8' });
  });

  it('definir ausência leva à tela de ausências já preenchida', async () => {
    await montar(ocorrencia());
    const link = screen.getByRole('link', { name: 'Definir ausência' });
    const url = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(url.pathname).toBe('/escala/ausencias');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      novo: '1',
      medicoId: 'm1',
      frenteId: 'f-tc',
      turnoId: 't-manha',
      de: '2026-11-16',
    });
  });

  it('remover confirma dizendo que vale para todos os dias', async () => {
    const acoes = await montar(ocorrencia());
    await userEvent.click(screen.getByRole('button', { name: 'Remover alocação' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(confirmacao).toHaveTextContent('em todos os dias');
    expect(confirmacao).toHaveTextContent('Definir ausência');
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Remover alocação' }));
    expect(acoes.onRemover).toHaveBeenCalled();
  });

  it('ajusta a produtividade do dia e volta à da escala', async () => {
    const acoes = await montar(ocorrencia({ ajustada: true, produtividade: 30 }));
    expect(screen.getByText('30 registros (na escala: 40)')).toBeInTheDocument();
    const campo = screen.getByRole('textbox', { name: 'Registros neste dia' });
    await userEvent.clear(campo);
    await userEvent.type(campo, '25');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar produtividade' }));
    expect(acoes.onAjustar).toHaveBeenCalledWith(25, null);
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à da escala' }));
    expect(acoes.onAjustar).toHaveBeenLastCalledWith(null, null);
  });

  it('cada ação segue a sua permissão', async () => {
    await montar(ocorrencia(), {
      permissoes: { criar: false, editar: true, excluir: false },
      podeDefinirAusencia: false,
    });
    expect(screen.getByRole('button', { name: 'Editar alocação' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cobertura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover alocação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Definir ausência' })).not.toBeInTheDocument();
  });

  it('só com criar e excluir, oferece cobertura e remover', async () => {
    await montar(ocorrencia(), {
      permissoes: { criar: true, editar: false, excluir: true },
      podeDefinirAusencia: true,
    });
    expect(screen.queryByRole('button', { name: 'Editar alocação' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cobertura' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover alocação' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Definir ausência' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Registros neste dia' })).not.toBeInTheDocument();
  });

  it('gratificado não tem produtividade do dia; sem permissão, nenhuma ação', async () => {
    await montar(ocorrencia({ gratificado: true }), {
      permissoes: NENHUMA,
      podeDefinirAusencia: false,
    });
    expect(screen.queryByRole('textbox', { name: 'Registros neste dia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar alocação' })).not.toBeInTheDocument();
  });

  it('cobertura: diz quem é coberto e edita a cobertura', async () => {
    const acoes = await montar(
      ocorrencia({ coberturaDe: { alocacaoId: 'a0', medicoId: 'm0', medicoNome: 'Carla Dias' } }),
    );
    expect(screen.getByText('Cobrindo Carla Dias')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar cobertura' }));
    expect(acoes.onCobertura).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Editar alocação' })).not.toBeInTheDocument();
  });

  it('avisa o conflito do dia', async () => {
    await montar(ocorrencia(), {
      conflitos: [
        {
          medicoId: 'm1',
          medicoNome: 'Ana Souza',
          data: '2026-11-16',
          a: {
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
            alocacaoId: 'a9',
            data: '2026-11-16',
            turnoId: 't-tarde',
            turnoNome: 'Tarde',
            frenteId: 'f-rm',
            frenteRotulo: 'RM Geral',
            inicio: '2026-11-16T12:00:00-03:00',
            fim: '2026-11-16T18:00:00-03:00',
          },
        },
      ],
    });
    expect(screen.getByRole('alert')).toHaveTextContent('RM Geral, Tarde (12:00–18:00)');
  });

  it('fechar com a produtividade do dia alterada pergunta antes de descartar', async () => {
    const acoes = await montar(ocorrencia());
    const campo = screen.getByRole('textbox', { name: 'Registros neste dia' });
    await userEvent.clear(campo);
    await userEvent.type(campo, '25');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
    ).toBeInTheDocument();
    expect(acoes.onFechar).not.toHaveBeenCalled();
  });
});
