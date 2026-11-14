import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { RequiredLegend } from '../form/RequiredLegend';
import { SubmitButton } from '../form/SubmitButton';

type RodapePainelProps = {
  /** Texto do botão de criar ("Criar de-para"); editando, o botão é "Salvar". */
  rotuloCriar: string;
  editando: boolean;
  excluir?: {
    acao: string;
    titulo: string;
    consequencia: string;
    onConfirmar: () => Promise<void>;
  };
  onCancelar: () => void;
};

/** Legenda do `*`, excluir à esquerda e cancelar/salvar à direita. Vai dentro de `form.AppForm`. */
export function RodapePainel({ rotuloCriar, editando, excluir, onCancelar }: RodapePainelProps) {
  return (
    <>
      <RequiredLegend />
      <div className="flex flex-wrap items-center gap-2">
        {excluir && <ConfirmarAcao {...excluir} />}
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Cancelar
          </button>
          <SubmitButton pendingLabel="Salvando…">{editando ? 'Salvar' : rotuloCriar}</SubmitButton>
        </span>
      </div>
    </>
  );
}
