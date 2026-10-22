"use strict";
/** As paginas. Sem motor de template: string com escape em todo valor. */
const { moeda } = require("./modelo");

/**
 * O WhatsApp da imobiliaria, com a mensagem ja escrita. O numero e padrao da
 * Tripac e muda por WHATSAPP_NUMERO (so digitos, com 55 e DDD), como toda regra
 * da casa: o site vai servir outras imobiliarias. Vazio, o botao nao aparece.
 */
const WHATSAPP = (process.env.WHATSAPP_NUMERO === undefined ? "5512988401131" : process.env.WHATSAPP_NUMERO)
  .replace(/\D/g, "");

function linkWhatsApp(mensagem) {
  if (!WHATSAPP) return "";
  return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(mensagem);
}

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
${interna ? "" : '<link rel="stylesheet" href="/vitrine.css">'}
</head><body class="${interna ? "interna" : "publico"}">
${interna ? "" : '<a class="pular-conteudo" href="#conteudo">Pular para o conteúdo</a>'}
<header class="topo">
  <a class="marca" href="${interna ? "/interna" : "/"}">TRIPAC<span>${interna ? " · Área interna" : " Negócios Imobiliários"}</span></a>
  <nav>
    ${interna
      ? `<a href="/interna">Captações</a><a href="/interna/contatos">Contatos</a><a href="/interna/senha">Senha</a><a href="/" target="_blank" rel="noopener">Ver o site</a><a href="/interna/sair">Sair</a>`
      : `<a href="/alugar">Alugar</a><a href="/comprar">Comprar</a><a class="nav-anuncie" href="/anuncie">Anuncie seu imóvel ↗</a>`}
  </nav>
  ${usuario ? `<span class="quem">${e(usuario.nome || usuario.email)}</span>` : ""}
</header>
<main id="conteudo">${corpo}</main>${!interna && WHATSAPP ? `
<a class="whats-flutuante" href="${e(linkWhatsApp("Olá! Vim pelo site da Tripac."))}" target="_blank" rel="noopener"
   aria-label="Falar com a Tripac pelo WhatsApp">WhatsApp</a>` : ""}
<footer>
  <p>TRIPAC Negócios Imobiliários · Caraguatatuba/SP</p>
  ${interna ? "" : `<p>Seu próximo endereço, com a Tripac.</p><nav aria-label="Links do rodapé"><a href="/alugar">Imóveis para alugar</a><a href="/comprar">Imóveis à venda</a><a href="/anuncie">Anunciar imóvel</a><a href="/interna">Área interna · Captação</a></nav>`}
</footer>
</body></html>`;
}

/** A vitrine usa somente imóveis já filtrados pela consulta pública. */
function paginaInicial(imoveis, social) {
  const destaque = imoveis.find(i => (i.fotos || []).length);
  const foto = destaque && (destaque.fotos.find(f => f.capa) || destaque.fotos[0]);
  const locacoes = imoveis.filter(i => /ALUGAR/.test(i.finalidade)).slice(0, 6);
  const vendas = imoveis.filter(i => /VENDER/.test(i.finalidade)).slice(0, 3);
  return pagina({ titulo: "Seu próximo endereço em Caraguatatuba", social,
    corpo: `<section class="hero-vitrine">
      <div class="hero-texto"><p class="sobretitulo">TRIPAC · CARAGUATATUBA E REGIÃO</p>
        <h1>Um novo endereço.<br><em>Novas possibilidades.</em></h1>
        <p class="hero-descricao">Encontre um lugar para morar, investir ou abrir seu negócio. A Tripac acompanha você na escolha.</p>
        <div class="hero-atalhos"><a class="ativo" href="/alugar">Quero alugar</a><a href="/comprar">Quero comprar ↗</a></div>
        <form class="busca hero-busca" method="get" action="/alugar">
          <label for="busca-inicial">Onde você quer morar?</label>
          <div><input id="busca-inicial" name="q" placeholder="Bairro, cidade ou tipo de imóvel"><button>Encontrar imóvel ↗</button></div>
        </form><p class="hero-nota">Casas, apartamentos e espaços comerciais.</p>
      </div>
      <div class="hero-imagem${foto ? "" : " ilustracao"}">${foto
        ? `<img src="${e(foto.url)}" alt="${e(nomeDoImovel(destaque))}" fetchpriority="high"><a class="hero-legenda" href="/imovel/${e(encodeURIComponent(destaque.codigo))}"><span>CONHEÇA ESTE IMÓVEL</span><strong>${e(nomeDoImovel(destaque))} ↗</strong></a>`
        : `<div class="sol"></div><div class="arco"></div><div class="casa"><span></span></div><div class="jardim"></div><p class="ilustracao-legenda">Entre a serra e o mar.<br><strong>Seu lugar em Caraguatatuba.</strong></p>`}
      </div>
    </section>
    <div class="faixa-servicos"><span>01 <strong>Encontre seu imóvel</strong></span><span>02 <strong>Converse com a Tripac</strong></span><span>03 <strong>Agende sua visita</strong></span></div>
    <section class="secao-vitrine" aria-labelledby="titulo-locacao"><div class="cabecalho-secao"><div><p class="sobretitulo">PARA SEU PRÓXIMO CAPÍTULO</p><h2 id="titulo-locacao">Encontre seu lugar.</h2></div><a href="/alugar">Ver imóveis para alugar ↗</a></div>
      ${locacoes.length ? `<div class="grade">${locacoes.map(cartaoImovel).join("")}</div>` : estadoVazio(false)}
    </section>
    ${vendas.length ? `<section class="secao-vitrine" aria-labelledby="titulo-venda"><div class="cabecalho-secao"><div><p class="sobretitulo">PARA MORAR OU INVESTIR</p><h2 id="titulo-venda">Imóveis à venda.</h2></div><a href="/comprar">Ver todos à venda ↗</a></div><div class="grade">${vendas.map(cartaoImovel).join("")}</div></section>` : ""}
    <section class="convite-proprietario"><div><p class="sobretitulo">SEU IMÓVEL, NOVAS POSSIBILIDADES</p><h2>Tem um imóvel para<br>alugar ou vender?</h2><p>Apresente seu imóvel à Tripac. Vamos conversar sobre a divulgação e os próximos passos.</p></div><a class="botao" href="/anuncie">Quero anunciar meu imóvel ↗</a></section>`,
  });
}

function estadoVazio(busca) {
  return `<div class="vitrine-vazia"><h3>${busca ? "Vamos encontrar outra possibilidade?" : "Vamos encontrar seu próximo endereço?"}</h3><p>${busca ? "Nenhum anúncio corresponde a esta busca. Tente outro bairro, cidade ou tipo de imóvel." : "Consulte a Tripac sobre os imóveis disponíveis e conte o que você procura."}</p>${busca ? '<a class="botao claro" href="/alugar">Ver todos para alugar</a> ' : ""}${WHATSAPP ? `<a class="botao whats" href="${e(linkWhatsApp("Olá! Estou procurando um imóvel e gostaria de conhecer as opções da Tripac."))}" target="_blank" rel="noopener">Falar com a Tripac ↗</a>` : '<a class="botao" href="/anuncie">Entrar em contato</a>'}</div>`;
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
  return `<a class="cartao-imovel" href="/imovel/${e(encodeURIComponent(imovel.codigo))}">
    <div class="cartao-foto"><span class="selo-finalidade">${e(/ALUGAR/.test(imovel.finalidade) ? (/VENDER/.test(imovel.finalidade) ? "Aluguel ou venda" : "Para alugar") : "À venda")}</span>${capa ? `<img src="${e(capa.url)}" alt="${e(nomeDoImovel(imovel))}" loading="lazy">` : `<div class="sem-foto">Fotos em preparação</div>`}</div>
    <div class="dados">
      <strong>${e(imovel.titulo || (imovel.tipo + " em " + imovel.bairro))}</strong>
      <span class="onde">${e([imovel.bairro, imovel.cidade].filter(Boolean).join(", "))}</span>
      <span class="tracos">${e(traços)}</span>
      <span class="preco">${e(preco || "Consulte valores")}</span>
      ${imovel.valor_aluguel && imovel.valor_venda ? `<span class="valor-venda">Venda: ${e(moeda(imovel.valor_venda))}</span>` : ""}
      <span class="ver-imovel">Conhecer o imóvel <span aria-hidden="true">↗</span></span>
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
        estadoVazio(Boolean(busca))}
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
      ${WHATSAPP ? `<p><a class="botao whats" target="_blank" rel="noopener" href="${e(linkWhatsApp(
        "Olá! Vi no site o imóvel " + imovel.codigo + " (" + nomeDoImovel(imovel) + ") e quero saber mais."))}">
        Conversar pelo WhatsApp sobre este imóvel</a></p>` : ""}
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

module.exports = { e, linkWhatsApp, pagina, paginaInicial, nomeDoImovel, cartaoImovel, listaPublica, paginaImovel };
