import { Button } from '@base-ui/react/button';
import { CircleNotch } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { type ButtonSize, buttonClassName } from '../button/button-class';
import { useFormContext } from './context';

type SubmitButtonProps = {
  children: ReactNode;
  /** Texto enquanto envia, no gerúndio da mesma ação ("Entrando…", "Salvando…"). */
  pendingLabel?: string;
  size?: ButtonSize;
  className?: string;
};

export function SubmitButton({ children, pendingLabel, size, className }: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          type="submit"
          disabled={isSubmitting}
          focusableWhenDisabled
          className={buttonClassName({ size, className })}
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
