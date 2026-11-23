import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useRef } from 'react';

import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { controlClassName } from '../form/control-class';

type CampoBuscaProps = {
  /** Nome para o leitor de tela ("Buscar médicos"); a lupa e o placeholder dizem o resto. */
  rotulo: string;
  placeholder: string;
  valor: string;
  onMudar: (valor: string) => void;
  className?: string;
};

/**
 * Busca por texto acima de uma lista ou de um conjunto de itens, sobre o Input do Base UI. O "x"
 * nativo do navegador some; no lugar entra o ícone do sistema, que limpa e devolve o foco.
 */
export function CampoBusca({ rotulo, placeholder, valor, onMudar, className }: CampoBuscaProps) {
  const campo = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('relative', className)}>
      <MagnifyingGlass
        size={16}
        aria-hidden
        className="text-subtle-foreground pointer-events-none absolute top-2.5 left-2.5"
      />
      <Input
        ref={campo}
        type="search"
        aria-label={rotulo}
        autoComplete="off"
        spellCheck={false}
        value={valor}
        onValueChange={(texto) => onMudar(texto)}
        placeholder={placeholder}
        className={controlClassName(
          'app',
          'pr-9 pl-8 [&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {valor && (
        <Button
          type="button"
          aria-label="Limpar busca"
          onClick={() => {
            onMudar('');
            campo.current?.focus();
          }}
          className={buttonClassName({
            variant: 'ghost',
            className: 'text-muted-foreground absolute top-1 right-1 size-7 px-0',
          })}
        >
          <X size={16} aria-hidden />
        </Button>
      )}
    </div>
  );
}
