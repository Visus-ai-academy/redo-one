import { Field } from '@base-ui/react/field';
import { Toggle } from '@base-ui/react/toggle';
import { Eye, EyeSlash, Warning } from '@phosphor-icons/react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';

type PasswordFieldProps = {
  label: string;
  placeholder: string;
  autoComplete: 'current-password' | 'new-password';
  required?: boolean;
  description?: string;
  labelAction?: ReactNode;
  size?: 'app' | 'acesso';
  className?: string;
};

export function PasswordField({
  label,
  placeholder,
  autoComplete,
  required = false,
  description,
  labelAction,
  size = 'app',
  className,
}: PasswordFieldProps) {
  const field = useFieldContext<string>();
  const [visivel, setVisivel] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const errors = field.state.meta.errors.map((error) =>
    typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message,
  );
  const invalid = errors.length > 0;

  const verificarCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'));

  return (
    <Field.Root
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required} action={labelAction}>
        {label}
      </FieldLabel>
      <div className="relative">
        <Field.Control
          type={visivel ? 'text' : 'password'}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={field.state.value}
          onValueChange={(value) => field.handleChange(value)}
          onBlur={field.handleBlur}
          onKeyUp={verificarCapsLock}
          onKeyDown={verificarCapsLock}
          className={controlClassName(size, size === 'acesso' ? 'pr-12' : 'pr-10')}
        />
        <Toggle
          aria-label="Mostrar senha"
          pressed={visivel}
          onPressedChange={setVisivel}
          className={cn(
            'text-muted-foreground hover:text-foreground focus-visible:outline-ring absolute top-0.5 right-0.5 flex items-center justify-center rounded-md focus-visible:outline-2',
            size === 'acesso' ? 'size-10' : 'size-8',
          )}
        >
          {visivel ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </Toggle>
      </div>
      {capsLock && (
        <Field.Description className="text-warning flex items-center gap-2 text-[13px]">
          <Warning size={16} aria-hidden />
          Caps Lock está ativado.
        </Field.Description>
      )}
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}
