---
name: tripac-imoveis-site
description: Tudo o que se sabe do site TRIPAC IMÓVEIS e da captação pelo celular — arquitetura, as regras que não se quebram (a separação público/interno e a proibição absoluta de material bancário), o estado de cada parte, os bugs já corridos e suas lições, como testar com Postgres local, o deploy no Render e o que depende de decisão do Rone. Use sempre que o trabalho tocar o repositório site-tripac-negocios-imobiliariarios, a captação de imóvel, o site público, a área interna, o banco de dados do site ou o deploy dele. Não vale para o SIGI de mesa (Python/Tkinter), que é outro sistema.
---

# TRIPAC IMÓVEIS — o site e a captação

Escrito em 25/09/2026, quando o Rone pediu foco total no SIGI até o dia 02 e
marcou a volta ao site para **10/10/2026**. Isto existe para que nada do que já
foi aprendido precise ser perguntado outra vez.

Repositório: `The3dig/site-tripac-negocios-imobiliariarios`, branch `main`.
Último commit desta fase: `3816c56`.

## São TRÊS sistemas, e eles não se misturam

| Sistema | O que é | Onde |
|---|---|---|
| **TRIPAC IMÓVEIS** | site público + captação pelo celular | este repositório (Node/Express/Postgres) |
| **SIGIimob** | o ERP da imobiliária | repositório `The3dig/SIGI` (Python/Tkinter) |
| **SIGIintegração** | fala com o Banco Inter | dentro do SIGI, em `bancos/inter/` — **NÃO TOCAR** |

### REGRA ABSOLUTA (palavras do Rone)

O TRIPAC IMÓVEIS **jamais** pode receber, armazenar ou expor: certificado do
Banco Inter, chave privada, client secret, token bancário, credencial bancária,
arquivo de certificado, função de emissão ou cancelamento de cobrança. Nada de
endpoint para certificado. Nada de Banco Inter no site. Nada de "atalho
temporário".

Conferido em 25/09/2026 e **verdadeiro**: nenhuma ocorrência em nenhum arquivo,
e nenhum `.env`/`.pem`/`.p12`/`.pfx` em nenhum commit do histórico. Antes de
qualquer entrega, repetir a conferência:

```bash
grep -rniE "client_secret|\.pfx|\.p12|\.pem|token_banc|boleto|certificad" \
  --include="*.js" --include="*.json" --include="*.yaml" . --exclude-dir=node_modules
git log --all --name-only --pretty=format: | sort -u | grep -iE "\.env$|\.pem|\.p12|\.pfx|cert"
```

A ponte com o SIGIimob, quando existir, é **num sentido só**: o SIGIimob **puxa**
do site o que foi captado. O site continua sem saber que existe banco.

## A regra que sustenta o resto: público é lista, não peneira

`lib/modelo.js` tem `CAMPOS_PUBLICOS` e `CAMPOS_INTERNOS`, e
`paraOPublico(linha, fotos)` monta o objeto **campo por campo, pelo nome**.

**Isto é de propósito e não se troca por uma peneira** (`delete interno`,
`omit`, blacklist): campo interno novo não vaza por esquecimento, porque só sai
quem estiver escrito na lista pública. Endereço completo, proprietário,
telefone, e-mail, autorização, validade, comissão, captado_por, exclusividade e
observações **nunca** saem em rota pública nenhuma.

Toda rota pública chama `paraOPublico()`. Nenhuma devolve `linha` cru. Se algum
dia uma precisar de campo novo no site, o campo entra em `CAMPOS_PUBLICOS` — e
essa é uma decisão, não um detalhe.

**Cadastrar um imóvel NÃO significa colocá-lo no site.** Os estados são
`RASCUNHO`, `REVISAO`, `PUBLICADO`, `PAUSADO`, `ARQUIVADO`, e só `PUBLICADO`
aparece. `/imovel/:codigo` responde 404 para o que não está no ar, e a foto de
imóvel não publicado responde 404 para quem não está logado.

## O mapa do código

```
server.js            24 rotas: público, login, área interna, APIs, upload
lib/db.js            Pool do pg, o esquema (CREATE TABLE IF NOT EXISTS na subida)
lib/modelo.js        público × interno, limpeza de campo, estados, moeda
lib/auth.js          scrypt, semente do admin, exigirLogin, exigirPerfil
lib/html.js          as páginas, string com e() em todo valor (sem motor de template)
public/captacao.js   a captação em 7 passos (415 linhas, sem framework)
public/estilo.css    marrom #6E5446 / creme #FAF7F2 / dourado, feito para o celular
render.yaml          Blueprint: serviço web + banco
docs/AUDITORIA.md    a auditoria A–H de 25/09/2026
docs/BACKUP.md       cópia de segurança, com o restauro ENSAIADO
docs/BANCO.md        as opções de banco definitivo (decisão pendente, com prazo)
```

Seis tabelas: `usuarios`, `imoveis` (`publico` e `interno` em JSONB, mais
`historico`), `fotos` (`conteudo BYTEA`), `contatos`, `auditoria`, `sessoes`.

## A captação pelo celular — o que o Rone pediu e como ficou

Ele nunca fez captação: *"eu nunca fiz captação e o app me ajudaria muito
pedindo endereço, fotos, e ficando tudo no mesmo lugar"*. Então a tela **pergunta
na ordem em que se anda pelo imóvel**, em 7 passos:

Proprietário → Imóvel → Valores → Características → Fotos → Captação (interno)
→ Revisar.

O que está resolvido e por quê:

- **Salva sozinho a cada 900 ms**, com o aviso na tela em três estados:
  *Salvando… / Salvo / Falha ao salvar — tentar novamente*. Captação perdida por
  toque errado é captação refeita.
- **Rascunho no próprio aparelho** (`localStorage`): se a internet cair no meio
  do imóvel — e cai —, o trabalho continua e sobe depois.
- **Fotos da câmera ou da galeria**, várias de uma vez, comprimidas **no
  celular** antes de subir: `createImageBitmap(file, {imageOrientation:
  "from-image"})` → canvas de 1600 px → JPEG 0,82. O `imageOrientation` é o que
  impede a foto de subir de lado (EXIF); sem ele, metade das fotos de iPhone
  deita.
- Miniatura, apagar, reordenar, **escolher a capa**. Apagar a capa promove a
  primeira restante — imóvel publicado sem capa fica sem cartão no site.
- Cada bloco interno diz na tela **"nada daqui vai para o site"**. É o que faz
  quem preenche confiar no que está digitando.

## As fotos moram no banco, e isso é decisão, não descuido

`fotos.conteudo BYTEA`. Motivo: **no Render o disco do serviço é trocado a cada
deploy** — foto em disco sumiria no deploy seguinte, que é exatamente o que não
pode acontecer com uma captação. O banco é o único armazenamento persistente
que o plano garante.

O preço disso: a foto comprimida dá 150–400 KB, e **o espaço do banco é o
recurso escasso** (~480 MB com 200 imóveis a 8 fotos). Quando doer, tirar as
fotos do banco é trabalho de verdade: hoje a leitura e a gravação estão nas
rotas do `server.js` (`POST /interna/api/captacao/:id/fotos` e `GET /fotos/:id`),
**não** num módulo. O comentário do `lib/db.js` promete um `lib/fotos.js` que
**não existe** — juntar as fotos nele é o primeiro passo de qualquer mudança de
armazenamento, e é pequeno.

## Segurança: o que está feito, e as regras que valem para o que vier

- **Autorização é no servidor.** `app.use("/interna", auth.exigirLogin)` cobre
  todas as rotas internas, inclusive as de API. **Nunca** esconder botão no
  frontend e chamar isso de permissão.
- Senha com **scrypt** e sal por usuário; nada de senha em texto.
- Sessão em tabela do Postgres (sobrevive a deploy), cookie `httpOnly`,
  `sameSite=lax`, `secure` em produção, 12 h, e **regenerada no login** (não dá
  para fixar sessão).
- Upload: só JPEG/PNG/WebP e **confere os bytes mágicos** (`pareceImagem`) — não
  confia no que o navegador declara. 12 MB por arquivo, 12 por envio.
- Helmet com CSP sem script de fora e **sem `<script>` embutido** (é por isso que
  `public/captacao.js` é arquivo, e não script na página).
- `lib/html.js` passa `e()` em **todo** valor. Conferido com
  `?erro=<script>alert(1)</script>`: sai escapado.

## O registro (`auditoria`) e o que ele NÃO guarda

Guarda: `LOGIN`, `LOGIN RECUSADO`, `ESTADO` (com antes/depois), `PRECO` (aluguel,
venda, condomínio, IPTU, com antes/depois), `FOTO EXCLUIDA`, `SENHA TROCADA`,
`SENHA RECUSADA` — com quem, quando e IP.

Não guarda senha, nem o corpo inteiro do formulário, nem uma linha por tecla
digitada: **ruído ninguém lê**. E falha de registro **nunca** derruba a ação —
o registro é testemunha, não é guarda (`registrar()` engole o erro e loga).

É o mesmo princípio do SIGI (`base.AVISOS_VISTOS`): **o programa guarda o fato,
a conclusão é de quem lê.**

Falta tela para ler a auditoria. Hoje só se lê por SQL.

## Os bugs que já aconteceram, e a lição de cada um

1. **Despublicava em silêncio.** Uma gravação sem `status` no corpo fazia
   `limparEstado` cair para `RASCUNHO`, e o imóvel saía do ar sem ninguém mandar
   e sem nada aparecer na tela. Conserto: `limparEstado(valor, atual)` preserva
   o estado atual quando o novo não é válido. **Lição: valor ausente não é valor
   inválido, e nunca deve virar o padrão mais destrutivo.**
2. **O limite de envios deixava passar um a mais.** Com `ate: agora`, o primeiro
   pedido não abria janela nenhuma e a contagem só começava no segundo — 9
   envios onde a regra dizia 8, 11 tentativas de senha onde ela dizia 10.
   **Lição: janela de tempo começa no primeiro pedido; conferir limite contando
   de verdade, não lendo o código.**
3. **`ADMIN_SENHA` era a única senha possível.** Trocar senha significava mexer
   em variável de ambiente num painel na nuvem. Conserto: `/interna/senha`,
   exigindo a atual. A semente **não sobrescreve** usuário existente, então a
   variável deixa de valer — e por isso a tela manda apagá-la do Render.
4. **`plan: starter` no `render.yaml` derrubou o deploy** com *"Payment
   Information Required"*. Os planos gratuitos são `plan: free` nos dois
   serviços. **Lição: plano é escolha do Rone, não default meu.**
5. **`apagarFoto` usava o `event` global** e apagava a errada em alguns
   navegadores. Passar o botão explicitamente.

## Como testar de verdade (sem depender do Render)

Este contêiner **não alcança** `onrender.com` nem as APIs de Render/Vercel/
Supabase (o proxy devolve 403 no CONNECT). Então **não se verifica deploy daqui**
— quem confirma que subiu é o Rone. O que se faz aqui é testar com Postgres
local, e isso funciona bem:

```bash
# subir um Postgres 16 local, porta 5433, socket em /tmp
/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/teste -U postgres
/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/teste \
  -o "-p 5433 -k /tmp -c listen_addresses=" -l /tmp/pg.log start
createdb -h /tmp -p 5433 -U postgres tripac

# subir o site em cima dele
DATABASE_URL="postgresql://postgres@/tripac?host=/tmp&port=5433" \
SESSION_SECRET=teste-segredo-longo-1234567890 \
ADMIN_EMAIL=teste@tripac.local ADMIN_SENHA=senha-de-teste-123 \
PORT=3011 node server.js
```

Depois, com `curl -c/-b` guardando o cookie: login certo e errado, PUT na
captação, upload de foto, publicar, e conferir **no SQL** que a linha mudou.
Testar a regra de visibilidade pedindo a foto **anônimo** (404) e **logado**
(200). Foi assim que os quatro bugs acima apareceram.

**Não usar `pkill -f "node server.js"`**: o padrão casa com o próprio shell do
agente e mata a sessão. Usar `pkill -f "[n]ode server.js"` — e nem isso quando o
**mesmo comando** também contém o texto `node server.js` (um `nohup node
server.js` na linha seguinte, um heredoc): aí o `[n]` casa com o próprio shell
de novo. O seguro é guardar o número do processo (`echo $! > /tmp/site.pid`) e
matar por ele.

**Confira que o servidor NOVO subiu.** Em 25/09/2026, um servidor antigo ficou
preso na porta 3011; o novo morria com `EADDRINUSE` e o velho respondia no lugar
dele — duas comparações "antes × depois" deram iguais porque comparavam o código
velho com ele mesmo. Depois de subir, `kill -0 $(cat /tmp/site.pid)`.

Para contar consultas por página: `ALTER SYSTEM SET log_statement='all'` no
Postgres local e contar `LOG:  execute` no log entre duas visitas.

## Cópia de segurança: já ensaiada, e a regra é dele

*"Backup que nunca foi restaurado em teste não deve ser considerado
suficiente."* Então `docs/BACKUP.md` traz o ensaio **executado**, com o resultado
escrito: dump, restauro em banco novo, contagem das 5 tabelas, **md5 das fotos
byte a byte** e o programa subindo em cima da cópia. Repetir o ensaio uma vez
por mês e **depois de toda mudança de esquema**.

Mudança de banco é sempre **aditiva**. Nunca: dropar tabela de produção para
recriar, apagar dado para resolver incompatibilidade, zerar banco
automaticamente, sobrescrever produção com semente.

## O que está pendente quando voltarmos (10/10/2026)

**O risco nº 1 não é bug, é prazo:** o banco gratuito do Render **é apagado** por
volta de **25/10/2026**, com as fotos dentro dele. `docs/BANCO.md` põe as opções
na mesa (recomendação: Render pago no plano mínimo, porque nada muda de lugar —
só a `DATABASE_URL`). **A decisão é dele, e não migro sem autorização.**

Fases, na ordem combinada: **2** público (filtros no banco, paginação, `og:` para
o link ficar bonito no WhatsApp, `sitemap`/`robots`, botão de WhatsApp, `alt` nas
fotos, matar o N+1 do `publicados()`), **3** comercial (lead com responsável e
situação, visita, painel do dia), **4** área interna (criar usuário, ligar
`exigirPerfil`, tela de auditoria), **5** "pronto para publicar" na linha do
`emissao.py` do SIGI, **6** LGPD/acessibilidade/log/testes, **7** a ponte com o
SIGIimob.

**Fase 2, o que era "sem risco" — feito em 25/09/2026**, um commit por item,
cada um conferido contra Postgres local:

| Commit | O quê |
|---|---|
| `8678aad` | fim do N+1: fotos de todos os publicados numa consulta (`fotosDeVarios`); 41 consultas com 40 imóveis viraram 2, e as 10 respostas públicas saem byte a byte iguais |
| `27cad09` | `alt` nas fotos (`nomeDoImovel`); a miniatura da lista interna fica com `alt=""` de propósito, o título está ao lado |
| `0dacf39` | `og:`/Twitter e `canonical`: o link no WhatsApp sai com capa, título e "R$ 2.500,00/mês · 2 dorm. · 72 m² · bairro"; `SITE_URL` fixa o domínio |
| `7b5c5c4` | `/sitemap.xml` (só PUBLICADO), `/robots.txt`, `noindex` na interna |
| `bfa730d` | botão de WhatsApp: flutuante no público e "sobre este imóvel" na página dele, com código e nome na mensagem; `WHATSAPP_NUMERO` |

**Decidido pelo Rone na conversa de 25/09/2026:** o WhatsApp é **(12)
98840-1131** (padrão no código, `WHATSAPP_NUMERO` troca), o e-mail de contato é
`contato@tripacadvogados.com.br`, e o **logo** existe (casa com "TA" +
"TRIPAC Negócios Imobiliários", marrom sobre creme) — o arquivo foi mandado na
conversa, falta trazer para `public/`. E o site é trabalhado **só neste
repositório**: a pasta `site/` que chegou a nascer num branch do SIGI
(`claude/wizardly-dirac-5zogw4`, versão Cloudflare) foi superada por este.

Continua de pé: **`exigirPerfil()` está escrito e nunca é chamado** (a estrutura
de perfis existe, a regra não). E a lista da área interna (`GET /interna`) ainda
faz uma consulta de foto por captação — o mesmo N+1, do lado de dentro; o
conserto é o mesmo `fotosDeVarios`.

**Não há nenhum teste automatizado.** Foi tudo conferido na mão. O primeiro teste
é dívida da Fase 1.

Esperando decisão dele: o banco definitivo (com prazo), apagar `ADMIN_SENHA`,
quantas pessoas vão usar e quem é corretor, cidades e bairros dos filtros, se publicar exige autorização
assinada, e por quanto tempo o lead fica guardado.

## Como ele fala, e o que ele valoriza

Escreve rápido, sem acento e com erro de digitação, e às vezes junta três
assuntos numa frase — vale reler antes de responder. Reconhece trabalho quando
vê (*"lindo demais!!!!"*, *"funcionou valeu"*, *"ficou ótimo"*), e o que ele
mais cobra é **não inventar** e **não esconder o que falta**: contador honesto,
aviso em uma linha, recusa que diz onde se conserta. Idioma de tudo — código,
commit, documento, tela — é português.
