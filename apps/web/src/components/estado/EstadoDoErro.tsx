import { Button } from '@base-ui/react/button';
import {
  ArrowClockwise,
  ArrowsClockwise,
  LockKey,
  MagnifyingGlass,
  SignIn,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react';
import { Link, type LinkProps, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { enderecoDoLogin } from '../../lib/api';
import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { mensagemDoErro, tipoDoErro } from './tipo-do-erro';

type EstadoDoErroProps = {
  /** O erro da chamada (o `error` do `useQuery` ou o que a mutação lançou). */
  erro: unknown;
  /** O que não carregou, com artigo: "o médico", "a rodada", "os exames". */
  oQue: string;
  /** Recarrega o bloco ("Tentar de novo"; no 409, "Recarregar"). */
  onTentarDeNovo?: () => void;
  /** Caminho de volta no 404 (ex.: `{ to: '/cadastros/medicos', rotulo: 'Voltar para Médicos' }`). */
  voltar?: { to: LinkProps['to']; rotulo: string };
  className?: string;
};

/**
 * Estado certo para cada falha da API, no lugar do bloco que falhou (o resto da tela continua):
 * 401 leva ao login e volta; 403 diz quem libera; 404 dá o caminho de volta; 409 oferece
 * recarregar; 500, rede e tempo dizem o que houve e deixam tentar de novo.
 *
 * Ex.: `if (error) return <EstadoDoErro erro={error} oQue="o médico" onTentarDeNovo={refetch} voltar={…} />`
 */
export function EstadoDoErro({ erro, oQue, onTentarDeNovo, voltar, className }: EstadoDoErroProps) {
  const local = useLocation({ select: (l) => l.href });
  const tipo = tipoDoErro(erro);

  const tentar = (rotulo = 'Tentar de novo') =>
    onTentarDeNovo && (
      <Button
        type="button"
        onClick={onTentarDeNovo}
        className={buttonClassName({ variant: 'secondary' })}
      >
        <ArrowClockwise size={16} aria-hidden />
        {rotulo}
      </Button>
    );

  switch (tipo) {
    case 'sessao':
      return (
        <Bloco
          className={className}
          icone={<SignIn size={20} aria-hidden />}
          titulo="Sua sessão expirou"
          texto="Entre de novo para continuar. Depois de entrar, você volta para esta tela."
          acao={
            <a href={enderecoDoLogin(local)} className={buttonClassName()}>
              Entrar de novo
            </a>
          }
        />
      );
    case 'permissao':
      return (
        <Bloco
          className={className}
          icone={<LockKey size={20} aria-hidden />}
          titulo={`Sem permissão para ver ${oQue}`}
          texto="Seu papel não dá acesso a isto. Se precisar, peça a quem administra o One para liberar no seu papel."
        />
      );
    case 'nao-encontrado':
      return (
        <Bloco
          className={className}
          icone={<MagnifyingGlass size={20} aria-hidden />}
          titulo={`Não encontramos ${oQue}`}
          texto="O registro pode ter sido excluído ou o link mudou. Volte para a lista e procure de novo."
          acao={
            voltar && (
              <Link to={voltar.to} className={buttonClassName({ variant: 'secondary' })}>
                {voltar.rotulo}
              </Link>
            )
          }
        />
      );
    case 'conflito':
      return (
        <Bloco
          className={className}
          icone={<ArrowsClockwise size={20} aria-hidden />}
          titulo={`Outra pessoa alterou ${oQue}`}
          texto={
            mensagemDoErro(erro) ??
            'Recarregue para ver a versão atual. O que você digitou continua aqui até recarregar.'
          }
          acao={tentar('Recarregar')}
        />
      );
    default:
      return (
        <Bloco
          className={className}
          alerta
          icone={
            tipo === 'rede' ? (
              <WifiSlash size={20} aria-hidden />
            ) : (
              <WarningCircle size={20} aria-hidden />
            )
          }
          titulo={`Não foi possível carregar ${oQue}`}
          texto={
            tipo === 'rede'
              ? 'Sem conexão com o servidor. Confira a internet e tente de novo.'
              : tipo === 'tempo'
                ? 'O servidor demorou demais para responder. Tente de novo em instantes.'
                : 'O servidor falhou ao responder. Tente de novo; se continuar, avise quem administra o One.'
          }
          acao={tentar()}
        />
      );
  }
}

function Bloco({
  icone,
  titulo,
  texto,
  acao,
  alerta = false,
  className,
}: {
  icone: ReactNode;
  titulo: string;
  texto: string;
  acao?: ReactNode;
  alerta?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 p-4', className)}>
      <div role={alerta ? 'alert' : undefined} className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 flex-none items-center justify-center rounded-lg">
          {icone}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">{titulo}</p>
          <p className="text-muted-foreground leading-relaxed">{texto}</p>
        </div>
      </div>
      {acao}
    </div>
  );
}
