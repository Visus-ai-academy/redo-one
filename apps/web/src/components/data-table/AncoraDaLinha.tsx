import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../lib/cn';

/** A âncora do `LinkDaLinha` (nas telas, use o `LinkDaLinha`, que é o link do router). */
export function AncoraDaLinha({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a
      // O `DataTable` segue este link ao clicar em qualquer ponto da linha.
      data-abre-linha=""
      {...props}
      className={cn(
        'text-foreground font-medium hover:underline',
        'focus-visible:outline-ring rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    />
  );
}
