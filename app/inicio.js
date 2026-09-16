// Tela inicial: saudacao, atalhos, assistente guiado e cartao do Instagram.
import { $, el, api, estado } from "./base.js";
import { abrirEditor } from "./funis.js";
import { montarAssistente } from "./assistente.js";

let assistente = null;
const icone = (nome) => el("span", { class: "material-symbols-outlined", text: nome });
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function entrar() {
  const tela = $("#view-inicio");
  if (!tela.dataset.montado) {
    tela.dataset.montado = "1";
    montar(tela);
  }
  carregarPerfil();
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function atalho(ic, titulo, sub, acao, destaque = false) {
  return el("button", { type: "button", class: `atalho${destaque ? " destaque" : ""}`, onclick: acao },
    el("span", { class: "atalho-ic" }, icone(ic)),
    el("span", { class: "atalho-txt" }, el("strong", { text: titulo }), el("small", { text: sub })));
}

function acao(ic, titulo, sub, fn) {
  return el("button", { type: "button", class: "acao", onclick: fn },
    icone(ic),
    el("span", { class: "txt" }, el("strong", { text: titulo }), el("small", { text: sub })),
    icone("chevron_right"));
}

function irParaAssistente() {
  $("#assistente").scrollIntoView({ behavior: "smooth", block: "start" });
}

function montar(tela) {
  tela.append(
    el("header", { class: "inicio-topo" },
      el("div", {},
        el("h1", { text: `${saudacao()}, Daniel! 👋` }),
        el("p", { class: "sub", text: "Crie, edite e acompanhe as automações do seu Instagram." })),
      el("a", { class: "ig-botao", href: "https://instagram.com/eudanielmontoni", target: "_blank", rel: "noopener" },
        el("span", { class: "ig-logo" }, icone("photo_camera")),
        el("span", { id: "ig-botao-txt", text: "Instagram conectado" }),
        icone("chevron_right"))),
    el("div", { class: "atalhos" },
      atalho("add", "Novo funil", "Monte do zero no editor", () => abrirEditor(null), true),
      atalho("auto_awesome", "Usar modelo", "O assistente monta pra você", () => { assistente.recomecar(); irParaAssistente(); }),
      atalho("bar_chart", "Ver métricas", "Como os funis estão indo", () => { location.hash = "#metricas"; }),
      atalho("forum", "Responder conversas", "Caixa de entrada do direct", () => { location.hash = "#inbox"; })),
    el("div", { class: "inicio-grade" },
      el("section", { class: "painel-chat", id: "assistente", "aria-label": "Assistente BotMilhas" }),
      el("aside", { class: "inicio-lado" },
        el("div", { class: "ig-cartao", id: "ig-cartao" }, el("p", { class: "dica", text: "Carregando seu perfil…" })),
        el("h3", { class: "titulo-lado" }, icone("bolt"), "Ações rápidas"),
        el("div", { class: "acoes" },
          acao("chat_bubble", "Entregar um link", "Comentou a palavra → recebe o link", () => { assistente.iniciarModelo("link"); irParaAssistente(); }),
          acao("groups", "Convite para o grupo", "Leva a pessoa pro grupo gratuito", () => { assistente.iniciarModelo("grupo"); irParaAssistente(); }),
          acao("table_chart", "Planilha de Reels", "Planilha, promoção e oferta", () => { assistente.iniciarModelo("planilha"); irParaAssistente(); }),
          acao("contacts", "Contatos", "Quem entrou nos funis e as etiquetas", () => { location.hash = "#contatos"; }),
          acao("account_tree", "Todos os funis", "Editar, pausar e ativar", () => { location.hash = "#funis"; })),
        el("figure", { class: "dica-card" },
          icone("format_quote"),
          el("blockquote", { text: "O toque no botão da primeira mensagem é o que libera 24h para o resto do funil chegar." }),
          el("figcaption", { text: "— Dica do BotMilhas" })))));
  assistente = montarAssistente($("#assistente"));
}

async function carregarPerfil() {
  const alvo = $("#ig-cartao");
  let p = null;
  try {
    p = (await api("perfil")).perfil;
  } catch (e) {
    if (e.status === 401) return;
    alvo.replaceChildren(el("p", { class: "dica", text: `Não consegui ler o perfil agora: ${e.message}` }));
    return;
  }
  const usuario = p.username ?? estado.conta ?? "eudanielmontoni";
  $("#ig-botao-txt").textContent = `@${usuario}`;
  const numero = (valor, rotulo) => el("div", {},
    el("strong", { text: valor == null ? "—" : compacto.format(valor) }),
    el("small", { text: rotulo }));
  const n = estado.numeros ?? {};
  alvo.replaceChildren(
    el("div", { class: "ig-cabeca" },
      el("span", { class: "ig-foto" }, p.foto ? el("img", { src: p.foto, alt: "" }) : el("span", { text: usuario.slice(0, 1).toUpperCase() })),
      el("div", {}, el("strong", { text: "Instagram conectado" }), el("small", { text: `@${usuario}` })),
      el("a", { href: `https://instagram.com/${encodeURIComponent(usuario)}`, target: "_blank", rel: "noopener", text: "Abrir" })),
    el("div", { class: "ig-numeros" },
      numero(p.seguidores, "Seguidores"),
      numero(p.seguindo, "Seguindo"),
      numero(p.publicacoes, "Publicações")),
    el("div", { class: "ig-robo" },
      el("span", {}, el("b", { text: String(n.funis_ativos ?? "—") }), " funis ativos"),
      el("span", {}, el("b", { text: String(n.contatos ?? "—") }), " contatos"),
      el("span", {}, el("b", { text: String(n.enviadas_7d ?? "—") }), " envios (7d)")));
}
