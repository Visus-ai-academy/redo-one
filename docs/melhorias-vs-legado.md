# Melhorias do redo-one em relação ao dashboards-one

> Levantado em 16/11/2026 a partir do histórico de conversas com o Claude Code (83 conversas, de 05/11 a 16/11/2026, nos repos dashboards-one e redo-one). Só entrou o que tem pedido ou confirmação do usuário nas conversas; a fonte de cada item é `data · sessão` (8 primeiros caracteres do id).
>
> Complementa: `CLAUDE.md` (decisões do projeto), `docs/redesenho-banco.md` (mapa do banco), `TODO.md` (dúvidas abertas), `.cortex/decisions/` e `dashboards-one/refactore/revisao-telas.md` (telas redundantes).

**Status**

| Marca | Significado |
| --- | --- |
| Feito | Já implementado no redo-one |
| Decidido | Aprovado pelo usuário, ainda não implementado (ou implementado só em parte) |
| Pendente | Depende de definição ou validação (em geral já está no `TODO.md`) |
| Regra do legado | Corrigido ou pedido no dashboards-one; o redo-one deve nascer com isso |
| Ideia | Apontado nas análises, sem confirmação do usuário |

---

## 1. Motivação e princípios

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| "Muito mal estruturado": ~190 mil linhas, 94 models com duplicação, 121 rotas e 81 services soltos; métricas com várias versões (4 séries mensais, 2 taxas de erro) | Reescrita do zero, back e front separados num monorepo, contextos com arquitetura por contexto | Feito | 13/11 · 12dca378, 54a72938 |
| Problemas de organização, desempenho, permissões e telas redundantes | Reavaliar cada um e recriar | Decidido | 13/11 · 54a72938 |
| Regras de negócio fixas no código (ex.: robô de distribuição), qualquer ajuste exige deploy | Parâmetros e regras no banco, editáveis por tela com permissão e auditoria; sem constantes de reserva no código | Decidido | 14/11 · 4bca0e36, 78757306 |
| — | dashboards-one é a fonte da verdade do comportamento, mas os erros dele são apontados e resolvidos, não copiados | Decidido | 15/11 · 78757306 |
| Regras que só existem em mensagens de commit; scripts `checar-*` como testes informais | TDD com Vitest; regra validada no legado e coberta por teste | Decidido | 13/11 · 12dca378 |

## 2. Arquitetura, desempenho e infraestrutura

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Lentidão por desenho: reimportação total, painéis varrendo a tabela inteira (série mensal ~16 s), `DISTINCT` para montar filtros (~5 s), faturamento em memória, pool saturado | Totais pré-somados atualizados na importação; filtros vindos dos cadastros; listagens paginadas pela API | Decidido | 13/11 · 54a72938; 14/11 · 78757306 |
| Egress do Supabase em 331 GB (133% da cota), ~57 h de banco, DELETE de 5 h | Mesmo ponto acima: importação incremental e totais pré-somados | Decidido | 11–12/11 · d34027b3, 43822678, bd474a10 |
| Cache apagado a cada importação | Sem cache | Decidido | 13/11 · 54a72938 |
| A mesma ação (ex.: fechar competência) reimplementada por tela, cron, RPA e webhook | Um caso de uso por ação, chamado por todas as entradas | Decidido | 13/11 · 54a72938 |
| KPI com várias fórmulas (capacidade com 4 cálculos; `volumetria.ts` com ~2 mil linhas) | `analytics` em vertical slice com cada fórmula de KPI num lugar só | Decidido | 13/11 · 54a72938 |
| Crons da Vercel sem nova tentativa nem histórico; importação limitada a 300 s na requisição | Fila no Postgres (graphile-worker), dado e tarefa na mesma transação | Feito | 13/11 · 54a72938, b42fd822 |
| Importação estoura a memória e derruba a instância (junto caem a emissão de NF e um cron) | Importação como job; ler a planilha em partes | Ideia | 09/11 · 7e4ed962; 11/11 · 3d8c892b |
| Polling agressivo (robô a cada 3 s, `router.refresh` a cada 30 s) | Polling com intervalo por tela, parado com a aba oculta | Decidido | 13/11 · 54a72938 |
| Deploy na Vercel frágil: build falhando sem mudança de código, integração com o GitHub parando de disparar, CLI travando; só se percebia olhando a tela | Containers numa VPS, health check, alerta de job crítico que falhou | Decidido | 05/11 · 6dd356e5, 974b2a07 |
| Migrations aplicadas à mão em produção; `.env` local apontando para produção | Migrations antes da nova versão subir; dev local separado da produção | Decidido | 11/11 · 6088a72d, 976a7d32 |
| Arquivos no Supabase Storage; planilha importada nunca guardada | Storage S3 privado atrás de interface | Decidido | 13/11 · 54a72938; 16/11 · 158663e5 |
| SDK compartilhado acoplando front e back | Cliente gerado pelo Kubb a partir do OpenAPI | Feito | 13/11 · aebbb5a7 |
| Nomes em inglês misturados com o domínio | Domínio em pt-BR sem acento, termos técnicos em inglês | Feito | 13/11 · 54a72938; 16/11 · 158663e5 |
| Página de erro genérica dizendo "banco sobrecarregado" para qualquer erro | Erros de regra viram HTTP por tipo; mensagem condizente com a causa | Ideia | 11/11 · 3d8c892b |

## 3. Identidade, permissões e auditoria

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Sem "esqueci a senha", sem bloqueio por tentativas | Recuperação de senha (link de 1 h) e bloqueio (5 falhas, 15 min) com desbloqueio pelo admin | Feito | 13/11 · b42fd822 |
| JWT continua valendo depois de trocar senha ou papel | Sessão no banco em cookie `httpOnly` (7 dias sem uso, máximo de 30); trocar senha ou papel derruba as sessões | Feito | 13/11 · 54a72938, b42fd822 |
| Médico criado com senha padrão (`Mudar@123`) | Primeiro acesso por convite (7 dias), feito no painel do médico | Feito / Decidido | 13/11 · b42fd822; 14/11 · 78757306 |
| Permissões concedidas por script em produção, uma a uma, conforme o usuário esbarrava | Papéis editáveis por tela, permissões `tela.ação` de um catálogo único | Feito | 09–10/11 · 5693887a, 70f6e884; 14/11 · 39b43759 |
| Permissão `X.editar` valia para criar, editar e excluir; checklist longa e sem agrupamento | Permissões CRUD por tela (`ver`, `criar`, `editar`, `excluir`) e ações especiais à parte; editor em matriz por área, com só leitura e copiar de outro papel; observação de ausência só com `ausencias.observacoes.ver` | Feito | 16–17/11 · 6b9cff3f |
| Abas do médico e campos do exame presos a permissões largas: a aba Acesso dependia da tela Usuários, a Distribuição vinha com `medicos.ver` e editar o exame liberava todos os campos | Chaves próprias por aba e campo: `medicos.distribuicao.ver` (editar implica ver), `medicos.acesso.ver`/`medicos.acesso.editar` com rotas em `/medicos/:id/acesso` e `exames.subespecialidade.editar` (só a subespecialidade, com o mesmo registro de auditoria); migration `0016` mantém o acesso de quem já via as abas. Configurar Operacional e Financeiro pela tela Papéis | Feito | 17/11 |
| Papéis feitos por pessoa, sem equivalência entre eles | Papéis por função | Ideia | 12/11 · 82c4002f |
| Recorte da gestora de escala aplicado em só 2 rotas | RBAC com recortes por atributo aplicados de forma consistente | Feito (escala) / Pendente (`medicos`) | 13/11 · 54a72938 |
| Só a escala era auditada; catálogo sem auditoria apesar de decidir preço | Auditoria única nas entidades críticas, incluindo todo o catálogo e a leitura dos dados de pagamento do médico | Feito (catálogo e médicos) | 13/11 · 54a72938; 14/11 · 78757306 |
| Auditoria gravada, mas sem onde ver o que mudou num cadastro (o dashboards-one só tinha o log da escala) | Aba Histórico, a última, nos painéis de médico, cliente e exame: uma linha por mudança (quem, quando em Brasília, campo antes → depois, ids trocados por nomes, mascarados continuam mascarados), paginada pela API em `GET /medicos/:id/historico`, `/catalogo/clientes/:id/historico` e `/catalogo/exames/:id/historico`, com o `ver` de cada cadastro; no médico, pagamento, distribuição (robô e arranjos) e conta do portal só com `medicos.pagamento.ver`, `medicos.distribuicao.ver` e `medicos.acesso.ver` (recorte na API, com teste). No exame entram os valores fora do padrão ligados a ele; a quebra fica de fora (é do nome do estudo e o evento guarda só nomes). Índice `(entidade, entidade_id, ocorrido_em)` já existia | Feito | 17/11 |
| Quem só muda a subespecialidade do exame via o bloco da quebra | Sem `exames.editar`, o painel do exame não mostra nada de quebras (nem "Abrir a quebra") | Feito | 17/11 |
| Dados de paciente espalhados | LGPD: paciente como HMAC, nada pessoal em logs nem enviado à OpenAI | Decidido | 13/11 · 54a72938 |
| Credenciais de integração em tela | Credenciais de saída só no `.env`; sem tela de chaves dos robôs | Decidido | 14/11 · 39b43759, 78757306 |

## 4. Ingestão de laudos

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Apaga e reinsere a janela inteira a cada ciclo (`APLICAR_DIFF = false`), recalculando faturamento e repasse e relendo as tabelas de preço | Upsert incremental pela chave natural; laudo que sumiu do arquivo é marcado como removido; trava contra arquivo truncado com limite configurável | Feito | 16/11 · 158663e5 |
| Chave natural do redesenho colidia em 50% dos laudos sem accession | Chave: cliente + accession + paciente (HMAC) + estudo + realização + data do laudo | Feito | 16/11 · 158663e5 |
| Para faturar era preciso pausar o RPA na VPS, senão a importação mudava a competência durante a conferência | Competência bloqueada para a importação (no dashboards-one a trava parou o mês também no resto do sistema, e a tela dizia o contrário) | Feito (interface) / Regra do legado | 10/11 · 70f6e884; 16/11 · 158663e5 |
| Nada era resolvido na importação; `avisos_cadastro` vazia em produção | Avisos de cadastro (exame, cliente ou médico desconhecido) nascem na importação, com triagem | Feito | 16/11 · 158663e5 |
| Chave do valor fora do padrão gravada com " X3" e buscada sem; 63 peças de quebra com " X1 X6" nunca casavam | A mesma normalização dos dois lados | Feito | 16/11 · 158663e5 |
| Grafia com e sem acento tratada como coisas diferentes (a MobileMed manda com acento na volumetria e sem na fila) | Grafias normalizadas | Feito | 15/11 · 78757306; 16/11 · 158663e5 |
| Volumetria e faturamento divergiam na especialidade | A especialidade do cadastro vale sempre que o exame existir | Feito | 16/11 · 158663e5 |
| Tela de importação fora do menu (só pela URL) | Importação no grupo Operação, com as telas de Avisos e de parâmetros | Feito | 16/11 · 158663e5 |
| Exames lançados pela MobileMed na unidade errada, sem como mover laudos entre clientes | Mover laudos entre clientes pela tela | Ideia | 10/11 · 5ae47f42 |
| Volumetria só soma volume; não há total de exames nem média de entrada mensal | Opção de contar exames ou um card com o total | Ideia | 13/11 · b0e95620 |

## 5. Catálogo e cadastro de clientes

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Um formulário de cliente mistura identificação, fiscal, banco, Omie, franquia, representante, pré-pago e distribuição | Cadastro básico no `catalogo`, o resto no contexto dono (uma aba por contexto) | Feito (catálogo) | 14/11 · 78757306 |
| Clientes de um contrato só (PRN, CEDIDIAG) eram dezenas de cadastros juntados por nome fantasia; CDT tem 7 tabelas de preço para o mesmo contrato; não ficava claro onde fica o "nome do grupo" | Unidades de um cliente principal (um nível, reversível, auditado); o sistema deve suportar a unificação do CDT depois | Feito | 10/11 · 70f6e884; 15/11 · 78757306 |
| Apelidos em duas etapas; SUFIXO com destino vazio só cortava o sufixo | Apelidos apontam para o cliente; corte de sufixo em tabela à parte | Feito | 14/11 · 78757306 |
| Contratado de repasse permitia A→B→C e deixava o motor sem consolidador | Consolidação em um passo, fechando a brecha | Feito | 14/11 · 78757306 |
| Cliente e médico ocultos por regra fixa no código (sufixo `_DIAGNOSTICA`, médico pelo nome) | Marcas no cadastro (`oculto_dashboards`); regra "fora do SLA" pelo contratado ou por marca própria | Feito / Pendente (`_DIAGNOSTICA`) | 15/11 · 78757306 |
| Modalidade disfarçada de especialidade (MAMO, D.O, DO, MG, TC, RX, GERAL) e trocas fixas no código (OT/BMD→DO, CR/DX→MG/RX) | Modalidade, especialidade e frente da escala separadas; GERAL deixa de existir; códigos viram variações | Feito | 15/11 · 78757306, 7d078624 |
| De-paras duplicados (Ambulatorio/Ambulatório, Plantao/Plantão; RX várias vezes) | A forma certa no centro e as variações penduradas nela, no painel de cada item | Feito | 15/11 · 78757306 |
| Tipo de de-para "ARRANJO" colidia com o termo Arranjo | Renomeado para `regiao_anatomica` | Feito | 14/11 · 78757306 |
| Exames padronizados e fora do padrão na mesma lista | Listas separadas (abas em Exames), sem perder os detalhes dos fora do padrão | Feito | 15/11 · 78757306 |
| 119 de 246 regras de quebra presas a estudos que não existiam no cadastro | Quebra ligada ao nome do estudo | Feito | 15/11 · 78757306 |
| Exames chegam com nome alternativo, sem especialidade e com valor 0: caem como GERAL, sem preço, e afetam o robô | Aviso de cadastro na importação; valor ≤ 0 ignorado; modalidade vinda do catálogo | Feito (avisos) | 09/11 · 5693887a |
| ONCOLÓGICO e "ONCO MEDICINA INTERNA" perdiam a categoria ONCO; repasse zerado para laudo sem catálogo; 18 exames "(ONCO)" com categoria trocada | Variação de especialidade poder levar categoria | Pendente (validação de 16/11) | 15/11 · 78757306 |

## 6. Médicos

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Dados de pagamento junto com o cadastro | Tabela à parte com permissão própria e leitura auditada | Feito | 14/11 · 78757306 |
| "Tipo de contratação" era sócio/não sócio, e o catálogo nunca era ligado | Só um sim/não de sócio | Feito | 14/11 · 78757306 |
| Nível em texto livre, fora do formulário e não preenchido em nenhum dos 281 médicos | Catálogo de níveis; o financeiro precisa informar os níveis | Feito / Pendente | 13/11 · 132dc1bf; 14/11 · 78757306 |
| Especialidades do médico não eram lidas pelo motor | O que o médico lauda vem dos arranjos, na distribuição | Decidido | 14/11 · 78757306 |
| Grupos de médicos escondidos nas regras de faturamento | Equipes agora, grupos com o faturamento | Feito / Decidido | 14/11 · 78757306 |
| Busca de médico não tolerava erro de digitação | Busca por semelhança em todas as listas | Feito | 10/11 · d287bcff; 15/11 · 78757306 |
| Inativar médico obrigava a criar arranjo; não dava para salvar médico sem arranjo | Cadastro independente do arranjo | Regra do legado | 09/11 · 484dbaf3, e5f67abe |
| Lista de médicos sem exportação | Exportar identificação e contato | Regra do legado | 10/11 · 43166feb |

## 7. Distribuição (robô)

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Horários e composição das rodadas fixos no código (`URGENCIA_TARDE`, `HORARIOS_LISTA`, 24 h da redistribuição da Lista), com cortes inconsistentes entre urgência e frentes | Horários, cortes e composição das rodadas configuráveis por tela | Decidido (princípio) | 10–11/11 · 253494db, 6a543840, 869cd8d0; 14/11 · 4bca0e36 |
| Regras específicas por frente fixas no código (RX, MAMA, MEDICINA INTERNA etc.) | Regras da frente na aba Distribuição da especialidade ou modalidade: Lista (prioridades e prazo mínimo ou SLA), recolhe ou não, robô e horários sem robô, divisão, teto por médico opcional, segmentos (teto, piso, mistura, pacote à parte) | Decidido | 16/11 · 861a9c45; 17/11 · 48d350b6 |
| A distribuição não leva em conta a qualidade | Priorizar clientes e médicos com melhor classificação. Depende das classificações de médico e de cliente (seção 13). O peso da qualidade deve ser configurável | Decidido / Pendente (como pesar) | 16/11 · 861a9c45 |
| Lista seguia o SLA; a regra da Lista (ROTINA, "SLA > 24 h") era global e as frentes diferentes viravam exceção por médico | Regra padrão da Lista na configuração global (prioridades aceitas e prazo mínimo; carga com ROTINA e 24 h) e exceção opcional na frente, campo a campo (MAMA e CARDIO "seguem o SLA"); o ajuste do dia "a Lista segue o SLA" continua furando para um médico; prioridade vem do arranjo | Regra do legado / Feito (motor) | 05/11 · 98e6f8f9; 17/11 · 48d350b6 |
| Urgências de RX ficavam sem médico (o legado só furava a Lista para URGÊNCIA de RX com o arranjo marcando, fixo no código) | "Se na escala do médico tem Lista e urgência, ele recebe as urgências": a alocação da Lista que marca uma prioridade urgente (as da configuração global) recebe os exames dela pelo SLA, sem prioridades aceitas nem prazo mínimo da Lista, em qualquer frente | Regra do legado / Feito (motor) | 13/11 · 3ab3e455; 17/11 · 48d350b6 |
| Médico recebia acima da capacidade do período (espaço livre medido pela pilha, não pelo recebido) | Capacidade descontando o que já recebeu; Lista a cada 30 min só para quem não completou a carga | Regra do legado | 12/11 · b36831d3 |
| Rodadas próximas contavam a mesma vaga duas vezes (carga vinha do pipeline importado) | Carga inclui o que o robô acabou de atribuir | Ideia | 12/11 · 8616a9d9 |
| Produtividade vazia na escala tratada como "sem teto" | Vazio não vira sem teto | Pendente | 16/11 · 69872d75 |
| Robô redistribuía o exame ao médico de quem a operação o tinha tirado | Nunca redistribuir o mesmo exame ao mesmo médico; mostrar o bloqueio no funil e no simulador | Regra do legado | 16/11 · ef448618 |
| Robô passava adiante exame já aberto ou pré-laudado | Só distribui exame com status NOVO | Regra do legado | 09–10/11 · 4cf4fbf5, ea0c8b90 |
| Recolhimento tirava exames de quem começa o turno na mesma rodada | Não recolher de quem tem turno começando na rodada atual | Ideia | 12/11 · 48d3b94c |
| Exames da Manhã recolhidos às 14 h não achavam vaga na Tarde | Margem para o recolhimento, configurável por frente | Regra do legado | 12/11 · 3d86423d |
| Médico dispensado por baixo volume continuava recebendo | Ausência do tipo "Dispensado" | Regra do legado | 10/11 · d4f63983 |
| Rodada manual sem turno incluía a Tarde (urgência para quem não entrou) | Rodada manual respeita o turno | Ideia | 10/11 · ec32f9de |
| Divisão proporcional concentrava tudo em quem tem teto 600; médico não habilitado na unidade da MobileMed | Revisar a divisão e validar habilitação antes de atribuir | Ideia | 05/11 · 346ee081 |
| Clínica exclusiva com um único médico: exames parados fora do turno dele | Regra configurável para esse caso | Ideia | 16/11 · 31049d39 |
| A operação tira exames do robô pela MobileMed sem registro; não dá para saber quem tirou | Rastrear as mudanças de mão | Ideia | 12/11 · f9ca81ff; 16/11 · 82f7879a |
| Diagnóstico "por que o médico não pegou" leva até 1 min (remonta a rodada) | Diagnóstico a partir do registro da rodada | Ideia | 13/11 · 3ab3e455 |
| Diálogo de exceções sem filtro por frente; "Adicionar médico" parecia só adicionar | Filtro por frente; "Editar médicos" | Regra do legado | 05–06/11 · 843cf69f, ff6e6e45 |
| Modal de vínculo do médico ao turno abria sem seguir o arranjo do cadastro | Vem pré-preenchido com o arranjo, sem travar as outras opções | Feito | 05/11 · 6dd356e5 |
| Arranjo, escala, ausência, exceções, prioridade de cliente, políticas e janelas em telas diferentes; parâmetros do robô espalhados | Um lugar por pergunta: o que o médico lauda (Médicos › Distribuição), quando trabalha (Escala), regra da frente (especialidade/modalidade), cliente, equipe, global (Configurações › Distribuição), rodar (Operação › Distribuição) | Decidido | 17/11 · 48d350b6 |
| Exceções do robô usadas por médico todo dia para contornar a regra da Lista (36, uma com 103 médicos) | Exceção deixa de ser cadastro: o temporário é ajuste do dia na Escala; o que se repete é regra da frente | Decidido | 17/11 · 48d350b6 |
| Parâmetros sem uso em produção: escape, pesos, lote, exceção do médico, listas de médicos por cliente/exame, categoria no arranjo | Não migrados | Decidido | 17/11 · 48d350b6 |
| "RX 150 por dia": o motor ignorava o "dia" | Não migrado; o teto por médico fica disponível, vazio | Decidido | 17/11 · 48d350b6 |
| Agenda das rodadas automáticas fixa no código | Sem rodadas automáticas por ora; agenda configurável anotada no TODO | Decidido | 17/11 · 48d350b6 |
| Designação gravava o nome do paciente | Id do exame na MobileMed + HMAC do paciente; nome só na conferência, com permissão | Decidido | 17/11 · 48d350b6 |

## 8. Robôs e integração com a MobileMed

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| 3 robôs Python/Playwright frágeis (22 correções de seletor em 6 meses), com regra de negócio dentro e código duplicado em Python e TypeScript | Recriar do zero; trocar o RPA por chamadas HTTP diretas à MobileMed, como adaptador na API | Pendente (mapear a API e obter autorização) | 13–14/11 · 54a72938, 39b43759 |
| MFA pedido à mão via SSH/tmux; robô para esperando o código | Reconexão automática com TOTP (otplib); aviso quando precisar de código | Pendente | 09/11 · 4524bc6b; 13/11 · 54a72938 |
| Robôs dividem o mesmo usuário e derrubam a sessão um do outro; rodada falhada não é retomada | Sessão própria por integração; nova tentativa pela fila | Ideia | 16/11 · 4f812b24 |
| Erro da MobileMed aparecia como erro do One | Mensagem dizendo de onde veio a falha | Regra do legado | 10/11 · 93c9f253 |

## 9. Escala

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Ausência só por dia inteiro e sem recorrência | Ausência por escala, por turno ou dia inteiro e recorrente por dia da semana, num formulário único (vários médicos de uma vez) nas Ausências e no "Definir ausência" da escala; o portal pede com turno e dias | Feito (API do portal feita; tela do portal com o portal) | 11/11 · 976a7d32, 6088a72d; 16/11 · 6b9cff3f |
| Não dava para escalar médico sem arranjo | Escalar sem arranjo prévio | Feito | 09/11 · e5f67abe; 16/11 · 6b9cff3f |
| Log das alocações só para o ADMIN | Histórico da escala com permissão própria (`escala-historico.ver`), filtrado pelo recorte, com nomes no lugar dos ids e as cascatas (coberturas e ajustes) registradas | Feito | 05/11 · 78bfa637; 16/11 · 6b9cff3f |
| "Escala › Configurações" sem efeito | Removida; Configurações › Escala tem só Turnos e Tipos de ausência | Feito | 13/11 · 54a72938; 16/11 · 6b9cff3f |
| Recorte da gestora em arrays sem FK, sem tela, aplicado só nas Visões (Ausências, contador e histórico mostravam tudo) | `usuarios_escopos_escala` com FK, editável no painel do usuário (não o próprio), aplicado na API em ocorrências, alocações, ausências, contador e histórico | Feito | 13/11 · 54a72938; 16/11 · 6b9cff3f |
| Especialidade fazendo papel de modalidade na escala (TC, RX, DO, D.O, MG) | Frente = especialidade ou modalidade do catálogo, sem cadastro próprio; criada sozinha quando um turno a usa; D.O e DO viram DO, MAMO vira MAMA | Feito | 15/11 · 78757306; 16/11 · 6b9cff3f |
| Duas telas editando a mesma alocação (Visões e o passo Escalas do médico) | Só a tela Escala edita; o painel do médico mostra um resumo com link | Feito | 16/11 · 6b9cff3f |
| Semanal e Por escala eram a mesma consulta | Semana agrupada por frente ou por turno, mais Mês e Por médico | Feito | 16/11 · 6b9cff3f |
| Tipos de ausência e gravidade fixos no código | Cadastro editável (gravidade, só o gestor lança, conta como falta) | Feito | 16/11 · 6b9cff3f |
| Médico, turno e frente inativos continuavam gerando plantão; encerrar o titular não encerrava a cobertura; cobertura com recorte copiado e defasado | Inativo não gera ocorrência; a cobertura segue o titular (dias, recortes, vigência) na hora da expansão; vigentes de médico inativo encerrados na carga | Feito | 16/11 · 6b9cff3f |
| Aprovar/recusar sem conferir a situação; mudar horário do turno sem revalidar; ajuste do dia em dia sem plantão | Aprovar e recusar só pendente; turno recusa horário, tipo ou frente que invalidaria alocações vigentes; ajuste só em dia de plantão | Feito | 16/11 · 6b9cff3f |
| Ocorrência sem hora absoluta: às 02:00 o robô usava o plantão de hoje no lugar do de ontem | Ocorrência com início e fim em instantes de Brasília; o consumo pela distribuição fica para ela | Feito (escala) / Pendente (distribuição) | 16/11 · 6b9cff3f |
| Gestora precisava de acesso ao cadastro de médicos (e ao catálogo) para escalar | Listas da escala só com o necessário e `escala.ver`: médicos (id, nome, ativo), prioridades e subespecialidades (id, nome, ativo) | Feito | 16–17/11 · 6b9cff3f |
| Escalar um médico com produtividade diferente por dia exigia um vínculo por combinação (ou a grade do cadastro, que era um segundo editor) | "Montar escala" no modo Por médico: grade turnos × dias com produtividade por célula; vira as alocações sozinha e aplica só a diferença | Feito | 16/11 · 6b9cff3f |
| Semana com uma linha por turno espalhava os médicos do dia | Semana no formato que a operação prefere: um calendário por frente, médicos do mesmo turno em bloco com a faixa lateral na cor do turno, cartão com a descrição ao passar o mouse e modo Ausências da semana | Feito | 16/11 · 6b9cff3f |
| Sábado e domingo sempre na grade, quase sempre vazios | Semana de segunda a sexta; sábado e domingo aparecem quando há plantão ou ausência, ou pelo alternador "Fim de semana", que permite escalar neles | Feito | 17/11 · 6b9cff3f |
| Frentes, turnos e tipos de ausência sem cor ou com cores parecidas | Cores de matizes bem separados e pouco saturados, editáveis na tela; a carga não sobrescreve a cor escolhida no redo-one | Feito | 16/11 · 6b9cff3f |
| Arranjo do médico pré-preenchia o vínculo lendo a distribuição de dentro da escala | O formulário recebe valores iniciais; o pré-preenchimento vem da `distribuicao` pelo front | Feito | 16/11 · 6b9cff3f |

## 10. Faturamento

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Preços do cliente só por importação e exportação de Excel | Incluir, editar e excluir preço na tela | Regra do legado | 10/11 · 70f6e884 |
| Preço alterado não vale para período fechado sem reabrir e pausar o RPA | Trava de importação por competência; definir quando a competência fecha | Pendente | 10/11 · 70f6e884 |
| Faltava o relatório "Quantitativo por Tipo de Faturamento" | Exportação com as 5 abas, com equipe resolvida por apelido (870 exames de outubro sem equipe) | Regra do legado / Pendente | 09/11 · 5693887a |
| Excel não marca atraso nem retroativo | Colunas "Atrasado", "Minutos de atraso" e "Retroativo" | Ideia | 11/11 · b8788621 |
| Carência da franquia sem campo na tela | Campo na tela | Pendente | 05/11 · ce11186b |
| E-mail não aceitava vários endereços com `;` | Vários e-mails por cliente | Regra do legado | 05/11 · d814b287 |
| Número da NF só aparecia depois de "Verificar NFs" | A emissão já traz o número | Regra do legado | 09/11 · 5aa6cfb7 |
| Envio de e-mail não achava o cliente (chaves normalizadas diferentes) | Demonstrativo ligado ao cliente por id | Regra do legado | 09/11 · 5aa6cfb7 |
| Omie recusa com `REDUNDANT`; queda no meio deixa NF sem registro | Emissão como job idempotente | Ideia | 09/11 · 7e4ed962 |
| Sincronização com o Omie falha com cliente já existente sem código de integração | Associar o código de integração em vez de alterar o cliente | Pendente | 05/11 · 4037cad2 |
| Exames de TESTE são cobrados | Regra configurável para reconhecer exame de teste | Pendente | 10/11 · 70f6e884 |
| Tipificação CO/NC/NC1 e FT/NF sem significado documentado | Confirmar antes das telas do faturamento | Pendente (validação de 16/11) | 15/11 · 78757306 |
| Demonstrativo em JSON recriado; ajuste manual preso ao `laudo.id` e perdido na reimportação | Demonstrativo com itens e versão; ajuste pela chave natural do laudo | Decidido (`redesenho-banco.md`) | 13/11 · 54a72938 |
| Dúvidas de regra: franquia por volume (101 exames pagam menos que 99), vigência de preço, médico sem cadastro, tomografia NEURO × MEDICINA INTERNA | Perguntar ao financeiro | Pendente | 13/11 · 54a72938 |

## 11. Contratos

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Contrato usa cópia dos preços da criação; não dá para substituir envio na ClickSign; a tela não mostra o estado da assinatura | Substituir documento, aviso de preço alterado e estado da ClickSign na tela | Ideia | 09/11 · a4901494 |
| Contratos cadastrados em dois sistemas (painelgestao-teleimagem e dashboards-one), sem sincronização, com numeração e status divergentes | Um único lugar para contratos | Pendente | 11/11 · 3e53f7b0 |

## 12. Repasse e portal do médico

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Preço de repasse em 4 lugares | Um lugar só, com vigência | Decidido (`redesenho-banco.md`) | 13/11 · 54a72938 |
| Portal mostrava competências anteriores à ativação do médico e abria num período diferente da home | Só períodos após a ativação (o aberto sempre aparece); padrão igual à home | Regra do legado | 05/11 · bd43c9bd |
| — | Botão "Sacar" mostra a data do repasse; depois leva à Altis | Regra do legado / Pendente (Altis) | 05/11 · 974b2a07 |
| Aba Qualidade do portal com classificação, estrelas, SLA e pesos | Sem classificação, estrelas, SLA ou pesos | Regra do legado | 05/11 · 974b2a07 |

## 13. Qualidade

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Classificação dos médicos contava laudos de clínicas não consolidadas | Só clínicas consolidadas; definir NC1 e os chamados sem clínica | Regra do legado / Pendente | 13/11 · 132dc1bf |
| Tiers de clientes com números fixos no código, copiados de planilha | Calcular por período, como a classificação dos médicos | Ideia | 12/11 · 944daf2c |
| Classificações de médico e de cliente servem só para exibição | As duas classificações alimentam a distribuição (seção 7) | Decidido | 16/11 · 861a9c45 |

## 14. Painéis

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Excesso de indicadores, com várias versões do mesmo KPI | Cada setor (financeiro, operacional, suporte e comercial) com no máximo 5 KPIs, cada um com fórmula única em `analytics`. Quais KPIs: a definir | Decidido / Pendente (escolha dos KPIs) | 16/11 · 861a9c45 |
| Painéis redundantes (Coordenador ≈ Executivo, Gestão Estratégica repete a Mensal etc.) | Juntar conforme `refactore/revisao-telas.md`, sem perder acesso de ninguém | Ideia (sem confirmação item a item) | 13/11 · 54a72938 |
| Painel TV: cabe na tela, tela cheia, recarga a cada 10 min; dia em UTC vira depois das 21 h de Brasília; sem permissão própria | Datas em horário de Brasília; permissão própria | Regra do legado / Pendente | 11/11 · bfa621a0, f7d8cf23 |
| RX fora do Direcionamento e da pilha do robô | Incluir RX | Regra do legado | 16/11 · b3da9e13 |
| Direcionamento contava as clínicas exclusivas | Filtro de exclusivas ligado por padrão | Regra do legado | 11/11 · b6bc6d15 |
| Alerta de médico com menos de 70% da capacidade, com o corte fixo no código | Alerta com corte configurável | Regra do legado / Decidido (princípio) | 13/11 · 3f5fdef6, b0e95620 |
| SLA sem o nome do paciente nos atrasados | Coluna Paciente (avaliar contra a minimização da LGPD) | Regra do legado | 05/11 · 777805d5 |
| Modelo do Painel IA caro e fixo no código | Modelo configurável | Regra do legado / Pendente (Painel IA continua?) | 12/11 · c90bd770 |

## 15. Telas e usabilidade

| Problema no dashboards-one | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| Menu com 22 itens e ~30 subitens; configurações espalhadas em 5 lugares | Menu só com telas de trabalho, subtelas em abas, central de Configurações; ícones Phosphor | Feito | 13/11 · b42fd822; 14/11 · e66caf53 |
| Visual a melhorar | Manter a identidade (menu verde), sem a marca TeleImagem; login mais elaborado | Feito | 13/11 · b42fd822 |
| Toda interação virava tela nova | Ponderar tela, modal, drawer ou popover para cada interação | Feito (skill `ui-design`) | 14/11 · 39b43759 |
| Componentes simulados à mão e `select` nativo | Sempre Base UI | Feito | 14/11 · 78757306, 39b43759 |
| — | Placeholder em todo campo e `*` em todo obrigatório; máscaras ao digitar (CPF, telefone, CEP) | Feito | 13/11 · b42fd822; 15/11 · 78757306 |
| — | Skeleton no carregamento, animação leve em drawer e modal, toast de sucesso | Feito | 14–15/11 · 78757306 |
| — | Linha inteira clicável com cursor correto; drawer só esconde a coluna que não cabe | Feito | 15/11 · 78757306 |
| — | Busca por relevância em todas as listas; select com busca a partir de 7 opções | Feito | 15/11 · 78757306 |
| Listas enormes | Paginação e lista em 100vh | Feito | 14/11 · 39b43759 |
| Dois itens levando à mesma página | Um item por destino | Feito | 14/11 · 39b43759 |

## 16. Migração e convivência

| Ponto | No redo-one | Status | Fonte |
| --- | --- | --- | --- |
| dashboards-one em produção | Migração só de leitura, idempotente; catálogo e médicos já migrados | Feito em parte | 14/11 · 78757306 |
| Supabase lotado | Banco novo para a migração completa | Pendente | 14/11 · 78757306 |
| Conferir os números | Rodar lado a lado com o golden test do faturamento como critério de pronto | Pendente | 13/11 · 54a72938 |
