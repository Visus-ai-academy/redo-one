// Peças comuns aos campos do kit: rótulo com `*` nos obrigatórios e mensagem de erro.
import { Field } from '@base-ui/react/field';
import type { ReactNode } from 'react';

export function FieldLabel({
  required,
  action,
  children,
}: {
  required: boolean;
  /** Link ou botão alinhado à direita do rótulo (ex.: "Esqueci minha senha"). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    // O `*` fica fora do <label> para não entrar no nome do campo; `required` já informa o leitor de
    // tela. Rótulo e `*` correm no mesmo texto: se o rótulo quebra linha, o `*` vai junto da última
    // palavra, nunca solto na borda.
    <div className="flex items-baseline gap-1">
      <span className="min-w-0">
        <Field.Label className="text-foreground font-medium">{children}</Field.Label>
        {required && <MarcaObrigatorio />}
      </span>
      {action && <span className="ml-auto shrink-0 text-[13px]">{action}</span>}
    </div>
  );
}

/**
 * O `*` vermelho de campo obrigatório, colado ao fim do texto do rótulo ou da legenda (espaço que
 * não quebra antes dele). Ponha logo depois do texto, num elemento que não seja flex.
 */
export function MarcaObrigatorio() {
  return (
    <span aria-hidden="true" className="text-destructive">
      {'\u00a0*'}
    </span>
  );
}

export function FieldError({ invalid, children }: { invalid: boolean; children: ReactNode }) {
  return (
    <Field.Error match={invalid} className="text-destructive text-[13px]">
      {children}
    </Field.Error>
  );
}
