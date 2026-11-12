/* ==========================================================
   轻记账 · Service Worker
   预缓存 App Shell，实现添加到主屏幕后离线可用
   ========================================================== */
const CACHE = 'qing-ledger-v19';   // v19：分享码 Cookie 过期/链接失效时（403），导航与静态资源回落缓存，App 仍可从图标打开
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './importer.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  // 猫咪风格素材（全部 WebP，单张 ≤ 20KB，合计约 65KB；白底图在界面上用
  // mix-blend-mode:multiply 融进浅色背景）
  './cat/cat-bg.webp',        // 猫咪网格底纹（10% 透明 + 模糊）
  './cat/cat01.webp',         // 灰猫（概览 tab / 统计图表）
  './cat/cat02.webp',         // 橘猫（明细 tab / 首页标题）
  './cat/cat03.webp',         // 米色猫（记一笔 tab / 首页大卡）
  './cat/cat04.webp',         // 白异瞳猫（统计 tab）
  './cat/cat05.webp',         // 灰猫两缕毛（记一笔页顶部）
  './cat/cat06.webp',         // 灰白猫（补账单页顶部）
  './cat/cat07.webp',         // 米色大眼猫（明细页搜索框旁）
  './cat/cat08.webp',         // 白猫蓝眼妆
  './cat/cat09.webp',         // 灰猫微笑（空状态 / 导入向导）
  './cat/cat10.webp',         // 黑猫（我的 tab / 设置页顶部）
  './cat/cat-paw.webp',       // 猫爪（金额旁 / 日期旁 / 柱顶 / 拨杆 / 加载动画）
  './cat/cat-new-cone.webp',     // 明细页空状态：甜筒猫（灰白小猫 + 头顶草莓华夫冰淇淋蛋筒，抠白底透明）
  './cat/cat-new-tricolor.webp', // 首页「本月概览」标题左侧：灰/米/白三色猫（已抠透明底，multiply 仅作保险）
  './cat/cat-new-black.webp',    // 首页「本月概览」标题右侧：黑色猫头（透明底 PNG）
  './cat/keychain-smile.webp',// 记账成功 Toast：眯眼笑钥匙扣
  './cat/keychain-cry.webp'   // 删除确认弹窗：委屈哭钥匙扣
];

// 安装：预缓存
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {
        // 单个资源失败不影响整体安装
        return Promise.all(ASSETS.map(u => c.add(u).catch(() => null)));
      }))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 请求策略：
//  - 导航请求：网络优先；网络失败 **或返回 403/404/5xx** 都回落缓存首页
//  - 同源静态资源：网络优先；网络失败或非 200 且本地有缓存时回落缓存
//    ⚠️ 必须保持「网络优先」。若改成「缓存优先」，用户打开应用时
//    HTML 拿到的是最新版、而 app.js / app.css 却返回上一次缓存的旧版，
//    两者版本错配会导致「按钮点了没反应、界面错乱」这类故障。
//    v19 起额外处理 403：托管层用分享码 Cookie（__wb_rsc，30 天）授权，
//    Cookie 过期后裸链接一律返回 403「链接不完整」。此时若直接把这个错误页
//    给用户，明明缓存里有完整 App 也打不开；所以 403 也回落缓存，
//    桌面图标/旧链接因此不再受 Cookie 是否过期影响。
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨域（OCR 引擎 CDN）直接放行，不做缓存
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        // 200/3xx：正常用网络的最新版
        if (res && res.ok) return res;
        // 403（分享码 Cookie 过期 / 链接缺参数）、404、5xx：别把错误页给用户，
        // 直接用缓存的 App Shell 打开 —— 桌面图标因此不再依赖链接是否有效
        const cached = await caches.match('./index.html') || await caches.match('./');
        return cached || res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  e.respondWith(
    fetch(req).then(res => {
      // 只缓存成功的同源响应
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }
      // 非 200 时，若本地有缓存就先用缓存（同样是分享码失效场景的兜底）
      if (res && !res.ok && res.type === 'basic') {
        return caches.match(req).then(r => r || res);
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
