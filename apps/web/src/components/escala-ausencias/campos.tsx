import { Button } from '@base-ui/react/button';
import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { X } from '@phosphor-icons/react';
import { useState } from 'react';

import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from '../form/context';
import { FieldError } from '../form/field-parts';
import { useCampo } from '../form/use-campo';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { DIAS_DA_SEMANA } from './ausencias';

function Legenda({ children, required }: { children: string; required?: boolean }) {
  return (
    <Fieldset.Legend className="flex items-baseline gap-1 font-medium">
      {children}
      {required && (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      )}
    </Fieldset.Legend>
  );
}

/**
 * Médicos da ausência (obrigatório): busca para adicionar e a lista dos escolhidos, 5 por página.
 * Como o `EscolhaMultiplaField` do kit, mas com `*` e mensagem de erro.
 */
export function CampoMedicos({ buscar }: { buscar: (termo: string) => Promise<OpcaoBusca[]> }) {
  const field = useFieldContext<OpcaoBusca[]>();
  const [rodada, setRodada] = useState(0);
  const escolhidos = field.state.value;
  const pagina = usePaginaLocal(escolhidos, 5);
  // Como os campos do kit: erro ao sair ou ao enviar, e o envio com erro foca a busca.
  const { erros, aoSair, ref } = useCampo(field);
  const erro = erros.join(', ');

  return (
    <Fieldset.Root className="flex flex-col gap-2">
      <Legenda required>Médicos</Legenda>
      {escolhidos.length > 0 && (
        <ul aria-label="Médicos" className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((item) => (
            <li key={item.valor} className="flex min-h-10 items-center gap-3 px-3 py-1">
              <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
              <Button
                type="button"
                aria-label={`Remover ${item.rotulo}`}
                onClick={() => {
                  field.handleChange(escolhidos.filter((m) => m.valor !== item.valor));
                  aoSair();
                }}
                className={buttonClassName({
                  variant: 'ghost',
                  className: 'text-muted-foreground size-8 flex-none px-0',
                })}
              >
                <X size={16} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {pagina.precisaPaginar && (
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      )}
      <Field.Root
        ref={ref}
        name={field.name}
        invalid={Boolean(erro)}
        className="flex flex-col gap-2"
      >
        <Field.Label className="text-muted-foreground text-[13px]">Adicionar médico</Field.Label>
        <BuscaSelecao
          key={rodada}
          chave="medicos-ausencia"
          buscar={buscar}
          valor={null}
          aria-invalid={Boolean(erro) || undefined}
          onMudar={(opcao) => {
            if (!opcao) return;
            if (!escolhidos.some((m) => m.valor === opcao.valor)) {
              field.handleChange([...escolhidos, opcao]);
            }
            aoSair();
            setRodada((n) => n + 1);
          }}
          placeholder="Digite o nome do médico"
        />
        <Field.Description className="text-muted-foreground text-[13px]">
          Escolha um ou vários: cada médico ganha a sua ausência.
        </Field.Description>
        <FieldError invalid={Boolean(erro)}>{erro}</FieldError>
      </Field.Root>
    </Fieldset.Root>
  );
}

/** Dias da semana numa linha (seg a dom), sobre o CheckboxGroup do Base UI. Valor: "0".."6". */
export function CampoDiasSemana() {
  const field = useFieldContext<string[]>();
  const { aoSair, ref } = useCampo(field);
  return (
    <Fieldset.Root
      ref={ref}
      render={
        <CheckboxGroup
          value={field.state.value}
          onValueChange={(valores) => {
            field.handleChange(valores);
            aoSair();
          }}
        />
      }
      className="flex flex-col gap-2"
    >
      <Legenda>Dias da semana</Legenda>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {DIAS_DA_SEMANA.map((dia) => (
          <Field.Root key={dia.valor}>
            <Field.Label className="flex items-center gap-2">
              <CaixaDeSelecao value={String(dia.valor)} />
              {dia.rotulo}
            </Field.Label>
          </Field.Root>
        ))}
      </div>
      <p className="text-muted-foreground text-[13px]">Nenhum marcado: todos os dias do período.</p>
    </Fieldset.Root>
  );
}
