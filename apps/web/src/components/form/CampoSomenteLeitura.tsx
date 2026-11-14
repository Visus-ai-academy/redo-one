import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { controlClassName } from './control-class';

/** Dado que a pessoa vê mas não muda aqui (e-mail, CPF, papel): fundo neutro, sem `*`. */
export function CampoSomenteLeitura({
  label,
  value,
  description,
  className,
}: {
  label: string;
  value: string;
  description?: string;
  className?: string;
}) {
  return (
    <Field.Root className={cn('flex flex-col gap-2', className)}>
      <Field.Label className="text-foreground font-medium">{label}</Field.Label>
      <Field.Control
        readOnly
        value={value}
        className={controlClassName(
          'app',
          'border-border bg-background text-muted-foreground tabular-nums',
        )}
      />
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
    </Field.Root>
  );
}
