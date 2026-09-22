# success.md — o que faz este War Game ser bom

> Régua de qualidade do próprio plano. Se um item aqui falha, o `WAR-GAME.md` volta pra revisão
> antes de ir ao gate humano.

## O plano é bom se

- [x] **Fases têm limite claro.** Cada fase diz o que faz **e o que não faz**. Um executor frio
      consegue saber onde parar sem perguntar.
- [x] **Riscos são reais, não decorativos.** Cada risco nasce de evidência (`arquivo:linha`,
      documento do Corpus) ou está marcado como hipótese `E0`.
- [x] **Todo caminho tem volta.** Nenhuma fase avança sem recuperação escrita antes.
- [x] **Critério de saída é observável.** "Funciona" não conta. Conta comando, resposta, número.
- [x] **Critério de aborto existe.** Cada fase diz quando **parar e chamar o humano**, em vez de
      insistir.
- [x] **Orçamento de tentativas.** Nenhuma fase pode entrar em loop de ajuste — a Lei 3 do
      PLY-008 vira regra: ajustou o mesmo parâmetro 3×, a causa não é o parâmetro.
- [x] **Tabela mestra de riscos com dono de decisão.** Cada risco diz **quem decide**, e nenhum
      risco de fronteira/segredo tem a IA como dono.
- [x] **Ledger separa o que sei do que suponho.** `[INDEFINIDO]` é item de ledger com pergunta
      pro Hamilton, nunca palpite escrito como verdade.
- [x] **Escrito pra executor sem contexto.** Quem executar não leu esta conversa.
- [x] **Versionamento sem sobrescrita.** `versions/` guarda cada revisão relevante.

## Os NÃOs que este War Game respeitou

- ❌ **Não executou nada.** Nenhum arquivo de produção alterado, nenhum comando de mudança
      rodado, nenhum DDL aplicado, nenhuma chave tocada.
- ❌ **Não escreveu código de produção.** O que há de código no plano é ilustração de intenção,
      não patch pronto.
- ❌ **Não assumiu caminho feliz.** Cada fase tem suposição pessimista declarada.
- ❌ **Não escondeu incerteza.** O que não foi lido está no ledger como `[INDEFINIDO]`, com
      destaque para o discriminador de produto no master (L-02) e para a coluna `senha_hash`
      criada no banco errado (achado F3-A).
- ❌ **Não gerou plano genérico.** Toda fase referencia arquivo real deste repo ou documento
      real do Corpus.
- ❌ **Não sobrescreveu versão boa.** O protótipo atual está íntegro; a Fase 0 existe justamente
      para criar o ponto de retorno antes de qualquer mudança.
- ❌ **Não misturou planejamento com execução.** Existe um gate humano entre as duas metades.
- ❌ **Não inventou fato ausente.** Onde faltou evidência, o plano manda **ler antes de mudar**
      (Fase 2) ou **escalar** (D-07, D-08, D-10).
- ❌ **Não cruzou fronteira de produto.** Nenhuma fase toca repositório de outro sistema. Onde a
      correção certa exigiria isso, o plano para e devolve a decisão ao dono.

## O plano falha se

- Alguma fase for executada **antes** do `D-*` correspondente ser aprovado.
- O executor **replanejar** em vez de consultar a tabela de riscos.
- A Fase 5 (Corpus) for escrita **antes** das fases 1–4 fecharem — nasceria descrevendo um
  produto que já mudou (a cicatriz do QuickCash em `_MANUAL-convencao.md`).
- Alguém publicar no `iris-corpus` sem o gate — a chave de escrita é do dono, não do executor.
