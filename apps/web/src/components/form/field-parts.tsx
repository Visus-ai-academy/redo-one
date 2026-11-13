// Peças comuns aos campos do kit: rótulo com `*` nos obrigatórios e mensagem de erro.
import { Field } from '@base-ui/react/field';
import type { ReactNode } from 'react';

export function FieldLabel({ required, children }: { required: boolean; children: ReactNode }) {
  return (
    // O `*` fica fora do <label> para não entrar no nome do campo; `required` já informa o leitor de tela.
    <div className="flex items-baseline gap-1">
      <Field.Label className="text-foreground font-medium">{children}</Field.Label>
      {required && (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      )}
    </div>
  );
}

export function FieldError({ invalid, children }: { invalid: boolean; children: ReactNode }) {
  return (
    <Field.Error match={invalid} className="text-destructive text-[13px]">
      {children}
    </Field.Error>
  );
}
