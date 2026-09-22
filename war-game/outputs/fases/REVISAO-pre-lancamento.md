# Revisão pré-lançamento — Kuatiá

**Data:** 2026-08-11 · **Postura:** adversarial (tentar refutar, não confirmar)
**Método:** auditoria, não war game — `PLY-004` é explícito que sistema quase pronto se audita.

> ⚠️ **Limitação que precisa constar:** boa parte do que foi revisado aqui **eu escrevi hoje**.
> Auto-revisão é a forma mais fraca de verificação. O que compensa parcialmente é que quase tudo
> abaixo foi provado **por execução**, não por leitura — mas um revisor independente ainda acharia
> coisa que eu não acho.

---

## O buraco que esta revisão fechou

**Nenhuma baixa jamais havia sido registrada neste sistema.** Os triggers de integridade — a
melhor peça do protótipo — nunca tinham disparado contra uma linha real. Build verde e suíte
verde não diziam nada sobre eles.

Exercitei as guardas dentro de uma transação descartada, tentando **furar** cada regra:

| Tentativa | Resultado |
|---|---|
| Soma das parcelas: 333.334 + 333.333 + 333.333 | ✅ fecha em 1.000.000 |
| Baixa com efetivo **sem** caja nem movimento | ✅ recusado |
| Movimento com **valor diferente** do efetivo | ✅ recusado |
| Movimento numa caja de **outra moeda** | ✅ recusado |
| Baixa parcial de 200.000 numa parcela de 333.334 | ✅ parcela fica aberta com 133.334 |
| Pagar 200.000 num saldo de 133.334 | ✅ recusado |
| `UPDATE` numa baixa | ✅ recusado (append-only) |
| `DELETE` numa baixa | ✅ recusado (append-only) |
| Estorno devolve o saldo | ✅ volta a 333.334, **e a baixa original continua no livro** |
| Estornar a mesma baixa duas vezes | ✅ recusado |
| Saldo = inicial + créditos − débitos | ✅ 500.000 + 300.000 − 100.000 = 700.000 |
| Movimento com valor **negativo** | ✅ recusado |
| Transferência gera 2 movimentos amarrados | ✅ 2 movimentos, líquido zero |

**As regras de dinheiro do banco seguram.** Isso agora é E3 por execução, não E2 por leitura.

---

## 🔴 Achado — a validação de data existe só na aplicação

```
INSERT ... fecha = '0006-01-01'   →  o banco ACEITOU
```

`assertBusinessDate` recusa ano fora de 2000–2100, mas mora **só no TypeScript**. Medido: não há
uma única `CHECK` de faixa de data em nenhuma das 22 tabelas do tenant.

**Por que isso é assimetria e não detalhe:** as regras de dinheiro *estão* no banco — a baixa não
excede saldo, o movimento casa com a caja, o livro é append-only. A regra de data, não. Qualquer
caminho que não passe pela rota Express — um script de importação, um `psql`, uma migration
futura, a importação de planilha que ainda vai ser construída — escreve lixo sem resistência.

O spec original nomeia exatamente esse incidente: *"alguém digitou '6' em vez de '2026' e o
registro ficou inutilizável por dois meses sem ninguém perceber"*. E fecha com *"Validar só na
tela. Regra de dinheiro se valida no backend também. Guarda de interface não é guarda."*

**Estado hoje:** nenhuma data suja no banco — a validação da aplicação segurou até agora.
**Correção:** `CHECK (fecha BETWEEN '2000-01-01' AND '2100-12-31')` nas colunas de data das
tabelas de negócio. É aditivo, barato, e fecha a assimetria.

---

## O que foi provado antes desta revisão, e continua valendo

| | Como foi provado |
|---|---|
| RLS aplicado de fato | tenant inexistente → 0 linhas em 5 tabelas, com papel `NOSUPERUSER NOBYPASSRLS` |
| Isolamento por schema | 22 tabelas em `pinheirao`, 4 comuns em `public` |
| Provisionar tenant novo | schema criado do zero, comparado objeto a objeto: 0 diferenças |
| Roteamento por produto | documento do banco `basesales` → 401 |
| Senha em bcrypt | legado migra no primeiro login; legado corrompido + hash válido → 200 |
| Perímetro | 11ª tentativa → 429 · origem estranha sem CORS · helmet ativo |
| Caminho do usuário | login + 11 rotas autenticadas → 200 |

---

## O que esta revisão NÃO cobriu — e quem disser que cobriu está errado

- **A tela num navegador real.** Li componentes; não medi em viewport. A Lei 2 do `PLY-008` é
  clara: classe no código não é comportamento na tela. Responsividade, truncamento, contraste e
  o console do navegador continuam **não verificados**.
- **Volume.** As listas não paginam e o banco tem 43 linhas. Nada aqui prova o comportamento com
  dois anos de lançamento.
- **Conteúdo dos arquivos exportados.** Os testes provam que o XLSX começa com `PK` e o PDF com
  `%PDF` — provam que é um arquivo, não que os números estão certos.
- **Concorrência.** Dois usuários dando baixa na mesma parcela ao mesmo tempo. Há `FOR UPDATE` na
  rota e o trigger recalcula o aplicado, então há motivo para acreditar que segura — mas
  **acreditar não é provar**, e isso não foi testado.

---

## Veredito

**O núcleo financeiro está pronto para lançar. O produto, não ainda** — e o que falta não é
qualidade de código, é operação.

### Bloqueia o lançamento

| # | O quê | Por quê |
|---|---|---|
| 1 | **TLS desligado** (`DATABASE_SSL=false`) | dado financeiro em claro contra host remoto. Medido por efeito: `pg_stat_ssl.ssl = false` |
| 2 | **`JWT_SECRET` herdado do SalesMasters** | segredo compartilhado entre produtos faz um token servir nos dois |
| 3 | **Chaves de IA por rotacionar** | removi do arquivo; só a rotação no provedor reduz exposição |
| 4 | **Sem importação de planilha** | o spec chama de requisito de sobrevivência. Carga inicial manual, uma conta por vez — é onde o cliente desiste |
| 5 | **Sem backup nem git no produto** | `T:\Financeiro` é espelho, não backup versionado |

### Não bloqueia, mas entra na primeira semana

CHECK de data no banco · cancelamento de conta · fluxo de caixa com saldo acumulado ·
paginação · dígito verificador do RUC · testes automatizados das guardas *(hoje: 12 unitários,
nenhum sobre dinheiro — o que provei acima foi manual e não roda de novo sozinho)*.

### Infra, com a infra

`L-05` pools por tenant × Pgpool compartilhado · `L-06` `.env` no nó fixo em vez do Pgpool.

---

## A recomendação

O caminho mais curto até um lançamento honesto tem **duas etapas**, nesta ordem:

1. **Operação** — itens 1, 2, 3 e 5 acima. São horas, não dias, e nenhum depende de código novo.
2. **Importação de planilha** — item 4. É o único que exige construção, e é o que decide se o
   cliente adota ou volta para a planilha.

Os demais podem entrar com o sistema já rodando, porque nenhum deles corrompe dado.

> **O que exatamente eu observei:** as guardas de dinheiro recusaram nove tentativas de furo, o
> isolamento devolveu zero linhas para tenant inexistente, e o caminho do login funcionou ponta a
> ponta. **O que eu não observei:** a tela num navegador, o sistema sob volume, e o comportamento
> com dois usuários simultâneos. O veredito acima vale exatamente até essa fronteira.
