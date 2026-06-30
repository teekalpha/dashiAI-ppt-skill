// JAD-182:theme04 的 per-theme 控件特例描述符。
export const overrides = {
  // 这些控件类型在 theme04 里过滤掉(不暴露给侧边栏)
  removeControlTypes: ['text', 'string', 'input', 'url', 'email', 'textarea', 'multiline', 'list', 'array', 'object', 'section'],
  swatchKeys: ['accentTone'],
};
