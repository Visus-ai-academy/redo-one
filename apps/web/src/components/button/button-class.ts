import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'app' | 'acesso';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-input bg-card text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  destructive: 'bg-destructive text-primary-foreground hover:bg-destructive/90',
};

/** Classes de botão do One: 36px no app, 44px nas telas de acesso; um primário por formulário. */
export function buttonClassName({
  variant = 'primary',
  size = 'app',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md px-4 font-medium',
    'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
    'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
    size === 'acesso' ? 'h-11 text-[15px]' : 'h-9',
    variants[variant],
    className,
  );
}
