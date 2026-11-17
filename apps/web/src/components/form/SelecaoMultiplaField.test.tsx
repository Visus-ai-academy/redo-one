import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useAppForm } from './form';
import type { OpcaoMultipla } from './SelecaoMultiplaField';

const POUCAS: OpcaoMultipla[] = [
  { valor: 'neuro', rotulo: 'NEURO' },
  { valor: 'mama', rotulo: 'MAMA' },
  { valor: 'msk', rotulo: 'MSK' },
  { valor: 'torax', rotulo: 'TÓRAX' },
];

const MUITAS: OpcaoMultipla[] = [
  'ABDOME',
  'CABEÇA',
  'CARDIO',
  'MAMA',
  'MSK',
  'NEURO',
  'PEDIATRIA',
  'TÓRAX',
].map((nome) => ({ valor: nome.toLowerCase(), rotulo: nome }));

function Formulario({
  opcoes = POUCAS,
  inicial = [],
  onSubmit,
  somenteLeitura,
  obrigatorio = false,
}: {
  opcoes?: OpcaoMultipla[];
  inicial?: string[];
  onSubmit: (valores: { ids: string[] }) => void;
  somenteLeitura?: boolean;
  obrigatorio?: boolean;
}) {
  const form = useAppForm({
    defaultValues: { ids: inicial },
    validators: {
      onSubmit: z.object({
        ids: obrigatorio
          ? z.array(z.string()).min(1, 'Escolha ao menos uma.')
          : z.array(z.string()),
      }),
    },
    onSubmit: ({ value }) => onSubmit(value),
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="ids">
        {(field) => (
          <field.SelecaoMultiplaField
            label="Especialidades"
            opcoes={opcoes}
            required={obrigatorio}
            description="Onde o turno lauda."
            somenteLeitura={somenteLeitura}
          />
        )}
      </form.AppField>
      <button type="submit">Enviar</button>
    </form>
  );
}

const campo = () => screen.getByRole('combobox', { name: 'Especialidades' });

describe('SelecaoMultiplaField', () => {
  it('mostra "Nenhuma" vazio e o resumo com os dois primeiros e o resto', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    expect(campo()).toHaveTextContent('Nenhuma');
    expect(campo()).toHaveAccessibleDescription('Onde o turno lauda.');
    await userEvent.click(campo());
    for (const nome of ['NEURO', 'MAMA', 'MSK', 'TÓRAX'])
      await userEvent.click(await screen.findByRole('option', { name: nome }));
    await userEvent.keyboard('{Escape}');

    expect(campo()).toHaveTextContent('NEURO, MAMA +2');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).toHaveBeenCalledWith({ ids: ['neuro', 'mama', 'msk', 'torax'] });
  });

  it('resumo segue a ordem da lista, não a dos ids salvos', () => {
    // A API devolve os ids em ordem própria (ex.: de uuid); o resumo não pode mudar por isso.
    render(<Formulario inicial={['torax', 'msk', 'neuro']} onSubmit={vi.fn()} />);

    expect(campo()).toHaveTextContent('NEURO, MSK +1');
  });

  it('desmarca ao clicar de novo', async () => {
    const onSubmit = vi.fn();
    render(<Formulario inicial={['neuro', 'mama']} onSubmit={onSubmit} />);

    expect(campo()).toHaveTextContent('NEURO, MAMA');
    await userEvent.click(campo());
    await userEvent.click(await screen.findByRole('option', { name: 'NEURO' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSubmit).toHaveBeenCalledWith({ ids: ['mama'] });
  });

  it('item inativo já marcado aparece marcado com "(inativo)"', async () => {
    render(
      <Formulario
        opcoes={[...POUCAS, { valor: 'rx', rotulo: 'RX', inativa: true }]}
        inicial={['rx']}
        onSubmit={vi.fn()}
      />,
    );

    expect(campo()).toHaveTextContent('RX (inativo)');
    await userEvent.click(campo());
    expect(await screen.findByRole('option', { name: 'RX (inativo)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('com mais de 7 opções, busca sem acento no topo da lista e marca várias', async () => {
    const onSubmit = vi.fn();
    render(<Formulario opcoes={MUITAS} onSubmit={onSubmit} />);

    await userEvent.click(campo());
    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Buscar na lista' }),
      'cabeca',
    );
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.click(screen.getByRole('option', { name: 'CABEÇA' }));
    await userEvent.clear(screen.getByRole('combobox', { name: 'Buscar na lista' }));
    await userEvent.click(screen.getByRole('option', { name: 'MSK' }));
    await userEvent.keyboard('{Escape}');

    expect(campo()).toHaveTextContent('CABEÇA, MSK');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).toHaveBeenCalledWith({ ids: ['cabeça', 'msk'] });
  });

  it('obrigatório: rótulo com * e erro do schema', async () => {
    const onSubmit = vi.fn();
    render(<Formulario obrigatorio onSubmit={onSubmit} />);

    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Escolha ao menos uma.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('somente leitura: mostra o resumo e não abre a lista', async () => {
    render(<Formulario inicial={['msk']} somenteLeitura onSubmit={vi.fn()} />);

    const caixa = screen.getByRole('textbox', { name: 'Especialidades' });
    expect(caixa).toHaveValue('MSK');
    expect(caixa).toHaveAttribute('readonly');
    expect(screen.queryByRole('combobox', { name: 'Especialidades' })).not.toBeInTheDocument();
  });

  it('agrupa por subtítulo e mostra a cor; com busca, esconde o grupo vazio', async () => {
    const poucas: OpcaoMultipla[] = [
      { valor: 'neuro', rotulo: 'NEURO', grupo: 'Especialidades', cor: '#4E8C88' },
      { valor: 'tc', rotulo: 'TC', grupo: 'Modalidades', cor: null },
    ];
    const { unmount } = render(<Formulario opcoes={poucas} onSubmit={vi.fn()} />);
    await userEvent.click(campo());
    const esp = await screen.findByRole('group', { name: 'Especialidades' });
    expect(within(esp).getByRole('option', { name: 'NEURO' })).toBeInTheDocument();
    expect(
      within(esp).getByRole('option', { name: 'NEURO' }).querySelector('[data-cor]'),
    ).toHaveStyle({ backgroundColor: '#4E8C88' });
    expect(
      screen.getByRole('option', { name: 'TC' }).querySelector('[data-cor]'),
    ).not.toHaveAttribute('style');
    unmount();

    const muitas: OpcaoMultipla[] = MUITAS.map((o, i) => ({
      ...o,
      grupo: i < 4 ? 'Especialidades' : 'Modalidades',
    }));
    render(<Formulario opcoes={muitas} onSubmit={vi.fn()} />);
    await userEvent.click(campo());
    expect(await screen.findByRole('group', { name: 'Especialidades' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar na lista' }), 'torax');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['TÓRAX']);
    expect(screen.queryByRole('group', { name: 'Especialidades' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Modalidades' })).toBeInTheDocument();
  });
});
