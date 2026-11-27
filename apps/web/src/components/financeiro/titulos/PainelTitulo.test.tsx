import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import type { TituloDetalheDto } from '../../../gen/types/TituloDetalheDto';
import { renderComRotas } from '../../../test/render';
import { DialogoBaixa } from './DialogoBaixa';
import { PainelTitulo } from './PainelTitulo';

const contas = [
  { id: 'cb-1', contratadoId: 'tele', apelido: 'Itaú movimento', padraoRecebimento: false },
] as ContaBancariaItemDto[];

const titulo = (parcial: Partial<TituloDetalheDto> = {}): TituloDetalheDto =>
  ({
    id: 't1',
    tipo: 'pagar',
    numero: 41,
    contratadoId: 'tele',
    empresaNome: '001 TELEIMAGEM',
    favorecido: { tipo: 'fornecedor', id: 'f1', nome: 'Contabilidade Ômega' },
    categoriaId: 'c1',
    categoriaNome: 'Contabilidade',
    descricao: 'Honorários',
    documento: 'NF 12',
    competencia: '2026-11',
    emissaoEm: '2026-11-01',
    vencimento: '2026-11-05',
    valorCentavos: 120_000,
    pagoCentavos: 0,
    situacao: 'aberto',
    origem: 'manual',
    contaPrevistaId: 'cb-1',
    contaPrevistaNome: 'Itaú movimento',
    vencimentoOriginal: null,
    observacoes: null,
    canceladoEm: null,
    motivoCancelamento: null,
    criadoEm: '2026-11-01T12:00:00Z',
    diasDeAtraso: 22,
    baixas: [],
    ...parcial,
  }) as TituloDetalheDto;

const tudo = { editar: true, baixar: true, estornar: true, cancelar: true };
const props = {
  tipo: 'pagar' as const,
  contas,
  historico: <p>histórico</p>,
  onEditar: vi.fn(),
  onBaixar: vi.fn(async () => undefined),
  onEstornar: vi.fn(async () => undefined),
  onCancelar: vi.fn(async () => undefined),
  onProrrogar: vi.fn(async () => undefined),
  onFechar: vi.fn(),
};

describe('PainelTitulo', () => {
  it('mostra o saldo, o atraso e as ações que o papel permite', async () => {
    renderComRotas(<PainelTitulo {...props} titulo={titulo()} pode={tudo} />);

    expect(await screen.findByText('Vencido há 22 dias')).toBeInTheDocument();
    expect(screen.getByText(/Título a pagar P-0041/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dar baixa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('sem permissão, sem os botões; liquidado não se edita nem recebe baixa', async () => {
    renderComRotas(
      <PainelTitulo
        {...props}
        titulo={titulo({ situacao: 'liquidado', pagoCentavos: 120_000, diasDeAtraso: 0 })}
        pode={tudo}
      />,
    );
    expect(await screen.findByText('Liquidado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dar baixa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('com baixa ativa, o cancelar diz para estornar antes; a baixa estorna com motivo', async () => {
    const onEstornar = vi.fn(async () => undefined);
    renderComRotas(
      <PainelTitulo
        {...props}
        onEstornar={onEstornar}
        titulo={titulo({
          situacao: 'parcial',
          pagoCentavos: 20_000,
          baixas: [
            {
              id: 'b1',
              pagoEm: '2026-11-20',
              contaBancariaId: 'cb-1',
              contaNome: 'Itaú movimento',
              principalCentavos: 20_000,
              jurosCentavos: 500,
              multaCentavos: 0,
              descontoCentavos: 0,
              valorMovimentadoCentavos: 20_500,
              forma: 'pix',
              observacao: null,
              criadoPorNome: 'Ana',
              criadoEm: '2026-11-20T12:00:00Z',
              estornadaEm: null,
              estornadaPorNome: null,
              motivoEstorno: null,
            },
          ],
        })}
        pode={tudo}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Mais ações do título P-0041' }),
    );
    expect(
      await screen.findByText('Tem baixa ativa: estorne as baixas antes.'),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('tab', { name: 'Baixas (1)' }));
    const baixa = screen.getByRole('listitem', { name: 'Baixa de 20/11/2026' });
    expect(within(baixa).getByText(/juros/)).toBeInTheDocument();
    await userEvent.click(within(baixa).getByRole('button', { name: 'Estornar…' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Motivo' }), 'o Pix voltou');
    await userEvent.click(screen.getByRole('button', { name: 'Estornar baixa' }));
    await waitFor(() => expect(onEstornar).toHaveBeenCalledWith('b1', 'o Pix voltou'));
  });
});

describe('DialogoBaixa', () => {
  it('vem com o saldo e a conta prevista; parcial diz o que sobra e soma juros e multa', async () => {
    const onBaixar = vi.fn(async () => undefined);
    renderComRotas(
      <DialogoBaixa
        tipo="pagar"
        titulo={titulo()}
        contas={contas}
        onBaixar={onBaixar}
        onFechar={vi.fn()}
      />,
    );

    const valor = await screen.findByRole('textbox', { name: 'Valor pago (R$)' });
    expect(valor).toHaveValue('1.200,00');
    await userEvent.clear(valor);
    await userEvent.type(valor, '1.000,00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Juros (R$)' }), '18,40');
    await userEvent.type(screen.getByRole('textbox', { name: 'Multa (R$)' }), '24');
    expect(screen.getByText(/Parcial \(saldo de R\$\s200,00\)/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s1\.042,40/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dar baixa' }));

    await waitFor(() =>
      expect(onBaixar).toHaveBeenCalledWith(
        expect.objectContaining({
          contaBancariaId: 'cb-1',
          principalCentavos: 100_000,
          jurosCentavos: 1_840,
          multaCentavos: 2_400,
          descontoCentavos: 0,
          forma: 'pix',
        }),
      ),
    );
  });

  it('recusa valor acima do saldo', async () => {
    const onBaixar = vi.fn();
    renderComRotas(
      <DialogoBaixa
        tipo="pagar"
        titulo={titulo()}
        contas={contas}
        onBaixar={onBaixar}
        onFechar={vi.fn()}
      />,
    );
    const valor = await screen.findByRole('textbox', { name: 'Valor pago (R$)' });
    await userEvent.clear(valor);
    await userEvent.type(valor, '2.000,00');
    await userEvent.click(screen.getByRole('button', { name: 'Dar baixa' }));
    expect(await screen.findByText(/O valor passa do saldo do título/)).toBeInTheDocument();
    expect(onBaixar).not.toHaveBeenCalled();
  });
});
