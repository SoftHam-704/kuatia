# Relatório — F8: contexto e manual do usuário

**Data:** 2026-08-11 · **Estado:** escrito e gateado · **Não publicado** (a chave é do dono)

---

## O que existe agora

```
softham-corpus/products/kuatia/
  contexto.md                    mapa do sistema para a IRIS
  manual/00-visao-geral.md       o que é, as duas ideias, os três níveis
        01-acessar.md            entrar, perfis, por que o acesso é negado
        02-panel.md              saldo, vencido, resultado do mês
        03-cuentas-por-pagar.md  cadastro, baixa parcial, estorno
        04-cuentas-por-cobrar.md o espelho — só o que muda
        05-libro-de-caja.md      caixas, lançamento manual, transferência
        06-flujo-y-resultados.md fluxo, DRE gerencial, consolidado
        07-importaciones.md      XML de compra do SIFEN
        08-administracion.md     empresas, usuários, auditoria
```

Uma fonte, dois consumidores (`_MANUAL-convencao.md`): a IRIS lê o `.md` em runtime, o humano vê
o mesmo texto renderizado. E é o roteiro do vídeo explicativo (**D-04**).

## O gate — contra o código e contra o relógio

Cada afirmação foi aterrada nas telas e nas rotas, **depois** das fases F0–F7. Escrever antes
teria produzido um manual descrevendo um produto que ainda ia mudar — é a cicatriz do QuickCash
registrada na convenção.

**Uma correção que o gate pegou:** eu tinha escrito que o extrato traz *"no máximo 500 linhas"*.
O 500 é o teto da API (`.max(500)`); a tela **não passa o parâmetro**, então vale o padrão de
**100** — e ela mesma diz *"Se muestran los últimos 100 movimientos"*. Corrigido antes de
publicar.

Isso é o defeito clássico do manual: ler o limite do backend e escrever como se fosse o que o
usuário vê. Uma linha velha no `.md` não é silêncio — é **negativa confiante** na boca da IRIS.

## O que o manual diz que o sistema NÃO faz

Cada capítulo termina com as ausências, em vez de fingir completude:

- cancelar conta · editar conta salva · paginar listas *(03, 04)*
- conciliação bancária · câmbio · desativar caixa *(05)*
- fluxo de caixa **não projeta saldo** — não responde *"vou ficar sem dinheiro dia 23?"* *(06)*
- resultado gerencial **ignora lançamento manual de caixa** *(06)*
- extrato e auditoria mostram 100 linhas, sem próxima página *(05, 08)*
- RUC sem dígito verificador · empresa não se desativa *(08)*

## Mudanças no `contexto.md`

- **§1** — aponta o `manual/` e o comando de provisionar tenant.
- **§5** — deixou de ser lista solta: virou tabela *pergunta → capítulo que responde*, que é o
  roteamento da Fase A. E ganhou o bloco do que a IRIS **não pode** responder hoje (tudo que
  exige ler o banco é Fase B), com a instrução de dizer em que tela o número está em vez de
  inventá-lo.
- **§7** — três fronteiras novas com condição de saída: dígito verificador do RUC, edição de
  conta e paginação.

## Verificação

`node check-corpus.js --avisos` → **nenhum erro de consistência**. Os 14 avisos são
pré-existentes de outros produtos (colisão de `RFI-00x` entre `estacionamento` e `repone`, e
estilo de link `[[ID]]`); nenhum vem dos arquivos do Kuatiá.

## Próximo passo — humano

**Publicar é seu:** `node "C:\Users\Systems\bin\storin\sync-iris-corpus.js"` (PLY-002). Enquanto
não sincronizar, o conteúdo existe no disco canônico e não no bucket.

E o Corpus é repositório git — a pasta `products/kuatia/` está como não rastreada. Commit + push
fecham a sessão de curadoria.
