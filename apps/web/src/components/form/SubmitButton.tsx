import { Button } from '@base-ui/react/button';
import type { ReactNode } from 'react';

import { useFormContext } from './context';

export function SubmitButton({ children }: { children: ReactNode }) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium shadow-xs focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}
