import { ArrowClockwise, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { buttonClassName } from '../button/button-class';

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

/** Falha que nenhuma rota tratou (API fora do ar, erro de código). */
export function ErroInesperado({ onTentarDeNovo }: { onTentarDeNovo: () => void }) {
  return (
    <Estado
      icone={<WarningCircle size={24} aria-hidden />}
      titulo="Algo deu errado"
      texto="Não foi possível carregar esta página. Confira sua conexão e tente de novo; se continuar, avise quem administra o One."
      acao={
        <button
          type="button"
          onClick={onTentarDeNovo}
          className={buttonClassName({ variant: 'secondary' })}
        >
          <ArrowClockwise size={16} aria-hidden />
          Tentar de novo
        </button>
      }
    />
  );
}

/** Erro de rota: o "Tentar de novo" recarrega os dados da página. */
export function ErroDeRota() {
  const router = useRouter();
  return <ErroInesperado onTentarDeNovo={() => void router.invalidate()} />;
}
