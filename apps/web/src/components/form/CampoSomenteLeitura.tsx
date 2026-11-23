import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';

/** Dado que a pessoa vê mas não muda aqui (e-mail, CPF, papel): o valor como texto, sem `*`. */
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
    <Field.Root className={cn('flex flex-col gap-1', className)}>
      <Field.Label className="text-foreground font-medium">{label}</Field.Label>
      <Field.Control
        readOnly
        value={value}
        // Somente leitura tem cara de texto (sem borda nem fundo de controle), diferente do
        // desabilitado; continua selecionável e lido como campo pelo leitor de tela.
        className={cn(
          'text-foreground w-full truncate bg-transparent text-base tabular-nums outline-none sm:text-sm',
          'focus-visible:outline-ring rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2',
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
