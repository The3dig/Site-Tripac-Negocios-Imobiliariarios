"use strict";
/** As paginas. Sem motor de template: string com escape em todo valor. */
const { moeda } = require("./modelo");

function e(valor) {
  return String(valor === undefined || valor === null ? "" : valor)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * As etiquetas que o WhatsApp, o Facebook e o Google leem quando alguem cola o
 * link: sem elas, o link do imovel chega no WhatsApp sem foto e sem titulo.
 * Pedem endereco completo (https://...), por isso 'social.url' e 'social.imagem'
 * ja chegam absolutos. So as paginas publicas passam 'social'.
 */
function etiquetasSociais(social, titulo, descricao) {
  if (!social || !social.url) return "";
  const texto = descricao || "Locação e venda de imóveis em Caraguatatuba e região.";
  return `
<link rel="canonical" href="${e(social.url)}">
<meta property="og:site_name" content="TRIPAC Negócios Imobiliários">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(titulo)}">
<meta property="og:description" content="${e(texto)}">
<meta property="og:url" content="${e(social.url)}">${social.imagem ? `
<meta property="og:image" content="${e(social.imagem)}">
<meta property="og:image:alt" content="${e(titulo)}">` : ""}
<meta name="twitter:card" content="${social.imagem ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${e(titulo)}">
<meta name="twitter:description" content="${e(texto)}">`;
}

function pagina({ titulo, corpo, usuario, interna, descricao, social }) {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${interna ? `
<meta name="robots" content="noindex, nofollow">` : ""}
<title>${e(titulo)} · TRIPAC Negócios Imobiliários</title>
<meta name="description" content="${e(descricao || "Locação e venda de imóveis em Caraguatatuba e região.")}">${etiquetasSociais(social, titulo, (social && social.descricao) || descricao)}
<link rel="stylesheet" href="/estilo.css">
</head><body class="${interna ? "interna" : "publico"}">
<header class="topo">
  <a class="marca" href="${interna ? "/interna" : "/"}">TRIPAC<span>${interna ? " · Área interna" : " Negócios Imobiliários"}</span></a>
  <nav>
    ${interna
      ? `<a href="/interna">Captações</a><a href="/interna/contatos">Contatos</a><a href="/interna/senha">Senha</a><a href="/" target="_blank" rel="noopener">Ver o site</a><a href="/interna/sair">Sair</a>`
      : `<a href="/alugar">Alugar</a><a href="/comprar">Comprar</a><a href="/anuncie">Anuncie</a>`}
  </nav>
  ${usuario ? `<span class="quem">${e(usuario.nome || usuario.email)}</span>` : ""}
</header>
<main>${corpo}</main>
<footer>
  <p>TRIPAC Negócios Imobiliários · Caraguatatuba/SP</p>
  ${interna ? "" : `<p><a href="/interna">Área interna</a></p>`}
</footer>
</body></html>`;
}

/**
 * O nome do imovel numa frase, para titulo e para o texto alternativo das fotos
 * ("Apartamento em Martim de Sa, Caraguatatuba"). Foto com alt="" e foto que o
 * leitor de tela anuncia como "imagem" e o Google nao sabe do que e.
 */
function nomeDoImovel(imovel) {
  if (imovel.titulo) return imovel.titulo;
  const tipo = String(imovel.tipo || "Imóvel");
  const onde = [imovel.bairro, imovel.cidade].filter(Boolean).join(", ");
  return tipo.charAt(0) + tipo.slice(1).toLowerCase() + (onde ? " em " + onde : "");
}

function cartaoImovel(imovel) {
  const capa = (imovel.fotos || []).find((f) => f.capa) || (imovel.fotos || [])[0];
  const preco = imovel.valor_aluguel ? moeda(imovel.valor_aluguel) + "/mês" : moeda(imovel.valor_venda);
  const traços = [
    imovel.dormitorios && imovel.dormitorios + " dorm.",
    imovel.banheiros && imovel.banheiros + " banh.",
    imovel.vagas && imovel.vagas + " vaga(s)",
    imovel.area && imovel.area + " m²",
  ].filter(Boolean).join(" · ");
  return `<a class="cartao-imovel" href="/imovel/${e(imovel.codigo)}">
    ${capa ? `<img src="${e(capa.url)}" alt="${e(nomeDoImovel(imovel))}" loading="lazy">` : `<div class="sem-foto">sem foto</div>`}
    <div class="dados">
      <strong>${e(imovel.titulo || (imovel.tipo + " em " + imovel.bairro))}</strong>
      <span class="onde">${e([imovel.bairro, imovel.cidade].filter(Boolean).join(", "))}</span>
      <span class="tracos">${e(traços)}</span>
      <span class="preco">${e(preco)}</span>
    </div></a>`;
}

function listaPublica({ titulo, subtitulo, imoveis, busca, acao, social }) {
  return pagina({
    titulo,
    descricao: subtitulo,
    social,
    corpo: `<section class="faixa"><h1>${e(titulo)}</h1><p>${e(subtitulo)}</p></section>
    <form class="busca" method="get" action="${e(acao)}">
      <input name="q" value="${e(busca || "")}" placeholder="bairro, cidade ou tipo" aria-label="Buscar">
      <button>Buscar</button>
    </form>
    <section class="grade">
      ${imoveis.length ? imoveis.map(cartaoImovel).join("") :
        `<p class="vazio">Nenhum imóvel publicado nesta busca.</p>`}
    </section>`,
  });
}

/** "R$ 2.500,00/mês · 2 dorm. · 72 m² · Martim de Sá, Caraguatatuba": o que se quer ver no WhatsApp. */
function resumoDoImovel(imovel) {
  return [
    imovel.valor_aluguel ? moeda(imovel.valor_aluguel) + "/mês" : moeda(imovel.valor_venda),
    imovel.dormitorios && imovel.dormitorios + " dorm.",
    imovel.area && imovel.area + " m²",
    [imovel.bairro, imovel.cidade].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
}

function paginaImovel(imovel, social) {
  const fotos = imovel.fotos || [];
  const linhas = [
    ["Tipo", imovel.tipo], ["Finalidade", imovel.finalidade],
    ["Bairro", imovel.bairro], ["Cidade", [imovel.cidade, imovel.uf].filter(Boolean).join("/")],
    ["Dormitórios", imovel.dormitorios], ["Suítes", imovel.suites],
    ["Banheiros", imovel.banheiros], ["Vagas", imovel.vagas],
    ["Área", imovel.area && imovel.area + " m²"], ["Andar", imovel.andar],
    ["Mobiliado", imovel.mobiliado === "SIM" ? "Sim" : imovel.mobiliado === "SEMI" ? "Semimobiliado" : ""],
    ["Condomínio", moeda(imovel.condominio)], ["IPTU", moeda(imovel.iptu)],
  ].filter(([, v]) => String(v || "").trim() !== "");
  return pagina({
    titulo: imovel.titulo || imovel.tipo,
    descricao: (imovel.descricao || "").slice(0, 160),
    social: social && { ...social, descricao: resumoDoImovel(imovel) },
    corpo: `<article class="imovel">
      <h1>${e(imovel.titulo || imovel.tipo + " em " + imovel.bairro)}</h1>
      <p class="onde">${e([imovel.bairro, imovel.cidade, imovel.uf].filter(Boolean).join(", "))}
        · código ${e(imovel.codigo)}</p>
      <p class="preco-grande">${e(imovel.valor_aluguel ? moeda(imovel.valor_aluguel) + "/mês" : moeda(imovel.valor_venda))}</p>
      <div class="galeria">${fotos.map((f, n) => `<img src="${e(f.url)}"
        alt="${e(nomeDoImovel(imovel) + " — foto " + (n + 1) + " de " + fotos.length)}" loading="lazy">`).join("")}</div>
      ${imovel.descricao ? `<p class="descricao">${e(imovel.descricao)}</p>` : ""}
      <dl class="ficha">${linhas.map(([r, v]) => `<dt>${e(r)}</dt><dd>${e(v)}</dd>`).join("")}</dl>
      <section class="visita">
        <h2>Agendar visita</h2>
        <form method="post" action="/visita">
          <input type="hidden" name="imovel" value="${e(imovel.id)}">
          <label>Nome<input name="nome" required maxlength="120"></label>
          <label>Telefone<input name="telefone" required maxlength="40" inputmode="tel"></label>
          <label>E-mail<input name="email" type="email" maxlength="120"></label>
          <label>Mensagem<textarea name="mensagem" maxlength="1000"></textarea></label>
          <button class="principal">Quero visitar</button>
        </form>
      </section>
    </article>`,
  });
}

module.exports = { e, pagina, nomeDoImovel, cartaoImovel, listaPublica, paginaImovel };
