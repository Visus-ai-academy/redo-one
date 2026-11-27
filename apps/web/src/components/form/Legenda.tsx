import { Fieldset } from '@base-ui/react/fieldset';
import type { ReactNode } from 'react';

/** Título de um grupo de opções (Fieldset do Base UI), com o `*` nos obrigatórios. */
export function Legenda({ required, children }: { required: boolean; children: ReactNode }) {
  return (
    <Fieldset.Legend className="flex items-baseline gap-1 font-medium">
      {children}
      {required && (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      )}
    </Fieldset.Legend>
  );
}
