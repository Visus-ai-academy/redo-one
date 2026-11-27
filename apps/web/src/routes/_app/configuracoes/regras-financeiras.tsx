import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { EstadoDoErro } from '../../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../../components/estado/estados';
import { FormRegrasFinanceiras } from '../../../components/financeiro/FormRegrasFinanceiras';
import { Painel } from '../../../components/painel/Painel';
import { useGuardaDeSaida } from '../../../components/painel/use-guarda-de-saida';
import { Select } from '../../../components/select/Select';
import { useAvisos } from '../../../components/toast/use-avisos';
import { configuracoesFinanceirasControllerAtualizar } from '../../../gen/clients/configuracoesFinanceirasControllerAtualizar';
import { configuracoesFinanceirasControllerListarQueryOptions } from '../../../gen/hooks/useConfiguracoesFinanceirasControllerListar';
import { invalidarFinanceiro } from '../../../lib/financeiro';
import { pode } from '../../../lib/permissoes';

const TELA = 'financeiro-config';

const buscaSchema = z.object({
  empresa: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/configuracoes/regras-financeiras')({
  validateSearch: buscaSchema,
  loader: async ({ context }) => {
    if (!pode(context.sessao, `${TELA}.ver`)) return;
    await context.queryClient.ensureQueryData(
      configuracoesFinanceirasControllerListarQueryOptions(),
    );
  },
  head: () => ({ meta: [{ title: 'Regras financeiras · Configurações · One' }] }),
  component: PaginaRegras,
  errorComponent: ErroDaTela,
});

function ErroDaTela({ error }: ErrorComponentProps) {
  const { sessao } = Route.useRouteContext();
  const router = useRouter();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      <h1 className="text-[22px] leading-snug font-semibold">Regras financeiras</h1>
      <EstadoDoErro
        erro={error}
        oQue="as regras financeiras"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </ConfiguracoesLayout>
  );
}

function PaginaRegras() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, `${TELA}.ver`) ? <Regras /> : <SemPermissao tela="Regras financeiras" />}
    </ConfiguracoesLayout>
  );
}

function Regras() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const { data: empresas } = useSuspenseQuery(
    configuracoesFinanceirasControllerListarQueryOptions(),
  );
  const [alterado, setAlterado] = useState(false);
  const { confirmacao } = useGuardaDeSaida(alterado);
  const atual = empresas.find((e) => e.empresaId === busca.empresa) ?? empresas[0];

  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <h1 className="text-[22px] leading-snug font-semibold">Regras financeiras</h1>
      {!atual ? (
        <p className="text-muted-foreground">
          Nenhuma empresa usa o financeiro do One. Marque “Usa o financeiro do One” no contratado,
          em Configurações › Catálogo › Contratados.
        </p>
      ) : (
        <>
          <div className="flex max-w-[320px] flex-col gap-2">
            <span aria-hidden="true" className="font-medium">
              Empresa
            </span>
            <Select
              aria-label="Empresa"
              value={atual.empresaId}
              onValueChange={(v) => void navigate({ search: { empresa: v }, replace: true })}
              opcoes={empresas.map((e) => ({ valor: e.empresaId, rotulo: e.empresaNome }))}
            />
            <span className="text-muted-foreground text-[13px]">
              Só aparecem as empresas que usam o financeiro do One.
            </span>
          </div>
          <Painel titulo="Padrão da empresa">
            <FormRegrasFinanceiras
              key={atual.empresaId}
              configuracao={atual}
              podeEditar={pode(sessao, `${TELA}.editar`)}
              onAlterado={setAlterado}
              onSalvar={async (dados) => {
                await configuracoesFinanceirasControllerAtualizar({
                  path: { empresaId: atual.empresaId },
                  body: dados,
                }).unwrap();
                await invalidarFinanceiro(queryClient);
                sucesso('Regras salvas.');
              }}
            />
          </Painel>
        </>
      )}
      {confirmacao}
    </div>
  );
}
