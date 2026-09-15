// Coisas compartilhadas pelas telas do painel.
export const API_URL = "https://kbzazyzxilufkmvudnaq.supabase.co/functions/v1/painel";
export const estado = { senha: null, posts: null, etiquetas: null, conta: null };

export const $ = (s, raiz = document) => raiz.querySelector(s);
export const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

export const CANAIS = { comentario: "Comentários", story: "Respostas de story", direct: "Mensagem no direct" };

export const guardado = {
  ler() { try { return sessionStorage.getItem("painel_senha") || localStorage.getItem("painel_senha"); } catch { return null; } },
  salvar(s, lembrar) { try { sessionStorage.setItem("painel_senha", s); if (lembrar) localStorage.setItem("painel_senha", s); } catch {} },
  limpar() { try { sessionStorage.removeItem("painel_senha"); localStorage.removeItem("painel_senha"); } catch {} },
};

// cria elementos sem innerHTML: texto de seguidor nunca vira HTML
export function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) n.append(f instanceof Node ? f : String(f));
  return n;
}

// para os poucos lugares que montam HTML (conteudo dos nos do Drawflow)
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function api(acao, dados = {}) {
  let r;
  try {
    r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-painel-senha": estado.senha ?? "" },
      body: JSON.stringify({ acao, ...dados }),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.erro || `Erro ${r.status}`);
    e.status = r.status;
    if (r.status === 401 && acao !== "status") window.dispatchEvent(new Event("sessao-expirada"));
    throw e;
  }
  return j;
}

let timerToast = null;
export function toast(texto, tipo = "") {
  $(".toast")?.remove();
  document.body.append(el("div", { class: `toast ${tipo}`, role: "status", text: texto }));
  clearTimeout(timerToast);
  timerToast = setTimeout(() => $(".toast")?.remove(), 4500);
}

export const erroSilencioso = (e) => { if (e.status !== 401) toast(e.message, "erro"); };

export function haQuanto(v) {
  const s = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return dataHora(v);
}
export const dataHora = (v) => new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const dataCurta = (v) => new Date(String(v).replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function duracao(min) {
  min = Math.round(Number(min) || 0);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// mesmas regras do robo
export function personalizar(texto, username) {
  if (username) return texto.replaceAll("{nome}", username);
  const limpo = texto.replace(/,?\s*@?\{nome\}/g, "").trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}
export const normalizar = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).join(" ");

// a janela de 24h da Meta, a partir da ultima mensagem da pessoa
export function janela(ultimaMsgEm) {
  if (!ultimaMsgEm) return { aberta: false, texto: "Janela fechada" };
  const fim = new Date(ultimaMsgEm).getTime() + 24 * 3600 * 1000;
  const resta = fim - Date.now();
  if (resta <= 0) return { aberta: false, texto: "Janela fechada" };
  const h = Math.floor(resta / 3600000), m = Math.floor((resta % 3600000) / 60000);
  return { aberta: true, texto: `Janela aberta · ${h ? `${h} h ` : ""}${m} min` };
}

export async function carregarPosts() {
  if (!estado.posts) {
    try { estado.posts = (await api("posts")).posts; } catch { estado.posts = []; }
  }
  return estado.posts;
}

export async function carregarEtiquetas(forcar = false) {
  if (!estado.etiquetas || forcar) {
    try { estado.etiquetas = (await api("etiquetas")).etiquetas; } catch { estado.etiquetas = []; }
  }
  return estado.etiquetas;
}
