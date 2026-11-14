import { Button } from '@base-ui/react/button';
import { CircleNotch } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { type ButtonSize, type ButtonVariant, buttonClassName } from '../button/button-class';
import { useFormContext } from './context';

type SubmitButtonProps = {
  children: ReactNode;
  /** Texto enquanto envia, no gerúndio da mesma ação ("Entrando…", "Salvando…"). */
  pendingLabel?: string;
  size?: ButtonSize;
  /** `secondary` quando o painel já tem outro primário (um primário por tela de ação). */
  variant?: ButtonVariant;
  className?: string;
};

export function SubmitButton({
  children,
  pendingLabel,
  size,
  variant,
  className,
}: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          type="submit"
          disabled={isSubmitting}
          focusableWhenDisabled
          className={buttonClassName({ size, variant, className })}
        >
          {isSubmitting && (
            <CircleNotch
              size={18}
              aria-hidden
              className="animate-spin motion-reduce:animate-none"
            />
          )}
          {isSubmitting && pendingLabel ? pendingLabel : children}
        </Button>
      )}
    </form.Subscribe>
  );
}
