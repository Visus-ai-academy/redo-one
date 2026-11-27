import { useStore } from '@tanstack/react-form';
import { useState } from 'react';
import { z } from 'zod';

import type { BaixaDto } from '../../../gen/types/BaixaDto';
import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import { moeda } from '../../../lib/formato';
import { centavosDoTexto, textoDeCentavos } from '../../../lib/repasse';
import { diaDeHoje, numeroDoTitulo, ROTULO_FORMA, type TipoTitulo } from '../../../lib/titulos';
import { Alerta } from '../../alerta/Alerta';
import { mensagemDaApi } from '../../alerta/mensagem-da-api';
import { Dialogo } from '../../dialogo/Dialogo';
import { DateField } from '../../form/DateField';
import { mostrarErrosDoServidor } from '../../form/erros-do-servidor';
import { useAppForm } from '../../form/form';
import { useAlterado } from '../../painel/fechamento';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const opcional = (v: string) => v.trim() === '' || centavosDoTexto(v) !== null;
const centavos = (v: string) => (v.trim() ? (centavosDoTexto(v) ?? 0) : 0);

/** O título que recebe a baixa: o saldo e a conta sugerida. */
export type TituloParaBaixa = {
  id: string;
  numero: number;
  contratadoId: string;
  favorecido: { nome: string };
  valorCentavos: number;
  pagoCentavos: number;
  contaPrevistaId: string | null;
};

type DialogoBaixaProps = {
  tipo: TipoTitulo;
  titulo: TituloParaBaixa;
  /** Contas ativas da empresa do título. */
  contas: ContaBancariaItemDto[];
  onBaixar: (dados: BaixaDto) => Promise<void>;
  onFechar: () => void;
};

/**
 * Dar baixa (pagamento ou recebimento): ação pontual, no diálogo. Juros, multa e desconto são
 * digitados; o total movimentado e a situação que fica aparecem enquanto se digita.
 */
export function DialogoBaixa({ tipo, titulo, contas, onBaixar, onFechar }: DialogoBaixaProps) {
  const [erro, setErro] = useState<string>();
  const saldo = titulo.valorCentavos - titulo.pagoCentavos;
  const verbo = tipo === 'pagar' ? 'pago' : 'recebido';
  const hoje = diaDeHoje();
  const contaSugerida =
    (titulo.contaPrevistaId && contas.find((c) => c.id === titulo.contaPrevistaId)?.id) ||
    (tipo === 'receber' ? contas.find((c) => c.padraoRecebimento)?.id : undefined) ||
    (contas.length === 1 ? contas[0]?.id : undefined) ||
    '';

  const schema = z
    .object({
      pagoEm: z
        .string()
        .regex(DIA, 'Informe a data do pagamento.')
        .refine((v) => v <= hoje, 'A data do pagamento não pode ser depois de hoje.'),
      contaBancariaId: z.string().min(1, 'Escolha a conta bancária.'),
      principalCentavos: z
        .string()
        .refine(
          (v) => (centavosDoTexto(v) ?? 0) > 0,
          `Informe o valor ${verbo}, com vírgula nos centavos.`,
        )
        .refine(
          (v) => (centavosDoTexto(v) ?? 0) <= saldo,
          `O valor passa do saldo do título (${moeda(saldo / 100)}).`,
        ),
      jurosCentavos: z.string().refine(opcional, 'Use vírgula nos centavos (ex.: 18,40).'),
      multaCentavos: z.string().refine(opcional, 'Use vírgula nos centavos (ex.: 24,00).'),
      descontoCentavos: z.string().refine(opcional, 'Use vírgula nos centavos (ex.: 10,00).'),
      forma: z.string().min(1, 'Escolha a forma.'),
      observacao: z.string().max(500, 'Use até 500 caracteres.'),
    })
    .superRefine((v, ctx) => {
      if (
        centavos(v.descontoCentavos) >
        centavos(v.principalCentavos) + centavos(v.jurosCentavos) + centavos(v.multaCentavos)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['descontoCentavos'],
          message: 'O desconto não pode passar do valor com juros e multa.',
        });
      }
    });

  const iniciais = {
    pagoEm: hoje,
    contaBancariaId: contaSugerida,
    principalCentavos: textoDeCentavos(saldo),
    jurosCentavos: '',
    multaCentavos: '',
    descontoCentavos: '',
    forma: 'pix',
    observacao: '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onBaixar({
          pagoEm: value.pagoEm,
          contaBancariaId: value.contaBancariaId,
          principalCentavos: centavos(value.principalCentavos),
          jurosCentavos: centavos(value.jurosCentavos),
          multaCentavos: centavos(value.multaCentavos),
          descontoCentavos: centavos(value.descontoCentavos),
          forma: value.forma as BaixaDto['forma'],
          observacao: value.observacao.trim() || null,
        });
      } catch (falha) {
        if (!mostrarErrosDoServidor(form, falha)) {
          setErro(
            mensagemDaApi(
              falha,
              'Não foi possível dar baixa agora. Confira sua conexão e tente de novo.',
            ),
          );
        }
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const valores = useStore(form.store, (s) => s.values);
  const principal = centavos(valores.principalCentavos);
  const movimentado =
    principal +
    centavos(valores.jurosCentavos) +
    centavos(valores.multaCentavos) -
    centavos(valores.descontoCentavos);
  const fica =
    principal <= 0
      ? null
      : principal >= saldo
        ? 'Liquidado'
        : `Parcial (saldo de ${moeda((saldo - principal) / 100)})`;

  return (
    <Dialogo
      titulo="Dar baixa"
      descricao={`${numeroDoTitulo(tipo, titulo.numero)} · ${titulo.favorecido.nome} · saldo ${moeda(saldo / 100)}`}
      alterado={alterado}
      onFechar={onFechar}
      onEnviar={() => void form.handleSubmit()}
      acao={
        <form.AppForm>
          <form.SubmitButton pendingLabel="Dando baixa…">Dar baixa</form.SubmitButton>
        </form.AppForm>
      }
    >
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <form.AppField name="pagoEm">
          {() => (
            <DateField
              label={tipo === 'pagar' ? 'Data do pagamento' : 'Data do recebimento'}
              required
              max={hoje}
            />
          )}
        </form.AppField>
        <form.AppField name="contaBancariaId">
          {(field) => (
            <field.SelectField
              label="Conta bancária"
              required
              placeholder={contas.length ? 'Escolha a conta' : 'Nenhuma conta ativa na empresa'}
              disabled={contas.length === 0}
              opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.apelido }))}
            />
          )}
        </form.AppField>
        <form.AppField name="principalCentavos">
          {(field) => (
            <field.TextField
              label={`Valor ${verbo} (R$)`}
              required
              placeholder="0,00"
              inputMode="decimal"
              spellCheck={false}
              description="Quanto abate do saldo."
            />
          )}
        </form.AppField>
        <form.AppField name="forma">
          {(field) => (
            <field.SelectField
              label="Forma"
              required
              placeholder="Escolha"
              opcoes={Object.entries(ROTULO_FORMA).map(([valor, rotulo]) => ({ valor, rotulo }))}
            />
          )}
        </form.AppField>
        <form.AppField name="jurosCentavos">
          {(field) => (
            <field.TextField
              label="Juros (R$)"
              placeholder="0,00"
              inputMode="decimal"
              spellCheck={false}
            />
          )}
        </form.AppField>
        <form.AppField name="multaCentavos">
          {(field) => (
            <field.TextField
              label="Multa (R$)"
              placeholder="0,00"
              inputMode="decimal"
              spellCheck={false}
            />
          )}
        </form.AppField>
        <form.AppField name="descontoCentavos">
          {(field) => (
            <field.TextField
              label="Desconto (R$)"
              placeholder="0,00"
              inputMode="decimal"
              spellCheck={false}
            />
          )}
        </form.AppField>
        <div className="flex flex-col gap-2">
          <span className="font-medium">Fica</span>
          <span className="text-muted-foreground" aria-live="polite">
            {fica ?? '—'}
          </span>
        </div>
      </div>
      <div className="bg-muted flex items-center justify-between rounded-md px-3 py-2.5 tabular-nums">
        <span className="text-muted-foreground">Total movimentado</span>
        <strong aria-live="polite">{moeda(movimentado / 100)}</strong>
      </div>
      <form.AppField name="observacao">
        {(field) => (
          <field.TextField
            label="Observação"
            placeholder={
              tipo === 'pagar'
                ? 'Ex.: pago com juros do atraso'
                : 'Ex.: Pix recebido com juros do atraso'
            }
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.RequiredLegend />
      </form.AppForm>
    </Dialogo>
  );
}
