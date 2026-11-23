import { Button } from '@base-ui/react/button';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { usePapeisControllerAtualizar } from '../../gen/hooks/usePapeisControllerAtualizar';
import { usePapeisControllerCriar } from '../../gen/hooks/usePapeisControllerCriar';
import { usePapeisControllerExcluir } from '../../gen/hooks/usePapeisControllerExcluir';
import { papeisControllerObterQueryOptions } from '../../gen/hooks/usePapeisControllerObter';
import type { PapelDetalheDto } from '../../gen/types/PapelDetalheDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { useGuardaDeSaida } from '../painel/use-guarda-de-saida';
import { EditorPermissoes } from './EditorPermissoes';
import type { CatalogoMatriz } from './matriz-permissoes';
import { avisoAoSalvar, mesmasPermissoes, resumoDasPermissoes } from './permissoes-papel';

const schema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do papel.')
    .max(60, 'Use no máximo 60 caracteres.'),
  descricao: z.string().trim().max(200, 'Use no máximo 200 caracteres.'),
});

const ERRO_SEM_TELA = 'Conceda acesso a ao menos uma tela.';

export type PapelSalvo = { id: string; sessoesEncerradas: number; meuPapel: boolean };

export type EditarPapelProps = {
  /** Papel aberto; sem ele, é um papel novo. */
  papel?: PapelDetalheDto;
  /** Valores iniciais do papel novo (ao duplicar). */
  base?: { nome: string; descricao: string | null; permissoes: string[] };
  catalogo: CatalogoMatriz;
  /** Papéis de onde copiar as permissões (o aberto sai da lista). */
  papeis?: { id: string; nome: string }[];
  /** Quem edita: só concede o que tem. */
  acesso: { acessoTotal: boolean; permissoes: readonly string[] };
  /** Papéis de quem edita (avisa que a sessão dele também cai). */
  meusPapeis: string[];
  /** `papeis.criar`: papel novo e duplicar. */
  podeCriar: boolean;
  /** `papeis.editar`: salvar um papel existente. */
  podeEditar: boolean;
  /** `papeis.excluir`. */
  podeExcluir: boolean;
  onSalvo: (salvo: PapelSalvo) => void;
  onDuplicar: () => void;
  onExcluido: () => void;
  onCancelar: () => void;
};

/** Editor de um papel ao lado da lista: nome, descrição e permissões por tela. */
export function EditarPapel({
  papel,
  base,
  catalogo,
  papeis = [],
  acesso,
  meusPapeis,
  podeCriar,
  podeEditar,
  podeExcluir,
  onSalvo,
  onDuplicar,
  onExcluido,
  onCancelar,
}: EditarPapelProps) {
  const tituloId = useId();
  const queryClient = useQueryClient();
  const criar = usePapeisControllerCriar();
  const atualizar = usePapeisControllerAtualizar();
  const excluir = usePapeisControllerExcluir();
  const inicial = papel ?? base;
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(
    () => new Set(inicial?.permissoes ?? []),
  );
  const [semTela, setSemTela] = useState(false);
  const [erro, setErro] = useState<unknown>();

  const novo = !papel;
  // O de acesso total não tem lista para editar; os outros do sistema só não mudam de nome.
  const somenteLeitura = novo ? !podeCriar : !podeEditar || Boolean(papel?.acessoTotal);
  const nomeFixo = Boolean(papel?.sistema);
  const mudouPermissoes = papel ? !mesmasPermissoes(papel.permissoes, marcadas) : false;
  const meuPapel = papel ? meusPapeis.includes(papel.id) : false;
  const aviso =
    papel && mudouPermissoes
      ? avisoAoSalvar({ totalUsuarios: papel.totalUsuarios, meuPapel })
      : undefined;

  const form = useAppForm({
    defaultValues: { nome: inicial?.nome ?? '', descricao: inicial?.descricao ?? '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      if (marcadas.size === 0) {
        setSemTela(true);
        return;
      }
      const body = {
        nome: value.nome.trim(),
        descricao: value.descricao.trim() || null,
        permissoes: [...marcadas].sort(),
      };
      let salvo: PapelSalvo;
      try {
        if (papel) {
          const { sessoesEncerradas } = await atualizar.mutateAsync({
            path: { id: papel.id },
            body,
          });
          salvo = { id: papel.id, sessoesEncerradas, meuPapel: meuPapel && mudouPermissoes };
        } else {
          const { id } = await criar.mutateAsync({ body });
          salvo = { id, sessoesEncerradas: 0, meuPapel: false };
        }
      } catch (falha) {
        setErro(falha);
        return;
      }
      await invalidarPapeis(queryClient);
      // A tela vai para o papel salvo antes de os dados novos chegarem: essa navegação passa.
      liberar();
      onSalvo(salvo);
    },
  });

  // Nome, descrição ou permissões mudados e não salvos: sair da página ou trocar de papel pergunta.
  const formAlterado = useAlterado(form, {
    nome: inicial?.nome ?? '',
    descricao: inicial?.descricao ?? '',
  });
  const alterado =
    !somenteLeitura && (formAlterado || !mesmasPermissoes(inicial?.permissoes ?? [], marcadas));
  const { confirmacao, liberar } = useGuardaDeSaida(alterado);

  const excluirPapel = async () => {
    if (!papel) return;
    setErro(undefined);
    try {
      await excluir.mutateAsync({ path: { id: papel.id } });
    } catch (falha) {
      setErro(falha);
      return;
    }
    await invalidarPapeis(queryClient, { detalhe: false });
    liberar();
    onExcluido();
  };

  const alterarMarcadas = (novas: Set<string>) => {
    setMarcadas(novas);
    if (novas.size > 0) setSemTela(false);
  };

  return (
    <section
      aria-labelledby={tituloId}
      className="bg-card flex w-full min-w-0 flex-col self-start rounded-lg border"
    >
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col"
      >
        <div className="flex flex-col gap-4 border-b p-4">
          <h2 id={tituloId} className="text-base font-semibold">
            {papel?.nome ?? 'Novo papel'}
          </h2>
          {papel?.sistema &&
            (papel.acessoTotal ? (
              <Alerta tom="bloqueio" role="note">
                Papel do sistema: não pode ser editado nem excluído.
              </Alerta>
            ) : (
              <Alerta tom="info" role="note">
                Papel do sistema: o nome é fixo e ele não pode ser excluído.
              </Alerta>
            ))}
          {erro !== undefined && <ErroDoPapel erro={erro} novo={novo} />}
          {somenteLeitura ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSomenteLeitura label="Nome" value={papel?.nome ?? ''} />
              <CampoSomenteLeitura label="Descrição" value={papel?.descricao ?? ''} />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {nomeFixo ? (
                  <CampoSomenteLeitura label="Nome" value={papel?.nome ?? ''} />
                ) : (
                  <form.AppField name="nome">
                    {(field) => (
                      <field.TextField
                        label="Nome"
                        placeholder="Ex.: Coordenação"
                        autoComplete="off"
                        required
                      />
                    )}
                  </form.AppField>
                )}
                <form.AppField name="descricao">
                  {(field) => (
                    <field.TextField
                      label="Descrição"
                      placeholder="Para que serve este papel"
                      autoComplete="off"
                    />
                  )}
                </form.AppField>
              </div>
              {!nomeFixo && (
                <form.AppForm>
                  <form.RequiredLegend />
                </form.AppForm>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 p-4">
          <h3 className="font-semibold">Permissões</h3>
          {papel?.acessoTotal ? (
            <p className="text-muted-foreground">
              Este papel tem acesso a todas as telas e ações, inclusive às que forem criadas depois.
            </p>
          ) : (
            <>
              {semTela && <Alerta tom="erro">{ERRO_SEM_TELA}</Alerta>}
              <EditorPermissoes
                catalogo={catalogo}
                marcadas={marcadas}
                onChange={alterarMarcadas}
                acesso={acesso}
                somenteLeitura={somenteLeitura}
                papeisParaCopiar={papeis.filter((outro) => outro.id !== papel?.id)}
                obterPapel={(id) =>
                  queryClient.fetchQuery(papeisControllerObterQueryOptions({ path: { id } }))
                }
              />
            </>
          )}
        </div>

        {/* Acesso total não tem resumo nem ação: o parágrafo acima já diz tudo. */}
        {!papel?.acessoTotal && (
          <Rodape
            resumo={resumoDasPermissoes(marcadas)}
            aviso={aviso}
            bloqueioDeExclusao={
              papel && podeExcluir && !papel.sistema && papel.totalUsuarios > 0
                ? `Para excluir, troque antes o papel ${papel.totalUsuarios === 1 ? 'do único usuário' : `dos ${papel.totalUsuarios} usuários`}.`
                : undefined
            }
          >
            {podeExcluir && papel && !papel.sistema && papel.totalUsuarios === 0 && (
              <ConfirmarAcao
                acao="Excluir papel"
                titulo={`Excluir o papel “${papel.nome}”?`}
                consequencia="Nenhum usuário tem este papel. A exclusão não pode ser desfeita."
                onConfirmar={excluirPapel}
              />
            )}
            {podeCriar && papel && !papel.acessoTotal && (
              <Button
                type="button"
                onClick={onDuplicar}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Duplicar
              </Button>
            )}
            {novo && (
              <Button
                type="button"
                onClick={onCancelar}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Cancelar
              </Button>
            )}
            {!somenteLeitura && (
              <form.AppForm>
                <form.SubmitButton pendingLabel={novo ? 'Criando…' : 'Salvando…'}>
                  {novo ? 'Criar papel' : 'Salvar alterações'}
                </form.SubmitButton>
              </form.AppForm>
            )}
          </Rodape>
        )}
      </form>
      {confirmacao}
    </section>
  );
}

function Rodape({
  resumo,
  aviso,
  bloqueioDeExclusao,
  children,
}: {
  resumo: string;
  aviso?: string;
  bloqueioDeExclusao?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-rodape-fixo=""
      className="bg-card sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t p-4"
    >
      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5 text-[13px]">
        <span className="text-foreground font-medium tabular-nums">{resumo}</span>
        {aviso && <span className="text-warning">{aviso}</span>}
        {bloqueioDeExclusao && <span className="text-muted-foreground">{bloqueioDeExclusao}</span>}
      </span>
      <span className="flex flex-wrap justify-end gap-2">{children}</span>
    </div>
  );
}

function ErroDoPapel({ erro, novo }: { erro: unknown; novo: boolean }) {
  if (ResponseError.is(erro) && [400, 403, 409].includes(erro.status)) {
    const { message } = erro.data as { message?: string };
    if (message) return <Alerta tom="erro">{message}</Alerta>;
  }
  return (
    <Alerta tom="erro">
      Não foi possível {novo ? 'criar' : 'salvar'} o papel agora. Confira sua conexão e tente de
      novo.
    </Alerta>
  );
}

// A lista (`/papeis`), o detalhe (`/papeis/:id`) e os papéis do convite (`/usuarios/papeis`). Ao
// excluir, o detalhe fica de fora: buscá-lo de novo daria 404 enquanto a tela troca de papel.
const invalidarPapeis = (
  queryClient: ReturnType<typeof useQueryClient>,
  { detalhe = true }: { detalhe?: boolean } = {},
) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: [{ url: '/papeis' }] }),
    detalhe && queryClient.invalidateQueries({ queryKey: [{ url: '/papeis/:id' }] }),
    queryClient.invalidateQueries({ queryKey: [{ url: '/usuarios/papeis' }] }),
  ]);
