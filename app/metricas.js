// Metricas por funil: quantas pessoas passaram por cada etapa (conta pessoas, nao mensagens).
import { $, el, api, erroSilencioso, dataHora, duracao, CANAIS } from "./base.js";
import { TIPOS } from "./funis.js";

let funilId = null;
let dias = 30;

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const ROTULO_EVENTO = {
  entrou: "entrou no funil",
  enviou: "recebeu uma mensagem",
  respondeu: "tocou em",
  clicou: "clicou no link",
  etiquetou: "ganhou a etiqueta",
  concluiu: "chegou ao fim do funil",
  expirou: "saiu do funil",
  parou: "parou o funil",
  erro: "teve um erro",
};

export function entrar(param) {
  const tela = $("#view-metricas");
  if (!tela.dataset.montado) montar(tela);
  if (param) funilId = String(param);
  carregarLista();
}

function montar(tela) {
  tela.dataset.montado = "1";
  const seletor = el("select", { id: "met-funil", "aria-label": "Funil" });
  seletor.addEventListener("change", () => {
    funilId = seletor.value;
    history.replaceState(null, "", `#metricas/${funilId}`);
    carregarFunil();
  });
  const periodo = el("select", { id: "met-dias", "aria-label": "Período" },
    [7, 30, 90].map((n) => el("option", { value: String(n), text: `Últimos ${n} dias` })));
  periodo.value = String(dias);
  periodo.addEventListener("change", () => { dias = Number(periodo.value); carregarFunil(); });
  tela.append(
    el("div", { class: "cabecalho" },
      el("div", {}, el("h1", { text: "Métricas" }),
        el("p", { class: "sub", text: "Quantas pessoas passaram por cada etapa. Conta pessoas, não mensagens." })),
      el("div", { class: "filtros", style: "margin:0" }, seletor, periodo)),
    el("div", { id: "met-conteudo" }));
}

async function carregarLista() {
  let funis;
  try {
    funis = (await api("funis_listar")).funis;
  } catch (e) {
    return erroSilencioso(e);
  }
  const seletor = $("#met-funil");
  seletor.replaceChildren(...funis.map((f) => el("option", { value: String(f.id), text: f.nome })));
  if (!funis.length) {
    $("#met-conteudo").replaceChildren(el("div", { class: "vazio", text: "Crie um funil para ver as métricas." }));
    return;
  }
  if (!funis.some((f) => String(f.id) === funilId)) funilId = String(funis[0].id);
  seletor.value = funilId;
  carregarFunil();
}

async function carregarFunil() {
  const alvo = $("#met-conteudo");
  alvo.replaceChildren(el("p", { class: "dica", text: "Carregando…" }));
  let r;
  try {
    r = await api("metricas", { funil_id: funilId, dias });
  } catch (e) {
    alvo.replaceChildren();
    return erroSilencioso(e);
  }
  const t = r.totais;
  const entraram = t.entrou ?? 0;
  const deQuemEntrou = (n) => (entraram ? `${pct(n, entraram)}% de quem entrou` : null);
  alvo.replaceChildren(
    el("div", { class: "kpis" },
      kpi(entraram, "entraram no funil"),
      kpi(t.respondeu ?? 0, "tocaram em algum botão", deQuemEntrou(t.respondeu ?? 0)),
      kpi(t.clicou ?? 0, "clicaram em algum link", deQuemEntrou(t.clicou ?? 0)),
      kpi(t.concluiu ?? 0, "chegaram ao fim", deQuemEntrou(t.concluiu ?? 0))),
    blocoSerie(r.serie),
    blocoEtapas(r),
    blocoAtividade());
}

const kpi = (n, rotulo, extra = null) =>
  el("div", { class: "kpi" }, el("strong", { text: String(n) }), el("span", { text: rotulo }), extra ? el("em", { text: extra }) : null);

function blocoSerie(serie) {
  const porDia = new Map(serie.map((s) => [s.dia, s.entradas]));
  const pontos = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const chave = d.toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso do navegador
    pontos.push([chave, porDia.get(chave) ?? 0]);
  }
  const maior = Math.max(1, ...pontos.map(([, n]) => n));
  return el("div", { class: "bloco" },
    el("h3", { text: "Entradas por dia" }),
    el("div", { class: "serie", role: "img", "aria-label": "Gráfico de entradas por dia" },
      pontos.map(([dia, n]) => el("div", {
        style: `height:${Math.max(2, (n / maior) * 100)}%`,
        title: `${dia.split("-").reverse().join("/")}: ${n} ${n === 1 ? "pessoa" : "pessoas"}`,
      }))));
}

// etapas na ordem do caminho, a partir do gatilho
function ordem(compilado) {
  const vistos = [];
  const marcados = new Set();
  const fila = [compilado.inicio];
  while (fila.length) {
    const id = fila.shift();
    if (!id || marcados.has(id) || !compilado.nos[id]) continue;
    marcados.add(id);
    vistos.push(id);
    fila.push(...compilado.nos[id].saidas.filter(Boolean));
  }
  return vistos;
}

function barra(n, base, rotulo) {
  const p = pct(n, base);
  return el("div", { class: "barra-num" },
    el("span", { text: `${n} ${rotulo}${base ? ` · ${p}%` : ""}` }),
    el("div", { class: "trilha" }, el("i", { style: `width:${Math.min(100, p)}%` })));
}

function blocoEtapas(r) {
  const bloco = el("div", { class: "bloco" }, el("h3", { text: "Etapa por etapa" }));
  const comp = r.funil.compilado;
  if (!comp) {
    bloco.append(el("p", { class: "dica", text: "Esse funil tem erro e ainda não rodou. Abra no editor para corrigir." }));
    return bloco;
  }
  const entraram = r.stats[comp.inicio]?.entrou ?? 0;
  for (const id of ordem(comp)) {
    const n = comp.nos[id];
    const s = r.stats[id] ?? {};
    let desc = "";
    let sub = "";
    const barras = [];
    if (n.tipo === "gatilho") {
      desc = `Palavra-chave: ${(n.dados.palavras || []).join(", ")}`;
      sub = (n.dados.canais || []).map((c) => CANAIS[c]).join(" · ");
      barras.push(barra(s.entrou ?? 0, entraram, "entraram"));
    } else if (n.tipo === "mensagem") {
      desc = n.dados.texto;
      sub = n.dados.botao ? `Botão com link: ${n.dados.botao.texto}` : n.dados.respostas.length ? `Botões: ${n.dados.respostas.join(" · ")}` : "Só texto";
      barras.push(barra(s.enviou ?? 0, entraram, "receberam"));
      if (n.dados.botao) barras.push(barra(s.clicou ?? 0, s.enviou ?? 0, "clicaram"));
      for (const resp of n.dados.respostas) barras.push(barra(s.respostas?.[resp] ?? 0, s.enviou ?? 0, `tocaram “${resp}”`));
    } else if (n.tipo === "espera") {
      desc = `Esperar ${duracao(n.dados.minutos)}`;
      sub = "Depois segue sozinho";
    } else if (n.tipo === "etiqueta") {
      desc = `${n.dados.acao === "remover" ? "Remover" : "Adicionar"} etiqueta “${n.dados.etiqueta}”`;
      barras.push(barra(s.etiquetou ?? 0, entraram, n.dados.acao === "remover" ? "perderam a etiqueta" : "ganharam a etiqueta"));
    }
    bloco.append(el("div", { class: "etapa" },
      el("span", { class: "ic material-symbols-outlined", text: TIPOS[n.tipo]?.icone ?? "circle" }),
      el("div", { class: "desc" }, el("div", { text: desc, title: desc }), el("small", { text: sub })),
      el("div", { style: "display:grid;gap:6px" }, barras)));
  }
  return bloco;
}

function blocoAtividade() {
  const lista = el("div", {}, el("p", { class: "dica", text: "Carregando…" }));
  api("atividade", { funil_id: funilId })
    .then(({ itens }) => {
      lista.replaceChildren();
      if (!itens.length) lista.append(el("p", { class: "dica", text: "Nada ainda." }));
      for (const i of itens) {
        let texto = `${i.username ? `@${i.username}` : "Alguém"} ${ROTULO_EVENTO[i.tipo] ?? i.tipo}`;
        if (i.tipo === "respondeu" || i.tipo === "etiquetou") texto += ` “${i.detalhe}”`;
        else if (["erro", "expirou", "parou"].includes(i.tipo) && i.detalhe) texto += `: ${i.detalhe}`;
        lista.append(el("div", { class: "evento" }, el("time", { text: dataHora(i.criado_em) }), el("span", { text: texto })));
      }
    })
    .catch((e) => lista.replaceChildren(el("p", { class: "dica", text: e.message })));
  return el("div", { class: "bloco" }, el("h3", { text: "Atividade recente" }), lista);
}
