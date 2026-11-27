import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

// Ex.: endereço começado pede logradouro e cidade; a pessoa desiste do endereço e envia de novo.

const schema = z.object({ a: z.string(), b: z.string(), c: z.string() }).superRefine((v, ctx) => {
  if (v.a.trim()) {
    ctx.addIssue({ code: 'custom', path: ['b'], message: 'Informe B.' });
    ctx.addIssue({ code: 'custom', path: ['c'], message: 'Informe C.' });
  }
});

function F({ onSubmit }: { onSubmit: () => void }) {
  const form = useAppForm({
    defaultValues: { a: '', b: '', c: '' },
    validators: { onSubmit: schema },
    onSubmit,
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="a">{(f) => <f.TextField label="A" placeholder="" />}</form.AppField>
      <form.AppField name="b">{(f) => <f.TextField label="B" placeholder="" />}</form.AppField>
      <form.AppField name="c">{(f) => <f.TextField label="C" placeholder="" />}</form.AppField>
      <button type="submit">Enviar</button>
    </form>
  );
}

it('erro cruzado em campos não tocados some quando a causa some, e o envio passa', async () => {
  const onSubmit = vi.fn();
  render(<F onSubmit={onSubmit} />);
  await userEvent.type(screen.getByRole('textbox', { name: 'A' }), 'x');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  expect(await screen.findByText('Informe B.')).toBeInTheDocument();
  await userEvent.clear(screen.getByRole('textbox', { name: 'A' }));
  await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(screen.queryByText('Informe B.')).not.toBeInTheDocument();
  expect(screen.queryByText('Informe C.')).not.toBeInTheDocument();
});
