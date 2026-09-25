# Site TRIPAC Negócios Imobiliários

Site público (imóveis para alugar e comprar) e **área interna** de captação, feita
para ser usada **do celular, dentro do imóvel**: sete passos, fotos pela câmera,
rascunho que salva sozinho e publicação em um toque.

Primeira versão, de 25/09/2026. O objetivo dela é um só: sair para captar um
imóvel levando só o telefone.

## O que já funciona

- **Site público**: início, `/alugar`, `/comprar`, página do imóvel com galeria,
  `/anuncie` e pedido de visita. Só aparece imóvel com status `PUBLICADO`.
- **Área interna** (`/interna`), inteira atrás de login: lista das captações,
  nova captação, edição, fotos e publicação.
- **Captação pelo celular**: Proprietário → Imóvel → Valores → Características →
  Fotos → Captação → Revisar. Cada passo salva sozinho (≈1 s depois de você
  parar de digitar) e o rascunho fica também no aparelho, para o caso de a
  internet cair.
- **Fotos**: câmera ou galeria, várias de uma vez, miniatura na hora, excluir,
  reordenar e escolher a capa. A imagem é reduzida no próprio celular
  (1600 px, JPEG) antes de subir, e a orientação do EXIF é corrigida.
- **Estados**: `RASCUNHO`, `REVISAO`, `PUBLICADO`, `PAUSADO`, `ARQUIVADO`.
  **Cadastrar não é publicar**: só o que está `PUBLICADO` aparece no site.
- **Dados internos nunca saem**: endereço completo, proprietário, telefone,
  e-mail, autorização, validade, comissão, exclusividade e observações ficam no
  bloco `interno`, que a API pública e as páginas públicas não leem
  (`lib/modelo.js`, função `paraOPublico`).
- **API pública**: `GET /api/imoveis` devolve só imóveis publicados e só campos
  públicos. É por aqui que o SIGI vai conversar com o site no futuro.

## Como publicar (Render, ~10 minutos)

1. No Render: **New → Blueprint**, aponte para este repositório. O
   `render.yaml` cria o site (`site-tripac`) e o banco (`tripac-banco`).
2. Preencha, no painel, as três variáveis marcadas como "sync: false":
   - `ADMIN_EMAIL` — o e-mail do primeiro administrador;
   - `ADMIN_SENHA` — a senha dele (use uma senha forte; ela é lida uma única
     vez, na primeira subida, e guardada como hash scrypt);
   - `ADMIN_NOME` — o nome que aparece na tela.
   `SESSION_SECRET` o próprio Render gera, e `DATABASE_URL` vem do banco.
3. Deploy. O endereço sai como `https://site-tripac.onrender.com` (ou o domínio
   que você ligar depois).
4. Entre em `/interna/login` com o e-mail e a senha do passo 2. **Troque a senha
   depois** (e apague `ADMIN_SENHA` do painel — o usuário já existe).

A cada `git push` na `main`, o Render refaz o deploy sozinho. **O banco não é
tocado no deploy**: os imóveis, as fotos e os contatos continuam lá.

### Plano grátis x plano pago

O `render.yaml` está nos **planos gratuitos**, para começar sem cartão. Duas
consequências, e as duas importam:

1. o site **dorme** depois de ~15 minutos sem acesso, e a primeira abertura
   demora ~50 segundos;
2. o **Postgres gratuito expira em 30 dias** — depois disso o Render apaga o
   banco, com as captações e as fotos dentro.

Para uso de verdade, troque as duas linhas marcadas no `render.yaml`
(`plan: starter` no site, `plan: basic-256mb` no banco) e faça o deploy de novo:
são ~US$ 13/mês e o banco continua o mesmo, sem perder nada.

**Alternativa sem custo e sem prazo:** criar o banco no
[Neon](https://neon.tech) (gratuito, sem expirar) e colar a `DATABASE_URL` dele
no painel do Render, deixando só o site no Render grátis.

## Onde ficam os dados

| O quê | Onde |
|---|---|
| Imóveis, captações, contatos, usuários, sessões | PostgreSQL do Render (`tripac-banco`) |
| Fotos | no mesmo PostgreSQL, na tabela `fotos` (coluna `bytea`) |

As fotos ficam no banco **de propósito**: o disco do serviço web é trocado a cada
deploy, então foto em disco sumiria no deploy seguinte. Uma foto comprimida pesa
~200–400 KB. Quando o volume crescer, a troca para S3/R2 mexe só no lugar onde a
foto é lida e gravada (`server.js`, rotas `/fotos`).

## Backup

```bash
# baixa tudo, inclusive as fotos
pg_dump "$DATABASE_URL" --no-owner --format=custom --file=tripac-$(date +%F).dump

# restaurar
pg_restore --clean --no-owner --dbname "$DATABASE_URL" tripac-2026-09-25.dump
```

No painel do Render, o banco também tem backup automático diário (planos pagos).
Guarde uma cópia do dump fora do Render uma vez por semana.

## Rodar na sua máquina

```bash
npm install
cp .env.example .env     # preencha DATABASE_URL, SESSION_SECRET, ADMIN_*
node server.js           # http://localhost:3000
```

## O que ainda não está aqui

- Perfis além de ADMIN: a coluna `perfil` já existe e o login já lê; falta a
  tela de convidar CORRETOR.
- Integração com o SIGI: a API pública já existe; a troca de dados
  administrativos (contratos, boletos, repasses) **não** entra neste site.
- Domínio próprio e e-mail de aviso quando chega um contato.
