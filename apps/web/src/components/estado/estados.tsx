import { Button } from '@base-ui/react/button';
import { ArrowClockwise, LockKey, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { buttonClassName } from '../button/button-class';
import { tipoDoErro } from './tipo-do-erro';

function Estado({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone: ReactNode;
  titulo: string;
  texto: string;
  acao: ReactNode;
}) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="flex max-w-[420px] flex-col items-start gap-4">
        <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-lg">
          {icone}
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] font-semibold">{titulo}</h1>
          <p className="text-muted-foreground leading-relaxed">{texto}</p>
        </div>
        {acao}
      </div>
    </div>
  );
}

/** Rota inexistente. */
export function NaoEncontrada() {
  return (
    <Estado
      icone={<MagnifyingGlass size={24} aria-hidden />}
      titulo="Página não encontrada"
      texto="O endereço não existe ou mudou. Confira o link ou volte ao início."
      acao={
        <Link to="/" className={buttonClassName()}>
          Voltar ao início
        </Link>
      }
    />
  );
}

/**
 * Tela que o papel não permite: aberta pelo endereço (o item já some do menu) ou recusada pela
 * API (403). Fica dentro do layout, com o menu de pé.
 */
export function SemPermissao({ tela }: { tela?: string }) {
  return (
    <Estado
      icone={<LockKey size={24} aria-hidden />}
      titulo="Você não tem permissão para ver esta tela."
      texto={
        tela
          ? `Seu papel não dá acesso a ${tela}. Se precisar, peça a quem administra o One para liberar.`
          : 'Se precisar, peça a quem administra o One para liberar no seu papel.'
      }
      acao={
        <Link to="/" className={buttonClassName()}>
          Ir para a tela inicial
        </Link>
      }
    />
  );
}

/** Falha que nenhuma rota tratou (API fora do ar, erro de código). */
export function ErroInesperado({ onTentarDeNovo }: { onTentarDeNovo: () => void }) {
  return (
    <Estado
      icone={<WarningCircle size={24} aria-hidden />}
      titulo="Não foi possível carregar esta página"
      texto="O servidor não respondeu ou falhou ao montar a tela. Confira sua conexão e tente de novo; se continuar, avise quem administra o One."
      acao={
        <Button
          type="button"
          onClick={onTentarDeNovo}
          className={buttonClassName({ variant: 'secondary' })}
        >
          <ArrowClockwise size={16} aria-hidden />
          Tentar de novo
        </Button>
      }
    />
  );
}

/**
 * Erro de rota sem tratamento próprio: 403 da API é acesso negado; o resto (500, rede) é erro
 * inesperado, e o "Tentar de novo" recarrega os dados da página.
 */
export function ErroDeRota({ error }: Pick<ErrorComponentProps, 'error'>) {
  const router = useRouter();
  if (tipoDoErro(error) === 'permissao') return <SemPermissao />;
  return <ErroInesperado onTentarDeNovo={() => void router.invalidate()} />;
}
