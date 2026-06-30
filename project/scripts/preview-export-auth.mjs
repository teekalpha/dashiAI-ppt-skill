// 预览/导出服务器的导出请求鉴权(无副作用,便于单测)。
export function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

// 导出端点会启动 headless Chromium 并写文件,需防跨站/局域网滥用:
// - 带 Origin:必须在允许列表(同源/显式允许的回环与 LAN 地址)。
// - 无 Origin(curl/脚本/顶层导航):仅当服务器绑定在回环时放行;绑 LAN 时拒绝。
export function isExportRequestAllowed({ origin, host, allowedOrigins }) {
  if (origin) return allowedOrigins.has(origin);
  return isLoopbackHost(host);
}
