# Aplicativo Financeiro Multiempresa — Paraguai

Aplicativo financeiro SaaS da SoftHam: cada cliente é um grupo (`tenant`) com N empresas. Os dados financeiros usam tabelas compartilhadas, isolamento por linha (RLS) e permissões por empresa.

## Moedas

O Grupo Pinheirão opera em `PYG`, `USD` e `BRL`.

- Cada caixa, conta a pagar/receber, baixa e movimento registra a própria moeda.
- PYG não possui casas decimais; USD e BRL usam centavos.
- Valores são armazenados como `BIGINT` em unidades menores, nunca `float`.
- Relatórios não somam moedas diferentes; uma consolidação convertida exige cotação e critério explícito.

## Login e banco Master SoftHam

O Master é o porteiro. O login recebe documento principal (CNPJ/RUC), nome, sobrenome e senha.

1. A API resolve a empresa ativa no Master pelo documento.
2. O Master aponta internamente o banco e o schema de login do grupo.
3. A validação ocorre em `user_nomes` no schema do tenant — por exemplo, `pinheirao.user_nomes`.
4. O `empresa.id` do Master é o mesmo `tenant_id` financeiro e é aplicado ao RLS em cada consulta.
5. A sessão central fica em `auth.sessions` para o produto `financeiro-paraguai`.

O diretório legado `user_nomes` permanece compatível com os outros produtos. A troca de senha legada para hash deve ser coordenada antes da remoção do campo atual.

## Operações implementadas

- Empresas, plano de contas inicial, centros de custo, clientes e fornecedores.
- Contas a pagar e receber com parcelas, baixa parcial, juros/desconto e estorno append-only.
- Livro de caixa, caixas/bancos e transferências com dois movimentos vinculados.
- Dashboard, fluxo de caixa por empresa e painel consolidado exclusivo do administrador do tenant.
- Triggers de integridade que bloqueiam caixa, moeda ou empresa divergentes entre movimento e baixa.

Todas as consultas de negócio usam `withTenantContext`, que fixa `app.tenant_id` e `app.user_id` na transação. O RLS valida tanto o grupo quanto o acesso à empresa.

## Rotas principais

- `POST /api/v1/cuentas-pagar`, `POST /api/v1/cuentas-pagar/bajas`, `POST /api/v1/cuentas-pagar/bajas/:id/reversion`
- `POST /api/v1/cuentas-cobrar`, `POST /api/v1/cuentas-cobrar/bajas`, `POST /api/v1/cuentas-cobrar/bajas/:id/reversion`
- `GET|POST /api/v1/libro-caja/cajas`, `POST /api/v1/libro-caja/movimientos`, `POST /api/v1/libro-caja/transferencias`
- `GET /api/v1/reportes/dashboard?empresaId=…`, `GET /api/v1/reportes/flujo-caja?...`, `GET /api/v1/reportes/consolidado`

## Verificação

Em `backend-financeiro`, execute `npm run migrate`, `npm run build` e `npm test`. Em `frontend-financeiro`, execute `npm run build`.
