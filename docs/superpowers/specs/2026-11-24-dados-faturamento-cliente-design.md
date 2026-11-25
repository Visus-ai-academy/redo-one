# Dados de faturamento do cliente

Data: 24/11/2026. Aprovado pelo usuário em conversa ("prosiga" sobre o esboço da aba).

## Intenção

Os dados que a emissão de NF, os e-mails pós-fechamento, o Omie e os contratos vão usar ainda moram na ficha do cliente do dashboards-one. Pelo desenho (`CLAUDE.md`, `docs/redesenho-banco.md` §2.7 e linha `Cliente`), eles pertencem ao `faturamento`. Esta etapa os traz para o redo-one, com tela e carga do legado, sem depender das perguntas pendentes ao financeiro.

## Objetivos

- Tabela `clientes_dados_fiscais` no `faturamento`, 1:1 com `clientes` (catalogo).
- Aba Faturamento do painel do cliente com as seções Nota fiscal, Endereço, Contato, Banco e Omie, abaixo do corte que já existe.
- Carga do dashboards-one trazendo os dados como estão.

## Não objetivos

- Sincronização com o Omie, emissão de NF e envio de e-mail (etapas seguintes).
- Aplicar a exclusão fiscal no cálculo (não há demonstrativo ainda); só guardar a marca.
- `status` e `codCliente` da ficha legada (vieram do painelgestao-teleimagem; nenhum cálculo usa): não vêm.
- Ficha contratual, franquia, representante e testemunha (outros contextos).

## Dados (levantados no dashboards-one em 24/11, 313 clientes, 298 ativos)

| Campo redo-one | Legado (`clientes`) | Preenchidos | Uso no legado |
| --- | --- | --- | --- |
| `emails_nf text[]` | `emailEnvioNf` (texto separado por `,` ou `;`; 260 têm vários) | 276 | E-mails pós-fechamento (`emailsPosFechamento.ts`); vazio cai em `email` (`omie.ts:441`) |
| `email` | `email` | 268 | Cadastro no Omie |
| `contato_nome`, `telefone` | `contato`, `telefone` | ~60 | Cadastro no Omie |
| `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf` | `cep`, `endereco`, `enderecoNumero`, `complemento`, `bairro`, `cidade`, `estado` | 274 | Cadastro no Omie (`omie.ts:179-193`; vazio vira "Não informado"/"S/N") |
| `banco_codigo`, `banco_agencia`, `banco_conta` | `bancoCodigo`, `bancoAgencia`, `bancoConta` | 1 | `dadosBancarios` no Omie |
| `omie_codigo_cliente`, `omie_sincronizado_em` | `omieCodigoCliente`, `omieDataSincronizacao` | 265 (207 distintos) | Emissão da NF |
| `exclusao_fiscal boolean` | `configuracoes.faturamentoExclusaoFiscal` (lista de nomes: RADIOCOR_LOCAL, CLINICADIA_TC, CLINICA RADIOCOR, CLINICA_RADIOCOR) | 4 | Laudos desses clientes saem do faturamento (`laudosFaturaveis.ts:10,407`) |

Casos de borda encontrados:

- O código Omie se repete entre clientes do mesmo CNPJ (34 unidades PRN com o mesmo código; CLINICA_IRAD/TUPA/POMPEIA…). Não é único.
- CEP: 10 fora do formato (vazios, 7 dígitos sem o zero à esquerda como `2016010`, `12.606-580`, um com 9 dígitos).
- `emailEnvioNf` costuma incluir `administracao@teleimagem.com.br` como cópia interna: vem como está.

## Decisões

Do usuário: as seções e campos do esboço aprovado; carga trazendo tudo como está; exclusão fiscal vira marca no cliente.

Minhas (o usuário pode corrigir):

1. **Permissões** no padrão da aba de distribuição: `clientes.faturamento.ver` e `clientes.faturamento.editar`. O corte continua com `faturamento.corte.editar`. **Ninguém recebe o ver por padrão** (decisão do usuário, 24/11, LGPD): a migration `0052` o dava a quem via clientes, e a `0055` o revoga; quem precisa recebe a chave no papel.
2. **Obrigatórios:** nada é obrigatório no banco (o legado tem clientes sem endereço). Na tela, se qualquer campo de endereço for preenchido, CEP, logradouro, cidade e UF passam a ser obrigatórios (com `*`). CEP com 8 dígitos; UF entre as 27 siglas; e-mails validados um a um.
3. **E-mails de NF:** lista (`text[]`), editada como lista na tela (adicionar e remover). Na carga, separados por `,`, `;` ou espaço, sem vazios e sem repetidos, na ordem original.
4. **CEP** guardado só com dígitos; na carga, 7 dígitos ganham o zero à esquerda; o que não der 8 dígitos vem como está e a tela mostra o erro ao editar.
5. **Código no Omie** só leitura na tela (quem preenche é a sincronização, que vem depois).
6. **Unidade** (cliente unificado em outro): pode ter dados próprios (a carga traz os do legado); a aba avisa que a NF usa os dados do cliente principal.
7. **Exclusão fiscal na carga:** os nomes da lista são resolvidos para o cliente pelo nome na MobileMed e pelos apelidos; nome que não resolver é listado no relatório da carga e ignorado.
8. **Auditoria** em toda alteração (entidade crítica: define para onde vai a NF). Dados de contato não vão para logs.
9. Carga pelo `migrar:legado` como os outros mapeadores (`mapear-dados-fiscais.ts`), sobrescrevendo, porque o dashboards-one é a fonte da verdade até a virada.

## Abordagens consideradas

- **Tabela própria no `faturamento` (escolhida):** segue o desenho por contexto; a aba lê e grava pelo módulo dono.
- Colunas novas em `clientes` (catalogo): mais simples, mas mistura contextos, o problema que o redesenho resolve.
- JSON único por cliente: sem validação nem consulta por campo; descartado.

## Fica para o construtor

Nomes de arquivos, DTOs, forma do endpoint (GET/PUT por cliente), layout fino da aba dentro do padrão Base UI do projeto.
