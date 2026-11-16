import { Button } from '@base-ui/react/button';
import { DeviceMobile, Monitor } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useContaControllerEncerrarOutrasSessoes } from '../../gen/hooks/useContaControllerEncerrarOutrasSessoes';
import { useContaControllerEncerrarSessao } from '../../gen/hooks/useContaControllerEncerrarSessao';
import { contaControllerObterQueryKey } from '../../gen/hooks/useContaControllerObter';
import type { MinhaSessaoDto } from '../../gen/types/MinhaSessaoDto';
import { descreverAparelho, ipParcial } from '../../lib/aparelho';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { Painel } from '../painel/Painel';
import { useAvisos } from '../toast/use-avisos';

type SessoesAbertasProps = { sessoes: MinhaSessaoDto[]; agora?: Date };

/** Sessões abertas da própria conta: encerrar uma ou todas as outras não pede confirmação. */
export function SessoesAbertas({ sessoes, agora = new Date() }: SessoesAbertasProps) {
  const queryClient = useQueryClient();
  const encerrar = useContaControllerEncerrarSessao();
  const encerrarOutras = useContaControllerEncerrarOutrasSessoes();
  const avisos = useAvisos();
  const [falhou, setFalhou] = useState(false);

  const ordenadas = [...sessoes].sort(
    (a, b) => Number(b.atual) - Number(a.atual) || b.ultimoUsoEm.localeCompare(a.ultimoUsoEm),
  );
  const paginacao = usePaginaLocal(ordenadas, 10);
  const temOutras = ordenadas.some((sessao) => !sessao.atual);
  const ocupado = encerrar.isPending || encerrarOutras.isPending;

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    setFalhou(false);
    try {
      await acao();
    } catch {
      setFalhou(true);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: contaControllerObterQueryKey() });
    avisos.sucesso(sucesso);
  };

  return (
    <Painel
      conteudoNaBorda
      titulo={
        <>
          Sessões abertas{' '}
          <span className="text-subtle-foreground font-normal tabular-nums">{sessoes.length}</span>
        </>
      }
      descricao="Encerre o que você não reconhece e troque a senha em seguida."
      acao={
        temOutras && (
          <Button
            type="button"
            disabled={ocupado}
            onClick={() =>
              void executar(
                () => encerrarOutras.mutateAsync(undefined),
                'As outras sessões foram encerradas.',
              )
            }
            className={buttonClassName({ variant: 'secondary' })}
          >
            Encerrar as outras
          </Button>
        )
      }
    >
      {falhou && (
        <div className="border-b p-4">
          <Alerta tom="erro">
            Não foi possível encerrar agora. Confira sua conexão e tente de novo.
          </Alerta>
        </div>
      )}
      <ul>
        {paginacao.itensDaPagina.map((sessao, indice) => {
          const aparelho = descreverAparelho(sessao.userAgent);
          const Icone = aparelho.movel ? DeviceMobile : Monitor;
          const ip = ipParcial(sessao.ip);
          const quando = sessao.atual ? 'Agora' : dataHoraCurta(sessao.ultimoUsoEm, agora);
          return (
            <li
              key={sessao.id}
              className={cn('flex min-h-14 items-center gap-3 px-4 py-2', indice > 0 && 'border-t')}
            >
              <Icone size={20} aria-hidden className="text-muted-foreground flex-none" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{aparelho.nome}</span>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {ip ? `${quando}, IP ${ip}` : quando}
                </span>
              </span>
              {sessao.atual ? (
                <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                  Esta sessão
                </span>
              ) : (
                <Button
                  type="button"
                  disabled={ocupado}
                  aria-label={`Encerrar sessão ${aparelho.nome}`}
                  onClick={() =>
                    void executar(
                      () => encerrar.mutateAsync({ path: { sessaoId: sessao.id } }),
                      'Sessão encerrada.',
                    )
                  }
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Encerrar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {paginacao.precisaPaginar && (
        <Paginacao
          pagina={paginacao.pagina}
          porPagina={paginacao.porPagina}
          total={paginacao.total}
          onIrPara={paginacao.irPara}
        />
      )}
    </Painel>
  );
}
