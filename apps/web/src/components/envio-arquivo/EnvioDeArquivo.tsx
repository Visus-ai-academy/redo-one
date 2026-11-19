import { Button } from '@base-ui/react/button';
import { Progress } from '@base-ui/react/progress';
import { FileArrowUp, FileXls } from '@phosphor-icons/react';
import { type DragEvent, type ReactNode, useId, useState } from 'react';

import { cn } from '../../lib/cn';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';

type EnvioDeArquivoProps = {
  /** Extensão aceita, com o ponto (ex.: `.xlsx`). */
  extensao: string;
  tamanhoMaximoMb: number;
  /** A ação, igual no botão e no aviso de sucesso de quem usa (ex.: "Enviar planilha"). */
  rotuloEnviar: string;
  /** Envia o arquivo avisando o progresso em %; erro com mensagem aparece no fluxo. */
  onEnviar: (arquivo: File, onProgresso: (percentual: number) => void) => Promise<void>;
  /** Texto abaixo da área (o que é a planilha, de onde baixar). */
  ajuda?: ReactNode;
};

const tamanhoLegivel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/**
 * Selecionar (clicando na área ou arrastando) um arquivo e enviá-lo, com a barra de progresso. O arquivo vai direto ao
 * storage: quem usa faz o pedido da URL, o envio e a confirmação em `onEnviar`.
 */
export function EnvioDeArquivo({
  extensao,
  tamanhoMaximoMb,
  rotuloEnviar,
  onEnviar,
  ajuda,
}: EnvioDeArquivoProps) {
  const idEntrada = useId();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const enviando = progresso !== null;

  const escolher = (escolhido: File | undefined) => {
    if (!escolhido) return;
    setErro(null);
    if (!escolhido.name.toLowerCase().endsWith(extensao)) {
      setArquivo(null);
      setErro(`Escolha um arquivo ${extensao}.`);
    } else if (escolhido.size > tamanhoMaximoMb * 1024 * 1024) {
      setArquivo(null);
      setErro(`O arquivo passa de ${tamanhoMaximoMb} MB.`);
    } else {
      setArquivo(escolhido);
    }
  };

  const soltar = (evento: DragEvent) => {
    evento.preventDefault();
    setArrastando(false);
    if (!enviando) escolher(evento.dataTransfer.files[0]);
  };

  const enviar = async () => {
    if (!arquivo) return;
    setErro(null);
    setProgresso(0);
    try {
      await onEnviar(arquivo, setProgresso);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'O envio falhou. Tente de novo.');
    } finally {
      setProgresso(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* A área inteira é o rótulo da entrada: clicar ou dar Enter nela abre a escolha do arquivo. */}
      <label
        htmlFor={idEntrada}
        onDragOver={(evento) => {
          evento.preventDefault();
          if (!enviando) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={cn(
          'border-input hover:bg-accent flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center',
          'has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2',
          arrastando && 'border-primary bg-accent',
          enviando && 'pointer-events-none opacity-60',
        )}
      >
        {arquivo ? (
          <div className="flex w-full items-center gap-3 text-left">
            <FileXls size={28} aria-hidden className="text-primary flex-none" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{arquivo.name}</span>
              <span className="text-muted-foreground text-[13px] tabular-nums">
                {tamanhoLegivel(arquivo.size)}
              </span>
            </div>
          </div>
        ) : (
          <>
            <FileArrowUp size={28} aria-hidden className="text-subtle-foreground" />
            <span className="text-muted-foreground">Selecionar arquivo</span>
          </>
        )}
        <input
          id={idEntrada}
          type="file"
          accept={extensao}
          aria-label="Selecionar arquivo"
          disabled={enviando}
          className="sr-only"
          onChange={(evento) => {
            escolher(evento.target.files?.[0]);
            evento.target.value = '';
          }}
        />
      </label>

      {ajuda && <p className="text-muted-foreground text-[13px]">{ajuda}</p>}

      {enviando && (
        <Progress.Root
          value={progresso}
          aria-label="Enviando a planilha"
          className="flex flex-col gap-2"
        >
          <div className="flex justify-between text-[13px]">
            <Progress.Label className="text-muted-foreground">Enviando a planilha</Progress.Label>
            <Progress.Value className="tabular-nums" />
          </div>
          <Progress.Track className="bg-muted h-1.5 overflow-hidden rounded-full">
            <Progress.Indicator className="bg-primary transition-[width] duration-200 motion-reduce:transition-none" />
          </Progress.Track>
        </Progress.Root>
      )}

      {erro && <Alerta tom="erro">{erro}</Alerta>}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!arquivo || enviando}
          onClick={() => void enviar()}
          className={buttonClassName()}
        >
          {enviando ? 'Enviando…' : rotuloEnviar}
        </Button>
      </div>
    </div>
  );
}
