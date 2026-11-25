import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { mesmaGrafia } from './etiquetas';
import { useAppForm } from './form';

function Formulario({
  inicial = [],
  onSubmit,
  sugestoes,
  obrigatorio = false,
  grafias = false,
}: {
  inicial?: string[];
  onSubmit: (valores: { itens: string[] }) => void;
  sugestoes?: string[];
  obrigatorio?: boolean;
  grafias?: boolean;
}) {
  const form = useAppForm({
    defaultValues: { itens: inicial },
    validators: {
      onSubmit: z.object({
        itens: obrigatorio
          ? z.array(z.string()).min(1, 'Informe ao menos uma.')
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
      <form.AppField name="itens">
        {(field) => (
          <field.EtiquetasField
            label="Unidades"
            placeholder="Ex.: CRD_APOIO"
            description="Unidades de destino."
            required={obrigatorio}
            sugestoes={sugestoes}
            iguais={grafias ? mesmaGrafia : undefined}
          />
        )}
      </form.AppField>
      <button type="submit">Enviar</button>
    </form>
  );
}

const campo = () => screen.getByRole('combobox', { name: /Unidades/ });
const etiquetas = () =>
  screen.queryAllByRole('button', { name: /^Remover / }).map((b) => b.getAttribute('aria-label'));
const enviar = () => userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

describe('EtiquetasField', () => {
  it('mostra os valores como etiquetas, com rótulo e descrição', () => {
    render(<Formulario inicial={['CRD_APOIO', 'OUTRA']} onSubmit={vi.fn()} />);
    expect(etiquetas()).toEqual(['Remover CRD_APOIO', 'Remover OUTRA']);
    expect(campo()).toHaveAccessibleDescription(/Unidades de destino\./);
  });

  it('Enter e vírgula criam a etiqueta sem enviar o formulário', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);
    await userEvent.type(campo(), ' CRD_APOIO {enter}OUTRA,');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(campo()).toHaveValue('');
    await enviar();
    expect(onSubmit).toHaveBeenCalledWith({ itens: ['CRD_APOIO', 'OUTRA'] });
  });

  it('× remove a etiqueta; Backspace com o campo vazio apaga a última', async () => {
    const onSubmit = vi.fn();
    render(<Formulario inicial={['A', 'B', 'C']} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover A' }));
    await userEvent.click(campo());
    await userEvent.keyboard('{Backspace}');
    expect(etiquetas()).toEqual(['Remover B']);
    await enviar();
    expect(onSubmit).toHaveBeenCalledWith({ itens: ['B'] });
  });

  it('colar uma lista (vírgula ou linha) cria todas de uma vez', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);
    await userEvent.click(campo());
    await userEvent.paste('A, B\nC\n');
    expect(etiquetas()).toEqual(['Remover A', 'Remover B', 'Remover C']);
    expect(campo()).toHaveValue('');
  });

  it('repetida não entra e o campo avisa', async () => {
    render(<Formulario inicial={['ONCO']} onSubmit={vi.fn()} />);
    await userEvent.type(campo(), 'ONCO{enter}');
    expect(etiquetas()).toEqual(['Remover ONCO']);
    expect(screen.getByRole('status')).toHaveTextContent('“ONCO” já está na lista.');
    await userEvent.type(campo(), 'P');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('com a comparação das grafias, acento e maiúsculas não fazem outra', async () => {
    render(<Formulario inicial={['Urgência']} onSubmit={vi.fn()} grafias />);
    await userEvent.click(campo());
    await userEvent.paste('URGENCIA, Rotina');
    expect(etiquetas()).toEqual(['Remover Urgência', 'Remover Rotina']);
    expect(screen.getByRole('status')).toHaveTextContent('“URGENCIA” já está na lista.');
  });

  it('o texto que ficou no campo entra ao sair dele', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);
    await userEvent.type(campo(), 'PENDENTE');
    await enviar();
    expect(onSubmit).toHaveBeenCalledWith({ itens: ['PENDENTE'] });
  });

  it('sugere da lista enquanto digita, sem as que já estão; valor livre continua valendo', async () => {
    const onSubmit = vi.fn();
    render(
      <Formulario
        inicial={['CRD_APOIO']}
        sugestoes={['CRD_APOIO', 'CRD_NORTE', 'OUTRA']}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(campo(), 'crd');
    const lista = await screen.findByRole('listbox');
    expect(
      within(lista)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['CRD_NORTE']);
    await userEvent.click(within(lista).getByRole('option', { name: 'CRD_NORTE' }));
    await userEvent.type(campo(), 'LIVRE{enter}');
    await enviar();
    expect(onSubmit).toHaveBeenCalledWith({ itens: ['CRD_APOIO', 'CRD_NORTE', 'LIVRE'] });
  });

  it('obrigatório: * no rótulo e erro ao enviar vazio', async () => {
    const onSubmit = vi.fn();
    render(<Formulario obrigatorio onSubmit={onSubmit} />);
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    await enviar();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Informe ao menos uma.')).toBeInTheDocument();
  });
});
