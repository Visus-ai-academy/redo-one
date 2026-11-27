import { Fieldset } from '@base-ui/react/fieldset';
import type { ReactNode } from 'react';
import { z } from 'zod';

import type { DeParaEspecialidadeDto } from '../../gen/types/DeParaEspecialidadeDto';
import type { DeParaEspecialidadeItemDto } from '../../gen/types/DeParaEspecialidadeItemDto';
import type { SufixoDto } from '../../gen/types/SufixoDto';
import type { SufixoItemDto } from '../../gen/types/SufixoItemDto';
import { Alerta } from '../alerta/Alerta';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { type ExcluirPainel, RodapePainel, RodapeSomenteLeitura } from './rodape-painel';
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

/** Criar, ver e editar um de-para, no painel lateral. */
function MolduraDePara({
  titulo,
  explicacao,
  criando,
  rotuloCriar,
  podeEditar,
  erro,
  excluir,
  onFechar,
  alterado,
  onEnviar,
  formulario,
  children,
}: {
  titulo: string;
  explicacao: ReactNode;
  criando: boolean;
  rotuloCriar: string;
  podeEditar: boolean;
  erro?: string;
  excluir?: ExcluirPainel;
  onFechar: () => void;
  alterado: boolean;
  onEnviar: () => void;
  /** `form.AppForm` do formulário: o botão de enviar e a legenda precisam do contexto dele. */
  formulario: (conteudo: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  return (
    <PainelLateral titulo={titulo} alterado={alterado} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onEnviar();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground">{explicacao}</p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          {children}
        </Fieldset.Root>
        {podeEditar ? (
          formulario(
            <RodapePainel
              rotuloCriar={rotuloCriar}
              editando={!criando}
              excluir={excluir}
              onCancelar={onFechar}
            />,
          )
        ) : (
          <RodapeSomenteLeitura excluir={excluir} />
        )}
      </form>
    </PainelLateral>
  );
}

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
  const iniciais = {
    origem: item?.origem ?? '',
    ativo: item?.ativo ?? true,
    observacoes: item?.observacoes ?? '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
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
  const alterado = useAlterado(form, iniciais);

  return (
    <MolduraDePara
      titulo={item ? item.origem : 'Novo valor que não é especialidade'}
      explicacao="Chega no campo especialidade mas não é especialidade: a importação ignora e usa a especialidade do exame."
      criando={!item}
      rotuloCriar="Criar"
      podeEditar={podeEditar}
      erro={erro}
      excluir={item ? excluirDePara(item.origem, onExcluir, tentar) : undefined}
      onFechar={onFechar}
      alterado={alterado}
      onEnviar={() => void form.handleSubmit()}
      formulario={(conteudo) => <form.AppForm>{conteudo}</form.AppForm>}
    >
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
          <field.TextAreaField label="Observações" placeholder="Ex.: por que essa regra existe" />
        )}
      </form.AppField>
      <form.AppField name="ativo">
        {(field) => <field.InterruptorField label="Ativo" description={ativoAjuda} />}
      </form.AppField>
    </MolduraDePara>
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
  const iniciais = {
    sufixo: item?.sufixo ?? '',
    ativo: item?.ativo ?? true,
    observacoes: item?.observacoes ?? '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
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
  const alterado = useAlterado(form, iniciais);

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
    <MolduraDePara
      titulo={item ? item.sufixo : 'Novo sufixo'}
      explicacao="Cortado do fim do nome do cliente antes de achar o cadastro (ex.: “CLINICA-CT” vira “CLINICA”)."
      criando={!item}
      rotuloCriar="Criar sufixo"
      podeEditar={podeEditar}
      erro={erro}
      excluir={excluir}
      onFechar={onFechar}
      alterado={alterado}
      onEnviar={() => void form.handleSubmit()}
      formulario={(conteudo) => <form.AppForm>{conteudo}</form.AppForm>}
    >
      <form.AppField name="sufixo">
        {(field) => (
          <field.TextField label="Sufixo" placeholder="Ex.: _PLANTÃO" autoComplete="off" required />
        )}
      </form.AppField>
      <form.AppField name="observacoes">
        {(field) => (
          <field.TextAreaField label="Observações" placeholder="Ex.: unidades de plantão" />
        )}
      </form.AppField>
      <form.AppField name="ativo">
        {(field) => <field.InterruptorField label="Ativo" description={ativoAjuda} />}
      </form.AppField>
    </MolduraDePara>
  );
}
