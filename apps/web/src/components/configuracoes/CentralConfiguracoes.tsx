import { CaretRight } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { filtrarPorPermissao } from '../../lib/permissoes';
import { CampoBusca } from '../busca/CampoBusca';
import { buscarConfiguracoes, GRUPOS_CONFIGURACOES, type GrupoConfiguracoes } from './itens';

type CentralProps = {
  acesso: { acessoTotal: boolean; permissoes: readonly string[] };
  grupos?: GrupoConfiguracoes[];
};

export function CentralConfiguracoes({ acesso, grupos = GRUPOS_CONFIGURACOES }: CentralProps) {
  const [termo, setTermo] = useState('');
  const prefixo = useId();
  const visiveis = buscarConfiguracoes(filtrarPorPermissao(grupos, acesso), termo);

  return (
    <div className="flex max-w-[1040px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-snug font-semibold">Configurações</h1>
          <p className="text-muted-foreground">Você vê só o que o seu papel permite ajustar.</p>
        </div>
        <CampoBusca
          rotulo="Buscar configuração"
          placeholder="Buscar configuração"
          valor={termo}
          onMudar={setTermo}
          className="flex-[0_1_320px]"
        />
      </div>

      {visiveis.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma configuração encontrada para “{termo.trim()}”.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-x-8 gap-y-6">
          {visiveis.map((grupo, posicao) => (
            <section
              key={grupo.titulo}
              aria-labelledby={`${prefixo}-${posicao}`}
              className="flex flex-col gap-2"
            >
              <h2 id={`${prefixo}-${posicao}`} className="text-base font-semibold">
                {grupo.titulo}
              </h2>
              <ul className="bg-card overflow-hidden rounded-lg border">
                {grupo.itens.map((item, indice) => {
                  const Icone = item.icone;
                  return (
                    <li key={item.nome} className={cn(indice > 0 && 'border-t')}>
                      <Link
                        to={item.to}
                        hash={item.hash}
                        className="hover:bg-muted focus-visible:outline-ring flex min-h-14 items-center gap-3 py-2 pr-3 pl-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
                      >
                        <Icone size={20} aria-hidden className="text-muted-foreground flex-none" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="font-medium">{item.nome}</span>
                          <span className="text-muted-foreground text-[13px]">
                            {item.descricao}
                          </span>
                        </span>
                        <CaretRight
                          size={16}
                          aria-hidden
                          className="text-subtle-foreground flex-none"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
