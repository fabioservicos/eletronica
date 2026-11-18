/**
 * ELETRÔNICA CAJOBI – Backend (Google Apps Script) – v3 (perfis, financeiro, comissões)
 * Banco: Google Sheets (criado/migrado automaticamente) · Fotos: Google Drive · Interface: GitHub Pages.
 * Migração segura: só ACRESCENTA abas/colunas, nunca apaga dados; faz backup antes de alterar a estrutura.
 */
const TZ = 'America/Sao_Paulo';
const SCHEMA = 3; // versão da estrutura da planilha
const ABAS = {
  Clientes: ['ID', 'Nome', 'Telefone', 'Documento', 'Email', 'Criado'],
  Equipamentos: ['Protocolo', 'Entrada', 'ClienteID', 'Cliente', 'Telefone', 'Tipo', 'Marca', 'Modelo', 'Serie', 'Defeito', 'Acessorios', 'Status', 'Valor', 'Prazo', 'Laudo', 'Fotos', 'Atualizado',
    // --- colunas acrescentadas na v3 (ficam sempre no final; os dados antigos não são tocados) ---
    'TecnicoID', 'Tecnico', 'CustoMaterial', 'MaoDeObra', 'FormaPag', 'Recebido', 'SitPag', 'ComissaoPct', 'ComissaoValor', 'Servico', 'GarantiaDias', 'Conclusao', 'GarantiaAte', 'Previsao'],
  Historico: ['Data', 'Protocolo', 'Status', 'Observacao', 'Usuario', 'WhatsApp'],
  Mensagens: ['Data', 'Protocolo', 'Telefone', 'Texto', 'Resultado'],
  Config: ['Chave', 'Valor'],
  Usuarios: ['ID', 'Nome', 'Perfil', 'PINHash', 'Comissao', 'Ativo', 'Criado'],
  Pagamentos: ['ID', 'Data', 'Protocolo', 'Forma', 'Valor', 'Obs', 'Usuario'],
  Comissoes: ['ID', 'Protocolo', 'UsuarioID', 'Tecnico', 'Base', 'Pct', 'Valor', 'Status', 'Gerada', 'Paga', 'PagaPor']
};
const CFG0 = {
  EMPRESA: 'Eletrônica Cajobi', RAZAO_SOCIAL: '', CNPJ: '', ENDERECO: '', CIDADE_UF: '', CEP: '', TELEFONE: '', TELEFONE_EMPRESA: '', EMAIL: '',
  INFO_ADICIONAL: '', PIX: '', HORARIO: 'Seg a Sex, 8h às 18h',
  FORMAS_PAG: 'Dinheiro,Pix,Cartão de débito,Cartão de crédito,Transferência bancária', GARANTIA_DIAS: '90',
  REGRA_COMISSAO: 'CONCLUSAO', // CONCLUSAO = ao ficar pronto · PAGAMENTO = só após pagamento total
  LOGO_DATA: '',
  PROVEDOR: 'MANUAL', // MANUAL | ZAPI | EVOLUTION | META
  FRONTEND_URL: 'https://fabioservicos.github.io/eletronica_cajobi/',
  API_URL: '', API_ID: '', API_TOKEN: '', CLIENT_TOKEN: '', DIAS_ABANDONO: '90'
};
// Configurações que o FUNCIONÁRIO pode receber (nada de tokens, custos ou financeiro)
const CFG_PUB = ['EMPRESA', 'RAZAO_SOCIAL', 'CNPJ', 'ENDERECO', 'CIDADE_UF', 'CEP', 'TELEFONE', 'TELEFONE_EMPRESA', 'EMAIL', 'INFO_ADICIONAL', 'PIX', 'HORARIO', 'FORMAS_PAG', 'GARANTIA_DIAS', 'DIAS_ABANDONO', 'LOGO_DATA'];
// Campos financeiros internos: removidos no servidor para quem não é proprietário
const FIN = ['CustoMaterial', 'MaoDeObra', 'FormaPag', 'Recebido', 'SitPag', 'ComissaoPct', 'ComissaoValor'];
const FIM = ['Pronto para retirada', 'Entregue ao cliente', 'Cancelado', 'Orçamento recusado', 'Sem conserto'];
const COBRAVEL = ['Orçamento aprovado', 'Aguardando peça', 'Em conserto', 'Pronto para retirada', 'Entregue ao cliente'];
const FLUXO = [
  { s: 'Recebido para orçamento', m: 'Olá, {nome}! 👋\nRecebemos seu equipamento na *{empresa}*.\n\n📋 Protocolo: *{protocolo}*\n🔧 Item: {equip}\n❗ Defeito: {defeito}\n\nAcompanhe cada etapa em tempo real:\n{link}' },
  { s: 'Em análise técnica', m: '🔍 {nome}, seu *{equip}* (protocolo {protocolo}) está em análise técnica. Avisaremos assim que o orçamento ficar pronto.{obs}\n{link}' },
  { s: 'Aguardando aprovação do orçamento', m: '💰 {nome}, o orçamento do seu *{equip}* ficou pronto!\n\nProtocolo: {protocolo}\nValor: *{valor}*\nPrazo: {prazo}{obs}\n\nPara aprovar ou recusar, acesse:\n{link}' },
  { s: 'Orçamento aprovado', m: '✅ Orçamento aprovado, {nome}! Vamos iniciar o conserto do *{equip}* (protocolo {protocolo}).\nPrazo previsto: {prazo}' },
  { s: 'Aguardando peça', m: '📦 {nome}, estamos aguardando a chegada de uma peça para o *{equip}* (protocolo {protocolo}).{obs}\n{link}' },
  { s: 'Em conserto', m: '🛠️ {nome}, o conserto do seu *{equip}* (protocolo {protocolo}) está em andamento.{obs}' },
  { s: 'Pronto para retirada', m: '🎉 {nome}, seu *{equip}* está pronto para retirada!\n\nProtocolo: {protocolo}\nValor: {valor}\n🕘 {horario}\n📍 {endereco}\nLeve um documento com foto.{obs}' },
  { s: 'Orçamento recusado', m: '{nome}, registramos que o orçamento do *{equip}* (protocolo {protocolo}) foi recusado. O equipamento está disponível para retirada.\n🕘 {horario}\n📍 {endereco}' },
  { s: 'Sem conserto', m: '😕 {nome}, após a análise técnica o *{equip}* (protocolo {protocolo}) não tem conserto.{obs}\nEle está disponível para retirada.\n🕘 {horario}\n📍 {endereco}' },
  { s: 'Entregue ao cliente', m: '📦 {nome}, confirmamos a entrega do *{equip}* (protocolo {protocolo}). Obrigado pela confiança na *{empresa}*!' },
  { s: 'Cancelado', m: '{nome}, o atendimento do protocolo {protocolo} foi cancelado.{obs}' }
];

/* ---------- Entrada web ---------- */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    try { return json_(dispatch_(e.parameter.fn, JSON.parse(e.parameter.args || '[]'))); }
    catch (err) { return json_({ error: String(err.message || err) }); }
  }
  ss_();
  const frontend = cfg_().FRONTEND_URL;
  const target = frontend || 'https://github.com/';
  return HtmlService.createHtmlOutput('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + target + '"><title>Eletrônica Cajobi</title></head><body style="font:16px Arial;padding:30px"><h2>Eletrônica Cajobi</h2><p>Redirecionando para o sistema...</p><p><a href="' + target + '">Clique aqui para abrir</a></p></body></html>')
    .setTitle('Eletrônica Cajobi')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/** API HTTP usada pelo frontend hospedado no GitHub Pages. */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(dispatch_(body.fn, body.args || []));
  } catch (err) { return json_({ error: String(err.message || err) }); }
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
const ROTAS_ = { api_login, api_buscarCliente, api_criarEntrada, api_listar, api_detalhe, api_atualizar, api_reenviar, api_salvarConfig,
  api_dashboard, api_financeiro, api_pagamento, api_comissoes, api_pagarComissao, api_usuarios, api_salvarUsuario, api_backup, pub_consultar, pub_responder };
function dispatch_(fn, args) {
  const f = ROTAS_[fn]; if (!f) throw new Error('Operação não permitida.');
  migrar_();
  return f.apply(null, args);
}
/** Rode UMA vez no editor após colar o código: autoriza, migra a planilha (com backup) e ativa o backup diário. */
function iniciar() { ss_(); migrar_(); pasta_(); ativarBackupDiario(); Logger.log('Planilha: ' + ss_().getUrl()); }

/* ---------- Banco ---------- */
let _ss, _cfg;
function ss_() {
  if (_ss) return _ss;
  const P = PropertiesService.getScriptProperties(), id = P.getProperty('SSID');
  if (id) { try { return (_ss = SpreadsheetApp.openById(id)); } catch (e) { } }
  const ss = SpreadsheetApp.create('Eletrônica Cajobi – Banco de Dados');
  P.setProperty('SSID', ss.getId());
  ss.getSheets()[0].setName('Config');
  _ss = ss; migrar_(); // cria as demais abas, configurações padrão e o usuário proprietário
  return ss;
}
/**
 * Migração SEGURA e REPETÍVEL: cria abas que faltam, acrescenta colunas que faltam (no final),
 * completa configurações ausentes e cria o proprietário. Nunca apaga nem sobrescreve registros.
 * Faz backup (cópia da planilha no Drive) antes de qualquer alteração estrutural.
 */
function migrar_() {
  const P = PropertiesService.getScriptProperties();
  if (Number(P.getProperty('SCHEMA') || 0) >= SCHEMA) return;
  const lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    if (Number(P.getProperty('SCHEMA') || 0) >= SCHEMA) return;
    const ss = ss_();
    if (ss.getSheetByName('Equipamentos')) backup_('antes da migração v' + SCHEMA);
    const moeda = ['Telefone', 'Valor', 'Documento', 'Chave', 'CustoMaterial', 'MaoDeObra', 'Recebido', 'ComissaoValor', 'ComissaoPct', 'Base', 'Pct', 'Comissao', 'PINHash'];
    Object.keys(ABAS).forEach(n => {
      const sh = ss.getSheetByName(n) || ss.insertSheet(n);
      const tem = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
      const falta = ABAS[n].filter(h => tem.indexOf(h) < 0), todas = tem.concat(falta);
      if (falta.length) sh.getRange(1, tem.length + 1, 1, falta.length).setValues([falta]);
      sh.getRange(1, 1, 1, todas.length).setFontWeight('bold').setBackground('#0b57b8').setFontColor('#ffffff'); sh.setFrozenRows(1);
      falta.forEach(h => { if (moeda.indexOf(h) >= 0) sh.getRange(2, todas.indexOf(h) + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@'); });
    });
    const cs = ss.getSheetByName('Config'), cv = cs.getDataRange().getValues().slice(1), tem = cv.map(r => String(r[0]));
    const novas = Object.keys(CFG0).filter(k => tem.indexOf(k) < 0).map(k => [k, CFG0[k]]);
    if (novas.length) cs.getRange(cs.getLastRow() + 1, 1, novas.length, 2).setValues(novas);
    if (!tab_('Usuarios').rows.length) { // o PIN único antigo vira o PIN do proprietário (guardado só como hash)
      const old = cv.find(r => r[0] === 'PIN'), v = old ? String(old[1]).trim() : '';
      add_('Usuarios', { ID: 'U001', Nome: 'Proprietário', Perfil: 'PROPRIETARIO', PINHash: hash_(v && v.charAt(0) !== '*' ? v : '1234'), Comissao: '0', Ativo: 'SIM', Criado: agora_() });
      if (old) cs.getRange(cv.indexOf(old) + 2, 2).setValue('*** (movido para a aba Usuarios)');
    }
    P.setProperty('SCHEMA', String(SCHEMA)); _cfg = null;
  } finally { lock.releaseLock(); }
}
/** Cópia da planilha em uma pasta "Backups" do Drive (mantém as 30 mais recentes). */
function backup_(motivo) {
  const P = PropertiesService.getScriptProperties(); let pasta;
  try { pasta = DriveApp.getFolderById(P.getProperty('BACKUPS')); } catch (e) { pasta = DriveApp.createFolder('Eletrônica Cajobi – Backups'); P.setProperty('BACKUPS', pasta.getId()); }
  const f = DriveApp.getFileById(ss_().getId()).makeCopy('Backup ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH-mm') + ' – ' + motivo, pasta);
  const lista = [], it = pasta.getFiles(); while (it.hasNext()) lista.push(it.next());
  lista.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(30).forEach(x => x.setTrashed(true));
  return f.getUrl();
}
function backupDiario() { backup_('diário'); }
function ativarBackupDiario() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupDiario').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(2).create();
}
function pasta_() {
  const P = PropertiesService.getScriptProperties(); let id = P.getProperty('PASTA');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  const f = DriveApp.createFolder('Eletrônica Cajobi – Fotos dos equipamentos'); P.setProperty('PASTA', f.getId()); return f;
}
function tab_(n) {
  const sh = ss_().getSheetByName(n), v = sh.getDataRange().getDisplayValues(), h = v.shift();
  return { sh, h, rows: v.map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; }) };
}
function add_(n, o) { // usa os cabeçalhos REAIS da aba (a ordem das colunas pode ter mudado)
  const sh = ss_().getSheetByName(n), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(h.map(k => o[k] !== undefined ? o[k] : ''));
}
function put_(t, row, o) {
  const rng = t.sh.getRange(row, 1, 1, t.h.length), cur = rng.getValues()[0];
  rng.setValues([t.h.map((k, j) => k in o ? o[k] : cur[j])]);
}
function cfg_() {
  if (_cfg) return _cfg;
  const c = Object.assign({}, CFG0);
  tab_('Config').rows.forEach(r => { if (r.Chave) c[r.Chave] = r.Valor; });
  if (c.EMPRESA === 'Minha Oficina Eletrônica') c.EMPRESA = CFG0.EMPRESA;
  if (!String(c.FRONTEND_URL || '').trim()) c.FRONTEND_URL = CFG0.FRONTEND_URL;
  return (_cfg = c);
}
const agora_ = () => Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
function normTel_(t) { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
const brl_ = v => v ? 'R$ ' + Number(v).toFixed(2).replace('.', ',') : '—';
const equip_ = e => [e.Tipo, e.Marca, e.Modelo].filter(Boolean).join(' ');
const link_ = p => (cfg_().FRONTEND_URL || ScriptApp.getService().getUrl()) + '?p=' + encodeURIComponent(p);

function hash_(pin) {
  const P = PropertiesService.getScriptProperties(); let s = P.getProperty('SALT');
  if (!s) { s = Utilities.getUuid(); P.setProperty('SALT', s); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + ':' + pin, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
/** Autentica pelo PIN individual. perfil='PROPRIETARIO' exige dono. Valida SEMPRE no servidor. */
function auth_(pin, perfil) {
  migrar_();
  const cache = CacheService.getScriptCache(), n = Number(cache.get('falhas') || 0);
  if (n >= 30) throw new Error('Muitas tentativas incorretas. Aguarde 10 minutos.');
  const h = hash_(String(pin || '')), u = tab_('Usuarios').rows.find(r => r.PINHash === h && r.Ativo === 'SIM');
  if (!u) { cache.put('falhas', String(n + 1), 600); Utilities.sleep(1500); throw new Error('PIN inválido.'); }
  if (perfil && u.Perfil !== perfil) throw new Error('Acesso restrito ao proprietário.');
  return u;
}
const isOwner_ = u => u.Perfil === 'PROPRIETARIO';
const vis_ = (e, u) => isOwner_(u) || !e.TecnicoID || e.TecnicoID === u.ID; // funcionário vê só os seus e os sem técnico
function strip_(e, u) { const o = Object.assign({}, e); delete o._row; if (!isOwner_(u)) FIN.forEach(k => delete o[k]); return o; }
const num_ = (v, nome) => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(',', '.')); if (isNaN(n) || n < 0) throw new Error(nome + ' inválido.'); return n.toFixed(2); };
const pad_ = (p, n, w) => p + String(n).padStart(w, '0');
const chave_ = s => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
const isoChave_ = s => s ? +String(s).replace(/-/g, '') : 0;
const hoje_ = () => +Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
const noPeriodo_ = (data, p) => { const k = chave_(data); return (!p || !p.de || k >= isoChave_(p.de)) && (!p || !p.ate || k <= isoChave_(p.ate)); };
const atrasado_ = e => !!e.Previsao && isoChave_(e.Previsao) < hoje_() && FIM.indexOf(e.Status) < 0;
const sitPag_ = (t, r) => t > 0 && r >= t - 0.004 ? 'Pago' : r > 0 ? 'Parcial' : 'Pendente';
function comLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function cfgPara_(u) { const c = cfg_(), o = {}; (isOwner_(u) ? Object.keys(CFG0) : CFG_PUB).forEach(k => o[k] = c[k]); return o; }
function usuarios_() { return tab_('Usuarios').rows.map(r => ({ ID: r.ID, Nome: r.Nome, Perfil: r.Perfil, Comissao: r.Comissao, Ativo: r.Ativo })); }

/* ---------- WhatsApp ---------- */
function enviar_(tel, texto, proto) {
  const c = cfg_(), num = normTel_(tel);
  let res = 'MANUAL (aguardando envio)';
  try {
    let r;
    if (c.PROVEDOR === 'META') {
      r = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + c.API_ID + '/messages', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + c.API_TOKEN },
        payload: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: texto, preview_url: true } })
      });
    } else if (c.PROVEDOR === 'ZAPI') {
      r = UrlFetchApp.fetch(c.API_URL.replace(/\/$/, '') + '/send-text', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'Client-Token': c.CLIENT_TOKEN }, payload: JSON.stringify({ phone: num, message: texto })
      });
    } else if (c.PROVEDOR === 'EVOLUTION') {
      r = UrlFetchApp.fetch(c.API_URL.replace(/\/$/, '') + '/message/sendText/' + c.API_ID, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { apikey: c.API_TOKEN }, payload: JSON.stringify({ number: num, text: texto })
      });
    }
    if (r) res = r.getResponseCode() < 300 ? 'ENVIADO' : 'ERRO ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 150);
  } catch (e) { res = 'ERRO: ' + e.message; }
  add_('Mensagens', { Data: agora_(), Protocolo: proto, Telefone: num, Texto: texto, Resultado: res });
  return { resultado: res, link: 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto) };
}
function montar_(status, e, obs) {
  const f = FLUXO.find(x => x.s === status); if (!f) return null;
  const c = cfg_(), v = {
    nome: String(e.Cliente || '').split(' ')[0], empresa: c.EMPRESA, protocolo: e.Protocolo, equip: equip_(e),
    defeito: e.Defeito, valor: brl_(e.Valor), prazo: e.Prazo || 'a combinar', link: link_(e.Protocolo),
    horario: c.HORARIO, endereco: c.ENDERECO || c.EMPRESA, obs: obs ? '\n📝 ' + obs : ''
  };
  return f.m.replace(/\{(\w+)\}/g, (_, k) => v[k] !== undefined ? v[k] : '');
}
function mudar_(t, e, status, obs, extra, notificar, usuario) {
  const upd = Object.assign({ Status: status, Atualizado: agora_() }, extra || {});
  put_(t, e._row, upd);
  const atual = Object.assign({}, e, upd);
  let w = { resultado: 'não notificado', link: '' };
  if (notificar) { const txt = montar_(status, atual, obs); if (txt) w = enviar_(atual.Telefone, txt, atual.Protocolo); }
  add_('Historico', { Data: agora_(), Protocolo: e.Protocolo, Status: status, Observacao: obs || '', Usuario: usuario, WhatsApp: w.resultado });
  return w;
}

/* ---------- API do balcão (PIN individual validado no servidor) ---------- */
function api_buscarCliente(pin, tel) {
  auth_(pin); const n = normTel_(tel);
  const c = tab_('Clientes').rows.find(r => normTel_(r.Telefone) === n);
  return c ? { id: c.ID, nome: c.Nome, doc: c.Documento, email: c.Email } : null;
}
function api_criarEntrada(pin, d) {
  const u = auth_(pin);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const c = d.cliente, q = d.equip, tel = normTel_(c.telefone);
    if (!c.nome || tel.length < 12) throw new Error('Informe nome e telefone com DDD.');
    if (!q.tipo) throw new Error('Informe o tipo do equipamento.');
    const ct = tab_('Clientes');
    let cl = ct.rows.find(r => normTel_(r.Telefone) === tel);
    if (!cl) {
      cl = { ID: 'C' + String(ct.rows.length + 1).padStart(5, '0'), Nome: c.nome, Telefone: tel, Documento: c.doc || '', Email: c.email || '', Criado: agora_() };
      add_('Clientes', cl);
    }
    const P = PropertiesService.getScriptProperties();
    const seq = Number(P.getProperty('SEQ') || 0) + 1; P.setProperty('SEQ', seq);
    const proto = 'OF-' + Utilities.formatDate(new Date(), TZ, 'yyyy') + '-' + String(seq).padStart(4, '0');
    let fotos = '';
    if ((d.fotos || []).length) {
      const pasta = pasta_();
      fotos = d.fotos.slice(0, 6).map((f, i) => {
        const file = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(f.split(',')[1]), 'image/jpeg', proto + '_' + (i + 1) + '.jpg'));
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
        return file.getUrl();
      }).join('\n');
    }
    const eq = {
      Protocolo: proto, Entrada: agora_(), ClienteID: cl.ID, Cliente: cl.Nome, Telefone: tel, Tipo: q.tipo, Marca: q.marca || '', Modelo: q.modelo || '',
      Serie: q.serie || '', Defeito: q.defeito || '', Acessorios: q.acessorios || '', Status: FLUXO[0].s, Valor: '', Prazo: '', Laudo: '', Fotos: fotos, Atualizado: agora_(), GarantiaDias: cfg_().GARANTIA_DIAS
    };
    add_('Equipamentos', eq);
    const txt = montar_(FLUXO[0].s, eq, '');
    const w = enviar_(tel, txt, proto);
    add_('Historico', { Data: agora_(), Protocolo: proto, Status: FLUXO[0].s, Observacao: 'Equipamento recebido no balcão', Usuario: u.Nome, WhatsApp: w.resultado });
    const c0 = cfg_();
    return { protocolo: proto, whats: w, comprovante: Object.assign({}, eq, { empresa: c0.EMPRESA, endereco: c0.ENDERECO, telEmpresa: c0.TELEFONE_EMPRESA, link: link_(proto), dias: c0.DIAS_ABANDONO, fotosQtd: fotos ? fotos.split('\n').length : 0 }) };
  } finally { lock.releaseLock(); }
}
function api_reenviar(pin, p) {
  auth_(pin);
  const e = tab_('Equipamentos').rows.find(r => r.Protocolo === p); if (!e) throw new Error('Protocolo não encontrado.');
  return enviar_(e.Telefone, montar_(e.Status, e, ''), p);
}
function api_login(pin) {
  const u = auth_(pin), c = cfgPara_(u);
  c.USUARIO = { ID: u.ID, Nome: u.Nome, Perfil: u.Perfil };
  c.PLANILHA = isOwner_(u) ? ss_().getUrl() : '';
  c.ALERTA_PIN = isOwner_(u) && u.PINHash === hash_('1234');
  return c;
}
function api_listar(pin) {
  const u = auth_(pin), dono = isOwner_(u);
  return tab_('Equipamentos').rows.filter(r => vis_(r, u)).reverse().slice(0, 500).map(r => {
    const o = { Protocolo: r.Protocolo, Entrada: r.Entrada, Cliente: r.Cliente, Telefone: r.Telefone, Equip: equip_(r), Status: r.Status, Tecnico: r.Tecnico, Previsao: r.Previsao, Atrasado: atrasado_(r), Atualizado: r.Atualizado };
    if (dono) { o.Valor = r.Valor; o.SitPag = r.SitPag; }
    return o;
  });
}
function api_detalhe(pin, p) {
  const u = auth_(pin), t = tab_('Equipamentos'), e = t.rows.find(r => r.Protocolo === p);
  if (!e || !vis_(e, u)) throw new Error('Protocolo não encontrado.');
  const outros = t.rows.filter(r => r.ClienteID === e.ClienteID && r.Protocolo !== p && vis_(r, u)).reverse()
    .map(r => ({ Protocolo: r.Protocolo, Entrada: r.Entrada, Equip: equip_(r), Status: r.Status, Conclusao: r.Conclusao, GarantiaAte: r.GarantiaAte, Servico: r.Servico, Tecnico: r.Tecnico }));
  const res = { e: strip_(e, u), h: tab_('Historico').rows.filter(r => r.Protocolo === p).reverse(), outros, link: link_(p) };
  if (isOwner_(u)) { res.pagamentos = tab_('Pagamentos').rows.filter(r => r.Protocolo === p); res.usuarios = usuarios_().filter(x => x.Ativo === 'SIM'); }
  return res;
}
function api_atualizar(pin, d) {
  const u = auth_(pin), dono = isOwner_(u);
  return comLock_(() => {
    const t = tab_('Equipamentos'), e = t.rows.find(r => r.Protocolo === d.protocolo);
    if (!e || !vis_(e, u)) throw new Error('Protocolo não encontrado.');
    if (!FLUXO.some(f => f.s === d.status)) throw new Error('Etapa inválida.');
    if (!dono && d.status === 'Cancelado') throw new Error('Somente o proprietário pode cancelar um atendimento.');
    const ex = {}, valor = num_(d.valor, 'Valor');
    if (valor !== '') ex.Valor = valor;
    if (d.prazo) ex.Prazo = d.prazo;
    if (d.previsao != null) ex.Previsao = d.previsao;
    if (d.laudo) ex.Laudo = d.laudo;
    if (d.servico) ex.Servico = d.servico;
    if (d.garantiaDias !== '' && d.garantiaDias != null) { const g = parseInt(d.garantiaDias, 10); if (!(g >= 0)) throw new Error('Garantia inválida.'); ex.GarantiaDias = String(g); }
    if (dono && d.tecnicoId !== undefined && d.tecnicoId !== e.TecnicoID) {
      if (d.tecnicoId) {
        const tu = tab_('Usuarios').rows.find(r => r.ID === d.tecnicoId && r.Ativo === 'SIM'); if (!tu) throw new Error('Técnico inválido.');
        Object.assign(ex, { TecnicoID: tu.ID, Tecnico: tu.Nome, ComissaoPct: tu.Comissao });
      } else Object.assign(ex, { TecnicoID: '', Tecnico: '', ComissaoPct: '' });
    } else if (!dono && !e.TecnicoID) Object.assign(ex, { TecnicoID: u.ID, Tecnico: u.Nome, ComissaoPct: u.Comissao }); // funcionário assume o serviço
    if (dono) { // custos e comissão: só o proprietário grava
      if (d.custo !== undefined) ex.CustoMaterial = num_(d.custo, 'Custo do material');
      if (d.maoObra !== undefined) ex.MaoDeObra = num_(d.maoObra, 'Mão de obra');
      if (d.comissaoPct !== undefined && d.comissaoPct !== '') { const c = Number(d.comissaoPct); if (!(c >= 0 && c <= 100)) throw new Error('Percentual de comissão inválido.'); ex.ComissaoPct = String(c); }
    }
    const f = Object.assign({}, e, ex), rec = Number(f.Recebido || 0);
    if (Number(f.MaoDeObra || 0) > Number(f.Valor || 0) + 0.004) throw new Error('A mão de obra não pode ser maior que o valor cobrado.');
    if (ex.Valor !== undefined) {
      if (Number(f.Valor) < rec - 0.004) throw new Error('O valor cobrado não pode ficar abaixo do que já foi recebido (' + brl_(rec.toFixed(2)) + ').');
      ex.SitPag = Number(f.Valor) > 0 ? sitPag_(Number(f.Valor), rec) : '';
    }
    if (d.status === 'Aguardando aprovação do orçamento' && !(Number(f.Valor) > 0)) throw new Error('Informe o valor do orçamento.');
    if (['Pronto para retirada', 'Entregue ao cliente'].indexOf(d.status) >= 0 && !e.Conclusao) { // marca conclusão e garantia uma única vez
      const dias = parseInt(f.GarantiaDias !== '' ? f.GarantiaDias : cfg_().GARANTIA_DIAS, 10) || 0;
      ex.Conclusao = agora_(); ex.GarantiaDias = String(dias);
      ex.GarantiaAte = dias ? Utilities.formatDate(new Date(Date.now() + dias * 864e5), TZ, 'dd/MM/yyyy') : '';
    }
    const w = mudar_(t, e, d.status, d.obs, ex, d.notificar, u.Nome);
    comissao_(e.Protocolo);
    return w;
  });
}
/** Gera/atualiza a comissão da OS. UMA linha por protocolo (sem duplicar); comissão paga fica travada. */
function comissao_(p) {
  const t = tab_('Equipamentos'), e = t.rows.find(r => r.Protocolo === p); if (!e) return;
  const ct = tab_('Comissoes'), row = ct.rows.find(r => r.Protocolo === p);
  if (row && row.Status === 'Paga') return;
  const base = Number(e.MaoDeObra || 0), pct = Number(e.ComissaoPct || 0), valor = (base * pct / 100).toFixed(2);
  const concluido = ['Pronto para retirada', 'Entregue ao cliente'].indexOf(e.Status) >= 0;
  const ok = e.TecnicoID && base > 0 && pct > 0 && concluido && (cfg_().REGRA_COMISSAO !== 'PAGAMENTO' || e.SitPag === 'Pago');
  if (ok) {
    const o = { Protocolo: p, UsuarioID: e.TecnicoID, Tecnico: e.Tecnico, Base: base.toFixed(2), Pct: String(pct), Valor: valor, Status: 'Pendente' };
    if (row) put_(ct, row._row, o); else add_('Comissoes', Object.assign({ ID: pad_('M', ct.rows.length + 1, 5), Gerada: agora_() }, o));
    if (e.ComissaoValor !== valor) put_(t, e._row, { ComissaoValor: valor });
  } else {
    if (row && row.Status === 'Pendente') put_(ct, row._row, { Status: 'Cancelada' });
    if (e.ComissaoValor) put_(t, e._row, { ComissaoValor: '' });
  }
}
function api_pagamento(pin, d) { // registra pagamento parcial ou total (só proprietário)
  const u = auth_(pin, 'PROPRIETARIO');
  return comLock_(() => {
    const t = tab_('Equipamentos'), e = t.rows.find(r => r.Protocolo === d.protocolo); if (!e) throw new Error('Protocolo não encontrado.');
    const total = Number(e.Valor || 0), rec = Number(e.Recebido || 0), v = Number(String(d.valor).replace(',', '.'));
    if (!(total > 0)) throw new Error('Defina o valor cobrado antes de registrar pagamentos.');
    if (!(v > 0)) throw new Error('Informe o valor recebido.');
    if (!d.forma) throw new Error('Escolha a forma de pagamento.');
    if (v > total - rec + 0.004) throw new Error('O valor excede o saldo pendente (' + brl_((total - rec).toFixed(2)) + ').');
    const novo = rec + v, pg = { ID: pad_('P', tab_('Pagamentos').rows.length + 1, 5), Data: agora_(), Protocolo: e.Protocolo, Forma: d.forma, Valor: v.toFixed(2), Obs: d.obs || '', Usuario: u.Nome };
    add_('Pagamentos', pg);
    put_(t, e._row, { Recebido: novo.toFixed(2), SitPag: sitPag_(total, novo), FormaPag: d.forma, Atualizado: agora_() });
    add_('Historico', { Data: agora_(), Protocolo: e.Protocolo, Status: e.Status, Observacao: 'Pagamento de ' + brl_(v.toFixed(2)) + ' (' + d.forma + ')', Usuario: u.Nome, WhatsApp: 'n/a' });
    comissao_(e.Protocolo);
    return { pagamento: pg, saldo: (total - novo).toFixed(2) };
  });
}
function resumo_(rows) { // Resultado = Recebido − Custo do material − Comissão (só OS aprovadas em diante)
  let cob = 0, rec = 0, mat = 0, com = 0, res = 0;
  rows.filter(r => COBRAVEL.indexOf(r.Status) >= 0).forEach(r => {
    const v = Number(r.Valor || 0), rc = Number(r.Recebido || 0), m = Number(r.CustoMaterial || 0), c = Number(r.ComissaoValor || 0);
    cob += v; rec += rc; mat += m; com += c; res += rc - m - c;
  });
  const f = x => x.toFixed(2);
  return { cobrado: f(cob), recebido: f(rec), pendente: f(cob - rec), material: f(mat), comissao: f(com), resultado: f(res) };
}
function api_dashboard(pin, p) {
  const u = auth_(pin), todos = tab_('Equipamentos').rows.filter(r => vis_(r, u)), rows = todos.filter(r => noPeriodo_(r.Entrada, p));
  const n = L => rows.filter(r => L.indexOf(r.Status) >= 0).length, g = L => todos.filter(r => L.indexOf(r.Status) >= 0).length;
  const AV = ['Recebido para orçamento', 'Em análise técnica'];
  const res = { total: rows.length, aval: n(AV), aprov: n(['Aguardando aprovação do orçamento']), andamento: n(['Orçamento aprovado', 'Aguardando peça', 'Em conserto']),
    concluidos: rows.filter(r => r.Conclusao).length, retirada: n(['Pronto para retirada', 'Orçamento recusado', 'Sem conserto']), entregues: n(['Entregue ao cliente']),
    alertas: { aval: g(AV), aprov: g(['Aguardando aprovação do orçamento']), atrasados: todos.filter(atrasado_).length, retirada: g(['Pronto para retirada']) } };
  if (isOwner_(u)) {
    res.fin = resumo_(rows);
    res.alertas.pagPend = todos.filter(r => ['Pronto para retirada', 'Entregue ao cliente'].indexOf(r.Status) >= 0 && Number(r.Valor || 0) > 0 && r.SitPag !== 'Pago').length;
  }
  return res;
}
function api_financeiro(pin, p) {
  auth_(pin, 'PROPRIETARIO');
  const rows = tab_('Equipamentos').rows.filter(r => noPeriodo_(r.Entrada, p) && COBRAVEL.indexOf(r.Status) >= 0);
  return { totais: resumo_(rows), linhas: rows.reverse().map(r => ({ Protocolo: r.Protocolo, Cliente: r.Cliente, Equip: equip_(r), Status: r.Status, Tecnico: r.Tecnico, SitPag: r.SitPag,
    Valor: r.Valor || '0.00', Recebido: r.Recebido || '0.00', CustoMaterial: r.CustoMaterial || '0.00', MaoDeObra: r.MaoDeObra || '0.00', ComissaoValor: r.ComissaoValor || '0.00' })) };
}
function api_comissoes(pin, d) { // funcionário só enxerga as PRÓPRIAS comissões
  const u = auth_(pin), dono = isOwner_(u); d = d || {};
  const rows = tab_('Comissoes').rows.filter(r => r.Status !== 'Cancelada' && (dono || r.UsuarioID === u.ID) && (!d.usuarioId || r.UsuarioID === d.usuarioId) && noPeriodo_(r.Gerada, d));
  const soma = s => rows.filter(r => r.Status === s).reduce((a, r) => a + Number(r.Valor || 0), 0).toFixed(2), por = {};
  rows.forEach(r => { const k = por[r.Tecnico] = por[r.Tecnico] || { nome: r.Tecnico, pendente: 0, paga: 0 }; k[r.Status === 'Paga' ? 'paga' : 'pendente'] += Number(r.Valor || 0); });
  return { rows: rows.reverse(), pendente: soma('Pendente'), paga: soma('Paga'), porTecnico: dono ? Object.keys(por).map(k => por[k]) : [] };
}
function api_pagarComissao(pin, ids) {
  const u = auth_(pin, 'PROPRIETARIO');
  return comLock_(() => {
    const t = tab_('Comissoes'); let n = 0;
    t.rows.forEach(r => { if ((ids || []).indexOf(r.ID) >= 0 && r.Status === 'Pendente') { put_(t, r._row, { Status: 'Paga', Paga: agora_(), PagaPor: u.Nome }); n++; } });
    if (!n) throw new Error('Nenhuma comissão pendente selecionada.');
    return n;
  });
}
function api_usuarios(pin) { auth_(pin, 'PROPRIETARIO'); return usuarios_(); }
function api_salvarUsuario(pin, d) {
  auth_(pin, 'PROPRIETARIO');
  return comLock_(() => {
    const t = tab_('Usuarios'), nome = String(d.nome || '').trim(), pf = d.perfil === 'PROPRIETARIO' ? 'PROPRIETARIO' : 'FUNCIONARIO';
    const com = Number(d.comissao || 0), ativo = d.ativo === 'NAO' ? 'NAO' : 'SIM', ex = d.id ? t.rows.find(r => r.ID === d.id) : null;
    if (!nome) throw new Error('Informe o nome.');
    if (!(com >= 0 && com <= 100)) throw new Error('A comissão deve estar entre 0 e 100%.');
    if (d.id && !ex) throw new Error('Funcionário não encontrado.');
    const o = { Nome: nome, Perfil: pf, Comissao: String(com), Ativo: ativo };
    if (d.pin) {
      if (!/^\d{4,8}$/.test(String(d.pin))) throw new Error('O PIN deve ter de 4 a 8 números.');
      const h = hash_(String(d.pin)); if (t.rows.some(r => r.PINHash === h && r.ID !== d.id)) throw new Error('Este PIN já está em uso. Escolha outro.');
      o.PINHash = h;
    } else if (!ex) throw new Error('Defina um PIN para o novo acesso.');
    const donos = t.rows.filter(r => r.Perfil === 'PROPRIETARIO' && r.Ativo === 'SIM' && (!ex || r.ID !== ex.ID)).length + (pf === 'PROPRIETARIO' && ativo === 'SIM' ? 1 : 0);
    if (!donos) throw new Error('Deve existir ao menos um proprietário ativo.');
    if (ex) put_(t, ex._row, o); else add_('Usuarios', Object.assign({ ID: pad_('U', t.rows.length + 1, 3), Criado: agora_() }, o));
    return usuarios_();
  });
}
function api_salvarConfig(pin, o) {
  auth_(pin, 'PROPRIETARIO');
  if (o.LOGO_DATA === '__REMOVER__') o.LOGO_DATA = '';
  if (o.LOGO_DATA && !/^data:image\/(png|jpeg);base64,/.test(o.LOGO_DATA)) throw new Error('Logo inválido (use PNG ou JPG).');
  if (String(o.LOGO_DATA || '').length > 45000) throw new Error('Logo grande demais.');
  const t = tab_('Config');
  Object.keys(CFG0).forEach(k => {
    if (!(k in o)) return;
    const r = t.rows.find(x => x.Chave === k);
    if (r) t.sh.getRange(r._row, 2).setValue(o[k]); else t.sh.appendRow([k, o[k]]);
  });
  _cfg = null; return api_login(pin);
}
function api_backup(pin) { auth_(pin, 'PROPRIETARIO'); return { url: backup_('manual') }; }

/* ---------- API pública (cliente consulta pelo protocolo) ---------- */
function pub_consultar(p) {
  p = String(p || '').trim().toUpperCase();
  const e = tab_('Equipamentos').rows.find(r => r.Protocolo === p);
  if (!e) throw new Error('Protocolo não encontrado. Confira o número no comprovante.');
  const c = cfg_();
  return {
    protocolo: p, status: e.Status, equip: equip_(e), entrada: e.Entrada, valor: e.Valor ? brl_(e.Valor) : '', prazo: e.Prazo, empresa: c.EMPRESA,
    logo: c.LOGO_DATA, sitPag: e.Valor ? e.SitPag : '', formas: e.Valor ? c.FORMAS_PAG : '', pix: e.Valor ? c.PIX : '', garantiaAte: e.GarantiaAte,
    telEmpresa: c.TELEFONE_EMPRESA, podeResponder: e.Status === 'Aguardando aprovação do orçamento',
    hist: tab_('Historico').rows.filter(r => r.Protocolo === p).map(r => ({ data: r.Data, status: r.Status, obs: r.Observacao })).reverse()
  };
}
function pub_responder(p, aprovar) {
  const t = tab_('Equipamentos'), e = t.rows.find(r => r.Protocolo === String(p).toUpperCase());
  if (!e || e.Status !== 'Aguardando aprovação do orçamento') throw new Error('Este orçamento não está aguardando resposta.');
  mudar_(t, e, aprovar ? 'Orçamento aprovado' : 'Orçamento recusado', 'Respondido pelo cliente no link de acompanhamento', {}, true, 'Cliente');
  return pub_consultar(e.Protocolo);
}
