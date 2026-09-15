// Contatos: quem ja entrou em algum funil, com etiquetas e a janela de 24h.
import { $, el, api, toast, erroSilencioso, haQuanto, janela, carregarEtiquetas, CANAIS } from "./base.js";

let busca = "";
let filtro = null;
let timerBusca = null;

const ESTADOS = { rodando: "enviando", aguardando_resposta: "esperando toque", aguardando_tempo: "numa espera" };

export function entrar() {
  const alvo = $("#view-contatos");
  if (!alvo.dataset.montado) {
    alvo.dataset.montado = "1";
    const campoBusca = el("input", { type: "search", placeholder: "Buscar @usuário", "aria-label": "Buscar contato" });
    campoBusca.addEventListener("input", () => {
      clearTimeout(timerBusca);
      timerBusca = setTimeout(() => { busca = campoBusca.value.trim(); carregar(); }, 300);
    });
    alvo.append(
      el("div", { class: "cabecalho" },
        el("div", {}, el("h1", { text: "Contatos" }),
          el("p", { class: "sub", id: "contatos-sub", text: "Quem já entrou em algum funil." }))),
      el("div", { class: "filtros" }, campoBusca, el("div", { class: "chips", id: "filtro-etiquetas" })),
      el("div", { class: "tabela", id: "lista-contatos" }));
  }
  carregar();
}

async function carregar() {
  try {
    const [r, etiquetas] = await Promise.all([api("contatos", { busca, etiqueta: filtro }), carregarEtiquetas(true)]);
    $("#contatos-sub").textContent = `${r.total} ${r.total === 1 ? "contato" : "contatos"} no total. Janela aberta = dá para mandar mensagem agora.`;
    renderFiltros(etiquetas);
    renderLista(r.contatos);
  } catch (e) { erroSilencioso(e); }
}

function renderFiltros(etiquetas) {
  const alvo = $("#filtro-etiquetas");
  alvo.replaceChildren();
  if (!etiquetas.length) return;
  const botao = (valor, rotulo) => el("button", {
    type: "button", class: `chip ${filtro === valor ? "" : "cinza"}`,
    onclick: () => { filtro = valor; carregar(); },
  }, rotulo);
  alvo.append(botao(null, "Todas"));
  for (const e of etiquetas) alvo.append(botao(e.etiqueta, `${e.etiqueta} · ${e.contatos}`));
}

function renderLista(contatos) {
  const lista = $("#lista-contatos");
  lista.replaceChildren();
  if (!contatos.length) {
    lista.append(el("div", { class: "vazio" }, busca || filtro ? "Nenhum contato com esse filtro." : "Ninguém entrou em funil ainda."));
    return;
  }
  for (const c of contatos) lista.append(linha(c));
}

function linha(c) {
  const j = janela(c.ultima_msg_em);
  const chips = el("div", { class: "chips" });
  const desenharChips = () => {
    chips.replaceChildren();
    for (const e of c.etiquetas) {
      chips.append(el("span", { class: "chip" }, e,
        el("button", { type: "button", "aria-label": `Tirar etiqueta ${e}`, onclick: () => salvarEtiquetas(c, c.etiquetas.filter((x) => x !== e), desenharChips) }, "×")));
    }
    const nova = el("input", { type: "text", class: "nova-etiqueta", placeholder: "+ etiqueta", maxlength: "40" });
    nova.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || !nova.value.trim()) return;
      ev.preventDefault();
      salvarEtiquetas(c, [...c.etiquetas, nova.value.trim()], desenharChips);
    });
    chips.append(nova);
  };
  desenharChips();

  const funis = (c.funis ?? []).map((f) => el("div", { class: "meta", text: `⚡ ${f.funil} · ${ESTADOS[f.estado] ?? f.estado}` }));
  const usuario = c.username ?? "sem @";
  return el("article", { class: "contato" },
    el("div", { class: "avatar", text: usuario.slice(0, 1).toUpperCase() }),
    el("div", { class: "contato-info" },
      c.username
        ? el("a", { href: `https://instagram.com/${encodeURIComponent(c.username)}`, target: "_blank", rel: "noopener", text: `@${c.username}` })
        : el("strong", { text: usuario }),
      el("p", { class: "meta" },
        el("span", { text: `Veio por ${CANAIS[c.origem]?.toLowerCase() ?? "—"}` }),
        el("span", { class: j.aberta ? "janela-aberta" : "", text: j.texto }),
        el("span", { text: `desde ${haQuanto(c.criado_em)}` })),
      chips),
    el("div", { class: "contato-funis" }, funis.length ? funis : el("span", { class: "meta", text: "Sem funil em andamento" })),
    el("div", { class: "contato-acoes" },
      el("a", { class: "btn pequeno", href: `#inbox/${c.id}` }, "Conversa"),
      funis.length ? el("button", { class: "btn pequeno perigo", type: "button", onclick: () => parar(c) }, "Parar funis") : null));
}

async function salvarEtiquetas(c, etiquetas, redesenhar) {
  try {
    const r = await api("contato_etiquetas", { id: c.id, etiquetas });
    c.etiquetas = r.contato.etiquetas;
    redesenhar();
    carregarEtiquetas(true).then(renderFiltros);
  } catch (e) { erroSilencioso(e); }
}

async function parar(c) {
  if (!confirm(`Parar os funis de @${c.username ?? "este contato"}? Ele não recebe mais as próximas etapas.`)) return;
  try {
    const r = await api("contato_parar", { id: c.id });
    toast(r.paradas ? "Funis parados." : "Não havia funil em andamento.");
    carregar();
  } catch (e) { erroSilencioso(e); }
}
