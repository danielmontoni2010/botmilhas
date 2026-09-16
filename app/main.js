// Login, navegacao entre as telas e a pilula de status do robo.
import { $, $$, api, estado, guardado, haQuanto } from "./base.js";
import * as inicio from "./inicio.js";
import * as funis from "./funis.js";
import * as contatos from "./contatos.js";
import * as inbox from "./inbox.js";
import * as metricas from "./metricas.js";

const telas = { inicio, funis, contatos, inbox, metricas };
let telaAtual = null;
let timerStatus = null;

function rota() {
  const [nome, ...resto] = location.hash.slice(1).split("/");
  return { nome: telas[nome] ? nome : "inicio", param: resto.join("/") || null };
}

function mostrarTela() {
  const { nome, param } = rota();
  if (telaAtual && telaAtual !== nome) telas[telaAtual].sair?.();
  for (const k of Object.keys(telas)) $(`#view-${k}`).hidden = k !== nome;
  $$("[data-view]").forEach((a) => a.classList.toggle("ativo", a.dataset.view === nome));
  telaAtual = nome;
  telas[nome].entrar(param);
}

function renderStatus(s) {
  const u = s.ultima_execucao;
  let tipo = "erro", texto = "Robô sem notícias";
  if (u?.em) {
    const segundos = (Date.now() - Date.parse(u.em)) / 1000;
    if (segundos > 180) { tipo = "erro"; texto = `Robô parado · ${haQuanto(u.em)}`; }
    else if (u.motivo && u.motivo !== "nenhum funil ativo") { tipo = "aviso"; texto = "Robô com problema"; }
    else if (u.erros?.length) { tipo = "aviso"; texto = "Robô ativo · com avisos"; }
    else { tipo = "ok"; texto = `Robô ativo · ${haQuanto(u.em)}`; }
  }
  const pilula = $("#pilula");
  pilula.className = `pilula ${tipo}`;
  pilula.textContent = texto;
  pilula.title = [u?.motivo, ...(u?.erros ?? [])].filter(Boolean).join("\n");
  estado.numeros = s.numeros ?? null;
  if (s.conta) { estado.conta = s.conta; $("#conta").textContent = `@${s.conta}`; }
}

function abrirApp(status) {
  $("#tela-login").hidden = true;
  $("#app").hidden = false;
  renderStatus(status);
  mostrarTela();
  clearInterval(timerStatus);
  timerStatus = setInterval(() => api("status").then(renderStatus).catch(() => {}), 30000);
}

function sair(motivo = "") {
  estado.senha = null;
  guardado.limpar();
  clearInterval(timerStatus);
  if (telaAtual) telas[telaAtual].sair?.();
  funis.fecharEditor?.(true);
  $("#app").hidden = true;
  $("#tela-login").hidden = false;
  const msg = $("#login-msg");
  msg.textContent = motivo;
  msg.hidden = !motivo;
  $("#senha").focus();
}

async function entrar(ev) {
  ev.preventDefault();
  const valor = $("#senha").value;
  if (!valor) return;
  const botao = $("#btn-entrar");
  botao.disabled = true;
  botao.textContent = "Entrando…";
  $("#login-msg").hidden = true;
  estado.senha = valor;
  try {
    const s = await api("status");
    guardado.salvar(valor, $("#lembrar").checked);
    $("#senha").value = "";
    abrirApp(s);
  } catch (e) {
    estado.senha = null;
    $("#login-msg").textContent = e.message;
    $("#login-msg").hidden = false;
  } finally {
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
}

$("#form-login").addEventListener("submit", entrar);
$("#btn-sair").addEventListener("click", () => sair());
window.addEventListener("hashchange", () => { if (!$("#app").hidden) mostrarTela(); });
window.addEventListener("sessao-expirada", () => sair("A senha mudou ou está incorreta. Entre de novo."));

// entra direto se a senha ja estiver guardada neste aparelho
(async () => {
  const s = guardado.ler();
  if (!s) { $("#tela-login").hidden = false; return; }
  estado.senha = s;
  try { abrirApp(await api("status")); }
  catch (e) { sair(e.status === 401 ? "" : e.message); }
})();
