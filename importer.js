/* ==========================================================
   轻记账 · 通用账单导入（CSV / Excel）
   字段映射 + 类别映射，不写死任何单一格式
   xlsx：原生 DecompressionStream 解 ZIP，无依赖；失败回落 CDN
   ========================================================== */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const L = () => window.Ledger;           // 主应用 API（延迟取，脚本顺序无关）
  const pad = n => (n < 10 ? '0' : '') + n;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ==========================================================
     一、字段定义与预设
     ========================================================== */
  const FIELDS = [
    { key: 'date',     label: '日期',     req: true },
    { key: 'amount',   label: '金额',     req: true },
    { key: 'type',     label: '收入 / 支出', req: false },
    { key: 'category', label: '类别',     req: false },
    { key: 'note',     label: '备注',     req: false },
    { key: 'order',    label: '交易单号', req: false },
    { key: 'time',     label: '时间',     req: false },
    { key: '',         label: '不使用',   req: false }
  ];

  // 自动映射用的关键词（按顺序优先匹配，越靠前权重越高）
  const KW = [
    ['date',     ['日期', '交易时间', '消费日期', '交易日期', '记账日期', '创建时间', '付款时间', '时间', 'date', 'time']],
    ['amount',   ['金额', '价格', '数额', '消费金额', '交易金额', 'amount', 'money']],
    ['type',     ['收/支', '收支', '收入/支出', '收支类型', '方向', 'type', '类型']],
    ['category', ['类别', '类目', '分类', '消费类型', 'category']],
    ['note',     ['备注', '说明', '摘要', '描述', '商品名称', '商品', '商家', '交易对方', '对方', '名称', '项目', 'note', 'remark']],
    ['order',    ['交易单号', '订单号', '商户单号', '交易号', '流水号', '订单编号', '单号', 'order']],
    ['time',     ['具体时间']]
  ];

  // 常见 App 预设：keys 用于识别来源，map 用于强制指定列
  const PRESETS = [
    {
      name: '微信支付账单', keys: ['微信', '交易时间', '收/支', '当前状态', '交易单号'],
      map: { date: ['交易时间'], type: ['收/支'], amount: ['金额（元）', '金额(元)', '金额'],
             note: ['交易对方', '商品'], category: ['交易类型'], order: ['交易单号', '商户单号'] }
    },
    {
      name: '支付宝账单', keys: ['支付宝', '交易号', '商家订单号', '收/支', '交易创建时间'],
      map: { date: ['交易创建时间', '付款时间', '交易时间'], type: ['收/支'],
             amount: ['金额（元）', '金额(元)', '金额'], note: ['商品名称', '交易对方', '商品'],
             order: ['交易号', '商家订单号'] }
    },
    {
      name: '随手记', keys: ['随手记', '子分类', '账户', '成员', '商家', '项目'],
      map: { date: ['日期'], type: ['类型'], amount: ['金额'], category: ['分类', '子分类'],
             note: ['备注', '商家', '项目'] }
    },
    {
      name: '鲨鱼记账', keys: ['鲨鱼', '收支类型'],
      map: { date: ['日期'], type: ['收支类型', '类型'], amount: ['金额'],
             category: ['分类', '类别'], note: ['备注'] }
    },
    {
      name: '钱迹', keys: ['钱迹'],
      map: { date: ['时间', '日期'], amount: ['金额'], category: ['分类'],
             note: ['备注'], type: ['类型'] }
    },
    {
      name: 'iCost', keys: ['icost'],
      map: { date: ['日期'], type: ['类型', '收支'], amount: ['金额'],
             category: ['分类', '类别'], note: ['备注'] }
    },
    {
      name: '标准导入模板', keys: ['日期', '类别', '备注', '金额', '收支'],
      map: { date: ['日期'], category: ['类别', '分类'], note: ['备注'], amount: ['金额'], type: ['收支'] }
    }
  ];

  const TEMPLATE =
    '日期,类别,备注,金额,收支\n' +
    '2026-10-01,午餐,食堂二楼麻辣烫,18.50,支出\n' +
    '2026-10-02,公交地铁,上班通勤,6.00,支出\n' +
    '2026-10-05,工资,10月工资,8000.00,收入\n';

  /* ==========================================================
     二、文件解析：编码 / CSV / XLSX
     ========================================================== */
  function decodeBuf(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8);
    // UTF-8 严格解码：失败或出现替换字符 → 判定为 GBK / Big5
    let utf8 = null;
    try { utf8 = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { utf8 = null; }
    if (utf8 !== null && utf8.indexOf('\uFFFD') < 0) return utf8;
    const cands = ['gb18030', 'gbk', 'big5'];
    for (let i = 0; i < cands.length; i++) {
      try { return new TextDecoder(cands[i]).decode(u8); } catch (e) {}
    }
    return utf8 != null ? utf8 : new TextDecoder('utf-8').decode(u8);
  }

  function detectDelim(text) {
    const line = (text.split(/\r?\n/)[0] || '');
    const cands = [',', '\t', ';', '|'];
    let best = ',', bestN = -1;
    cands.forEach(d => {
      const n = line.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }

  function parseDelimited(text) {
    const d = detectDelim(text);
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === d) { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  function unescapeXml(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, '&');
  }

  function inflateRaw(u8) {
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('NO_DS'));
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).text();
  }

  function readZipEntries(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    const min = Math.max(0, u8.length - 65558);
    for (let i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx 文件');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const entries = {};
    for (let i = 0; i < count; i++) {
      if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true);
      const elen = dv.getUint16(off + 30, true);
      const clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder('utf-8').decode(u8.subarray(off + 46, off + 46 + nlen));
      entries[name] = { method: method, csize: csize, lho: lho };
      off += 46 + nlen + elen + clen;
    }
    return { u8: u8, dv: dv, entries: entries };
  }

  function parseSharedStrings(xml) {
    const out = [];
    const re = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
    let m;
    while ((m = re.exec(xml))) {
      out.push(unescapeXml(m[1].replace(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g, '$1').replace(/<[^>]+>/g, '')));
    }
    return out;
  }

  function colIndex(ref) {
    const s = String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    let n = 0;
    for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function parseSheet(xml, shared) {
    const rows = [];
    const rowRe = /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>|<(?:\w+:)?row\b([^>]*)\/>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const body = rm[2] || '';
      const cells = [];
      const cellRe = /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>|<(?:\w+:)?c\b([^>]*)\/>/g;
      let cm;
      while ((cm = cellRe.exec(body))) {
        const attr = cm[1] || cm[3] || '';
        const inner = cm[2] || '';
        const rM = attr.match(/r\s*=\s*"([A-Za-z]+\d+)"/);
        const tM = attr.match(/t\s*=\s*"([^"]+)"/);
        const idx = rM ? colIndex(rM[1]) : cells.length;
        let val = '';
        const t = tM ? tM[1] : '';
        if (t === 'inlineStr') {
          const t2 = inner.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/);
          val = t2 ? unescapeXml(t2[1]) : '';
        } else {
          const vM = inner.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
          val = vM ? unescapeXml(vM[1]) : '';
          if (t === 's') { const i = parseInt(val, 10); val = isNaN(i) ? '' : (shared[i] || ''); }
          else if (t !== 'str' && val !== '' && !isNaN(Number(val))) val = Number(val);
        }
        cells[idx] = val;
      }
      for (let i = 0; i < cells.length; i++) if (typeof cells[i] === 'undefined') cells[i] = '';
      rows.push(cells);
    }
    return rows;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('load-failed'));
      document.head.appendChild(s);
    });
  }

  async function readXlsx(buf) {
    try {
      const z = readZipEntries(buf);
      const names = Object.keys(z.entries);
      async function read(name) {
        const e = z.entries[name];
        if (!e) return null;
        const nlen = z.dv.getUint16(e.lho + 26, true);
        const elen = z.dv.getUint16(e.lho + 28, true);
        const start = e.lho + 30 + nlen + elen;
        const data = z.u8.subarray(start, start + e.csize);
        if (e.method === 0) return new TextDecoder('utf-8').decode(data);
        if (e.method === 8) return await inflateRaw(data);
        throw new Error('不支持的压缩方式');
      }
      const sheetName = names.filter(n => /^xl\/worksheets\/sheet1\.xml$/.test(n))[0] ||
                        names.filter(n => /^xl\/worksheets\/.*\.xml$/.test(n))[0];
      if (!sheetName) throw new Error('未找到工作表');
      let shared = [];
      const ssName = names.filter(n => /sharedStrings\.xml$/.test(n))[0];
      if (ssName) { const xml = await read(ssName); if (xml) shared = parseSharedStrings(xml); }
      const xml = await read(sheetName);
      return parseSheet(xml, shared);
    } catch (e) {
      if (e && e.message === 'NO_DS') {
        // 老浏览器没有 DecompressionStream：改用 CDN 版 SheetJS
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        const wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      }
      throw e;
    }
  }

  /* Excel 序列号 → 日期字符串 */
  function excelSerialToDate(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 15000 || n > 80000) return '';
    const ms = Date.UTC(1899, 11, 30) + Math.floor(n * 86400000);
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /* 表头疑似日期时，把该列的数字单元格先转成日期字符串 */
  function convertSerialDateColumns(headers, rows) {
    const dateCols = [];
    headers.forEach((h, i) => { if (/日期|时间/.test(String(h || ''))) dateCols.push(i); });
    if (!dateCols.length) return rows;
    return rows.map(r => r.map((v, i) => {
      if (dateCols.indexOf(i) >= 0 && typeof v === 'number') {
        const d = excelSerialToDate(v);
        if (d) return d;
      }
      return v;
    }));
  }

  /* ==========================================================
     三、值归一化
     ========================================================== */
  function normDate(v) {
    if (v == null) return '';
    if (typeof v === 'number') { const d = excelSerialToDate(v); if (d) return d; v = String(v); }
    let s = String(v).trim();
    if (!s) return '';
    s = s.replace(/[年月]/g, '-').replace(/日/g, ' ').replace(/\//g, '-').replace(/\./g, '-');
    let m = s.match(/(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    m = s.match(/(\d{4})(\d{2})(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (m) return new Date().getFullYear() + '-' + pad(+m[1]) + '-' + pad(+m[2]);
    return '';
  }

  function normTime(v, dateRaw) {
    let s = '';
    if (typeof v === 'number') {
      const secs = Math.round((v % 1) * 86400);
      return pad(Math.floor(secs / 3600) % 24) + ':' + pad(Math.floor(secs / 60) % 60);
    }
    s = String(v == null ? '' : v).trim();
    let m = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (m) return pad(+m[1]) + ':' + m[2];
    // 时间列为空时，尝试从日期列里取（如 2026-10-01 12:30）
    s = String(dateRaw == null ? '' : dateRaw);
    m = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (m) return pad(+m[1]) + ':' + m[2];
    return '';
  }

  /* 金额：兼容 ¥、逗号、负号、括号、中文负号 */
  function normAmount(v) {
    if (v == null || String(v).trim() === '') return { value: null, negative: false };
    if (typeof v === 'number') return { value: Math.abs(v), negative: v < 0 };
    let s = String(v).trim();
    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    if (/^[-−－]/.test(s)) { negative = true; }
    s = s.replace(/[¥￥$€,，\s'"']/g, '');
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return { value: null, negative: false };
    return { value: Math.abs(n), negative: negative || n < 0 };
  }

  /* 收支：返回 expense / income / null（null 表示"不计收支"或识别不出） */
  function normType(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/不计|不计收支|不计入|transfer|转账|中性/.test(s)) return null;
    if (/收入|收款|入账|转入|income|退款|报销/.test(s)) return 'income';
    if (/支出|付款|出账|转出|expense|消费/.test(s)) return 'expense';
    if (/^[+＋]$/.test(s)) return 'income';
    if (/^[-−－]$/.test(s)) return 'expense';
    return null;
  }

  /* ==========================================================
     四、表头自动映射 + 预设识别
     ========================================================== */
  function normHead(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/\s/g, '').replace(/[()（）]/g, '');
  }

  function autoMapHeaders(headers) {
    const map = {}, used = {};
    headers.forEach((h, i) => {
      const s = normHead(h);
      if (!s) return;
      let best = null, bestScore = 0;
      KW.forEach(pair => {
        const key = pair[0];
        if (used[key]) return;
        pair[1].forEach(k => {
          const kk = normHead(k);
          if (!kk) return;
          let score = 0;
          if (s === kk) score = 200;
          else if (s.indexOf(kk) >= 0) score = 100 + kk.length;
          else if (kk.indexOf(s) >= 0 && s.length >= 2) score = 60 + s.length;
          if (score > bestScore) { bestScore = score; best = key; }
        });
      });
      if (best && bestScore > 0) { map[i] = best; used[best] = 1; }
    });
    return map;
  }

  function detectPreset(headers) {
    const hs = headers.map(normHead).filter(Boolean);
    let best = null, bestScore = 0;
    PRESETS.forEach(p => {
      let score = 0;
      p.keys.forEach(k => {
        const kk = normHead(k);
        if (hs.indexOf(kk) >= 0) score += (/微信|支付宝|随手记|鲨鱼|钱迹|icost/.test(kk) ? 3 : 1);
      });
      if (score > bestScore) { bestScore = score; best = p; }
    });
    return bestScore >= 3 ? { preset: best, score: bestScore } : null;
  }

  function applyPreset(headers, preset) {
    const map = {}, used = {};
    ['date', 'amount', 'type', 'category', 'note', 'order'].forEach(f => {
      const cands = preset.map[f] || [];
      for (let i = 0; i < cands.length; i++) {
        const idx = headers.findIndex((h, j) => !used[j] && normHead(h) === normHead(cands[i]));
        if (idx >= 0) { map[idx] = f; used[idx] = 1; used[f] = 1; return; }
      }
    });
    // 预设没覆盖到的列，继续自动识别（只补未用过的字段）
    const rest = [];
    headers.forEach((h, i) => { if (!used[i]) rest.push({ i: i, h: h }); });
    const auto = autoMapHeaders(rest.map(x => x.h));
    rest.forEach((x, k) => {
      const f = auto[k];
      if (f && !used[f]) { map[x.i] = f; used[f] = 1; }
    });
    return map;
  }

  /* ==========================================================
     五、类别关键词映射
     ========================================================== */
  const CAT_RULES = [
    ['expense', '早餐', ['早餐', '早点', '早饭', '包子', '馒头', '豆浆', '油条', '煎饼', '肠粉']],
    ['expense', '午餐', ['午餐', '午饭', '中餐', '中饭', '工作餐', '食堂', '盒饭', '盖饭', '快餐', '便当']],
    ['expense', '晚餐', ['晚餐', '晚饭', '正餐', '晚宴']],
    ['expense', '夜宵', ['夜宵', '宵夜', '烧烤', '烤串', '串串']],
    ['expense', '零食', ['零食', '小吃', '薯片', '饼干', '甜品', '蛋糕', '冰淇淋', '雪糕']],
    ['expense', '水果', ['水果', '苹果', '香蕉', '西瓜', '橙子', '葡萄', '草莓']],
    ['expense', '饮料奶茶', ['饮料', '奶茶', '咖啡', '可乐', '矿泉水', '茶饮', '果汁', '星巴克', '瑞幸', '喜茶', '蜜雪']],
    ['expense', '日用品', ['日用品', '日用', '家居', '百货', '纸巾', '洗衣', '清洁', '收纳']],
    ['expense', '洗漱', ['洗漱', '沐浴', '洗发', '牙膏', '牙刷', '护肤', '化妆品', '美妆', '洗护']],
    ['expense', '衣物鞋包', ['衣物', '衣服', '服装', '鞋', '裤', '外套', '羽绒服', '箱包', '穿搭']],
    ['expense', '理发', ['理发', '剪发', '美发', '洗头', '造型', '沙龙']],
    ['expense', '公交地铁', ['地铁', '公交', '轨道交通', '轻轨', '城轨', '乘车', '深圳通', '羊城通', '交通卡']],
    ['expense', '打车', ['打车', '滴滴', '出租', '网约车', '花小猪', '曹操出行']],
    ['expense', '共享单车', ['单车', '共享', '哈啰', '青桔', '摩拜', '骑行']],
    ['expense', '加油充电', ['加油', '充电', '充电桩', '油费', '石化', '石油', '加油站']],
    ['expense', '电商', ['电商', '网购', '淘宝', '天猫', '京东', '拼多多', '唯品会', '抖音商城']],
    ['expense', '超市', ['超市', '便利店', '沃尔玛', '盒马', '永辉', '山姆', '罗森', '全家', '菜市场', '生鲜']],
    ['expense', '数码', ['数码', '手机', '电脑', '电子', '配件', '耳机', '键盘', '相机', '平板']],
    ['expense', '礼物', ['礼物', '礼品', '生日', '伴手礼', '鲜花']],
    ['expense', '游戏', ['游戏', '点券', '皮肤', 'steam', '手游', '充值']],
    ['expense', '电影', ['电影', '影院', '影票', '演出', '话剧', '演唱会', '票务']],
    ['expense', '运动健身', ['健身', '运动', '游泳', '瑜伽', '健身房', '篮球', '羽毛球', '马拉松']],
    ['expense', '旅游', ['旅游', '旅行', '机票', '酒店', '住宿', '民宿', '火车票', '高铁', '景区', '门票', '度假']],
    ['expense', '书籍', ['书籍', '图书', '书店', '电子书', '当当']],
    ['expense', '文具', ['文具', '办公', '打印', '笔记本', '耗材']],
    ['expense', '课程培训', ['课程', '培训', '学费', '教育', '网课', '考试', '报名', '学习']],
    ['expense', '药品', ['药品', '医药', '感冒', '药房', '保健品', '买药']],
    ['expense', '看病', ['看病', '医院', '门诊', '挂号', '体检', '牙医', '诊所', '医疗']],
    ['expense', '房租', ['房租', '租金', '租房']],
    ['expense', '水电燃气', ['水电', '水费', '电费', '燃气', '煤气', '取暖', '供暖']],
    ['expense', '物业', ['物业', '管理费']],
    ['expense', '网络', ['网络', '宽带', '网费', '光纤']],
    ['expense', '话费', ['话费', '套餐', '手机费', '充值中心']],
    ['expense', '流量', ['流量', '数据流量', '上网流量']],
    ['expense', '红包', ['红包', '压岁钱', '礼金', '随礼', '份子钱']],
    ['expense', '请客', ['请客', '聚餐', '宴请', '饭局', '招待']],
    ['income', '工资', ['工资', '薪水', '月薪', '薪资', '发薪']],
    ['income', '兼职', ['兼职', '外快', '副业', '稿费', '劳务费']],
    ['income', '奖学金', ['奖学金', '助学金', '补助']],
    ['income', '红包', ['红包', '压岁钱', '转账']],
    ['income', '理财', ['理财', '利息', '基金', '收益', '股息', '分红', '余额宝']]
  ];

  function matchCategory(name, type) {
    const s = String(name == null ? '' : name).trim().toLowerCase().replace(/\s/g, '');
    if (!s) return '';
    let best = '', bestLen = 0;
    CAT_RULES.forEach(r => {
      if (type && r[0] !== type) return;
      r[2].forEach(k => {
        if (s.indexOf(k) >= 0 && k.length > bestLen) { bestLen = k.length; best = r[1]; }
      });
    });
    return best;
  }

  /* 返回 {type, cat}，用于生成「收支|类别」形式的映射值 */
  function matchCategoryFull(name) {
    const s = String(name == null ? '' : name).trim().toLowerCase().replace(/\s/g, '');
    if (!s) return null;
    let best = null, bestLen = 0;
    CAT_RULES.forEach(r => {
      r[2].forEach(k => {
        if (s.indexOf(k) >= 0 && k.length > bestLen) { bestLen = k.length; best = { type: r[0], cat: r[1] }; }
      });
    });
    return best;
  }

  function catNameOf(v) {
    if (!v) return '';
    const i = String(v).indexOf('|');
    return i >= 0 ? String(v).slice(i + 1) : String(v);
  }

  /* ==========================================================
     六、构建记录 / 去重
     ========================================================== */
  function buildRecords(rows, cols, opts) {
    opts = opts || {};
    const catMap = opts.catMap || {};
    const defaultType = opts.defaultType || 'expense';
    const recs = [];
    rows.forEach(r => {
      const get = f => (cols[f] == null || cols[f] < 0 ? '' : r[cols[f]]);
      const dateRaw = get('date');
      const date = normDate(dateRaw);
      const amt = normAmount(get('amount'));
      const rec = {
        rid: 'r' + recs.length + '_' + Math.random().toString(36).slice(2, 7),
        bad: false, dup: false, checked: true,
        date: date, time: '', type: defaultType, amount: 0,
        srcCat: String(get('category') == null ? '' : get('category')).trim(),
        cat: '', note: String(get('note') == null ? '' : get('note')).trim(),
        order: String(get('order') == null ? '' : get('order')).trim()
      };
      if (!date || amt.value === null || !isFinite(amt.value) || amt.value === 0) { rec.bad = true; }
      rec.amount = Math.round((amt.value || 0) * 100) / 100;
      const t = normType(get('type'));
      if (t) rec.type = t;
      else if (amt.negative) rec.type = 'expense';
      else rec.type = defaultType;
      rec.time = normTime(get('time'), dateRaw) || '00:00';
      rec.cat = catNameOf(catMap[rec.srcCat]) || matchCategory(rec.srcCat, rec.type) || '其他';
      recs.push(rec);
    });
    return recs;
  }

  function markDupes(recs, existing) {
    const oSet = {}, tSet = {};
    (existing || []).forEach(i => {
      if (i.order) oSet[String(i.order)] = 1;
      tSet[[i.date, Number(i.amount || 0).toFixed(2), i.category || '', i.note || ''].join('|')] = 1;
    });
    const seen = {};
    recs.forEach(r => {
      const k4 = [r.date, Number(r.amount || 0).toFixed(2), r.cat || '', r.note || ''].join('|');
      const key = r.order ? 'o:' + r.order : 't:' + k4;
      let dup = false;
      if (r.order && oSet[r.order]) dup = true;
      else if (tSet[k4]) dup = true;
      if (seen[key]) dup = true;
      seen[key] = 1;
      r.dup = dup;
      if (dup) r.checked = false;
    });
    return recs;
  }

  /* ==========================================================
     七、向导状态与 UI
     ========================================================== */
  const STEP_TITLES = ['上传文件', '字段映射', '类别映射', '导入预览', '完成导入'];

  const S = {
    step: 1, fileName: '', source: '',
    headers: [], rows: [], map: {}, presetName: '',
    catMap: {}, srcCats: [], recs: [], importedIds: [],
    defaultType: 'expense', editIdx: -1, loaded: false
  };

  function openWizard() {
    const w = $('#impWizard');
    if (!w) return;
    resetState();
    showWizard();
    goStep(1);
  }
  function showWizard() {
    const w = $('#impWizard');
    if (!w) return;
    w.hidden = false;
    document.body.classList.add('sheet-open');
  }
  function closeWizard() {
    $('#impWizard').hidden = true;
    document.body.classList.remove('sheet-open');
  }
  function resetState() {
    S.step = 1; S.fileName = ''; S.source = ''; S.headers = []; S.rows = [];
    S.map = {}; S.presetName = ''; S.catMap = {}; S.srcCats = []; S.recs = [];
    S.importedIds = []; S.defaultType = 'expense'; S.editIdx = -1;
    const f = $('#impFile'); if (f) f.value = '';
  }

  function goStep(n) {
    S.step = Math.min(5, Math.max(1, n));
    renderSteps();
    renderBody();
    $('#impPrev').disabled = S.step === 1;
    $('#impPrev').style.visibility = S.step === 1 ? 'hidden' : 'visible';
    const next = $('#impNext');
    if (S.step === 4) { next.textContent = '确认导入'; next.className = 'btn primary'; }
    else if (S.step === 5) { next.textContent = '完成'; next.className = 'btn ghost'; }
    else { next.textContent = '下一步'; next.className = 'btn primary'; }
    next.disabled = false;
    $('#impBody').scrollTop = 0;
  }

  function renderSteps() {
    const cur = S.step;
    $('#impSteps').innerHTML = STEP_TITLES.map((t, i) => {
      const n = i + 1;
      const cls = n === cur ? 'on' : (n < cur ? 'done' : '');
      return '<div class="step-chip ' + cls + '"><b>' + (n < cur ? '✓' : n) + '</b><span>' + t + '</span></div>';
    }).join('<i class="step-line"></i>');
  }

  /* ---------- 步骤一：上传 + 预览 ---------- */
  function renderStep1() {
    const has = S.rows.length > 0;
    let html = '';
    html += '<div class="card"><div class="imp-drop" id="impDrop">' +
      '<div class="imp-drop-ico">📄</div>' +
      '<div class="imp-drop-t">选择账单文件</div>' +
      '<div class="imp-drop-s">支持 CSV（GBK / UTF-8 自动识别）和 Excel .xlsx</div>' +
      '</div></div>';
    html += '<div class="imp-tpl">' +
      '<span>原 App 不能导出？</span>' +
      '<button class="btn ghost small" id="btnTpl">下载标准模板</button>' +
      '</div>';
    if (has) {
      html += '<div class="imp-ok">✓ 已解析 <b>' + esc(S.fileName) + '</b>：' +
        S.rows.length + ' 行数据' + (S.presetName ? '，已识别为 <b>' + esc(S.presetName) + '</b>' : '') + '</div>';
      html += '<div class="field-label">前 ' + Math.min(5, S.rows.length) + ' 行预览（左右滑动看更多列）</div>';
      html += '<div class="card imp-scroll">' + tableHTML(S.headers, S.rows.slice(0, 5)) + '</div>';
      html += '<div class="imp-hint">确认列和数值都没问题后，点「下一步」继续。</div>';
    }
    return html;
  }

  function tableHTML(headers, rows) {
    const w = Math.max(headers.length, 1);
    return '<table class="imp-table"><thead><tr>' +
      headers.map((h, i) => '<th>' + (i + 1) + '. ' + esc(h || '(空)') + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + Array.apply(null, Array(w)).map((_, i) =>
        '<td>' + esc(r[i] == null ? '' : r[i]) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';
  }

  /* ---------- 步骤二：字段映射 ---------- */
  function renderStep2() {
    const opts = FIELDS.map(f =>
      '<option value="' + f.key + '">' + f.label + (f.req ? '（必填）' : '') + '</option>').join('');
    let html = '';
    if (S.presetName) {
      html += '<div class="imp-ok">✓ 已按 <b>' + esc(S.presetName) + '</b> 自动填好映射，确认无误即可继续</div>';
    } else {
      html += '<div class="imp-hint">未识别出来源 App，已按表头关键词自动匹配，请核对下面的对应关系。</div>';
    }
    html += '<div class="field-label">每一列对应什么</div><div class="card">';
    S.headers.forEach((h, i) => {
      const sample = (S.rows[0] && S.rows[0][i] != null) ? String(S.rows[0][i]) : '';
      html += '<div class="map-row">' +
        '<div class="map-info"><div class="map-h">' + esc(h || '第 ' + (i + 1) + ' 列') + '</div>' +
        '<div class="map-s">示例：' + esc(sample.slice(0, 18) || '—') + '</div></div>' +
        '<select class="map-sel" data-col="' + i + '">' +
        opts.replace('value="' + (S.map[i] || '') + '"', 'value="' + (S.map[i] || '') + '" selected') +
        '</select></div>';
    });
    html += '</div>';
    const hasType = Object.keys(S.map).some(k => S.map[k] === 'type');
    if (!hasType) {
      html += '<div class="field-label">没有收支列时的处理</div><div class="card">' +
        '<div class="map-row"><div class="map-info"><div class="map-h">默认记为</div>' +
        '<div class="map-s">金额带负号仍自动判为支出</div></div>' +
        '<select class="map-sel" id="impDefaultType">' +
        '<option value="expense"' + (S.defaultType === 'expense' ? ' selected' : '') + '>支出</option>' +
        '<option value="income"' + (S.defaultType === 'income' ? ' selected' : '') + '>收入</option>' +
        '</select></div></div>';
    }
    const miss = missingRequired();
    if (miss.length) html += '<div class="imp-warn">还需要指定：' + miss.join('、') + '</div>';
    return html;
  }

  function missingRequired() {
    const miss = [];
    const used = Object.keys(S.map).map(k => S.map[k]);
    if (used.indexOf('date') < 0) miss.push('日期');
    if (used.indexOf('amount') < 0) miss.push('金额');
    return miss;
  }

  /* ---------- 步骤三：类别映射 ---------- */
  function renderStep3() {
    let html = '<div class="imp-hint">已按关键词自动匹配，可逐行修改；点「应用到全部」可批量设置。</div>';
    html += '<div class="card imp-bulk">' +
      '<select class="map-sel" id="impBulkSel">' + catOptions(false) + '</select>' +
      '<button class="btn ghost small" id="btnBulkApply">应用到全部</button></div>';
    html += '<div class="card">';
    S.srcCats.forEach(c => {
      const cur = S.catMap[c] || '';
      const cnt = S.recs.filter(r => r.srcCat === c).length;
      html += '<div class="map-row">' +
        '<div class="map-info"><div class="map-h">' + esc(c) + '</div>' +
        '<div class="map-s">' + cnt + ' 笔</div></div>' +
        '<select class="map-sel cat-sel" data-src="' + esc(c) + '">' +
        catOptions(true).replace('value="' + cur + '"', 'value="' + cur + '" selected') +
        '</select></div>';
    });
    html += '</div>';
    return html;
  }

  function catOptions(withEmpty) {
    const C = L().CATEGORIES;
    let html = withEmpty ? '<option value="">— 不映射 —</option>' : '';
    ['expense', 'income'].forEach(t => {
      html += '<optgroup label="' + (t === 'expense' ? '支出' : '收入') + '">';
      C[t].forEach(g => {
        g.items.forEach(it => {
          html += '<option value="' + t + '|' + it.n + '">' + it.e + ' ' + it.n + '</option>';
        });
      });
      html += '</optgroup>';
    });
    return html;
  }

  /* ---------- 步骤四：导入预览 ---------- */
  function renderStep4() {
    const total = S.recs.length;
    const ok = S.recs.filter(r => !r.bad && !r.dup && r.checked);
    const exp = ok.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const inc = ok.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const dupN = S.recs.filter(r => r.dup).length;
    const badN = S.recs.filter(r => r.bad).length;

    let html = '<div class="card imp-sum">' +
      '<div class="imp-sum-line">共 <b>' + total + '</b> 条' +
      (badN ? '，<span class="imp-bad">' + badN + ' 条无法解析</span>' : '') +
      (dupN ? '，<span class="imp-bad">' + dupN + ' 条已存在</span>' : '') + '</div>' +
      '<div class="imp-sum-grid">' +
      '<div><span>支出合计</span><b class="out">' + money(exp) + '</b></div>' +
      '<div><span>收入合计</span><b class="in">' + money(inc) + '</b></div>' +
      '</div></div>';
    html += '<div class="imp-row-tools">' +
      '<label class="imp-check"><input type="checkbox" id="impAll" checked><span>全选</span></label>' +
      (dupN ? '<label class="imp-check"><input type="checkbox" id="impWithDup"><span>包含已存在的 ' + dupN + ' 条</span></label>' : '') +
      '</div>';

    html += '<div class="card imp-scroll"><table class="imp-table prev"><thead><tr>' +
      '<th class="c-chk"></th><th>日期</th><th>类别</th><th>备注</th><th>金额</th><th>收支</th><th class="c-del"></th>' +
      '</tr></thead><tbody>';
    S.recs.forEach((r, i) => {
      const meta = L().findCat(r.type, r.cat);
      const cls = r.bad ? 'is-bad' : (r.dup ? 'is-dup' : '');
      html += '<tr class="prev-row ' + cls + '" data-i="' + i + '">' +
        '<td class="c-chk"><input type="checkbox" class="p-chk" data-i="' + i + '"' +
          (r.checked && !r.bad ? ' checked' : '') + (r.bad ? ' disabled' : '') + '></td>' +
        '<td>' + esc(r.date || '—') + '</td>' +
        '<td>' + (meta.emoji || '') + ' ' + esc(r.cat) + '</td>' +
        '<td class="c-note">' + esc(r.note || '') + (r.bad ? '<span class="imp-bad">无法解析</span>' : (r.dup ? '<span class="imp-bad">已存在</span>' : '')) + '</td>' +
        '<td class="' + (r.type === 'expense' ? 'out' : 'in') + '">' + (r.type === 'expense' ? '-' : '+') + money(r.amount) + '</td>' +
        '<td>' + (r.type === 'expense' ? '支出' : '收入') + '</td>' +
        '<td class="c-del"><button class="p-del" data-i="' + i + '" aria-label="删除">✕</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="imp-hint">点任意一行可编辑，✕ 删除该条。</div>';
    return html;
  }

  function money(n) {
    const v = Math.abs(Number(n) || 0);
    return '¥' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ---------- 步骤五：结果 ---------- */
  function renderStep5(result) {
    if (!result) return '<div class="imp-hint">等待导入…</div>';
    let html = '<div class="card imp-result">' +
      '<div class="imp-result-ico">' + (result.n > 0 ? '🎉' : '🤔') + '</div>' +
      '<div class="imp-result-t">' + (result.n > 0 ? '导入完成' : '没有导入任何记录') + '</div>' +
      '<div class="imp-result-s">成功 <b class="in">' + result.n + '</b> 条，跳过 <b>' + result.skip + '</b> 条' +
      (result.skip ? '（已勾选但重复 / 未勾选 / 无法解析）' : '') + '</div></div>';
    if (result.n > 0) {
      html += '<div class="card">' +
        '<button class="row-btn" id="btnUndoImport"><span class="row-ico">↩️</span>撤销本次导入<em>' + result.n + ' 条</em></button>' +
        '</div>';
    }
    html += '<div class="imp-hint">导入前已自动把原有数据备份为 JSON 文件（在下载目录）。</div>';
    return html;
  }

  function renderBody() {
    const b = $('#impBody');
    if (S.step === 1) b.innerHTML = renderStep1();
    else if (S.step === 2) b.innerHTML = renderStep2();
    else if (S.step === 3) b.innerHTML = renderStep3();
    else if (S.step === 4) b.innerHTML = renderStep4();
    else b.innerHTML = renderStep5(S.lastResult);
    bindBody();
  }

  /* ---------- 事件绑定 ---------- */
  function bindBody() {
    const b = $('#impBody');
    if (S.step === 1) {
      const drop = $('#impDrop');
      if (drop) drop.addEventListener('click', () => $('#impFile').click());
      const tpl = $('#btnTpl');
      if (tpl) tpl.addEventListener('click', () => {
        L().download('轻记账_标准导入模板.csv', '\uFEFF' + TEMPLATE, 'text/csv;charset=utf-8');
        L().toast('模板已下载，填好后再上传');
      });
    }
    if (S.step === 2) {
      $$('#impBody .map-sel[data-col]').forEach(sel => {
        sel.addEventListener('change', () => {
          const col = +sel.getAttribute('data-col');
          const v = sel.value;
          // 一个字段只能对应一列
          Object.keys(S.map).forEach(k => { if (S.map[k] === v) delete S.map[k]; });
          if (v) S.map[col] = v; else delete S.map[col];
          renderBody();
        });
      });
      const dt = $('#impDefaultType');
      if (dt) dt.addEventListener('change', () => { S.defaultType = dt.value; });
    }
    if (S.step === 3) {
      $$('#impBody .cat-sel').forEach(sel => {
        sel.addEventListener('change', () => {
          S.catMap[sel.getAttribute('data-src')] = sel.value;
          applyCatMap();
          renderBody();
        });
      });
      const ba = $('#btnBulkApply');
      if (ba) ba.addEventListener('click', () => {
        const v = $('#impBulkSel').value;
        S.srcCats.forEach(c => { S.catMap[c] = v; });
        applyCatMap();
        renderBody();
        L().toast('已批量应用');
      });
    }
    if (S.step === 4) {
      const all = $('#impAll');
      if (all) all.addEventListener('change', () => {
        S.recs.forEach(r => { if (!r.bad) r.checked = all.checked; });
        renderBody();
      });
      const wd = $('#impWithDup');
      if (wd) wd.addEventListener('change', () => {
        S.recs.forEach(r => { if (r.dup) r.checked = wd.checked; });
        renderBody();
      });
      $$('#impBody .p-chk').forEach(c => {
        c.addEventListener('change', () => { S.recs[+c.getAttribute('data-i')].checked = c.checked; updateSummary(); });
      });
      $$('#impBody .p-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const i = +btn.getAttribute('data-i');
          S.recs.splice(i, 1);
          renderBody();
        });
      });
      $$('#impBody .prev-row').forEach(tr => {
        tr.addEventListener('click', e => {
          if (e.target.closest('.c-chk') || e.target.closest('.c-del')) return;
          openRowEdit(+tr.getAttribute('data-i'));
        });
      });
    }
    if (S.step === 5) {
      const u = $('#btnUndoImport');
      if (u) u.addEventListener('click', () => {
        L().confirm('撤销本次导入？', '将删除刚刚导入的 ' + S.importedIds.length + ' 条记录，其它数据不受影响。', '撤销', () => {
          L().removeIds(S.importedIds);
          S.importedIds = [];
          S.lastResult = { n: 0, skip: 0, undone: true };
          renderBody();
          L().toast('已撤销本次导入');
        });
      });
    }
  }

  function updateSummary() {
    const box = $('#impBody .imp-sum');
    if (!box) return;
    const ok = S.recs.filter(r => !r.bad && !r.dup && r.checked);
    const exp = ok.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const inc = ok.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const spans = box.querySelectorAll('.imp-sum-grid b');
    if (spans[0]) spans[0].textContent = money(exp);
    if (spans[1]) spans[1].textContent = money(inc);
  }

  function applyCatMap() {
    S.recs.forEach(r => {
      const v = catNameOf(S.catMap[r.srcCat]);
      r.cat = v || matchCategory(r.srcCat, r.type) || '其他';
    });
  }

  /* ---------- 行编辑 ---------- */
  function openRowEdit(i) {
    S.editIdx = i;
    const r = S.recs[i];
    if (!r) return;
    $('#impEditBody').innerHTML =
      row('<span>收支</span>', '<select id="reType" class="map-sel">' +
        '<option value="expense"' + (r.type === 'expense' ? ' selected' : '') + '>支出</option>' +
        '<option value="income"' + (r.type === 'income' ? ' selected' : '') + '>收入</option></select>') +
      row('<span>日期</span>', '<input id="reDate" type="date" class="imp-input" value="' + esc(r.date) + '">') +
      row('<span>时间</span>', '<input id="reTime" type="time" class="imp-input" value="' + esc(r.time || '00:00') + '">') +
      row('<span>金额</span>', '<input id="reAmt" type="text" inputmode="decimal" class="imp-input" value="' + r.amount.toFixed(2) + '">') +
      row('<span>类别</span>', '<select id="reCat" class="map-sel">' + catOptions(true) +
        '</select>') +
      row('<span>备注</span>', '<input id="reNote" type="text" class="imp-input" maxlength="60" value="' + esc(r.note) + '">');
    const selCat = $('#reCat');
    const cur = r.type + '|' + r.cat;
    if (Array.prototype.some.call(selCat.options, o => o.value === cur)) selCat.value = cur;
    const ed = $('#impEdit'), mk = $('#impEditMask');
    ed.hidden = false; mk.hidden = false;
    void ed.offsetHeight;
    ed.classList.add('show'); mk.classList.add('show');
  }
  function row(label, ctl) { return '<div class="map-row"><div class="map-info"><div class="map-h">' + label + '</div></div>' + ctl + '</div>'; }

  function closeRowEdit() {
    const ed = $('#impEdit'), mk = $('#impEditMask');
    ed.classList.remove('show'); mk.classList.remove('show');
    setTimeout(() => { ed.hidden = true; mk.hidden = true; }, 240);
    S.editIdx = -1;
  }

  /* ==========================================================
     八、文件读取 → 解析 → 进入向导
     ========================================================== */
  async function handleFile(file) {
    if (!file) return;
    const name = file.name || '';
    if (/\.xls$/i.test(name) && !/\.xlsx$/i.test(name)) {
      L().toast('暂不支持旧版 .xls，请用 Excel 另存为 .xlsx 或 .csv');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      let rows = null;
      const u8 = new Uint8Array(buf);
      const isZip = u8[0] === 0x50 && u8[1] === 0x4B;
      if (isZip || /\.xlsx$/i.test(name)) {
        rows = await readXlsx(buf);
        S.source = 'xlsx';
      } else {
        rows = parseDelimited(decodeBuf(buf));
        S.source = 'csv';
      }
      if (!rows || rows.length < 2) { L().toast('没读到数据，请确认文件内容'); return; }
      // 去掉 Excel / 支付宝那种前置说明行：取第一行非空单元格最多的一行做表头
      let hi = 0, bestN = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const n = rows[i].filter(v => String(v).trim() !== '').length;
        if (n > bestN) { bestN = n; hi = i; }
      }
      S.headers = rows[hi].map(v => String(v == null ? '' : v).trim());
      S.rows = convertSerialDateColumns(S.headers, rows.slice(hi + 1));
      S.fileName = name;
      const p = detectPreset(S.headers);
      S.presetName = p ? p.preset.name : '';
      S.map = p ? applyPreset(S.headers, p.preset) : autoMapHeaders(S.headers);
      L().toast('已解析 ' + S.rows.length + ' 行');
      showWizard();          // 兜底：万一文件是在向导关闭时选的
      goStep(1);             // 留在步骤一展示前 5 行，确认解析无误再继续
    } catch (e) {
      L().toast('文件解析失败：' + (e && e.message ? e.message : '格式不支持'));
    }
  }

  /* ==========================================================
     九、构建 / 导入
     ========================================================== */
  function colsFromMap() {
    const cols = {};
    Object.keys(S.map).forEach(k => { const f = S.map[k]; if (f) cols[f] = +k; });
    return cols;
  }

  function prepareRecords() {
    S.recs = buildRecords(S.rows, colsFromMap(), { catMap: {}, defaultType: S.defaultType });
    S.srcCats = [];
    S.recs.forEach(r => { if (r.srcCat && S.srcCats.indexOf(r.srcCat) < 0) S.srcCats.push(r.srcCat); });
    const prevMap = S.catMap || {};
    S.catMap = {};
    S.srcCats.forEach(c => {
      if (prevMap[c]) { S.catMap[c] = prevMap[c]; return; }   // 保留用户已手动改过的映射
      const f = matchCategoryFull(c);
      S.catMap[c] = f ? (f.type + '|' + f.cat) : 'expense|其他';
    });
    applyCatMap();
    markDupes(S.recs, L().items());
  }

  function doImport() {
    const picked = S.recs.filter(r => r.checked && !r.bad);
    if (!picked.length) { L().toast('请至少勾选一条记录'); return; }
    // 导入前自动备份
    const okBak = L().download('导入前备份_' + new Date().toISOString().slice(0, 10) + '.json', L().buildJson(), 'application/json');
    if (okBak && L().markExported) L().markExported();
    const now = Date.now();
    const list = picked.map((r, i) => {
      const meta = L().findCat(r.type, r.cat);
      return {
        id: 'imp' + now.toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 5),
        type: r.type, amount: r.amount, category: r.cat,
        group: meta.group, emoji: meta.emoji,
        date: r.date, time: r.time || '00:00', note: r.note,
        order: r.order || '',
        createdAt: Date.parse(r.date + 'T' + (r.time || '00:00') + ':00') || now
      };
    });
    L().addItems(list);
    S.importedIds = list.map(i => i.id);
    const skip = S.recs.length - picked.length;
    S.lastResult = { n: list.length, skip: skip };
    goStep(5);
    L().toast('成功 ' + list.length + ' 条，跳过 ' + skip + ' 条');
  }

  /* ==========================================================
     十、下一步 / 上一步
     ========================================================== */
  function next() {
    if (S.step === 1) {
      if (!S.rows.length) { L().toast('请先选择文件'); return; }
      goStep(2);
    } else if (S.step === 2) {
      const miss = missingRequired();
      if (miss.length) { L().toast('请先指定：' + miss.join('、')); return; }
      prepareRecords();
      if (!S.srcCats.length) { markDupes(S.recs, L().items()); goStep(4); }
      else goStep(3);
    } else if (S.step === 3) {
      applyCatMap();
      markDupes(S.recs, L().items());
      goStep(4);
    } else if (S.step === 4) {
      doImport();
    } else {
      closeWizard();
      L().refresh();
    }
  }

  /* ==========================================================
     十一、安装入口
     ========================================================== */
  function boot() {
    if (S.loaded) return;
    S.loaded = true;
    const f = $('#impFile');
    if (f) f.addEventListener('change', e => { const file = e.target.files[0]; if (file) handleFile(file); });
    const close = $('#impClose'); if (close) close.addEventListener('click', () => { closeWizard(); L().refresh(); });
    const prev = $('#impPrev'); if (prev) prev.addEventListener('click', () => {
      if (S.step === 4 && !S.srcCats.length) goStep(2);
      else if (S.step === 5) { closeWizard(); L().refresh(); }
      else goStep(S.step - 1);
    });
    const nextBtn = $('#impNext'); if (nextBtn) nextBtn.addEventListener('click', next);
    const ec = $('#impEditCancel'); if (ec) ec.addEventListener('click', closeRowEdit);
    const em = $('#impEditMask'); if (em) em.addEventListener('click', closeRowEdit);
    const es = $('#impEditSave');
    if (es) es.addEventListener('click', () => {
      const r = S.recs[S.editIdx];
      if (!r) { closeRowEdit(); return; }
      const amt = parseFloat($('#reAmt').value);
      if (!amt || amt <= 0) { L().toast('请输入正确金额'); return; }
      r.type = $('#reType').value;
      r.date = $('#reDate').value || r.date;
      r.time = $('#reTime').value || '00:00';
      r.amount = Math.round(amt * 100) / 100;
      const cv = $('#reCat').value;
      if (cv) { r.cat = cv.split('|')[1]; S.catMap[r.srcCat] = cv; }
      r.note = $('#reNote').value.trim();
      r.bad = false;
      markDupes(S.recs, L().items());
      closeRowEdit();
      renderBody();
    });

    // 入口：首页 / 设置页
    $$('[data-open-import]').forEach(b => b.addEventListener('click', openWizard));
  }

  window.LedgerImport = {
    open: openWizard,
    boot: boot,
    loadFile: handleFile,     // 供拖拽 / 自动化调用
    // 供自动化测试使用的纯函数
    parseDelimited: parseDelimited, detectDelim: detectDelim, decodeBuf: decodeBuf,
    normDate: normDate, normTime: normTime, normAmount: normAmount, normType: normType,
    autoMapHeaders: autoMapHeaders, detectPreset: detectPreset, applyPreset: applyPreset,
    matchCategory: matchCategory, matchCategoryFull: matchCategoryFull, catNameOf: catNameOf,
    buildRecords: buildRecords, markDupes: markDupes,
    excelSerialToDate: excelSerialToDate,
    FIELDS: FIELDS, PRESETS: PRESETS, TEMPLATE: TEMPLATE, CAT_RULES: CAT_RULES,
    state: S
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
