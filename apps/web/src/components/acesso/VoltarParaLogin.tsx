import { ArrowLeft } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';

import { cn } from '../../lib/cn';

export function VoltarParaLogin({ className }: { className?: string }) {
  return (
    <Link
      to="/login"
      className={cn(
        'text-primary hover:text-primary-hover inline-flex min-h-8 items-center gap-2 font-medium',
        className,
      )}
    >
      <ArrowLeft size={16} aria-hidden />
      Voltar para o login
    </Link>
  );
}
