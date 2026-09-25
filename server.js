"use strict";
/**
 * Site publico + area interna da Tripac.
 *
 * O SITE PUBLICO so mostra imovel com status PUBLICADO, e so os campos do bloco
 * 'publico' (ver lib/modelo.js). A AREA INTERNA fica inteira atras de login.
 * Nenhum segredo mora aqui: tudo vem de variavel de ambiente.
 */
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const sessao = require("express-session");
const LojaPg = require("connect-pg-simple")(sessao);
const multer = require("multer");

const { pool, preparar } = require("./lib/db");
const auth = require("./lib/auth");
const modelo = require("./lib/modelo");
const vista = require("./lib/html");

const app = express();
const producao = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: producao ? "1h" : 0 }));

if (!process.env.SESSION_SECRET && producao) {
  console.error("SESSION_SECRET nao definido. Defina a variavel de ambiente antes de subir.");
  process.exit(1);
}
app.use(sessao({
  store: new LojaPg({ pool, tableName: "sessoes", createTableIfMissing: true }),
  name: "tripac.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: producao,
    maxAge: 1000 * 60 * 60 * 12,
  },
}));

/* ------------------------------------------------ upload de fotos */
const FOTOS_OK = ["image/jpeg", "image/png", "image/webp"];
const enviarFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
  fileFilter: (req, arquivo, ok) => {
    if (!FOTOS_OK.includes(arquivo.mimetype)) return ok(new Error("tipo de imagem nao aceito"));
    ok(null, true);
  },
});

/** Confere os primeiros bytes: o mimetype declarado pelo navegador nao basta. */
function pareceImagem(buffer, tipo) {
  if (!buffer || buffer.length < 12) return false;
  const b = buffer;
  if (tipo === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  if (tipo === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (tipo === "image/webp") return b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP";
  return false;
}

/* ------------------------------------------------ consultas */
async function fotosDe(imovelId) {
  const { rows } = await pool.query(
    "SELECT id, capa, ordem FROM fotos WHERE imovel_id = $1 ORDER BY ordem, criado_em", [imovelId]);
  return rows;
}

async function publicados(busca) {
  const termo = (busca || "").trim().toLowerCase();
  const { rows } = await pool.query(
    "SELECT * FROM imoveis WHERE status = $1 ORDER BY atualizado_em DESC LIMIT 200", [modelo.NO_AR]);
  const comFotos = [];
  for (const linha of rows) {
    const imovel = modelo.paraOPublico(linha, await fotosDe(linha.id));
    if (!termo || JSON.stringify([imovel.bairro, imovel.cidade, imovel.tipo, imovel.titulo])
        .toLowerCase().includes(termo)) comFotos.push(imovel);
  }
  return comFotos;
}

/* ------------------------------------------------ site publico */
app.get("/", async (req, res, proximo) => {
  try {
    const imoveis = await publicados("");
    res.send(vista.pagina({
      titulo: "Imóveis para alugar e comprar",
      corpo: `<section class="capa">
          <h1>Imóveis em Caraguatatuba e região</h1>
          <p>Locação e venda com administração da Tripac.</p>
          <p class="acoes"><a class="botao" href="/alugar">Alugar</a>
             <a class="botao" href="/comprar">Comprar</a>
             <a class="botao claro" href="/anuncie">Anuncie seu imóvel</a></p>
        </section>
        <h2 class="titulo-secao">Últimos imóveis</h2>
        <section class="grade">${
          imoveis.length ? imoveis.slice(0, 12).map(vista.cartaoImovel).join("")
                         : `<p class="vazio">Em breve.</p>`}</section>`,
    }));
  } catch (erro) { proximo(erro); }
});

app.get("/alugar", async (req, res, proximo) => {
  try {
    const todos = await publicados(req.query.q);
    res.send(vista.listaPublica({
      titulo: "Imóveis para alugar", subtitulo: "Locação em Caraguatatuba e região",
      imoveis: todos.filter((i) => /ALUGAR/.test(i.finalidade)), busca: req.query.q, acao: "/alugar",
    }));
  } catch (erro) { proximo(erro); }
});

app.get("/comprar", async (req, res, proximo) => {
  try {
    const todos = await publicados(req.query.q);
    res.send(vista.listaPublica({
      titulo: "Imóveis à venda", subtitulo: "Venda em Caraguatatuba e região",
      imoveis: todos.filter((i) => /VENDER/.test(i.finalidade)), busca: req.query.q, acao: "/comprar",
    }));
  } catch (erro) { proximo(erro); }
});

app.get("/imovel/:codigo", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM imoveis WHERE (codigo = $1 OR id = $1) AND status = $2",
      [String(req.params.codigo), modelo.NO_AR]);
    if (!rows.length) return res.status(404).send(vista.pagina({
      titulo: "Imóvel não encontrado",
      corpo: `<section class="faixa"><h1>Imóvel não encontrado</h1>
        <p>Ele pode ter saído do ar. <a href="/alugar">Ver os disponíveis</a>.</p></section>`,
    }));
    res.send(vista.paginaImovel(modelo.paraOPublico(rows[0], await fotosDe(rows[0].id))));
  } catch (erro) { proximo(erro); }
});

app.get("/anuncie", (req, res) => {
  res.send(vista.pagina({
    titulo: "Anuncie seu imóvel",
    corpo: `<section class="faixa"><h1>Anuncie seu imóvel</h1>
      <p>Deixe seus dados: a Tripac entra em contato para avaliar e captar.</p></section>
      <form class="formulario" method="post" action="/anuncie">
        <label>Nome<input name="nome" required maxlength="120"></label>
        <label>Telefone<input name="telefone" required maxlength="40" inputmode="tel"></label>
        <label>E-mail<input name="email" type="email" maxlength="120"></label>
        <label>Sobre o imóvel<textarea name="mensagem" maxlength="1000"
          placeholder="Tipo, bairro, quantos dormitórios, se é para alugar ou vender"></textarea></label>
        <button class="principal">Enviar</button>
      </form>`,
  }));
});

async function guardarContato(req, tipo) {
  await pool.query(
    "INSERT INTO contatos (tipo, imovel_id, nome, telefone, email, mensagem) VALUES ($1,$2,$3,$4,$5,$6)",
    [tipo, modelo.texto(req.body.imovel, 60) || null, modelo.texto(req.body.nome, 120),
     modelo.texto(req.body.telefone, 40), modelo.texto(req.body.email, 120),
     modelo.texto(req.body.mensagem, 1000)]);
}

app.post("/anuncie", async (req, res, proximo) => {
  try {
    await guardarContato(req, "ANUNCIE");
    res.send(vista.pagina({ titulo: "Recebido",
      corpo: `<section class="faixa"><h1>Recebemos o seu contato</h1>
        <p>A Tripac retorna em breve. <a href="/">Voltar ao início</a>.</p></section>` }));
  } catch (erro) { proximo(erro); }
});

app.post("/visita", async (req, res, proximo) => {
  try {
    await guardarContato(req, "VISITA");
    res.send(vista.pagina({ titulo: "Pedido enviado",
      corpo: `<section class="faixa"><h1>Pedido de visita enviado</h1>
        <p>Entramos em contato para combinar. <a href="/alugar">Ver outros imóveis</a>.</p></section>` }));
  } catch (erro) { proximo(erro); }
});

/** API publica: so o que esta no ar, so campos publicos. */
app.get("/api/imoveis", async (req, res, proximo) => {
  try { res.json({ imoveis: await publicados(req.query.q) }); }
  catch (erro) { proximo(erro); }
});

/** A foto so aparece se o imovel estiver publicado ou se quem pede estiver logado. */
app.get("/fotos/:id", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.conteudo, f.tipo, i.status FROM fotos f
         JOIN imoveis i ON i.id = f.imovel_id WHERE f.id = $1`, [String(req.params.id)]);
    const foto = rows[0];
    const logado = req.session && req.session.usuario;
    if (!foto || (foto.status !== modelo.NO_AR && !logado)) return res.status(404).end();
    res.set("Content-Type", foto.tipo);
    res.set("Cache-Control", foto.status === modelo.NO_AR ? "public, max-age=86400" : "private, no-store");
    res.send(foto.conteudo);
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ login */
const tentativas = new Map();
function podeTentar(ip) {
  const agora = Date.now();
  const registro = tentativas.get(ip) || { contagem: 0, ate: agora };
  if (agora > registro.ate) { registro.contagem = 0; registro.ate = agora + 15 * 60 * 1000; }
  registro.contagem += 1;
  tentativas.set(ip, registro);
  return registro.contagem <= 10;
}

app.get("/interna/login", (req, res) => {
  if (req.session.usuario) return res.redirect("/interna");
  res.send(vista.pagina({
    titulo: "Entrar", interna: true,
    corpo: `<section class="entrar">
      <h1>Área interna</h1>
      ${req.query.erro ? `<p class="erro">E-mail ou senha não conferem.</p>` : ""}
      <form method="post" action="/interna/login">
        <input type="hidden" name="de" value="${vista.e(req.query.de || "/interna")}">
        <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
        <label>Senha<input name="senha" type="password" required autocomplete="current-password"></label>
        <button class="principal">Entrar</button>
      </form></section>`,
  }));
});

app.post("/interna/login", async (req, res, proximo) => {
  try {
    if (!podeTentar(req.ip)) return res.status(429).send("Muitas tentativas. Espere alguns minutos.");
    const usuario = await auth.autenticar(req.body.email, req.body.senha);
    if (!usuario) return res.redirect("/interna/login?erro=1");
    req.session.regenerate((erro) => {
      if (erro) return proximo(erro);
      req.session.usuario = usuario;
      const destino = String(req.body.de || "/interna");
      res.redirect(destino.startsWith("/interna") ? destino : "/interna");
    });
  } catch (erro) { proximo(erro); }
});

app.get("/interna/sair", (req, res) => {
  req.session.destroy(() => res.redirect("/interna/login"));
});

/* ------------------------------------------------ area interna */
app.use("/interna", auth.exigirLogin);

app.get("/interna", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query("SELECT * FROM imoveis ORDER BY atualizado_em DESC LIMIT 300");
    const cartoes = [];
    for (const linha of rows) {
      const fotos = await fotosDe(linha.id);
      const capa = fotos.find((f) => f.capa) || fotos[0];
      const p = linha.publico || {}, i = linha.interno || {};
      const titulo = p.titulo || [i.logradouro, i.numero].filter(Boolean).join(", ")
        || [p.tipo, p.bairro].filter(Boolean).join(" · ") || "Sem endereço ainda";
      cartoes.push(`<a class="item" href="/interna/captacao/${vista.e(linha.id)}">
        ${capa ? `<img src="/fotos/${vista.e(capa.id)}" alt="">` : `<span class="semfoto">sem foto</span>`}
        <span class="txt"><strong>${vista.e(titulo)}</strong>
          <span>${vista.e(fotos.length)} foto(s) · ${vista.e(new Date(linha.atualizado_em).toLocaleString("pt-BR"))}</span></span>
        <span class="chip ${vista.e(linha.status)}">${vista.e(linha.status)}</span></a>`);
    }
    res.send(vista.pagina({
      titulo: "Captações", interna: true, usuario: req.session.usuario,
      corpo: `<div class="acoes-topo"><a class="botao principal" href="/interna/captacao/nova">+ Nova captação</a></div>
        <section class="lista">${cartoes.join("") || `<p class="vazio">Nenhuma captação ainda.</p>`}</section>`,
    }));
  } catch (erro) { proximo(erro); }
});

app.get("/interna/captacao/nova", async (req, res, proximo) => {
  try {
    const id = modelo.novoId();
    await pool.query(
      `INSERT INTO imoveis (id, codigo, status, publico, interno, historico, criado_por)
       VALUES ($1, $2, 'RASCUNHO', $3, $4, $5, $6)`,
      [id, id.replace("im_", "TR-").toUpperCase().slice(0, 14),
       JSON.stringify(modelo.limparPublico({ finalidade: "ALUGAR", tipo: "APARTAMENTO", uf: "SP" })),
       JSON.stringify(modelo.limparInterno({ captado_por: req.session.usuario.nome })),
       JSON.stringify([{ quando: new Date().toISOString(), quem: req.session.usuario.nome, o_que: "captação criada" }]),
       req.session.usuario.id]);
    res.redirect("/interna/captacao/" + id);
  } catch (erro) { proximo(erro); }
});

app.get("/interna/captacao/:id", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [String(req.params.id)]);
    if (!rows.length) return res.status(404).send("Captação não encontrada.");
    res.send(vista.pagina({
      titulo: "Captação", interna: true, usuario: req.session.usuario,
      corpo: `<div id="captacao" data-id="${vista.e(rows[0].id)}"></div><script src="/captacao.js" defer></script>`,
    }));
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ API da area interna */
app.get("/interna/api/captacao/:id", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [String(req.params.id)]);
    if (!rows.length) return res.status(404).json({ erro: "não encontrada" });
    const linha = rows[0];
    res.json({
      id: linha.id, codigo: linha.codigo, status: linha.status,
      publico: linha.publico, interno: linha.interno, historico: linha.historico,
      atualizado_em: linha.atualizado_em,
      fotos: (await fotosDe(linha.id)).map((f) => ({ id: f.id, capa: f.capa, url: "/fotos/" + f.id })),
    });
  } catch (erro) { proximo(erro); }
});

app.put("/interna/api/captacao/:id", async (req, res, proximo) => {
  try {
    const id = String(req.params.id);
    const { rows } = await pool.query("SELECT historico, status FROM imoveis WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ erro: "não encontrada" });
    const status = modelo.limparEstado(req.body.status);
    const historico = Array.isArray(rows[0].historico) ? rows[0].historico.slice(-60) : [];
    if (status !== rows[0].status) {
      historico.push({ quando: new Date().toISOString(), quem: req.session.usuario.nome,
                       o_que: "estado: " + rows[0].status + " → " + status });
    }
    await pool.query(
      `UPDATE imoveis SET publico = $2, interno = $3, status = $4, historico = $5,
              atualizado_em = now() WHERE id = $1`,
      [id, JSON.stringify(modelo.limparPublico(req.body.publico)),
       JSON.stringify(modelo.limparInterno(req.body.interno)), status, JSON.stringify(historico)]);
    res.json({ ok: true, salvo_em: new Date().toISOString(), status });
  } catch (erro) { proximo(erro); }
});

app.post("/interna/api/captacao/:id/fotos", enviarFoto.array("foto", 12), async (req, res, proximo) => {
  try {
    const id = String(req.params.id);
    const { rows } = await pool.query("SELECT id FROM imoveis WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ erro: "não encontrada" });
    const { rows: contagem } = await pool.query(
      "SELECT COUNT(*)::int AS quantas FROM fotos WHERE imovel_id = $1", [id]);
    let ordem = contagem[0].quantas;
    const criadas = [];
    for (const arquivo of req.files || []) {
      if (!pareceImagem(arquivo.buffer, arquivo.mimetype)) continue;
      const fotoId = "ft_" + crypto.randomBytes(10).toString("hex");
      await pool.query(
        `INSERT INTO fotos (id, imovel_id, ordem, capa, tipo, bytes, conteudo)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [fotoId, id, ordem, ordem === 0, arquivo.mimetype, arquivo.size, arquivo.buffer]);
      criadas.push({ id: fotoId, capa: ordem === 0, url: "/fotos/" + fotoId });
      ordem += 1;
    }
    await pool.query("UPDATE imoveis SET atualizado_em = now() WHERE id = $1", [id]);
    if (!criadas.length) return res.status(400).json({ erro: "nenhuma imagem válida" });
    res.json({ fotos: criadas });
  } catch (erro) { proximo(erro); }
});

app.post("/interna/api/captacao/:id/fotos/ordem", async (req, res, proximo) => {
  try {
    const id = String(req.params.id);
    const ordem = Array.isArray(req.body.ordem) ? req.body.ordem.slice(0, 60) : [];
    const capa = modelo.texto(req.body.capa, 60);
    for (let i = 0; i < ordem.length; i += 1) {
      await pool.query("UPDATE fotos SET ordem = $3, capa = ($1 = $4) WHERE id = $1 AND imovel_id = $2",
        [String(ordem[i]), id, i, capa]);
    }
    res.json({ ok: true });
  } catch (erro) { proximo(erro); }
});

app.delete("/interna/api/captacao/:id/fotos/:foto", async (req, res, proximo) => {
  try {
    await pool.query("DELETE FROM fotos WHERE id = $1 AND imovel_id = $2",
      [String(req.params.foto), String(req.params.id)]);
    const restantes = await fotosDe(String(req.params.id));
    if (restantes.length && !restantes.some((f) => f.capa)) {
      await pool.query("UPDATE fotos SET capa = TRUE WHERE id = $1", [restantes[0].id]);
    }
    res.json({ ok: true });
  } catch (erro) { proximo(erro); }
});

app.get("/interna/contatos", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query("SELECT * FROM contatos ORDER BY criado_em DESC LIMIT 200");
    res.send(vista.pagina({
      titulo: "Contatos do site", interna: true, usuario: req.session.usuario,
      corpo: `<h1 class="titulo-secao">Contatos do site</h1>
        <section class="lista">${rows.map((c) => `<div class="item">
          <span class="txt"><strong>${vista.e(c.nome)} · ${vista.e(c.telefone)}</strong>
          <span>${vista.e(c.tipo)} · ${vista.e(new Date(c.criado_em).toLocaleString("pt-BR"))}
            ${c.email ? " · " + vista.e(c.email) : ""}</span>
          <span>${vista.e(c.mensagem)}</span></span></div>`).join("")
          || `<p class="vazio">Nenhum contato ainda.</p>`}</section>`,
    }));
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ erros e subida */
app.use((req, res) => res.status(404).send(vista.pagina({
  titulo: "Página não encontrada",
  corpo: `<section class="faixa"><h1>Página não encontrada</h1>
    <p><a href="/">Voltar ao início</a></p></section>`,
})));

app.use((erro, req, res, proximo) => {
  console.error("erro:", erro && erro.message);
  const codigo = erro && erro.message === "tipo de imagem nao aceito" ? 400 : 500;
  if (req.path.startsWith("/interna/api/") || req.path.startsWith("/api/")) {
    return res.status(codigo).json({ erro: codigo === 400 ? erro.message : "falha no servidor" });
  }
  res.status(codigo).send(vista.pagina({
    titulo: "Erro", corpo: `<section class="faixa"><h1>Algo deu errado</h1>
      <p>Tente de novo. Se continuar, avise a Tripac.</p></section>`,
  }));
});

const porta = process.env.PORT || 3000;
preparar()
  .then(async () => {
    const semeado = await auth.semearAdministrador();
    if (semeado.criado) console.log("administrador criado a partir de ADMIN_EMAIL");
    app.listen(porta, () => console.log("no ar na porta " + porta));
  })
  .catch((erro) => { console.error("nao subiu:", erro.message); process.exit(1); });
