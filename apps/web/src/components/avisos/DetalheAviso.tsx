import { Button } from '@base-ui/react/button';
import { type ReactNode, useEffect, useState } from 'react';
import { z } from 'zod';

import type { AvisoDto } from '../../gen/types/AvisoDto';
import { competenciasDoAviso, situacaoDoAviso } from '../../lib/avisos';
import { dataHoraCurta } from '../../lib/datas';
import { numero } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';
import { ListaDeNomes } from '../lista-de-nomes/ListaDeNomes';
import { useAlterado } from '../painel/fechamento';

/** Par rótulo e valor; `bloco` põe o valor (texto longo, como o motivo) abaixo, à esquerda. */
function Campo({
  rotulo,
  bloco = false,
  children,
}: {
  rotulo: string;
  bloco?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={bloco ? 'flex flex-col gap-1 py-1.5' : 'flex justify-between gap-4 py-1.5'}>
      <dt className="text-muted-foreground flex-none">{rotulo}</dt>
      <dd className={bloco ? 'break-words' : 'min-w-0 text-right break-words tabular-nums'}>
        {children}
      </dd>
    </div>
  );
}

/** Do que são os nomes citados pelo aviso (`itens`), por tipo. */
const ROTULO_DOS_ITENS: Partial<Record<AvisoDto['tipo'], string>> = {
  catalogo_criado_carga: 'Tabelas de preço que o usam',
  cliente_inativo: 'Exames parados na fila',
  repasse_sem_preco: 'Clientes dos laudos',
};

/** Rótulo das ocorrências quando o tipo conta outra coisa que a origem. */
const OCORRENCIAS_DO_TIPO: Partial<Record<AvisoDto['tipo'], string>> = {
  cliente_inativo: 'Exames na última leitura da fila',
};

const schema = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, 'Informe por que o aviso vai ser ignorado.')
    .max(300, 'Use até 300 caracteres.'),
});

const TEXTOS_IMPORTACAO = {
  resolvido: 'Uma importação achou o cadastro deste nome. O aviso saiu da lista de pendentes.',
  oQueFazer:
    'Se o cadastro já existe com outra grafia, acrescente este nome como apelido ou variação. A próxima importação resolve o aviso.',
};

/** Os tipos que nascem na rodada da distribuição, com o que resolve cada um. */
const TEXTOS: Partial<Record<AvisoDto['tipo'], typeof TEXTOS_IMPORTACAO>> = {
  prioridade_operacao: {
    resolvido:
      'A grafia entrou no de-para das prioridades da operação. O aviso saiu da lista de pendentes.',
    oQueFazer:
      'Acrescente esta grafia ao de-para de uma das prioridades da operação. A próxima rodada resolve o aviso.',
  },
  conta_unidade: {
    resolvido:
      'Uma rodada encontrou a conta do médico liberada nesta unidade na MobileMed. O aviso saiu da lista de pendentes.',
    oQueFazer:
      'O robô não entrega exames desta unidade a este médico, e nada mudou sozinho no cadastro. Libere a conta do médico nesta unidade na MobileMed ou, se ele usa outra conta lá, acrescente-a às outras contas dele. A próxima rodada que conferir a unidade resolve o aviso.',
  },
  cliente_ambiguo: {
    resolvido:
      'Uma importação conseguiu decidir o cliente deste nome. O aviso saiu da lista de pendentes.',
    oQueFazer:
      'Os laudos deste nome ficam sem cliente. Acrescente o nome como apelido exato do cliente certo. A próxima importação resolve o aviso.',
  },
  preco_repetido: {
    resolvido:
      'O preço foi conferido (alterado ou encerrado na tela) ou a repetição sumiu do dashboards-one. O aviso saiu da lista de pendentes.',
    oQueFazer:
      'No dashboards-one havia mais de um valor para o mesmo arranjo, faixa e vigência; ficou o da alteração mais recente. Confira o valor na tabela de preços: alterar ou encerrar a versão resolve o aviso; se o valor está certo, ignore com o motivo.',
  },
  cliente_inativo: {
    resolvido:
      'A leitura da fila não encontrou mais exames deste cliente inativo (ele foi reativado ou os exames saíram da fila). O aviso saiu da lista de pendentes.',
    oQueFazer:
      'O robô não distribui os exames de cliente inativo. Se o cliente segue atendido, reative o cliente no cadastro; a próxima leitura da fila resolve o aviso. Se não, os exames ficam para a distribuição à mão.',
  },
  repasse_sem_preco: {
    resolvido:
      'O arranjo ganhou preço de repasse (ou os laudos saíram da competência). O aviso saiu da lista de pendentes.',
    oQueFazer:
      'Os laudos deste médico neste arranjo estão sendo pagos a zero. Cadastre o preço de repasse do médico para o arranjo; a próxima geração do repasse resolve o aviso. Enquanto pendente, impede fechar a competência.',
  },
  preco_repasse_repetido: {
    resolvido: 'O preço de repasse foi conferido. O aviso saiu da lista de pendentes.',
    oQueFazer:
      'No dashboards-one havia mais de um valor para o mesmo médico, arranjo e cliente, e ele usava um deles sem critério; no One ficou o da alteração mais recente. Confira o valor; se está certo, ignore com o motivo.',
  },
  catalogo_criado_carga: {
    resolvido: 'O item foi conferido. O aviso saiu da lista de pendentes.',
    oQueFazer:
      'A carga do dashboards-one criou este item no catálogo porque os preços de lá o usam. Confira o nome e as variações; se está certo, ignore com o motivo.',
  },
};

const ORIGENS: Record<AvisoDto['origem'], string> = {
  importacao: 'Importação de laudos',
  rodada: 'Rodada da distribuição',
  carga: 'Carga do dashboards-one',
  tela: 'Tela',
  job: 'Rotina automática',
};

const OCORRENCIAS: Record<AvisoDto['origem'], string> = {
  importacao: 'Laudos na última importação',
  rodada: 'Exames na última rodada',
  carga: 'Linhas na última carga',
  tela: 'Ocorrências',
  job: 'Ocorrências',
};

/** Conteúdo do painel de um aviso de cadastro, com a triagem (ignorar ou reabrir). */
export function DetalheAviso({
  aviso,
  podeTriar,
  procurar,
  onIgnorar,
  onReabrir,
  onAlterado,
}: {
  aviso: AvisoDto;
  podeTriar: boolean;
  /** Atalho para o cadastro onde o nome deveria estar (link da tela certa, já com a busca). */
  procurar?: ReactNode;
  onIgnorar?: (motivo: string) => Promise<void>;
  onReabrir?: () => Promise<void>;
  /** Motivo digitado e não enviado: o painel pergunta antes de fechar. */
  onAlterado?: (alterado: boolean) => void;
}) {
  const situacao = situacaoDoAviso(aviso.status);
  const { erro, tentar } = useErroDoPainel();
  const [reabrindo, setReabrindo] = useState(false);
  const form = useAppForm({
    defaultValues: { motivo: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(
        async () => onIgnorar?.(value.motivo.trim()),
        'Não foi possível ignorar o aviso. Confira sua conexão e tente de novo.',
      ),
  });
  const alterado = useAlterado(form, { motivo: '' });
  useEffect(() => {
    onAlterado?.(alterado);
    return () => onAlterado?.(false);
  }, [alterado, onAlterado]);
  const decisao = aviso.status === 'ignorado' ? 'Ignorado' : 'Resolvido';
  const competencias = competenciasDoAviso(aviso.competencias);
  const textos = TEXTOS[aviso.tipo] ?? TEXTOS_IMPORTACAO;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-3">
        <span>
          <Etiqueta tom={situacao.tom}>{situacao.texto}</Etiqueta>
        </span>
        {aviso.status === 'resolvido' && (
          <Alerta tom="sucesso" role="status">
            {textos.resolvido}
          </Alerta>
        )}
      </div>

      {/* O texto do aviso é o título do painel; aqui ficam os dados dele. */}
      <dl className="divide-y">
        <Campo rotulo="Encontrado por">{ORIGENS[aviso.origem]}</Campo>
        <Campo rotulo={OCORRENCIAS_DO_TIPO[aviso.tipo] ?? OCORRENCIAS[aviso.origem]}>
          {numero(aviso.ocorrencias)}
        </Campo>
        {competencias && <Campo rotulo="Competência">{competencias}</Campo>}
        <Campo rotulo="Apareceu em">{dataHoraCurta(aviso.primeiraVezEm)}</Campo>
        <Campo rotulo="Visto por último em">{dataHoraCurta(aviso.ultimaVezEm)}</Campo>
        {aviso.decididoPor && <Campo rotulo={`${decisao} por`}>{aviso.decididoPor.nome}</Campo>}
        {aviso.decididoEm && aviso.status !== 'pendente' && (
          <Campo rotulo={`${decisao} em`}>{dataHoraCurta(aviso.decididoEm)}</Campo>
        )}
        {aviso.motivo && (
          <Campo rotulo="Motivo" bloco>
            {aviso.motivo}
          </Campo>
        )}
      </dl>

      {aviso.itens.length > 0 && (
        <ListaDeNomes
          rotulo={ROTULO_DOS_ITENS[aviso.tipo] ?? 'Citados no aviso'}
          nomes={aviso.itens}
        />
      )}

      {aviso.status === 'pendente' && procurar && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-[13px]">{textos.oQueFazer}</p>
          <div>{procurar}</div>
        </div>
      )}

      {erro && <Alerta tom="erro">{erro}</Alerta>}

      {podeTriar && aviso.status === 'pendente' && (
        <form
          noValidate
          className="flex flex-col gap-4 border-t pt-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="motivo">
            {(field) => (
              <field.TextAreaField
                label="Motivo"
                required
                placeholder="Ex.: cliente de teste da MobileMed"
                description="Fica registrado com quem ignorou."
              />
            )}
          </form.AppField>
          <div className="flex justify-end">
            <form.AppForm>
              <form.SubmitButton variant="secondary" pendingLabel="Ignorando…">
                Ignorar aviso
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      {podeTriar && aviso.status === 'ignorado' && (
        <div className="flex justify-end border-t pt-4">
          <Button
            type="button"
            disabled={reabrindo}
            onClick={async () => {
              setReabrindo(true);
              await tentar(
                async () => onReabrir?.(),
                'Não foi possível reabrir o aviso. Confira sua conexão e tente de novo.',
              );
              setReabrindo(false);
            }}
            className={buttonClassName({ variant: 'secondary' })}
          >
            {reabrindo ? 'Reabrindo…' : 'Reabrir aviso'}
          </Button>
        </div>
      )}
    </div>
  );
}
