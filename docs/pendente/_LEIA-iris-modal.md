# Modal da IRIS — parado, e por quê

`IrisModal.tsx.rascunho` está fora do build de propósito. Não é código abandonado; é código
que **não deve entrar** sem uma decisão sua.

## O que aconteceu

Pedido: trazer o modal da IRIS do QuickCash para o Kuatiá. Portei o conceito — fundo escurecido,
entrada animada, `Esc` e clique no fundo fecham, chamável por `Ctrl+K` e pelo chip da sidebar — e
adaptei o acento para **ouro**, porque no design system do Kuatiá verde significa entrada de
dinheiro e não se decora com ele.

Adaptar o acento por produto é exatamente o que o **`ADR-0020`** proíbe:

> A aparência da IRIS é única para todos os produtos da SoftHam. Não há customização visual por
> produto. **A pele viaja no pacote compartilhado.**
>
> — decisão do Hamilton, 2026-08-04, status **ACEITO**

Ou seja: eu portei o padrão do QuickCash sem cruzar com a decisão que diz que esse padrão **não
se porta, se compartilha**. Uma IRIS "à moda Kuatiá" contraria a decisão mesmo sendo bonita.

## Por que o rascunho ainda existe

Duas coisas nele continuam valendo e não são visuais:

1. **A honestidade do conteúdo.** O Kuatiá está na Fase 0 do `PLY-006`: sem loader de corpus, sem
   endpoint de chat, sem tool. O rascunho **não abre caixa de pergunta** — mostra o que a IRIS vai
   saber (o manual já está publicado), o que vai continuar sem poder responder (tudo que exige ler
   o banco é Fase B) e como se abre. Uma caixa de texto que sempre erra ensina o usuário a não
   usar o recurso. *No QuickCash o modal abre e a pergunta falha — está declarado no código dele.*
2. **O gatilho.** `Ctrl+K` de qualquer tela é conceito de navegação, não de aparência da IRIS.

## As três saídas

| | |
|---|---|
| **(a)** | Esperar o pacote compartilhado (`architecture/_iris-compartilhada/_02-PROMPT-pacote-iris-ui.md` · `E:\Sistemas_ia\Iris-plataform-sdk`) e consumir a pele de lá quando o Kuatiá entrar na Fase A |
| **(b)** | Você decidir que o `ADR-0020` não alcança um *launcher* dentro do produto — só a superfície de conversa — e então o chip entra e o modal espera |
| **(c)** | Emendar o `ADR-0020`. É decisão de dono, não minha |

**Recomendação: (a).** O Kuatiá não tem IRIS para acessar; um launcher sem destino é promessa
visível sem entrega. Quando a Fase A subir, a pele vem junto e não há o que adaptar.

## O que ENTROU, e por que pode entrar

A **sidebar colapsável** foi portada e está no ar. Ela é navegação do produto, não aparência da
IRIS — nenhum ADR a padroniza, e o Kuatiá tem design system próprio e documentado. O que veio do
QuickCash é o comportamento: 256/76 px, alternador, nasce fechada a cada carregamento, e o ícone
sustenta a orientação quando o rótulo some.

*Registrado em 2026-08-11.*
