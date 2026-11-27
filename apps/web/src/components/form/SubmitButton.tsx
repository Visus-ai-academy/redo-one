import type { ReactNode } from 'react';

import { BotaoComCarregamento } from '../button/BotaoComCarregamento';
import type { ButtonSize, ButtonVariant } from '../button/button-class';
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
        // Enviando, a largura não muda: o rodapé não quebra de linha.
        <BotaoComCarregamento
          type="submit"
          carregando={isSubmitting}
          rotuloCarregando={pendingLabel}
          size={size}
          variant={variant}
          className={className}
        >
          {children}
        </BotaoComCarregamento>
      )}
    </form.Subscribe>
  );
}
