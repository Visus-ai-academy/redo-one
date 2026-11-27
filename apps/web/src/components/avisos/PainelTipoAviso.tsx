import { z } from 'zod';

import type { ConfiguracaoTipoAvisoDto } from '../../gen/types/ConfiguracaoTipoAvisoDto';
import type { PapelResponsavelDto } from '../../gen/types/PapelResponsavelDto';
import { significadoDoTipo, tipoDoAviso } from '../../lib/avisos';
import { plural } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { RodapePainel } from '../catalogo/rodape-painel';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';

const schema = z.object({ papeisIds: z.array(z.string()), impedeFecharCompetencia: z.boolean() });

/** Configurações › Avisos: responsáveis e "impede fechar a competência" de um tipo. */
export function PainelTipoAviso({
  tipo,
  papeis,
  podeEditar,
  onSalvar,
  onFechar,
}: {
  tipo: ConfiguracaoTipoAvisoDto;
  papeis: PapelResponsavelDto[];
  podeEditar: boolean;
  onSalvar: (dados: { papeisIds: string[]; impedeFecharCompetencia: boolean }) => Promise<void>;
  onFechar: () => void;
}) {
  const { erro, tentar } = useErroDoPainel();
  const iniciais = {
    papeisIds: tipo.responsaveis.map((r) => r.id),
    impedeFecharCompetencia: tipo.impedeFecharCompetencia,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => tentar(() => onSalvar(value)),
  });
  const alterado = useAlterado(form, iniciais);
  const pendentes = plural(tipo.pendentes, {
    um: 'aviso pendente',
    varios: 'avisos pendentes',
    nenhum: 'Nenhum aviso pendente',
  });

  return (
    <PainelLateral
      titulo={tipoDoAviso(tipo.tipo)}
      subtitulo={pendentes}
      alterado={alterado}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-5 p-4"
      >
        <p className="text-muted-foreground text-[13px]">{significadoDoTipo(tipo.tipo)}</p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {podeEditar ? (
          <>
            <form.AppField name="papeisIds">
              {(field) => (
                <field.CheckboxListField
                  label="Responsáveis"
                  description="Quem tem um destes papéis vê a faixa no topo enquanto houver aviso deste tipo pendente. Continua vendo só os avisos das telas que pode abrir."
                  opcoes={papeis.map((p) => ({ valor: p.id, rotulo: p.nome }))}
                />
              )}
            </form.AppField>
            <form.AppField name="impedeFecharCompetencia">
              {(field) => (
                <field.InterruptorField
                  label="Impede fechar a competência"
                  description="Aviso pendente deste tipo ligado a uma competência impede fechá-la. Quem tem a permissão própria fecha mesmo assim, informando o motivo."
                />
              )}
            </form.AppField>
            <form.AppForm>
              <RodapePainel rotuloCriar="Salvar" editando legenda={false} onCancelar={onFechar} />
            </form.AppForm>
          </>
        ) : (
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="font-medium">Responsáveis</dt>
              <dd className="text-muted-foreground">
                {tipo.responsaveis.map((r) => r.nome).join(', ') || 'Nenhum'}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Impede fechar a competência</dt>
              <dd className="text-muted-foreground">
                {tipo.impedeFecharCompetencia ? 'Sim' : 'Não'}
              </dd>
            </div>
          </dl>
        )}
      </form>
    </PainelLateral>
  );
}
