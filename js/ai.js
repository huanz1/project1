/* AI 助手前端模块（第 7 天「AI 能力集成」接入）
 *
 * 设计要点：
 * 1. 前端只调用本项目服务端 /api/ai/* 代理，API Key 在服务端环境变量里，浏览器不接触密钥；
 * 2. 所有失败都有兜底文案（未配置/超时/额度/限流/网络），界面上给明确的降级提示；
 * 3. 用量统计（C1 挑战）：调用量、token 估算、成本累计存 localStorage。
 */
const AI = {
  /* 估算单价（元 / 1k tokens），示例价目（doubao-pro 档），以实际平台官网为准，可在此调整 */
  PRICES: { in: 0.0008, out: 0.002 },

  /* 服务端健康检查：static 托管（GitHub Pages）下会失败 → 前端显示“不可用”而不是报错崩溃 */
  async health() {
    try {
      const r = await fetch('/api/health', { headers: { 'Content-Type': 'application/json' } });
      const d = await r.json();
      return { ok: true, configured: !!(d && d.ai && d.ai.configured), model: d && d.ai && d.ai.model };
    } catch (e) {
      return { ok: false, configured: false };
    }
  },

  /* 点位①：台账周报。summary 由看板数据组装（设备数、各设备预约数、时段分布、有效预约明细摘要） */
  async weeklyReport(summary) {
    return this._post('/api/ai/weekly-report', { summary });
  },

  /* 点位②：自然语言查询。question 用户原话；context 当前设备+预约数据 */
  async ask(question, context) {
    return this._post('/api/ai/query', { question, context });
  },

  async _post(url, payload) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { ok: false, code: 'NETWORK', message: '无法连接 AI 代理服务' };
    }
    let d = {};
    try { d = await r.json(); } catch (e) { /* 非 JSON 响应按上游错误处理 */ }
    if (!d.ok) return { ok: false, code: d.code || 'AI_UPSTREAM', message: d.message || ('HTTP ' + r.status) };
    return {
      ok: true,
      text: d.report || d.answer || '',
      usage: d.usage || null,
      /* 上游没回 usage 时按文本长度估算（中文 1 字≈1 token，英文≈1 token/4 字符） */
      estIn: this.estimateTokens(JSON.stringify(payload)),
      estOut: this.estimateTokens(d.report || d.answer || ''),
    };
  },

  /* 记录一次调用并返回聚合用量（C1 挑战） */
  recordCall(rec) {
    Store.recordAICall({
      ok: !!rec.ok,
      tokensIn: rec.usage && rec.usage.prompt_tokens ? rec.usage.prompt_tokens : (rec.estIn || 0),
      tokensOut: rec.usage && rec.usage.completion_tokens ? rec.usage.completion_tokens : (rec.estOut || 0),
    });
  },

  getUsage() {
    const s = Store.getAIStats();
    const cost = s.tokensIn / 1000 * this.PRICES.in + s.tokensOut / 1000 * this.PRICES.out;
    return {
      calls: s.calls, okCalls: s.okCalls, failCalls: s.failCalls,
      tokensIn: s.tokensIn, tokensOut: s.tokensOut,
      estCost: Math.round(cost * 10000) / 10000,
    };
  },

  /* token 粗估：CJK 每字 1 token，其余每 4 字符 1 token */
  estimateTokens(text) {
    const s = String(text || '');
    const cjk = (s.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const rest = s.length - cjk;
    return cjk + Math.ceil(rest / 4);
  },

  /* 失败码 → 人话兜底文案（界面直接展示） */
  fallbackText(code) {
    switch (code) {
      case 'AI_NOT_CONFIGURED':
        return 'AI 服务未配置：当前多为静态托管模式（GitHub Pages），AI 功能需要在本地或服务器运行 node server/server.js 并设置 AI_API_KEY 后使用（详见 docs/部署手册.md）。';
      case 'AI_TIMEOUT':
        return 'AI 响应超时（30 秒），请稍后重试；连续超时请检查模型服务状态。';
      case 'AI_QUOTA':
        return 'AI 额度用尽或触发限流，请前往模型平台查看配额/充值后重试。';
      case 'AI_AUTH':
        return '服务端 API Key 无效，请检查 server 环境变量 AI_API_KEY 配置。';
      case 'NETWORK':
        return '无法连接 AI 代理服务：请确认已启动 node server/server.js（端口一致）。';
      default:
        return 'AI 服务暂时不可用，请稍后重试。';
    }
  },
};
