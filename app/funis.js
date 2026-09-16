// Lista de funis e o editor visual (Drawflow).
/* global Drawflow */
import { $, $$, el, esc, api, toast, erroSilencioso, personalizar, duracao, carregarPosts, carregarEtiquetas, estado, CANAIS, normalizar } from "./base.js";

const TIPOS = {
  gatilho: { rotulo: 'Gatilho', icone: 'bolt', entradas: 0 },
  mensagem: { rotulo: 'Mensagem', icone: 'chat', entradas: 1 },
  espera: { rotulo: 'Espera', icone: 'schedule', entradas: 1 },
  etiqueta: { rotulo: 'Etiqueta', icone: 'label', entradas: 1 },
};
const PADRAO = {
  gatilho: () => ({ palavras: [], canais: ["comentario", "story"], post_id: null, respostas_publicas: [] }),
  mensagem: () => ({ texto: "", botao: null, respostas: [] }),
  espera: () => ({ minutos: 60 }),
  etiqueta: () => ({ acao: "adicionar", etiqueta: "" }),
};
const saidasDe = (tipo, d) => (tipo === "mensagem" ? Math.max(1, (d.respostas || []).length) : 1);

let funis = [];
let editor = null;
let funil = null;          // funil aberto no editor
let selecionado = null;    // id do no selecionado
let alterado = false;
let stats = {};

// ---------- lista ----------

export function entrar() {
  const alvo = $("#view-funis");
  if (!alvo.dataset.montado) {
    alvo.dataset.montado = "1";
    alvo.append(
      el("div", { class: "cabecalho" },
        el("div", {}, el("h1", { text: "Funis" }),
          el("p", { class: "sub", text: "Cada funil começa com um gatilho e segue pelas etapas que você desenhar." })),
        el("button", { class: "btn primario", type: "button", onclick: () => abrirEditor(null) }, "+ Novo funil")),
      el("div", { class: "grade-cartoes", id: "lista-funis" }));
  }
  carregarLista();
}

async function carregarLista() {
  try {
    funis = (await api("funis_listar")).funis;
    renderLista();
  } catch (e) { erroSilencioso(e); }
}

const numero = (n, rotulo) => el("div", { class: "numero" }, el("strong", { text: String(n ?? 0) }), el("span", { text: rotulo }));

function renderLista() {
  const lista = $("#lista-funis");
  lista.replaceChildren();
  if (!funis.length) {
    lista.append(el("div", { class: "vazio" }, "Nenhum funil ainda. Crie o primeiro em “Novo funil”."));
    return;
  }
  for (const f of funis) {
    const chave = el("input", { type: "checkbox", "aria-label": `Funil ${f.nome} ativo` });
    chave.checked = f.ativo;
    chave.addEventListener("change", () => alternar(f, chave));
    const g = f.gatilho ?? {};
    lista.append(el("article", { class: "cartao" },
      el("div", { class: "cartao-topo" },
        el("h3", { text: f.nome }),
        el("label", { class: "switch", title: f.ativo ? "Pausar" : "Ativar" }, chave, el("span", { class: "trilho" }))),
      el("div", { class: "chips" }, (g.palavras ?? []).map((p) => el("span", { class: "chip", text: p }))),
      el("p", { class: "meta", text: (g.canais ?? []).map((c) => CANAIS[c]).join(" · ") || "Gatilho incompleto" }),
      el("div", { class: "numeros" },
        numero(f.entradas_7d, "entraram (7 dias)"),
        numero(f.em_andamento, "no funil agora"),
        numero(f.cliques_7d, "clicaram (7 dias)")),
      f.valido ? null : el("p", { class: "aviso-linha", text: "⚠ Tem erro para corrigir antes de ativar." }),
      el("div", { class: "cartao-acoes" },
        el("button", { class: "btn", type: "button", onclick: () => abrirEditor(f.id) }, "Editar"),
        el("a", { class: "btn fantasma", href: `#metricas/${f.id}` }, "Métricas"))));
  }
}

async function alternar(f, chave) {
  chave.disabled = true;
  try {
    await api("funil_ativar", { id: f.id, ativo: chave.checked });
    f.ativo = chave.checked;
    toast(f.ativo ? `“${f.nome}” ativado. Vale a partir do próximo minuto.` : `“${f.nome}” pausado. Quem já está nele termina o caminho.`);
    renderLista();
  } catch (e) {
    chave.checked = !chave.checked;
    chave.disabled = false;
    erroSilencioso(e);
  }
}

// ---------- editor ----------

const dadosDF = () => editor.drawflow.drawflow[editor.module].data;
const no = (id) => editor.getNodeFromId(id);

function montarEditor() {
  if (editor) return;
  const area = $("#drawflow");
  editor = new Drawflow(area);
  editor.reroute = false;
  editor.zoom_min = 0.35;
  editor.zoom_max = 1.6;
  editor.start();

  editor.on("nodeSelected", (id) => selecionar(String(id)));
  editor.on("nodeUnselected", () => selecionar(null));
  editor.on("nodeRemoved", (id) => { if (selecionado === String(id)) selecionar(null); marcar(); });
  editor.on("nodeMoved", marcar);
  editor.on("connectionCreated", (c) => { umaLigacaoPorSaida(c); marcar(); });
  editor.on("connectionRemoved", marcar);

  // o Drawflow apaga o no selecionado com Delete mesmo se voce estiver digitando no painel lateral
  window.addEventListener("keydown", (e) => {
    if ($("#editor").hidden || (e.key !== "Delete" && e.key !== "Backspace")) return;
    const digitando = e.target?.closest?.("input, textarea, select, [contenteditable]");
    const ehGatilho = selecionado && no(selecionado)?.name === "gatilho";
    if (digitando || ehGatilho) e.stopPropagation();
  }, true);
  // o gatilho nao pode ser apagado pelo botao direito
  area.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".drawflow-node.gatilho")) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  $("#ed-voltar").addEventListener("click", () => fecharEditor());
  $("#ed-salvar").addEventListener("click", salvar);
  $("#ed-nome").addEventListener("input", marcar);
  $("#ed-ativo").addEventListener("change", marcar);
  $$("[data-adicionar]").forEach((b) => b.addEventListener("click", () => adicionar(b.dataset.adicionar)));
  $("#ed-zoom-mais").addEventListener("click", () => editor.zoom_in());
  $("#ed-zoom-menos").addEventListener("click", () => editor.zoom_out());
  $("#ed-zoom-reset").addEventListener("click", enquadrar);
  window.addEventListener("beforeunload", (e) => {
    if (alterado && !$("#editor").hidden) { e.preventDefault(); e.returnValue = ""; }
  });
}

// cada saida leva a um lugar so: o robo segue a primeira ligacao
function umaLigacaoPorSaida({ output_id, input_id, output_class }) {
  if (String(output_id) === String(input_id)) {
    editor.removeSingleConnection(output_id, input_id, output_class, "input_1");
    return;
  }
  const conexoes = no(output_id).outputs[output_class]?.connections ?? [];
  for (const c of conexoes) {
    if (String(c.node) !== String(input_id)) editor.removeSingleConnection(output_id, c.node, output_class, c.output);
  }
}

export async function abrirEditor(id) {
  montarEditor();
  $("#editor").hidden = false;
  editor.clear();
  stats = {};
  selecionar(null);
  mostrarAvisos([], []);
  if (id) {
    try {
      const r = await api("funil_obter", { id });
      funil = r.funil;
      stats = r.stats ?? {};
      editor.import(funil.desenho);
    } catch (e) {
      erroSilencioso(e);
      fecharEditor(true);
      return;
    }
  } else {
    funil = { id: null, nome: "", ativo: false };
    const g = editor.addNode("gatilho", 0, 1, 60, 150, "gatilho", PADRAO.gatilho(), "");
    const m = editor.addNode("mensagem", 1, 1, 400, 130, "mensagem", PADRAO.mensagem(), "");
    editor.addConnection(g, m, "output_1", "input_1");
  }
  for (const nid of Object.keys(dadosDF())) renderNo(nid);
  $("#ed-nome").value = funil.nome;
  $("#ed-ativo").checked = Boolean(funil.ativo);
  alterado = !id;
  atualizarSelo();
  carregarPosts();
  carregarEtiquetas(true);
  // o Drawflow guarda zoom e posicao entre aberturas; enquadra depois que as caixas tiverem tamanho
  requestAnimationFrame(enquadrar);
  if (!id) setTimeout(() => selecionarNo(Object.keys(dadosDF())[0]), 50);
}

// cabe o funil inteiro na tela (zoom de no maximo 100%)
function enquadrar() {
  const nos = Object.values(dadosDF());
  const area = $("#drawflow");
  const W = area.clientWidth;
  const H = area.clientHeight;
  if (!nos.length || !W || !H) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nos) {
    const caixa = $(`#node-${n.id}`);
    minX = Math.min(minX, n.pos_x);
    minY = Math.min(minY, n.pos_y);
    maxX = Math.max(maxX, n.pos_x + (caixa?.offsetWidth || 250));
    maxY = Math.max(maxY, n.pos_y + (caixa?.offsetHeight || 150));
  }
  const margem = 40;
  const largura = maxX - minX;
  const altura = maxY - minY;
  const z = Math.min(1, Math.max(editor.zoom_min, Math.min((W - 2 * margem) / largura, (H - 2 * margem) / altura)));
  // o Drawflow escala a partir do centro da tela (transform-origin padrao 50% 50%)
  const sobraX = Math.max(0, (W - 2 * margem - largura * z) / 2);
  const sobraY = Math.max(0, (H - 2 * margem - altura * z) / 2);
  editor.zoom = z;
  editor.zoom_last_value = z;
  editor.canvas_x = margem + sobraX - W / 2 - (minX - W / 2) * z;
  editor.canvas_y = margem + sobraY - H / 2 - (minY - H / 2) * z;
  editor.precanvas.style.transform = `translate(${editor.canvas_x}px, ${editor.canvas_y}px) scale(${z})`;
}

export function fecharEditor(semPerguntar = false) {
  if ($("#editor").hidden) return;
  if (!semPerguntar && alterado && !confirm("Sair sem salvar? As alterações vão se perder.")) return;
  $("#editor").hidden = true;
  alterado = false;
  if (!semPerguntar) carregarLista();
}

function marcar() {
  alterado = true;
  atualizarSelo();
}

function atualizarSelo() {
  const selo = $("#ed-selo");
  if (alterado) { selo.className = "selo alterado"; selo.textContent = "Não salvo"; }
  else if (funil?.ativo) { selo.className = "selo ativo"; selo.textContent = "Ativo"; }
  else { selo.className = "selo"; selo.textContent = "Rascunho"; }
}

function renderNo(id) {
  const n = no(id);
  const alvo = $(`#node-${id} .drawflow_content_node`);
  if (!n || !alvo) return;
  alvo.innerHTML = htmlNo(n.name, n.data, String(id));
  $(`#node-${id}`).dataset.saidas = String(Object.keys(n.outputs).length);
  editor.updateConnectionNodes(`node-${id}`);
}

function htmlNo(tipo, d, id) {
  const t = TIPOS[tipo];
  const s = stats[id];
  let corpo = "";
  if (tipo === "gatilho") {
    const palavras = (d.palavras || []).map((p) => `<span>${esc(p)}</span>`).join("");
    corpo = `<div class="no-chips">${palavras || "<em>sem palavra-chave</em>"}</div>
      <div class="no-linha">${(d.canais || []).map((c) => esc(CANAIS[c])).join(" · ") || "<em>escolha onde começa</em>"}</div>
      ${d.post_id ? '<div class="no-linha">Só em um post específico</div>' : ""}`;
  } else if (tipo === "mensagem") {
    const texto = (d.texto || "").trim();
    corpo = `<div class="no-texto">${texto ? esc(texto.length > 150 ? texto.slice(0, 150) + "…" : texto) : "<em>escreva a mensagem</em>"}</div>`;
    if (d.botao) corpo += `<div class="no-botao-link">🔗 ${esc(d.botao.texto || "Botão com link")}</div>`;
    if (d.respostas?.length) {
      corpo += `<ol class="no-respostas">${d.respostas.map((r) => {
        const n = s?.respostas?.[r];
        return `<li><span>${esc(r || "…")}</span>${n ? `<b>${n}</b>` : ""}</li>`;
      }).join("")}</ol>`;
    }
  } else if (tipo === "espera") {
    corpo = `<div class="no-grande">${esc(duracao(d.minutos))}</div><div class="no-linha">depois segue sozinho</div>`;
  } else if (tipo === "etiqueta") {
    corpo = `<div class="no-linha">${d.acao === "remover" ? "Remover etiqueta" : "Adicionar etiqueta"}</div>
      <div class="no-chips"><span>${esc(d.etiqueta || "…")}</span></div>`;
  }
  const partes = [];
  if (s?.entrou) partes.push(`👥 ${s.entrou} entraram`);
  if (s?.enviou) partes.push(`📨 ${s.enviou} receberam`);
  if (s?.clicou) partes.push(`👆 ${s.clicou} clicaram`);
  if (s?.etiquetou) partes.push(`🏷️ ${s.etiquetou}`);
  const rodape = partes.length ? `<div class="no-rodape">${partes.join(" · ")} <small>(30 dias)</small></div>` : "";
  return `<div class="no no-${tipo}"><div class="no-topo"><span class="material-symbols-outlined">${t.icone}</span>${t.rotulo}</div><div class="no-corpo">${corpo}</div>${rodape}</div>`;
}

function centroVisivel() {
  const area = $("#drawflow");
  return {
    x: (area.clientWidth / 2 - 125 - editor.canvas_x) / editor.zoom,
    y: (area.clientHeight / 2 - 80 - editor.canvas_y) / editor.zoom,
  };
}

function adicionar(tipo) {
  const base = selecionado ? no(selecionado) : null;
  const pos = base ? { x: base.pos_x + 320, y: base.pos_y + 20 } : centroVisivel();
  const dados = PADRAO[tipo]();
  const id = editor.addNode(tipo, TIPOS[tipo].entradas, saidasDe(tipo, dados), pos.x, pos.y, tipo, dados, "");
  renderNo(id);
  if (base) {
    // liga na primeira saida livre da etapa selecionada
    const livre = Object.entries(base.outputs).find(([, o]) => !o.connections.length)?.[0];
    if (livre) editor.addConnection(base.id, id, livre, "input_1");
  }
  marcar();
  selecionarNo(id);
}

function selecionarNo(id) {
  if (id == null) return;
  $$(".drawflow-node.selected").forEach((n) => n.classList.remove("selected"));
  const elNo = $(`#node-${id}`);
  if (!elNo) return;
  elNo.classList.add("selected");
  editor.node_selected = elNo;
  selecionar(String(id));
}

function desselecionar() {
  $$(".drawflow-node.selected").forEach((n) => n.classList.remove("selected"));
  editor.node_selected = null;
  selecionar(null);
}

function atualizar(id, patch) {
  const n = no(id);
  editor.updateNodeDataFromId(id, { ...n.data, ...patch });
  renderNo(id);
  marcar();
}

// ---------- painel lateral ----------

function selecionar(id) {
  selecionado = id;
  const painel = $("#ed-painel");
  painel.replaceChildren();
  if (!id || !no(id)) {
    selecionado = null;
    painel.classList.remove("aberto");
    painel.append(el("div", { class: "ed-dica" },
      el("h3", { text: "Monte o funil" }),
      el("p", { text: "Toque numa etapa para editar. Para ligar uma etapa na outra, arraste a bolinha da direita até a bolinha da esquerda da próxima." }),
      el("p", { text: "Use os botões de cima para colocar mensagens, esperas e etiquetas. Com uma etapa selecionada, a nova já entra ligada nela." }),
      el("p", { text: "Lembrete da Meta: só dá para mandar mensagem até 24h depois da última interação da pessoa. Botões de resposta rápida abrem mais 24h a cada toque." })));
    return;
  }
  const n = no(id);
  painel.classList.add("aberto");
  painel.append(el("div", { class: "ed-painel-topo" },
    el("h3", {}, el("span", { class: "ic material-symbols-outlined", text: TIPOS[n.name].icone }), TIPOS[n.name].rotulo),
    el("button", { class: "btn fantasma icone", type: "button", "aria-label": "Fechar", onclick: desselecionar }, "✕")));
  const formularios = { gatilho: formGatilho, mensagem: formMensagem, espera: formEspera, etiqueta: formEtiqueta };
  painel.append(formularios[n.name](id, n.data));
  if (n.name !== "gatilho") {
    painel.append(el("button", { class: "btn perigo largo", type: "button", onclick: () => editor.removeNodeId(`node-${id}`) }, "Excluir etapa"));
  }
}

function campo(rotulo, controle, ...extra) {
  return el("div", { class: "campo" }, el("label", { text: rotulo }), controle, ...extra);
}

function formGatilho(id, d) {
  const f = el("div", { class: "form" });
  const palavras = el("input", { type: "text", placeholder: "Ex.: GRUPO, QUERO O GRUPO" });
  palavras.value = (d.palavras || []).join(", ");
  palavras.addEventListener("input", () => atualizar(id, { palavras: palavras.value.split(",").map((p) => p.trim()).filter(Boolean) }));
  f.append(campo("Palavras-chave", palavras,
    el("p", { class: "dica", text: "Separe por vírgula. Maiúscula, acento e pontuação não importam." })));

  const canais = el("div", { class: "opcoes" });
  for (const [valor, rotulo] of Object.entries(CANAIS)) {
    const cb = el("input", { type: "checkbox" });
    cb.checked = (d.canais || []).includes(valor);
    cb.addEventListener("change", () => {
      const atual = new Set(no(id).data.canais || []);
      cb.checked ? atual.add(valor) : atual.delete(valor);
      atualizar(id, { canais: Object.keys(CANAIS).filter((c) => atual.has(c)) });
      selecionar(id);
    });
    canais.append(el("label", { class: "opcao" }, cb, rotulo));
  }
  f.append(el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Onde o funil começa" }), canais,
    el("p", { class: "dica", text: "Comentário num post, resposta a um story seu, ou a palavra mandada direto no seu direct." })));

  if ((d.canais || []).includes("comentario")) {
    const escolha = el("div", { class: "opcoes" });
    const grade = el("div", { class: "grade-posts" });
    const radio = (valor, rotulo) => {
      const r = el("input", { type: "radio", name: `onde-${id}`, value: valor });
      r.checked = valor === (d.post_id ? "post" : "todos");
      r.addEventListener("change", () => {
        if (valor === "todos") atualizar(id, { post_id: null });
        grade.hidden = valor === "todos";
      });
      return el("label", { class: "opcao" }, r, rotulo);
    };
    escolha.append(radio("todos", "Todos os posts"), radio("post", "Um post específico"));
    grade.hidden = !d.post_id;
    const desenharPosts = (posts) => {
      grade.replaceChildren();
      if (!posts.length) { grade.append(el("p", { class: "dica", text: "Não consegui carregar seus posts." })); return; }
      for (const p of posts) {
        const escolhido = p.id === no(id).data.post_id;
        grade.append(el("button", {
          type: "button", class: `post${escolhido ? " escolhido" : ""}`, title: p.legenda || "Post",
          onclick: () => { atualizar(id, { post_id: p.id }); desenharPosts(posts); },
        }, p.imagem ? el("img", { src: p.imagem, alt: "", loading: "lazy" }) : null));
      }
    };
    if (estado.posts) desenharPosts(estado.posts);
    else { grade.append(el("p", { class: "dica", text: "Carregando posts…" })); carregarPosts().then(desenharPosts); }
    f.append(el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Em quais posts" }), escolha, grade));

    const publicas = el("textarea", { rows: 3, placeholder: "@{nome} te mandei no direct! 📩\nEnviado! Confere teu direct 😉" });
    publicas.value = (d.respostas_publicas || []).join("\n");
    publicas.addEventListener("input", () => atualizar(id, { respostas_publicas: publicas.value.split("\n").map((l) => l.trim()).filter(Boolean) }));
    f.append(campo("Resposta no comentário (opcional)", publicas,
      el("p", { class: "dica", text: "Uma por linha, até 5. O robô sorteia uma. {nome} vira o @ da pessoa." })));
  }
  return f;
}

function formMensagem(id, d) {
  const f = el("div", { class: "form" });
  const tipoBotao = d.respostas?.length ? "respostas" : d.botao ? "link" : "nenhum";

  const texto = el("textarea", { rows: 6, placeholder: "Escreva a mensagem…" });
  texto.value = d.texto || "";
  const contador = el("span", { class: "contador" });
  const previa = el("div", { class: "cel-corpo" });
  const contar = () => {
    const max = no(id).data.botao ? 640 : 1000;
    contador.textContent = `${texto.value.length}/${max}`;
    contador.classList.toggle("excesso", texto.value.length > max);
  };
  const desenharPrevia = () => {
    const dd = no(id).data;
    previa.replaceChildren(el("div", { class: "balao", text: dd.texto?.trim() ? personalizar(dd.texto, "seguidor") : "Sua mensagem aparece aqui." }));
    if (dd.botao) previa.append(el("div", { class: "balao-botao", text: dd.botao.texto || "Botão com link" }));
    if (dd.respostas?.length) previa.append(el("div", { class: "rapidas" }, dd.respostas.map((r) => el("span", { text: r || "…" }))));
  };
  texto.addEventListener("input", () => { atualizar(id, { texto: texto.value }); contar(); desenharPrevia(); });
  f.append(campo("Texto", texto, contador,
    el("p", { class: "dica", text: "Use {nome} para colocar o @ da pessoa." })));

  const tipos = el("div", { class: "opcoes" });
  for (const [valor, rotulo] of [["nenhum", "Sem botão"], ["link", "Botão com link"], ["respostas", "Respostas rápidas"]]) {
    const r = el("input", { type: "radio", name: `botao-${id}`, value: valor });
    r.checked = valor === tipoBotao;
    r.addEventListener("change", () => mudarTipoBotao(id, valor));
    tipos.append(el("label", { class: "opcao" }, r, rotulo));
  }
  f.append(el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Botões" }), tipos));

  if (tipoBotao === "link") {
    const rotulo = el("input", { type: "text", maxlength: "20", placeholder: "Entrar no grupo" });
    rotulo.value = d.botao?.texto || "";
    const url = el("input", { type: "url", placeholder: "https://…" });
    url.value = d.botao?.url || "";
    const salvarBotao = () => atualizar(id, { botao: { texto: rotulo.value, url: url.value.trim() } });
    rotulo.addEventListener("input", () => { salvarBotao(); desenharPrevia(); });
    url.addEventListener("input", salvarBotao);

    const numero = el("input", { type: "tel", placeholder: "DDD + número, ex.: 11 98765-4321" });
    const msgZap = el("input", { type: "text", placeholder: "Oi Daniel! Vim do Instagram e quero saber do curso" });
    const usar = el("button", { class: "btn pequeno", type: "button" }, "Usar este link");
    usar.addEventListener("click", () => {
      let digitos = numero.value.replace(/\D/g, "");
      if (digitos.length < 10) return toast("Coloque o número com DDD.", "erro");
      if (!digitos.startsWith("55") || digitos.length <= 11) digitos = `55${digitos}`;
      url.value = `https://wa.me/${digitos}${msgZap.value.trim() ? `?text=${encodeURIComponent(msgZap.value.trim())}` : ""}`;
      salvarBotao();
      toast("Link do WhatsApp montado.");
    });
    f.append(
      campo("Texto do botão", rotulo),
      campo("Link", url, el("p", { class: "dica", text: "O robô conta quem tocou (aparece nas métricas) e depois abre este link." })),
      el("details", { class: "ajuda" }, el("summary", { text: "Montar link do WhatsApp" }), numero, msgZap, usar));
  }

  if (tipoBotao === "respostas") {
    const listaR = el("div", { class: "lista-respostas" });
    (d.respostas || []).forEach((r, i) => {
      const inp = el("input", { type: "text", maxlength: "20", placeholder: `Botão ${i + 1}` });
      inp.value = r;
      inp.addEventListener("input", () => {
        const respostas = [...no(id).data.respostas];
        respostas[i] = inp.value;
        atualizar(id, { respostas });
        desenharPrevia();
      });
      const remover = el("button", { class: "btn fantasma icone", type: "button", "aria-label": `Remover botão ${i + 1}` }, "✕");
      remover.addEventListener("click", () => removerResposta(id, i));
      listaR.append(el("div", { class: "resposta-linha" }, el("span", { class: "n", text: String(i + 1) }), inp, remover));
    });
    const mais = el("button", { class: "btn pequeno", type: "button" }, "+ Botão");
    mais.addEventListener("click", () => adicionarResposta(id));
    f.append(el("div", { class: "campo" },
      el("span", { class: "rotulo", text: "Respostas rápidas" }), listaR, mais,
      el("p", { class: "dica", text: "Cada botão abre um caminho: as bolinhas numeradas da direita, na mesma ordem. Quando a pessoa toca, a Meta libera mais 24h de conversa. Aparecem só no celular." })));
  }

  f.append(el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Prévia" }),
    el("div", { class: "celular" }, el("div", { class: "cel-topo", text: estado.conta ?? "eudanielmontoni" }), previa)));
  contar();
  desenharPrevia();
  return f;
}

function mudarTipoBotao(id, tipo) {
  const n = no(id);
  for (let i = Object.keys(n.outputs).length; i > 1; i--) editor.removeNodeOutput(id, `output_${i}`);
  editor.updateNodeDataFromId(id, {
    ...no(id).data,
    respostas: tipo === "respostas" ? [""] : [],
    botao: tipo === "link" ? { texto: "", url: "" } : null,
  });
  renderNo(id);
  marcar();
  selecionar(id);
}

function adicionarResposta(id) {
  const n = no(id);
  const respostas = [...(n.data.respostas || [])];
  if (respostas.length >= 13) return toast("A Meta aceita no máximo 13 botões.", "erro");
  respostas.push("");
  if (respostas.length > 1) editor.addNodeOutput(id); // com 1 botao, a saida unica ja existe
  editor.updateNodeDataFromId(id, { ...no(id).data, respostas });
  renderNo(id);
  marcar();
  selecionar(id);
}

function removerResposta(id, i) {
  const n = no(id);
  const respostas = [...n.data.respostas];
  if (respostas.length > 1) editor.removeNodeOutput(id, `output_${i + 1}`); // o Drawflow renumera as seguintes
  respostas.splice(i, 1);
  editor.updateNodeDataFromId(id, { ...no(id).data, respostas });
  renderNo(id);
  marcar();
  selecionar(id);
}

function formEspera(id, d) {
  const f = el("div", { class: "form" });
  const emHoras = d.minutos >= 60 && d.minutos % 60 === 0;
  const valor = el("input", { type: "number", min: "1", step: "1" });
  valor.value = emHoras ? d.minutos / 60 : d.minutos;
  const unidade = el("select", {}, el("option", { value: "min", text: "minutos" }), el("option", { value: "h", text: "horas" }));
  unidade.value = emHoras ? "h" : "min";
  const aplicar = () => {
    const n = Math.max(1, Math.round(Number(valor.value) || 1));
    atualizar(id, { minutos: Math.min(1380, unidade.value === "h" ? n * 60 : n) });
  };
  valor.addEventListener("input", aplicar);
  unidade.addEventListener("change", aplicar);
  f.append(el("div", { class: "campo" }, el("span", { class: "rotulo", text: "Esperar" }),
    el("div", { class: "resposta-linha", style: "grid-template-columns: 1fr 1fr" }, valor, unidade),
    el("p", { class: "dica", text: "Máximo de 23 horas. Some as esperas desde o último toque da pessoa: passando de 24h, a Meta não deixa a próxima mensagem sair." })));
  return f;
}

function formEtiqueta(id, d) {
  const f = el("div", { class: "form" });
  const acao = el("select", {}, el("option", { value: "adicionar", text: "Adicionar etiqueta" }), el("option", { value: "remover", text: "Remover etiqueta" }));
  acao.value = d.acao || "adicionar";
  acao.addEventListener("change", () => atualizar(id, { acao: acao.value }));
  const listaId = `etiquetas-${id}`;
  const nome = el("input", { type: "text", maxlength: "40", placeholder: "Ex.: entrou no grupo", list: listaId });
  nome.value = d.etiqueta || "";
  nome.addEventListener("input", () => atualizar(id, { etiqueta: nome.value.trim() }));
  const datalist = el("datalist", { id: listaId });
  carregarEtiquetas().then((ets) => ets.forEach((e) => datalist.append(el("option", { value: e.etiqueta }))));
  f.append(campo("O que fazer", acao), campo("Etiqueta", nome, datalist,
    el("p", { class: "dica", text: "Serve para organizar os contatos (ex.: “interessado no curso”) e filtrar na tela de Contatos." })));
  return f;
}

// ---------- salvar ----------

function mostrarAvisos(erros = [], avisos = []) {
  const caixa = $("#ed-avisos");
  caixa.replaceChildren();
  const itens = [...erros.map((a) => ({ ...a, tipo: "erro" })), ...avisos.map((a) => ({ ...a, tipo: "aviso" }))];
  caixa.hidden = !itens.length;
  for (const a of itens) {
    caixa.append(el("button", { type: "button", class: a.tipo, onclick: () => a.no && selecionarNo(a.no) },
      `${a.tipo === "erro" ? "⛔" : "⚠️"} ${a.texto}`));
  }
  if (itens.length) {
    caixa.append(el("button", { type: "button", class: "", onclick: () => { caixa.hidden = true; } }, "Fechar avisos"));
  }
}

async function salvar() {
  const botao = $("#ed-salvar");
  botao.disabled = true;
  botao.textContent = "Salvando…";
  try {
    const r = await api("funil_salvar", {
      funil: { id: funil.id, nome: $("#ed-nome").value, desenho: editor.export(), ativo: $("#ed-ativo").checked },
    });
    funil = { ...funil, ...r.funil };
    $("#ed-ativo").checked = r.funil.ativo;
    alterado = false;
    atualizarSelo();
    mostrarAvisos(r.erros, r.avisos);
    if (r.ativacao_bloqueada) toast("Salvo como rascunho: corrija os pontos em vermelho para ativar.", "erro");
    else if (r.erros.length) toast("Rascunho salvo, mas tem erro para corrigir antes de ativar.", "erro");
    else toast(r.funil.ativo ? "Funil salvo e ativo. Vale a partir do próximo minuto." : "Rascunho salvo.");
  } catch (e) {
    erroSilencioso(e);
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar";
  }
}

// usado pelas metricas para rotular etapas
export { TIPOS, normalizar };
