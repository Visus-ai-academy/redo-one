import { Fieldset } from '@base-ui/react/fieldset';
import type { ReactNode } from 'react';
import { MarcaObrigatorio } from './field-parts';

/** Título de um grupo de opções (Fieldset do Base UI), com o `*` nos obrigatórios. */
export function Legenda({ required, children }: { required: boolean; children: ReactNode }) {
  return (
    <Fieldset.Legend className="font-medium">
      {children}
      {required && <MarcaObrigatorio />}
    </Fieldset.Legend>
  );
}
