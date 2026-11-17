import { cn } from '../../lib/cn';

/**
 * Bolinha com a cor que é dado (frente, turno, tipo de ausência), antes do nome. Sem cor, fica só
 * o contorno. Decorativa: o nome ao lado é o que se lê.
 */
export function BolinhaCor({ cor, className }: { cor: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      data-cor=""
      className={cn('border-border size-2 flex-none rounded-full border', className)}
      style={cor ? { backgroundColor: cor, borderColor: cor } : undefined}
    />
  );
}
