import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RecorrenciaDetalheDto } from '../../../gen/types/RecorrenciaDetalheDto';
import { renderComRotas } from '../../../test/render';
import { DialogoValeParaOsGerados } from './DialogoValeParaOsGerados';
import { PainelRecorrencia } from './PainelRecorrencia';

const recorrencia = (parcial: Partial<RecorrenciaDetalheDto> = {}) =>
  ({
    id: 'r1',
    tipo: 'pagar',
    contratadoId: 'tele',
    favorecido: { tipo: 'fornecedor', id: 'f1' },
    categoriaId: 'c1',
    descricao: 'Aluguel da sala',
    valorCentavos: 950_000,
    modoValor: 'fixo',
    frequencia: 'mensal',
    diaVencimento: 5,
    primeiroVencimento: '2026-12-05',
    ajusteDiaNaoUtil: null,
    termino: 'sem',
    terminoEm: null,
    terminoOcorrencias: null,
    contaPrevistaId: null,
    observacoes: null,
    situacao: 'ativa',
    geraAPartirDe: '2026-12-05',
    empresaNome: '001 TELEIMAGEM',
    favorecidoNome: 'Sala comercial',
    categoriaNome: 'Aluguel',
    contaPrevistaNome: null,
    encerradaEm: null,
    motivoEncerramento: null,
    criadoEm: '2026-11-27T12:00:00Z',
    ocorrencias: [1, 2, 3],
    ajusteEfetivo: 'posterga',
    horizonteMeses: 3,
    proximoAGerar: { vencimento: '2027-03-05', geradoEm: '2026-12-05' },
    ...parcial,
  }) as RecorrenciaDetalheDto;

const props = {
  tipo: 'pagar' as const,
  pode: { editar: true, criar: true, cancelar: true },
  historico: <p>histórico</p>,
  onEditar: vi.fn(),
  onPausar: vi.fn(async () => undefined),
  onRetomar: vi.fn(async () => undefined),
  onGerarProximo: vi.fn(async () => undefined),
  onEncerrar: vi.fn(async () => undefined),
  onFechar: vi.fn(),
};

describe('PainelRecorrencia', () => {
  it('mostra a agenda e o próximo a gerar; ativa pausa, gera o próximo e encerra com motivo', async () => {
    const onEncerrar = vi.fn(async () => undefined);
    renderComRotas(
      <PainelRecorrencia {...props} onEncerrar={onEncerrar} recorrencia={recorrencia()} />,
    );

    expect(await screen.findByText('Mensal, dia 5')).toBeInTheDocument();
    expect(screen.getByText('05/03/2027, em 05/12/2026')).toBeInTheDocument();
    expect(screen.getByText(/(padrão da empresa)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações de Aluguel da sala' }));
    expect(await screen.findByRole('menuitem', { name: 'Pausar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Gerar o próximo agora' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Encerrar…' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Motivo' }), 'mudamos de sala');
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar recorrência' }));
    await waitFor(() => expect(onEncerrar).toHaveBeenCalledWith('mudamos de sala'));
  });

  it('pausada oferece retomar; encerrada não edita nem tem ações', async () => {
    const { unmount } = renderComRotas(
      <PainelRecorrencia {...props} recorrencia={recorrencia({ situacao: 'pausada' })} />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mais ações de Aluguel da sala' }),
    );
    expect(await screen.findByRole('menuitem', { name: 'Retomar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Gerar o próximo agora' }),
    ).not.toBeInTheDocument();
    unmount();

    renderComRotas(
      <PainelRecorrencia {...props} recorrencia={recorrencia({ situacao: 'encerrada' })} />,
    );
    await screen.findAllByText('Encerrada');
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument();
  });
});

describe('DialogoValeParaOsGerados', () => {
  it('lista os títulos que mudam e manda a escolha', async () => {
    const onConfirmar = vi.fn(async () => undefined);
    renderComRotas(
      <DialogoValeParaOsGerados
        tipo="pagar"
        ajustaveis={[
          { id: 't1', numero: 45, vencimento: '2026-12-07' },
          { id: 't2', numero: 51, vencimento: '2027-01-05' },
        ]}
        onConfirmar={onConfirmar}
        onFechar={vi.fn()}
      />,
    );
    expect(await screen.findByText('P-0045 · 07/12/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Só nos que ainda vão ser gerados' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith(false));
  });
});
