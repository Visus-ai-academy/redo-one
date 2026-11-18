import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { z } from 'zod';

import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import type { PrioridadeOperacaoEdicaoDto } from '../../gen/types/PrioridadeOperacaoEdicaoDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { buttonClassName } from '../button/button-class';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { Painel } from '../painel/Painel';
import { PainelLateral } from '../painel/PainelLateral';
import { grafiasDoTexto, OPCOES_URGENCIA, rotuloUrgencia } from './recebimento';

type Props = {
  prioridades: readonly PrioridadeOperacaoDto[];
  podeEditar: boolean;
  onCriar: (dados: PrioridadeOperacaoEdicaoDto) => Promise<void>;
  onEditar: (id: string, dados: PrioridadeOperacaoEdicaoDto) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
};

const HEX = /^#[0-9a-f]{6}$/i;

const schema = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome.').max(60, 'Use até 60 caracteres.'),
    posicao: z.string().regex(/^\d{1,2}$/, 'Use um número inteiro de 1 a 99.'),
    urgencia: z.enum(['nunca', 'sempre', 'prazo']),
    horas: z.string(),
    padrao: z.boolean(),
    grafias: z.string(),
    cor: z
      .string()
      .refine(
        (cor) => cor.trim() === '' || HEX.test(cor.trim()),
        'Use o formato #RRGGBB, como #1F7A4D.',
      ),
  })
  .superRefine((v, ctx) => {
    if (Number(v.posicao) < 1) {
      ctx.addIssue({ code: 'custom', path: ['posicao'], message: 'Use um número de 1 a 99.' });
    }
    if (v.urgencia === 'prazo' && !/^\d+$/.test(v.horas.trim())) {
      ctx.addIssue({ code: 'custom', path: ['horas'], message: 'Informe as horas (1 a 720).' });
    } else if (v.urgencia === 'prazo' && (Number(v.horas) < 1 || Number(v.horas) > 720)) {
      ctx.addIssue({ code: 'custom', path: ['horas'], message: 'Informe as horas (1 a 720).' });
    }
  });

/** Criar, ver e editar uma prioridade da operação, no painel ao lado da lista. */
function PainelPrioridade({
  prioridade,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: {
  prioridade?: PrioridadeOperacaoDto;
  podeEditar: boolean;
  onSalvar: (dados: PrioridadeOperacaoEdicaoDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
}) {
  const [erro, setErro] = useState<string>();
  const form = useAppForm({
    defaultValues: {
      nome: prioridade?.nome ?? '',
      posicao: String(prioridade?.posicao ?? ''),
      urgencia: prioridade?.urgencia.tipo ?? 'nunca',
      horas: prioridade?.urgencia.horas === null ? '' : String(prioridade?.urgencia.horas ?? ''),
      padrao: prioridade?.padrao ?? false,
      grafias: (prioridade?.grafias ?? []).join('\n'),
      cor: prioridade?.cor ?? '',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          nome: value.nome.trim(),
          posicao: Number(value.posicao),
          urgencia:
            value.urgencia === 'prazo'
              ? { tipo: 'prazo', horas: Number(value.horas) }
              : { tipo: value.urgencia, horas: null },
          padrao: value.padrao,
          grafias: grafiasDoTexto(value.grafias),
          cor: value.cor.trim() || null,
        });
      } catch (falha) {
        setErro(mensagemDaApi(falha, 'Não foi possível salvar a prioridade.'));
      }
    },
  });

  const excluir =
    prioridade && onExcluir
      ? {
          acao: 'Excluir prioridade',
          titulo: `Excluir ${prioridade.nome}?`,
          consequencia: `As grafias de ${prioridade.nome} ficam sem de-para (os exames passam a valer como a prioridade padrão), e as células dela na grade de recebimento e nas frentes somem.`,
          onConfirmar: async () => {
            setErro(undefined);
            try {
              await onExcluir();
            } catch (falha) {
              setErro(mensagemDaApi(falha, 'Não foi possível excluir a prioridade.'));
            }
          },
        }
      : undefined;
  const titulo = prioridade?.nome ?? 'Nova prioridade';

  if (!podeEditar && prioridade) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Posição na fila" value={String(prioridade.posicao)} />
          <CampoSomenteLeitura
            label="Tratar como urgência"
            value={rotuloUrgencia(prioridade.urgencia)}
          />
          <CampoSomenteLeitura
            label="Vale para a grafia sem de-para"
            value={prioridade.padrao ? 'Sim' : 'Não'}
          />
          <CampoSomenteLeitura
            label="Grafias da MobileMed"
            value={prioridade.grafias.join(', ') || '—'}
          />
          <CampoSomenteLeitura label="Cor" value={prioridade.cor ?? 'Sem cor'} />
          <RodapeSomenteLeitura />
        </div>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral titulo={titulo} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="nome">
          {(field) => (
            <field.TextField
              label="Nome"
              placeholder="Ex.: AMBULATÓRIO"
              autoComplete="off"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="posicao">
          {(field) => (
            <field.NumberField
              label="Posição na fila"
              placeholder="Ex.: 2"
              description="1 vai primeiro. Prioridades na mesma posição empatam e o prazo desempata."
              min={1}
              max={99}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="urgencia">
          {(field) => (
            <field.SelectField
              label="Tratar como urgência"
              placeholder="Escolha"
              opcoes={OPCOES_URGENCIA}
              description="A urgência passa na frente dentro da posição, usa a margem acima do teto e entra para quem tem URGÊNCIA marcada na escala."
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(s) => s.values.urgencia}>
          {(urgencia) =>
            urgencia === 'prazo' && (
              <form.AppField name="horas">
                {(field) => (
                  <field.NumberField
                    label="Urgência com menos de quantas horas até o prazo"
                    placeholder="Ex.: 24"
                    min={1}
                    max={720}
                    required
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.AppField name="cor">
          {(field) => (
            <field.TextField
              label="Cor"
              placeholder="#1F7A4D"
              autoComplete="off"
              description="Cor da prioridade na barra da fila do momento (Operação › Distribuição). Sem cor, fica cinza."
            />
          )}
        </form.AppField>
        <form.AppField name="grafias">
          {(field) => (
            <field.TextAreaField
              label="Grafias da MobileMed"
              placeholder={'Ambulatório\nP6'}
              description="Uma por linha (ou separadas por vírgula). Acento e maiúsculas não importam: Urgência e URGENCIA são a mesma."
            />
          )}
        </form.AppField>
        <form.AppField name="padrao">
          {(field) => (
            <field.CheckboxField
              label="Vale para a grafia sem de-para"
              description="O exame com uma grafia que nenhuma prioridade tem cai nesta (e vira aviso na rodada). Só uma prioridade pode ser a padrão."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar prioridade"
            editando={Boolean(prioridade)}
            excluir={excluir}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}

/** Configurações › Distribuição: a lista das prioridades da operação, pela posição na fila. */
export function PrioridadesOperacao({
  prioridades,
  podeEditar,
  onCriar,
  onEditar,
  onExcluir,
}: Props) {
  // null = fechado; 'nova' = criando; senão, o id aberto.
  const [aberto, setAberto] = useState<string | null>(null);
  const atual = prioridades.find((p) => p.id === aberto);

  return (
    <Painel
      titulo="Prioridades da operação"
      descricao="Como o robô lê a prioridade que chega da MobileMed: a ordem na fila, quando é urgência e as grafias de cada uma. O faturamento segue com as prioridades do catálogo."
      conteudoNaBorda
      acao={
        podeEditar && (
          <Button
            type="button"
            onClick={() => setAberto('nova')}
            className={buttonClassName({ variant: 'secondary' })}
          >
            <Plus size={16} aria-hidden />
            Nova prioridade
          </Button>
        )
      }
    >
      {prioridades.length === 0 ? (
        <p className="text-muted-foreground p-4">
          Nenhuma prioridade cadastrada: todo exame vai para o fim da fila e nunca é urgência.
        </p>
      ) : (
        <ul className="divide-y">
          {prioridades.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setAberto(p.id)}
                aria-current={aberto === p.id || undefined}
                className="hover:bg-muted/60 aria-[current]:bg-accent flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className="bg-muted flex size-7 flex-none items-center justify-center rounded-md text-[13px] font-semibold tabular-nums"
                  title="Posição na fila"
                >
                  {p.posicao}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <BolinhaCor cor={p.cor} className="size-2.5" />
                    <span className="font-medium">{p.nome}</span>
                    {p.padrao && <Etiqueta tom="info">Padrão</Etiqueta>}
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    Urgência: {rotuloUrgencia(p.urgencia).toLowerCase()}
                  </span>
                  <span className="text-subtle-foreground text-[13px] break-words">
                    {p.grafias.length ? p.grafias.join(', ') : 'Sem grafias'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && (
        <PainelPrioridade
          key={aberto}
          prioridade={atual}
          podeEditar={podeEditar}
          onFechar={() => setAberto(null)}
          onSalvar={async (dados) => {
            if (atual) await onEditar(atual.id, dados);
            else await onCriar(dados);
            setAberto(null);
          }}
          onExcluir={
            atual && podeEditar
              ? async () => {
                  await onExcluir(atual.id);
                  setAberto(null);
                }
              : undefined
          }
        />
      )}
    </Painel>
  );
}
