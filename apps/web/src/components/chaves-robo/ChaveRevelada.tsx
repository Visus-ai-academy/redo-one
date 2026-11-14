import { Check, Copy, Warning } from '@phosphor-icons/react';
import { useState } from 'react';

import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';

type ChaveReveladaProps = { nome: string; chave: string; onConcluir: () => void };

/** A chave inteira só existe na resposta da criação: aparece aqui uma vez, para copiar. */
export function ChaveRevelada({ nome, chave, onConcluir }: ChaveReveladaProps) {
  const [copiada, setCopiada] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiada(true);
      setFalhou(false);
    } catch {
      setFalhou(true);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Alerta tom="sucesso">Chave criada para {nome}.</Alerta>
      <p className="text-warning flex items-start gap-2">
        <Warning size={18} aria-hidden className="mt-px flex-none" />
        Copie a chave agora e guarde no cofre de senhas do servidor do robô. Depois de fechar, ela
        não aparece de novo.
      </p>
      <div className="flex flex-col gap-2">
        <span className="font-medium">Chave</span>
        <div className="flex items-start gap-2">
          <code className="bg-background min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-xs break-all">
            {chave}
          </code>
          <button
            type="button"
            onClick={() => void copiar()}
            className={buttonClassName({ variant: 'secondary', className: 'flex-none' })}
          >
            {copiada ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copiada ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        {falhou && (
          <span className="text-destructive text-[13px]">
            Não foi possível copiar. Selecione a chave e copie com Ctrl+C.
          </span>
        )}
        <span className="text-muted-foreground text-[13px]">
          O robô envia a chave no cabeçalho{' '}
          <code className="font-mono text-xs">Authorization: Bearer</code>.
        </span>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onConcluir} className={buttonClassName()}>
          Já guardei a chave
        </button>
      </div>
    </div>
  );
}
