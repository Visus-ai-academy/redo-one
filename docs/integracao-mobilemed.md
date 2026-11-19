# Integração com a MobileMed: rotas internas do portal

Fase 1 do "plano B" (aprovado em 18/11/2026): a MobileMed não tem API oficial, e o uso das chamadas internas do portal está autorizado. Este documento mapeia as **rotas** (método, URL, corpo, resposta) que a distribuição precisa, para orientar os adaptadores reais das portas `FilaExames` e `AtribuidorExames` (`apps/api/src/distribuicao/application/ports`) e o de-para `medicos.id_mobilemed`.

Feito **só lendo código**. Nenhuma requisição foi feita à MobileMed. O login (Cognito, token de 5 min, renovação, conta de serviço com TOTP) está na seção 1.4.

**Legenda**

- **CONHECIDO**: está no código (bundle do portal ou robô legado).
- **PROVÁVEL**: deduzido do código, sem prova direta.
- **DESCONHECIDO**: o código não mostra. A fase 2 (HAR, seção 7) responde.

**Fontes**

| Fonte | O que tem |
| --- | --- |
| `mobile.js` (raiz do redo-one, **fora do git**: é código do fornecedor) | Bundle AngularJS do portal `laudos.mobilemed.com.br` (~80 mil linhas). Os serviços HTTP com método, URL e corpo; o controller da janela "Dados da equipe" (`modalMedicoCtrl`); os modelos que montam os corpos. Linhas citadas como `mobile.js:N` |
| `../rpa-dashboards-one` | O robô legado: `rpa/distribuicao/fila_api.py`, `atribuir_api.py`, `tela_exames.py`, `scheduler.py`, `nomes.py`, `rpa/mobilemed.py`, `rpa/comentarios.py`, `DISTRIBUICAO.md`, `COMENTARIOS.md`, `config.example.env`. Mostra como o robô usa as rotas e os casos de borda que encontrou em produção |
| `../dashboards-one` | `prisma/schema.prisma` (`Medico.idMobilemed`), `src/lib/services/distribuicao/rodadas.ts` |
| `TODO.md` (redo-one) | Achado de 18/11 sobre o `reports-api` e o Cognito |

O `mobile.js` é uma foto do bundle: a MobileMed pode mudá-lo a qualquer deploy. As linhas citadas valem para esta cópia.

---

## 1. Visão geral

### 1.1 Hosts (`mobile.js:1`)

| Constante | Valor | Uso |
| --- | --- | --- |
| `API_URL` (e `ENV_API_URL_AUTENTICACAO`) | `https://gateway-sa.mobilemed.com.br/portal-api` | Todas as rotas da distribuição |
| `API_URL_REPORTS` | `https://gateway-sa.mobilemed.com.br/reports-api` | Relatórios (descritivo, CSV da lista) |
| `OAUTH2_AUTHORITY` | `https://gateway-sa.mobilemed.com.br/oauth/us-east-1_6Ey29vkej` | Login OIDC (pool do Cognito) |
| `MOBI_IA_API_URL` | `https://gateway-sa.mobilemed.com.br/ai-api` | IA (fora do escopo) |
| `PUBLIC_API_URL` | `https://integracao.mobilemed.com.br/v1` | **API pública de integração** da MobileMed. Não é usada pela distribuição no bundle; vale perguntar à MobileMed o que ela cobre |
| `ENV_URL_PORTAL_USUARIO` | `https://laudos.mobilemed.com.br/` | O portal |

`config.example.env` do legado usa `https://app.mobilemed.com.br/login` como porta de entrada.

### 1.2 Cabeçalhos exigidos (CONHECIDO)

Todo serviço monta a requisição com `Content-Type: application/json` e um cabeçalho `token`. Um interceptor troca isso antes de enviar:

- `loginInterceptor` (`mobile.js:8662-8680`): se a requisição tem `headers.token`, pega o access token do `authService.getAccessToken()` (cliente `Oidc.UserManager`, `mobile.js:1799-1900`), põe **`Authorization: Bearer <access token>`** e apaga o `token`.
- `traceparentInterceptor` (`mobile.js:8687+`): acrescenta `traceparent`/`tracestate` (rastreamento APM). Não parece obrigatório.
- Nenhum cabeçalho de unidade ou tenant nas rotas da distribuição: a unidade vai no corpo ou na URL.

Respostas de erro que o portal trata (`httpInterceptor`, `mobile.js:8595-8625`): `data.error_reason = "invalid_token"` (sessão inválida → logout), `"forbidden_access"` (mudança de IP em `/laudo` e `/viewer`), `410` com `x-force-logout: true` ("sessão encerrada por um administrador"). Formato geral do erro: `{ error_code, error_msg, error_reason?, error_desc? }`.

Comportamento de sessão observado pelo robô legado (para o desenho do login, não deste documento): token de 5 min; rotação de refresh token (duas abas ou processos renovando o mesmo refresh se derrubam); `500 "Refresh token not found"` pouco depois de o access token vencer; dois robôs na mesma conta se derrubam, por isso uma conta por robô.

### 1.3 Navegador × HTTP

O robô legado faz tudo de dentro do navegador (chama os serviços do Angular por `page.evaluate`). Com o bundle, **todas as rotas da distribuição ficam conhecidas como HTTP comum** (JSON + `Authorization: Bearer`). O login também é HTTP comum (seção 1.4): nada exige navegador.

### 1.4 Login (CONHECIDO pelos bundles; mapeado em 19/11/2026)

Lido nos bundles públicos do portal (`laudos.mobilemed.com.br`, `app-*.min.js` e o oidc-client 1.x em `dependencies-*.min.js`) e da tela de login (`login.mobilemed.com.br`, React, `static/js/main.*.js`). O robô legado faz o mesmo pelo navegador (e-mail → Próximo → senha → campo `totp`).

- **Provedor**: OIDC próprio da MobileMed sobre o Cognito. Descoberta em `https://gateway-sa.mobilemed.com.br/oauth/us-east-1_6Ey29vkej/mobilemed/.well-known/openid-configuration` (o tenant `mobilemed` vem de `GET {API_URL}/oauth/redirect/tenant`, pelo `Origin` do portal). `token_endpoint` = `{OAUTH}/token`; `authorization_endpoint` em `login.mobilemed.com.br`.
- **client_id do portal**: `4himolqrop85htlpcl6k1ljmos` (`OAUTH2_CLIENT_ID`, público; sem client secret). A tela de login usa o `client_id` que vem na URL de autorização; sem ele, o dela (`3n01qfuhbl9362cj65q7ta3m84`).
**Fluxo que funciona (testado ao vivo em 19/11/2026)**: o do navegador (oidc-client do portal + tela de login). Em todas as chamadas de `{OAUTH}` vão `Origin: https://login.mobilemed.com.br` (sem ele, o firewall do gateway devolve 403 em `/login/*`; o User-Agent não importa) e `Accept: application/json, text/plain, */*`.

1. PKCE: `code_verifier` = 32 bytes aleatórios em base64url; `code_challenge` = base64url(sha256(verifier)); `state` aleatório.
2. `PUT {OAUTH}/authorize`, JSON `{ client_id, redirect_uri: "https://laudos.mobilemed.com.br/oauth/callback", response_type: "code", scope: "openid", state, code_challenge, code_challenge_method: "S256", prompt: "login" }` → `{ client_id, redirect_uri, authorization_code, state }`.
3. `POST {OAUTH}/login/auth`, JSON `{ email, password, client_id }` → `{ challenge: "TOTP", challenge_name, challenge_session, challenge_parameters }` (ou os tokens; `NEW_PASSWORD` o One não responde).
4. `POST {OAUTH}/login/challenge/totp`, JSON `{ client_id, challenge_session, code }` → `{ access_token, id_token, refresh_token, expires_in, token_type, email }`. **Tokens do Cognito** (`iss=cognito-idp…`): o `reports-api` os recusa (401 `invalid_token`) e o `/token` do gateway não aceita esse refresh (500).
5. `PUT {OAUTH}/storage`, JSON `{ ...tokens do passo 4, authorization_code }` → `{ success, session }`.
6. `POST {OAUTH}/token`, form `grant_type=authorization_code&code=…&redirect_uri=…&client_id=…&code_verifier=…` → `{ access_token, id_token, refresh_token, token_type, expires_in }`. **Este** access token é do gateway (`iss=https://gateway-sa.mobilemed.com.br/oauth/us-east-1_6Ey29vkej/mobilemed`), vale 300 s e é o que vai no `Authorization: Bearer` do `portal-api` e do `reports-api`.
7. Renovação: `POST {OAUTH}/token`, form `grant_type=refresh_token&refresh_token=<do passo 6>&client_id=…` → tokens novos, com o refresh girado.

Ao vivo: o `descritivoEspecialidade` "no padrão" de 18/11 devolveu HTTP 200 com 1.420 laudos.

---

## 2. Rotas

Todas em `API_URL` = `https://gateway-sa.mobilemed.com.br/portal-api`, salvo indicação.

### 2.1 Lista de exames: `POST /exame/lista`

- Serviço: `exameHttpServices.buscaListaExames(exames, filtroContagem)` (`mobile.js:3705-3718`). CONHECIDO.
- Corpo: `{ exames: <filtro>, filtroContagem: <obj> }`. O portal e o robô passam `filtroContagem: {}` na consulta simples (`mobile.js:23344`).
- O filtro é montado por `exameModel.filtroExames` (`mobile.js:68191-68270`):

```json
{
  "filtro": {
    "is_excluido": false,
    "modalidades": [], "prioridades": [], "medicos": [], "empresas": [],
    "pesquisa": "", "nome_paciente": "", "codigo_paciente": "", "estudo_descricao": "",
    "prioridade_id": 0,
    "periodo": { "data_inicial": "", "data_final": "" },
    "transferencia": { "data_inicial_transferencia": "", "data_final_transferencia": "" },
    "tipo_tempo": 2,
    "tipo_exame": 1, "listagem_id": 2, "tipo_listagem": 1, "is_crescente": false,
    "array_prioridade": [], "array_status_id": null,
    "limpar_data": false,
    "pesquisa_geral": "", "pesquisa_id_exame": null,
    "status_id": "(só se informado)",
    "...": "dezenas de flags booleanas (is_audio, is_comentario, is_duplicado, exibirExamesPendentes...)"
  },
  "paginacao": { "pagina": 1, "total_registros": 10 }
}
```

| Filtro | Efeito | Status |
| --- | --- | --- |
| `medicos: [0]` | "Sem médico" (o que a tela manda; medido pelo legado em 01/10) | CONHECIDO |
| `medicos: []` | Sem filtro de médico (o legado usa para reconferir um exame que alguém pode ter pego) | CONHECIDO |
| `medicos: [id]` | Exames de um médico | CONHECIDO |
| `pesquisa_id_exame: id` | Busca um exame pelo id | CONHECIDO |
| `nome_paciente` + `limpar_data: true` | Busca por paciente; `limpar_data` zera `tipo_tempo` (sem limite de data) | CONHECIDO |
| `tipo_tempo` | 1 = período personalizado (`periodo.data_inicial/final`); outros valores (padrão 2, presets até 9) | Significado de 2..9 DESCONHECIDO |
| `status_id` / `array_status_id` | Filtro de status | CONHECIDO que existe; formato aceito (número ou lista) PROVÁVEL pelo código (`mobile.js:68270`) |
| `modalidades`, `prioridades`, `empresas` | Omitidos quando "todas" estão marcadas na tela | CONHECIDO |

- Resposta: `data.lista` (exames crus) e `data.paginacao` com `total`, `current_page`, `last_page` (`mobile.js:31151-31170`); também `data.elasticAtivo`. CONHECIDO.
- Desempenho (legado): 2.850 exames numa página de 3.000 em 7,5 s (01/10). Um 500 nesta rota já deixou a MobileMed muda por 90 s (10/11).

**Campos do exame cru** (lidos pelo legado, pelo `modalMedicoCtrl` ou pelo `exameModel`):

| Campo | Significado | Status |
| --- | --- | --- |
| `id` | Id do exame | CONHECIDO |
| `nome_paciente`, `codigo_paciente`, `aniversario_paciente`, `sexo_paciente_id`, `identidade_paciente` | Paciente (LGPD). `codigo_paciente` aparece em filtros e relatórios; no item da lista é PROVÁVEL | CONHECIDO / PROVÁVEL |
| `estudo_descricao` | Nome do estudo | CONHECIDO |
| `modalidade_id`, `modalidade` | Modalidade (id e objeto/texto) | CONHECIDO que existem; formato de `modalidade` DESCONHECIDO |
| `subespecialidade_id` | Especialidade do exame na MobileMed (`GET /exame/subespecialidade/{id}` dá o valor) | CONHECIDO |
| `prioridade_id` | 1 Rotina, 2 Ambulatório, 3 Urgência, 4 Emergência, 5 Plantão, 6 Internado (`prioridadeEnum`, `mobile.js:64762-64790`) | CONHECIDO |
| `status_id` | 0 Novo, 1 Assinado, 2 Laudando, 3 Pendente, 4 Reavaliar, 5 Reassinado, 6 Digitado, 7 Reconvocar, 8 Digitado IA, 9 A preparar, 10 Pré-laudado, 11 Digitando (`mobile.js:64874-64910` e `68347-68420`) | CONHECIDO |
| `data_realizacao`, `data_transferencia_final` | Realização e entrada na fila (ISO UTC) | CONHECIDO |
| `sla_expiration_date`, `sla_empresa_id`, `sla_reference_date` | Prazo e de qual unidade ele vem | CONHECIDO |
| `usuario_id`, `usuario_nome` | Médico realizante (vazio = sem médico) | CONHECIDO |
| `empresa_id`, `nome_fantasia`, `empresa` | Unidade. O objeto `empresa` traz `exigir_motivo`, `permissao_sla_medico`, `permissao_devolver_fila` e permissões | CONHECIDO |
| `is_shared_exam` (calculado pelo front), `compartilhamentos[]` (`empresa_compartilhada_id`, `empresa_destino`, `permissao_sla_medico`), `permissao` | Exame compartilhado | CONHECIDO |
| `laudo[]` (com `residente_id`, `laudoUsuarios`) | Laudos do exame | CONHECIDO |
| `is_complementar`, `is_duplicado`, `is_original`, `is_anterior`, `pacs_accession_no`, `is_achado_critico` | Flags usadas na atribuição | CONHECIDO |
| Quantidade de laudos do registro (no relatório, `valor`) | | DESCONHECIDO no item da lista |

Regras de leitura (legado, CONHECIDO): só `status_id = 0` **e** `usuario_id` vazio é distribuível (o filtro "Sem médico" traz também exame aberto sem médico realizante; em 09/11 o robô deu a outra médica um RX pré-laudado). A leitura falha inteira se as páginas não fecharem com `paginacao.total` ou se aparecer prioridade desconhecida.

### 2.2 Um exame: `GET /exame/{id}`

- `exameHttpServices.getExame` (`mobile.js:3719-3728`). Resposta: `data.exame` (o portal lê `status_id`; o legado lê `usuario_id`). CONHECIDO.
- Campos completos de `data.exame`: DESCONHECIDOS (PROVÁVEL: os mesmos do item da lista).

### 2.3 Médicos da unidade: `POST /usuario/lista/empresa`

- `selectUnicoHttpServices.buscarUsuariosFiltro` (`mobile.js:74772-74782`), corpo de `usuarioModel.backUsuarioFiltro` (`mobile.js:72805-72823`):

```json
{ "filtro": { "textoPesquisa": "", "empresa_id": 123, "is_excluido": false,
              "perfis": [3], "is_ativo": true, "grupo_id": 0 } }
```

  Sem `paginacao` (a janela não pede; só vai se o chamador passar). `perfis: [3]` = MÉDICO (`permissaoSistemaEnum`, `mobile.js:65176-65188`: 1 Proprietário, 2 Gestor, 3 Médico, 4 Técnico, 5 Residente, 6 Somente leitura, 7 Digitador, 8 Solicitante, 9 Financeiro).
- Resposta: `data.lista` com `{ id, nome, ... }`. CONHECIDO.
- Por unidade e filtrada pela habilitação (o legado confirmou com a operação em 11/09). Exame compartilhado: a janela usa a unidade de destino (`compartilhamentos[0].empresa_compartilhada_id`) quando o usuário não tem permissão na origem (`mobile.js:43062-43065`).
- **CRM:** o objeto de usuário do portal tem `crm` e `crm_uf` (`usuarioModel.frontUsuario`, `mobile.js:72562-72604`; listas de usuários, `mobile.js:72834-72846`), e o laudo traz `usuario.crm`. Se **esta** lista traz `crm`: PROVÁVEL, a confirmar no HAR.

Rotas vizinhas usadas pela janela (CONHECIDO):

| Rota | Uso |
| --- | --- |
| `GET /usuario/{id}` (`mobile.js:7720-7729`) | Dados de um usuário (`data` → `frontUsuario`, com `crm`, `crm_uf`) |
| `GET /usuario/residentes/empresa/{empresa_id}` (`mobile.js:74825-74833`) | Residentes da unidade (`data` = lista) |
| `GET /usuario/digitadores/empresa/{empresa_id}` (`mobile.js:74834-74842`) | Digitadores da unidade |
| `GET /usuario/medicos/{empresa_id}?isVincularMascara=` (`mobile.js:74843+`) | Outra lista de médicos (não usada na janela) |

### 2.4 Laudos do exame: `GET /laudo/lista/{exame_id}`

- `laudoHttpService.buscarLaudos` (`mobile.js:5461-5470`). Resposta `data.lista`; o front (`laudoModel.frontLaudoLista`, `mobile.js:69442-69484`) usa `id`, `exame_id`, `usuario_id`, `status_id`, `html` (**texto do laudo**), `residente_id`, `digitador_id`, `laudoUsuarios` (`action: "ADDITIONAL_DOCTOR"` = Médico 02), `usuario.nome`, `usuario.crm`, `digitador.nome`, datas, OIT/mamografia/eco. CONHECIDO.

### 2.5 Atribuir, trocar e retirar médico

O portal tem **dois caminhos** para a mesma coisa:

**A) Janela "Dados da equipe Médica" (`modalMedicoCtrl`, `mobile.js:43044-43437`).** É o que o robô legado roda. Injeções: `o = exameHttpServices`, `r = laudoHttpService`, `i = laudoModel`, `m = selectUnicoHttpServices`, `p = motivoHttpServices`, `g = exameModel`.

Ao abrir, a janela carrega: médicos da unidade (2.3), residentes, digitadores, subespecialidades (`GET /exame/subespecialidade/{empresa_id}/{modalidade_id}`), laudos (2.4), motivos (`POST /motivo/busca`), e os usuários atuais (`GET /usuario/{id}` para Médico 01, Médico 02, residente, digitador, preparador).

Ao salvar, `atribuir(exame, motivo)` (`mobile.js:43299-43322`):

1. `exameModel.definirFlagsResetSla(exame, novoMedicoId)` (`mobile.js:68850-68864`) calcula `alterarSla` (exame na unidade de origem com `empresa.permissao_sla_medico`) e `alterarSlaEmpresaCompartilhada` (compartilhado, com a permissão no compartilhamento).
2. Se o médico muda (de alguém ou para alguém) **e** `empresa.exigir_motivo`: exige motivo (e comentário com 10+ caracteres se o motivo for "OUTROS") e grava o motivo antes (2.6). Senão segue direto.
3. `atribuirMedicos` (`mobile.js:43324-43359`):
   - `GET /exame/{id}`; se `status_id` é 1 ou 5 (assinado), para com "EXAME_JA_ASSINADO". **Não confere se o exame já tem médico**: essa guarda é nossa.
   - `PUT /exame` (`exameHttpServices.atualizarExame`, `mobile.js:3739-3749`) com corpo `{ exame: E }`, onde `E` é **a linha inteira da lista** (cópia, sem `pacs_studies_iuid` e `sla_expiration_date`) com `estudo_descricao`, `prioridade_id`, `is_anterior`, `usuario_id` (`""` vira `null`), `pacs_accession_no`, `subespecialidade_id`, `alterarSla`, `alterarSlaEmpresaCompartilhada` sobrescritos.
4. `alterarLaudo` (`mobile.js:43361-43420`), com `manterStatus: true`:
   - `GET /laudo/lista/{exame_id}`.
   - Se há laudo: `PUT /laudo/` (`laudoHttpService.atualizarLaudo`, `mobile.js:5358-5372`) com `{ exameLaudo: <laudo do frontLaudoLista, inteiro, com html>, permissao: false, is_revisor: false, is_achado_critico: exame.is_achado_critico }`, depois de pôr no laudo `residente_id` e `digitador_id` **da janela** (os carregados por `GET /usuario/{id}`; `null` se ainda não carregaram) e `usuario_id` do novo médico. É por isso que salvar antes de a janela carregar apagava residente e digitador.
   - Se não há laudo: `POST /laudo/` (`mobile.js:5490-5503`) com `{ exameLaudo: { html: "", exame_id, status_id: 0, birads: null, residente_id: null, is_OIT: false, ... , manterStatus: true }, permissao: false }` (`laudoModel.criarLaudo`, `mobile.js:69485-69520`), depois o mesmo `PUT /laudo/` com o laudo criado (`data.exameLaudo`) e a equipe.

**B) "Atribuir exames ao médico" na lista (vários exames de uma vez; `examesCtrl.atribuirExamesAoMedico`, `mobile.js:31776-31940`, e `exameAtribuirAoMedicoCtrl`, `mobile.js:39278-39345`).**

1. A janela pede o médico e, se algum exame tem médico ou a unidade exige motivo, o motivo; grava `POST /motivo/` por exame quando a unidade exige.
2. `GET /exame/{id}` de cada exame; Laudando (2) pede confirmação; assinado (1, 5) pede confirmação e reabre o laudo (reassinatura).
3. Para cada exame, `PUT /exame` com corpo **mínimo** (`exameModel.backExamAtribuirMedico`, `mobile.js:68704-68714`):

```json
{ "exame": { "id": 123, "usuario_id": 456, "is_complementar": false, "is_duplicado": false,
             "is_original": false, "alterarSla": false, "alterarSlaEmpresaCompartilhada": false } }
```

4. **Não mexe no laudo.**

**Retirar médico** (devolver à fila): no caminho A, "Sem médico" na lista (`id: null`) → `usuario_id: null`; no caminho B, médico `0` → `usuario_id: 0` (`mobile.js:31850-31853`). **Trocar médico** (recolhimento) é a mesma chamada com outro `usuario_id`; nas unidades que exigem motivo, qualquer mudança exige motivo.

Outras rotas de equipe que existem e **não** são usadas na atribuição: `PUT /laudo/atualizarUsuario/` (`{ laudoId, exameId, usuarioId }`, `mobile.js:5404-5416`), `PUT /exame/simples` (`mobile.js:4139-4149`), `PUT /exame/status/alterar`, `PUT /laudo/revogarResidente`.

### 2.6 Motivo (unidades com `empresa.exigir_motivo`)

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `POST /motivo/busca` (`mobile.js:6341-6353`) | `{ "tipo_acao": "ATRIBUIR" }` | `data.data` = lista de motivos `{ id, descricao, ... }` |
| `POST /motivo/` (`mobile.js:6309-6323`) | `{ motivo: { id, descricao, tipo_acao: "ATRIBUIR", comentario }, exameMotivo: { exame_id, usuario_id: <quem atribui>, usuario_atribuido: <novo médico> }, comentario: { exame_id }, motivoComentario: <texto> }` | DESCONHECIDA |

`descricao` e `motivoComentario` vão traduzidos (`$filter("translate")`; o texto de `COMENTARIO_MOTIVO_ATRIBUIR` está nos arquivos de tradução, fora do bundle: DESCONHECIDO). Quais unidades exigem motivo e quais motivos existem: só lendo `empresa.exigir_motivo` na lista e `POST /motivo/busca` (leitura).

### 2.7 Comentários: `GET /exame/comentario/{id}`

- `comentarioHttpServices.buscarComentarios` (`mobile.js:76844-76853`). Resposta `data.lista` com `nome_usuario`/`nome`, `data_criacao`, `descricao` (pelo legado). CONHECIDO.

### 2.8 Relatório de laudos (`reports-api`): a importação automática da `ingestao`

Capturado no navegador em 19/11/2026 (telas de `laudos.mobilemed.com.br/relatorio/exames`). A planilha XLSX que a tela exporta é montada **no navegador** a partir desta mesma resposta (exportar não faz requisição). Base `https://gateway-sa.mobilemed.com.br/reports-api` (`MOBILEMED_REPORTS_API_URL`).

- Cabeçalhos: `Authorization: Bearer <access token>` (o mesmo login da seção 1.4), `Content-Type: application/json`, `Accept: application/json`.
- Corpo: `{ filtro, paginacao: { pagina: 1, total_registros: 50 } }`. A `paginacao` é ignorada.
- Resposta: `{ status_code, lista: [...] }`, com 39 campos por item e **sem paginação**: vem tudo até o teto de **50.000 itens por chamada** ("Máx. 50.000 reg." na tela); acima disso a lista é **cortada em silêncio**. (Em 19/11, um XLSX de 01/10 a 19/11 veio com exatamente 50.000 linhas: cortado.)
- `data_laudo`: o dia de Brasília das 00:00 às 23:59:59.xxx, em UTC (`"2026-10-01T03:00:00.000Z"` a `"2026-11-20T02:59:59.142Z"`).

**Rotas**

| # | Relatório | Rota | Filtro |
| --- | --- | --- | --- |
| 1 | Laudos "no padrão" (Descritivo Especialidades) | `POST /exame/relatorio/descritivoEspecialidade` | O de baixo |
| 2 | Laudos "fora do padrão" (estudo renomeado depois; só aparecem aqui). 01/10–19/11: 159 itens | A mesma | O mesmo, com `"exibirNaoTratados": "1"` (string) |
| 3 | Compartilhamento de exames (apoio, hoje CRD_APOIO). 01/10–19/11: 113 itens | `POST /exame/relatorio/examesCompartilhados` | O de baixo com `"tipoAssinatura": 1`, `"isEspecialidades": false`, `"tipoAcao": {"id": null, "descricao": "TODOS"}`, `"compartilhamento": "todos"`, `"isRelatorioExamesCompartilhados": true` |

```json
{"data_realizacao":{"data_inicial":"","data_final":""},
 "data_laudo":{"data_inicial":"2026-10-01T03:00:00.000Z","data_final":"2026-11-20T02:59:59.142Z"},
 "data_criacao":{"data_inicial":"","data_final":""},
 "tipoAssinatura":null,"residente_id":0,"empresa_id":[],"gruposEmpresas_id":0,"is_concluido":null,
 "prioridade_id":[],"modalidades":[],"isEspecialidades":true,"isDescritivo":false,
 "exibirNaoTratados":false,"isResidentes":false,"isDigitadores":false,"isJustificado":false,
 "tipoAcao":false,"status_empresa":null,"is_complementar":null,"usuario_id":0,"perfis":[1,2,9]}
```

**Campos do item** (os dois relatórios): `id`, `nome_fantasia`, `codigo_paciente`, `identidade_paciente`, `usuario_id`, `cpf_paciente`, `nome_paciente`, `estudo_descricao`, `descricao_subespecialidade`, `pacs_accession_no`, `valores`, `modalidade_id`, `prioridade_id`, `status_id`, `empresa_id`, `is_complementar`, `is_anterior`, `medico`, `cod_interno`, `segunda_assinatura_laudo`, `segunda_assinatura_laudo_id`, `digitador`, (`residente`, `residente_id` no compartilhamento), `digitador_id`, `is_duplicado`, `is_excluido`, `is_compartilhamento_enviado_para`, `data_realizacao`, `data_laudo`, `primeira_data_laudo`, `count_key_image`, `count_captured_imgs`, `valor`, `especialidade`, `data_criacao`, `sla_expiration_date`, `convenio`, `identidade_convenio`, `medico_primeiro_laudo`, `medico_primeiro_laudo_id`.

**Item → coluna da planilha** (`apps/api/src/ingestao/infrastructure/mobilemed/esquemas-relatorio.ts`). A planilha é montada no navegador pelo `app.js` do portal (`frontRelatorioDescritivoEspecialidade` e `frontRelatorioDescritivoListagem` pré-processam cada item; `exportar` monta a linha). O adaptador reproduz essa transformação para a identidade e o hash do laudo saírem iguais aos do upload da mesma planilha (CONHECIDO pelo bundle de 19/11; formatos conferidos, mascarados, no XLSX de 19/11).

| Coluna | Especialidades (laudos) | Compartilhamento |
| --- | --- | --- |
| EMPRESA | `nome_fantasia` | `is_compartilhamento_enviado_para` (texto: a unidade de destino); `nome_fantasia` vai em UNIDADE_ORIGEM |
| ESTUDO_DESCRICAO | `estudo_descricao` | `descricao_subespecialidade` ou `estudo_descricao` |
| ACCESSION_NUMBER, CODIGO_PACIENTE, NOME_PACIENTE | `pacs_accession_no`, `codigo_paciente`, `nome_paciente` | iguais (accession vazio vira "") |
| MODALIDADE | `modalidade_id` pelo `modalidadeEnum` do portal: 1 MR, 2 CT, 3 CR, 4 DX, 5 US, 6 MG, 7 OT, 8 XA, 9 CP, 10 NM, 11 ES, 12 EEG, 13 ECG, 14 BMD (fora disso, a linha é recusada) | igual |
| PRIORIDADE | `prioridade_id` (seção 2.1) | igual |
| VALORES | `valor` (texto; vazio vira 0). `valores` vem nulo | `valores` (vazio vira 0) com duas casas |
| ESPECIALIDADE | `especialidade` | não existe |
| STATUS | `status_id` 1 Assinado, 5 Reassinado, o resto Não Assinado | igual |
| DATA/HORA_LAUDO, MEDICO | Assinado: `data_laudo` e `medico`; senão `primeira_data_laudo` e `medico_primeiro_laudo` | igual |
| DATA/HORA_REASSINATURA, MEDICO_REASSINATURA | Reassinado: `data_laudo` e `medico` | igual |
| DATA/HORA_REALIZACAO, _TRANSFERENCIA, _PRAZO | `data_realizacao`, `data_criacao`, `sla_expiration_date` | igual |
| DUPLICADO | `is_duplicado` (0/1) como Sim/Não | igual |
| COMPLEMENTAR | **`is_anterior`** = 1 como Sim/Não (a linha do portal põe o `is_anterior` nessa coluna) | COMPLEMENTO = `is_complementar` |
| POSSUI_IMAGENS_CHAVE, IMAGENS_CHAVES, IMAGENS_CAPTURADAS | SIM/NAO se há `count_key_image` ou `count_captured_imgs`; os dois contadores | igual |
| SEGUNDA_ASSINATURA, CODIGO_INTERNO, DIGITADOR | `segunda_assinatura_laudo`, `cod_interno`, `digitador` | igual, mais RESIDENTE e ANTERIOR; IDENTIDADE e CONVENIO ficam de fora (LGPD) |

As datas vêm em ISO UTC com milissegundos e `Z`; o portal formata com `moment` no fuso do navegador (Brasília). O adaptador converte para Brasília e trunca no segundo (`DD/MM/YYYY` e `HH:mm:ss`).

Datas sem fuso explícito são recusadas (seriam lidas no fuso do servidor).

**Como a ingestão usa** (`INGESTAO_MOBILEMED=real`):

- Período: do dia 1º de N meses atrás até hoje, em Brasília (N = 1 por padrão: em 19/11, de 01/10 a 19/11). O intervalo (30 min; vazio = desligada), N, o tamanho de cada consulta (7 dias) e o teto (50.000) ficam em Configurações › Importação de laudos (`parametros_ingestao`, com auditoria).
- Fatiamento: o período vai em consultas do tamanho configurado, uma por vez; a que volta com teto ou mais itens é refeita em duas metades, até ficar abaixo (abaixo de 1 minuto ainda no teto, a importação para). Resposta no teto nunca é aceita como completa.
- Cada ciclo cria **duas importações** (Operação › Importação, origem MobileMed): a dos laudos junta as rotas 1 e 2 (a remoção da janela compara com tudo o que veio; separadas, o "fora do padrão" sozinho removeria os "no padrão", ou a trava recusaria), e a do compartilhamento (rota 3), que só reconcilia as empresas que vieram nela, como o upload. A janela é o período pedido, não os dias que vieram.
- Nunca duas da MobileMed ao mesmo tempo (lock no banco ao criar; o "Importar agora" com uma em curso dá 409) e a mesma fila das planilhas (`ingestao`, uma importação por vez). O agendador (`ingestao:agendar-mobilemed`) roda a cada minuto e cria o ciclo quando o intervalo desde a última passou.
- Falha da MobileMed (fora do ar, sessão, resposta fora do formato) = importação com erro e mensagem curta, nada alterado. Relatório vazio no período também é erro, sem remover nada.
- Respeita as competências fechadas, como o upload.
- Compartilhamento: só as unidades de destino de Configurações › Importação de laudos (padrão CRD_APOIO, com auditoria; decidido em 19/11, o mesmo comportamento do `RPA_COMPARTILHAMENTO_UNIDADES` do RPA antigo, agora editável). Sem nenhuma unidade, o ciclo cria só a importação dos laudos.
- `INGESTAO_MOBILEMED=fake` (dev): agenda e botão funcionam, o relatório volta vazio (a importação termina com erro). Vazio: desligada.

---

## 3. Atribuição

### 3.1 Casos de borda que o robô legado trata (`atribuir_api.py`)

Antes de cada exame, relê pelo id (`pesquisa_id_exame`, `medicos: []`):

| Situação | Legado | Motivo |
| --- | --- | --- |
| Id não volta | Não atribui | `linha_nao_encontrada` |
| Id volta com outro paciente/estudo/data | Anomalia; manda para a tela | |
| Já tem médico | Não sobrescreve (ou `executada` se é o médico que ele mesmo tentou antes e só a confirmação falhou) | `ja_atribuido` |
| Assinado (1, 5) | Não atribui | `assinado` |
| Sem médico mas aberto (`status_id` ≠ 0) | Não atribui | `exame_ja_aberto` |
| Unidade exige motivo | Manda para a tela | |
| Janela não carregou em 15 s (médicos, laudo, residente, digitador) | Anomalia; nova tentativa no fim | `janela_nao_carregou` |
| Médico fora da lista da unidade ou ambíguo | Não atribui | `medico_nao_encontrado` / `medico_ambiguo` |
| Salvar sem fim em 30 s, `Notification.error`, ou `usuario_id` relido ≠ pedido | Anomalia; nova tentativa no fim; depois tela | |
| Recolhimento (troca A→B) | Só se o exame segue com A (por id da conta) e `status_id = 0` | `ja_atribuido` / `medico_ja_abriu` |

Freio e tempos: dois lotes seguidos com anomalia param a API; com religação (espera 30 s, recarrega, relogando se preciso) testa de novo com 1 exame, até 2 vezes. 429 e 5xx (exceto `/oauth/`) encolhem o lote pela metade; lote começa em 4, cresce de 1 em 1, nunca com o mesmo paciente duas vezes; desligado por padrão (1 por vez). Prazos: fila 90 s, médicos 15 s, janela 15 s, salvar 30 s (o `$http` do portal não tem timeout). ~5,4 s por exame pela API (~6 requisições em sequência), ~20–40 s pela tela.

### 3.2 Proposta para o nosso adaptador

**Usar o caminho B (`PUT /exame` com corpo mínimo)** para atribuir exame Novo sem médico:

- É uma rota que o próprio portal usa para atribuir (inclusive vários exames), com corpo pequeno e conhecido.
- Não reenvia a linha inteira do exame nem o laudo inteiro (com o texto do laudo): menos chance de sobrescrever algo, nada de dado de paciente no corpo.
- Não depende de carregar residente e digitador: não toca no laudo, então não os apaga.

O que o caminho B deixa em aberto (HAR): se, num exame Novo com laudo já criado (`status_id 0`), o `usuario_id` do laudo precisa acompanhar (o caminho A o atualiza; o B não). Se precisar, a alternativa é o caminho A sem a janela: `GET /laudo/lista/{id}` e `PUT /laudo/` com o laudo devolvido e `residente_id`/`digitador_id` **do próprio laudo** (não de uma janela).

Sequência por exame:

1. `POST /exame/lista` com `pesquisa_id_exame`, `medicos: []`: o exame existe, `usuario_id` vazio, `status_id = 0`. Senão `pulada` com o motivo (não retentável).
2. `empresa.exigir_motivo` → `pulada`, `unidade_exige_motivo` (até a operação decidir que motivo o One manda; não inventar).
3. `POST /usuario/lista/empresa` da unidade (a de destino, se compartilhado) com cache curto por rodada: `medicoIdMobilemed` na lista; senão `pulada`, `medico_fora_da_unidade`.
4. `definirFlagsResetSla` portado (regra do portal, não nossa): `alterarSla` e `alterarSlaEmpresaCompartilhada`.
5. `PUT /exame` com o corpo mínimo.
6. `GET /exame/{id}` (ou a lista por id): `usuario_id` = pedido → `executada`; senão `falhou`, `nao_confirmado`, retentável.
7. Erros: 401 / `invalid_token` → `falhou`, `sessao_caiu`, retentável depois de renovar; 429, 5xx, tempo esgotado → `falhou`, `mobilemed_indisponivel`, retentável; corpo fora do esperado → `falhou`, `resposta_inesperada`, e o freio para a rodada.

Regras que vêm do legado: nunca sobrescrever médico; confirmar relendo; idempotência na nova tentativa (o exame já com o médico pedido é `executada`); prazo em toda chamada; mensagem dizendo que a falha veio da MobileMed; leitura completa ou nada.

---

## 4. Médicos e ids da MobileMed

### 4.1 De onde vêm

- A conta do médico é o `usuario.id` (inteiro): `usuario_id` no exame e `id` em `/usuario/lista/empresa`. CONHECIDO.
- Lista por unidade, filtrada pela habilitação. No legado (`fila_api.py::medicos_do_modal`), uma consulta por exame, sem cache.
- No dashboards-one, `Medico.idMobilemed` (`Int? @unique`) era **digitado à mão** ("ID na MobileMed"); nada o preenchia sozinho. O redo-one migrou para `medicos.id_mobilemed` (`integer unique`) e **já exige o id para atribuir** (`executar.ts`: sem id = `sem_conta_mobilemed`, sem cair para o nome).
- CRM: existe no usuário do portal (`crm`, `crm_uf`); se vem na lista da unidade, a confirmar (2.3). Se vier, é a melhor chave de casamento com `medicos.crm`.

### 4.2 Como o legado escolhe a conta (`fila_api.py::escolher_conta`)

1. Com id no cadastro: vale só o id; fora da lista = `medico_nao_encontrado` com a pista "pelo nome, casaria: ...".
2. Sem id: casa pelo nome (`casa_nome`), deduplica por id, descarta contas com sufixo `(E2)`, `(F)` (secundárias, decisão de 01/10; exceção fixa no código para uma médica). Uma principal = atribui; mais de uma = `medico_ambiguo`; só secundária, nome parecido ou nada = `medico_nao_encontrado` com o detalhe da situação.

Casamento de nomes (`nomes.py`, espelho do `normalizeNomeMedico`): minúsculo, sem acento, sem `(…)`, sem `Dr.`/`Dra.` inicial, sem apóstrofo e ponto. `casa_nome` aceita o mesmo primeiro nome, o mesmo último sobrenome (inicial vale) e os do meio em ordem, com abreviação nos dois sentidos; partículas não contam. `nome_parecido` (2 núcleos em comum) só para diagnóstico.

### 4.3 Proposta de de-para

1. **O id no cadastro é a fonte de verdade**, editado na tela do médico com auditoria. Nada de escolher conta por nome na hora de atribuir.
2. **Conferência assistida, só leitura:** ler `/usuario/lista/empresa` das unidades, casar com o cadastro (por CRM se a lista trouxer; senão pelas regras do 4.2, portadas para TS) e mostrar por médico: confere, sem id, id fora das unidades, ambíguo, só secundária, nome parecido. Quem grava o id é a pessoa. É tela nova: precisa de análise e aprovação antes.
3. **Antes de cada atribuição**, conferir o id na lista da unidade do exame (3.2, passo 3).
4. Contas secundárias deixam de precisar de regra no código: o id escolhido no cadastro resolve (inclusive a exceção de hoje).

---

## 5. Mapeamento para as portas do redo-one

### 5.1 `FilaExames.ler()`

`semMedico`: `POST /exame/lista` com `medicos: [0]`, `limpar_data: true` (sem limite de data; a confirmar que traz a fila inteira), paginado até `last_page`, mantendo só `status_id = 0` e `usuario_id` vazio.

| `ExameDaFila` | Origem | Status |
| --- | --- | --- |
| `idExame` | `id` (número → texto) | CONHECIDO |
| `prioridade` | `prioridade_id` → grafia (`ROTINA`, `AMBULATORIO`, `URGENCIA`, `EMERGENCIA`, `PLANTAO`, `INTERNADO`); o de-para das prioridades da operação decide | CONHECIDO |
| `estudo` | `estudo_descricao` | CONHECIDO |
| `unidade` | `nome_fantasia` | CONHECIDO |
| `modalidade` | `modalidade` / `modalidade_id` | Formato DESCONHECIDO |
| `especialidade` | `subespecialidade_id` (+ descrição por `GET /exame/subespecialidade/{id}`, ou o catálogo pelo estudo) | Formato DESCONHECIDO |
| `laudos` | não achado no item da lista | DESCONHECIDO (null = 1) |
| `realizadoEm` | `data_realizacao` | CONHECIDO |
| `entradaEm` | `data_transferencia_final` | CONHECIDO |
| `prazo` | `sla_expiration_date` | CONHECIDO |
| `status` | `status_id` → texto | CONHECIDO |
| `paciente.nome` | `nome_paciente` (só memória; vira HMAC) | CONHECIDO |
| `paciente.codigo` | `codigo_paciente` | PROVÁVEL |

`emMaos`: `medicos: []` (todos) com status não assinado, ou `array_status_id`/`status_id` com os abertos; mantendo `usuario_id` preenchido. O volume e o melhor filtro: a confirmar no HAR. `medicoIdMobilemed` = `usuario_id`.

### 5.2 `nomesPacientes(ids)` e `semMedico(ids)`

Uma consulta por id (`pesquisa_id_exame`, `medicos: []`, `total_registros: 5`), como o legado. Se o filtro aceita vários ids: DESCONHECIDO (o campo é um valor só). `semMedico` = `usuario_id` vazio e `status_id = 0`.

### 5.3 `AtribuidorExames.atribuir`

Sequência do 3.2. Resultados: `executada`; `pulada` (`saiu_da_fila`, `ja_tem_medico`, `assinado`, `exame_ja_aberto`, `unidade_exige_motivo`, `medico_fora_da_unidade`); `falhou` (`sessao_caiu`, `mobilemed_indisponivel`, `nao_confirmado` retentáveis; `resposta_inesperada` não).

### 5.4 O que falta

| Falta | Como resolver |
| --- | --- |
| Valores reais e formato de `modalidade`, especialidade, quantidade de laudos, `codigo_paciente` no item da lista | HAR (estrutura, valores trocados) |
| Se `limpar_data: true` + `medicos: [0]` traz a fila inteira; o maior `total_registros` aceito | HAR de uma busca + teste de leitura com a flag |
| Corpo de resposta do `PUT /exame` e do `POST /motivo/` | HAR |
| Se o caminho B basta num exame Novo com laudo criado (ou se o laudo precisa do `usuario_id`) | HAR das duas atribuições (janela e lista) |
| Se `/usuario/lista/empresa` traz `crm` | HAR |
| Que motivo o One manda nas unidades que exigem | Decisão da operação |
| Token | Login (seção 1.4) |

---

## 6. O mobile.js tem tudo?

| Item | Tem? | O que o bundle resolve | O que ainda pede o HAR |
| --- | --- | --- | --- |
| (a) `atribuir` do `modalMedicoCtrl`: sequência, método, URL, corpo do `PUT /exame` e do laudo | **Sim** | Sequência completa (`mobile.js:43299-43420`): motivo → `GET /exame/{id}` → `PUT /exame {exame: linha}` → `GET /laudo/lista/{id}` → `PUT /laudo/` (ou `POST /laudo/` + `PUT /laudo/`), com residente, digitador e `manterStatus` | Ver o corpo real no fio (confirma que nada é acrescentado por outro interceptor) e a resposta |
| (a') Caminho mínimo de atribuição | **Sim** | `PUT /exame` com `backExamAtribuirMedico` (`mobile.js:68704`, `31850`) | Confirmar o efeito no laudo de um exame Novo |
| (b) Lista de exames: filtros e paginação | **Sim** | Corpo inteiro (`mobile.js:68191-68270`), resposta `lista` + `paginacao {total, current_page, last_page}` | Valores reais de `modalidade` e afins; maior página aceita |
| (b) Detalhe do exame | **Sim** (rota) / **Não** (campos) | `GET /exame/{id}` → `data.exame` | Campos completos |
| (b) Médicos da unidade, com id | **Sim** | `POST /usuario/lista/empresa`, corpo e `data.lista {id, nome}` | Se traz `crm` |
| (b) Trocar e retirar médico (recolhimento) | **Sim** | Mesmo `PUT /exame` com outro `usuario_id`, `null` (janela) ou `0` (lista); motivo quando a unidade exige | Qual dos dois "sem médico" o servidor prefere (`null` × `0`) |
| (c) Autenticação: cabeçalhos | **Sim** | `Authorization: Bearer <access token>` + `Content-Type: application/json`; `traceparent` opcional; erros `invalid_token`, `410 x-force-logout` | Nada para as rotas (login na seção 1.4) |
| (d) Unidade que exige motivo | **Sim** | `empresa.exigir_motivo` vem na linha; `POST /motivo/busca` e `POST /motivo/` com corpos | Textos traduzidos (`motivoComentario`) e a resposta; decisão da operação |
| Comentários `GET /exame/comentario/{id}` | **Sim** | Rota e resposta | — |
| Relatório `descritivoEspecialidade` | **Sim** | Corpo, filtros, campos da resposta (com `id` do exame) | Se a paginação é respeitada; amostra real para casar com o XLSX |

Resumo: **para as rotas, o bundle resolve tudo o que o legado deixava como desconhecido** (corpo do `PUT /exame`, laudo, residente e digitador, motivo, lista de médicos, cabeçalhos). O HAR passa a servir para **conferir valores reais e formatos** antes da primeira gravação, não para descobrir rotas.

---

## 7. Fase 2: HAR de atribuições reais feitas pela operação

Agora o objetivo é **confirmar** o que o bundle diz, com atribuições que a operação faria de qualquer jeito, no navegador dela. Nenhum robô, nenhuma gravação nossa.

### 7.1 Passo a passo (Chrome ou Edge)

1. Entrar no portal normalmente e ir para `/exames`.
2. F12 → **Network**. Marcar **Preserve log** e **Disable cache**; filtro **Fetch/XHR**; limpar.
3. Fazer, cada uma num HAR separado:
   - uma atribuição pela janela "Dados da equipe" de um exame Novo sem médico, numa unidade **sem** motivo;
   - uma atribuição pela lista (marcar o exame → "Atribuir exames ao médico"), outro exame Novo;
   - se houver, uma atribuição numa unidade **com** motivo.
4. Anotar horário e id de cada exame.
5. Exportar com **Export HAR (sanitized)** (tira `Authorization`, cookies e `Set-Cookie`); sem essa opção, "Export HAR" e limpar no 7.3.

### 7.2 O que conferir

- `PUT /exame`: o corpo é o do 2.5 (janela: a linha inteira; lista: o mínimo)? Resposta?
- `PUT /laudo/` / `POST /laudo/`: aparecem na janela; **não** aparecem na lista? O `usuario_id` do laudo muda nos dois casos (comparar `GET /laudo/lista/{id}` antes e depois, se a tela o chamar)?
- `POST /exame/lista`: o filtro que a tela manda de verdade; estrutura de um item (nomes e tipos de `modalidade`, especialidade, `codigo_paciente`, laudos).
- `POST /usuario/lista/empresa`: vem `crm`?
- `POST /motivo/` (unidade com motivo): corpo e resposta.
- Cabeçalhos por **nome** (não valor): só `Authorization`, `Content-Type` e `traceparent`?

### 7.3 Limpar antes de mandar

- **Sessão:** apagar valores de `Authorization`, `Cookie`, `Set-Cookie` e qualquer token (`access_token`, `id_token`, `refresh_token`, `code`, `token`) em cabeçalho ou corpo.
- **Paciente:** trocar por `"X"` os valores de `nome_paciente`, `codigo_paciente`, `aniversario_paciente`, `sexo_paciente_id`, `identidade_paciente`, `convenio`, `medico_solicitante`, `email_solicitante`, `pacs_accession_no`, `pacs_studies_iuid`, e **todo `html` de laudo**. Na dúvida, trocar.
- **Remover** as respostas de chamadas que não são de exame, laudo, usuário ou motivo.
- Manter nomes de campo, tipos, ids numéricos (exame, usuário, empresa), status e datas.
- Procurar no arquivo pelo nome do paciente e pelo começo do token antes de mandar.
- O HAR **não entra no repositório**; no redo-one entram só amostras pequenas montadas à mão, com "X".

---

## 8. Riscos e salvaguardas

| Risco | Salvaguarda |
| --- | --- |
| Gravar errado num sistema de terceiros (médico errado, laudo ou equipe sobrescritos) | Adaptador real atrás de **flag desligada por padrão** (o fake segue o padrão no dev); caminho de corpo mínimo; primeira gravação real só com aval da operação, num exame escolhido e conferido na tela da MobileMed depois |
| Derrubar a sessão da operação ou dos robôs legados | **Conta própria do redo-one**, permissões mínimas, credenciais só no `.env` (nunca em arquivo do repo), uma sessão só |
| Atribuir sem humano | **Só rodada manual** (já decidido) |
| Rajada de gravações / 429 | **1 exame por vez** no começo; lotes só depois de medir, nunca o mesmo paciente no mesmo lote |
| Erro em cascata | **Parar na primeira anomalia** (status ou corpo inesperado, confirmação divergente, 401/403/429/5xx); o resto fica retentável. O legado parava na segunda porque tinha a tela como reserva |
| Sobrescrever trabalho humano | Reconferir pelo id antes (sem médico e Novo; o portal não faz essa guarda) e confirmar depois |
| A MobileMed muda o bundle | Validação estrita das respostas; falha alta com "veio da MobileMed"; o `mobile.js` é foto datada, rever quando algo quebrar |
| LGPD | Paciente só por id do exame e HMAC; nome só na memória da leitura e na conferência com permissão e auditoria; nunca nome, código ou laudo em log, evento, detalhe ou amostra de teste; o caminho de corpo mínimo não leva dado de paciente |
| Autorização | Uso autorizado; perguntar à MobileMed pela `integracao.mobilemed.com.br/v1` e por credencial de integração |

---

## 9. Adaptador real (`apps/api/src/distribuicao/infrastructure/mobilemed` e `apps/api/src/comum/mobilemed`)

Implementa `FilaExames` e `AtribuidorExames` pelas rotas acima, com o mesmo contrato do fake (`mobilemed-fake.ts`). Testado só com HTTP simulado (fetch injetado); **nenhuma requisição foi feita à MobileMed** para construí-lo.

| Arquivo | O que faz |
| --- | --- |
| `comum/mobilemed/cliente-mobilemed.ts` | HTTP do `portal-api` (e do `reports-api`, na ingestão): `Content-Type` e `Accept: application/json` + `Authorization: Bearer`, prazo por chamada, chamadas simultâneas limitadas, validação da resposta (Zod), classificação dos erros (`sessao`, `indisponivel`, `resposta_inesperada`, `recusada`) e o freio. Logs JSON só com rota genérica (`GET /exame/{id}`), tipo e status HTTP; mensagens nunca copiam o texto do erro nem valores da resposta (só o `error_code` e os caminhos dos campos) |
| `comum/mobilemed/token-mobilemed.ts` | Porta `TokenMobileMed` e o adaptador `TokenMobileMedLogin`: login da conta de serviço (seção 1.4) com o código de `totp.ts` (RFC 6238 com `node:crypto`, sem dependência). **Uma instância só no processo** (`TOKEN_MOBILEMED`, provida pelo `ComumModule`), dividida pela distribuição e pela ingestão: dois logins da mesma conta derrubam um ao outro |
| `esquemas-mobilemed.ts` | Esquemas Zod das respostas e os enums de `prioridade_id` e `status_id` (seção 2.1). Só os campos usados sobrevivem à validação |
| `mobilemed-real.ts` | `MobileMedReal`: leitura, conferência, atribuição, troca, retirada, `medicosDaUnidade` e o porte de `definirFlagsResetSla` |

### 9.1 Como ligar

1. No `apps/api/.env`: `DISTRIBUICAO_MOBILEMED=real`, `MOBILEMED_USUARIO`, `MOBILEMED_SENHA` e `MOBILEMED_TOTP_SEGREDO` (chave base32 do autenticador da conta de serviço). Sem `real`, vale o fake (padrão); com `real` e sem uma delas, a API não sobe.
2. Reiniciar a API. **A partir daí, a rodada aprovada atribui exames de verdade.** Primeira vez só com aval da operação (seção 8).

| Variável | Padrão | Uso |
| --- | --- | --- |
| `DISTRIBUICAO_MOBILEMED` | `fake` | `fake` ou `real` |
| `MOBILEMED_PORTAL_API_URL` | `https://gateway-sa.mobilemed.com.br/portal-api` | Base das rotas (só `https://`) |
| `MOBILEMED_USUARIO`, `MOBILEMED_SENHA` | — | E-mail e senha da conta de serviço (obrigatórios com `real`) |
| `MOBILEMED_TOTP_SEGREDO` | — | Chave base32 do TOTP da conta (obrigatória com `real`) |
| `MOBILEMED_PAGINA` | 1000 | `total_registros` por página da lista |
| `MOBILEMED_MAXIMO_EXAMES` | 20000 | Lista com `paginacao.total` acima disso é recusada (filtro ignorado traria o histórico) |
| `MOBILEMED_TIMEOUT_MS` | 90000 | Prazo de cada chamada |
| `MOBILEMED_CONCORRENCIA` | 1 | Chamadas ao mesmo tempo |
| `MOBILEMED_LIMITE_ANOMALIAS` | 2 | Anomalias seguidas que param a atribuição |

### 9.2 Comportamento

- **`ler()`**: `POST /exame/lista` com `medicos: [0]` e `limpar_data: true` (sem médico) e de novo com `medicos: []` e `array_status_id` = todos os status menos assinados (em mãos), cada uma paginada até `last_page`. A soma das páginas tem que bater com `paginacao.total` (e o total não pode mudar entre páginas); prioridade ou status desconhecidos, ou item fora do formato, derrubam a leitura inteira. `semMedico` traz também o aberto sem médico (status ≠ NOVO), como o fake: o domínio só distribui o NOVO. Leituras simultâneas (tela e job) dividem a mesma ida.
- Corpo da resposta: o que o portal lê como `response.data` (`{ lista, paginacao }`, `{ exame }`); a confirmar no HAR.
- **`nomesPacientes(ids)`** e **`intocados(exames)`**: um pedido por exame (`pesquisa_id_exame` e `GET /exame/{id}`). Se a conferência falha por erro da MobileMed, o exame segue para a atribuição, que reconfere e devolve a falha como retentável.
- **`atribuir` (inclui a troca do recolhimento) e `tirar`**: `GET /exame/{id}` → já com o médico pedido = `executada`; assinado = `pulada/assinado`; já com médico (sem ser troca) = `ja_tem_medico`; troca com outro dono = `mudou_de_dono`; status ≠ NOVO = `exame_ja_aberto`; sumiu = `saiu_da_fila`; `empresa.exigir_motivo` = `unidade_exige_motivo` (decisão: a operação atribui à mão). Depois `PUT /exame` com o corpo mínimo (`usuario_id: 0` para tirar) e as flags de SLA do portal, e nova leitura: `usuario_id` gravado ≠ pedido = `falhou/nao_confirmado` (retentável).
- **Erros**: sessão (401, 403, 410, `invalid_token`) = `sessao_caiu`, retentável; 429, 5xx, sem resposta ou tempo esgotado = `mobilemed_indisponivel`, retentável; corpo fora do formato = `resposta_inesperada`; outro 4xx = `recusada_mobilemed`.
- **Login**: na primeira chamada, o fluxo da seção 1.4 (authorize com PKCE, e-mail e senha, o código TOTP do instante, com menos de 5 s de vida espera a próxima janela, storage e a troca do código no `/token`). O access token fica na memória até faltar 1 min para o `exp`; aí renova pelo refresh token (guardando o refresh novo, que gira a cada uso). Refresh recusado → novo login. Uma renovação por vez: pedidos simultâneos esperam a mesma. Depois de 3 falhas seguidas de renovação, para de tentar (log `mobilemed_login_parado`) até a API reiniciar, para não bloquear a conta. Logs só com rota, tipo e status; nunca usuário, senha, chave, código ou token.
- **Quem chama `ler()`**: a rodada (job `distribuicao.ler-fila`, ao vivo), o job do retrato da fila do momento (`distribuicao:ler-retrato-fila`, no intervalo de Configurações › Distribuição, padrão 5 min, ou pelo "Ler agora"; uma leitura por vez, numa fila própria) e a prévia do recolhimento. A tela da fila do momento não chama a MobileMed: lê o retrato gravado (`retrato_fila_distribuicao`, só agregados) e mostra a hora da leitura. Falha na leitura do retrato: o anterior fica, a tela avisa a hora da falha e o log leva só a mensagem curta da porta.
- **Freio**: depois de `MOBILEMED_LIMITE_ANOMALIAS` anomalias seguidas (429, 5xx, sem resposta, fora do formato), cada atribuição volta `falhou/freio_mobilemed` (retentável) sem chamar a MobileMed, até uma chamada dar certo (ex.: a conferência ao retomar).
- **`medicosDaUnidade(empresaId)`**: `POST /usuario/lista/empresa` com `perfis: [3]`; devolve `{ id, nome }`. Base do futuro de-para de `medicos.id_mobilemed` (sem tela).

### 9.3 O que falta

- **Login**: um 401/`invalid_token` no meio da vida do token (sessão derrubada por outra) não força renovação; a chamada falha como `sessao_caiu` e o token só é trocado quando chega perto do `exp` (até ~4 min). Limite absoluto da sessão (refresh token) desconhecido.
- Especialidade (`subespecialidade_id`) e quantidade de laudos não são lidas (o catálogo decide pelo estudo; `laudos` = 1); formato de `modalidade` aceito como texto ou objeto. Conferir no HAR (5.4).
- Conferir o médico na lista da unidade antes de atribuir (`medico_fora_da_unidade`, 3.2 passo 3) e o motivo nas unidades que exigem: não implementados.
- A prévia do recolhimento (painel "Distribuir agora" aberto) ainda chama `ler()` a cada abertura: com o real, é uma leitura inteira da fila.
