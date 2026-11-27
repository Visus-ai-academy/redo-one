import { useStore } from '@tanstack/react-form';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import type { ConfiguracaoDto } from '../../gen/types/ConfiguracaoDto';
import type { ConfiguracaoEmpresaDto } from '../../gen/types/ConfiguracaoEmpresaDto';
import { faixasDoTexto, ROTULO_AJUSTE, rotulosDasFaixas } from '../../lib/titulos';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { mostrarErrosDoServidor } from '../form/erros-do-servidor';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { RodapeDeAcoes } from '../painel/RodapeDeAcoes';

const schema = z.object({
  horizonteRecorrenciaMeses: z
    .string()
    .refine(
      (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 24,
      'Use de 1 a 24 meses.',
    ),
  ajusteDiaNaoUtil: z.string().min(1, 'Escolha o que fazer com o vencimento em fim de semana.'),
  faixasInadimplencia: z.string().superRefine((texto, ctx) => {
    const faixas = faixasDoTexto(texto);
    const erro = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!faixas) return erro('Informe os dias separados por vírgula (ex.: 1, 6, 16, 31).');
    if (faixas.length < 2 || faixas.length > 8) return erro('Use de 2 a 8 faixas.');
    if (new Set(faixas).size !== faixas.length) return erro('Cada faixa começa num dia diferente.');
    if (faixas[0] !== 1) erro('A primeira faixa começa no dia 1 de atraso.');
  }),
});

/** "1–5, 6–15, 16–30 e mais de 30 dias". */
function resumoDasFaixas(texto: string) {
  const faixas = faixasDoTexto(texto);
  if (faixas?.[0] !== 1 || new Set(faixas).size !== faixas.length) return null;
  const rotulos = rotulosDasFaixas(faixas).map((r, i) => (i === 0 ? r : r.toLowerCase()));
  return `Faixas: ${rotulos.slice(0, -1).join(', ')} e ${rotulos.at(-1)}.`;
}

/** As regras financeiras de uma empresa (por enquanto, as faixas de atraso da inadimplência). */
export function FormRegrasFinanceiras({
  configuracao,
  podeEditar,
  onSalvar,
  onAlterado,
}: {
  configuracao: ConfiguracaoEmpresaDto;
  podeEditar: boolean;
  onSalvar: (dados: ConfiguracaoDto) => Promise<void>;
  /** Para a página perguntar antes de sair com alteração não salva. */
  onAlterado?: (alterado: boolean) => void;
}) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    faixasInadimplencia: configuracao.faixasInadimplencia.join(', '),
    horizonteRecorrenciaMeses: String(configuracao.horizonteRecorrenciaMeses),
    ajusteDiaNaoUtil: configuracao.ajusteDiaNaoUtil as string,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setErro(undefined);
      try {
        await onSalvar({
          faixasInadimplencia: faixasDoTexto(value.faixasInadimplencia) ?? [],
          horizonteRecorrenciaMeses: Number(value.horizonteRecorrenciaMeses),
          ajusteDiaNaoUtil: value.ajusteDiaNaoUtil as ConfiguracaoDto['ajusteDiaNaoUtil'],
        });
        formApi.reset(value);
      } catch (falha) {
        if (!mostrarErrosDoServidor(form, falha)) {
          setErro(mensagemDaApi(falha, 'Não foi possível salvar agora. Tente de novo.'));
        }
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);
  const texto = useStore(form.store, (s) => s.values.faixasInadimplencia);

  if (!podeEditar) {
    return (
      <div className="flex flex-col gap-4">
        <CampoSomenteLeitura
          label="Faixas da inadimplência"
          value={resumoDasFaixas(iniciais.faixasInadimplencia) ?? iniciais.faixasInadimplencia}
        />
        <CampoSomenteLeitura
          label="Gerar os títulos das recorrências com antecedência de"
          value={`${configuracao.horizonteRecorrenciaMeses} meses`}
        />
        <CampoSomenteLeitura
          label="Vencimento em fim de semana ou feriado"
          value={ROTULO_AJUSTE[configuracao.ajusteDiaNaoUtil] ?? configuracao.ajusteDiaNaoUtil}
        />
      </div>
    );
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <h2 className="font-semibold">Inadimplência</h2>
      <form.AppField name="faixasInadimplencia">
        {(field) => (
          <field.TextField
            label="Faixas da inadimplência (dia em que cada faixa começa)"
            required
            placeholder="1, 6, 16, 31"
            inputMode="numeric"
            autoComplete="off"
            description={
              resumoDasFaixas(texto) ??
              'Dias de atraso separados por vírgula; a primeira faixa começa no dia 1.'
            }
          />
        )}
      </form.AppField>
      <h2 className="mt-2 font-semibold">Contas recorrentes</h2>
      <div className="flex flex-wrap gap-4">
        <form.AppField name="horizonteRecorrenciaMeses">
          {(field) => (
            <field.NumberField
              label="Gerar os títulos com antecedência de (meses)"
              required
              placeholder="3"
              min={1}
              max={24}
              description="Os títulos aparecem nas contas a pagar e a receber antes de vencer."
              className="flex-[1_1_220px]"
            />
          )}
        </form.AppField>
        <form.AppField name="ajusteDiaNaoUtil">
          {(field) => (
            <field.SelectField
              label="Vencimento em fim de semana ou feriado"
              required
              placeholder="Escolha"
              description="Padrão das recorrências; cada uma pode trocar. Feriados ainda não entram."
              opcoes={Object.entries(ROTULO_AJUSTE).map(([valor, rotulo]) => ({ valor, rotulo }))}
              className="flex-[1_1_220px]"
            />
          )}
        </form.AppField>
      </div>
      {configuracao.padrao && (
        <p className="text-muted-foreground text-[13px]">
          A empresa ainda usa o padrão. Salvar grava as regras dela.
        </p>
      )}
      <form.AppForm>
        <form.RequiredLegend />
        <RodapeDeAcoes>
          <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
        </RodapeDeAcoes>
      </form.AppForm>
    </form>
  );
}
