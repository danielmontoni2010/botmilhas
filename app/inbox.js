// Caixa de entrada: conversas do direct, lidas na hora pela API (nao ficam guardadas no banco).
import { $, el, api, toast, erroSilencioso, haQuanto, dataHora } from "./base.js";

let conversas = [];
let atual = null;      // id da conversa aberta
let alvo = null;       // contato vindo da tela de Contatos (#inbox/<id>)
let timer = null;
let janelaAte = null;
let refs = null;       // pedacos da conversa aberta, para atualizar sem apagar o que esta sendo digitado

export function entrar(param) {
  const tela = $("#view-inbox");
  if (!tela.dataset.montado) montar(tela);
  alvo = param;
  carregarConversas();
  clearInterval(timer);
  timer = setInterval(() => {
    carregarConversas(true);
    if (atual) abrir(atual, true);
  }, 20000);
}

export function sair() {
  clearInterval(timer);
}

function montar(tela) {
  tela.dataset.montado = "1";
  tela.append(
    el("div", { class: "inbox-lista" },
      el("header", {},
        el("h1", { text: "Conversas", style: "font-size:20px" }),
        el("button", { class: "btn pequeno", type: "button", onclick: () => carregarConversas() }, "Atualizar")),
      el("div", { class: "inbox-conversas", id: "inbox-conversas" })),
    el("div", { class: "inbox-thread", id: "inbox-thread" },
      el("div", { class: "thread-vazia", text: "Escolha uma conversa." })));
}

async function carregarConversas(silencioso = false) {
  try {
    conversas = (await api("conversas")).conversas;
    renderLista();
    if (alvo) {
      const c = conversas.find((x) => x.contato?.id === alvo);
      alvo = null;
      if (c) abrir(c.id);
      else toast("Essa pessoa não tem conversa recente no direct.");
    }
  } catch (e) {
    if (!silencioso) erroSilencioso(e);
  }
}

function previaTexto(u) {
  if (!u) return "";
  const quem = u.de_mim ? "Você: " : "";
  if (u.tipo === "story") return `${quem}respondeu seu story${u.texto ? `: ${u.texto}` : ""}`;
  if (u.tipo === "mencao") return "mencionou você num story";
  if (u.tipo === "imagem") return `${quem}📷 imagem`;
  if (u.tipo === "anexo") return `${quem}📎 anexo`;
  return quem + (u.texto || "");
}

function renderLista() {
  const lista = $("#inbox-conversas");
  lista.replaceChildren();
  if (!conversas.length) {
    lista.append(el("div", { class: "thread-vazia", text: "Nenhuma conversa recente." }));
    return;
  }
  for (const c of conversas) {
    const usuario = c.contato?.username;
    lista.append(el("button", { type: "button", class: `conversa${c.id === atual ? " ativa" : ""}`, onclick: () => abrir(c.id) },
      el("div", { class: "avatar", text: (usuario ?? "?").slice(0, 1).toUpperCase() }),
      el("div", { style: "min-width:0" },
        el("div", { class: "topo" }, el("span", { text: usuario ? `@${usuario}` : "Conversa" }), el("small", { text: haQuanto(c.atualizada) })),
        el("div", { class: "previa-texto", text: previaTexto(c.ultima) }),
        c.contato?.etiquetas?.length
          ? el("div", { class: "chips" }, c.contato.etiquetas.slice(0, 3).map((e) => el("span", { class: "chip cinza", text: e })))
          : null)));
  }
}

async function abrir(convId, silencioso = false) {
  const nova = atual !== convId;
  atual = convId;
  $("#view-inbox").classList.add("lendo");
  if (!silencioso) renderLista();
  const thread = $("#inbox-thread");
  if (nova) {
    refs = null;
    thread.replaceChildren(el("div", { class: "thread-vazia", text: "Carregando…" }));
  }
  try {
    const r = await api("mensagens", { conversa_id: convId });
    if (atual !== convId) return;
    renderThread(r);
  } catch (e) {
    if (silencioso) return;
    thread.replaceChildren(el("div", { class: "thread-vazia", text: e.message }));
    erroSilencioso(e);
  }
}

function renderThread(r) {
  const thread = $("#inbox-thread");
  const nova = !refs;
  if (nova) {
    const texto = el("textarea", { rows: 2, placeholder: "Escreva uma resposta…", "aria-label": "Mensagem" });
    const botao = el("button", { class: "btn primario", type: "button" }, "Enviar");
    const aviso = el("p", { class: "dica" });
    botao.addEventListener("click", () => enviar());
    texto.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) enviar(); });
    refs = {
      topo: el("div", { class: "thread-topo" }),
      msgs: el("div", { class: "thread-msgs" }),
      compor: el("div", { class: "thread-compor" }, el("div", { class: "linha" }, texto, botao), aviso),
      texto, botao, aviso,
    };
    thread.replaceChildren(refs.topo, refs.msgs, refs.compor);
  }

  const c = r.contato;
  refs.topo.replaceChildren(
    el("button", { class: "btn fantasma voltar-lista", type: "button", onclick: () => $("#view-inbox").classList.remove("lendo") }, "←"),
    el("div", { class: "avatar", text: (c?.username ?? "?").slice(0, 1).toUpperCase() }),
    el("div", {},
      c?.username
        ? el("a", { class: "nome", href: `https://instagram.com/${encodeURIComponent(c.username)}`, target: "_blank", rel: "noopener", text: `@${c.username}` })
        : el("span", { class: "nome", text: "Conversa" }),
      el("div", { class: "chips" },
        (c?.etiquetas ?? []).map((e) => el("span", { class: "chip cinza", text: e })),
        (c?.funis ?? []).map((f) => el("span", { class: "chip", text: `⚡ ${f.funil}` })))),
    c?.funis?.length
      ? el("button", { class: "btn pequeno perigo", type: "button", style: "margin-left:auto", onclick: () => pararFunis(c) }, "Parar funis")
      : null);

  const noFim = refs.msgs.scrollHeight - refs.msgs.scrollTop - refs.msgs.clientHeight < 80;
  refs.msgs.replaceChildren(...r.mensagens.map(bolha));
  if (!r.mensagens.length) refs.msgs.append(el("div", { class: "thread-vazia", text: "Sem mensagens recentes." }));
  if (nova || noFim) refs.msgs.scrollTop = refs.msgs.scrollHeight;

  janelaAte = r.janela_ate;
  atualizarJanela();
}

function atualizarJanela() {
  const aberta = Boolean(janelaAte) && Date.parse(janelaAte) > Date.now();
  refs.texto.disabled = !aberta;
  refs.botao.disabled = !aberta;
  refs.aviso.textContent = aberta
    ? `Dá para responder até ${dataHora(janelaAte)} (24h depois da última mensagem da pessoa). Ctrl+Enter envia.`
    : "Passaram 24h desde a última mensagem dessa pessoa. A Meta só deixa responder quando ela escrever de novo.";
}

function bolha(m) {
  const b = el("div", { class: `msg${m.de_mim ? " minha" : ""}` });
  if (m.tipo === "story") b.append(el("span", { class: "tag", text: "↩ respondeu seu story" }));
  if (m.tipo === "mencao") b.append(el("span", { class: "tag", text: "mencionou você num story" }));
  if (m.imagem) b.append(el("img", { src: m.imagem, alt: "imagem enviada", loading: "lazy" }));
  if (m.texto) b.append(document.createTextNode(m.texto));
  else if (m.tipo === "anexo") b.append(document.createTextNode("📎 anexo"));
  for (const botao of m.botoes ?? []) b.append(el("span", { class: "cta", text: `🔗 ${botao}` }));
  b.append(el("small", { text: dataHora(m.quando) }));
  return b;
}

async function enviar() {
  const texto = refs.texto.value.trim();
  if (!texto || !atual) return;
  refs.botao.disabled = true;
  try {
    await api("enviar", { conversa_id: atual, texto });
    refs.texto.value = "";
    await abrir(atual, true);
  } catch (e) {
    erroSilencioso(e);
  } finally {
    atualizarJanela();
  }
}

async function pararFunis(c) {
  if (!confirm(`Parar os funis de @${c.username ?? "este contato"}? Ele não recebe mais as próximas etapas.`)) return;
  try {
    const r = await api("contato_parar", { id: c.id });
    toast(r.paradas ? "Funis parados." : "Não havia funil em andamento.");
    abrir(atual, true);
  } catch (e) {
    erroSilencioso(e);
  }
}
