import { cn } from '../../lib/cn';

/** Classes do input/select do kit. `acesso`: 44px das telas de login, recuperação e convite. */
export function controlClassName(size: 'app' | 'acesso', className?: string) {
  return cn(
    'border-input bg-card text-foreground w-full rounded-md border px-3 outline-none',
    'placeholder:text-subtle-foreground',
    'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
    'data-[invalid]:border-destructive data-[disabled]:bg-muted data-[disabled]:cursor-not-allowed',
    // 16px no celular (o iOS não dá zoom ao focar) e 14px a partir de `sm`.
    size === 'acesso' ? 'h-11 text-base' : 'h-9 text-base sm:text-sm',
    className,
  );
}
