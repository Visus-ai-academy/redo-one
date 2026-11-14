import { Input } from '@base-ui/react/input';
import { MagnifyingGlass } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';
import { controlClassName } from '../form/control-class';

type CampoBuscaProps = {
  /** Nome para o leitor de tela ("Buscar médicos"); a lupa e o placeholder dizem o resto. */
  rotulo: string;
  placeholder: string;
  valor: string;
  onMudar: (valor: string) => void;
  className?: string;
};

/** Busca por texto acima de uma lista ou de um conjunto de itens, sobre o Input do Base UI. */
export function CampoBusca({ rotulo, placeholder, valor, onMudar, className }: CampoBuscaProps) {
  return (
    <div className={cn('relative', className)}>
      <MagnifyingGlass
        size={16}
        aria-hidden
        className="text-subtle-foreground pointer-events-none absolute top-2.5 left-2.5"
      />
      <Input
        type="search"
        aria-label={rotulo}
        value={valor}
        onValueChange={(texto) => onMudar(texto)}
        placeholder={placeholder}
        className={controlClassName('app', 'pl-8')}
      />
    </div>
  );
}
