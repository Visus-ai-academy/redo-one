# Avisos de inconsistência, com impacto

Data: 25/11/2026. Aprovado pelo usuário: "siga com sua recomendação, disparo de e-mail acho que não precisa" (A, B, C e E abaixo; D fora).

## Intenção

No dashboards-one havia avisos, mas ninguém olhava. No redo-one, os avisos só nascem na importação de laudos, para cadastro que falta (cliente, médico, estudo, modalidade, especialidade, prioridade, grafia da operação, conta da unidade). Inconsistências achadas em outros lugares (carga do dashboards-one, preços, tipificação, nome de cliente ambíguo) ficam só em relatório ou em log. Esta etapa faz qualquer inconsistência virar aviso e faz o aviso chegar a quem resolve, com consequência se não for resolvido.

## Decisões

Do usuário:

1. **Preços entram exatamente como estão no dashboards-one.** Categoria SUBCLAVIA e prioridade CONVÊNIO viram itens do catálogo na carga (com o mesmo tratamento dos demais itens do catálogo: apelidos, de-paras, auditoria) e os 633 preços que hoje ficam de fora entram. MAMO → MAMA e D.O → MÚSCULO ESQUELÉTICO seguem os de-paras já existentes. Os 214 preços repetidos com valores diferentes: fica o mais recente (não há "como está": o legado usa um deles sem critério) e cada caso vira aviso.
2. **Inconsistência vira aviso**, de qualquer contexto, com o atalho para a tela onde se resolve.
3. **A. Responsável por tipo de aviso:** configurável (tela com permissão e auditoria): cada tipo de aviso tem um ou mais papéis responsáveis. O aviso aparece para quem precisa agir.
4. **B. Faixa no topo de todas as telas** para o responsável, enquanto houver aviso dele pendente ("3 avisos seus pendentes; o mais antigo há 4 dias"), com link para a lista filtrada. Não some sozinha nem tem "fechar".
5. **C. Aviso que trava o fechamento da competência:** configurável por tipo ("impede fechar a competência"). Aviso pendente desse tipo ligado a uma competência impede fechá-la. Quem tem permissão própria fecha mesmo assim informando um motivo, que fica no histórico do fechamento e na auditoria.
6. **E. Selo no item:** preço, cliente, médico, exame etc. com aviso pendente mostram um selo na lista e no painel, com link para o aviso.
7. **D. E-mail: não.**

Minhas (o usuário pode corrigir):

8. Um modelo só de aviso para todos os contextos (o `avisos_cadastro` atual se generaliza; os tipos atuais continuam iguais, com a mesma deduplicação por chave e a mesma triagem: pendente, ignorado, resolvido). O aviso guarda: tipo, chave (dedup), texto, a entidade a que se refere (tipo + id, para o selo e o atalho), a competência quando houver (para a trava), origem (importação, rodada, carga, tela, job) e ocorrências.
9. Resolver: quando a causa some (o item é corrigido), o aviso passa a resolvido sozinho na próxima verificação da origem, como já acontece com os de cadastro; ignorar exige motivo.
10. Visibilidade: continua a regra de hoje (cada tipo só para quem vê a tela onde se resolve); o responsável é um recorte a mais, não uma permissão nova.
11. Padrões iniciais na migration: responsáveis vazios (o usuário configura); "impede fechar" ligado para os tipos que afetam o faturamento (cliente desconhecido, estudo/exame desconhecido, preço repetido, laudo sem tipificação) — o usuário pode desligar.

## Novos tipos de aviso (primeira leva)

| Tipo | Origem | Onde se resolve | Competência |
| --- | --- | --- | --- |
| Preço repetido com valores diferentes | Carga do dashboards-one e importação de planilha de preços | Aba Preços do cliente | Sim (as competências em que as versões valem) |
| Cliente com nome ambíguo | Importação de laudos (resolver de cliente) | Clientes | Sim |
| Item do catálogo criado pela carga | Carga do dashboards-one (ex.: SUBCLAVIA, CONVÊNIO) | Catálogo | Não |

Outros tipos entram quando as origens existirem (ex.: laudo sem preço no demonstrativo).

## Não objetivos

E-mail ou notificação externa; tela nova de "central de alertas" além da tela Avisos que já existe.

## Passos

1. Carga dos preços exatamente como no dashboards-one (SUBCLAVIA e CONVÊNIO no catálogo).
2. Modelo genérico de aviso, novos tipos, responsáveis por tipo e "impede fechar" (tabela de configuração por tipo), trava no fechamento com override e motivo.
3. Faixa no topo, selo nos itens, tela de configuração dos tipos; validação no Chromium.
