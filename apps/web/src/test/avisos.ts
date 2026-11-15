import { screen, within } from '@testing-library/react';

/** O toast de confirmação (`useAvisos`) que acabou de aparecer no canto. */
export async function acharAviso() {
  return within(await screen.findByRole('region', { name: 'Avisos' })).findByRole('dialog');
}
