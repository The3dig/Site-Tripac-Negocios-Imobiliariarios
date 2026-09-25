# O banco definitivo: as opções, o que cada uma custa e o que muda no código

> **Nada foi migrado.** Este documento existe para você escolher. A migração só
> acontece com a sua autorização, e o caminho está no fim.

## O problema, em uma frase

O banco de hoje é o **plano gratuito do PostgreSQL no Render**, e o plano
gratuito do Render **expira 30 dias depois de criado** — ele não fica devagar,
ele **é apagado**. Criado em 25/09/2026, o prazo cai por volta de **25/10/2026**.

E as fotos moram dentro dele (`fotos.conteudo`, `bytea`). Perder o banco é
perder as captações e as fotos juntas. Por isso a escolha do banco é a decisão
mais urgente que sobrou da Fase 1.

## Quanto espaço as fotos vão pedir

O programa comprime cada foto no celular antes de subir (1600 px, JPEG 0,82),
o que dá **150 KB a 400 KB por foto**. Com 8 fotos por imóvel:

| Imóveis | Fotos | Espaço (a 300 KB) |
|---|---|---|
| 50 | 400 | ~120 MB |
| 200 | 1.600 | ~480 MB |
| 500 | 4.000 | ~1,2 GB |
| 1.000 | 8.000 | ~2,4 GB |

**É isso que decide o plano**, não o número de cadastros. Um banco de 0,5 GB
aguenta a carteira de hoje e trava por volta de 200 imóveis com foto.

## As opções

Os preços abaixo são os que estavam anunciados quando isto foi escrito.
**Confirme no painel antes de pagar** — eu não consigo abrir esses sites deste
ambiente (o proxy bloqueia `render.com`, `supabase.com` e afins), então não
verifiquei nenhum deles agora.

### 1. PostgreSQL pago no Render — o caminho mais curto

- **Preço:** a partir de ~US$ 6/mês (o plano básico de 256 MB de RAM), com
  espaço em disco cobrado à parte e ampliável.
- **Cópia de segurança:** cópia diária feita pelo Render nos planos pagos, com
  retenção de alguns dias, e recuperação a um ponto no tempo nos planos maiores.
- **Região:** escolhida na criação. **Não muda depois.** Se houver São Paulo,
  é ela; sem isso, Oregon (a distância custa uns 150 ms por consulta, que o
  celular sente na captação).
- **O que muda no código:** **nada.** Só a variável `DATABASE_URL`.
- **Como trocar:** o banco novo e o serviço ficam no mesmo painel; o Render
  liga os dois por variável de ambiente.
- **Contra:** é o mais caro dos três para pouco espaço, e a cobrança é em dólar.

### 2. Neon — PostgreSQL de graça que não expira

- **Preço:** faixa gratuita com espaço na ordem de 0,5 GB e sem prazo de
  validade; planos pagos a partir de ~US$ 19/mês.
- **Cópia de segurança:** recuperação a um ponto no tempo dentro de uma janela
  (curta na faixa gratuita).
- **Detalhe que importa:** o banco **hiberna** quando ninguém usa, e a primeira
  consulta depois disso demora alguns segundos. Somado ao serviço do Render, que
  também hiberna no plano gratuito, a primeira tela da manhã fica lenta.
- **O que muda no código:** **nada** — `lib/db.js` já liga SSL para `neon.tech`.
- **Contra:** 0,5 GB é pouco para foto; vira aperto por volta de 200 imóveis.

### 3. Supabase — PostgreSQL de graça, com painel

- **Preço:** faixa gratuita de ~0,5 GB de banco e ~1 GB de arquivos; pago a
  partir de ~US$ 25/mês.
- **Cópia de segurança:** diária nos planos pagos; na faixa gratuita a cópia é
  sua (o `pg_dump` de `docs/BACKUP.md`).
- **Detalhe que importa:** projeto gratuito **é pausado depois de cerca de uma
  semana sem uso** e precisa ser religado à mão no painel.
- **Vantagem específica:** tem armazenamento de arquivos separado do banco.
  **É o único caminho aqui que tira as fotos de dentro do banco** — e é essa a
  troca que faz o espaço deixar de ser problema.
- **O que muda no código:** nada para o banco. Tirar as fotos do banco, isso
  sim, é trabalho: hoje a leitura e a gravação das fotos estão nas rotas do
  `server.js` (`POST /interna/api/captacao/:id/fotos` e `GET /fotos/:id`), e não
  num módulo só. O comentário do `lib/db.js` promete um `lib/fotos.js` que
  **ainda não existe** — juntar as fotos nesse módulo é o primeiro passo de
  qualquer mudança de armazenamento, e é pequeno.

### 4. Ficar no gratuito do Render — não é opção

Só cabe como "não decidi ainda", e tem prazo: o banco é apagado por volta de
**25/10/2026**. Se a decisão passar dessa data, a captação do mês vai embora.

## A recomendação, se você quiser uma

**Render pago, plano mínimo, com o espaço que couber no orçamento.** Motivo:
é a única opção em que **nada** muda de lugar — mesmo painel, mesma variável,
cópia automática incluída, sem hibernação e sem religar projeto na mão. Custa
mais por gigabyte, e o que se compra com a diferença é não ter surpresa na
segunda-feira.

Se o custo em dólar pesar, o segundo melhor é **Neon**, aceitando que as fotos
vão exigir armazenamento separado antes dos 200 imóveis.

## Como a troca acontece, quando você autorizar

Na ordem, e nenhum passo apaga nada:

1. `pg_dump` do banco de hoje (`docs/BACKUP.md`), com as fotos.
2. Criar o banco novo e restaurar **nele** — nunca em cima do de hoje.
3. Conferir na cópia: contagens, `md5` das fotos, o programa subindo e o login
   funcionando (é o ensaio de `docs/BACKUP.md`, passo por passo).
4. Só então trocar `DATABASE_URL` no serviço do Render e reiniciar.
5. **Deixar o banco antigo de pé por alguns dias**, sem apagar, até você dizer
   que está bom.

O esquema é criado na subida (`CREATE TABLE IF NOT EXISTS`), então um banco
vazio também funciona — mas aí você começa sem as captações que já existem.
Não é o que se quer.

## O que eu não faço sozinho

- Não migro sem a sua autorização.
- Não apago, não recrio e não zero nenhuma tabela de produção para resolver
  incompatibilidade.
- Não escolho plano pago no seu cartão.
