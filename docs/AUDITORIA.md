# Auditoria do TRIPAC IMÓVEIS — 25/09/2026

Lida do repositório, não de memória: 1.558 linhas em `server.js`, `lib/` e
`public/`, 24 rotas, 6 tabelas. O que está escrito aqui como "existe" foi
exercitado contra PostgreSQL de verdade nesta sessão.

## A. O QUE JÁ EXISTE (funciona e está no ar)

**Site público**
- Home, `/alugar`, `/comprar` com busca por texto (bairro, cidade, tipo, título).
- Página do imóvel `/imovel/:codigo`, que responde **404 para o que não está
  PUBLICADO** — não existe link que mostre rascunho.
- `/anuncie` e formulário de pedido de visita, os dois gravando em `contatos`.
- `/api/imoveis` pública, **só campos públicos**.
- Fotos por `/fotos/:id`, com a regra certa: foto de imóvel não publicado só
  aparece para quem está logado (conferido: 404 anônimo, 200 logado).

**Área interna**
- Login obrigatório: `app.use("/interna", exigirLogin)` cobre **todas** as rotas
  internas, inclusive as de API. A autorização está no servidor, não em botão
  escondido.
- Senha com scrypt e sal por usuário; sessão em tabela do Postgres (sobrevive a
  deploy), cookie `httpOnly`, `sameSite=lax`, `secure` em produção, 12 h.
- Sessão **regenerada no login** (não dá para fixar sessão).
- Limite de 10 tentativas de senha por IP em 15 min, 8 envios/hora nos
  formulários públicos.
- **Trocar a própria senha** em `/interna/senha`, exigindo a atual.
- Lista de captações por estado e lista de contatos recebidos.

**Captação pelo celular** (`public/captacao.js`, 415 linhas)
- 7 passos: Proprietário → Imóvel → Valores → Características → Fotos →
  Captação interna → Revisar.
- Salvamento automático a cada 900 ms com aviso na tela, **e rascunho no próprio
  aparelho** se a internet cair.
- Fotos da câmera ou da galeria, várias de uma vez, com compressão no celular
  (1600 px, JPEG 0,82) e correção de orientação EXIF; miniatura, apagar,
  reordenar, escolher a capa.
- Estados RASCUNHO / REVISAO / PUBLICADO / PAUSADO / ARQUIVADO, com histórico de
  mudança de estado dentro do próprio imóvel.

**A separação público/interno** — a coisa mais importante e a que está mais
sólida: `modelo.paraOPublico()` é uma **lista do que sai**, não uma lista do que
esconde. Campo novo no interno não vaza por esquecimento; ele só sai se alguém
escrever o nome dele na lista pública. Endereço completo, proprietário,
telefone, e-mail, autorização, comissão, exclusividade e observações **nunca**
saem em nenhuma rota pública.

**Registro (auditoria)** — quem entrou, quem tentou entrar, quem mudou estado,
quem mudou preço (com antes e depois), quem apagou foto, quem trocou senha.

**Segurança de arquivo** — upload aceita só JPEG/PNG/WebP, **confere os bytes
mágicos** (não confia no que o navegador declara), 12 MB por arquivo, 12 por
envio. Helmet com CSP sem `script` de fora e sem `<script>` embutido.

**Operação** — `/health` que consulta o banco de verdade; `render.yaml`
descrevendo serviço e banco; `docs/BACKUP.md` com restauro **ensaiado**;
`docs/BANCO.md` com as opções de banco definitivo.

**A REGRA ABSOLUTA está cumprida, e foi verificada**: nenhuma ocorrência de
certificado, chave privada, client secret, token bancário, emissão ou
cancelamento de cobrança em nenhum arquivo do repositório, e nenhum `.env`,
`.pem`, `.p12` ou `.pfx` em nenhum commit do histórico. O site não sabe que o
Banco Inter existe.

## B. O QUE ESTÁ PARCIAL

| O que | Onde para |
|---|---|
| **Perfis ADMIN/CORRETOR** | `exigirPerfil()` está escrito em `lib/auth.js` e **nunca é chamado**. Hoje todo usuário é ADMIN e vê tudo. A estrutura existe, a regra não. |
| **Usuários** | Só o primeiro admin, nascido de `ADMIN_EMAIL`/`ADMIN_SENHA`. **Não há tela para criar o segundo usuário** — nem para desativar, nem para resetar senha de outro. |
| **Busca pública** | Só texto. Sem filtro de preço, dormitórios, tipo, cidade ou finalidade, e sem paginação (`LIMIT 200` e pronto). |
| **Auditoria** | Grava, mas **não há tela para ler**. Hoje só se lê por SQL. |
| **Histórico do imóvel** | Guarda mudança de estado; não guarda mudança de campo (isso agora está na auditoria, em outro lugar). |
| **Contatos/leads** | Chegam e ficam numa lista. Sem responsável, sem situação, sem retorno marcado, sem virar visita. |
| **Página do imóvel** | Mostra dados e galeria. Sem mapa, sem imóveis parecidos, sem compartilhar. |
| **Checkup/validação da captação** | O programa aceita publicar sem foto, sem preço e sem bairro. Não há "pronto para publicar" como o SIGI tem para boleto. |

## C. O QUE NÃO EXISTE

- **Nenhum teste automatizado.** Nem um. Toda conferência desta sessão foi na mão.
- **WhatsApp**: não há botão nem link em lugar nenhum do site.
- **SEO**: sem `sitemap.xml`, sem `robots.txt`, sem `og:`/Twitter (link do site
  no WhatsApp aparece sem foto e sem título), sem canonical, sem dado
  estruturado de imóvel.
- **Acessibilidade**: as fotos saem com `alt=""` vazio.
- **LGPD**: sem política de privacidade, sem texto de consentimento nos
  formulários, sem prazo de descarte de lead, sem canal do titular.
- **Logo e favicon**: não existem no repositório.
- **Cópia automática do banco** (a de hoje é um comando rodado por uma pessoa).
- **Log de erro fora do console** (reinício apaga; sem Sentry/arquivo).
- **Contrato de API com o SIGIimob**: nenhuma rota, nenhuma chave, nada. Os dois
  sistemas hoje não se falam — o que, por ora, é a decisão certa.
- **Mapa, tour, vídeo, portais (ZAP/VivaReal/OLX), assinatura digital.**

## D. BUGS E RISCOS ENCONTRADOS

Por ordem do que custa mais caro.

1. **O banco gratuito do Render é apagado por volta de 25/10/2026.** Não fica
   devagar: expira. E as fotos moram dentro dele. **É o risco número um do
   projeto** — mais grave que qualquer bug de código, porque o prejuízo é a
   captação inteira. `docs/BANCO.md`.
2. **Gravação sem `status` despublicava o imóvel em silêncio** — corrigido nesta
   sessão (`limparEstado` agora preserva o estado atual em vez de cair para
   RASCUNHO). Era o pior tipo de defeito: um imóvel saía do ar sem ninguém
   mandar e sem nada aparecer na tela.
3. **O limite de envios deixava passar um a mais** — corrigido: a janela começava
   no segundo pedido, então eram 9 envios onde a regra dizia 8 e 11 tentativas
   de senha onde ela dizia 10.
4. **`ADMIN_SENHA` era a única senha possível** — corrigido com `/interna/senha`.
   Enquanto a variável existir no painel, ela é uma senha escrita em texto num
   painel na nuvem: **apague depois da primeira troca**.
5. **`publicados()` faz uma consulta por imóvel para buscar foto** (N+1). Com 200
   imóveis são 201 consultas por visita à home, e ainda filtra a busca em
   JavaScript em vez de no banco. Hoje não dói; com 100 imóveis e o banco
   pequeno, dói.
6. **Sem limite de fotos por imóvel e sem limite de espaço.** 12 por envio, mas
   nada impede 200 fotos num imóvel — e o espaço é o do banco, que é o recurso
   escasso.
7. **Sem CSRF token.** O risco real está contido pelo `sameSite=lax` (navegador
   não manda o cookie em POST de outro site), mas `/interna/sair` é GET e
   qualquer página poderia derrubar a sessão. Baixo, não zero.
8. **Erro só no console.** Reiniciou, perdeu. Quando alguém disser "deu erro
   ontem à noite", não há onde olhar.
9. **`/api/imoveis` sem limite de chamada.** Quem quiser copia a carteira
   pública inteira num laço. Só dado público — mas é a carteira toda.
10. **Uma conta só para todo mundo.** Se duas pessoas usarem, a auditoria vai
    dizer sempre o mesmo nome, e o registro perde a graça.

## E. ALTERAÇÕES DE BANCO NECESSÁRIAS

Todas aditivas. Nenhuma apaga, nenhuma recria, nenhuma zera tabela.

Já aplicada nesta sessão:
```sql
CREATE TABLE auditoria (...);              -- quem fez o quê, com antes/depois
```

Na ordem em que fariam falta:
```sql
-- perfis e times (Fase "área interna")
ALTER TABLE usuarios ADD COLUMN telefone TEXT NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN creci    TEXT NOT NULL DEFAULT '';
-- 'perfil' já existe; passa a valer ADMIN | CORRETOR

ALTER TABLE imoveis  ADD COLUMN responsavel_id INTEGER REFERENCES usuarios(id);

-- leads (Fase comercial)
ALTER TABLE contatos ADD COLUMN situacao       TEXT NOT NULL DEFAULT 'NOVO';
ALTER TABLE contatos ADD COLUMN responsavel_id INTEGER REFERENCES usuarios(id);
ALTER TABLE contatos ADD COLUMN imovel_id      TEXT REFERENCES imoveis(id);
ALTER TABLE contatos ADD COLUMN retorno_em     DATE;
ALTER TABLE contatos ADD COLUMN anotacoes      JSONB NOT NULL DEFAULT '[]'::jsonb;

-- visitas (Fase comercial)
CREATE TABLE visitas (
  id SERIAL PRIMARY KEY, imovel_id TEXT REFERENCES imoveis(id),
  contato_id INTEGER REFERENCES contatos(id), quando TIMESTAMPTZ,
  situacao TEXT NOT NULL DEFAULT 'MARCADA', corretor_id INTEGER REFERENCES usuarios(id),
  observacoes TEXT NOT NULL DEFAULT '', criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- busca (Fase público), quando a lista crescer
CREATE INDEX imoveis_publico_cidade ON imoveis ((publico->>'cidade'));
CREATE INDEX imoveis_publico_bairro ON imoveis ((publico->>'bairro'));
```

E uma decisão de arquitetura que **não** é `ALTER TABLE`: tirar as fotos do
banco. Só vale a pena junto com a escolha do banco definitivo.

## F. PLANO DE IMPLEMENTAÇÃO POR FASE

**FASE 1 — estabilização (em curso, quase pronta)**
Corrigido o despublicar silencioso; `/health`; auditoria; troca de senha;
limite de envios; `docs/BACKUP.md` com restauro ensaiado; `docs/BANCO.md`.
Falta: **você escolher o banco definitivo** e o primeiro teste automatizado.

**FASE 2 — o que o dono do imóvel vê (público)**
Filtros de verdade (preço, dormitórios, tipo, cidade, finalidade) feitos no
banco; paginação; `og:` para o link ficar bonito no WhatsApp; `sitemap.xml` e
`robots.txt`; botão de WhatsApp com a mensagem já escrita; `alt` nas fotos;
galeria melhor na página do imóvel; matar o N+1.

**FASE 3 — o que entra por causa do site (comercial)**
Lead com responsável e situação; visita com data e corretor; painel "o que
tenho para hoje"; e o mesmo princípio do SIGI: nada some por decurso de prazo.

**FASE 4 — quem usa (área interna)**
Criar usuário de verdade; `exigirPerfil` **ligado** nas rotas; CORRETOR vê e
edita o que é dele, ADMIN vê tudo; tela de auditoria; painel com os números.

**FASE 5 — captação sem buraco**
"Pronto para publicar" com o que falta, na linha do `emissao.py` do SIGI: sem
foto, sem preço, sem bairro, sem autorização assinada → não publica, e diz onde
conserta.

**FASE 6 — casa em ordem**
LGPD (política, consentimento, descarte), acessibilidade, velocidade, log de
erro que sobrevive a reinício, e os testes que faltarem.

**FASE 7 — a ponte com o SIGIimob, e só aqui**
Contrato de leitura por chave, num sentido só: o SIGIimob **puxa** do site o que
foi captado. O site continua sem saber que existe banco.

## G. O QUE PODE SER FEITO SEM RISCO AGORA

Sem tocar em dado e sem mudar o que funciona: `og:` e Twitter card;
`sitemap.xml` e `robots.txt`; botão de WhatsApp; `alt` nas fotos; matar o N+1 do
`publicados()`; limite de chamada em `/api/imoveis`; tela de leitura da
auditoria; validação de "pronto para publicar" **avisando** sem bloquear; os
primeiros testes automatizados; política de privacidade e consentimento;
página de erro com jeito.

Tudo isso é adição. Nada apaga linha nenhuma.

## H. O QUE PRECISA DA SUA DECISÃO

1. **O banco definitivo — com prazo.** `docs/BANCO.md`. Minha recomendação:
   Render pago no plano mínimo, porque nada muda de lugar. **Decida antes de
   25/10.**
2. **Apagar `ADMIN_SENHA` do painel do Render** depois de trocar a senha na tela.
3. **Quantas pessoas vão usar, e quem é corretor.** É isso que diz se a Fase 4
   vem antes da Fase 2.
4. **O WhatsApp que vai no site** (número e a mensagem que vem escrita).
5. **Logo e favicon** — preciso do arquivo.
6. **Cidades e bairros** que os filtros devem oferecer, ou lista livre.
7. **Publicar exige autorização assinada?** Se sim, isso passa a bloquear.
8. **Descarte de lead**: quanto tempo o contato fica guardado (LGPD).
9. **A ordem das fases.** Minha sugestão: 1 → 2 → 3, porque o site existe para
   captar e para o proprietário achar a Tripac. Fase 4 sobe na frente se mais de
   uma pessoa for usar já.
