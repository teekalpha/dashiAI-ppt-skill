// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLayoutContracts,
  describePropShapes,
  isMediaArrayKey,
  isSerializedReactElementLike,
  neutralizeDefaultCopy,
  normalizeSlidePropsForContract,
  reactElementText,
} from '../src/prop-contract-core.mjs';
import {
  resolvePublicPropAliases,
  toPublicProps,
} from '../src/control-naming.mjs';
import {
  GENERATED_THEME_PACKS,
  GENERATED_THEME_PAGES,
} from '../src/components/themes/generated-metadata.js';
import {
  filterAcceptedThemePacks,
  filterAcceptedThemePages,
} from '../src/accepted-themes.mjs';
import { getDecorativeKeys } from '../src/components/themes/decorative-overrides.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const THEME_PACKS = filterAcceptedThemePacks(GENERATED_THEME_PACKS);
export const THEME_PAGES = filterAcceptedThemePages(GENERATED_THEME_PAGES);

const ROLE_KEYWORDS = {
  cover: ['cover', '封面', '首页'],
  statement: ['statement', 'summary', 'overview', 'manifesto', 'quote', '摘要', '主张', '观点', '结论'],
  breakdown: ['contents', 'agenda', 'index', 'directory', '目录', '结构', '纲目'],
  transition: ['section', 'chapter', 'divider', '章节', '序章', '篇章'],
  context: ['market', 'method', 'context', 'industry', '全景', '背景', '方法', '行业'],
  metrics: ['metric', 'stat', 'number', 'score', 'gauge', 'meter', '指标', '数字', '大势', '仪表'],
  trend: ['trend', 'timeline', 'curve', 'area', 'slope', 'stream', '走势', '趋势', '时间', '曲线', '季度'],
  comparison: ['compare', 'versus', 'matrix', 'quadrant', 'delta', 'dumbbell', '对比', '矩阵', '象限', '差距'],
  distribution: ['donut', 'treemap', 'heatmap', 'ranking', 'rank', 'waterfall', 'funnel', 'allocation', 'share', '分布', '占比', '排行', '瀑布', '漏斗'],
  relationship: ['chain', 'flow', 'sankey', 'network', 'orbit', 'ecosystem', 'map', '关系', '链', '流向', '生态', '网络'],
  case: ['case', 'spotlight', 'profile', 'story', '案例', '聚焦', '档案'],
  image: ['image', 'gallery', 'mosaic', 'photo', 'film', 'album', 'poster', 'showcase', '影像', '图景', '图集', '图片', '海报'],
  process: ['process', 'roadmap', 'journey', 'steps', 'gantt', '路径', '流程', '路线', '进程'],
  risks: ['risk', 'faq', 'checklist', '风险', '异议', '问答', '清单'],
  observation: ['quote', 'insight', 'takeaway', 'conclusion', 'statement', 'manifesto', '观点', '洞察', '要点', '结论'],
  ambient: ['ambient', 'atmosphere', 'background', 'immersive', 'poster', 'hero', '氛围', '背景', '沉浸', '海报'],
  actions: ['action', 'roadmap', 'plan', 'join', 'contact', 'next', '行动', '策略', '计划', '套餐'],
  result: ['result', 'outcome', 'score', 'closing', 'conclusion', '成果', '结果', '完成', '结论'],
  team: ['team', 'roster', 'testimonial', 'voice', '团队', '人物', '见证', '证言'],
  closing: ['closing', 'contact', 'join', 'end', 'colophon', '结语', '封底', '行动'],
};

const ROLE_ALIASES = {
  agenda: 'breakdown',
  summary: 'statement',
  insight: 'observation',
  quote: 'observation',
  content: 'content',
  body: 'content',
  main: 'content',
  inner: 'content',
  interior: 'content',
  '正文': 'content',
  '内容': 'content',
  '主体': 'content',
  '内页': 'content',
  chart: 'metrics',
  data: 'metrics',
  timeline: 'trend',
  compare: 'comparison',
  flow: 'process',
  roadmap: 'actions',
  visual: 'image',
  gallery: 'image',
  media: 'image',
  picture: 'image',
  photo: 'image',
  atmosphere: 'ambient',
  background: 'ambient',
  dynamic: 'ambient',
};

const contracts = createLayoutContracts(THEME_PAGES);
const pagesByKey = new Map(THEME_PAGES.map(page => [page.key, page]));
const themePacksByKey = new Map(THEME_PACKS.map(theme => [theme.key, theme]));
const manifest = readManifest();
const HOST_MEDIA_ARRAY_THEMES = new Set(['theme03', 'theme04', 'theme05', 'theme06', 'theme07', 'theme08', 'theme09', 'theme10']);
const NEUTRAL_PLACEHOLDERS = ['请输入文本', '请输入', '请输'];

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next == null || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function compactJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {import('../src/types').ListLayoutsOptions} [options] */
export function listLayouts({
  theme,
  role,
  keyword,
  needsMedia = false,
  plannedImages = false,
  providedImages = false,
  providedMedia = false,
  imageGen = false,
  needsVisual = false,
  mediaCount = null,
  mediaKind = null,
  requireInitialMedia = false,
  limit = 12,
} = {}) {
  const requestedRole = role ? String(role).trim().toLowerCase() : '';
  const normalizedRole = requestedRole ? ROLE_ALIASES[requestedRole] || requestedRole : '';
  const keywords = normalizedRole ? ROLE_KEYWORDS[normalizedRole] || [normalizedRole] : [];
  const keywordText = String(keyword || '').trim().toLowerCase();
  const requestedMediaCount = getRequestedMediaCount({ plannedImages, providedImages, providedMedia, imageGen, needsVisual, mediaCount });
  const normalizedMediaKind = normalizeMediaKind(mediaKind);
  const needsInitialMedia = Boolean(requireInitialMedia || providedImages || providedMedia);
  const requiresMedia = needsMedia || requestedMediaCount > 0 || normalizedRole === 'image' || needsInitialMedia || Boolean(normalizedMediaKind);

  const rows = listLayoutsForMediaCount({ theme, normalizedRole, keywords, keywordText, requiresMedia, requestedMediaCount, normalizedMediaKind, needsInitialMedia });
  return rows.slice(0, Math.max(1, Math.min(50, Number(limit) || 12)));
}

function listLayoutsForMediaCount({ theme, normalizedRole, keywords, keywordText, requiresMedia, requestedMediaCount, normalizedMediaKind, needsInitialMedia }) {
  const rows = THEME_PAGES
    .filter(page => !theme || page.themeKey === theme)
    .filter(page => {
      if (!normalizedRole) return true;
      if (normalizedRole === 'cover') return isCoverCandidate(page.key);
      if (normalizedRole === 'content') return isBodyContentCandidate(page);
      if (normalizedRole === 'image') return inspectLayout(page.key, { compact: true })?.mediaSlots.some(slot => slot.canPresetMedia);
      if (normalizedRole === 'ambient') return hasAmbientBackground(page);
      return pageMatches(page, keywords);
    })
    .filter(page => !keywordText || pageSearchText(page).includes(keywordText))
    .map(page => compactLayoutCandidate(inspectLayout(page.key, { compact: true })))
    .filter(Boolean)
    .filter(row => !requiresMedia || mediaSlotsCanFit(row.mediaSlots, requestedMediaCount || 1, { requireInitialMedia: true, mediaKind: normalizedMediaKind }))
    .filter(row => !requestedMediaCount || mediaSlotsCanFit(row.mediaSlots, requestedMediaCount, { requireInitialMedia: true, mediaKind: normalizedMediaKind }))
    .filter(row => !normalizedMediaKind || mediaSlotsCanFit(row.mediaSlots, requestedMediaCount || 1, { requireInitialMedia: true, mediaKind: normalizedMediaKind }));

  return rows.sort((a, b) => scoreLayout(b, { normalizedRole, keywordText, requiresMedia, requestedMediaCount, normalizedMediaKind, needsInitialMedia }) - scoreLayout(a, { normalizedRole, keywordText, requiresMedia, requestedMediaCount, normalizedMediaKind, needsInitialMedia }));
}

function compactLayoutCandidate(row) {
  if (!row) return row;
  const {
    copyBudgets,
    propShapes,
    fieldContracts,
    copyRoles,
    countBindings,
    defaultVisibleCounts,
    fillPlan,
    ...candidate
  } = row;
  return {
    ...candidate,
    copyKeys: (row.copyKeys || []).slice(0, 8),
    arrayMeta: (row.arrayMeta || []).map(compactCandidateArrayMeta),
    ...(fillPlan ? { fillPlan: compactCandidateFillPlan(fillPlan) } : {}),
  };
}

function compactCandidateArrayMeta(meta) {
  return {
    key: meta.key,
    role: meta.role,
    defaultVisibleCount: meta.defaultVisibleCount,
    maxCount: meta.maxCount,
    countKey: meta.countKey,
  };
}

function compactCandidateFillPlan(plan) {
  return {
    arrays: (plan.arrays || []).slice(0, 4).map(item => ({
      key: item.key,
      role: item.role,
      visibleCount: item.visibleCount,
      maxCount: item.maxCount,
      countKey: item.countKey,
      ...(item.nestedArrays && Object.keys(item.nestedArrays).length ? { nestedArrays: item.nestedArrays } : {}),
    })),
    media: (plan.media || []).slice(0, 2),
  };
}

export function inspectLayout(layout, { compact = false } = {}) {
  const record = getLayoutRecord(layout);
  if (!record) return null;
  const { page, contract, controls, countBindings, lengthBindings, defaultProps } = record;
  const theme = getThemePackMetadata(page.themeKey);
  const controlKeys = controls.map(control => control.key).filter(Boolean);
  const publicControls = controls.map(publicControl);
  const publicControlKeys = publicControls.map(control => control.publicKey).filter(Boolean);
  const mediaSlots = getMediaSlots(record);
  const decorativeKeys = getDecorativeKeys(page.key);
  // copyKeyRoots:顶层文案根(对象 copy 仍是单键),用于 propShapes/copyBudgets 的递归。
  const copyKeyRoots = getCopyKeyRoots(defaultProps, controls, mediaSlots, decorativeKeys);
  // JAD-212:copyKeys 扁平化(对象 copy 展开成 copy.eyebrow / copy.points[].t),与扁平主题形态一致。
  const copyKeys = expandCopyKeys(defaultProps, copyKeyRoots);
  const arrayKeys = getArrayKeys(defaultProps, mediaSlots);
  const copyBudgets = getCopyBudgets(defaultProps, copyKeyRoots);
  // count 绑定解析到真实数组键(修正 items/stats/data 等静态错配)。
  const resolvedBindings = (countBindings || []).map(binding => ({ ...binding, arrays: resolveBindingArrays(binding, defaultProps) }));
  // JAD-213:arrayMeta 含语义 role;JAD-212:覆盖 copy 内数组并匹配其 count 控件。
  const arrayMeta = buildArrayMeta(defaultProps, countBindings, controls, { withItemRoles: true });
  const copyRoles = buildCopyRoles(copyKeys);
  const fieldContracts = buildFieldContracts({ copyKeys, copyRoles, arrayMeta, decorativeKeys, mediaSlots });
  const fillPlan = buildFillPlan({ copyKeys, copyBudgets, copyRoles, arrayMeta, mediaSlots, defaultProps, controls, lengthBindings });
  // JAD-212:正文全由组件硬编码(count 指向的数组缺席且无可填正文)时标记 contentLocked。
  const contentLockedReason = detectContentLocked({ copyKeys, copyRoles, arrayMeta, resolvedBindings, defaultProps });
  const palette = paletteColorsForLayout(defaultProps);
  const defaultVisibleCounts = Object.fromEntries(countBindings
    .map(binding => [binding.publicKey || binding.key, defaultProps[binding.key] ?? controls.find(control => control.key === binding.key)?.default])
    .filter(([, value]) => value !== undefined));

  const base = {
    layout: page.key,
    theme: page.themeKey,
    themeDisplayName: themeDisplayName(theme, page.themeKey),
    themeScenario: theme?.scenario || null,
    themeAudience: theme?.audience || null,
    pageNumber: page.pageNumber,
    label: page.label,
    slot: page.slot,
    roles: inferRoles(page, mediaSlots),
    copyKeys,
    copyBudgets,
    copyRoles,
    fieldContracts,
    fillPlan,
    ...(decorativeKeys.length ? { decorativeKeys } : {}),
    ...(contentLockedReason ? { contentLocked: true, contentLockedReason } : {}),
    arrayKeys,
    arrayMeta,
    lengthBindings,
    ...(palette ? { paletteColors: palette } : {}),
    mediaSlots,
    countBindings: resolvedBindings,
    controls: publicControls,
    controlKeys,
    publicControlKeys,
    defaultVisibleCounts,
  };

  if (compact) {
    const compactKeys = [...new Set([...copyKeyRoots, ...arrayKeys])];
    const compactArrayMeta = arrayMeta.map(({ itemRoles, ...rest }) => rest);
    return {
      layout: base.layout,
      theme: base.theme,
      themeDisplayName: base.themeDisplayName,
      themeScenario: base.themeScenario,
      themeAudience: base.themeAudience,
      pageNumber: base.pageNumber,
      label: base.label,
      slot: base.slot,
      roles: base.roles,
      copyKeys: base.copyKeys.slice(0, 12),
      copyBudgets: base.copyBudgets,
      copyRoles: base.copyRoles,
      fieldContracts: base.fieldContracts,
      fillPlan: base.fillPlan,
      ...(decorativeKeys.length ? { decorativeKeys } : {}),
      ...(contentLockedReason ? { contentLocked: true, contentLockedReason } : {}),
      arrayKeys: base.arrayKeys.slice(0, 8),
      arrayMeta: compactArrayMeta,
      lengthBindings: base.lengthBindings,
      ...(palette ? { paletteColors: palette } : {}),
      propShapes: describePropShapes(defaultProps, compactKeys),
      mediaSlots: base.mediaSlots.map(compactMediaSlot),
      countBindings: base.countBindings.map(compactCountBinding),
      defaultVisibleCounts: base.defaultVisibleCounts,
    };
  }

  return {
    ...base,
    propShapes: describePropShapes(defaultProps, [...copyKeyRoots, ...arrayKeys]),
    allowedPropKeys: [...new Set([...Object.keys(defaultProps), ...controlKeys, ...mediaSlots.map(slot => slot.field).filter(Boolean)])].sort(),
    allowedPublicPropKeys: [...new Set([...Object.keys(toPublicProps(defaultProps, controls)), ...publicControlKeys, ...mediaSlots.map(slot => slot.field).filter(Boolean)])].sort(),
  };
}

export function normalizeProps(layout, props = {}) {
  const record = getLayoutRecord(layout);
  if (!record) {
    return {
      props: props || {},
      warnings: [],
      errors: [`Unknown layout "${layout}"`],
    };
  }
  const aliasResult = resolvePublicPropAliases(props, record.controls);
  const warnings = unknownPropKeys(record, props).map(key => unknownPropWarning(record, key));
  try {
    const propsWithCountSafety = normalizeSlidePropsForContract(layout, props, record.contract);
    const propsWithDefaults = mergeDefaultArrayTails(propsWithCountSafety, record.defaultProps, aliasResult.props);
    const propsWithMedia = normalizeMediaItems(propsWithDefaults, getMediaSlots(record));
    const placeholderErrors = visibleNeutralPlaceholderErrors(record, propsWithMedia, aliasResult.props);
    return {
      props: propsWithMedia,
      publicProps: toPublicProps(propsWithMedia, record.controls),
      appliedAliases: aliasResult.appliedAliases,
      warnings,
      errors: placeholderErrors,
    };
  } catch (error) {
    return {
      props: props || {},
      publicProps: toPublicProps(props || {}, record.controls),
      appliedAliases: aliasResult.appliedAliases,
      warnings,
      errors: [publicErrorMessage(error.message, record.controls)],
    };
  }
}

function visibleNeutralPlaceholderErrors(record, props = {}, authoredProps = props) {
  const visibleProps = visiblePropsForRecord(record, props, authoredProps);
  const findings = collectNeutralPlaceholderFindings(visibleProps).slice(0, 8);
  if (!findings.length) return [];
  return [`中性占位文案仍在可见 props 中: ${findings.join(', ')}; 请补齐这些可见字段或降低对应 count`];
}

function visiblePropsForRecord(record, props = {}, authoredProps = props) {
  const bindings = visibleCountBindings(record);
  const arrayCounts = new Map();
  for (const binding of bindings) {
    const count = numberOrNull(props[binding.key] ?? props[binding.publicKey]);
    if (count == null) continue;
    for (const arrayKey of binding.arrays || []) arrayCounts.set(arrayKey, count);
  }
  const fallbackCount = fallbackVisibleCount(props, bindings, record.controls);
  return filterVisibleValue(props, '', arrayCounts, fallbackCount, authoredProps);
}

function visibleCountBindings(record) {
  const bindings = new Map();
  const add = binding => {
    if (!binding?.key && !binding?.publicKey) return;
    const key = binding.key || binding.publicKey;
    const current = bindings.get(key) || { ...binding, arrays: [] };
    current.arrays = [...new Set([...(current.arrays || []), ...(binding.arrays || [])])];
    bindings.set(key, current);
  };
  for (const binding of record.countBindings || []) {
    add({ ...binding, arrays: resolveBindingArrays(binding, record.defaultProps) });
  }
  for (const meta of buildArrayMeta(record.defaultProps, record.countBindings, record.controls)) {
    if (!meta.countKey) continue;
    add({ key: meta.countKey, publicKey: meta.countKey, arrays: [meta.key] });
  }
  return [...bindings.values()];
}

function fallbackVisibleCount(props, bindings, controls = []) {
  const countKeys = new Set();
  for (const binding of bindings || []) {
    if (binding.key) countKeys.add(binding.key);
    if (binding.publicKey) countKeys.add(binding.publicKey);
  }
  for (const control of nonMediaCountControls(controls)) {
    if (control.key) countKeys.add(control.key);
    if (control.publicKey) countKeys.add(control.publicKey);
  }
  const counts = [...new Set([...countKeys]
    .map(key => numberOrNull(props[key]))
    .filter(value => value != null))];
  return counts.length === 1 ? counts[0] : null;
}

function filterVisibleValue(value, pathName, arrayCounts, fallbackCount, authoredValue = value) {
  if (Array.isArray(value)) {
    const key = lastPathKey(pathName);
    const explicitCount = arrayCounts.get(pathName) ?? arrayCounts.get(key);
    const authoredCount = Array.isArray(authoredValue) ? authoredValue.length : null;
    const limit = explicitCount ?? (shouldSliceByFallback(key, value, fallbackCount) ? fallbackCount : authoredCount);
    const visible = limit == null ? value : value.slice(0, limit);
    const itemPath = pathName ? `${pathName}[]` : '[]';
    return visible.map((item, index) => filterVisibleValue(item, itemPath, arrayCounts, fallbackCount, authoredValue?.[index]));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey,
    filterVisibleValue(childValue, pathName ? `${pathName}.${childKey}` : childKey, arrayCounts, fallbackCount, authoredValue?.[childKey]),
  ]));
}

function lastPathKey(pathName) {
  return String(pathName || '')
    .split('.')
    .at(-1)
    ?.replace(/\[\]$/, '') || '';
}

function shouldSliceByFallback(key, value, fallbackCount) {
  if (fallbackCount == null || !Array.isArray(value) || value.length <= fallbackCount) return false;
  if (isMediaArrayKey(key)) return false;
  if (/^(items|cards|stats|data|captions|labels|callouts|features|tiles)$/i.test(String(key || ''))) return true;
  return value.slice(fallbackCount).some(containsNeutralPlaceholder);
}

function containsNeutralPlaceholder(item) {
  if (item == null) return false;
  if (typeof item === 'string') return NEUTRAL_PLACEHOLDERS.some(placeholder => item.includes(placeholder));
  if (typeof item !== 'object') return false;
  const text = JSON.stringify(item);
  return NEUTRAL_PLACEHOLDERS.some(placeholder => text.includes(placeholder));
}

function collectNeutralPlaceholderFindings(value, pathName = '') {
  if (typeof value === 'string') {
    return NEUTRAL_PLACEHOLDERS
      .filter(placeholder => value.includes(placeholder))
      .map(placeholder => `${pathName || '<root>'}=${placeholder}`);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNeutralPlaceholderFindings(item, `${pathName}[${index}]`));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => collectNeutralPlaceholderFindings(
    item,
    pathName ? `${pathName}.${key}` : key,
  ));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function publicControl(control) {
  return {
    key: control.key,
    publicKey: control.publicKey || control.key,
    label: control.label || control.publicLabel || control.key,
    type: control.type,
    default: control.default,
    min: control.min,
    max: control.max,
    // UI 渲染提示(如 select/color):随契约暴露,否则 prop-contract-core 写入的 display 形同虚设。
    display: control.display,
  };
}

function compactMediaSlot(slot) {
  const canPresetMedia = slot.initialSrcSupported === true && Boolean(slot.fieldPath);
  return {
    role: slot.role,
    field: slot.field,
    fieldPath: slot.fieldPath,
    writableProp: slot.writableProp || (canPresetMedia ? slot.fieldPath : null),
    countKey: slot.countKey,
    publicCountKey: slot.publicCountKey || slot.countKey,
    defaultCount: slot.defaultCount,
    defaultVisibleCount: slot.defaultVisibleCount ?? slot.defaultCount,
    max: slot.max,
    maxCount: slot.maxCount ?? mediaSlotCapacity(slot),
    accepts: slot.accepts || slot.acceptedKinds,
    acceptedKinds: slot.acceptedKinds,
    itemShape: slot.itemShape,
    valueShape: slot.valueShape,
    initialSrcSupported: slot.initialSrcSupported,
    writeMode: slot.writeMode,
    canPresetMedia,
    presetProp: canPresetMedia ? slot.fieldPath : null,
    emptySlotBehavior: slot.emptySlotBehavior,
  };
}

function compactCountBinding(binding) {
  return {
    key: binding.key,
    publicKey: binding.publicKey || binding.key,
    label: binding.label,
    arrays: binding.arrays,
    min: binding.min,
    max: binding.max,
  };
}

function publicErrorMessage(message, controls = []) {
  let next = String(message || '');
  for (const control of controls || []) {
    if (!control?.key || !control.publicKey || control.key === control.publicKey) continue;
    next = next.replaceAll(control.key, control.publicKey);
  }
  return appendNestedPropSuggestions(next);
}

function unknownPropWarning(record, key) {
  const suggestions = suggestPropAlternatives(record, key);
  const suffix = suggestions.length ? `; try ${suggestions.join(', ')}` : '; run inspect:layout for writable props';
  return `Unknown prop "${key}" for ${record.page.key}${suffix}`;
}

function suggestPropAlternatives(record, key) {
  const candidates = topLevelPropCandidates(record);
  const scored = candidates
    .map(candidate => ({ candidate, score: propSuggestionScore(key, candidate) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .map(item => item.candidate);
  return (scored.length ? scored : candidates).slice(0, 6);
}

function topLevelPropCandidates(record) {
  const details = inspectLayout(record.page.key, { compact: true });
  const allowed = new Set([
    ...Object.keys(record.defaultProps || {}),
    ...record.controls.map(control => control.publicKey || control.key).filter(Boolean),
    ...getMediaSlots(record).map(slot => slot.field).filter(Boolean),
  ]);
  const fromContracts = (details?.fieldContracts || [])
    .filter(item => item.role !== 'decorative')
    .map(item => rootPropKey(item.key))
    .filter(key => allowed.has(key));
  return [...new Set([
    ...fromContracts,
    ...[...allowed].filter(key => !String(key).startsWith('_')),
  ])];
}

function rootPropKey(pathName) {
  return String(pathName || '').split('.')[0].replace(/\[\].*$/, '').replace(/\[\]$/, '');
}

function propSuggestionScore(input, candidate) {
  const key = String(input || '').toLowerCase();
  const value = String(candidate || '').toLowerCase();
  if (!key || !value) return 0;
  if (key === value) return 100;
  if (value.includes(key) || key.includes(value)) return 80;
  const synonyms = propSynonyms(key);
  if (synonyms.includes(value)) return 70;
  return 0;
}

function propSynonyms(key) {
  if (/^(heading|headline|head|subject)$/.test(key)) return ['title'];
  if (/^(img|image|photo|picture|pic|asset|visual)$/.test(key)) return ['images', 'media', 'photos', 'picture'];
  if (/^(text|body|paragraph|copy|description|desc|summary)$/.test(key)) return ['lead', 'lede', 'desc', 'description', 'caption', 'paragraph'];
  if (/^(list|rows|cards|points|bullets)$/.test(key)) return ['items', 'cards', 'points', 'rows'];
  return [];
}

function appendNestedPropSuggestions(message) {
  return String(message || '').replace(
    /(props(?:\.[A-Za-z0-9_$-]+|\[\d+\])*)\.([A-Za-z0-9_$-]+): unknown nested prop; expected ([^;]+)/g,
    (match, parentPath, _badKey, expected) => {
      const keys = String(expected || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 5);
      if (!keys.length) return match;
      const parent = String(parentPath).replace(/\[\d+\]/g, '[]');
      return `${match}; try ${keys.map(key => `${parent}.${key}`).join(', ')}`;
    },
  );
}

export function getMediaSlotsForLayout(layout) {
  const record = getLayoutRecord(layout);
  return record ? getMediaSlots(record) : [];
}

export function mediaSlotsCanFit(slots = [], count = 1, { requireInitialMedia = false, mediaKind = null } = {}) {
  const requested = Math.max(1, Number(count) || 1);
  const normalizedKind = normalizeMediaKind(mediaKind);
  return slots.some(slot => {
    if (!isWritableMediaSlot(slot)) return false;
    if (requireInitialMedia && slot.initialSrcSupported !== true) return false;
    if (normalizedKind && !slotAcceptsKind(slot, normalizedKind)) return false;
    return mediaSlotCapacity(slot) >= requested;
  });
}

export function mediaSlotCapacity(slot) {
  const maxCount = Number(slot?.maxCount);
  if (Number.isFinite(maxCount) && maxCount > 0) return maxCount;
  const max = Number(slot?.max);
  if (Number.isFinite(max) && max > 0) return max;
  const defaultCount = Number(slot?.defaultCount);
  if (Number.isFinite(defaultCount) && defaultCount > 0) return defaultCount;
  return 1;
}

function mediaSlotMaxCount(max, defaultVisibleCount) {
  const explicit = max == null ? NaN : Number(max);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const count = Number(defaultVisibleCount);
  if (Number.isFinite(count) && count > 0) return count;
  return 1;
}

export function getPreferredMediaSlot(layout, { kind = 'images', count = 1 } = {}) {
  const slots = getMediaSlotsForLayout(layout);
  if (!slots.length) return null;
  const requested = Math.max(1, Number(count) || 1);
  const requestedKind = kind === 'media' ? null : 'image';
  const fieldPattern = kind === 'media' ? /^(media|images)$/i : /^(images|photos|pictures|thumbs|logos|media)$/i;
  return slots.find(slot => slot.initialSrcSupported === true && fieldPattern.test(slot.field || '') && (!requestedKind || slotAcceptsKind(slot, requestedKind)) && mediaSlotCapacity(slot) >= requested)
    || slots.find(slot => slot.initialSrcSupported === true && (!requestedKind || slotAcceptsKind(slot, requestedKind)) && mediaSlotCapacity(slot) >= requested)
    || null;
}

export function getCopyBudgetsForLayout(layout) {
  const record = getLayoutRecord(layout);
  if (!record) return {};
  const mediaSlots = getMediaSlots(record);
  const decorativeKeys = getDecorativeKeys(record.page.key);
  const copyKeyRoots = getCopyKeyRoots(record.defaultProps, record.controls, mediaSlots, decorativeKeys);
  return getCopyBudgets(record.defaultProps, copyKeyRoots);
}

export function typedMediaItemForSource(source) {
  const src = String(source || '').trim();
  const kind = looksLikeVideoSrc(src) ? 'video' : 'image';
  return {
    src,
    kind,
    type: mimeForMediaSource(src, kind),
  };
}

function mergeDefaultArrayTails(props, defaults, authoredProps = props) {
  const next = { ...(props || {}) };
  for (const [key, value] of Object.entries(props || {})) {
    if (!Array.isArray(value) || !Array.isArray(defaults?.[key])) continue;
    if (isMediaArrayKey(key)) continue;
    const authoredLength = Array.isArray(authoredProps?.[key]) ? authoredProps[key].length : value.length;
    next[key] = [
      ...value.slice(0, authoredLength),
      ...value.slice(authoredLength).map(item => neutralizeDefaultCopy(item)),
    ];
  }
  return next;
}

function normalizeMediaItems(props, mediaSlots = []) {
  const next = { ...(props || {}) };
  for (const slot of mediaSlots || []) {
    if (!slot?.field || !Array.isArray(next[slot.field])) continue;
    next[slot.field] = next[slot.field].map(normalizeMediaItem);
  }
  return next;
}

function normalizeMediaItem(item) {
  if (typeof item === 'string') {
    const src = item.trim();
    return looksLikeVideoSrc(src) ? typedMediaItemForSource(src) : item;
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  if (typeof item.src !== 'string' || !item.src.trim()) return item;
  const src = item.src.trim();
  const kind = normalizeMediaKind(item.kind) || (looksLikeVideoSrc(src) ? 'video' : '');
  if (kind !== 'video') return item;
  return {
    ...item,
    src,
    kind: 'video',
    type: item.type || mimeForMediaSource(src, 'video'),
  };
}

export function getLayoutRecord(layout) {
  const page = pagesByKey.get(layout);
  if (!page) return null;
  const baseContract = contracts.get(layout);
  const manifestLayout = manifest.layouts?.[layout] || {};
  const controls = manifestLayout.controls || baseContract?.controls || [];
  const rawCountBindings = mergeCountBindings(manifestLayout.countBindings, baseContract?.countBindings);
  const countBindings = resolveCountBindings(rawCountBindings, baseContract?.defaultProps || {});
  const lengthBindings = mergeLengthBindings(manifestLayout.lengthBindings, baseContract?.lengthBindings);
  const contract = {
    ...(baseContract || {}),
    controls,
    countBindings,
    lengthBindings,
  };
  return {
    page,
    contract,
    controls,
    countBindings,
    lengthBindings,
    defaultProps: baseContract?.defaultProps || {},
  };
}

function mergeCountBindings(primary = [], fallback = []) {
  const result = [];
  const seen = new Set();
  for (const binding of [...(primary || []), ...(fallback || [])]) {
    if (!binding?.key || seen.has(binding.key)) continue;
    seen.add(binding.key);
    result.push(binding);
  }
  return result;
}

function resolveCountBindings(bindings = [], defaultProps = {}) {
  return (bindings || []).map(binding => ({ ...binding, arrays: resolveBindingArrays(binding, defaultProps) }));
}

function mergeLengthBindings(primary = [], fallback = []) {
  const result = [];
  const seen = new Set();
  for (const binding of [...(primary || []), ...(fallback || [])]) {
    if (!binding?.dependent || !binding?.anchor) continue;
    const key = `${binding.relation || 'same-length'}:${binding.dependent}:${binding.anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(binding);
  }
  return result;
}

export function getThemePackMetadata(themeKey) {
  return themePacksByKey.get(themeKey) || null;
}

export function layoutExists(layout) {
  return pagesByKey.has(layout);
}

function themeDisplayName(theme, fallback) {
  return theme?.displayName || theme?.label || theme?.name || fallback;
}

export function isCoverCandidate(layout) {
  return /^theme\d+_page00[1-5]$/.test(layout);
}

export function isCoverLikeLayout(layout) {
  const record = getLayoutRecord(layout);
  if (!record) return false;
  const slot = String(record.page.slot || '').toLowerCase();
  const label = String(record.page.label || '').toLowerCase();
  return slot.startsWith('cover') || label.startsWith('封面') || /^cover/.test(label);
}

function isBodyContentCandidate(page) {
  return !isCoverCandidate(page.key)
    && !isCoverLikeLayout(page.key)
    && !isClosingLikePage(page);
}

function isClosingLikePage(page) {
  const slot = String(page.slot || '').toLowerCase();
  const label = String(page.label || '').toLowerCase();
  const text = `${slot} ${label}`;
  return /(^|[\s_-])(closing|contact|join|end|endcap|colophon|appendix)([\s_-]|$)/.test(text)
    || label.startsWith('封底')
    || label.startsWith('结语')
    || label.startsWith('致谢')
    || label.startsWith('谢谢');
}

export function getAllowedPropKeys(layout) {
  const record = getLayoutRecord(layout);
  if (!record) return new Set();
  const mediaFields = getMediaSlots(record).map(slot => slot.field).filter(Boolean);
  return new Set([
    ...Object.keys(record.defaultProps || {}),
    ...record.controls.map(control => control.key).filter(Boolean),
    ...record.controls.map(control => control.publicKey).filter(Boolean),
    ...mediaFields,
  ]);
}

export function unknownPropKeys(record, props = {}) {
  const mediaFields = getMediaSlots(record).map(slot => slot.field).filter(Boolean);
  const allowed = new Set([
    ...Object.keys(record.defaultProps || {}),
    ...record.controls.map(control => control.key).filter(Boolean),
    ...record.controls.map(control => control.publicKey).filter(Boolean),
    ...mediaFields,
  ]);
  return Object.keys(props || {}).filter(key => !allowed.has(key));
}

// 顶层文案根:对象 copy 仍是单根(copy),内部路径由 expandCopyKeys/collectCopyBudgets 递归。
function getCopyKeyRoots(defaultProps, controls, mediaSlots, decorativeKeys = []) {
  const controlKeys = new Set(controls.map(control => control.key));
  const mediaFields = new Set(mediaSlots.map(slot => slot.field));
  const decorative = new Set(decorativeKeys);
  return Object.entries(defaultProps || {})
    .filter(([key, value]) => !controlKeys.has(key) && !mediaFields.has(key) && !decorative.has(key) && !isMediaArrayKey(key) && isCopyValue(value) && hasFillableCopyLeaf(value, key))
    .map(([key]) => key);
}

// JAD-212:把文案根扁平化为可填路径。对象 copy 展开成 copy.eyebrow / copy.points[].t,
// 顶层数组展开成 items[].label,与扁平主题(theme01)形态一致。
function expandCopyKeys(defaultProps, copyKeyRoots) {
  const keys = [];
  for (const root of copyKeyRoots) collectCopyPaths(defaultProps?.[root], root, keys);
  return [...new Set(keys)];
}

function collectCopyPaths(value, pathName, out) {
  if (typeof value === 'string' || typeof value === 'number' || isSerializedReactElementLike(value)) {
    if (isFillableCopyLeaf(pathName, value)) out.push(pathName);
    return;
  }
  if (Array.isArray(value)) {
    const shape = value.find(isPlainObject);
    if (shape) {
      for (const [key, item] of Object.entries(shape)) collectCopyPaths(item, `${pathName}[].${key}`, out);
      return;
    }
    if (value.some(item => (typeof item === 'string' || typeof item === 'number') && isFillableCopyLeaf(`${pathName}[]`, item))) out.push(`${pathName}[]`);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) collectCopyPaths(item, `${pathName}.${key}`, out);
}

function getArrayKeys(defaultProps, mediaSlots) {
  const mediaFields = new Set(mediaSlots.map(slot => slot.field));
  return Object.entries(defaultProps || {})
    .filter(([key, value]) => Array.isArray(value) && !mediaFields.has(key) && !isMediaArrayKey(key))
    .map(([key]) => key);
}

function isColorString(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(text) || /^(rgb|rgba|hsl|hsla)\(/i.test(text);
}

function isColorArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isColorString);
}

// defaultProps 中实际承载内容的数组键(排除媒体数组与纯色板数组)。
function contentArrayKeys(defaultProps = {}) {
  return Object.keys(defaultProps || {})
    .filter(key => Array.isArray(defaultProps[key]) && !isMediaArrayKey(key) && !isColorArray(defaultProps[key]));
}

function arrayHeadExists(defaultProps, pathName) {
  return Array.isArray(valueAtPath(defaultProps, pathName));
}

// 把 count 控件解析到 defaultProps 里真实存在的数组键;命不中时只保留可由命名或长度证明的数组。
function resolveBindingArrays(binding, defaultProps = {}) {
  const declared = Array.isArray(binding?.arrays) ? binding.arrays : [];
  const kept = declared.filter(pathName => arrayHeadExists(defaultProps, pathName));
  if (kept.length) return narrowCountBindingArrays(binding, kept);
  const paths = discoverContentArrayPaths(defaultProps);
  const byField = declared
    .flatMap(pathName => paths.filter(candidate => arrayFieldName(candidate) === arrayFieldName(pathName)));
  if (byField.length) return [...new Set(byField)];
  const content = contentArrayKeys(defaultProps);
  if (!content.length) return [];
  const max = Number(binding?.max);
  const byMax = Number.isFinite(max) ? content.filter(key => defaultProps[key].length === max) : [];
  if (byMax.length === 1) return byMax;
  const fallbackDefault = Number(defaultProps[binding?.key]);
  const byDefault = Number.isFinite(fallbackDefault) ? content.filter(key => defaultProps[key].length === fallbackDefault) : [];
  if (byDefault.length === 1) return byDefault;
  return [];
}

function narrowCountBindingArrays(binding, arrays) {
  if (!arrays.length) return arrays;
  const scored = arrays.map(pathName => ({ pathName, score: countArrayNameScore(binding?.key, pathName) }));
  const best = Math.max(...scored.map(item => item.score));
  if (best <= 0) return arrays;
  return scored.filter(item => item.score === best).map(item => item.pathName);
}

function countArrayNameScore(countKey, pathName) {
  const stem = normalizeName(String(countKey || '').replace(/Count$/i, ''));
  if (!stem) return 0;
  const aliases = countStemAliases(stem);
  const field = normalizeName(arrayFieldName(pathName));
  if (aliases.has(field)) return 3;
  const full = normalizeName(pathName);
  if (aliases.has(full)) return 2;
  return 0;
}

function countStemAliases(stem) {
  const aliases = {
    column: ['column', 'columns', 'coldata', 'colsdata', 'columndata', 'columnsdata'],
    col: ['column', 'columns', 'col', 'cols', 'coldata', 'colsdata'],
    row: ['row', 'rows', 'rowdata', 'rowsdata'],
  }[stem] || [];
  return new Set([stem, pluralize(stem), ...aliases].map(normalizeName));
}

function pluralize(value) {
  if (!value) return value;
  if (value.endsWith('y')) return `${value.slice(0, -1)}ies`;
  if (value.endsWith('s')) return value;
  return `${value}s`;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function paletteColorsForLayout(defaultProps = {}) {
  for (const [key, value] of Object.entries(defaultProps || {})) {
    if (isColorArray(value)) return { key, colors: value.slice(0, 8) };
  }
  return null;
}

function arrayItemColors(items = []) {
  const colors = [];
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (/colou?r|tone|accent|fill|tint|hex|swatch/i.test(key) && isColorString(value)) colors.push(value);
    }
  }
  return colors;
}

// 文案槽角色:eyebrow(短标签)/ title(标题)/ paragraph(段落)/ metric(数字)/ serial(序号)。
function copyRoleForField(pathName) {
  return {
    metric: 'metric',
    serial: 'serial',
    tagline: 'eyebrow',
    display: 'title',
    brief: 'paragraph',
    body: 'paragraph',
    compact: 'eyebrow',
  }[inferCopyDensity(pathName)] || 'eyebrow';
}

function buildCopyRoles(copyKeys = []) {
  const roles = {};
  // 扁平 copyKeys 已含 copy.eyebrow / items[].label 形态;数组路径(以 [] 结尾)按字段角色判定,不当 eyebrow 标题。
  for (const key of copyKeys) roles[key] = copyRoleForField(key);
  return roles;
}

function buildFieldContracts({ copyKeys = [], copyRoles = {}, arrayMeta = [], decorativeKeys = [], mediaSlots = [] } = {}) {
  const rows = [];
  for (const key of copyKeys || []) {
    rows.push({
      key,
      role: normalizeFieldContractRole(copyRoles[key]),
    });
  }
  for (const meta of arrayMeta || []) {
    rows.push({
      key: meta.key,
      role: meta.role,
      defaultCount: meta.defaultCount,
      defaultVisibleCount: meta.defaultVisibleCount,
      maxCount: meta.maxCount,
      countKey: meta.countKey,
    });
  }
  for (const key of decorativeKeys || []) {
    rows.push({
      key,
      role: 'decorative',
      writable: false,
      businessContent: false,
    });
  }
  for (const slot of mediaSlots || []) {
    rows.push({
      key: slot.field || slot.countKey,
      role: 'media',
      writableProp: slot.writableProp || slot.presetProp || null,
      accepts: slot.accepts || slot.acceptedKinds || [],
      acceptedKinds: slot.acceptedKinds || slot.accepts || [],
      defaultCount: slot.defaultCount,
      defaultVisibleCount: slot.defaultVisibleCount ?? slot.defaultCount,
      maxCount: slot.maxCount ?? mediaSlotCapacity(slot),
      countKey: slot.publicCountKey || slot.countKey || null,
      canPresetMedia: slot.canPresetMedia === true,
    });
  }
  return dedupeFieldContracts(rows.filter(item => item.key));
}

function normalizeFieldContractRole(role) {
  return role === 'paragraph' ? 'body' : role;
}

function dedupeFieldContracts(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const id = `${row.key}:${row.role}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(row);
  }
  return result;
}

function buildFillPlan({ copyKeys = [], copyBudgets = {}, copyRoles = {}, arrayMeta = [], mediaSlots = [], defaultProps = {}, controls = [], lengthBindings = [] } = {}) {
  return {
    text: buildFillPlanText(copyKeys, copyBudgets, copyRoles, defaultProps),
    arrays: buildFillPlanArrays(arrayMeta, copyBudgets, copyRoles, defaultProps, controls, lengthBindings),
    media: buildFillPlanMedia(mediaSlots),
  };
}

function buildFillPlanText(copyKeys, copyBudgets, copyRoles, defaultProps) {
  return (copyKeys || [])
    .filter(key => !String(key).includes('[]'))
    .map(key => ({
      key,
      role: normalizeFieldContractRole(copyRoles[key]),
      type: simpleValueType(valueAtPath(defaultProps, key)),
      ...(copyBudgets[key]?.maxChars ? { maxChars: copyBudgets[key].maxChars } : {}),
    }))
    .filter(item => item.type !== 'object' && item.type !== 'array');
}

function buildFillPlanArrays(arrayMeta, copyBudgets, copyRoles, defaultProps, controls, lengthBindings) {
  return (arrayMeta || [])
    .map(meta => {
      const items = Array.isArray(valueAtPath(defaultProps, meta.key)) ? valueAtPath(defaultProps, meta.key) : [];
      const fieldItems = isNestedArrayPath(meta.key) ? arraysAtPath(defaultProps, meta.key).flatMap(item => item) : items;
      const itemFields = fillPlanItemFields(meta.key, fieldItems.length ? fieldItems : items, copyBudgets, copyRoles);
      const nestedArrays = fillPlanNestedArrays(meta.key, items, copyBudgets, copyRoles, defaultProps, controls, lengthBindings);
      const itemShape = fillPlanArrayItemShape(items);
      const numericRange = isNestedArrayPath(meta.key) ? numericRangeForValues(valuesForPattern(defaultProps, meta.key)) : null;
      const lengthBinding = lengthBindingForPath(meta.key, lengthBindings);
      const fixedLength = fixedLengthForArrayPath(defaultProps, meta.key);
      return {
        key: meta.key,
        role: meta.role,
        visibleCount: meta.defaultVisibleCount,
        maxCount: meta.maxCount,
        countKey: meta.countKey,
        ...(lengthBinding ? fillPlanLengthBinding(lengthBinding) : {}),
        ...(!meta.countKey && !lengthBinding && fixedLength ? fixedLength : {}),
        ...(itemShape ? { itemShape } : {}),
        ...(numericRange ? { numericRange } : {}),
        ...(Object.keys(itemFields).length ? { itemFields } : {}),
        ...(Object.keys(nestedArrays).length ? { nestedArrays } : {}),
      };
    })
    .filter(item => item.itemShape || item.itemFields || item.nestedArrays);
}

function buildFillPlanMedia(mediaSlots = []) {
  return (mediaSlots || [])
    .filter(slot => slot.field && slot.canPresetMedia === true)
    .map(slot => ({
      key: slot.field,
      write: slot.writableProp || slot.presetProp || `props.${slot.field}`,
      visibleCount: slot.defaultVisibleCount ?? slot.defaultCount,
      maxCount: slot.maxCount ?? mediaSlotCapacity(slot),
      countKey: slot.publicCountKey || slot.countKey || null,
      accepts: slot.accepts || slot.acceptedKinds || [],
      itemShape: slot.itemShape,
    }));
}

function fillPlanItemFields(arrayKey, items, copyBudgets, copyRoles) {
  const shape = items.find(isPlainObject);
  if (!shape) return {};
  const fields = {};
  for (const [field, value] of Object.entries(shape)) {
    if (Array.isArray(value) || isPlainObject(value)) continue;
    const pathName = `${arrayKey}[].${field}`;
    if (!isFillableCopyLeaf(pathName, value)) continue;
    fields[field] = {
      role: normalizeFieldContractRole(copyRoles[pathName] || copyRoleForField(pathName)),
      type: simpleValueType(value),
      ...(simpleValueType(value) === 'number' ? { numericRange: numericRangeForValues(items.map(item => item?.[field])) } : {}),
      ...(copyBudgets[pathName]?.maxChars ? { maxChars: copyBudgets[pathName].maxChars } : {}),
    };
  }
  return fields;
}

function fillPlanNestedArrays(arrayKey, items, copyBudgets, copyRoles, defaultProps, controls, lengthBindings) {
  const shape = items.find(isPlainObject);
  if (!shape) return {};
  const nested = {};
  for (const [field, value] of Object.entries(shape)) {
    if (!Array.isArray(value) || isMediaArrayKey(field) || isColorArray(value)) continue;
    const countMeta = countMetaForNestedArray(field, value, defaultProps, controls);
    const pathName = `${arrayKey}[].${field}`;
    const defaultArrays = arraysAtPath(defaultProps, pathName);
    const numericRange = numericRangeForValues(defaultArrays);
    const lengthBinding = lengthBindingForPath(pathName, lengthBindings);
    const fixedLength = fixedLengthForNestedArray(items, field);
    nested[field] = {
      visibleCount: countMeta.visibleCount,
      maxCount: countMeta.maxCount,
      countKey: countMeta.countKey,
      ...(lengthBinding ? fillPlanLengthBinding(lengthBinding) : {}),
      ...(!countMeta.countKey && !lengthBinding && fixedLength ? fixedLength : {}),
      ...(numericRange ? { numericRange } : {}),
      itemShape: fillPlanArrayItemShape(value) || 'string',
    };
    const nestedItems = defaultArrays.flatMap(item => item);
    const nestedFields = fillPlanItemFields(pathName, nestedItems.length ? nestedItems : value, copyBudgets, copyRoles);
    if (Object.keys(nestedFields).length) nested[field].itemFields = nestedFields;
    const budget = copyBudgets[`${pathName}[]`];
    const role = copyRoles[`${pathName}[]`];
    if (role || budget?.maxChars) {
      nested[field].item = {
        role: normalizeFieldContractRole(role || copyRoleForField(`${pathName}[]`)),
        ...(budget?.maxChars ? { maxChars: budget.maxChars } : {}),
      };
    }
  }
  return nested;
}

function fixedLengthForNestedArray(items, field) {
  const arrays = (items || [])
    .map(item => item?.[field])
    .filter(Array.isArray);
  if (!isFixedCapacityArray(field, arrays)) return null;
  const lengths = arrays.map(value => value.length);
  if (!lengths.length || lengths.some(length => length <= 0)) return null;
  const unique = new Set(lengths);
  return unique.size === 1 ? { fixedLength: lengths[0] } : { fixedLengths: lengths };
}

function fixedLengthForArrayPath(defaultProps, pathName) {
  if (!String(pathName || '').includes('[].')) return null;
  const arrays = arraysAtPath(defaultProps, pathName);
  if (!isFixedCapacityArray(arrayFieldName(pathName), arrays)) return null;
  const lengths = arrays.map(value => value.length);
  if (!lengths.length || lengths.some(length => length <= 0)) return null;
  const unique = new Set(lengths);
  return unique.size === 1 ? { fixedLength: lengths[0] } : { fixedLengths: lengths };
}

function isFixedCapacityArray(field, arrays = []) {
  if (/^(tags?|chips?|bullets?|labels?)$/i.test(String(field || ''))) return false;
  return arrays.some(array => Array.isArray(array) && array.some(isFixedCapacityArrayItem));
}

function isFixedCapacityArrayItem(item) {
  if (typeof item === 'number' && Number.isFinite(item)) return true;
  if (Array.isArray(item)) return item.some(isFixedCapacityArrayItem);
  if (!isPlainObject(item)) return false;
  return Object.values(item).some(value => typeof value === 'number' && Number.isFinite(value));
}

function arraysAtPath(source, pathName) {
  const parts = String(pathName || '').split('.').filter(Boolean);
  return arraysAtPathParts([source], parts);
}

function arraysAtPathParts(values, parts) {
  if (!parts.length) return values.filter(Array.isArray);
  const [part, ...rest] = parts;
  const isArrayPart = part.endsWith('[]');
  const key = isArrayPart ? part.slice(0, -2) : part;
  const next = [];
  for (const value of values) {
    if (value == null) continue;
    const child = key ? value[key] : value;
    if (isArrayPart) {
      if (Array.isArray(child)) next.push(...child);
    } else {
      next.push(child);
    }
  }
  return arraysAtPathParts(next, rest);
}

function lengthBindingForPath(pathName, lengthBindings = []) {
  return (lengthBindings || []).find(binding => binding?.dependent === pathName && binding.relation === 'same-length') || null;
}

function fillPlanLengthBinding(binding) {
  return {
    sameLengthAs: binding.anchor,
    ...(binding.countKey ? { sameLengthCountKey: binding.countKey } : {}),
  };
}

function countMetaForNestedArray(field, items, defaultProps, controls) {
  const control = countControlForArrayField(field, controls);
  const value = control ? defaultProps?.[control.key] ?? control.default : null;
  const visibleCount = control ? numberOrNull(value) ?? items.length : items.length;
  const maxCount = control || isFixedCapacityArray(field, [items]) ? maxCountForArray(control?.max, items) : undefined;
  return {
    countKey: control?.publicKey || control?.key || null,
    visibleCount,
    maxCount,
  };
}

function countControlForArrayField(field, controls = []) {
  const base = singularFieldName(field);
  const candidates = new Set([
    ...(base ? [`${base}Count`, `${base}Total`] : []),
    `${field}Count`,
  ].map(item => item.toLowerCase()));
  return nonMediaCountControls(controls).find(control => {
    const keys = [control.key, control.publicKey].filter(Boolean).map(item => String(item).toLowerCase());
    return keys.some(key => candidates.has(key));
  }) || null;
}

function singularFieldName(field) {
  const value = String(field || '').toLowerCase();
  if (value.length <= 1) return value;
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.endsWith('s')) return value.slice(0, -1);
  return value;
}

function fillPlanArrayItemShape(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const object = items.find(isPlainObject);
  if (object) {
    return Object.fromEntries(Object.entries(object).map(([key, value]) => [
      key,
      Array.isArray(value) ? fillPlanArrayValueShape(value) : simpleValueType(value),
    ]));
  }
  const tuple = fillPlanTupleShapeForArrayItems(items);
  if (tuple) return tuple;
  return simpleValueType(items.find(item => item != null));
}

function fillPlanArrayValueShape(items) {
  const itemShape = fillPlanArrayItemShape(items);
  return itemShape == null ? [] : [itemShape];
}

function fillPlanTupleShapeForArrayItems(items) {
  const arrays = (items || []).filter(Array.isArray);
  if (!arrays.length) return null;
  const fixedLength = arrays.every(item => item.length === arrays[0].length) ? arrays[0].length : null;
  const length = fixedLength ?? Math.max(...arrays.map(item => item.length));
  return Array.from({ length }, (_, index) => fillPlanTupleItemShape(arrays.map(item => item[index]).filter(item => item !== undefined)));
}

function fillPlanTupleItemShape(values) {
  const objects = values.filter(isPlainObject);
  if (objects.length) {
    return Object.fromEntries(Object.entries(objects[0]).map(([key, value]) => [
      key,
      Array.isArray(value) ? fillPlanArrayValueShape(value) : simpleValueType(value),
    ]));
  }
  const arrays = values.filter(Array.isArray);
  if (arrays.length) return fillPlanTupleShapeForArrayItems(arrays);
  return simpleValueType(values.find(item => item != null));
}

function simpleValueType(value) {
  if (isSerializedReactElementLike(value)) return 'string';
  if (Array.isArray(value)) return 'array';
  if (value == null) return 'string';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function arrayItemRoles(items = [], arrayKey) {
  const shape = items.find(isPlainObject);
  if (!shape) return undefined;
  const roles = {};
  for (const field of Object.keys(shape)) {
    const value = shape[field];
    if (Array.isArray(value) || isPlainObject(value)) continue;
    if (!isFillableCopyLeaf(`${arrayKey}[].${field}`, value)) continue;
    roles[field] = copyRoleForField(`${arrayKey}[].${field}`);
  }
  return Object.keys(roles).length ? roles : undefined;
}

// JAD-213:数组语义角色枚举。启发式:字段名 → itemShape 兜底(value/unit→metric)→ misc。
const ARRAY_ROLE_KEYWORDS = {
  metric: ['stats', 'stat', 'data', 'metrics', 'metric', 'dials', 'dialsdata', 'dial', 'gauges', 'gauge', 'kpis', 'kpi', 'scores', 'numbers', 'meters'],
  distribution: ['shares', 'share', 'splits', 'split', 'regions', 'region', 'allocations', 'allocation', 'breakdowns', 'breakdown', 'parts', 'part'],
  chapter: ['chapters', 'chapter', 'sections', 'agenda', 'contents', 'toc'],
  step: ['steps', 'step', 'phases', 'phase', 'stages', 'stage', 'milestones', 'rounds', 'timeline', 'events'],
  quadrant: ['quadrants', 'quadrant'],
  media: ['photos', 'images', 'media', 'logos', 'thumbs', 'gallery', 'pictures'],
  'list-item': ['items', 'item', 'list', 'lists', 'cards', 'card', 'tiles', 'tile', 'chips', 'points', 'bullets', 'rows', 'features', 'principles', 'takeaways', 'callouts', 'segments', 'plans'],
};

const METRIC_FIELD_RE = /^(value|val|amount|amt|funding|fund|funds|budget|spend|investment|capital|revenue|sales|cost|price|arr|mrr|gmv|share|pct|percent|percentage|ratio|rate|portion|weight|num|number|score|index|rank|total|metric)$/;
const DISTRIBUTION_METRIC_FIELD_RE = /^(share|pct|percent|percentage|ratio|portion|weight)$/;
const LABEL_FIELD_RE = /^(unit|label|dim|name|cap|caption|note|title|category|en)$/;

function arrayFieldName(pathName) {
  return String(pathName || '').split('.').at(-1).replace(/\[\]$/, '').toLowerCase();
}

function isNestedArrayPath(pathName) {
  return String(pathName || '').includes('[].');
}

function arrayRole(pathName, items = []) {
  const field = arrayFieldName(pathName);
  for (const [role, keywords] of Object.entries(ARRAY_ROLE_KEYWORDS)) {
    if (keywords.includes(field)) return role;
  }
  // itemShape 兜底:含 share/funding/value 等数值字段 + 标签字段 → metric/distribution。
  const shape = items.find(isPlainObject);
  if (shape) {
    const entries = Object.entries(shape).map(([key, value]) => [normalizeName(key), value]);
    const metricFields = entries.filter(([key, value]) => typeof value === 'number' && isMetricFieldName(key));
    if (metricFields.length && entries.some(([key]) => LABEL_FIELD_RE.test(key))) {
      return metricFields.some(([key]) => isDistributionMetricFieldName(key)) ? 'distribution' : 'metric';
    }
  }
  return 'misc';
}

function isMetricFieldName(field) {
  return METRIC_FIELD_RE.test(normalizeName(field));
}

function isDistributionMetricFieldName(field) {
  return DISTRIBUTION_METRIC_FIELD_RE.test(normalizeName(field));
}

// 非媒体的数量控件(供 copy 内/无声明数组按长度匹配 count 控件)。
function nonMediaCountControls(controls = []) {
  return (controls || []).filter(control => {
    const key = String(control.key || '');
    const type = String(control.type || '').toLowerCase();
    if (!/count$/i.test(key)) return false;
    if (!['number', 'range', 'slider'].includes(type)) return false;
    return !isMediaCountControl(control);
  });
}

// JAD-212:数组路径(顶层或 copy 内)→ count 控件。只能来自已解析 countBindings。
function countMetaForArray(pathName, resolvedBindings) {
  const binding = (resolvedBindings || []).find(item => (item.arrays || []).includes(pathName));
  if (binding) return { countKey: binding.publicKey || binding.key, min: binding.min ?? null, max: binding.max ?? null };
  return { countKey: null, min: null, max: null };
}

function defaultVisibleCountForArray(countKey, items, controls = [], defaultProps = {}) {
  if (!countKey) return items.length;
  const control = (controls || []).find(item => item.key === countKey || item.publicKey === countKey);
  const value = control ? defaultProps?.[control.key] ?? control.default : null;
  const count = Number(value);
  return Number.isFinite(count) ? count : items.length;
}

function maxCountForArray(max, items) {
  const count = max == null ? NaN : Number(max);
  return Number.isFinite(count) && count >= 0 ? count : items.length;
}

// 承载内容的数组路径:顶层数组 + copy 等对象内的一层嵌套数组(排除媒体/纯色板)。
function discoverContentArrayPaths(defaultProps = {}) {
  const out = [];
  for (const [key, value] of Object.entries(defaultProps || {})) {
    if (Array.isArray(value)) {
      if (!isMediaArrayKey(key) && !isColorArray(value)) out.push(key);
      for (const pathName of nestedArrayPaths(value, key)) out.push(pathName);
      continue;
    }
    if (!isPlainObject(value)) continue;
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (isNumericPathSegment(nestedKey)) continue;
      if (Array.isArray(nestedValue) && !isMediaArrayKey(nestedKey) && !isColorArray(nestedValue)) {
        out.push(`${key}.${nestedKey}`);
      }
      if (Array.isArray(nestedValue)) {
        for (const pathName of nestedArrayPaths(nestedValue, `${key}.${nestedKey}`)) out.push(pathName);
      }
    }
  }
  return [...new Set(out)];
}

function nestedArrayPaths(items, prefix) {
  const out = [];
  for (const item of items || []) {
    if (!isPlainObject(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (!Array.isArray(value)) continue;
      if (!isMediaArrayKey(key) && !isColorArray(value)) out.push(`${prefix}[].${key}`);
      for (const pathName of nestedArrayPaths(value, `${prefix}[].${key}`)) out.push(pathName);
    }
  }
  return out;
}

function isNumericPathSegment(value) {
  return /^\d+$/.test(String(value || ''));
}

function valueAtPath(defaultProps, pathName) {
  let current = defaultProps;
  for (const segment of String(pathName || '').split('.')) {
    if (current == null) return undefined;
    if (segment.endsWith('[]')) {
      const array = current[segment.slice(0, -2)];
      if (!Array.isArray(array)) return undefined;
      current = array;
      continue;
    }
    if (Array.isArray(current)) {
      current = current
        .map(item => item?.[segment])
        .find(item => item !== undefined);
      continue;
    }
    current = current[segment];
  }
  return current;
}

function valuesForPattern(source, pathName) {
  const parts = String(pathName || '').split('.').filter(Boolean);
  return valuesForPatternParts([source], parts);
}

function valuesForPatternParts(values, parts) {
  if (!parts.length) return values.length === 1 ? values[0] : values;
  const [part, ...rest] = parts;
  const isArrayPart = part.endsWith('[]');
  const key = isArrayPart ? part.slice(0, -2) : part;
  const next = [];
  for (const value of values) {
    if (value == null) continue;
    const child = key ? value[key] : value;
    if (isArrayPart) {
      if (Array.isArray(child)) next.push(...child);
    } else {
      next.push(child);
    }
  }
  return valuesForPatternParts(next, rest);
}

function numericRangeForValues(value) {
  const numbers = collectNumbers(value);
  if (!numbers.length) return null;
  return { observedMin: Math.min(...numbers), observedMax: Math.max(...numbers) };
}

function collectNumbers(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  if (isPlainObject(value)) return Object.values(value).flatMap(collectNumbers);
  return [];
}

// 每个内容数组的填充元数据:默认条目数、绑定的 count 控件、范围、默认配色、语义角色、字段角色。
function buildArrayMeta(defaultProps = {}, countBindings = [], controls = [], { withItemRoles = false } = {}) {
  const paths = discoverContentArrayPaths(defaultProps);
  const resolvedBindings = (countBindings || []).map(binding => ({ ...binding, arrays: resolveBindingArrays(binding, defaultProps) }));
  return paths.slice(0, 8).map(pathName => {
    const items = Array.isArray(valueAtPath(defaultProps, pathName)) ? valueAtPath(defaultProps, pathName) : [];
    const { countKey, min, max } = countMetaForArray(pathName, resolvedBindings);
    const defaultVisibleCount = defaultVisibleCountForArray(countKey, items, controls, defaultProps);
    const nested = isNestedArrayPath(pathName);
    const fixedCapacity = nested && isFixedCapacityArray(arrayFieldName(pathName), [items]);
    const maxCount = countKey || !nested || fixedCapacity ? maxCountForArray(max, items) : undefined;
    const colors = [...new Set(arrayItemColors(items))];
    const meta = {
      key: pathName,
      role: arrayRole(pathName, items),
      defaultCount: items.length,
      defaultVisibleCount,
      countKey,
      min,
      max,
      maxCount,
    };
    if (colors.length) meta.defaultColors = colors.slice(0, 8);
    if (withItemRoles) {
      const itemRoles = arrayItemRoles(items, pathName);
      if (itemRoles) meta.itemRoles = itemRoles;
    }
    return meta;
  });
}

// JAD-212:正文是否完全由组件硬编码不可填。
// 条件:存在指向数组的 count 控件,但其数组在 defaultProps/copy 全部缺席,
// 且无可发现的内容数组,且剩余 copyKeys 仅 eyebrow/serial 类(无 title/paragraph/metric 正文)。
function detectContentLocked({ copyKeys, copyRoles, arrayMeta, resolvedBindings, defaultProps }) {
  if (arrayMeta.length) return null;
  const countTowardAbsent = (resolvedBindings || []).filter(binding => {
    const arrays = binding.arrays || [];
    return arrays.length && arrays.every(pathName => valueAtPath(defaultProps, pathName.split('[')[0]) === undefined);
  });
  if (!countTowardAbsent.length) return null;
  const hasBodyCopy = (copyKeys || []).some(key => !['eyebrow', 'serial'].includes(copyRoles[key]));
  if (hasBodyCopy) return null;
  const arr = countTowardAbsent.map(binding => (binding.arrays || []).join('/')).join(', ');
  return `正文数组(${arr})由组件硬编码,不在 props/copy 中,正文不可由 props 定制;只能改 count 控件数量`;
}


function getCopyBudgets(defaultProps, copyKeys) {
  const budgets = {};
  for (const key of copyKeys) {
    collectCopyBudgets(defaultProps?.[key], key, budgets);
  }
  return budgets;
}

function collectCopyBudgets(value, pathName, budgets) {
  if (typeof value === 'string' || typeof value === 'number') {
    if (isFillableCopyLeaf(pathName, value)) setCopyBudget(budgets, pathName, copyBudget(pathName, value));
    return;
  }
  if (isSerializedReactElementLike(value)) {
    if (isFillableCopyLeaf(pathName, value)) setCopyBudget(budgets, pathName, copyBudget(pathName, reactElementText(value)));
    return;
  }
  if (Array.isArray(value)) {
    value.slice(0, 4).forEach(item => collectCopyBudgets(item, `${pathName}[]`, budgets));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    collectCopyBudgets(item, `${pathName}.${key}`, budgets);
  }
}

function setCopyBudget(budgets, key, budget) {
  if (!budget) return;
  const existing = budgets[key];
  if (!existing || budget.maxChars < existing.maxChars) budgets[key] = budget;
}

export function copyBudget(pathName, value) {
  const density = inferCopyDensity(pathName);
  const length = charLength(value);
  const floor = { body: 18, serial: 4, tagline: 8 }[density] ?? 6;
  const base = Math.max(length, floor);
  const maxChars = {
    // serial/序号槽:物理可容字符极少(如 80px mono 大序号),收紧到 6–8。
    serial: Math.min(8, Math.max(6, Math.ceil(base * 1.2))),
    metric: Math.max(8, Math.min(16, Math.ceil(base * 1.4))),
    // 刊头 mono 标语(panelEn 等):单行不换行,约束在 ~14。
    tagline: Math.min(14, Math.max(12, Math.ceil(base * 1.1))),
    display: Math.max(18, Math.min(36, Math.ceil(base * 1.8))),
    compact: Math.max(16, Math.min(42, Math.ceil(base * 1.8))),
    brief: Math.max(36, Math.min(80, Math.ceil(base * 1.6))),
    body: Math.max(36, Math.min(120, Math.ceil(base * 2.2))),
  }[density];
  return { density, maxChars };
}

export function inferCopyDensity(pathName) {
  const normalized = String(pathName || '').toLowerCase();
  const field = normalized.split('.').at(-1)?.replace(/\[\]/g, '') || normalized;
  const nested = normalized.includes('.') || normalized.includes('[]');
  // 序号 / 刊号槽:物理容量极小,先于 metric 命中,避免被当成普通数字放宽到 16。
  if (!nested && /^(panelindex|panelno|panelnum|vol|volume|issueno|serialno|partno)$/.test(field)) return 'serial';
  if (!nested && /^(panelen|panelsub|paneltag)$/.test(field)) return 'tagline';
  if (isMetricFieldName(field)) return 'metric';
  if (!nested && /^(title|titletop|titlebottom|headline|headlinehl|headlinetail|statement|quote|word|brand|kicker)$/.test(field)) return 'display';
  if (/^(lead|subtitle|sub|desc|description|summary|note|caption|detail|footnote)$/.test(field)) return 'brief';
  if (/^(body|copy|paragraph)$/.test(field)) return 'body';
  if (/^(title|headline|label|name|kicker|tag|chip|pill|category)$/.test(field)) return 'compact';
  return 'compact';
}

function charLength(value) {
  return Array.from(String(value ?? '')).length;
}

function hasFillableCopyLeaf(value, pathName) {
  if (typeof value === 'string' || typeof value === 'number' || isSerializedReactElementLike(value)) {
    return isFillableCopyLeaf(pathName, value);
  }
  if (Array.isArray(value)) {
    return value.some(item => hasFillableCopyLeaf(item, `${pathName}[]`));
  }
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, item]) => hasFillableCopyLeaf(item, `${pathName}.${key}`));
}

function isFillableCopyLeaf(pathName, value) {
  const field = pathFieldName(pathName);
  if (isColorString(value) && /^(c|color|colour|accent|fill|stroke|background|bg|tint|hex)$/i.test(field)) return false;
  if (/^(id|key|type|kind|mode|variant|style|layout|align|side|position|fit|icon|href|url|src|className)$/i.test(field)) return false;
  if (/^(theme|tone|q)$/i.test(field) && isTokenLike(value)) return false;
  return true;
}

function pathFieldName(pathName) {
  return String(pathName || '').split('.').pop()?.replace(/\[\]$/, '') || '';
}

function isTokenLike(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^[A-Za-z0-9_-]{1,24}$/.test(text);
}

function isCopyValue(value) {
  if (value == null) return false;
  if (['string', 'number'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.length > 0 && value.every(item => item == null || ['string', 'number'].includes(typeof item) || isPlainObject(item));
  return isPlainObject(value);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getMediaSlots(record) {
  const { controls, countBindings, defaultProps } = record;
  const slots = [];
  for (const binding of countBindings || []) {
    const mediaArrays = (binding.arrays || []).filter(isMediaArrayKey);
    for (const field of mediaArrays) {
      slots.push(mediaSlot(field, binding.key, controls, defaultProps, binding, record, { writeMode: 'initialProps' }));
    }
  }
  for (const control of controls || []) {
    if (!isWritableMediaControl(control)) continue;
    const field = isMediaArrayKey(control.key) ? control.key : firstMediaArray(defaultProps) || control.key;
    slots.push(mediaSlot(field, control.countKey, controls, defaultProps, control, record, { writeMode: 'initialProps' }));
  }
  for (const field of Object.keys(defaultProps || {}).filter(key => Array.isArray(defaultProps[key]) && isMediaArrayKey(key) && defaultArraySupportsInitialMedia(defaultProps[key]))) {
    slots.push(mediaSlot(field, undefined, controls, defaultProps, {}, record, { writeMode: 'initialProps' }));
  }
  for (const control of controls || []) {
    if (!isMediaCountControl(control)) continue;
    for (const field of hostMediaFields(record, control)) {
      slots.push(mediaSlot(field, control.key, controls, defaultProps, control, record, { writeMode: 'initialProps' }));
    }
    slots.push(countOnlyMediaSlot(control, defaultProps, record));
  }
  return dedupeSlots(slots);
}

function mediaSlot(field, countKey, controls, defaultProps, source, record, { writeMode = 'initialProps' } = {}) {
  const countControl = controls.find(control => control.key === countKey);
  const fieldControl = controls.find(control => control.key === field);
  const defaultCount = countKey ? defaultProps[countKey] ?? countControl?.default : Array.isArray(defaultProps[field]) ? defaultProps[field].length : undefined;
  const max = source.max ?? countControl?.max ?? null;
  const defaultVisibleCount = defaultCount ?? null;
  const maxCount = mediaSlotMaxCount(max, defaultVisibleCount);
  const acceptedKinds = acceptedMediaKinds(record, field, fieldControl);
  const itemShape = acceptedKinds.includes('video') ? 'string | {src,kind,type}' : 'string | {src}';
  return {
    role: 'media',
    field,
    fieldPath: `props.${field}`,
    writableProp: writeMode === 'initialProps' ? `props.${field}` : null,
    countKey: countKey || fieldControl?.countKey || null,
    publicCountKey: countControl?.publicKey || countKey || fieldControl?.countKey || null,
    defaultCount: defaultCount ?? null,
    defaultVisibleCount,
    min: source.min ?? countControl?.min ?? null,
    max,
    maxCount,
    controlKey: fieldControl?.key || null,
    publicControlKey: fieldControl?.publicKey || fieldControl?.key || null,
    label: fieldControl?.label || countControl?.label || null,
    accepts: acceptedKinds,
    acceptedKinds,
    itemShape,
    valueShape: `Array<${itemShape}>`,
    initialSrcSupported: writeMode === 'initialProps',
    runtimeReplaceable: true,
    writeMode,
    canPresetMedia: writeMode === 'initialProps',
    presetProp: writeMode === 'initialProps' ? `props.${field}` : null,
    emptySlotBehavior: countKey ? 'hiddenByCount' : 'placeholder',
  };
}

function countOnlyMediaSlot(control, defaultProps, record) {
  const acceptedKinds = countOnlyAcceptedMediaKinds(record, control);
  const defaultCount = defaultProps?.[control.key] ?? control.default ?? null;
  const max = control.max ?? null;
  return {
    role: 'media',
    field: null,
    fieldPath: null,
    writableProp: null,
    countKey: control.key,
    publicCountKey: control.publicKey || control.key,
    defaultCount,
    defaultVisibleCount: defaultCount,
    min: control.min ?? null,
    max,
    maxCount: mediaSlotMaxCount(max, defaultCount),
    controlKey: control.key,
    publicControlKey: control.publicKey || control.key,
    label: control.label || null,
    accepts: acceptedKinds,
    acceptedKinds,
    valueShape: null,
    initialSrcSupported: false,
    runtimeReplaceable: true,
    writeMode: 'countOnly',
    canPresetMedia: false,
    presetProp: null,
    emptySlotBehavior: 'placeholder',
  };
}

function dedupeSlots(slots) {
  const byField = new Map();
  const countOnly = [];
  for (const slot of slots) {
    if (!slot.field) {
      countOnly.push(slot);
      continue;
    }
    const existing = byField.get(slot.field);
    if (!existing || slotRank(slot) > slotRank(existing)) byField.set(slot.field, slot);
  }
  const writableCountKeys = new Set([...byField.values()].map(slot => slot.countKey).filter(Boolean));
  return [
    ...byField.values(),
    ...countOnly.filter(slot => !writableCountKeys.has(slot.countKey)),
  ];
}

function slotRank(slot) {
  let rank = 0;
  if (slot.initialSrcSupported) rank += 10;
  if (slot.countKey) rank += 2;
  if (slot.controlKey) rank += 1;
  return rank;
}

function firstMediaArray(defaultProps = {}) {
  return Object.keys(defaultProps).find(key => Array.isArray(defaultProps[key]) && isMediaArrayKey(key) && defaultArraySupportsInitialMedia(defaultProps[key]));
}

function isWritableMediaControl(control) {
  const type = String(control.type || '').toLowerCase();
  const key = String(control.key || '').toLowerCase();
  if (['images', 'image', 'media', 'picture'].includes(type)) return true;
  if (/^(images|media|photos|pictures|logos|thumbs)$/.test(key)) return true;
  return false;
}

function isMediaCountControl(control) {
  const type = String(control.type || '').toLowerCase();
  const key = String(control.key || '');
  const label = String(control.label || '');
  const desc = String(control.desc || control.description || '');
  if (!/(count|数量)$/i.test(key)) return false;
  if (!['number', 'range', 'slider'].includes(type)) return false;
  return /image|media|photo|picture|video|图片|图像|视频|媒体|照片/.test(`${key} ${label} ${desc}`);
}


function defaultArraySupportsInitialMedia(value) {
  if (!Array.isArray(value)) return false;
  if (!value.length) return true;
  return value.some(item => typeof item === 'string' || mediaObjectHasSource(item));
}

function mediaObjectHasSource(value) {
  return isPlainObject(value) && ['src', 'url', 'u', 'href'].some(key => typeof value[key] === 'string' && value[key]);
}

function acceptedMediaKinds(record, field, fieldControl) {
  return ['image', 'video'];
}

function countOnlyAcceptedMediaKinds(record, control) {
  return ['image', 'video'];
}

function hostMediaFields(record, control) {
  if (!HOST_MEDIA_ARRAY_THEMES.has(record?.page?.themeKey)) return [];
  const kinds = countOnlyAcceptedMediaKinds(record, control);
  if (!kinds.includes('image')) return [];
  if (['theme05', 'theme06', 'theme08'].includes(record?.page?.themeKey)) return ['images'];
  return kinds.includes('video') ? ['images', 'media'] : ['images'];
}

function normalizeMediaKind(kind) {
  const value = String(kind || '').trim().toLowerCase();
  if (!value) return null;
  if (['image', 'images', 'photo', 'photos', 'picture', 'pictures'].includes(value)) return 'image';
  if (['video', 'videos', 'movie', 'movies'].includes(value)) return 'video';
  if (['mixed', 'media', 'any'].includes(value)) return 'mixed';
  return value;
}

function looksLikeVideoSrc(src) {
  return /\.(mp4|m4v|mov|webm|ogv)(?:[?#].*)?$/i.test(String(src || '').trim())
    || String(src || '').startsWith('data:video/');
}

function mimeForMediaSource(src, kind) {
  const ext = path.extname(String(src || '').split(/[?#]/)[0]).toLowerCase();
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
  }[ext] || (kind === 'video' ? 'video/mp4' : 'image/*');
}

function slotAcceptsKind(slot, kind) {
  const normalized = normalizeMediaKind(kind);
  if (!normalized) return true;
  const kinds = slot.acceptedKinds || [];
  if (normalized === 'mixed') return kinds.includes('image') && kinds.includes('video');
  return kinds.includes(normalized);
}

function isWritableMediaSlot(slot) {
  return slot?.role === 'media'
    && slot.canPresetMedia === true
    && slot.initialSrcSupported === true
    && Boolean(slot.writableProp || slot.fieldPath || slot.presetProp);
}

function inferRoles(page, mediaSlots = []) {
  return Object.entries(ROLE_KEYWORDS)
    .filter(([role, keywords]) => {
      if (role === 'cover') return isCoverCandidate(page.key);
      if (role === 'image') return mediaSlots.length > 0;
      if (role === 'ambient') return hasAmbientBackground(page);
      return pageMatches(page, keywords);
    })
    .map(([role]) => role)
    .slice(0, 6);
}

function hasAmbientBackground(page) {
  const props = page?.defaultProps || {};
  return props.backgroundMode === 'unicorn' || typeof props.unicornScene === 'string';
}

function pageMatches(page, keywords) {
  const text = pageSearchText(page);
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

function pageSearchText(page) {
  return `${page.key} ${page.slot || ''} ${page.label || ''}`.toLowerCase();
}

/** @param {import('../src/types').CompactLayoutCandidate} layout */
export function scoreLayout(layout, { normalizedRole, keywordText, requiresMedia, requestedMediaCount, normalizedMediaKind, needsInitialMedia }) {
  let score = 0;
  if (normalizedRole && layout.roles.includes(normalizedRole)) score += 20;
  if (keywordText && `${layout.label} ${layout.slot}`.toLowerCase().includes(keywordText)) score += 10;
  if (requiresMedia && layout.mediaSlots.some(isWritableMediaSlot)) score += 8;
  if (needsInitialMedia && layout.mediaSlots.some(slot => isWritableMediaSlot(slot) && slot.initialSrcSupported)) score += 6;
  if (normalizedMediaKind && layout.mediaSlots.some(slot => isWritableMediaSlot(slot) && slotAcceptsKind(slot, normalizedMediaKind))) score += 4;
  if (requestedMediaCount && layout.mediaSlots.some(slot => isWritableMediaSlot(slot) && Number(slot.defaultCount) === requestedMediaCount)) score += 3;
  score -= (Number(layout.pageNumber) || 0) / 1000;
  return score;
}

function getRequestedMediaCount({ plannedImages, providedImages, providedMedia, imageGen, needsVisual, mediaCount }) {
  const explicit = Number(mediaCount);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const provided = mediaIntentCount(providedImages) || mediaIntentCount(providedMedia);
  if (provided) return provided;
  const planned = mediaIntentCount(plannedImages);
  if (planned) return planned;
  if (imageGen || needsVisual) return 1;
  return 0;
}

function mediaIntentCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value === true) return 1;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.round(number);
  return 0;
}

function readManifest() {
  const file = path.join(ROOT, 'layout-manifest.json');
  if (!existsSync(file)) return { layouts: {} };
  return JSON.parse(readFileSync(file, 'utf8'));
}
