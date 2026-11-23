import { Fieldset } from '@base-ui/react/fieldset';
import { z } from 'zod';

import type { DeParaValorDto } from '../../gen/types/DeParaValorDto';
import type { DeParaValorItemDto } from '../../gen/types/DeParaValorItemDto';
import { Alerta } from '../alerta/Alerta';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';
import { useErroDoPainel } from './use-erro-do-painel';

export type PainelExameForaPadraoProps = {
  /** Sem item, o painel cria um novo. */
  item?: DeParaValorItemDto;
  podeEditar: boolean;
  /** Busca os exames padronizados (o vínculo é opcional). */
  buscarExames: (termo: string) => Promise<OpcaoBusca[]>;
  onSalvar: (dados: DeParaValorDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const textoObrigatorio = (mensagem: string) => z.string().trim().min(1, mensagem);
const ativoAjuda = 'Inativo não vale na importação, mas fica guardado.';

function excluirForaPadrao(
  nome: string,
  onExcluir: (() => Promise<void>) | undefined,
  tentar: ReturnType<typeof useErroDoPainel>['tentar'],
) {
  return onExcluir
    ? {
        acao: 'Excluir',
        titulo: `Excluir “${nome}”?`,
        consequencia:
          'A partir da próxima importação, o laudo desse estudo com VALORES zerado passa a valer 1. Para só pausar, desative.',
        onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
      }
    : undefined;
}

/**
 * Exame fora do padrão: estudo que chega da MobileMed com outra grafia ou sem par no cadastro de
 * exames padronizados, com quantas unidades vale e, se houver, o exame padronizado de onde herda a
 * classificação. Fica numa lista própria, nunca junto dos padronizados.
 */
export function PainelExameForaPadrao({
  item,
  buscarExames,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelExameForaPadraoProps) {
  const { erro, tentar } = useErroDoPainel();
  const iniciais = {
    estudoDescricao: item?.estudoDescricao ?? '',
    valores: item ? String(item.valores) : '',
    exame: (item?.exameId
      ? { valor: item.exameId, rotulo: item.destinoNome ?? '' }
      : null) as OpcaoBusca | null,
    ativo: item?.ativo ?? true,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: {
      onSubmit: z.object({
        estudoDescricao: textoObrigatorio('Informe a descrição do estudo como chega da MobileMed.'),
        valores: z
          .string()
          .regex(
            /^\d{1,3}(\.\d{1,2})?$/,
            'Informe quantas unidades o laudo vale, de 0 a 999, com até 2 casas.',
          ),
        exame: z.custom<OpcaoBusca | null>(),
        ativo: z.boolean(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          estudoDescricao: value.estudoDescricao.trim(),
          valores: Number(value.valores),
          exameId: value.exame?.valor ?? null,
          ativo: value.ativo,
        }),
      ),
  });
  const alterado = useAlterado(form, iniciais);

  const excluir = item ? excluirForaPadrao(item.estudoDescricao, onExcluir, tentar) : undefined;

  return (
    <PainelLateral
      titulo={item ? item.estudoDescricao : 'Novo exame fora do padrão'}
      onFechar={onFechar}
      alterado={alterado}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground">
          Estudo que chega da MobileMed fora do padrão do cadastro. Quando o laudo dele vem com
          VALORES zerado, vale o número abaixo. Valor 0 não conta: o laudo vale 1.
        </p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="estudoDescricao">
            {(field) => (
              <field.TextField
                label="Descrição do estudo"
                placeholder="Ex.: RM CRANIO"
                description="Grafias que diferem só em acento, maiúsculas ou pontuação são a mesma."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="valores">
            {(field) => (
              <field.NumberField
                label="Vale (unidades)"
                placeholder="Ex.: 2"
                min={0}
                max={999}
                step={0.01}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="exame">
            {(field) => (
              <field.BuscaField
                label="Exame padronizado"
                placeholder="Digite o nome do exame"
                chave="exames"
                buscar={buscarExames}
                description="Opcional: empresta a especialidade e a categoria ao estudo, que não está no cadastro."
              />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => <field.CheckboxField label="Ativo" description={ativoAjuda} />}
          </form.AppField>
        </Fieldset.Root>
        {podeEditar ? (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar exame fora do padrão"
              editando={Boolean(item)}
              excluir={excluir}
              onCancelar={onFechar}
            />
          </form.AppForm>
        ) : (
          <RodapeSomenteLeitura excluir={excluir} />
        )}
      </form>
    </PainelLateral>
  );
}
