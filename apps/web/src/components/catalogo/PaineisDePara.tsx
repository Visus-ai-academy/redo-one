import { Fieldset } from '@base-ui/react/fieldset';
import { z } from 'zod';

import type { DeParaEspecialidadeDto } from '../../gen/types/DeParaEspecialidadeDto';
import type { DeParaEspecialidadeItemDto } from '../../gen/types/DeParaEspecialidadeItemDto';
import type { SufixoDto } from '../../gen/types/SufixoDto';
import type { SufixoItemDto } from '../../gen/types/SufixoItemDto';
import { Alerta } from '../alerta/Alerta';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';
import { useErroDoPainel } from './use-erro-do-painel';

type Base<Item, Dados> = {
  /** Sem item, o painel cria um novo. */
  item?: Item;
  podeEditar: boolean;
  onSalvar: (dados: Dados) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const textoObrigatorio = (mensagem: string) => z.string().trim().min(1, mensagem);
const opcional = (texto: string) => texto.trim() || null;
const ativoAjuda = 'Inativo não vale na importação, mas fica guardado.';

function excluirDePara(
  nome: string,
  onExcluir: (() => Promise<void>) | undefined,
  tentar: ReturnType<typeof useErroDoPainel>['tentar'],
) {
  return onExcluir
    ? {
        acao: 'Excluir de-para',
        titulo: `Excluir o de-para de “${nome}”?`,
        consequencia:
          'A importação deixa de traduzir esse valor a partir da próxima vez. Para só pausar, desative.',
        onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
      }
    : undefined;
}

/**
 * Valor que chega no campo especialidade mas não é especialidade (ex.: "CT", "ONCOLÓGICO"): não tem
 * forma certa para apontar, então fica fora do painel das especialidades. A especialidade vem do
 * exame do laudo.
 */
export function PainelNaoEspecialidade({
  item,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: Base<DeParaEspecialidadeItemDto, DeParaEspecialidadeDto>) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      origem: item?.origem ?? '',
      ativo: item?.ativo ?? true,
      observacoes: item?.observacoes ?? '',
    },
    validators: {
      onSubmit: z.object({
        origem: textoObrigatorio('Informe o valor como chega da MobileMed.'),
        ativo: z.boolean(),
        observacoes: z.string(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          tipo: 'invalida',
          origem: value.origem.trim(),
          especialidadeId: null,
          ativo: value.ativo,
          observacoes: opcional(value.observacoes),
        }),
      ),
  });

  const excluir = item ? excluirDePara(item.origem, onExcluir, tentar) : undefined;

  return (
    <PainelLateral
      titulo={item ? item.origem : 'Novo valor que não é especialidade'}
      onFechar={onFechar}
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
          Chega no campo especialidade mas não é especialidade: a importação ignora e usa a
          especialidade do exame.
        </p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="origem">
            {(field) => (
              <field.TextField
                label="Valor que chega"
                placeholder="Ex.: CT"
                description="Comparado em maiúsculas."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="observacoes">
            {(field) => (
              <field.TextAreaField
                label="Observações"
                placeholder="Ex.: por que essa regra existe"
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
              rotuloCriar="Criar"
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

export function PainelSufixo({
  item,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: Base<SufixoItemDto, SufixoDto>) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      sufixo: item?.sufixo ?? '',
      ativo: item?.ativo ?? true,
      observacoes: item?.observacoes ?? '',
    },
    validators: {
      onSubmit: z.object({
        sufixo: textoObrigatorio('Informe o sufixo.'),
        ativo: z.boolean(),
        observacoes: z.string(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          sufixo: value.sufixo.trim(),
          ativo: value.ativo,
          observacoes: opcional(value.observacoes),
        }),
      ),
  });

  const excluir =
    item && onExcluir
      ? {
          acao: 'Excluir sufixo',
          titulo: `Excluir o sufixo “${item.sufixo}”?`,
          consequencia:
            'A importação deixa de cortar esse sufixo a partir da próxima vez. Para só pausar, desative.',
          onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
        }
      : undefined;

  return (
    <PainelLateral titulo={item ? item.sufixo : 'Novo sufixo'} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground">
          Cortado do fim do nome do cliente antes de achar o cadastro (ex.: “CLINICA-CT” vira
          “CLINICA”).
        </p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="sufixo">
            {(field) => (
              <field.TextField
                label="Sufixo"
                placeholder="Ex.: _PLANTÃO"
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="observacoes">
            {(field) => (
              <field.TextAreaField label="Observações" placeholder="Ex.: unidades de plantão" />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => <field.CheckboxField label="Ativo" description={ativoAjuda} />}
          </form.AppField>
        </Fieldset.Root>
        {podeEditar ? (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar sufixo"
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
