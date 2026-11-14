import { Avatar as BaseAvatar } from '@base-ui/react/avatar';

import { cn } from '../../lib/cn';
import { iniciais } from '../app-shell/iniciais';

const TAMANHOS = {
  sm: 'size-7 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const;

type AvatarProps = {
  nome: string;
  tamanho: keyof typeof TAMANHOS;
  /** Cores do fundo e do texto (ex.: `bg-sidebar-avatar text-sidebar-accent-foreground`). */
  className?: string;
};

/**
 * Iniciais da pessoa num círculo, sobre o Avatar do Base UI. Decorativo: o nome sempre aparece ao
 * lado, então o avatar fica fora do leitor de tela.
 */
export function Avatar({ nome, tamanho, className }: AvatarProps) {
  return (
    <BaseAvatar.Root
      aria-hidden="true"
      className={cn(
        'bg-inactive-soft text-muted-foreground inline-flex flex-none items-center justify-center rounded-full font-semibold select-none',
        TAMANHOS[tamanho],
        className,
      )}
    >
      <BaseAvatar.Fallback>{iniciais(nome)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
