'use strict';
/* =========================================================
   Mini PDV — lógica
   Dados em localStorage('pdv'): {evento, produtos, vendas, seq}
   ========================================================= */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ---------- Ícones (SVG inline) ---------- */
const svg = (d, w = 2) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  ok: svg('<path d="m5 12 5 5 9-10"/>', 3),
  err: svg('<path d="M12 7v6M12 17h.01"/>', 3),
  info: svg('<path d="M12 11v6M12 7h.01"/>', 3),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.5),
  minus: svg('<path d="M5 12h14"/>', 2.5),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.5),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
  cart: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 8H6.5"/></svg>',
  cash: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
  pix: svg('<path d="M12 3 21 12 12 21 3 12Z"/>'),
  card: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>')
};

/* ---------- Toasts (substituem alert) ---------- */
function toast(kind, msg, sub = '', key = '') {
  const box = $('#toasts');
  if (key) box.querySelector(`[data-key="${key}"]`)?.remove();
  const el = document.createElement('div');
  if (key) el.dataset.key = key;
  el.className = 'toast toast-' + kind;
  el.innerHTML = `<span class="ti">${ICON[kind]}</span><span>${esc(msg)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span><button type="button" class="x" aria-label="Fechar aviso">${ICON.x}</button>`;
  let done = false;
  const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  el.querySelector('.x').onclick = close;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(close, kind === 'err' ? 4500 : 2600);
}
/* erro: toast + foco no campo responsável */
function erro(msg, sub, campo) {
  toast('err', msg, sub);
  if (campo) { campo.focus(); campo.select?.(); }
}

/* ---------- Modais (substituem confirm) ---------- */
function abrirModal({ icon = '', tone = '', title, body = '', actions = [], onOpen, wide = false }) {
  return new Promise(resolve => {
    const d = $('#dlg');
    d.innerHTML = `<form method="dialog" class="modal${wide ? ' wide' : ''}">
      ${icon ? `<div class="modal-ico ${tone}">${ICON[icon]}</div>` : ''}
      <h3 id="dlgT">${esc(title)}</h3>${body}
      <div class="modal-actions">${actions.map(a =>
        `<button type="${a.type || 'submit'}" value="${a.value || ''}" class="btn ${a.cls}"${a.autofocus ? ' autofocus' : ''}${a.id ? ` id="${a.id}"` : ''}>${a.label}</button>`).join('')}</div>
    </form>`;
    d.setAttribute('aria-labelledby', 'dlgT');
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue);
    // Enter sempre aciona o botão focado (consistente entre navegadores e leitores de código)
    d.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); d.close(''); return; }
      if (e.key === 'Enter' && e.target.tagName === 'BUTTON' && !e.target.disabled) { e.preventDefault(); e.target.click(); }
    };
    d.showModal();
    onOpen?.(d);
  });
}
const confirmar = ({ title, body, ok, icon = 'alert' }) => abrirModal({
  icon, tone: 'bad', title, body: body ? `<p>${body}</p>` : '',
  actions: [
    { value: '', label: 'Voltar <span class="kbd">Esc</span>', cls: 'btn-secondary', autofocus: true },
    { value: 'ok', label: ok, cls: 'btn-danger' }
  ]
}).then(v => v === 'ok');

/* ---------- Dados ---------- */
let db;
try { db = JSON.parse(localStorage.getItem('pdv') || 'null'); } catch (e) {}
db = db || { evento: '', produtos: [], vendas: [], seq: 1 };
const proxCodigo = () => String(db.produtos.reduce((m, p) => Math.max(m, parseInt(p.codigo) || 0), 0) + 1);
const codigoExiste = (c, ignorarId) => db.produtos.some(p => p.id !== ignorarId && String(p.codigo).toLowerCase() === c.toLowerCase());
db.produtos.forEach(p => { if (!p.codigo) p.codigo = proxCodigo(); });
const emPromo = p => p.promo != null && p.promo < p.preco;
const pv = p => emPromo(p) ? p.promo : p.preco;
let cart = {};
let flashId = null, flashT;
const save = () => { try { localStorage.setItem('pdv', JSON.stringify(db)); } catch (e) { toast('err', 'Não foi possível salvar no navegador.', 'Baixe um backup para não perder dados.'); } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const dig = s => s.replace(/\D/g, '');
const mascTel = s => { const d = dig(s).slice(0, 11), m = d.length === 11 ? 7 : 6; return d.length < 3 ? d : d.length <= m ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, m)}-${d.slice(m)}`; };
const mascCpf = s => dig(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const cpfValido = s => {
  const d = dig(s); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = n => { let t = 0; for (let k = 0; k < n; k++) t += d[k] * (n + 1 - k); return (t * 10 % 11) % 10; };
  return dv(9) == d[9] && dv(10) == d[10];
};
const limparCliente = () => { $('#cNome').value = $('#cTel').value = $('#cCpf').value = ''; $('#cliente').open = false; };
const pgto = () => $('input[name=pgto]:checked').value;
const setPgto = v => { $(`input[name=pgto][value="${v}"]`).checked = true; };
const descTipo = () => $('input[name=descTipo]:checked').value;

/* ---------- Abas ---------- */
const secaoAtual = () => ['venda', 'produtos', 'vendas'].find(t => !$('#' + t).classList.contains('hide'));
function irPara(t) {
  $$('nav button').forEach(x => { const on = x.dataset.t === t; x.classList.toggle('on', on); on ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'); });
  ['venda', 'produtos', 'vendas'].forEach(s => $('#' + s).classList.toggle('hide', s !== t));
  render();
  if (t === 'venda') $('#busca').focus();
}
$$('nav button').forEach(b => b.onclick = () => irPara(b.dataset.t));
$('#evento').value = db.evento;
$('#evento').oninput = e => { db.evento = e.target.value; save(); renderVendasSub(); };

/* ---------- Venda: catálogo ---------- */
function estoqueDisp(p) { return p.estoque === null ? Infinity : p.estoque - (cart[p.id] || 0); }
function addCarrinho(p) {
  if (estoqueDisp(p) <= 0) return toast('err', 'Sem estoque', p.nome);
  cart[p.id] = (cart[p.id] || 0) + 1;
  flashId = p.id; clearTimeout(flashT);
  flashT = setTimeout(() => { flashId = null; $$('#cart .item.flash').forEach(x => x.classList.remove('flash')); }, 900);
  render();
  $(`#prods .prod[data-id="${p.id}"]`)?.classList.add('pop');
  $(`#cart .item[data-id="${p.id}"]`)?.scrollIntoView({ block: 'nearest' });
  toast('ok', p.nome + ' adicionado', brl(pv(p)) + ' · ' + cart[p.id] + ' no carrinho', 'add');
}
function renderProds() {
  const q = $('#busca').value.toLowerCase();
  const focoId = document.activeElement?.closest?.('#prods .prod')?.dataset.id;
  const lista = db.produtos.filter(p => p.nome.toLowerCase().includes(q) || String(p.codigo).toLowerCase().includes(q));
  $('#prodCount').textContent = lista.length;
  $('#prods').innerHTML = lista.map(p => {
    const d = estoqueDisp(p), qt = cart[p.id] || 0, promo = emPromo(p);
    const zero = d <= 0, low = !zero && p.estoque !== null && d <= 5;
    const badge = zero ? '<span class="badge out">Esgotado</span>'
      : low ? `<span class="badge low">Restam ${d}</span>`
      : promo ? '<em class="badge promo">PROMO</em>' : '';
    return `<button type="button" class="prod${zero ? ' zero' : ''}${qt ? ' in' : ''}" data-id="${p.id}"${zero ? ' aria-disabled="true"' : ''}>
      ${qt ? `<span class="qbadge num" aria-label="${qt} no carrinho">${qt}</span>` : ''}
      <span class="name">${esc(p.nome)}</span>
      <span class="code">#${esc(p.codigo)}${p.estoque !== null && !zero && !low ? ' · ' + d + ' un' : ''}</span>
      ${badge ? `<span class="tags">${badge}</span>` : ''}
      <span class="foot">${promo ? `<span class="old num">${brl(p.preco)}</span>` : ''}<span class="price num${promo ? ' promo' : ''}">${brl(pv(p))}</span></span>
    </button>`;
  }).join('') || (db.produtos.length
    ? '<div class="empty"><b>Nenhum produto encontrado</b><span>Confira o código ou cadastre o produto na aba Produtos.</span></div>'
    : '<div class="empty"><b>Nenhum produto cadastrado</b><span>Cadastre produtos na aba Produtos (Alt+2).</span></div>');
  $$('#prods .prod').forEach(b => b.onclick = () => addCarrinho(db.produtos.find(x => x.id === b.dataset.id)));
  if (focoId) $(`#prods .prod[data-id="${focoId}"]`)?.focus();
}

/* ---------- Venda: carrinho e totais ---------- */
function subtotal() { return Object.entries(cart).reduce((s, [id, q]) => s + q * pv(db.produtos.find(p => p.id === id)), 0); }
function descontoValor() {
  const v = parseFloat($('#desc').value) || 0;
  if (descTipo() === '%') return Math.round(subtotal() * Math.min(100, Math.max(0, v))) / 100;
  return v;
}
function totalFinal() { return Math.max(0, subtotal() - descontoValor()); }
function renderCart() {
  const ids = Object.keys(cart);
  const focoBtn = document.activeElement?.closest?.('#cart [data-m],#cart [data-p]');
  const foco = focoBtn ? (focoBtn.dataset.m ? 'm:' + focoBtn.dataset.m : 'p:' + focoBtn.dataset.p) : null;
  $('#cart').innerHTML = ids.map(id => {
    const p = db.produtos.find(x => x.id === id), q = cart[id];
    return `<div class="item${flashId === id ? ' flash' : ''}" data-id="${id}">
      <div><div class="nm">${esc(p.nome)}${emPromo(p) ? ' <em class="badge promo sm">PROMO</em>' : ''}</div><div class="unit num">${brl(pv(p))} un.</div></div>
      <div class="stepper qty">
        <button type="button" data-m="${id}" aria-label="Diminuir quantidade de ${esc(p.nome)}">${ICON.minus}</button>
        <output class="num">${q}</output>
        <button type="button" data-p="${id}" aria-label="Aumentar quantidade de ${esc(p.nome)}">${ICON.plus}</button>
      </div>
      <div class="tot num">${brl(q * pv(p))}</div>
      <button type="button" class="icon-btn" data-rm="${id}" aria-label="Remover ${esc(p.nome)}">${ICON.trash}</button>
    </div>`;
  }).join('') || `<div class="empty">${ICON.cart}<b>Carrinho vazio</b><span>Bipe um código ou toque em um produto.</span></div>`;
  $$('[data-m]').forEach(b => b.onclick = () => { const i = b.dataset.m; if (--cart[i] <= 0) delete cart[i]; render(); });
  $$('[data-p]').forEach(b => b.onclick = () => { const p = db.produtos.find(x => x.id === b.dataset.p); if (estoqueDisp(p) > 0) { cart[p.id]++; render(); } else toast('err', 'Sem estoque', p.nome); });
  $$('[data-rm]').forEach(b => b.onclick = () => { const p = db.produtos.find(x => x.id === b.dataset.rm); delete cart[b.dataset.rm]; render(); toast('info', p.nome + ' removido'); $('#busca').focus(); });
  if (foco) { const [k, id] = foco.split(':'); $(`#cart [data-${k}="${id}"]`)?.focus(); }

  const qtd = ids.reduce((s, id) => s + cart[id], 0);
  const t = totalFinal();
  $('#itemCount').textContent = qtd;
  $('#seq').textContent = 'Venda #' + db.seq;
  $('#subtotal').textContent = brl(subtotal());
  $('#descCalc').textContent = descTipo() === '%' && descontoValor() > 0 ? '− ' + brl(descontoValor()) : '';
  $('#total').textContent = brl(t);
  $('#trocoBox').classList.toggle('hide', pgto() !== 'Dinheiro');
  const recTxt = $('#recebido').value, rec = parseFloat(recTxt) || 0;
  const falta = pgto() === 'Dinheiro' && recTxt !== '' && rec < t;
  $('#recebido').classList.toggle('err', falta);
  $('#recErr').classList.toggle('hide', !falta);
  $('#recErr').textContent = falta ? 'Faltam ' + brl(t - rec) : '';
  renderChips(t, recTxt);
  $('#chips').classList.toggle('hide', falta || t <= 0);
  $('#troco').textContent = brl(Math.max(0, rec - t));
  $('#troco').classList.toggle('neg', falta);
  $('#mCount').textContent = qtd;
  $('#mTotal').textContent = brl(t);
}
['#desc', '#recebido'].forEach(s => $(s).oninput = renderCart);
$$('input[name=pgto],input[name=descTipo]').forEach(r => r.onchange = renderCart);
/* ---------- Sugestões de valor recebido ----------
   Para cada cédula (2, 5, 10, 20, 50, 100, 200), o menor múltiplo dela
   que fica ACIMA do total. Ex.: total R$ 58,05 → 60, 100, 200. */
const CEDULAS = [2, 5, 10, 20, 50, 100, 200];
const MAX_SUGESTOES = 5;
function sugestoesRecebido(total) {
  const centavos = Math.round(total * 100);
  if (centavos <= 0) return [];
  // múltiplo estritamente maior que o total; se passar do limite, as cédulas grandes têm prioridade
  const valores = [];
  for (const n of [...CEDULAS].reverse()) {
    const v = (Math.floor(centavos / (n * 100)) + 1) * n;
    if (!valores.includes(v) && valores.length < MAX_SUGESTOES) valores.push(v);
  }
  return valores.sort((a, b) => a - b);
}
let chipsKey = '';
function renderChips(total, recTxt) {
  const sug = sugestoesRecebido(total);
  const key = total.toFixed(2) + '|' + sug.join(',');
  if (key !== chipsKey) {
    chipsKey = key;
    $('#chips').innerHTML = `<button type="button" class="chip" data-rec="${total.toFixed(2)}" aria-label="Recebido valor exato, ${brl(total)}">Exato</button>`
      + sug.map(v => `<button type="button" class="chip" data-rec="${v}" aria-label="Recebido ${brl(v)}, troco ${brl(v - total)}">R$ ${v}</button>`).join('');
  }
  const rec = parseFloat(recTxt);
  $$('#chips .chip').forEach(b => b.classList.toggle('on', recTxt !== '' && Math.abs(parseFloat(b.dataset.rec) - rec) < 0.005));
}
$('#chips').onclick = e => {
  const b = e.target.closest('[data-rec]'); if (!b) return;
  $('#recebido').value = b.dataset.rec;
  renderCart();
};
// Ao abrir "Cliente", rola a área do rodapé para mostrar os campos (o botão Finalizar continua fixo)
$('#cliente').ontoggle = () => {
  if (!$('#cliente').open) return;
  $('#cliente').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (document.activeElement?.closest('#cliente summary')) $('#cNome').focus({ preventScroll: true });
};
$('#cTel').oninput = e => e.target.value = mascTel(e.target.value);
$('#cCpf').oninput = e => e.target.value = mascCpf(e.target.value);
$('#busca').oninput = renderProds;
$('#busca').onkeydown = e => {
  if (e.key === 'Escape') { e.target.value = ''; renderProds(); return; }
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase(); if (!q) return;
  let p = db.produtos.find(x => String(x.codigo).toLowerCase() === q);
  if (!p) { const m = db.produtos.filter(x => x.nome.toLowerCase().includes(q) || String(x.codigo).toLowerCase().includes(q)); if (m.length === 1) p = m[0]; }
  if (!p) return erro('Produto não encontrado', '“' + e.target.value.trim() + '”', e.target);
  if (estoqueDisp(p) <= 0) return erro('Sem estoque', p.nome, e.target);
  e.target.value = '';
  addCarrinho(p);
};
$('#recebido').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#finalizar').click(); } };

function resetVenda() { cart = {}; $('#desc').value = 0; $('#recebido').value = ''; limparCliente(); render(); }
$('#limpar').onclick = async () => {
  if (!Object.keys(cart).length) { resetVenda(); toast('info', 'Carrinho já está vazio'); return $('#busca').focus(); }
  const n = Object.values(cart).reduce((a, b) => a + b, 0);
  if (await confirmar({ icon: 'trash', title: 'Limpar a venda atual?', body: `${n === 1 ? 'O item' : `Os ${n} itens`}, o desconto e os dados do cliente serão descartados.`, ok: 'Limpar venda' })) {
    resetVenda(); toast('info', 'Venda limpa');
  }
  $('#busca').focus();
};
$('#finalizar').onclick = () => {
  if ($('#dlg').open) return;
  if (!Object.keys(cart).length) return erro('Carrinho vazio', 'Adicione um produto antes de finalizar.', $('#busca'));
  const t = totalFinal();
  const recTxt = $('#recebido').value, rec = parseFloat(recTxt);
  if (pgto() === 'Dinheiro' && recTxt && rec < t) return erro('Valor recebido menor que o total', 'Faltam ' + brl(t - rec), $('#recebido'));
  const cliente = { nome: $('#cNome').value.trim(), telefone: $('#cTel').value.trim(), cpf: $('#cCpf').value.trim() };
  if (cliente.telefone && ![10, 11].includes(dig(cliente.telefone).length)) { $('#cliente').open = true; return erro('Telefone inválido', 'Use DDD + número (10 ou 11 dígitos).', $('#cTel')); }
  if (cliente.cpf && !cpfValido(cliente.cpf)) { $('#cliente').open = true; return erro('CPF inválido', 'Confira os dígitos do cliente.', $('#cCpf')); }
  const itens = Object.entries(cart).map(([id, q]) => { const p = db.produtos.find(x => x.id === id); return { id, codigo: p.codigo, nome: p.nome, preco: pv(p), precoCheio: p.preco, qtd: q }; });
  const venda = { n: db.seq++, ts: Date.now(), itens, desconto: descontoValor(), pgto: pgto(), total: t };
  if (descTipo() === '%') venda.descontoPct = Math.min(100, Math.max(0, parseFloat($('#desc').value) || 0));
  if (cliente.nome || cliente.telefone || cliente.cpf) venda.cliente = cliente;
  db.vendas.push(venda);
  itens.forEach(i => { const p = db.produtos.find(x => x.id === i.id); if (p.estoque !== null) p.estoque -= i.qtd; });
  save();
  const cash = venda.pgto === 'Dinheiro' && recTxt !== '';
  const nItens = itens.reduce((s, i) => s + i.qtd, 0);
  resetVenda();
  abrirModal({
    icon: 'ok', tone: 'ok', title: `Venda #${venda.n} concluída`,
    body: `<div class="receipt">
      <div class="r"><span>Itens</span><b class="num">${nItens}</b></div>
      <div class="r"><span>Pagamento</span><b>${esc(venda.pgto)}</b></div>
      ${venda.desconto ? `<div class="r"><span>Desconto</span><b class="num">− ${brl(venda.desconto)}</b></div>` : ''}
      <div class="r"><span>Total</span><b class="num">${brl(t)}</b></div>
      ${cash ? `<div class="r"><span>Recebido</span><b class="num">${brl(rec)}</b></div><div class="big"><span>Troco</span><b class="num">${brl(Math.max(0, rec - t))}</b></div>` : ''}
    </div>`,
    actions: [{ value: 'ok', label: 'Nova venda <span class="kbd">Enter</span>', cls: 'btn-ok btn-block', autofocus: true }]
  }).then(() => { toast('ok', `Venda #${venda.n} registrada`, 'Pronto para a próxima'); $('#busca').focus(); });
};

/* ---------- Celular: barra fixa ---------- */
$('#mFinalizar').onclick = () => $('#finalizar').click();
$('#mVerCarrinho').onclick = () => $('#cartPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
let finalVisivel = false;
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => { finalVisivel = e.isIntersecting; atualizarMBar(); }).observe($('#finalizar'));
}
function atualizarMBar() { $('#mBar').classList.toggle('off', finalVisivel || secaoAtual() !== 'venda'); }

/* ---------- Produtos ---------- */
function renderProdutos() {
  $('#prodTotal').textContent = db.produtos.length;
  $('#listaProd').innerHTML = db.produtos.map(p => {
    const e = p.estoque;
    const tag = e === 0 ? '<span class="badge out">Esgotado</span>' : e !== null && e <= 5 ? '<span class="badge low">Baixo</span>' : '';
    return `<tr>
    <td><input class="cell num" data-f="codigo" data-id="${p.id}" value="${esc(p.codigo)}" aria-label="Código de ${esc(p.nome)}"></td>
    <td><input class="cell nome" data-f="nome" data-id="${p.id}" value="${esc(p.nome)}" aria-label="Nome"></td>
    <td class="r"><input class="cell r num" data-f="preco" data-id="${p.id}" type="number" step="0.01" value="${p.preco}" aria-label="Preço cheio de ${esc(p.nome)}"></td>
    <td class="r"><input class="cell r num" data-f="promo" data-id="${p.id}" type="number" step="0.01" value="${p.promo ?? ''}" placeholder="—" aria-label="Preço promocional de ${esc(p.nome)}"></td>
    <td class="r"><div class="w-est">${tag}<input class="cell r num" data-f="estoque" data-id="${p.id}" type="number" value="${p.estoque ?? ''}" placeholder="∞" aria-label="Estoque de ${esc(p.nome)}"></div></td>
    <td><button type="button" class="icon-btn" data-del="${p.id}" aria-label="Remover ${esc(p.nome)}">${ICON.trash}</button></td></tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="6">Nenhum produto ainda. Cadastre acima ou importe um CSV.</td></tr>';
  $$('[data-f]').forEach(i => i.onchange = () => {
    const p = db.produtos.find(x => x.id === i.dataset.id), f = i.dataset.f;
    if (f === 'codigo') { const c = i.value.trim(); if (!c || codigoExiste(c, p.id)) { toast('err', 'Código vazio ou já usado por outro produto.'); i.value = p.codigo; return; } p.codigo = c; }
    if (f === 'nome') p.nome = i.value.trim() || p.nome;
    if (f === 'preco') p.preco = Math.max(0, parseFloat(i.value) || 0);
    if (f === 'promo') { const v = i.value === '' ? null : parseFloat(i.value); if (v !== null && (isNaN(v) || v < 0 || v >= p.preco)) { toast('err', 'O preço promocional deve ser menor que o preço cheio.'); i.value = p.promo ?? ''; return; } p.promo = v; }
    if (f === 'estoque') p.estoque = i.value === '' ? null : Math.max(0, parseInt(i.value) || 0);
    save();
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const p = db.produtos.find(x => x.id === b.dataset.del);
    if (await confirmar({ icon: 'trash', title: `Remover “${p.nome}”?`, body: 'O produto sai do cadastro e do carrinho atual. Vendas já registradas não mudam.', ok: 'Remover produto' })) {
      db.produtos = db.produtos.filter(x => x.id !== p.id); delete cart[p.id]; save(); render(); toast('info', 'Produto removido', p.nome);
    }
  });
}
$('#formProd').onsubmit = e => e.preventDefault();
$('#addProd').onclick = e => {
  e.preventDefault();
  const nome = $('#pNome').value.trim(), preco = parseFloat($('#pPreco').value);
  if (!nome) return erro('Informe o nome do produto.', '', $('#pNome'));
  if (isNaN(preco)) return erro('Informe o preço.', '', $('#pPreco'));
  const promoTxt = $('#pPromo').value;
  const promo = promoTxt === '' ? null : parseFloat(promoTxt);
  if (promo !== null && (isNaN(promo) || promo < 0 || promo >= preco)) return erro('O preço promocional deve ser menor que o preço cheio.', '', $('#pPromo'));
  let codigo = $('#pCodigo').value.trim();
  if (codigo && codigoExiste(codigo)) return erro('Já existe um produto com esse código.', '', $('#pCodigo'));
  if (!codigo) codigo = proxCodigo();
  const e2 = $('#pEstoque').value;
  db.produtos.push({ id: uid(), codigo, nome, preco, promo, estoque: e2 === '' ? null : parseInt(e2) });
  $('#pCodigo').value = $('#pNome').value = $('#pPreco').value = $('#pPromo').value = $('#pEstoque').value = '';
  save(); render(); $('#pCodigo').focus();
  toast('ok', 'Produto adicionado', `#${codigo} · ${nome}`);
  const wrap = $('#listaProd').closest('.tbl-wrap'); wrap.scrollTop = wrap.scrollHeight;
};
/* Lê valores de planilha: "R$ 74,90", "74,90", "74.90", "R$ 1.234,56", "1,234.56" */
function parseValor(txt) {
  let s = String(txt || '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  const ultVirg = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.');
  if (ultVirg > ultPonto) s = s.replace(/\./g, '').replace(',', '.');   // vírgula decimal (BR)
  else if (ultVirg !== -1) s = s.replace(/,/g, '');                      // vírgula de milhar (US)
  return parseFloat(s);
}
$('#impProd').onclick = () => $('#fileCsv').click();
$('#fileCsv').onchange = async e => {
  const arq = e.target.files[0];
  const txt = (await arq.text()).replace(/^﻿/, '');
  let n = 0, cabecalho = '';
  const problemas = []; // {linha, conteudo, motivo, tipo: 'ignorada' | 'aviso'}
  const linhas = txt.split(/\r?\n/);
  const first = linhas[0] || '';
  const sep = [';', ',', '\t'].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const splitLine = l => { const out = []; let cur = '', q = false; for (let k = 0; k < l.length; k++) { const ch = l[k]; if (ch === '"') { if (q && l[k + 1] === '"') { cur += '"'; k++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  linhas.forEach((l, i) => {
    if (!l.trim()) return;
    const c = splitLine(l);
    const preco = parseValor(c[2]);
    const prob = (motivo, tipo = 'ignorada') => problemas.push({ linha: i + 1, conteudo: l, motivo, tipo });
    if (!c[1] || isNaN(preco)) {
      if (i === 0) { cabecalho = l; return; } // cabeçalho
      return prob(!c[1] ? 'Sem nome do produto' : c[2] ? `Preço inválido: “${c[2]}”` : 'Sem preço');
    }
    if (c[0] && codigoExiste(c[0])) return prob(`Código ${c[0]} já existe no cadastro`);
    let promo = c[3] ? parseValor(c[3]) : null;
    if (promo !== null && (isNaN(promo) || promo < 0 || promo >= preco)) { prob(`Preço promo “${c[3]}” inválido (deve ser menor que o cheio). Importado sem promoção`, 'aviso'); promo = null; }
    const est = c[4] ? parseInt(c[4]) : null;
    db.produtos.push({ id: uid(), codigo: c[0] || proxCodigo(), nome: c[1], preco, promo, estoque: isNaN(est) ? null : est }); n++;
  });
  e.target.value = ''; save(); render();

  if (!problemas.length) return toast(n ? 'ok' : 'err', n + ' produtos importados', n ? '' : 'Nenhuma linha válida no arquivo.');
  const ign = problemas.filter(p => p.tipo === 'ignorada'), avi = problemas.filter(p => p.tipo === 'aviso');
  const resumo = [ign.length && `${ign.length} ${ign.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}`, avi.length && `${avi.length} ${avi.length === 1 ? 'importada' : 'importadas'} com aviso`].filter(Boolean).join(' · ');
  abrirModal({
    icon: ign.length ? 'alert' : 'info', tone: ign.length ? 'bad' : '', wide: true,
    title: `${n} ${n === 1 ? 'produto importado' : 'produtos importados'}`,
    body: `<p>${resumo}. Confira abaixo o conteúdo de cada linha com problema.</p>
      <div class="imp-list scroll-y" tabindex="0" aria-label="Linhas com problema">${problemas.map(p => `
        <div class="imp-row ${p.tipo}">
          <span class="ln num">Linha ${p.linha}</span><span class="mot">${esc(p.motivo)}</span>
          <code>${esc(p.conteudo) || '<em>(vazia)</em>'}</code>
        </div>`).join('')}
      </div>`,
    actions: [
      ...(ign.length ? [{ type: 'button', label: 'Baixar linhas ignoradas', cls: 'btn-secondary', id: 'impBaixar' }] : []),
      { value: 'ok', label: 'OK', cls: 'btn-primary', autofocus: true }
    ],
    onOpen: d => {
      const b = d.querySelector('#impBaixar');
      if (b) b.onclick = () => {
        const nome = arq.name.replace(/\.[^.]+$/, '') + ' - linhas ignoradas.csv';
        download(nome, '﻿' + [...(cabecalho ? [cabecalho] : []), ...ign.map(p => p.conteudo)].join('\r\n'), 'text/csv');
      };
    }
  });
};

$('#limparProd').onclick = async () => {
  const n = db.produtos.length;
  if (!n) return toast('info', 'Não há produtos para apagar');
  const v = await abrirModal({
    icon: 'trash', tone: 'bad', title: n === 1 ? 'Apagar o único produto cadastrado?' : `Apagar todos os ${n} produtos?`,
    body: `<p>O cadastro e o carrinho atual serão esvaziados. As vendas já registradas não mudam. Não dá para desfazer; baixe um backup antes.</p>
      <div class="field"><label for="lpConf">Digite LIMPAR para confirmar</label><input id="lpConf" class="input" autocomplete="off" placeholder="LIMPAR"></div>`,
    actions: [
      { type: 'button', label: 'Baixar backup', cls: 'btn-secondary', id: 'lpBkp' },
      { value: 'ok', label: 'Apagar produtos', cls: 'btn-danger', id: 'lpOk' }
    ],
    onOpen: d => {
      const i = d.querySelector('#lpConf'), ok = d.querySelector('#lpOk');
      ok.disabled = true;
      i.oninput = () => { ok.disabled = i.value.trim().toUpperCase() !== 'LIMPAR'; };
      d.querySelector('#lpBkp').onclick = baixarBackup;
      i.focus();
    }
  });
  if (v === 'ok') { db.produtos = []; cart = {}; save(); render(); toast('info', 'Produtos apagados', `${n} ${n === 1 ? 'produto removido' : 'produtos removidos'}`); }
};

/* ---------- Vendas ---------- */
function renderVendasSub() { $('#vendasSub').textContent = (db.evento ? db.evento + ' · ' : '') + 'resumo do evento'; }
function renderVendas() {
  renderVendasSub();
  const tot = db.vendas.reduce((s, v) => s + v.total, 0);
  const por = p => db.vendas.filter(v => v.pgto === p).reduce((s, v) => s + v.total, 0);
  $('#stats').innerHTML = [['Faturamento', brl(tot), '', 'hl'], ['Vendas', db.vendas.length, ''], ['Dinheiro', brl(por('Dinheiro')), ICON.cash], ['Pix', brl(por('Pix')), ICON.pix], ['Cartão', brl(por('Cartão')), ICON.card]]
    .map(([a, b, ic, cls = '']) => `<div class="card stat ${cls}"><small>${ic}${a}</small><div class="v num">${b}</div></div>`).join('');
  $('#listaVendas').innerHTML = db.vendas.slice().reverse().map(v => `<tr><td class="num"><b>${v.n}</b></td><td class="num">${new Date(v.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
    <td>${v.cliente ? `<div style="font-weight:600">${esc(v.cliente.nome) || '—'}</div>` + ([v.cliente.telefone, v.cliente.cpf].some(Boolean) ? `<div class="muted num">${esc([v.cliente.telefone, v.cliente.cpf].filter(Boolean).join(' · '))}</div>` : '') : '<span class="muted">—</span>'}</td>
    <td>${v.itens.map(i => i.qtd + '× ' + esc(i.nome)).join(', ')}</td><td><span class="pg-tag">${esc(v.pgto)}</span></td><td class="r num"><b>${brl(v.total)}</b></td>
    <td class="r"><button type="button" class="btn btn-danger-ghost btn-sm" data-cancel="${v.n}">Cancelar</button></td></tr>`).join('')
    || '<tr class="empty-row"><td colspan="7">Nenhuma venda registrada ainda.</td></tr>';
  $$('[data-cancel]').forEach(b => b.onclick = async () => {
    const v = db.vendas.find(x => x.n == b.dataset.cancel);
    const n = v.itens.reduce((s, i) => s + i.qtd, 0);
    if (!await confirmar({ title: `Cancelar a venda #${v.n}?`, body: `${brl(v.total)} · ${n} ${n === 1 ? 'item' : 'itens'}. O estoque será devolvido.`, ok: 'Cancelar venda' })) return;
    v.itens.forEach(i => { const p = db.produtos.find(x => x.id === i.id); if (p && p.estoque !== null) p.estoque += i.qtd; });
    db.vendas = db.vendas.filter(x => x !== v); save(); render();
    toast('info', `Venda #${v.n} cancelada`, 'Estoque devolvido');
  });
}
function download(nome, txt, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href); }
$('#expCsv').onclick = () => {
  const l = ['venda;data_hora;codigo;produto;qtd;preco_unit;preco_cheio;pagamento;desconto_venda;total_venda;cliente_nome;cliente_telefone;cliente_cpf'];
  db.vendas.forEach(v => v.itens.forEach(i => l.push([v.n, new Date(v.ts).toLocaleString('pt-BR'), i.codigo || '', i.nome.replace(/;/g, ','), i.qtd, i.preco.toFixed(2).replace('.', ','), (i.precoCheio ?? i.preco).toFixed(2).replace('.', ','), v.pgto, v.desconto.toFixed(2).replace('.', ','), v.total.toFixed(2).replace('.', ','), (v.cliente?.nome || '').replace(/;/g, ','), v.cliente?.telefone || '', v.cliente?.cpf || ''].join(';'))));
  download('vendas.csv', '﻿' + l.join('\n'), 'text/csv');
};
const baixarBackup = () => download('pdv-backup.json', JSON.stringify(db), 'application/json');
$('#bkp').onclick = baixarBackup;
$('#rest').onclick = () => $('#fileBkp').click();
$('#fileBkp').onchange = async e => {
  try { const d = JSON.parse(await e.target.files[0].text()); if (!d.produtos || !d.vendas) throw 0; db = d; save(); $('#evento').value = db.evento || ''; cart = {}; render(); toast('ok', 'Backup restaurado', `${db.produtos.length} produtos · ${db.vendas.length} vendas`); }
  catch (x) { toast('err', 'Arquivo inválido.', 'Escolha um backup .json gerado pelo Mini PDV.'); }
  e.target.value = '';
};
$('#zerar').onclick = async () => {
  if (!db.vendas.length) return toast('info', 'Não há vendas para apagar');
  const v = await abrirModal({
    icon: 'trash', tone: 'bad', title: db.vendas.length === 1 ? 'Apagar a única venda registrada?' : `Apagar todas as ${db.vendas.length} vendas?`,
    body: `<p>Não dá para desfazer. Baixe um backup antes.</p>
      <div class="field"><label for="zConf">Digite ZERAR para confirmar</label><input id="zConf" class="input" autocomplete="off" placeholder="ZERAR"></div>`,
    actions: [
      { type: 'button', label: 'Baixar backup', cls: 'btn-secondary', id: 'zBkp' },
      { value: 'ok', label: 'Apagar vendas', cls: 'btn-danger', id: 'zOk' }
    ],
    onOpen: d => {
      const i = d.querySelector('#zConf'), ok = d.querySelector('#zOk');
      ok.disabled = true;
      i.oninput = () => { ok.disabled = i.value.trim().toUpperCase() !== 'ZERAR'; };
      d.querySelector('#zBkp').onclick = baixarBackup;
      i.focus();
    }
  });
  if (v === 'ok') { db.vendas = []; db.seq = 1; save(); render(); toast('info', 'Vendas zeradas'); }
};

/* ---------- Atalhos de teclado ---------- */
document.addEventListener('keydown', e => {
  if ($('#dlg').open) return; // o modal cuida de Enter/Esc
  if (e.altKey && /^Digit[123]$/.test(e.code)) { e.preventDefault(); irPara(['venda', 'produtos', 'vendas'][+e.code.slice(-1) - 1]); return; }
  const k = e.key;
  if (['F2', 'F4', 'F6', 'F8', 'F9'].includes(k)) {
    e.preventDefault();
    if (secaoAtual() !== 'venda') irPara('venda');
    if (k === 'F2') { $('#busca').focus(); $('#busca').select(); }
    if (k === 'F4') $('#finalizar').click();
    if (k === 'F6') { if (pgto() !== 'Dinheiro') { setPgto('Dinheiro'); renderCart(); } $('#recebido').focus(); $('#recebido').select(); }
    if (k === 'F8') $('#limpar').click();
    if (k === 'F9') { $('#desc').focus(); $('#desc').select(); }
    return;
  }
  // Leitor de código de barras / digitação: se o foco não está num campo, manda para a busca
  const tag = document.activeElement?.tagName;
  if (secaoAtual() === 'venda' && k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) {
    $('#busca').focus();
  }
});

/* ---------- Render ---------- */
function render() { renderProds(); renderCart(); renderProdutos(); renderVendas(); atualizarMBar(); }
render();
