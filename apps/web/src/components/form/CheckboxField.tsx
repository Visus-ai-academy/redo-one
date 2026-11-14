import { useId } from 'react';

import { cn } from '../../lib/cn';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from './context';

type CheckboxFieldProps = {
  label: string;
  description?: string;
  className?: string;
};

/** Caixa de marcar no kit de formulário: o texto ao lado, a ajuda abaixo dele. */
export function CheckboxField({ label, description, className }: CheckboxFieldProps) {
  const field = useFieldContext<boolean>();
  const ajudaId = useId();

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: o controle do Base UI fica dentro do label. */}
      <label className="flex items-center gap-2 font-medium">
        <CaixaDeSelecao
          checked={field.state.value}
          onCheckedChange={(marcada) => {
            field.handleChange(marcada);
            field.handleBlur();
          }}
          aria-describedby={description ? ajudaId : undefined}
        />
        {label}
      </label>
      {description && (
        <span id={ajudaId} className="text-muted-foreground pl-6 text-[13px]">
          {description}
        </span>
      )}
    </div>
  );
}
