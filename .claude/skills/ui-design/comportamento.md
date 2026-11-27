# Comportamento das telas do One

Regras de como a tela reage: validação, URL, erros, textos, teclado e tempo de resposta. Valem para toda tela, junto do [SKILL.md](SKILL.md) e do [sistema.md](sistema.md). Na auditoria, passe esta lista também.

## Formulários: validação e envio

- **Validar ao sair do campo**, não a cada tecla. Campo que a pessoa ainda não tocou não mostra erro; obrigatório vazio só aparece como erro ao enviar. O erro some assim que o valor fica certo (sem esperar sair do campo de novo). No `useAppForm`: validação `onBlur` + `onChange` só depois do primeiro erro.
- **O botão de enviar não fica desabilitado antes do envio.** A pessoa clica e vê o que falta. Ele só desabilita durante a requisição ("Salvando…"), o que também impede envio duplo.
- **Enviando, o botão mostra o giro e o texto inteiro ("Salvando…", "Enviando…", "Entrando…") e não muda de largura.** A largura mínima do botão já cabe o giro com esse texto desde antes do envio, então um "Salvar" fica um pouco mais largo parado, o texto nunca some e nada ao lado se mexe quando o envio começa. Regra única no `BotaoComCarregamento` do kit (e no `SubmitButton`, que usa ele): o rótulo e a camada do carregamento ficam na mesma célula de uma grade, e o botão tem a largura da maior. Se o rodapé de um painel não couber numa linha por causa disso (ex.: "Excluir tipo de ausência" + "Cancelar" + "Salvar" no painel de 400px), vale a quebra do `RodapeDeAcoes`: a ação do início numa linha e as do fim juntas na de baixo, à direita.
- **Enviou com erro:** o foco vai para o primeiro campo errado (rolando até ele) e nenhum valor digitado se perde. Erro do servidor sobre um campo aparece no campo; erro geral aparece acima do rodapé do formulário, junto do botão.
- **Alterações não salvas:** fechar o painel, cancelar ou sair da página com o formulário alterado pede confirmação ("Descartar as alterações?" / botões "Descartar" e "Continuar editando"). Sem alteração, fecha direto, sem perguntar.
- **Entrada tolerante:** remover espaços nas pontas antes de validar e salvar; aceitar acento e apóstrofo em nomes; nunca bloquear colar (nem em senha ou código).
- **Teclado certo e preenchimento automático:** `type` e `inputMode` corretos (`email`, `tel`, `numeric`, `decimal`); `autoComplete` nos campos pessoais e de acesso (`email`, `current-password`, `new-password`, `one-time-code`); `autoComplete="off"` e `spellCheck={false}` em busca, códigos, chaves e e-mails.
- **Somente leitura ≠ desabilitado.** Somente leitura mostra o valor como texto (selecionável, sem borda de controle). Desabilitado é controle que poderia estar ativo; ao lado ou na dica diz por quê ("Só o dono do papel pode editar").
- Grupo de campos relacionados (endereço, dados bancários) fica num `fieldset` com `legend`.
- Em `textarea`, Enter quebra linha e Ctrl/⌘+Enter envia. Em formulário de um campo só, Enter envia.

## Estado na URL

- **Tudo que a pessoa escolhe para ver vai para a URL:** filtros, busca, aba, página, ordenação, item aberto no painel (`?id=`). Use `validateSearch` da rota (TanStack Router). Recarregar, mandar o link ou usar o voltar do navegador devolvem a mesma tela.
- Voltar para uma lista restaura a rolagem, os filtros e a página.
- **Navegação é link:** item de menu, aba que troca de rota e linha que abre um item usam `<Link>`, para Ctrl/⌘+clique e o botão do meio abrirem em outra aba. Nunca `div` ou `button` para navegar.
- O `<title>` da aba do navegador diz a tela ("Usuários · One", "Rodada 12/11 · One").

## Erros e casos extremos

**Cada falha tem a sua resposta:**

| Situação | O que a tela faz |
| --- | --- |
| 400 / 422 (validação) | Erro em cada campo, como na validação local |
| 401 (sessão expirou) | Vai para o login e volta para a mesma tela depois |
| 403 (sem permissão) | Estado "sem permissão" no lugar do bloco, dizendo quem pode liberar; nunca tela em branco |
| 404 | Estado "não encontrado" com o caminho de volta para a lista |
| 409 (conflito, editado por outra pessoa) | Diz o que mudou e oferece recarregar sem perder o que foi digitado |
| 500, queda de rede, tempo esgotado | O que houve + "Tentar de novo"; o que já estava na tela continua à vista |

- **Falha isolada:** um bloco que falha (um gráfico, uma aba, um painel) mostra o erro só nele; o resto da tela continua funcionando (`errorComponent` por seção, não só por rota).
- **Busca:** espera ~300ms depois da última tecla e cancela a requisição anterior; nunca mostra resultado de uma busca velha depois da nova.
- **Teste com dados extremos antes de entregar:**
  - Nome com mais de 100 caracteres: trunca com reticências e o texto completo fica acessível (dica ou no detalhe). Em flex e grid, o item que trunca leva `min-w-0`.
  - Números na casa dos milhões e valores negativos (adicional de débito, estorno).
  - Lista vazia, com 1 item e cheia (várias páginas).
  - 10 cliques rápidos em "Salvar".
  - Rede lenta (aba Rede do navegador em "3G lento") e API fora do ar.

## Textos: erro, vazio, confirmação e números

- **Erro = o que falhou + por quê (se souber) + o que fazer.** "Não foi possível salvar o médico. O CRM já está em outro cadastro. Abra o cadastro de Ana Souza ou corrija o CRM." Proibido: "Algo deu errado", "Erro 403", "Entrada inválida", culpar a pessoa ou inventar a causa.
- **Vazio diz qual vazio é:**
  - Primeiro uso: o que é a lista e a ação de criar ("Nenhum contratado cadastrado." + "Adicionar contratado").
  - Filtro sem resultado: diz isso e oferece "Limpar filtros".
  - Sem permissão e falha seguem a tabela de erros acima.
- **Confirmação diz a consequência no título e a ação no botão:** "Desativar 3 médicos? Eles saem da escala a partir de amanhã." / "Desativar médicos". Nunca "Tem certeza?", "Sim", "OK" ou "Confirmar".
- Status no passado e com o mesmo verbo da ação: "Rodada aprovada.", "Convite enviado.".
- Item de menu ou botão que abre outra etapa antes de agir termina em "…" ("Renomear…", "Exportar…"). Use o caractere `…`, não três pontos.
- **Plural certo:** "1 exame" / "2 exames", "Nenhum aviso" (nunca "0 aviso(s)"). Use `Intl.PluralRules('pt-BR')` ou o helper do kit.
- **Números, datas e moeda em pt-BR via `Intl`:** moeda sempre com 2 casas (`R$ 1.234,50`), nunca misturando 0 e 2 casas na mesma tela; porcentagem com a mesma quantidade de casas na coluna inteira; espaço não separável entre número e unidade (`12 min`, `R$ 40`).

## Desfazer, confirmar e ações em massa

- **Ação reversível e comum desfaz em vez de confirmar:** executa na hora e o toast de sucesso traz "Desfazer" (ex.: tirar um médico da proposta da rodada, arquivar um aviso). O toast com "Desfazer" fica 8 s e pausa com o mouse em cima.
- **Confirmação fica para o irreversível ou de consequência ampla:** fechar competência, excluir, desativar quem perde acesso, aprovar a rodada (que executa na MobileMed). A regra de confirmação do [SKILL.md](SKILL.md) continua valendo para esses.
- **Ação em massa** (quando a tela precisar): caixa de marcar na primeira coluna, com "marcar todos da página"; marcou algum, uma faixa acima da tabela mostra "3 selecionados", as ações e "Limpar seleção", no lugar da faixa de filtros. Ação em massa destrutiva confirma com a contagem. Antes de criar a primeira, mostre o desenho ao usuário (é padrão novo).

## Teclado, foco e leitor de tela

- Tudo funciona só com o teclado, na ordem visual. Teste passando a tela inteira com Tab, Enter, Espaço e Esc antes de entregar.
- **Foco:** ao trocar de rota, vai para o título da página; ao fechar painel, diálogo ou menu, volta para o que o abriu (o Base UI faz; não quebre isso). Cabeçalho e rodapé fixos nunca cobrem o campo focado (`scroll-padding-top`/`scroll-padding-bottom` na área que rola).
- **Anúncios:** toast e erros de formulário anunciados com `aria-live` (o Toast do Base UI já faz); bloco recarregando com `aria-busy`; coluna ordenável com `aria-sort`; botão que abre e fecha com `aria-expanded`.
- **Área de clique de pelo menos 24×24px**, mesmo quando o ícone tem 16px (botão de ícone com padding; no celular, 44px). Controles com `touch-action: manipulation`.
- **Atalhos** nas telas de uso intenso (ex.: aprovar a rodada, próxima e anterior na lista): sempre com o botão equivalente na tela, mostrados na dica do botão (`⌘ Enter` no Mac, `Ctrl Enter` no resto), sem roubar atalhos do navegador ou do leitor de tela, e ignorados enquanto se digita num campo.
- Dica (tooltip) também abre pelo foco do teclado e nunca guarda informação essencial.

## Tempo de resposta

- **O clique responde na hora** (até ~100ms): botão pressionado, item marcado, painel começando a abrir.
- **O skeleton espera um pouco para aparecer:** só depois de ~200ms sem dados e, quando aparece, fica no mínimo ~400ms. Resposta rápida troca direto para o conteúdo, sem piscar. Até lá, o lugar já está reservado com o tamanho certo (nada pula).
- Ação comum e de baixo risco pode ser otimista: a tela muda na hora e, se a API falhar, volta ao que era e mostra o erro.
- Espera longa (mais de ~10 s: importação, fechamento, geração de arquivo) roda em segundo plano, mostra a etapa atual e avisa quando termina; a pessoa segue usando o resto.
