# Cópia de segurança do TRIPAC IMÓVEIS

> **Cópia que nunca foi restaurada em teste não é cópia de segurança: é um
> arquivo.** O procedimento abaixo foi executado de verdade, e o resultado do
> teste está no fim deste documento.

## O que se perde se o banco se perder

Tudo. O banco é o **único** lugar onde estas coisas existem:

| Tabela | O que guarda | Existe em outro lugar? |
|---|---|---|
| `imoveis` | a captação: o que é público e o que é interno (endereço completo, proprietário, telefone, comissão, autorização) | **não** |
| `fotos` | **os bytes das fotos**, em `bytea` | **não** — não há disco, não há bucket |
| `contatos` | quem pediu visita e quem quis anunciar | **não** |
| `usuarios` | quem entra na área interna | a senha do primeiro admin sai de `ADMIN_SENHA`; depois da primeira troca, **não** |
| `auditoria` | quem fez o quê | **não** |
| `session` | sessões abertas | não importa: perder isso só obriga a entrar de novo |

As fotos ficam no banco de propósito (está escrito em `lib/db.js`): o disco do
serviço no Render é trocado a cada deploy. A consequência para a cópia de segurança é
que **o dump é grande e é o único backup das fotos**.

## Fazer a cópia

A URL de conexão externa está no painel do Render, no banco de dados, em
**Connections → External Database URL**. Ela contém a senha — trate como senha.

```bash
export URL_DO_BANCO='postgresql://usuario:senha@host.oregon-postgres.render.com/nome_do_banco'

# formato próprio do PostgreSQL (comprimido, restaura tabela a tabela)
pg_dump "$URL_DO_BANCO" -Fc -f "tripac-$(date +%Y%m%d-%H%M).dump"
```

Três coisas que fazem diferença:

1. **`-Fc` e não `.sql`.** O formato próprio comprime, guarda `bytea` sem
   inchar, e permite restaurar uma tabela só.
2. **A versão do `pg_dump` precisa ser igual ou mais nova que a do servidor.**
   `pg_dump` antigo contra servidor novo recusa. Confira com
   `psql "$URL_DO_BANCO" -tAc 'SHOW server_version'` e `pg_dump --version`.
3. **O arquivo tem dado pessoal** (proprietário, telefone, e-mail, endereço,
   quem pediu visita). Não deixe em pasta compartilhada aberta, não mande por
   e-mail e não suba para o GitHub. O `.gitignore` já barra `*.dump`.

### Só o essencial, sem as fotos (arquivo pequeno, para guardar todo dia)

```bash
pg_dump "$URL_DO_BANCO" -Fc --exclude-table-data=fotos --exclude-table-data=session \
  -f "tripac-sem-fotos-$(date +%Y%m%d).dump"
```

Serve para recuperar cadastro e contatos rápido. **Não substitui** o dump
completo: sem as fotos, a captação volta cega.

## Restaurar

### Num banco novo, para conferir (é isto que se faz no teste)

```bash
createdb tripac_restaurado
pg_restore -d tripac_restaurado --no-owner --no-privileges arquivo.dump
```

### Em cima de um banco que já existe (recuperação de verdade)

```bash
pg_restore -d "$URL_DO_BANCO_NOVO" --no-owner --no-privileges --clean --if-exists arquivo.dump
```

`--clean` apaga o que existe antes de recriar. **Nunca aponte isso para
produção sem ter certeza de que o dump é mais novo que o dado que está lá.** Em
dúvida: restaure num banco novo, confira, e só então troque a `DATABASE_URL` do
serviço no Render.

## O ensaio (fazer uma vez por mês, e depois de toda mudança de esquema)

```bash
pg_dump "$URL_DO_BANCO" -Fc -f /tmp/ensaio.dump
dropdb --if-exists ensaio && createdb ensaio
pg_restore -d ensaio --no-owner --no-privileges /tmp/ensaio.dump

# 1. as linhas voltaram todas?
for t in usuarios imoveis fotos contatos auditoria; do
  echo "$t: $(psql -d ensaio -tAc "SELECT count(*) FROM $t")"
done

# 2. as fotos voltaram BYTE A BYTE? (é o que um .sql mal feito estraga)
psql -d ensaio -tAc "SELECT id, md5(conteudo), octet_length(conteudo) FROM fotos ORDER BY id"

# 3. o programa sobe em cima da cópia?
DATABASE_URL="postgresql:///ensaio" SESSION_SECRET=qualquer-coisa-longa PORT=3012 node server.js
curl -s localhost:3012/health
```

O passo 3 é o que separa "o arquivo existe" de "eu consigo voltar a trabalhar".

## Resultado do ensaio feito em 25/09/2026

Executado contra PostgreSQL 16, com o programa desta versão:

```
dump: 14.927 bytes (-Fc)

contagens        origem → restaurado
  usuarios            1 → 1
  imoveis             1 → 1
  fotos               2 → 2
  contatos            8 → 8
  auditoria          10 → 10

fotos, md5 e tamanho:
  ft_75c0550edf95689e0c57  e0e057fae34074578a930afb549b6bb2  180
  ft_da22bc4154296e70e885  1f0e2ad819215fcbc9567611323dc683  179
  diff origem/restaurado: nenhuma diferença

programa em cima da cópia (porta 3012):
  /health                       {"ok":true,"banco":"ok","ms":1}
  login com a senha trocada     302 → /interna   (o hash voltou íntegro)
  /                             200
  /fotos/ft_75c0...  anônimo    404  (o imóvel estava PAUSADO — regra correta)
  /fotos/ft_75c0...  logado     200  image/png  180 bytes
```

Conferido: esquema, linhas, **bytes das fotos**, hash de senha e o programa
funcionando em cima da cópia.

## O que ainda NÃO está resolvido, e é decisão sua

- **Não há cópia automática.** O plano gratuito do banco no Render não faz
  cópia por conta dele. Hoje a cópia é este comando, rodado por uma pessoa.
  Enquanto for assim, **rode antes de cada dia de trabalho grande** e guarde o
  arquivo em dois lugares diferentes.
- **O banco gratuito do Render expira em 30 dias** — contados da criação. Isso
  não é backup, é prazo de validade: está em `docs/BANCO.md`.
- Automatizar (um `cron` no seu computador, um serviço do Render, ou a cópia
  paga do próprio banco) depende de qual banco você escolher. Quando escolher,
  o comando acima é o mesmo.
