import { Button } from '@base-ui/react/button';
import type { ReactNode } from 'react';

import { buttonClassName } from '../button/button-class';
import { Skeleton } from '../skeleton/Skeleton';

/** Skeleton da aba: a chave e dois cartões. */
export function AbaCarregando() {
  return (
    <div aria-busy className="flex flex-col gap-3 p-4">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function AbaComErro({
  onTentarDeNovo,
  children,
}: {
  onTentarDeNovo: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className="text-muted-foreground">{children}</p>
      <Button
        type="button"
        onClick={onTentarDeNovo}
        className={buttonClassName({ variant: 'secondary' })}
      >
        Tentar de novo
      </Button>
    </div>
  );
}
