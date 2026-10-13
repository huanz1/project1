#!/usr/bin/env node
/*
 * 实验室设备预约系统 · AI 代理服务（第 7 天「AI 能力集成」接入）
 *
 * 零依赖：只需 Node >= 18（内置 fetch），无需 npm install。
 * 职责：
 *   1) 托管静态前端（等价 python -m http.server，只读静态服务）；
 *   2) /api/ai/* 代理：LLM 的 API Key 只存在于本服务的环境变量中，前端浏览器不接触密钥。
 *
 * 配置（环境变量，缺省时 AI 接口返回 503，前端自动降级提示）：
 *   AI_API_KEY   必填。LLM 平台 API Key（火山引擎方舟 / 阿里云百炼 / 硅基流动均可，均兼容 OpenAI 协议）
 *   AI_API_BASE  选填。OpenAI 兼容接口地址，默认火山引擎方舟
 *   AI_MODEL     选填。模型名，默认 doubao-pro-32k
 *   PORT         选填。服务端口，默认 3000
 *
 * 启动：AI_API_KEY=sk-xxx node server/server.js
 * 安全底线：Key 只走环境变量，严禁写进代码/提交进 Git（见 docs/技术方案.md 成本与安全节）。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..'); // 项目根目录（静态资源根）
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_API_BASE = process.env.AI_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3';
const AI_MODEL = process.env.AI_MODEL || 'doubao-pro-32k';
const AI_TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 1024 * 1024; // 请求体上限 1MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/* ---------- 工具 ---------- */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

/* ---------- LLM 调用（OpenAI 兼容协议） ---------- */
/*
 * 统一错误映射（前端按 code 展示兜底文案）：
 *   AI_NOT_CONFIGURED 服务端没配 Key        → 503
 *   AI_TIMEOUT        上游超时              → 504
 *   AI_QUOTA          额度用尽/限流         → 402
 *   AI_AUTH           Key 无效              → 502
 *   AI_UPSTREAM       上游其他错误          → 502
 *   AI_UNREACHABLE    网络不可达            → 502
 */
async function callLLM(messages) {
  if (!AI_API_KEY) {
    const err = new Error('服务端未配置 AI_API_KEY');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(AI_API_BASE.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_API_KEY,
      },
      body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.3 }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('AI 服务响应超时');
      err.code = 'AI_TIMEOUT';
      throw err;
    }
    const err = new Error('AI 服务网络不可达');
    err.code = 'AI_UNREACHABLE';
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const err = new Error('AI 上游返回 ' + resp.status);
    if (resp.status === 429) err.code = 'AI_QUOTA';
    else if (resp.status === 401 || resp.status === 403) err.code = 'AI_AUTH';
    else err.code = 'AI_UPSTREAM';
    throw err;
  }
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
  const usage = data && data.usage ? data.usage : null;
  if (!content) {
    const err = new Error('AI 上游返回为空');
    err.code = 'AI_UPSTREAM';
    throw err;
  }
  return { content: String(content).trim(), usage };
}

/* ---------- 两个 AI 点位（题库第 5 题定义） ---------- */

/* 点位①：预约台账周报生成 */
function buildWeeklyReportMessages(summary) {
  const sys = '你是高校实验室设备管理助手。根据给定的预约台账汇总数据，写一份简短的中文周报，'
    + '面向实验室管理员。必须包含四节：一、总体使用情况；二、各设备利用率观察'
    + '（点名使用率高和长期闲置的设备，用数据说话）；三、时段分布特征；四、一至两条管理建议。'
    + '只依据给定数据，不要编造数字；全文 400 字以内。';
  const user = '以下是预约台账汇总数据（JSON）：\n' + JSON.stringify(summary);
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

/* 点位②：自然语言查询（如“下周一下午有空闲的投影仪吗”） */
function buildQueryMessages(question, context) {
  const sys = '你是实验室设备预约系统的问答助手。只能根据用户提供的设备与预约数据回答问题，'
    + '禁止编造。若数据不足以回答，直接说明“根据现有数据无法确定”，并告诉用户缺什么信息。'
    + '回答简洁，先给结论再给依据（引用具体设备名/日期/时段）。';
  const user = '数据（JSON）：\n' + JSON.stringify(context) + '\n\n问题：' + question;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

/* ---------- API 路由 ---------- */
async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJSON(res, 200, { ok: true, ai: { configured: !!AI_API_KEY, model: AI_MODEL } });
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/weekly-report') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: '请求体不是合法 JSON' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: '请求体需为 JSON 对象' });
    }
    if (!body.summary || typeof body.summary !== 'object') {
      return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: '缺少 summary 汇总数据' });
    }
    try {
      const { content, usage } = await callLLM(buildWeeklyReportMessages(body.summary));
      return sendJSON(res, 200, { ok: true, report: content, usage });
    } catch (e) {
      const status = e.code === 'AI_NOT_CONFIGURED' ? 503 : e.code === 'AI_TIMEOUT' ? 504 : e.code === 'AI_QUOTA' ? 402 : 502;
      return sendJSON(res, status, { ok: false, code: e.code || 'AI_UPSTREAM', message: e.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/query') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: '请求体不是合法 JSON' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: '请求体需为 JSON 对象' });
    }
    if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 500) {
      return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: 'question 需为 1-500 字的字符串' });
    }
    if (!body.context || typeof body.context !== 'object') {
      return sendJSON(res, 400, { ok: false, code: 'BAD_REQUEST', message: '缺少 context 数据上下文' });
    }
    try {
      const { content, usage } = await callLLM(buildQueryMessages(body.question.trim(), body.context));
      return sendJSON(res, 200, { ok: true, answer: content, usage });
    } catch (e) {
      const status = e.code === 'AI_NOT_CONFIGURED' ? 503 : e.code === 'AI_TIMEOUT' ? 504 : e.code === 'AI_QUOTA' ? 402 : 502;
      return sendJSON(res, status, { ok: false, code: e.code || 'AI_UPSTREAM', message: e.message });
    }
  }

  return sendJSON(res, 404, { ok: false, code: 'NOT_FOUND', message: '接口不存在' });
}

/* ---------- 静态资源 ---------- */
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { // 防目录穿越
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- 启动 ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      console.error('[leq] 500 SERVER_ERROR:', e && e.stack ? e.stack : e); // 500 必须留服务端日志，否则无栈可查
      if (!res.headersSent) sendJSON(res, 500, { ok: false, code: 'SERVER_ERROR', message: '服务内部错误' });
    });
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, () => {
  console.log('[leq] 静态服务 + AI 代理已启动: http://localhost:' + PORT);
  console.log('[leq] AI 配置: ' + (AI_API_KEY ? ('model=' + AI_MODEL + ' base=' + AI_API_BASE) : '未配置 AI_API_KEY（AI 接口将返回 503，前端降级）'));
});
