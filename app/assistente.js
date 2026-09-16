// Assistente guiado: conversa com botoes que monta um funil pronto (sem IA, sem custo).
import { el, api, erroSilencioso, normalizar } from "./base.js";
import { abrirEditor } from "./funis.js";

const GRUPO = "https://chat.whatsapp.com/GguGsfuwNaMBDlIWIRCjpF";
const WHATSAPP = "5528999367868";
const zap = (texto) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

// textos ja aprovados pelo Daniel nos funis GRUPO e PROMO
const TXT = {
  publicas: ["@{nome} te mandei no direct! 📩", "Enviado! Confere teu direct 😉", "Corre no direct que tá lá ✈️"],
  conviteGrupo: "Opaa! Como vai?\n\nQuer entrar no nosso grupo gratuito e receber alertas de passagens com até 80% de desconto diariamente? ✈️",
  entregaGrupo: "Perfeito! 🙌 Toca no botão abaixo pra entrar no grupo 👇",
  conseguiuEntrar: "E aí, conseguiu entrar no grupo? 😊\n\nSe tiver qualquer dúvida sobre milhas, é só me chamar por aqui.",
  ofertaCurso: "Opaa, tudo certo por aí? 😊\n\nNo grupo você vai ver promoção todo dia. Mas o que separa quem viaja pagando pouco de quem só junta ponto é saber fazer a conta: quanto custa o milheiro e quando vale emitir com milha ou pagar em dinheiro.\n\nÉ isso que eu ensino no meu curso, o Se Tornando um Milhanário. Quer saber como funciona?",
  cursoSim: "Show! 🙌 Me chama no WhatsApp que eu te explico tudo por lá, sem compromisso 👇",
  cursoNao: "Tranquilo! Continua acompanhando o grupo que as promoções não param. Se mudar de ideia, é só me chamar aqui. ✈️",
  jaNoGrupo: "Uma pergunta rápida: você já faz parte do meu grupo gratuito de alertas de passagens? ✈️",
  presente: "Que bom ter você lá! 🙌\n\nE se você quer ir além dos alertas: no meu treinamento Se Tornando um Milhanário eu te ensino do zero ao avançado a fazer a conta do milheiro e emitir passagens pagando pouco.\n\nMe chama no WhatsApp que eu tenho um presente pra você 🎁",
  convideGrupo: "Todos os dias eu envio alertas de passagens e promoções do mundo das milhas no grupo gratuito. Entra lá pra ficar por dentro de tudo 👇",
};

const MODELOS = {
  link: { rotulo: "Entregar um link", icone: "link", nome: "entrega de link" },
  grupo: { rotulo: "Convidar pro grupo", icone: "groups", nome: "grupo gratuito" },
  planilha: { rotulo: "Planilha de Reels", icone: "table_chart", nome: "planilha do Reels" },
};

const CANAIS = {
  cs: { rotulo: "Comentários e stories", valor: ["comentario", "story"] },
  c: { rotulo: "Só comentários", valor: ["comentario"] },
  csd: { rotulo: "Comentários, stories e direct", valor: ["comentario", "story", "direct"] },
};

const icone = (nome) => el("span", { class: "material-symbols-outlined", text: nome });
const agora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function validarLink(v) {
  try {
    return new URL(v).protocol === "https:" ? null : "O link precisa começar com https://";
  } catch {
    return "Isso não parece um link. Cola o endereço completo, começando com https://";
  }
}

// ---------- montagem do desenho do funil (formato do Drawflow) ----------

function construir(d) {
  const nos = {};
  let seq = 0;
  let x = 40;
  const avancar = () => (x += 330);
  const novo = (name, data, px, py) => {
    const id = String(++seq);
    const saidas = name === "mensagem" ? Math.max(1, data.respostas.length) : 1;
    nos[id] = { id: Number(id), name, class: name, html: "", typenode: false, pos_x: px, pos_y: py, data, inputs: {}, outputs: {} };
    for (let i = 1; i <= saidas; i++) nos[id].outputs[`output_${i}`] = { connections: [] };
    if (name !== "gatilho") nos[id].inputs.input_1 = { connections: [] };
    return id;
  };
  const ligar = (de, para, saida = 1) => {
    nos[de].outputs[`output_${saida}`].connections.push({ node: para, output: "input_1" });
    nos[para].inputs.input_1.connections.push({ node: de, input: `output_${saida}` });
  };
  const msg = (texto, extra = {}) => ({ texto, botao: null, respostas: [], ...extra });
  const botao = (texto, url) => ({ botao: { texto, url } });

  const gatilho = novo("gatilho", { palavras: [d.palavra], canais: d.canais, post_id: null, respostas_publicas: TXT.publicas }, x, 220);

  // primeira mensagem sempre com botao: o toque abre a janela de 24h para o resto chegar
  const convite = {
    link: msg("Opaa! Quer receber o link? 👇", { respostas: ["Quero o link 👇"] }),
    grupo: msg(TXT.conviteGrupo, { respostas: ["Quero entrar ✈️"] }),
    planilha: msg("Opaa! Quer a planilha que eu mostrei no Reels? 👇", { respostas: ["Quero a planilha 📊"] }),
  }[d.tipo];
  let ultimo = novo("mensagem", convite, avancar(), 200);
  ligar(gatilho, ultimo);

  if (d.tipo === "grupo") {
    const entrega = novo("mensagem", msg(TXT.entregaGrupo, botao("Entrar no grupo", d.link)), avancar(), 200);
    ligar(ultimo, entrega);
    ultimo = entrega;
  } else {
    const abre = d.tipo === "planilha" ? "Aqui está a planilha! 🙌" : "Aqui está! 🙌";
    const entrega = novo("mensagem", msg(d.frase ? `${abre}\n\n${d.frase}` : abre, botao(d.botaoTexto, d.link)), avancar(), 200);
    ligar(ultimo, entrega);
    ultimo = entrega;
    if (d.linkExtra) {
      const extra = novo("mensagem", msg("E aqui o link da promoção pra você aproveitar 👇", botao("Ver promoção", d.linkExtra)), avancar(), 200);
      ligar(ultimo, extra);
      ultimo = extra;
    }
  }

  if (d.seguimento === "oferta") {
    const espera = novo("espera", { minutos: 60 }, avancar(), 220);
    ligar(ultimo, espera);
    const pergunta = novo("mensagem", msg(TXT.jaNoGrupo, { respostas: ["Já faço parte ✅", "Ainda não"] }), avancar(), 200);
    ligar(espera, pergunta);
    const xr = avancar();
    const sim = novo("etiqueta", { acao: "adicionar", etiqueta: "já está no grupo" }, xr, 40);
    ligar(pergunta, sim, 1);
    const presente = novo("mensagem", msg(TXT.presente, botao("Falar com o Dan", zap("Fala Dan! Vim pelo Instagram e quero o presente 🎁"))), xr + 330, 20);
    ligar(sim, presente);
    const nao = novo("etiqueta", { acao: "adicionar", etiqueta: "fora do grupo" }, xr, 400);
    ligar(pergunta, nao, 2);
    const grupo = novo("mensagem", msg(TXT.convideGrupo, botao("Entrar no grupo", GRUPO)), xr + 330, 380);
    ligar(nao, grupo);
  } else if (d.seguimento === "grupo") {
    const espera = novo("espera", { minutos: 60 }, avancar(), 220);
    ligar(ultimo, espera);
    const grupo = novo("mensagem", msg(TXT.convideGrupo, botao("Entrar no grupo", GRUPO)), avancar(), 200);
    ligar(espera, grupo);
  } else if (d.seguimento === "curso") {
    // o mesmo caminho do funil GRUPO: 2h "conseguiu entrar?" e oferta cerca de 20h depois do toque
    const e1 = novo("espera", { minutos: 120 }, avancar(), 220);
    ligar(ultimo, e1);
    const conseguiu = novo("mensagem", msg(TXT.conseguiuEntrar), avancar(), 200);
    ligar(e1, conseguiu);
    const e2 = novo("espera", { minutos: 1080 }, avancar(), 220);
    ligar(conseguiu, e2);
    const oferta = novo("mensagem", msg(TXT.ofertaCurso, { respostas: ["Quero saber mais", "Agora não"] }), avancar(), 200);
    ligar(e2, oferta);
    const xr = avancar();
    const sim = novo("etiqueta", { acao: "adicionar", etiqueta: "interessado no curso" }, xr, 40);
    ligar(oferta, sim, 1);
    const whats = novo("mensagem", msg(TXT.cursoSim, botao("Falar com o Dan", zap("Fala Dan! Quero aprender a dominar o mundo das milhas com você ✈️"))), xr + 330, 20);
    ligar(sim, whats);
    const nao = novo("etiqueta", { acao: "adicionar", etiqueta: "curso: agora não" }, xr, 400);
    ligar(oferta, nao, 2);
    const tranquilo = novo("mensagem", msg(TXT.cursoNao), xr + 330, 380);
    ligar(nao, tranquilo);
  }
  return { drawflow: { Home: { data: nos } } };
}

// ---------- conversa ----------

export { construir as construirDesenho };

export function montarAssistente(alvo) {
  let sessao = 0;          // troca a cada recomeco: respostas de conversas antigas sao ignoradas
  let esperando = null;    // o que fazer com o texto digitado

  const msgs = el("div", { class: "chat-msgs", "aria-live": "polite" });
  const chips = el("div", { class: "chat-chips" });
  const campo = el("input", { type: "text", placeholder: "Escolha uma opção acima", "aria-label": "Sua resposta", disabled: true });
  const enviar = el("button", { class: "chat-enviar", type: "submit", "aria-label": "Enviar", disabled: true }, icone("send"));
  const form = el("form", { class: "chat-campo" }, icone("edit"), campo, enviar);

  alvo.replaceChildren(
    el("header", { class: "chat-topo" },
      el("span", { class: "chat-avatar" }, icone("auto_awesome")),
      el("div", {}, el("strong", { text: "Assistente BotMilhas" }), el("span", { class: "online", text: "Online" })),
      el("button", { class: "btn fantasma pequeno limpar", type: "button", onclick: () => recomecar() }, icone("delete"), "Limpar conversa")),
    msgs, chips, form,
    el("p", { class: "chat-dica", text: "💡 Dica: o assistente cria o funil como rascunho. Você revisa no editor antes de ativar." }));

  const rolar = () => { msgs.scrollTop = msgs.scrollHeight; };

  function travar(sim, dica = "Escolha uma opção acima") {
    campo.disabled = sim;
    enviar.disabled = sim;
    campo.placeholder = sim ? dica : campo.placeholder;
  }

  async function bot(texto) {
    const digitando = el("div", { class: "linha-bot" },
      el("span", { class: "chat-avatar" }, icone("auto_awesome")),
      el("div", { class: "bolha digitando" }, el("i"), el("i"), el("i")));
    msgs.append(digitando);
    rolar();
    await esperar(Math.min(900, 280 + texto.length * 4));
    digitando.replaceWith(el("div", { class: "linha-bot" },
      el("span", { class: "chat-avatar" }, icone("auto_awesome")),
      el("div", {}, el("div", { class: "bolha", text: texto }), el("span", { class: "hora", text: agora() }))));
    rolar();
  }

  function eu(texto) {
    msgs.append(el("div", { class: "linha-eu" },
      el("div", { class: "bolha", text: texto }),
      el("span", { class: "hora" }, agora(), icone("done_all"))));
    rolar();
  }

  // mostra botoes e devolve o valor do escolhido
  function escolha(opcoes, minha) {
    travar(true);
    return new Promise((ok) => {
      chips.replaceChildren(...opcoes.map((o) => el("button", {
        type: "button", class: `chip-op${o.forte ? " forte" : ""}`,
        onclick: () => {
          if (minha !== sessao) return;
          chips.replaceChildren();
          eu(o.rotulo);
          ok(o.valor);
        },
      }, o.icone ? icone(o.icone) : null, o.rotulo)));
      rolar();
    });
  }

  // espera um texto digitado (com sugestoes e "Pular" opcionais)
  function texto(minha, { placeholder = "Digite aqui…", validar = () => null, sugestoes = [], pular = false } = {}) {
    return new Promise((ok) => {
      const terminar = (valor) => {
        esperando = null;
        chips.replaceChildren();
        travar(true);
        ok(valor);
      };
      const extras = [...sugestoes.map((s) => ({ rotulo: s, valor: s })), ...(pular ? [{ rotulo: "Pular", icone: "skip_next", valor: null }] : [])];
      chips.replaceChildren(...extras.map((o) => el("button", {
        type: "button", class: "chip-op",
        onclick: () => { if (minha !== sessao) return; eu(o.rotulo); terminar(o.valor); },
      }, o.icone ? icone(o.icone) : null, o.rotulo)));
      campo.placeholder = placeholder;
      travar(false);
      campo.focus({ preventScroll: true });
      esperando = async (valor) => {
        const problema = validar(valor);
        if (problema) { await bot(problema); campo.focus({ preventScroll: true }); return; }
        terminar(valor);
      };
    });
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const valor = campo.value.trim();
    if (!valor) return;
    if (!esperando) { await bot("Toca numa das opções acima 👆"); return; }
    campo.value = "";
    eu(valor);
    esperando(valor);
  });

  function limpar() {
    sessao++;
    esperando = null;
    msgs.replaceChildren();
    chips.replaceChildren();
    campo.value = "";
    travar(true);
    return sessao;
  }

  async function recomecar() {
    const minha = limpar();
    await bot("Oi, Daniel! 👋\nEu monto funis pra você em poucos passos. Depois é só revisar no editor e ativar.\n\nO que vamos criar hoje?");
    if (minha !== sessao) return;
    const tipo = await escolha([
      ...Object.entries(MODELOS).map(([valor, m]) => ({ rotulo: m.rotulo, icone: m.icone, valor })),
      { rotulo: "Do zero no editor", icone: "edit", valor: "zero" },
    ], minha);
    if (minha !== sessao) return;
    if (tipo === "zero") {
      await bot("Abrindo o editor em branco. Bom trabalho! 🛠️");
      abrirEditor(null);
      return;
    }
    fluxo(tipo, minha);
  }

  function iniciarModelo(tipo) {
    const minha = limpar();
    eu(MODELOS[tipo].rotulo);
    fluxo(tipo, minha);
  }

  async function fluxo(tipo, minha) {
    const vivo = () => minha === sessao;
    const d = { tipo };

    await bot({
      link: "Boa! Vou montar um funil que entrega um link por direct pra quem comentar a palavra.",
      grupo: "Boa! Vou montar um funil que leva a pessoa pro seu grupo gratuito.",
      planilha: "Boa! Vou montar um funil que entrega a planilha que você mostrou no Reels.",
    }[tipo]);
    if (!vivo()) return;

    let ativos = [];
    try {
      ativos = (await api("funis_listar")).funis.filter((f) => f.ativo);
    } catch (e) {
      erroSilencioso(e);
    }
    await bot("Qual palavra a pessoa vai comentar?\nEx.: GRUPO, PROMO, PLANILHA");
    if (!vivo()) return;
    const palavra = await texto(minha, {
      placeholder: "Palavra-chave",
      validar: (v) => {
        if (v.length > 40) return "Use no máximo 40 caracteres.";
        if (!normalizar(v)) return "Use letras ou números na palavra 😉";
        const choque = ativos.find((f) => (f.gatilho?.palavras ?? []).some((p) => normalizar(p) === normalizar(v)));
        return choque ? `A palavra “${v}” já está ativa no funil “${choque.nome}”. Escolhe outra?` : null;
      },
    });
    if (!vivo()) return;
    d.palavra = palavra.toUpperCase();

    await bot("Onde o funil vale?");
    if (!vivo()) return;
    const canal = await escolha(Object.entries(CANAIS).map(([valor, c]) => ({ rotulo: c.rotulo, valor })), minha);
    if (!vivo()) return;
    d.canais = CANAIS[canal].valor;

    if (tipo === "grupo") {
      await bot("Uso o link do seu grupo gratuito de sempre?");
      if (!vivo()) return;
      const mesmo = await escolha([
        { rotulo: "Sim, o de sempre", icone: "check", valor: true },
        { rotulo: "Outro link", icone: "link", valor: false },
      ], minha);
      if (!vivo()) return;
      if (mesmo) d.link = GRUPO;
      else {
        await bot("Cola o link do grupo 👇");
        if (!vivo()) return;
        d.link = await texto(minha, { placeholder: "https://chat.whatsapp.com/…", validar: validarLink });
        if (!vivo()) return;
      }
    } else {
      await bot(tipo === "planilha" ? "Cola o link da planilha 👇\nConfere se ela está como “qualquer pessoa com o link pode ver”." : "Cola o link que a pessoa vai receber 👇");
      if (!vivo()) return;
      d.link = await texto(minha, { placeholder: "https://…", validar: validarLink });
      if (!vivo()) return;

      if (tipo === "planilha") {
        d.botaoTexto = "Abrir planilha";
        await bot("Tem um link de promoção pra mandar junto? Se não tiver, toca em Pular.");
        if (!vivo()) return;
        d.linkExtra = await texto(minha, { placeholder: "https://…", validar: validarLink, pular: true });
        if (!vivo()) return;
      } else {
        await bot("Qual o texto do botão? (até 20 caracteres)");
        if (!vivo()) return;
        d.botaoTexto = await texto(minha, {
          placeholder: "Texto do botão",
          sugestoes: ["Abrir link", "Acessar agora", "Quero ver"],
          validar: (v) => (v.length > 20 ? "Esse texto passa de 20 caracteres. Encurta um pouco?" : null),
        });
        if (!vivo()) return;
      }

      await bot("Quer uma frase curta junto com a entrega? Ex.: “É a promoção de 100% de bônus, vai até sexta.”\nSe não quiser, toca em Pular.");
      if (!vivo()) return;
      d.frase = await texto(minha, {
        placeholder: "Frase da entrega",
        pular: true,
        validar: (v) => (v.length > 400 ? "Frase longa demais: use até 400 caracteres." : null),
      });
      if (!vivo()) return;
    }

    await bot(tipo === "grupo" ? "E depois que a pessoa entrar no grupo?" : "E depois da entrega?");
    if (!vivo()) return;
    d.seguimento = await escolha(tipo === "grupo"
      ? [
        { rotulo: "Oferecer o curso (~20h depois)", icone: "school", valor: "curso" },
        { rotulo: "Só convidar", icone: "check", valor: "nada" },
      ]
      : [
        { rotulo: "Perguntar do grupo + oferta do curso", icone: "school", valor: "oferta" },
        { rotulo: "Convidar pro grupo", icone: "groups", valor: "grupo" },
        { rotulo: "Só entregar", icone: "check", valor: "nada" },
      ], minha);
    if (!vivo()) return;

    const depois = {
      oferta: "1h depois pergunta se já está no grupo → oferta do curso com presente no WhatsApp, ou convite pro grupo",
      grupo: "1h depois convida pro grupo gratuito",
      curso: "2h depois “conseguiu entrar?” e ~20h depois a oferta do curso com seu WhatsApp",
      nada: "termina na entrega",
    }[d.seguimento];
    const entrega = tipo === "grupo" ? "link do grupo" : tipo === "planilha" ? `planilha${d.linkExtra ? " + link da promoção" : ""}` : `link com o botão “${d.botaoTexto}”`;
    await bot(`Resumo do funil:\n• Palavra: ${d.palavra} (${CANAIS[canal].rotulo.toLowerCase()})\n• Primeiro: pergunta com botão, pra liberar as 24h\n• Entrega: ${entrega}${d.frase ? `\n• Frase: “${d.frase}”` : ""}\n• Depois: ${depois}\n\nPosso criar?`);
    if (!vivo()) return;
    const criar = await escolha([
      { rotulo: "Criar funil", icone: "check_circle", valor: true, forte: true },
      { rotulo: "Recomeçar", icone: "restart_alt", valor: false },
    ], minha);
    if (!vivo()) return;
    if (!criar) { recomecar(); return; }

    const nome = `${d.palavra} → ${MODELOS[tipo].nome}`;
    let salvo;
    try {
      salvo = await api("funil_salvar", { funil: { nome, desenho: construir(d), ativo: false } });
    } catch (e) {
      await bot(`Não consegui criar: ${e.message}`);
      return;
    }
    if (!vivo()) return;
    const id = salvo.funil.id;
    const problemas = [...salvo.erros, ...salvo.avisos].map((a) => `• ${a.texto}`).join("\n");
    await bot(`Pronto! Montei o funil “${nome}” como rascunho. ✅${problemas ? `\n\nO editor apontou:\n${problemas}` : ""}`);
    if (!vivo()) return;

    for (;;) {
      const proximo = await escolha([
        { rotulo: "Abrir no editor", icone: "edit", valor: "editor" },
        { rotulo: "Ativar agora", icone: "bolt", valor: "ativar", forte: true },
        { rotulo: "Criar outro", icone: "add", valor: "outro" },
      ], minha);
      if (!vivo()) return;
      if (proximo === "editor") { abrirEditor(id); await bot("Abri no editor. Quando voltar, estou aqui 😉"); continue; }
      if (proximo === "outro") { recomecar(); return; }
      try {
        await api("funil_ativar", { id, ativo: true });
        await bot(`Funil ativo! 🚀 A partir do próximo minuto, quem ${d.canais.includes("story") ? "comentar ou responder story" : "comentar"} com ${d.palavra} entra nele.`);
        if (!vivo()) return;
        const fim = await escolha([
          { rotulo: "Ver no editor", icone: "edit", valor: "editor" },
          { rotulo: "Criar outro", icone: "add", valor: "outro" },
        ], minha);
        if (!vivo()) return;
        if (fim === "editor") abrirEditor(id);
        else recomecar();
        return;
      } catch (e) {
        await bot(`Não deu pra ativar: ${e.message}`);
        if (!vivo()) return;
      }
    }
  }

  recomecar();
  return { recomecar, iniciarModelo };
}
