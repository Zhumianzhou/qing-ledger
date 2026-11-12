/* ==========================================================
   轻记账 · 主逻辑
   纯前端 / localStorage / 无后端
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- 常量：类别清单 ---------------- */
  const CATEGORIES = {
    expense: [
      { group: '餐饮', items: [
        { n: '早餐', e: '🍞' }, { n: '午餐', e: '🍱' }, { n: '晚餐', e: '🍲' }, { n: '夜宵', e: '🍜' },
        { n: '零食', e: '🍿' }, { n: '水果', e: '🍎' }, { n: '饮料奶茶', e: '🧋' }
      ]},
      { group: '日用', items: [
        { n: '日用品', e: '🧴' }, { n: '洗漱', e: '🧼' }, { n: '衣物鞋包', e: '👟' }, { n: '理发', e: '💇' }
      ]},
      { group: '交通', items: [
        { n: '公交地铁', e: '🚇' }, { n: '打车', e: '🚕' }, { n: '共享单车', e: '🚲' }, { n: '加油充电', e: '⛽' }
      ]},
      { group: '购物', items: [
        { n: '电商', e: '🛒' }, { n: '超市', e: '🏪' }, { n: '数码', e: '📱' }, { n: '礼物', e: '🎁' }
      ]},
      { group: '娱乐', items: [
        { n: '游戏', e: '🎮' }, { n: '电影', e: '🎬' }, { n: '运动健身', e: '🏋️' }, { n: '旅游', e: '✈️' }
      ]},
      { group: '学习', items: [
        { n: '书籍', e: '📚' }, { n: '文具', e: '✏️' }, { n: '课程培训', e: '🎓' }
      ]},
      { group: '医疗', items: [
        { n: '药品', e: '💊' }, { n: '看病', e: '🏥' }
      ]},
      { group: '住房', items: [
        { n: '房租', e: '🏠' }, { n: '水电燃气', e: '💡' }, { n: '物业', e: '🏢' }, { n: '网络', e: '📶' }
      ]},
      { group: '通讯', items: [
        { n: '话费', e: '📞' }, { n: '流量', e: '📡' }
      ]},
      { group: '人情', items: [
        { n: '红包', e: '🧧' }, { n: '请客', e: '🍻' }
      ]},
      { group: '其他', items: [
        { n: '其他', e: '📦' }
      ]}
    ],
    income: [
      { group: '收入', items: [
        { n: '工资', e: '💰' }, { n: '兼职', e: '💼' }, { n: '奖学金', e: '🎓' },
        { n: '红包', e: '🧧' }, { n: '理财', e: '📈' }, { n: '其他', e: '💰' }
      ]}
    ]
  };

  const CHART_COLORS = ['#0a84ff', '#3a9bff', '#5cb0ff', '#7cc0ff', '#34c759', '#2ec4b6',
                        '#ffb020', '#ff8a5c', '#e5484d', '#ff7ab8', '#a8b0bd'];
  // 猫咪风格（暖橘 / 浅粉 / 奶油）下的图表配色，只在主题为 cat 时使用
  const CAT_CHART_COLORS = ['#FF9F68', '#FFB6C1', '#FFC98F', '#F2A2AE', '#FFB07C', '#E9A6C4',
                            '#FFD2A0', '#F58F7C', '#D9A0A8', '#FFC0B0', '#E5B79B'];
  function chartColors() { return catOn() ? CAT_CHART_COLORS : CHART_COLORS; }

  const KEY_ITEMS = 'qing_ledger_items_v1';
  const KEY_CAT = 'qing_ledger_lastcat_v1';
  const KEY_SNAP = 'qing_ledger_snap_v1';        // 上次保存前的完整数据，误删可一键恢复
  const KEY_LASTEXP = 'qing_ledger_lastexport';  // 上次导出备份的时间戳
  const KEY_TIPOFF = 'qing_ledger_tipoff';       // 备份提醒「今天不再提示」的日期
  const KEY_THEME = 'qing_ledger_theme_v1';      // 主题：'min' 极简（默认） / 'cat' 小猫
  const KEY_BF = 'qing_ledger_bfdate_v1';        // 补账：上次补账时选的日期（仅记住日期，不动账单数据）
  const THEME_LABEL = { min: '极简主题', cat: '小猫主题' };

  // 小猫主题：toast 里用的小肉垫（纯内联 SVG，无额外请求）
  const CAT_PAW = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
    '<g fill="#FFCFB5"><ellipse cx="12" cy="15.4" rx="6.1" ry="5.1"/>' +
    '<circle cx="6.3" cy="9.7" r="2.05"/><circle cx="10" cy="7.3" r="2.05"/>' +
    '<circle cx="14" cy="7.3" r="2.05"/><circle cx="17.7" cy="9.7" r="2.05"/></g></svg>';

  /* ---------------- 工具 ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const pad = n => (n < 10 ? '0' : '') + n;

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayStr() { return fmtDate(new Date()); }
  function nowTime() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function money(n) {
    const v = Math.abs(Number(n) || 0);
    return '¥' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function weekdayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return '周' + '日一二三四五六'.charAt(d.getDay());
  }
  function dayLabel(dateStr) {
    const t = todayStr();
    if (dateStr === t) return '今天';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (dateStr === fmtDate(y)) return '昨天';
    const b = new Date(); b.setDate(b.getDate() - 2);
    if (dateStr === fmtDate(b)) return '前天';
    const p = dateStr.split('-');
    return Number(p[1]) + '月' + Number(p[2]) + '日';
  }
  function monthKey(dateStr) { return dateStr.slice(0, 7); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m: 1-12
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function findCat(type, name) {
    const groups = CATEGORIES[type];
    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups[i].items.length; j++) {
        if (groups[i].items[j].n === name) {
          return { emoji: groups[i].items[j].e, group: groups[i].group };
        }
      }
    }
    return { emoji: type === 'expense' ? '📦' : '💰', group: '其他' };
  }

  /* ---------------- 存储层 ---------------- */
  const Store = {
    items: [],
    load() {
      try {
        const raw = localStorage.getItem(KEY_ITEMS);
        this.items = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(this.items)) this.items = [];
      } catch (e) { this.items = []; }
      return this.items;
    },
    save() {
      let next = '';
      try { next = JSON.stringify(this.items); } catch (e) { return false; }
      // 写入前把上一份完整数据存为快照（失败不影响主保存）
      try {
        const prev = localStorage.getItem(KEY_ITEMS);
        if (prev && prev !== next && next.length < 2 * 1024 * 1024) {
          localStorage.setItem(KEY_SNAP, JSON.stringify({ t: Date.now(), items: JSON.parse(prev) }));
        }
      } catch (e) {}
      try {
        localStorage.setItem(KEY_ITEMS, next);
        return true;
      } catch (e) {
        toast('保存失败：存储空间不足');
        return false;
      }
    },
    add(item) { this.items.push(item); this.sort(); this.save(); },
    update(item) { this.sort(); this.save(); },
    remove(id) {
      this.items = this.items.filter(i => i.id !== id);
      this.save();
    },
    replaceAll(list) { this.items = list; this.sort(); this.save(); },
    sort() {
      this.items.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }
  };

  /* ---------------- 统计计算 ---------------- */
  function sumBy(list, type) {
    let s = 0;
    for (let i = 0; i < list.length; i++) if (list[i].type === type) s += Number(list[i].amount) || 0;
    return s;
  }
  // 已过天数：当前月取今天日期，历史月份取整月天数
  function passedDays(mk) {
    const now = new Date();
    if (mk === fmtDate(now).slice(0, 7)) return now.getDate();
    const p = mk.split('-');
    return daysInMonth(Number(p[0]), Number(p[1]));
  }
  function monthStats(mk) {
    const list = Store.items.filter(i => monthKey(i.date) === mk);
    const exp = sumBy(list, 'expense');
    const inc = sumBy(list, 'income');
    const d = passedDays(mk) || 0;
    return { expense: exp, income: inc, balance: inc - exp, count: list.length, days: d,
             avgExp: d ? exp / d : 0, avgInc: d ? inc / d : 0, list: list };
  }

  /* ---------------- Toast / Confirm ---------------- */
  let toastTimer = null;

  /* ---------------- 主题（纯视觉，绝不触碰数据） ----------------
     极简 = 加小猫元素之前的上一版界面；小猫 = 带猫咪装饰的可爱版。
     只切 <html> 上的 theme-* 类，不改任何数据结构/统计/导入导出/备份逻辑。 */
  function currentTheme() {
    try {
      const v = localStorage.getItem(KEY_THEME);
      if (v === 'cat' || v === 'min') return v;
    } catch (e) {}
    return 'min';                     // 默认：极简主题
  }
  function catOn() { return currentTheme() === 'cat'; }

  function applyTheme(t) {
    t = (t === 'cat') ? 'cat' : 'min';
    const root = document.documentElement;
    root.classList.toggle('theme-cat', t === 'cat');
    root.classList.toggle('theme-min', t === 'min');
    syncThemePicker();                 // 选择器高亮 + 「当前：xx」文案
    syncPawSwitch();                   // 猫爪拨杆状态（开=粉色 / 关=灰色）
    // 图表配色随主题走（暖橘 / 浅粉）；纯展示，不动任何数据
    const sv = $('#view-stats');
    if (sv && !sv.hidden && typeof renderStats === 'function') renderStats();
  }

  /* 「小猫模式」猫爪拨杆：与主题选择卡等价，开=粉色猫爪、关=灰色猫爪 */
  function syncPawSwitch() {
    const row = $('#pawSwitchRow');
    if (!row) return;
    const on = currentTheme() === 'cat';
    row.setAttribute('aria-checked', on ? 'true' : 'false');
    const track = $('.paw-switch', row);
    if (track) track.classList.toggle('on', on);
    const st = $('#pawSwitchState');
    if (st) st.textContent = on ? '开' : '关';
  }

  /* 加载 / 切换页面时的一排猫爪脚印动画（只有猫咪风格会显示） */
  let loaderTimer = null;
  function catLoading(ms) {
    const el = $('#catLoader');
    if (!el) return;
    if (!catOn()) { el.hidden = true; return; }
    el.hidden = false;
    clearTimeout(loaderTimer);
    loaderTimer = setTimeout(() => { el.hidden = true; }, ms || 700);
  }

  /* 首页「本月概览」两侧的猫：点一下 → 猫弹跳 0.4s + 头顶冒出一句话气泡（2.5s 后自动消失）
     · 两只猫各自独立 2 秒冷却，冷却期内再点不弹、不叠加
     · 极简主题下这两只猫是 display:none（.cat-deco 门控），catOn() 直接返回，无任何副作用
     纯展示，不动任何数据、不影响任何功能。 */
  const CAT_POP_TEXT = { l: '想你', r: '喜欢你' };
  const catPopAt = { l: 0, r: 0 };
  function catPop(k) {
    if (!catOn()) return;
    const now = Date.now();
    if (now - catPopAt[k] < 2000) return;      // 冷却中：不弹跳、不弹气泡
    catPopAt[k] = now;

    const cat = $('.month-cat-' + k);
    const row = $('.section-title-cats');
    if (!cat || !row) return;

    cat.classList.remove('bounce');
    void cat.offsetWidth;                      // 强制回流，让连点也能重播动画
    cat.classList.add('bounce');
    setTimeout(() => cat.classList.remove('bounce'), 420);

    const old = row.querySelector('.cat-pop[data-k="' + k + '"]');
    if (old) { clearTimeout(Number(old.getAttribute('data-timer'))); old.remove(); }

    const pop = document.createElement('div');
    pop.className = 'cat-deco cat-pop';
    pop.setAttribute('data-k', k);
    pop.textContent = CAT_POP_TEXT[k];
    row.appendChild(pop);

    const cr = cat.getBoundingClientRect(), rr = row.getBoundingClientRect();
    pop.style.left = cr.width ? (cr.left - rr.left + cr.width / 2) + 'px' : '50%';

    const t1 = setTimeout(() => {
      pop.classList.add('out');
      const t2 = setTimeout(() => { if (pop.parentNode) pop.remove(); }, 300);
      pop.setAttribute('data-timer', t2);
    }, 2500);
    pop.setAttribute('data-timer', t1);
  }

  function setTheme(t) {
    t = (t === 'cat') ? 'cat' : 'min';
    try { localStorage.setItem(KEY_THEME, t); } catch (e) {}
    applyTheme(t);
  }

  const TOAST_DONE_RE = /成功|已保存|已生成|已恢复|已撤销/;

  function toast(msg) {
    const el = $('#toast');
    const isCat = catOn();
    const done = TOAST_DONE_RE.test(msg);
    el.className = 'toast' + (isCat && done ? ' toast-cat' : '');
    if (isCat && done) {
      // 记账成功：水彩小猫展示在文字上方
      // 猫咪风格：眯眼笑钥匙扣（keychain_smile）圆形裁切，位于文字上方
      el.innerHTML = '<img class="toast-cat-img" src="cat/keychain-smile.webp" alt="" aria-hidden="true">' +
                     '<div class="toast-cat-text"></div>';
      // 小猫主题下文案统一为「记账成功 (ฅ^•ﻌ•^ฅ)」：去掉原来的 ✓，补录日期仍保留
      const clean = msg.replace(/✓/g, '').replace(/\s{2,}/g, ' ').trim();
      el.querySelector('.toast-cat-text').textContent = clean + ' (ฅ^•ﻌ•^ฅ)';
    } else if (isCat) {
      el.innerHTML = '<span class="cat-paw-toast" aria-hidden="true">' + CAT_PAW + '</span>';
      el.appendChild(document.createTextNode(msg));
    } else {
      el.textContent = msg;
    }
    el.hidden = false;
    void el.offsetHeight;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 240);
    }, 1800);
  }

  let confirmCb = null, confirmNoCb = null;
  function showConfirm(title, text, yesText, cb, opts) {
    opts = opts || {};
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text || '';
    $('#confirmYes').textContent = yesText || '确定';
    $('#confirmNo').textContent = opts.noText || '取消';
    $('#confirmYes').className = 'btn ' + (opts.primary ? 'primary' : 'danger');
    confirmCb = cb || null;
    confirmNoCb = opts.noCb || null;
    // 猫咪风格：删除类确认弹窗显示「委屈哭钥匙扣」（cat=  'cry' 时）
    const box0 = $('#confirmBox');
    if (box0) box0.setAttribute('data-cat', opts.cat || '');
    const mask = $('#confirmMask'), box = $('#confirmBox');
    mask.hidden = false; box.hidden = false;
    void box.offsetHeight;
    mask.classList.add('show'); box.classList.add('show');
  }
  function hideConfirm() {
    const mask = $('#confirmMask'), box = $('#confirmBox');
    mask.classList.remove('show'); box.classList.remove('show');
    setTimeout(() => { mask.hidden = true; box.hidden = true; }, 200);
    confirmCb = null; confirmNoCb = null;
  }

  /* ---------------- 弹层控制 ---------------- */
  function openSheet(sheet, mask) {
    sheet.hidden = false; mask.hidden = false;
    document.body.classList.add('sheet-open');
    // 强制重排后再加动画类：既能保留过渡效果，又不依赖 requestAnimationFrame
    // （rAF 在页面不可见 / 省电模式下可能不触发，会导致弹层卡在屏幕外）
    void sheet.offsetHeight;
    sheet.classList.add('show'); mask.classList.add('show');
    syncKeyboard();
  }
  function closeSheet(sheet, mask) {
    sheet.classList.remove('show'); mask.classList.remove('show');
    document.body.classList.remove('sheet-open');
    setTimeout(() => { sheet.hidden = true; mask.hidden = true; }, 260);
    document.documentElement.style.setProperty('--kb', '0px');
  }

  /* 键盘避让（iOS Safari） */
  function syncKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', (kb > 60 ? kb : 0) + 'px');
  }

  /* ==========================================================
     视图：首页概览
     ========================================================== */
  function renderHome() {
    const t = todayStr();
    const todayList = Store.items.filter(i => i.date === t);
    const tExp = sumBy(todayList, 'expense');
    const tInc = sumBy(todayList, 'income');

    $('#todayExpense').textContent = money(tExp);
    $('#todayIncome').textContent = money(tInc);
    const bal = tInc - tExp;
    $('#todayBalance').textContent = (bal < 0 ? '-' : '') + money(bal);

    const mk = t.slice(0, 7);
    const m = monthStats(mk);
    $('#monthExpense').textContent = money(m.expense);
    $('#monthIncome').textContent = money(m.income);
    $('#monthAvgExpense').textContent = money(m.avgExp);
    $('#monthAvgIncome').textContent = money(m.avgInc);
    $('#monthCount').textContent = m.count;
    $('#monthDayHint').textContent = m.days ? ('已过 ' + m.days + ' 天 · 日均') : '本月暂无数据';
    $('#topTitle').textContent = Number(t.slice(5, 7)) + '月' + Number(t.slice(8, 10)) + '日 ' + weekdayOf(t);

    // 最近 5 笔
    const recent = Store.items.slice(0, 5);
    const box = $('#recentList');
    $('#recentEmpty').hidden = recent.length > 0;
    box.hidden = recent.length === 0;
    box.innerHTML = recent.map(itemHTML).join('');
    bindItems(box);
  }

  /* ==========================================================
     视图：账目列表（按日期分组）
     ========================================================== */
  let listFilter = 'all';
  let listQuery = '';

  function renderList() {
    let list = Store.items;
    if (listFilter !== 'all') list = list.filter(i => i.type === listFilter);
    if (listQuery) {
      const q = listQuery.toLowerCase();
      list = list.filter(i =>
        (i.note || '').toLowerCase().indexOf(q) >= 0 ||
        (i.category || '').toLowerCase().indexOf(q) >= 0 ||
        (i.group || '').toLowerCase().indexOf(q) >= 0);
    }
    const box = $('#groupedList');
    $('#listEmpty').hidden = list.length > 0;
    if (!list.length) { box.innerHTML = ''; return; }

    const groups = [];
    let cur = null;
    list.forEach(it => {
      if (!cur || cur.date !== it.date) { cur = { date: it.date, items: [] }; groups.push(cur); }
      cur.items.push(it);
    });

    box.innerHTML = groups.map(g => {
      const e = sumBy(g.items, 'expense');
      const i = sumBy(g.items, 'income');
      let sub = '';
      if (e) sub += '<span class="out">支出 ' + money(e) + '</span>';
      if (e && i) sub += ' · ';
      if (i) sub += '<span class="in">收入 ' + money(i) + '</span>';
      return '<div class="card day-group">' +
        '<div class="day-head">' +
          '<div class="day-date"><img class="cat-deco cat-day-cat" src="cat/cat-paw.webp" alt="" aria-hidden="true">' + dayLabel(g.date) + ' <span class="muted" style="font-weight:400">' + weekdayOf(g.date) + '</span></div>' +
          '<div class="day-sub">' + (sub || '<span class="muted">无</span>') + '</div>' +
        '</div>' +
        '<div>' + g.items.map(itemHTML).join('') + '</div>' +
      '</div>';
    }).join('');
    bindItems(box);
  }

  function itemHTML(it) {
    const sign = it.type === 'expense' ? '-' : '+';
    const cls = it.type === 'expense' ? 'out' : 'in';
    return '<div class="item" data-id="' + it.id + '">' +
      '<div class="item-emoji">' + (it.emoji || '📦') + '</div>' +
      '<div class="item-main">' +
        '<div class="item-cat">' + esc(it.category) + '</div>' +
        (it.note ? '<div class="item-note">' + esc(it.note) + '</div>' : '') +
      '</div>' +
      '<div class="item-right">' +
        '<div class="item-amt ' + cls + '">' + sign + money(it.amount) + '</div>' +
        '<div class="item-time">' + (it.time || '') + '</div>' +
      '</div>' +
      '<button class="item-del" data-del="' + it.id + '" aria-label="删除">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>' +
      '</button>' +
    '</div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 列表项交互：点击编辑 / 删除按钮 / 长按删除 */
  function bindItems(box) {
    $$('.item', box).forEach(el => {
      const id = el.getAttribute('data-id');
      let lpTimer = null, longPressed = false, startX = 0, startY = 0;

      el.addEventListener('touchstart', e => {
        longPressed = false;
        const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
        lpTimer = setTimeout(() => {
          longPressed = true;
          if (navigator.vibrate) navigator.vibrate(12);
          askDelete(id);
        }, 550);
      }, { passive: true });

      el.addEventListener('touchmove', e => {
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) clearTimeout(lpTimer);
      }, { passive: true });

      el.addEventListener('touchend', () => clearTimeout(lpTimer));
      el.addEventListener('touchcancel', () => clearTimeout(lpTimer));

      el.addEventListener('click', e => {
        if (longPressed) { longPressed = false; return; }
        openEdit(id);
      });
    });

    $$('.item-del', box).forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        askDelete(btn.getAttribute('data-del'));
      });
    });
  }

  function askDelete(id) {
    const it = Store.items.find(i => i.id === id);
    if (!it) return;
    showConfirm('删除这笔账？',
      (it.category || '') + ' ' + money(it.amount) + (it.note ? ' · ' + it.note : '') + '\n删除后无法恢复。',
      '删除', () => {
        Store.remove(id);
        refreshAll();
        toast('已删除');
      }, { cat: 'cry' });          // 猫咪风格：弹窗里显示委屈哭钥匙扣
  }

  /* ==========================================================
     视图：统计
     ========================================================== */
  let statMonth = todayStr().slice(0, 7);

  /* 金额气泡是相对柱子居中的（translateX(-50%)），最左/最右的柱子会让气泡探到图表外侧，
     而图表外层是横向滚动容器（裁剪边界就是它的 padding box），会被切掉。
     这里把气泡推回该容器的可视框内：既不会被任何容器裁剪，也不会超出屏幕。
     纯展示计算，不动任何数据。 */
  function clampTipIntoView(tip, clipBox) {
    const r = tip.getBoundingClientRect();
    if (!r.width) return;                       // 布局未就绪（如测试环境）时不做调整
    const box = (clipBox || tip.parentNode).getBoundingClientRect();
    if (!box.width) return;
    let shift = 0;
    if (r.left < box.left + 2) shift = (box.left + 2) - r.left;
    else if (r.right > box.right - 2) shift = (box.right - 2) - r.right;
    if (shift) tip.style.marginLeft = shift + 'px';
  }

  function renderStats() {
    const mk = statMonth;
    const p = mk.split('-');
    const y = Number(p[0]), m = Number(p[1]);
    $('#monthLabel').textContent = y + '年' + m + '月';
    $('#nextMonth').disabled = false;

    const s = monthStats(mk);
    $('#sExpense').textContent = money(s.expense);
    $('#sIncome').textContent = money(s.income);
    $('#sBalance').textContent = (s.balance < 0 ? '-' : '') + money(s.balance);
    $('#sBalance').className = 'stat-val ' + (s.balance < 0 ? 'out' : (s.balance > 0 ? 'in' : ''));
    $('#sCount').textContent = s.count;

    /* --- 每日支出柱状图 --- */
    const dim = daysInMonth(y, m);
    const daily = new Array(dim + 1).fill(0);
    s.list.forEach(i => {
      if (i.type !== 'expense') return;
      const d = Number(i.date.slice(8, 10));
      if (d >= 1 && d <= dim) daily[d] += Number(i.amount) || 0;
    });
    let max = 0;
    for (let i = 1; i <= dim; i++) if (daily[i] > max) max = daily[i];
    const tStr = todayStr();
    let bars = '';
    for (let d = 1; d <= dim; d++) {
      const v = daily[d];
      const h = max > 0 ? Math.max(v > 0 ? 3 : 2, Math.round(v / max * 100)) : (v > 0 ? 3 : 2);
      const isToday = (mk === tStr.slice(0, 7) && d === Number(tStr.slice(8, 10)));
      bars += '<div class="bar-col' + (isToday ? ' today' : '') + '" data-d="' + d + '" data-v="' + v.toFixed(2) + '">' +
        '<div class="bar' + (v > 0 ? '' : ' zero') + '" style="height:' + h + '%"></div></div>';
    }
    const barsEl = $('#dailyBars');
    barsEl.innerHTML = bars;
    $('#barsAxis').innerHTML = '<span>1日</span><span>' + Math.ceil(dim / 2) + '日</span><span>' + dim + '日</span>';
    $('#barsHint').textContent = max > 0 ? ('最高单日支出 ' + money(max) + '，点击柱子看金额') : '本月还没有支出记录';

    $$('.bar-col', barsEl).forEach(col => {
      col.addEventListener('click', () => {
        const old = $('.bar-tip', barsEl);
        if (old) old.remove();
        const bar = $('.bar', col);
        const tip = document.createElement('div');
        tip.className = 'bar-tip';
        tip.textContent = m + '/' + col.getAttribute('data-d') + ' ' + money(col.getAttribute('data-v'));
        // 气泡贴在「柱子顶端」上方，而不是柱列顶端：矮柱子的气泡不会飘到半空，
        // 最高的柱子则完整溢出到 .bars-wrap 预留的 42px 留白区，不会被裁掉。
        tip.style.bottom = 'calc(' + ((bar && bar.style.height) || '0%') + ' + 6px)';
        col.appendChild(tip);
        clampTipIntoView(tip, barsEl.parentNode);   // 外层滚动容器就是裁剪边界
        setTimeout(() => { if (tip.parentNode) tip.remove(); }, 2200);
      });
    });

    /* --- 类别环形图（按大类） --- */
    const byGroup = {};
    s.list.forEach(i => {
      if (i.type !== 'income') byGroup[i.group || '其他'] = (byGroup[i.group || '其他'] || 0) + (Number(i.amount) || 0);
    });
    const arr = Object.keys(byGroup).map(k => ({ name: k, value: byGroup[k] }))
      .sort((a, b) => b.value - a.value);
    const total = arr.reduce((a, b) => a + b.value, 0);
    $('#donutTotal').textContent = money(total);

    const donut = $('#donut');
    if (total > 0 && arr.length) {
      let acc = 0;
      const palette = chartColors();
      const stops = arr.map((g, idx) => {
        const from = acc / total * 360;
        acc += g.value;
        const to = acc / total * 360;
        const c = palette[idx % palette.length];
        return c + ' ' + from.toFixed(2) + 'deg ' + to.toFixed(2) + 'deg';
      }).join(', ');
      donut.style.background = 'conic-gradient(' + stops + ')';
      donut.classList.add('has-data');
    } else {
      donut.style.background = catOn() ? '#F6E7DC' : '#eef1f6';
    }

    const groupEmoji = {};
    ['expense', 'income'].forEach(t => CATEGORIES[t].forEach(g => { groupEmoji[g.group] = g.items[0].e; }));
    $('#donutLegend').innerHTML = arr.length ? arr.map((g, idx) =>
      '<div class="lg-item">' +
        '<span class="lg-dot" style="background:' + chartColors()[idx % chartColors().length] + '"></span>' +
        '<span class="lg-name">' + (groupEmoji[g.name] || '📦') + ' ' + esc(g.name) + '</span>' +
        '<span class="lg-pct">' + (g.value / total * 100).toFixed(1) + '%</span>' +
        '<span class="lg-val">' + money(g.value) + '</span>' +
      '</div>').join('') : '<div class="muted" style="font-size:14px;padding:6px 0">本月暂无支出</div>';

    /* --- 明细类别排行 --- */
    const byCat = {};
    s.list.forEach(i => {
      if (i.type !== 'expense') return;
      const k = i.category || '其他';
      if (!byCat[k]) byCat[k] = { name: k, emoji: i.emoji || '📦', value: 0 };
      byCat[k].value += Number(i.amount) || 0;
    });
    const cats = Object.keys(byCat).map(k => byCat[k]).sort((a, b) => b.value - a.value).slice(0, 8);
    const cmax = cats.length ? cats[0].value : 0;
    $('#rankList').innerHTML = cats.length ? cats.map(c =>
      '<div class="rank-item">' +
        '<span class="rank-emoji">' + c.emoji + '</span>' +
        '<span class="rank-name">' + esc(c.name) + '</span>' +
        '<span class="rank-bar-bg"><i class="rank-bar" style="width:' + (cmax ? (c.value / cmax * 100).toFixed(1) : 0) + '%"></i></span>' +
        '<span class="rank-val out">' + money(c.value) + '</span>' +
      '</div>').join('') : '<div class="muted" style="font-size:14px;padding:6px 0">本月暂无支出</div>';
  }

  /* ==========================================================
     记账表单
     ========================================================== */
  let editId = null;
  let formType = 'expense';
  let formCat = null;
  let backfillMode = false;   // true = 补账模式（连补同一天，保存后停留本页）

  /* ---------------- 补账：记住上次补的日期（只存日期字符串，不碰账单数据） ---------------- */
  function lastBackfillDate() {
    let v = null;
    try { v = localStorage.getItem(KEY_BF); } catch (e) {}
    // 必须是合法 YYYY-MM-DD，否则回落到今天
    return (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : todayStr();
  }
  function rememberBackfillDate(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
    try { localStorage.setItem(KEY_BF, d); } catch (e) {}
  }
  function countOnDate(d) {
    return Store.items.filter(i => i.date === d).length;
  }
  /* 补账日期文案：如「10月5日」（跨年时带上年份） */
  function backfillDateText(d) {
    const p = (d || '').split('-');
    if (p.length !== 3) return '今天';
    const md = Number(p[1]) + '月' + Number(p[2]) + '日';
    return (p[0] === todayStr().slice(0, 4)) ? md : (p[0] + '年' + md);
  }
  /* 刷新补账横幅：日期 + 当天已补笔数 */
  function updateBfBanner() {
    const banner = $('#bfBanner');
    if (!banner) return;
    banner.hidden = !backfillMode;
    if (!backfillMode) return;
    const d = $('#dateInput').value || todayStr();
    const t = $('#bfTitle');
    if (t) t.textContent = '正在补 ' + backfillDateText(d) + ' 的账';
    const n = countOnDate(d);
    const sub = $('#bfSub');
    if (sub) {
      // 星期/今天 放在副标题，保证主标题（日期）在窄屏也能单行显示
      sub.textContent = (d === todayStr() ? '今天' : weekdayOf(d)) + ' · ' + (n
        ? '已记 ' + n + ' 笔 · 金额清空、类别保留，可接着补第 ' + (n + 1) + ' 笔'
        : '这天还没有账 · 保存后停留本页，可连续补下一笔');
    }
    // 快捷日期高亮：命中今天/昨天/前天才点亮
    $$('.chip[data-offset]').forEach(c => {
      const dd = new Date(); dd.setDate(dd.getDate() - Number(c.getAttribute('data-offset')));
      c.classList.toggle('active', fmtDate(dd) === d);
    });
  }

  function renderCatBox() {
    const box = $('#catBox');
    const groups = CATEGORIES[formType];
    box.innerHTML = groups.map(g =>
      '<div class="cat-group-title">' + g.group + '</div>' +
      '<div class="cat-grid">' + g.items.map(it =>
        '<button class="cat-item' + (formCat === it.n ? ' active' : '') + '" data-cat="' + esc(it.n) + '" data-emoji="' + it.e + '">' +
          '<span class="cat-emoji">' + it.e + '</span>' +
          '<span class="cat-name">' + esc(it.n) + '</span>' +
        '</button>').join('') + '</div>'
    ).join('');
    $$('.cat-item', box).forEach(b => {
      b.addEventListener('click', () => {
        formCat = b.getAttribute('data-cat');
        $$('.cat-item', box).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        try { localStorage.setItem(KEY_CAT + '_' + formType, formCat); } catch (e) {}
        b.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  function setType(type) {
    formType = type;
    $$('#typeSeg .type-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-type') === type));
    // 切换类型时，同名类别（如 红包 / 其他）保留，否则回落到上次选择
    let last = null;
    try { last = localStorage.getItem(KEY_CAT + '_' + type); } catch (e) {}
    const flat = [];
    CATEGORIES[type].forEach(g => g.items.forEach(i => flat.push(i.n)));
    if (flat.indexOf(formCat) < 0) {
      formCat = (last && flat.indexOf(last) >= 0) ? last : flat[0];
    }
    renderCatBox();
  }

  /* id 为空且 backfill=true 时进入「补账模式」：
     - 默认日期 = 上次补账的日期（首次为今天）
     - 保存后停留在本页、日期不变、金额与备注清空、类别保留
     普通「记一笔」与「编辑已有账单」的逻辑完全不变。 */
  function openEdit(id, backfill) {
    editId = id || null;
    backfillMode = !id && backfill === true;
    $('#editTitle').textContent = id ? '编辑账单' : (backfillMode ? '补账单' : '记一笔');
    $('#btnDeleteEdit').hidden = !id;
    const cancelBtn = $('#btnCancelEdit');
    if (cancelBtn) cancelBtn.textContent = backfillMode ? '完成' : '取消';
    // 猫咪风格：记一笔页顶部放 cat05，补账单页顶部放 cat06（只用图片，不动任何逻辑）
    const sheetCat = $('#sheetTitleCat');
    if (sheetCat) sheetCat.src = backfillMode ? 'cat/cat06.webp' : 'cat/cat05.webp';

    const it = id ? Store.items.find(i => i.id === id) : null;
    if (it) {
      formType = it.type;
      formCat = it.category;
      $('#amountInput').value = Number(it.amount).toFixed(2);
      $('#dateInput').value = it.date;
      $('#timeInput').value = it.time || nowTime();
      $('#noteInput').value = it.note || '';
    } else {
      formType = 'expense';
      $('#amountInput').value = '';
      // 记一笔 = 今天；补账单 = 上次补账时选的日期（第一次用则是今天）
      $('#dateInput').value = backfillMode ? lastBackfillDate() : todayStr();
      $('#timeInput').value = nowTime();
      $('#noteInput').value = '';
      const last = (function () { try { return localStorage.getItem(KEY_CAT + '_expense'); } catch (e) { return null; } })();
      formCat = last || '午餐';
    }
    $$('#typeSeg .type-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-type') === formType));
    renderCatBox();
    updateBfBanner();
    // 关闭 OCR 面板
    $('#ocrPanel').hidden = true;
    $('#btnOcrToggle').classList.remove('open');
    resetOcr();

    openSheet($('#editSheet'), $('#editMask'));
    if (!id) setTimeout(() => $('#amountInput').focus(), 320);
  }

  function closeEditSheet() {
    closeSheet($('#editSheet'), $('#editMask'));
    backfillMode = false;
    updateBfBanner();
  }

  function saveEdit() {
    const amount = parseFloat($('#amountInput').value);
    if (!amount || amount <= 0 || isNaN(amount)) { toast('请输入正确金额'); $('#amountInput').focus(); return; }
    if (!formCat) { toast('请选择一个类别'); return; }
    const date = $('#dateInput').value || todayStr();
    const time = $('#timeInput').value || nowTime();
    const note = $('#noteInput').value.trim();
    const meta = findCat(formType, formCat);

    if (editId) {
      const it = Store.items.find(i => i.id === editId);
      if (it) {
        it.type = formType; it.amount = Math.round(amount * 100) / 100;
        it.category = formCat; it.group = meta.group; it.emoji = meta.emoji;
        it.date = date; it.time = time; it.note = note;
      }
      Store.update();
      toast('已保存修改');
    } else {
      Store.add({
        id: uid(), type: formType, amount: Math.round(amount * 100) / 100,
        category: formCat, group: meta.group, emoji: meta.emoji,
        date: date, time: time, note: note, createdAt: Date.now()
      });
      // 补账模式的提示统一在下面带「第 N 笔」一起弹，避免连弹两次
      if (!backfillMode) toast(date === todayStr() ? '记账成功 ✓' : '补录成功 ✓  ' + dayLabel(date));
    }

    // ---- 补账模式：保存后停留本页，日期不变，可继续补同一天 ----
    if (backfillMode) {
      refreshAll();
      rememberBackfillDate(date);
      $('#amountInput').value = '';     // 金额清空
      $('#noteInput').value = '';       // 备注清空
      $('#dateInput').value = date;     // 日期保持当前所选，不变
      $('#timeInput').value = nowTime();
      // 类别保留（formCat 不动，也不重渲染类别网格 → 选中态保持）
      const n = countOnDate(date);
      toast('补录成功 ✓  ' + backfillDateText(date) + ' 第 ' + n + ' 笔');
      updateBfBanner();
      resetOcr();
      const sb = $('#editSheet .sheet-body');
      if (sb) sb.scrollTop = 0;
      $('#amountInput').focus();
      return;                            // 不关闭弹层、不跳转
    }

    closeSheet($('#editSheet'), $('#editMask'));
    refreshAll();
  }

  /* ==========================================================
     导入 / 导出
     ========================================================== */
  function download(filename, content, mime) {
    try {
      const blob = new Blob([content], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
      return true;
    } catch (e) {
      // 个别环境（如自动化测试）不支持 createObjectURL，静默失败不影响主流程
      return false;
    }
  }

  function buildJson() {
    return JSON.stringify(
      { app: '轻记账', version: 1, exportedAt: new Date().toISOString(), items: Store.items }, null, 2);
  }

  function buildCsv() {
    const head = ['日期', '时间', '类型', '大类', '类别', '金额', '备注'];
    const rows = Store.items.map(i => [
      i.date, i.time || '', i.type === 'expense' ? '支出' : '收入',
      i.group || '', i.category || '', (i.type === 'expense' ? '-' : '') + Number(i.amount).toFixed(2),
      (i.note || '').replace(/"/g, '""')
    ].map(v => '"' + v + '"').join(','));
    return '\uFEFF' + [head.map(h => '"' + h + '"').join(',')].concat(rows).join('\r\n');
  }

  function exportJson() {
    if (download('记账备份_' + todayStr() + '.json', buildJson(), 'application/json')) markExported();
    toast('已导出 JSON 备份');
  }

  function exportCsv() {
    if (download('记账明细_' + todayStr() + '.csv', buildCsv(), 'text/csv;charset=utf-8')) markExported();
    toast('已导出 CSV 表格');
  }

  /* ==========================================================
     数据保险：自动快照 + 备份提醒
     ========================================================== */
  function markExported() {
    try { localStorage.setItem(KEY_LASTEXP, String(Date.now())); } catch (e) {}
    renderBackupTip();
    renderSettings();
  }

  function readSnap() {
    try {
      const raw = localStorage.getItem(KEY_SNAP);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return (o && Array.isArray(o.items) && o.items.length) ? o : null;
    } catch (e) { return null; }
  }

  function fmtSnapTime(t) {
    const d = new Date(t || Date.now());
    return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function restoreSnap() {
    const s = readSnap();
    if (!s) { toast('还没有可恢复的快照'); return; }
    showConfirm('恢复到上一状态？',
      '当前 ' + Store.items.length + ' 笔将被替换为快照里的 ' + s.items.length +
      ' 笔（快照生成于 ' + fmtSnapTime(s.t) + '）。','恢复',
      () => {
        Store.replaceAll(s.items.slice());
        refreshAll();
        toast('已恢复到 ' + s.items.length + ' 笔');
      });
  }

  function renderBackupTip() {
    const bar = $('#backupTip');
    if (!bar) return;
    let off = '';
    try { off = localStorage.getItem(KEY_TIPOFF) || ''; } catch (e) {}
    if (!Store.items.length || off === todayStr()) { bar.hidden = true; return; }
    let last = 0;
    try { last = Number(localStorage.getItem(KEY_LASTEXP)) || 0; } catch (e) {}
    if (!last) {
      let min = 0;
      Store.items.forEach(i => { const c = Number(i.createdAt) || 0; if (c && (!min || c < min)) min = c; });
      last = min;
    }
    if (!last) {
      $('#backupTipText').textContent = '还没备份过，建议导出一份 JSON 存好';
      bar.hidden = false;
      return;
    }
    const days = Math.floor((Date.now() - last) / 86400000);
    if (days < 14) { bar.hidden = true; return; }
    $('#backupTipText').textContent = '已 ' + days + ' 天没备份了，建议导出一份 JSON';
    bar.hidden = false;
  }

  function handleImport(file) {
    const reader = new FileReader();
    reader.onload = function () {
      let data;
      try { data = JSON.parse(reader.result); }
      catch (e) { toast('文件解析失败，请选择正确的 JSON 备份'); return; }
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
      if (!list) { toast('备份文件格式不正确'); return; }
      const clean = list.filter(i => i && i.date && typeof i.amount !== 'undefined').map(i => {
        const type = i.type === 'income' ? 'income' : 'expense';
        const meta = findCat(type, i.category);
        return {
          id: i.id || uid(), type: type,
          amount: Math.round((Number(i.amount) || 0) * 100) / 100,
          category: i.category || '其他', group: i.group || meta.group, emoji: i.emoji || meta.emoji,
          date: String(i.date).slice(0, 10), time: i.time || '00:00', note: i.note || '',
          createdAt: i.createdAt || Date.parse(i.date + 'T' + (i.time || '00:00') + ':00') || Date.now()
        };
      });
      if (!clean.length) { toast('备份中没有有效账单'); return; }
      showConfirm('导入 ' + clean.length + ' 笔账单',
        '「合并」保留现有数据并追加；「覆盖」会清空当前 ' + Store.items.length + ' 笔账单。',
        '覆盖导入',
        () => { Store.replaceAll(clean); refreshAll(); toast('已覆盖导入 ' + clean.length + ' 笔'); },
        {
          noText: '合并导入',
          noCb: () => {
            const map = {};
            Store.items.forEach(i => { map[i.id] = 1; });
            const add = clean.filter(i => !map[i.id]);
            Store.replaceAll(Store.items.concat(add));
            refreshAll();
            toast('已合并 ' + add.length + ' 笔');
          }
        });
    };
    reader.readAsText(file);
  }

  /* ==========================================================
     截图 OCR（Tesseract.js 懒加载，离线降级为看图手填）
     ========================================================== */
  let ocrImageUrl = null;
  let ocrReady = false;

  function resetOcr() {
    $('#ocrFile').value = '';
    $('#ocrStatus').hidden = true;
    $('#ocrStatus').className = 'ocr-status';
    $('#ocrStatus').textContent = '';
    $('#ocrPreview').hidden = true;
    if (ocrImageUrl) { URL.revokeObjectURL(ocrImageUrl); ocrImageUrl = null; }
    $('#ocrImg').removeAttribute('src');
    $('#ocrResult').hidden = true;
    $('#ocrResult').innerHTML = '';
    $('#btnOcrRun').disabled = true;
  }

  function loadTesseract(cb) {
    if (window.Tesseract) { cb(null); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    s.onload = () => cb(null);
    s.onerror = () => cb(new Error('load-failed'));
    document.head.appendChild(s);
  }

  /* 从 OCR 文本里解析金额 / 时间 / 商家 */
  function parseBillText(text) {
    const res = { amount: null, type: 'expense', date: null, time: null, merchant: '' };

    // ---- 金额 ----
    let m = text.match(/([-+＋−])\s*[¥￥]?\s*(\d{1,7}(?:[.,]\d{1,2})?)/);
    if (m) {
      res.amount = parseFloat(m[2].replace(/,/g, ''));
      res.type = (m[1] === '+' || m[1] === '＋') ? 'income' : 'expense';
    }
    if (res.amount === null) {
      m = text.match(/[¥￥]\s*(\d{1,7}(?:[.,]\d{1,2})?)/);
      if (m) res.amount = parseFloat(m[1].replace(/,/g, ''));
    }
    if (res.amount === null) {
      const all = text.match(/\d{1,7}\.\d{2}/g) || [];
      if (all.length) {
        const nums = all.map(parseFloat).filter(n => n > 0);
        if (nums.length) res.amount = Math.max.apply(null, nums);
      }
    }
    // 中文金额：如 "一百二十元" 不处理；"合计 23.5" 已被上面覆盖

    // ---- 日期时间 ----
    m = text.match(/(\d{4})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})/);
    if (m) {
      res.date = m[1] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3]));
    } else {
      m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (m) {
        const y = new Date().getFullYear();
        res.date = y + '-' + pad(Number(m[1])) + '-' + pad(Number(m[2]));
      } else {
        m = text.match(/(?:^|\D)(\d{1,2})\s*[-/]\s*(\d{1,2})(?:\D|$)/);
        if (m) {
          const y = new Date().getFullYear();
          res.date = y + '-' + pad(Number(m[1])) + '-' + pad(Number(m[2]));
        }
      }
    }
    if (/今天/.test(text)) res.date = todayStr();
    if (/昨天/.test(text)) { const d = new Date(); d.setDate(d.getDate() - 1); res.date = fmtDate(d); }
    if (/前天/.test(text)) { const d = new Date(); d.setDate(d.getDate() - 2); res.date = fmtDate(d); }

    m = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (m) {
      const h = Number(m[1]), mi = Number(m[2]);
      if (h <= 23 && mi <= 59) res.time = pad(h) + ':' + pad(mi);
    }

    // ---- 商家 ----
    const skip = /(微信|支付宝|支付|收款|付款|交易|余额|零钱|账单|明细|状态|方式|成功|完成|金额|时间|订单|单号|备注|扫码|二维码|转账|红包|充值|提现|银行卡|招商|工商|建设|农业|中国银行|信用卡|储蓄卡|服务费|手续费|合计|总计|人民币|¥|￥|元$)/;
    const lines = text.split(/\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const cands = lines.filter(l => {
      if (l.length < 2 || l.length > 24) return false;
      if (skip.test(l)) return false;
      if (/\d{4}/.test(l)) return false;              // 含年份/单号
      if ((l.match(/\d/g) || []).length > l.length / 2) return false; // 数字过多
      if (!/[\u4e00-\u9fa5A-Za-z]/.test(l)) return false;
      return true;
    });
    if (cands.length) {
      // 优先取含常见商户词的行，否则取最长行
      const hot = cands.filter(l => /(店|超市|便利|餐饮|食堂|咖啡|奶茶|茶|饭|面|烧烤|商城|旗舰|官方|公司|科技|有限|市场|药房|医院|地铁|出租|滴滴|美团|饿了么|京东|淘宝|天猫|拼多多|抖音|星巴克|肯德基|麦当劳)/.test(l));
      res.merchant = (hot.length ? hot : cands).sort((a, b) => b.length - a.length)[0].slice(0, 30);
    }
    return res;
  }

  function runOcr() {
    const file = $('#ocrFile').files && $('#ocrFile').files[0];
    if (!file) return;
    const st = $('#ocrStatus');
    st.hidden = false;
    st.className = 'ocr-status';
    st.textContent = '正在加载识别引擎（首次需联网，约十几 MB）…';
    st.innerHTML += '<div class="ocr-progress"><i id="ocrBar"></i></div>';
    $('#btnOcrRun').disabled = true;

    loadTesseract(err => {
      if (err || !window.Tesseract) {
        st.className = 'ocr-status error';
        st.innerHTML = '识别引擎加载失败（可能未联网）。<br>你可以对照上方截图手动填写金额与备注。';
        $('#btnOcrRun').disabled = false;
        return;
      }
      st.innerHTML = '正在识别文字…<div class="ocr-progress"><i id="ocrBar"></i></div>';
      window.Tesseract.recognize(file, 'chi_sim+eng', {
        logger: m => {
          const bar = $('#ocrBar');
          if (bar && m && typeof m.progress === 'number') {
            bar.style.width = Math.round(m.progress * 100) + '%';
            if (m.status && m.status.indexOf('recognizing') >= 0) return;
          }
        }
      }).then(({ data }) => {
        const text = (data && data.text) || '';
        $('#ocrBar') && ($('#ocrBar').style.width = '100%');
        if (!text.trim()) {
          st.className = 'ocr-status error';
          st.textContent = '没能识别出文字，请对照截图手动填写。';
          $('#btnOcrRun').disabled = false;
          return;
        }
        const r = parseBillText(text);
        st.className = 'ocr-status';
        st.textContent = '识别完成，已填入下方表单，请核对后选择类别保存。';

        const rows = [];
        if (r.amount !== null) rows.push(['金额', (r.type === 'income' ? '+' : '-') + money(r.amount)]);
        if (r.merchant) rows.push(['商家 / 备注', r.merchant]);
        if (r.date) rows.push(['日期', r.date]);
        if (r.time) rows.push(['时间', r.time]);
        $('#ocrResult').hidden = false;
        $('#ocrResult').innerHTML = rows.length
          ? rows.map(x => '<div class="ocr-result-row"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('')
          : '<div class="ocr-result-row"><span>未识别到有效信息</span><b>请手动填写</b></div>';

        // 填入表单（类别仍需用户手动选择）
        if (r.amount !== null) {
          $('#amountInput').value = r.amount.toFixed(2);
          setType(r.type);
        }
        if (r.merchant) $('#noteInput').value = r.merchant;
        if (r.date) $('#dateInput').value = r.date;
        if (r.time) $('#timeInput').value = r.time;
        if (backfillMode && r.date) rememberBackfillDate(r.date);
        updateBfBanner();               // 补账模式下同步顶部日期提示
        $('#btnOcrRun').disabled = false;
      }).catch(e => {
        st.className = 'ocr-status error';
        st.textContent = '识别失败：' + (e && e.message ? e.message : '未知错误') + '。可对照截图手动填写。';
        $('#btnOcrRun').disabled = false;
      });
    });
  }

  /* ==========================================================
     演示数据
     ========================================================== */
  function genDemo() {
    const now = new Date();
    const mk = fmtDate(now).slice(0, 7);
    const dim = now.getDate();
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const demo = [];
    const expPool = ['午餐', '早餐', '晚餐', '饮料奶茶', '水果', '零食', '公交地铁', '打车',
                     '电商', '超市', '日用品', '话费', '电影', '书籍', '药品', '房租'];
    const notes = ['食堂二楼麻辣烫', '便利店买的', '和同事拼单', '地铁通勤', '团购券', '', '充话费', '周末看电影'];
    for (let d = 1; d <= dim; d++) {
      const date = mk + '-' + pad(d);
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const cat = pick(expPool);
        const meta = findCat('expense', cat);
        demo.push({
          id: uid(), type: 'expense', amount: Math.round((Math.random() * 88 + 6) * 100) / 100,
          category: cat, group: meta.group, emoji: meta.emoji,
          date: date, time: pad(8 + Math.floor(Math.random() * 12)) + ':' + pad(Math.floor(Math.random() * 60)),
          note: pick(notes), createdAt: Date.parse(date + 'T12:00:00') + k * 1000
        });
      }
      if (d === 1 || d === 15) {
        const meta = findCat('income', '工资');
        demo.push({
          id: uid(), type: 'income', amount: d === 1 ? 9800 : 2400,
          category: d === 1 ? '工资' : '兼职', group: meta.group, emoji: meta.emoji,
          date: date, time: '10:00', note: d === 1 ? '本月工资' : '周末兼职', createdAt: Date.parse(date + 'T10:00:00')
        });
      }
    }
    Store.replaceAll(demo);
    refreshAll();
    toast('已生成 ' + demo.length + ' 笔演示账单');
  }

  /* ==========================================================
     刷新 & 视图切换
     ========================================================== */
  function refreshAll() {
    renderHome();
    renderList();
    renderStats();
    renderSettings();
    renderBackupTip();
  }

  function renderSettings() {
    $('#setTotal').textContent = Store.items.length + ' 笔';
    let size = 0;
    try { size = (localStorage.getItem(KEY_ITEMS) || '').length; } catch (e) {}
    $('#setSize').textContent = (size / 1024).toFixed(1) + ' KB';
    const dates = Store.items.map(i => i.date).sort();
    $('#setFirst').textContent = dates.length ? dates[0] : '—';

    let last = 0;
    try { last = Number(localStorage.getItem(KEY_LASTEXP)) || 0; } catch (e) {}
    if ($('#setBackup')) {
      $('#setBackup').textContent = last
        ? fmtDate(new Date(last)) + '（' + Math.floor((Date.now() - last) / 86400000) + ' 天前）'
        : '从未备份';
    }
    const snap = readSnap();
    const btn = $('#btnRestoreSnap');
    if (btn) {
      btn.hidden = !snap;
      if (snap && $('#snapEm')) $('#snapEm').textContent = snap.items.length + ' 笔 · ' + fmtSnapTime(snap.t);
    }
    syncThemePicker();
  }

  /* 把主题选择器同步到当前主题（纯展示，不改数据） */
  function syncThemePicker() {
    const t = currentTheme();
    $$('#themePick .theme-opt').forEach(b => {
      const on = b.getAttribute('data-theme') === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const now = $('#themeNow');
    if (now) now.textContent = THEME_LABEL[t];
  }

  function switchView(name) {
    ['home', 'list', 'stats'].forEach(v => { $('#view-' + v).hidden = (v !== name); });
    $$('.tab[data-view]').forEach(t => t.classList.toggle('active', t.getAttribute('data-view') === name));
    $('#main').scrollTop = 0;
    if (name === 'stats') renderStats();
    if (name === 'list') renderList();
    catLoading(360);                   // 切页时的一排猫爪脚印（仅猫咪风格可见）
  }

  /* ==========================================================
     事件绑定
     ========================================================== */
  function bindEvents() {
    // Tab
    $$('.tab[data-view]').forEach(t => {
      t.addEventListener('click', () => switchView(t.getAttribute('data-view')));
    });
    $('#btnAdd').addEventListener('click', () => openEdit(null));
    // 首页两个并列入口：记一笔（今天，行为完全不变） / 补账单（历史日期，可连续补）
    if ($('#btnQuickAdd')) $('#btnQuickAdd').addEventListener('click', () => openEdit(null));
    if ($('#btnBackfill')) $('#btnBackfill').addEventListener('click', () => openEdit(null, true));
    $('#btnMine').addEventListener('click', () => { renderSettings(); openSheet($('#setSheet'), $('#setMask')); });
    $('#btnSettings').addEventListener('click', () => { renderSettings(); openSheet($('#setSheet'), $('#setMask')); });
    $('#btnSeeAll').addEventListener('click', () => switchView('list'));

    // 主题选择（纯视觉：点一下立即切换，无需刷新，选择被记住，数据完全不动）
    $$('#themePick .theme-opt').forEach(b => {
      b.addEventListener('click', () => {
        const next = b.getAttribute('data-theme') === 'cat' ? 'cat' : 'min';
        if (next === currentTheme()) { toast('当前已是' + THEME_LABEL[next]); return; }
        setTheme(next);
        toast('已切换到' + THEME_LABEL[next]);
      });
    });
    // 「小猫模式」猫爪拨杆（与主题选择卡等价：开=粉色猫爪，关=灰色猫爪）
    if ($('#pawSwitchRow')) {
      const toggleTheme = () => {
        const next = currentTheme() === 'cat' ? 'min' : 'cat';
        setTheme(next);
        toast('已切换到' + THEME_LABEL[next]);
      };
      $('#pawSwitchRow').addEventListener('click', toggleTheme);
      $('#pawSwitchRow').addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTheme(); }
      });
    }

    // 小猫主题彩蛋：点「本月概览」两侧的猫（极简主题下这两只猫不存在，点不到）
    $$('.month-cat').forEach(el => {
      const k = el.classList.contains('month-cat-l') ? 'l' : 'r';
      el.addEventListener('click', () => catPop(k));
    });

    // 小猫主题下，空状态可点击直接去记账
    if ($('#recentEmpty')) {
      $('#recentEmpty').addEventListener('click', () => {
        if (catOn() && !Store.items.length) $('#btnAdd').click();
      });
    }

    // 关闭弹层（补账模式在此退出，下次打开按入口重新判定）
    $('#btnCancelEdit').addEventListener('click', closeEditSheet);
    $('#btnCloseSet').addEventListener('click', () => closeSheet($('#setSheet'), $('#setMask')));
    $('#editMask').addEventListener('click', closeEditSheet);
    $('#setMask').addEventListener('click', () => closeSheet($('#setSheet'), $('#setMask')));

    // 保存 / 删除
    $('#btnSaveEdit').addEventListener('click', saveEdit);
    $('#btnDeleteEdit').addEventListener('click', () => { const id = editId; closeSheet($('#editSheet'), $('#editMask')); setTimeout(() => askDelete(id), 280); });

    // 类型切换
    $$('#typeSeg .type-item').forEach(b => {
      b.addEventListener('click', () => setType(b.getAttribute('data-type')));
    });

    // 金额输入过滤（两位小数）
    $('#amountInput').addEventListener('input', e => {
      let v = e.target.value.replace(/[^\d.]/g, '').replace(/\.{2,}/g, '.');
      if (v.indexOf('.') >= 0) { const p = v.split('.'); v = p[0] + '.' + p[1].slice(0, 2); }
      if (v.length > 1 && v[0] === '0' && v[1] !== '.') v = v.replace(/^0+/, '') || '0';
      if (v.length > 10) v = v.slice(0, 10);
      if (v !== e.target.value) e.target.value = v;
    });
    $('#amountInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); });

    // 快捷日期
    $$('.chip[data-offset]').forEach(b => {
      b.addEventListener('click', () => {
        const d = new Date();
        d.setDate(d.getDate() - Number(b.getAttribute('data-offset')));
        const ds = fmtDate(d);
        $('#dateInput').value = ds;
        $$('.chip[data-offset]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        if (backfillMode) { rememberBackfillDate(ds); updateBfBanner(); }
      });
    });
    $('#dateInput').addEventListener('change', () => {
      $$('.chip[data-offset]').forEach(x => x.classList.remove('active'));
      // 补账模式下：记住所选日期并同步顶部提示（普通记账不记录，行为不变）
      if (backfillMode) { rememberBackfillDate($('#dateInput').value); updateBfBanner(); }
    });
    // 补账：一键回到今天
    if ($('#btnBfToday')) {
      $('#btnBfToday').addEventListener('click', () => {
        const t = todayStr();
        $('#dateInput').value = t;
        if (backfillMode) { rememberBackfillDate(t); updateBfBanner(); }
        toast('已回到今天 ' + t);
      });
    }

    // 列表筛选 / 搜索
    $$('#filterSeg .seg-item').forEach(b => {
      b.addEventListener('click', () => {
        listFilter = b.getAttribute('data-filter');
        $$('#filterSeg .seg-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderList();
      });
    });
    $('#searchInput').addEventListener('input', e => { listQuery = e.target.value.trim(); renderList(); });

    // 统计月份切换
    $('#prevMonth').addEventListener('click', () => shiftMonth(-1));
    $('#nextMonth').addEventListener('click', () => shiftMonth(1));

    // 备份
    $('#btnExportJson').addEventListener('click', exportJson);
    $('#btnExportCsv').addEventListener('click', exportCsv);
    if ($('#btnRestoreSnap')) $('#btnRestoreSnap').addEventListener('click', restoreSnap);
    if ($('#btnBackupNow')) $('#btnBackupNow').addEventListener('click', exportJson);
    if ($('#btnBackupLater')) $('#btnBackupLater').addEventListener('click', () => {
      try { localStorage.setItem(KEY_TIPOFF, todayStr()); } catch (e) {}
      $('#backupTip').hidden = true;
      toast('今天不再提醒，可在设置里手动导出');
    });
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) handleImport(f);
      e.target.value = '';
    });
    $('#btnClearAll').addEventListener('click', () => {
      showConfirm('清空全部账单？', '共 ' + Store.items.length + ' 笔记录将被删除，且无法恢复。建议先导出备份。', '确认清空', () => {
        Store.replaceAll([]);
        refreshAll();
        toast('已清空');
      }, { cat: 'cry' });
    });
    $('#btnDemo').addEventListener('click', () => {
      showConfirm('生成演示账单？', '会覆盖当前全部数据，用于快速体验图表效果。', '生成', () => genDemo());
    });

    // 安装到桌面（安卓 Chrome 支持一键安装，iOS 走分享菜单）
    setupInstall();

    // 确认框按钮
    $('#confirmYes').addEventListener('click', () => {
      const c = confirmCb; hideConfirm(); if (c) c();
    });
    $('#confirmNo').addEventListener('click', () => {
      const c = confirmNoCb; hideConfirm(); if (c) c();
    });
    $('#confirmMask').addEventListener('click', hideConfirm);

    // OCR
    $('#btnOcrToggle').addEventListener('click', () => {
      const p = $('#ocrPanel');
      p.hidden = !p.hidden;
      $('#btnOcrToggle').classList.toggle('open', !p.hidden);
    });
    $('#ocrFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (ocrImageUrl) URL.revokeObjectURL(ocrImageUrl);
      ocrImageUrl = URL.createObjectURL(f);
      $('#ocrImg').src = ocrImageUrl;
      $('#ocrPreview').hidden = false;
      $('#btnOcrRun').disabled = false;
      const st = $('#ocrStatus');
      st.hidden = false; st.className = 'ocr-status';
      st.textContent = '截图已就绪，点击「开始识别」自动填表；也可边看截图边手动填写。';
      $('#ocrResult').hidden = true;
    });
    $('#btnOcrRun').addEventListener('click', runOcr);

    // 滚动阴影
    $('#main').addEventListener('scroll', () => {
      $('#topbar').classList.toggle('scrolled', $('#main').scrollTop > 4);
    }, { passive: true });

    // 键盘避让
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboard);
      window.visualViewport.addEventListener('scroll', syncKeyboard);
    }

    // 底部导航溢出自我修正：窗口/视口尺寸变化后重新量一次
    let guardTick = 0;
    const queueGuard = () => {
      if (guardTick) return;
      guardTick = requestAnimationFrame(() => { guardTick = 0; guardBottomOverflow(); });
    };
    window.addEventListener('resize', queueGuard);
    window.addEventListener('orientationchange', () => setTimeout(guardBottomOverflow, 350));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueGuard);
      window.visualViewport.addEventListener('scroll', queueGuard);
    }
  }

  function shiftMonth(delta) {
    const p = statMonth.split('-');
    let y = Number(p[0]), m = Number(p[1]) + delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    statMonth = y + '-' + pad(m);
    renderStats();
  }

  /* ==========================================================
     添加到桌面：iOS 走分享菜单，安卓 Chrome 支持一键安装
     ========================================================== */
  let deferredPrompt = null;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    // 部分安卓 WebView / 测试环境没有 matchMedia，需容错
    if (window.navigator.standalone === true) return true;
    if (typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.matchMedia('(display-mode: fullscreen)').matches;
    } catch (e) { return false; }
  }

  function setupInstall() {
    const btn = $('#btnInstall'), tip = $('#installTip'), em = $('#installEm');
    if (!btn || !tip) return;

    if (isStandalone()) {
      tip.textContent = '已经添加到桌面，当前就是全屏模式，断网也能直接打开。';
      btn.hidden = true;
      return;
    }

    // 安卓 / 桌面 Chrome：捕获安装事件，实现真正的一键安装
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      btn.hidden = false;
      if (em) em.textContent = '一键安装';
      tip.textContent = '点上面的按钮即可安装到桌面；也可以从浏览器右上角「⋮」菜单选择「安装应用」或「添加到主屏幕」。';
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      btn.hidden = true;
      tip.textContent = '安装成功，从桌面图标打开即可全屏使用。';
      toast('已添加到桌面');
      try { localStorage.setItem('qing_ledger_tip', '1'); } catch (e) {}
    });

    btn.addEventListener('click', () => {
      if (deferredPrompt) {
        const p = deferredPrompt;
        deferredPrompt = null;
        p.prompt();
        if (p.userChoice && p.userChoice.then) {
          p.userChoice.then(r => { if (r && r.outcome === 'accepted') btn.hidden = true; }).catch(() => {});
        }
        return;
      }
      toast(isIOS() ? 'Safari 底部「分享」→「添加到主屏幕」'
                    : '浏览器右上角「⋮」→「安装应用 / 添加到主屏幕」');
    });

    // 未触发安装事件时，仍保留按钮，点击后提示该系统的操作路径
    if (!deferredPrompt) {
      if (em) em.textContent = '查看步骤';
      tip.textContent = isIOS()
        ? 'iPhone：用 Safari 打开本页 → 底部「分享」→「添加到主屏幕」。（必须是 Safari，微信/Chrome 内不支持）'
        : '安卓：Chrome 右上角「⋮」→「安装应用」或「添加到主屏幕」；不同浏览器叫法略有差异。';
    }
  }

  /* ==========================================================
     初始化 + Service Worker
     ========================================================== */
  /* ==========================================================
     底部安全区兜底
     个别内嵌浏览器（微信 / 部分第三方 WebView）不返回 env(safe-area-inset-*)，
     会让底部导航贴到屏幕最下沿、被 Home 指示条遮住。
     这里实测一次：若 env() 读到 0 但设备确实是带 Home 指示条的 iPhone，
     就补一个经验值（34px）写进 --safe-b，CSS 会用它撑起底部导航。
     ⚠️ env() 正常时不写任何值，完全交给 CSS，不会改变非 iOS 设备的表现。
     ========================================================== */
  function measureSafeInsetBottom() {
    const probe = document.createElement('i');
    probe.style.cssText =
      'position:fixed;left:-9999px;bottom:0;width:0;visibility:hidden;pointer-events:none;' +
      'height:env(safe-area-inset-bottom,0px);height:constant(safe-area-inset-bottom);';
    document.body.appendChild(probe);
    const v = probe.getBoundingClientRect().height || 0;
    probe.parentNode.removeChild(probe);
    return v;
  }

  function applySafeAreaFallback() {
    try {
      const root = document.documentElement;
      if (measureSafeInsetBottom() > 0) { root.style.removeProperty('--safe-b'); return; }
      if (!isIOS()) return;                        // 安卓没有 Home 指示条，无需补
      const h = Math.max(window.screen.width || 0, window.screen.height || 0);
      if (h < 812) return;                         // iPhone 8 / SE 等无指示条机型
      root.style.setProperty('--safe-b', '34px');  // Home 指示条标准高度
    } catch (e) { /* 纯兜底：失败不影响任何功能 */ }
  }

  /* 底部溢出自我修正
     少数浏览器（iOS Safari 的底部工具栏、内嵌 WebView）会让「布局高度」大于「真正可见
     的高度」，底部导航就有一截被顶到屏幕外、文字被切掉。这里用 visualViewport 实测可见
     高度：只有真的被压住时才把 .app 压到可见高度，平时完全不介入（不写任何内联样式）。
     ========================================================== */
  function guardBottomOverflow() {
    try {
      const vv = window.visualViewport;
      if (!vv) return;                                   // 老浏览器：交给 CSS
      const app = document.querySelector('.app');
      const bar = document.querySelector('#tabbar');
      if (!app || !bar) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return; // 输入法弹出时不是布局问题
      const visibleBottom = vv.offsetTop + vv.height;
      const over = bar.getBoundingClientRect().bottom - visibleBottom;
      if (over > 2) app.style.setProperty('--app-h', Math.round(visibleBottom) + 'px');
      else app.style.removeProperty('--app-h');
    } catch (e) { /* 纯兜底：失败不影响任何功能 */ }
  }

  function init() {
    Store.load();
    applyTheme(currentTheme());     // 极简（默认）/ 小猫：只切 <html> 的主题类
    applySafeAreaFallback();        // 底部安全区兜底（不返回 env() 的内嵌浏览器）
    guardBottomOverflow();          // 底部溢出自我修正（布局高于可见高度时）
    setTimeout(guardBottomOverflow, 400);
    bindEvents();
    setType('expense');
    $('#dateInput').value = todayStr();
    $('#timeInput').value = nowTime();
    refreshAll();
    switchView('home');
    catLoading(900);                // 首屏加载时的一排猫爪脚印（仅猫咪风格可见）

    // 更新提示：SW 接管后如有新版本
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 忽略：不影响离线外的功能 */ });
    }

    // 首次访问提示添加到主屏幕（按系统给出对应路径）
    try {
      if (!localStorage.getItem('qing_ledger_tip') && !isStandalone()) {
        localStorage.setItem('qing_ledger_tip', '1');
        setTimeout(() => toast(isIOS() ? 'Safari「分享」→「添加到主屏幕」可全屏使用'
                                      : '浏览器菜单 →「安装应用」可添加到桌面'), 2600);
      }
    } catch (e) {}

    // 跨标签页同步
    window.addEventListener('storage', e => {
      if (e.key === KEY_ITEMS) { Store.load(); refreshAll(); }
      if (e.key === KEY_THEME) applyTheme(currentTheme());
    });

    // 旋转 / 尺寸变化后重新确认安全区（横竖屏 Home 指示条位置不同）
    window.addEventListener('resize', applySafeAreaFallback);
    window.addEventListener('orientationchange', () => setTimeout(applySafeAreaFallback, 300));

    // 调试 / 自动化测试接口 + 供 importer.js 使用的扩展 API
    window.Ledger = {
      version: 1,
      CATEGORIES: CATEGORIES,
      parseBillText: parseBillText,
      monthStats: monthStats,
      buildCsv: buildCsv,
      buildJson: buildJson,
      items: () => Store.items.slice(),
      store: Store,
      // --- 给通用账单导入用（只新增能力，不改动现有逻辑）---
      toast: toast,
      confirm: showConfirm,
      download: download,
      markExported: markExported,
      refresh: refreshAll,
      catLoading: catLoading,
      findCat: findCat,
      uid: uid,
      addItems(list) {
        list.forEach(i => Store.items.push(i));
        Store.sort(); Store.save(); refreshAll();
        return list.length;
      },
      removeIds(ids) {
        const set = {}; ids.forEach(id => { set[id] = 1; });
        Store.items = Store.items.filter(i => !set[i.id]);
        Store.save(); refreshAll();
      },
      // --- 数据保险 ---
      readSnap: readSnap,
      restoreSnap: restoreSnap,
      renderBackupTip: renderBackupTip,
      // --- 主题（极简 / 小猫） ---
      theme: currentTheme,
      setTheme: setTheme,
      themeLabel: t => THEME_LABEL[(t === 'cat') ? 'cat' : 'min'],
      catOn: catOn,                       // 兼容旧接口：等价于「小猫主题」
      setCat(on) { setTheme(on ? 'cat' : 'min'); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
