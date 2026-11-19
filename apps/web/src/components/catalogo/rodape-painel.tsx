import { Button } from '@base-ui/react/button';
import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { RequiredLegend } from '../form/RequiredLegend';
import { SubmitButton } from '../form/SubmitButton';

/** Botão Excluir do painel, com a confirmação que diz a consequência. */
export type ExcluirPainel = {
  acao: string;
  titulo: string;
  consequencia: string;
  onConfirmar: () => Promise<void>;
};

type RodapePainelProps = {
  /** Texto do botão de criar ("Criar de-para"); editando, o botão é "Salvar". */
  rotuloCriar: string;
  editando: boolean;
  excluir?: ExcluirPainel;
  onCancelar: () => void;
  /** Falso quando nenhum campo obrigatório está na tela: aí a legenda do `*` não explica nada. */
  legenda?: boolean;
};

/** Legenda do `*`, excluir à esquerda e cancelar/salvar à direita. Vai dentro de `form.AppForm`. */
export function RodapePainel({
  rotuloCriar,
  editando,
  excluir,
  onCancelar,
  legenda = true,
}: RodapePainelProps) {
  return (
    <>
      {legenda && <RequiredLegend />}
      <div className="flex flex-wrap items-center gap-2">
        {excluir && <ConfirmarAcao {...excluir} />}
        <span className="ml-auto flex gap-2">
          <Button
            type="button"
            onClick={onCancelar}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Cancelar
          </Button>
          <SubmitButton pendingLabel="Salvando…">{editando ? 'Salvar' : rotuloCriar}</SubmitButton>
        </span>
      </div>
    </>
  );
}

/** Painel só leitura (pode excluir, mas não editar): só o excluir, à esquerda. */
export function RodapeSomenteLeitura({ excluir }: { excluir?: ExcluirPainel }) {
  if (!excluir) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConfirmarAcao {...excluir} />
    </div>
  );
}
