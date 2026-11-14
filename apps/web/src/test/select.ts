import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Abre o Select do One pelo nome do campo e escolhe a opção pelo rótulo. */
export async function escolherOpcao(campo: string, opcao: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: campo }));
  await userEvent.click(await screen.findByRole('option', { name: opcao }));
}
