import {
  normalizeControlOptions,
  normalizeControlValue,
  normalizePublicControls,
  resolvePublicPropAliases,
} from './control-naming.mjs';

const REMOVED_CONTROL_TYPES = new Set(['text', 'string', 'input', 'url', 'email', 'textarea', 'multiline']);

export const COUNT_ARRAY_BINDINGS = {
  barCount: ['bars'],
  calloutCount: ['callouts'],
  cardCount: ['cards'],
  chipCount: ['chips'],
  colCount: ['columns', 'cols'],
  columnCount: ['columns', 'colsData', 'plans'],
  featureCount: ['features', 'plans[].feats'],
  indexCount: ['items', 'index'],
  itemCount: ['items', 'stats', 'data'],
  laneCount: ['lanes'],
  milestoneCount: ['milestones'],
  phaseCount: ['phases'],
  planCount: ['plans'],
  pointCount: ['points'],
  principleCount: ['principles', 'items'],
  roundCount: ['rounds'],
  rowCount: ['rows', 'rowsData', 'features'],
  segmentCount: ['segments'],
  segCount: ['segments', 'segs'],
  seriesCount: ['series'],
  statCount: ['stats'],
  stepCount: ['steps'],
  supportingCount: ['supporting'],
  tileCount: ['tiles'],
  wordCount: ['words'],
};

const MEDIA_COUNT_KEY_PATTERN = /^(image|images|imageSlot|media|photo|photos|picture|pictures|logo|logos|thumb|thumbs|avatar|avatars|frame)Count$/i;

export function createLayoutContracts(pages = []) {
  return new Map(pages.map(page => [page.key, createContract(page, page.themeKey)]));
}

export function normalizeSlidePropsForContract(layout, props = {}, contract = null) {
  const aliasResult = contract ? resolvePublicPropAliases(props, contract.controls) : { props: props || {} };
  const authoredProps = aliasResult.props || {};
  const authoredCounts = deriveAuthoredCounts(authoredProps, contract?.countBindings || []);
  const authoredCountErrors = contract ? validateExplicitCountBindings(authoredProps, contract.countBindings || []) : [];
  const shapeErrors = contract ? validateAuthoredPropShape(authoredProps, contract.defaultProps, contract) : [];
  const next = contract ? mergeDefaultArrayProps(authoredProps, contract) : { ...authoredProps };
  if (contract) applyMediaBackgroundMode(next, authoredProps, contract);
  if (!contract) return next;

  const errors = [...shapeErrors, ...authoredCountErrors];
  for (const binding of contract.countBindings) {
    const derived = deriveCount(next, binding);
    if (!derived) continue;

    if (derived.error) {
      errors.push(derived.error);
      continue;
    }

    const current = next[binding.key];
    if (current == null || current === '') {
      next[binding.key] = authoredCounts.get(binding.key) ?? derived.count;
      validateCountRange(binding, next[binding.key], binding.key, errors);
      continue;
    }

    const currentNumber = Number(current);
    if (!Number.isFinite(currentNumber)) {
      errors.push(`${binding.key} 不是有效数字`);
    } else {
      validateCountRange(binding, currentNumber, binding.key, errors);
      if (currentNumber > derived.count) {
        errors.push(`${binding.key}=${currentNumber},但 ${derived.source} 只有 ${derived.count} 条`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Slide props mismatch for "${layout}": ${errors.join('; ')}`);
  }
  return next;
}

export function buildLayoutManifestFromContracts(contracts) {
  return {
    version: 1,
    countArrayBindings: COUNT_ARRAY_BINDINGS,
    layouts: Object.fromEntries([...contracts.entries()].map(([key, contract]) => [key, serializeContract(contract)])),
  };
}

export function createContract(page, themePack) {
  const rawDefaultProps = serializeValue(page.defaultProps || {}) || {};
  const controls = clampCountControlLimits(normalizeControls(page), rawDefaultProps);
  const defaultProps = clampDefaultCountProps(rawDefaultProps, controls);
  const countBindings = controls
    .filter(control => !isBooleanControl(control))
    .map(control => {
      const declaredArrays = firstCountArrays(
        normalizeCountArrays(control.countArrays),
        COUNT_ARRAY_BINDINGS[control.key],
        inferCountArrayBindings(control.key, defaultProps),
        inferMediaCountArrayBindings(control.key, controls, defaultProps),
      );
      if (!declaredArrays.length) return { control, arrays: [] };
      const arrays = resolveCountBindingArrays({ key: control.key, arrays: declaredArrays, max: control.max }, defaultProps);
      return { control, arrays };
    })
    .filter(item => item.arrays.length)
    .map(({ control, arrays }) => ({
      key: control.key,
      publicKey: control.publicKey || control.key,
      label: control.label || control.publicLabel || control.key,
      arrays,
      min: control.min,
      max: control.max,
    }));
  const lengthBindings = inferLengthBindings(defaultProps, countBindings);

  return {
    key: page.key,
    themePack,
    pageNumber: page.pageNumber,
    label: page.label,
    slot: page.slot,
    dataLayout: page.layout,
    defaultProps,
    controls,
    countBindings,
    lengthBindings,
    propShapes: describePropShapes(defaultProps),
  };
}

function firstCountArrays(...candidates) {
  return candidates.find(candidate => Array.isArray(candidate) && candidate.length) || [];
}

export function clampCountControlLimits(controls = [], defaultProps = {}) {
  return (controls || []).map(control => {
    const limit = countControlLimit(control, defaultProps);
    if (limit == null) return control;
    const max = Number(control.max);
    const min = Number(control.min);
    const nextMax = Number.isFinite(min) ? Math.max(min, limit) : limit;
    if (!Number.isFinite(max) || max <= nextMax) return control;
    const next = { ...control, max: nextMax };
    const defaultValue = Number(next.default);
    if (Number.isFinite(defaultValue) && defaultValue > nextMax) next.default = nextMax;
    return next;
  });
}

export function clampDefaultCountProps(defaultProps = {}, controls = []) {
  const next = { ...(defaultProps || {}) };
  for (const control of controls || []) {
    const key = control?.key;
    if (!key || !Object.prototype.hasOwnProperty.call(next, key)) continue;
    const max = Number(control.max);
    const value = Number(next[key]);
    if (Number.isFinite(max) && Number.isFinite(value) && value > max) next[key] = max;
  }
  return next;
}

function countControlLimit(control, defaultProps = {}) {
  if (!control?.key || MEDIA_COUNT_KEY_PATTERN.test(control.key)) return null;
  const declaredArrays = normalizeCountArrays(control.countArrays);
  const arrays = firstCountArrays(
    declaredArrays,
    COUNT_ARRAY_BINDINGS[control.key],
    inferCountArrayBindings(control.key, defaultProps),
  );
  if (!arrays.length || arrays.some(isMediaCountPath)) return null;
  const counts = arrays.flatMap(pathName => collectArrayCounts(defaultProps, pathName).map(item => item.count));
  if (!counts.length) return null;
  if (declaredArrays?.length && arrays.some(isNestedArrayPath)) return Math.max(...counts);
  return Math.min(...counts);
}

function isMediaCountPath(pathName) {
  const key = String(pathName || '').split('.')[0].replace(/\[\]$/, '');
  return isMediaArrayKey(key) || /^(avatar|avatars)$/i.test(key);
}

function deriveAuthoredCounts(props, bindings) {
  const counts = new Map();
  for (const binding of bindings) {
    const derived = deriveCount(props, binding);
    if (derived && !derived.error) counts.set(binding.key, derived.count);
  }
  return counts;
}

function validateExplicitCountBindings(props = {}, bindings = []) {
  const errors = [];
  for (const binding of bindings || []) {
    const rawCount = props?.[binding.key] ?? props?.[binding.publicKey];
    if (rawCount == null || rawCount === '') continue;
    const count = Number(rawCount);
    if (!Number.isFinite(count)) continue;
    const mismatches = [];
    for (const arrayPath of binding.arrays || []) {
      if (isMediaArrayKey(rootArrayKey(arrayPath))) continue;
      for (const item of collectArrayCounts(props, arrayPath)) {
        if (item.count !== count) mismatches.push(`${item.source} has ${item.count}`);
      }
    }
    if (mismatches.length) {
      errors.push(`countBinding mismatch ${binding.key}=${count}; ${mismatches.join(', ')}; authored array lengths must match the count key`);
    }
  }
  return errors;
}

function mergeDefaultArrayProps(props, contract) {
  const next = { ...(props || {}) };
  const defaults = contract.defaultProps || {};
  for (const [arrayKey, value] of Object.entries(props || {})) {
    if (!Array.isArray(value) || !Array.isArray(defaults[arrayKey])) continue;
    if (isMediaArrayKey(arrayKey)) continue;
    next[arrayKey] = mergeArrayWithDefaultTail(value, defaults[arrayKey]);
  }
  return next;
}

function mergeArrayWithDefaultTail(items, defaults) {
  if (items.length >= defaults.length) {
    return items.map((item, index) => mergeArrayItem(defaults[index], item));
  }
  return [
    ...items.map((item, index) => mergeArrayItem(defaults[index], item)),
    ...defaults.slice(items.length).map(item => neutralizeDefaultCopy(item)),
  ];
}

function mergeArrayItem(defaultItem, item) {
  if (isPlainObject(defaultItem) && isPlainObject(item)) {
    return mergePlainObject(defaultItem, item);
  }
  return item;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergePlainObject(defaultValue, value) {
  const next = { ...defaultValue };
  for (const [key, item] of Object.entries(value || {})) {
    if (Array.isArray(item) && Array.isArray(defaultValue?.[key]) && !isMediaArrayKey(key)) {
      next[key] = mergeArrayWithDefaultTail(item, defaultValue[key]);
    } else if (isPlainObject(item) && isPlainObject(defaultValue?.[key])) {
      next[key] = mergePlainObject(defaultValue[key], item);
    } else {
      next[key] = item;
    }
  }
  return next;
}

function applyMediaBackgroundMode(props, authoredProps, contract) {
  if (Object.prototype.hasOwnProperty.call(authoredProps || {}, 'backgroundMode')) return;
  const defaultProps = contract.defaultProps || {};
  if (!Object.prototype.hasOwnProperty.call(defaultProps, 'backgroundMode')) return;
  // Pages whose contract defaults to the dynamic (unicorn) background keep it unless the author
  // explicitly opts into upload. Auto-flipping to 'media' just because an image slot was filled
  // would swap the dynamic backdrop for an empty upload placeholder.
  if (defaultProps.backgroundMode === 'unicorn') return;
  if (!backgroundModeSupportsMedia(contract.controls)) return;
  if (!hasAuthoredMedia(authoredProps)) return;
  props.backgroundMode = 'media';
}

function backgroundModeSupportsMedia(controls = []) {
  const control = controls.find(item => item?.key === 'backgroundMode' || item?.publicKey === 'backgroundMode');
  const options = Array.isArray(control?.options) ? control.options : [];
  return options.some(option => {
    if (typeof option === 'string') return option === 'media';
    return option?.value === 'media' || option?.key === 'media';
  });
}

function hasAuthoredMedia(props = {}) {
  return Object.entries(props || {}).some(([key, value]) => {
    if (!isMediaArrayKey(key)) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (isPlainObject(value)) return typeof value.src === 'string' && value.src.trim() !== '';
    return false;
  });
}

export function neutralizeDefaultCopy(value, field = '') {
  if (isSerializedReactElementLike(value)) return neutralizeDefaultCopy(reactElementText(value), field);
  if (typeof value === 'string') return shouldNeutralizeString(field, value) ? neutralPlaceholder(value) : value;
  if (Array.isArray(value)) return value.map(item => neutralizeDefaultCopy(item, field));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    neutralizeDefaultCopy(item, key),
  ]));
}

function shouldNeutralizeString(field, value) {
  if (!value) return false;
  if (/^(id|key|type|tone|color|colour|accent|variant|style|theme|layout|align|side|position|icon|href|url|src|fit|className|from|to|source|target|sourceId|targetId)$/i.test(field)) return false;
  if (/^(show|is|has)[A-Z_]/.test(field)) return false;
  if (/(Color|Colour|Tone|Variant|Style|Mode|Layout|Align|Side|Index|Id|Key|Url|Src|Fit|ClassName)$/i.test(field)) return false;
  if (/^(https?:|data:|#)/i.test(value)) return false;
  return true;
}

function neutralPlaceholder(value) {
  const length = Array.from(value).length;
  if (!length) return value;
  const seed = Array.from('请输入文本');
  return Array.from({ length }, (_, index) => seed[index % seed.length]).join('');
}

function serializeContract(contract) {
  const { defaultProps, propShapes, ...publicContract } = contract;
  return publicContract;
}

export function validateAuthoredPropShape(props = {}, defaults = {}, contract = null) {
  const errors = [];
  for (const [key, value] of Object.entries(props || {})) {
    if (isMediaArrayKey(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(defaults || {}, key)) continue;
    validateValueShape(value, defaults[key], `props.${key}`, errors);
  }
  validateFixedNestedArrayLengths(props, defaults, contract, errors);
  return errors;
}

function validateFixedNestedArrayLengths(props = {}, defaults = {}, contract = null, errors = []) {
  const lengthBound = new Set((contract?.lengthBindings || []).map(binding => binding.dependent));
  const countBound = new Set((contract?.countBindings || []).flatMap(binding => binding.arrays || []));
  for (const [rootKey, items] of Object.entries(props || {})) {
    if (!Array.isArray(items) || !Array.isArray(defaults?.[rootKey])) continue;
    items.forEach((item, index) => {
      if (!isPlainObject(item)) return;
      const defaultItem = defaults[rootKey][index] || defaults[rootKey].find(defaultCandidate => isPlainObject(defaultCandidate));
      if (!isPlainObject(defaultItem)) return;
      for (const [field, value] of Object.entries(item)) {
        if (!Array.isArray(value) || !Array.isArray(defaultItem[field])) continue;
        const pathName = `${rootKey}[].${field}`;
        if (lengthBound.has(pathName) || countBound.has(pathName)) continue;
        if (!isFixedCapacityArray(field, [defaultItem[field]])) continue;
        const expected = defaultItem[field].length;
        if (value.length !== expected) {
          errors.push(`props.${rootKey}[${index}].${field}: expected fixed length ${expected}`);
        }
      }
    });
  }
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

function validateValueShape(value, defaultValue, field, errors) {
  if (isSerializedReactElementLike(value)) {
    errors.push(`${field}: serialized React element is not allowed; use plain text`);
    return;
  }

  if (isSerializedReactElementLike(defaultValue)) {
    if (!['string', 'number'].includes(typeof value)) {
      errors.push(`${field}: expected string`);
    }
    return;
  }

  const primitive = primitiveShape(defaultValue);
  if (primitive) {
    validatePrimitiveValue(value, primitive, defaultValue, field, errors);
    return;
  }

  if (Array.isArray(defaultValue)) {
    if (!Array.isArray(value)) {
      errors.push(`${field}: expected array`);
      return;
    }
    validateArrayShape(value, defaultValue, field, errors);
    return;
  }

  if (isPlainObject(defaultValue)) {
    if (!isPlainObject(value)) {
      errors.push(`${field}: expected object`);
      return;
    }
    validateObjectShape(value, defaultValue, field, errors);
  }
}

function validateArrayShape(value, defaultItems, field, errors) {
  const shape = mergeObjectShape(defaultItems);
  if (shape) {
    const enumFields = enumFieldsForArrayItems(defaultItems);
    const numberBounds = numberBoundsForArrayItems(defaultItems);
    value.forEach((item, index) => {
      if (!isPlainObject(item)) {
        errors.push(`${field}[${index}]: expected object item`);
        return;
      }
      validateObjectShape(item, shape, `${field}[${index}]`, errors, enumFields, numberBounds);
    });
    return;
  }

  const tuple = tupleShapeForArrayItems(defaultItems);
  if (tuple) {
    value.forEach((item, index) => validateTupleValue(item, tuple, `${field}[${index}]`, errors));
    return;
  }

  const itemDefault = defaultItems.find(item => item != null);
  const itemPrimitive = primitiveShape(itemDefault);
  if (itemPrimitive) {
    value.forEach((item, index) => validatePrimitiveValue(item, itemPrimitive, itemDefault, `${field}[${index}]`, errors));
  }
}

function validateTupleValue(value, tuple, field, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${field}: expected array tuple`);
    return;
  }
  if (tuple.fixedLength != null && value.length !== tuple.items.length) {
    errors.push(`${field}: expected tuple length ${tuple.items.length}`);
  }
  const count = Math.min(value.length, tuple.items.length);
  for (let index = 0; index < count; index += 1) {
    validateValueShape(value[index], tuple.items[index], `${field}[${index}]`, errors);
  }
}

function validateObjectShape(value, shape, field, errors, enumFields = new Map(), numberBounds = new Map()) {
  const allowed = new Set(Object.keys(shape || {}));
  for (const [key, item] of Object.entries(value || {})) {
    if (!allowed.has(key)) {
      errors.push(`${field}.${key}: unknown nested prop; expected ${formatExpectedKeys(allowed)}`);
      continue;
    }
    const enumValues = enumFields.get(key);
    if (enumValues && typeof item === 'string' && !enumValues.has(item)) {
      errors.push(`${field}.${key}: expected one of ${formatExpectedKeys(enumValues)}`);
      continue;
    }
    const bounds = numberBounds.get(key);
    if (bounds) validateNumberBounds(item, bounds, `${field}.${key}`, errors);
    validateValueShape(item, shape[key], `${field}.${key}`, errors);
  }
}

function primitiveShape(value) {
  if (value == null || Array.isArray(value) || isPlainObject(value) || isSerializedReactElementLike(value)) return null;
  const type = typeof value;
  return ['string', 'number', 'boolean'].includes(type) ? type : null;
}

function validatePrimitiveValue(value, expected, defaultValue, field, errors) {
  if (expected === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${field}: expected number`);
    return;
  }
  if (expected === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${field}: expected boolean`);
    return;
  }
  if (expected !== 'string') return;
  if (typeof value !== 'string') {
    errors.push(`${field}: expected string`);
    return;
  }
  if (isColorConfigField(field, defaultValue) && !isCssColorLike(value)) {
    errors.push(`${field}: expected color`);
    return;
  }
  const enumValues = enumValuesForScalarField(field, defaultValue);
  if (enumValues && !enumValues.has(value)) {
    errors.push(`${field}: expected one of ${formatExpectedKeys(enumValues)}`);
  }
}

function enumFieldsForArrayItems(items = []) {
  const result = new Map();
  const objects = items.filter(isPlainObject);
  const keys = new Set(objects.flatMap(item => Object.keys(item)));
  for (const key of keys) {
    if (!isEnumFieldName(key)) continue;
    const values = objects
      .map(item => item?.[key])
      .filter(item => typeof item === 'string' && item.trim());
    if (!shouldInferEnumField(key, values, objects)) continue;
    const unique = new Set(values);
    if (unique.size) result.set(key, unique);
  }
  return result;
}

function shouldInferEnumField(key, values, objects) {
  if (!values.length) return false;
  if (!/^q$/i.test(String(key || ''))) return true;
  if (objects.some(hasQuestionCopyShape) && values.some(isQuestionCopyValue)) return false;
  return values.every(isTokenOptionValue);
}

function hasQuestionCopyShape(item) {
  return ['a', 'answer', 'desc', 'description'].some(key => typeof item?.[key] === 'string' && item[key].trim());
}

function isQuestionCopyValue(value) {
  const text = String(value || '').trim();
  return text.includes('?') || text.includes('？') || Array.from(text).length > 12;
}

function isTokenOptionValue(value) {
  return /^[A-Za-z0-9_-]{1,32}$/.test(String(value || '').trim());
}

function numberBoundsForArrayItems(items = []) {
  const result = new Map();
  const objects = items.filter(isPlainObject);
  const keys = new Set(objects.flatMap(item => Object.keys(item)));
  for (const key of keys) {
    const bounds = numberBoundsForValues(objects.map(item => item?.[key]));
    if (bounds) result.set(key, bounds);
  }
  return result;
}

function numberBoundsForValues(values = []) {
  const numbers = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (numbers.length < 2) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return {
    min: min >= 0 ? 0 : min * 1.1,
    max: max <= 0 ? 0 : max * 1.1,
  };
}

function validateNumberBounds(value, bounds, field, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  if (value < bounds.min) errors.push(`${field}: expected >= ${formatNumber(bounds.min)}`);
  if (value > bounds.max) errors.push(`${field}: expected <= ${formatNumber(bounds.max)}`);
}

function enumValuesForScalarField(field, defaultValue) {
  const name = fieldName(field);
  if (name === 'theme' && ['light', 'dark'].includes(defaultValue)) return new Set(['light', 'dark']);
  return null;
}

function isEnumFieldName(name) {
  return /^(q|key|id|type|kind|mode|variant|theme|tone|side|align|position|status|state)$/i.test(String(name || ''));
}

function isColorConfigField(field, defaultValue) {
  const name = fieldName(field);
  return isCssColorLike(defaultValue) && /^(c|color|colour|accent|fill|stroke|background|bg|tint|hex)$/i.test(name);
}

function fieldName(field) {
  return String(field || '').split('.').pop()?.replace(/\[\d+\]$/, '') || '';
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function isCssColorLike(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(text)
    || /^(rgb|rgba|hsl|hsla)\(/i.test(text)
    || /^var\(--[A-Za-z0-9_-]+\)$/.test(text)
    || /^(transparent|currentColor|black|white)$/i.test(text);
}

export function describePropShapes(defaultProps = {}, keys = Object.keys(defaultProps || {})) {
  return Object.fromEntries([...new Set(keys)]
    .filter(key => Object.prototype.hasOwnProperty.call(defaultProps || {}, key))
    .map(key => [key, describeValueShape(defaultProps[key])]));
}

function describeValueShape(value) {
  if (isSerializedReactElementLike(value)) return 'string';
  if (Array.isArray(value)) {
    const objectShape = mergeObjectShape(value);
    if (objectShape) return [describeValueShape(objectShape)];
    const tuple = tupleShapeForArrayItems(value);
    if (tuple) return [tuple.items.map(describeValueShape)];
    return value.length ? [describeValueShape(value[0])] : [];
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, describeValueShape(item)]));
  }
  if (value == null) return 'null';
  return typeof value;
}

function mergeObjectShape(items) {
  const objects = items.filter(isPlainObject);
  if (!objects.length) return null;
  return objects.reduce((shape, item) => mergeShape(shape, item), {});
}

function mergeShape(left, right) {
  const next = { ...(left || {}) };
  for (const [key, value] of Object.entries(right || {})) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      next[key] = value;
    } else {
      next[key] = mergeShapeValue(next[key], value);
    }
  }
  return next;
}

function mergeShapeValue(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) return mergeObjectShape([...left, ...right]) ? [...left, ...right] : left;
  if (isPlainObject(left) && isPlainObject(right)) return mergeShape(left, right);
  return left;
}

function tupleShapeForArrayItems(items) {
  const arrays = (items || []).filter(Array.isArray);
  if (!arrays.length) return null;
  const fixedLength = arrays.every(item => item.length === arrays[0].length) ? arrays[0].length : null;
  const length = fixedLength ?? Math.max(...arrays.map(item => item.length));
  const tupleItems = Array.from({ length }, (_, index) => mergeTupleItemShape(arrays.map(item => item[index]).filter(item => item !== undefined)));
  return { items: tupleItems, fixedLength };
}

function mergeTupleItemShape(values) {
  const objects = values.filter(isPlainObject);
  if (objects.length) return mergeObjectShape(objects);
  const arrays = values.filter(Array.isArray);
  if (arrays.length) return tupleShapeForArrayItems(arrays).items;
  return values.find(item => item != null);
}

function formatExpectedKeys(keys) {
  const list = [...keys].slice(0, 8).join(', ');
  return keys.size > 8 ? `${list}, ...` : list;
}

export function isMediaArrayKey(key) {
  return /^(images|media|photos|pictures|logos|thumbs|imageSlots|imgs)$/i.test(String(key || ''));
}

function inferCountArrayBindings(key, props = {}) {
  if (!String(key || '').endsWith('Count')) return [];
  const arrayPaths = contentArrayPaths(props);
  if (!arrayPaths.length) return [];

  const stem = lowerFirst(String(key).slice(0, -'Count'.length));
  const candidates = buildCountArrayCandidates(stem);
  for (const candidate of candidates) {
    const exact = arrayPaths.find(propKey => propKey === candidate);
    if (exact) return [exact];
  }

  for (const candidate of candidates) {
    const exactField = arrayPaths.find(propKey => arrayPathField(propKey) === candidate);
    if (exactField) return [exactField];
  }

  const normalizedCandidates = new Set(candidates.map(normalizeName));
  const normalized = arrayPaths.find(propKey => normalizedCandidates.has(normalizeName(propKey)));
  if (normalized) return [normalized];
  const normalizedField = arrayPaths.find(propKey => normalizedCandidates.has(normalizeName(arrayPathField(propKey))));
  return normalizedField ? [normalizedField] : [];
}

function inferMediaCountArrayBindings(key, controls = [], defaultProps = {}) {
  if (!MEDIA_COUNT_KEY_PATTERN.test(String(key || ''))) return [];
  const mediaArrays = [
    ...(controls || [])
      .map(control => control?.key)
      .filter(controlKey => controlKey && isMediaArrayKey(controlKey)),
    ...Object.keys(defaultProps || {})
      .filter(propKey => Array.isArray(defaultProps[propKey]) && isMediaArrayKey(propKey)),
  ];
  const candidatesPool = [...new Set(mediaArrays)];
  if (!candidatesPool.length) return [];
  const stem = lowerFirst(String(key).slice(0, -'Count'.length));
  const candidates = buildCountArrayCandidates(stem);
  for (const candidate of candidates) {
    const exact = candidatesPool.find(controlKey => controlKey === candidate);
    if (exact) return [exact];
  }
  const normalizedCandidates = new Set(candidates.map(normalizeName));
  const normalized = candidatesPool.find(controlKey => normalizedCandidates.has(normalizeName(controlKey)));
  return normalized ? [normalized] : [];
}

function contentArrayPaths(props = {}) {
  const paths = [];
  for (const [key, value] of Object.entries(props || {})) {
    if (Array.isArray(value)) {
      if (!isMediaArrayKey(key) && !isColorArray(value)) paths.push(key);
      for (const pathName of nestedArrayPaths(value, key)) paths.push(pathName);
      continue;
    }
    if (!isPlainObject(value)) continue;
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (Array.isArray(nestedValue) && !isMediaArrayKey(nestedKey) && !isColorArray(nestedValue)) {
        paths.push(`${key}.${nestedKey}`);
      }
      if (Array.isArray(nestedValue)) {
        for (const pathName of nestedArrayPaths(nestedValue, `${key}.${nestedKey}`)) paths.push(pathName);
      }
    }
  }
  return [...new Set(paths)];
}

function nestedArrayPaths(items, prefix) {
  const paths = [];
  for (const item of items || []) {
    if (!isPlainObject(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (!Array.isArray(value)) continue;
      if (!isMediaArrayKey(key) && !isColorArray(value)) paths.push(`${prefix}[].${key}`);
      for (const pathName of nestedArrayPaths(value, `${prefix}[].${key}`)) paths.push(pathName);
    }
  }
  return paths;
}

function arrayPathField(pathName) {
  return String(pathName || '').split('.').at(-1)?.replace(/\[\]$/, '') || '';
}

function resolveCountBindingArrays(binding, defaultProps = {}) {
  const declared = Array.isArray(binding?.arrays) ? binding.arrays : [];
  const kept = declared.filter(pathName => arrayPathExists(defaultProps, pathName));
  if (kept.length) return narrowCountBindingArrays(binding, kept);
  const paths = contentArrayPaths(defaultProps);
  const byField = declared
    .flatMap(pathName => paths.filter(candidate => arrayPathField(candidate) === arrayPathField(pathName)));
  if (byField.length) return [...new Set(byField)];
  const normalizedFields = new Set(declared.map(pathName => normalizeName(arrayPathField(pathName))).filter(Boolean));
  const byNormalizedField = paths.filter(candidate => normalizedFields.has(normalizeName(arrayPathField(candidate))));
  if (byNormalizedField.length) return byNormalizedField;
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
  const field = normalizeName(arrayPathField(pathName));
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

function arrayPathExists(defaultProps, pathName) {
  if (String(pathName || '').includes('[]')) return collectArrayCounts(defaultProps, pathName).length > 0;
  return Array.isArray(valueAtPath(defaultProps, String(pathName || '').replace(/\[\]/g, '')));
}

function valueAtPath(value, pathName) {
  let current = value;
  for (const segment of String(pathName || '').split('.')) {
    if (!segment) continue;
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function contentArrayKeys(defaultProps = {}) {
  return Object.keys(defaultProps || {})
    .filter(key => Array.isArray(defaultProps[key]) && !isMediaArrayKey(key) && !isColorArray(defaultProps[key]));
}

function inferLengthBindings(defaultProps = {}, countBindings = []) {
  const paths = contentArrayPaths(defaultProps);
  const topLevelArrays = contentArrayKeys(defaultProps);
  const bindingByArray = countBindingByArray(countBindings);
  const result = [];

  for (const dependent of paths.filter(isNestedArrayPath)) {
    if (bindingByArray.has(dependent)) continue;
    const counts = collectArrayCounts(defaultProps, dependent);
    const lengths = [...new Set(counts.map(item => item.count))];
    if (lengths.length !== 1 || lengths[0] <= 0) continue;

    const root = rootArrayKey(dependent);
    const anchor = chooseLengthAnchor({
      dependent,
      defaultProps,
      length: lengths[0],
      root,
      topLevelArrays,
      bindingByArray,
    });
    if (!anchor) continue;

    const anchorBinding = bindingByArray.get(anchor);
    result.push({
      relation: 'same-length',
      dependent,
      anchor,
      ...(anchorBinding ? { countKey: anchorBinding.publicKey || anchorBinding.key } : {}),
      defaultCount: lengths[0],
    });
  }

  return result;
}

function countBindingByArray(countBindings = []) {
  const result = new Map();
  for (const binding of countBindings || []) {
    for (const arrayPath of binding.arrays || []) {
      if (!result.has(arrayPath)) result.set(arrayPath, binding);
    }
  }
  return result;
}

function chooseLengthAnchor({ dependent, defaultProps, length, root, topLevelArrays, bindingByArray }) {
  const candidates = topLevelArrays
    .filter(key => key !== root && defaultProps[key].length === length)
    .map(key => ({
      key,
      score: lengthAnchorScore(key, dependent, bindingByArray),
    }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  if (!candidates.length) return null;
  if (candidates[0].score < 3) return null;
  if (candidates[1] && candidates[1].score === candidates[0].score) return null;
  return candidates[0].key;
}

function lengthAnchorScore(anchor, dependent, bindingByArray) {
  const anchorName = normalizeName(anchor);
  const dependentField = normalizeName(arrayPathField(dependent));
  let score = 0;
  if (/(labels?|periods?|quarters?|months?|weeks?|years?|days?|columns?|cols?|headers?|ticks?|axes?|axis|segments?|categories?|dims?|dimensions?)(data)?$/.test(anchorName)) score += 4;
  if (bindingByArray.has(anchor)) score += 2;
  if (/^(values?|vals?|parts?|scores?|amounts?|totals?|data|series)$/.test(dependentField)) score += 1;
  return score;
}

function rootArrayKey(pathName) {
  return String(pathName || '').split('.')[0].replace(/\[\]$/, '');
}

function isColorArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isColorString);
}

function isColorString(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(text) || /^(rgb|rgba|hsla?)\(/i.test(text);
}

function buildCountArrayCandidates(stem) {
  const explicit = {
    agenda: ['agenda', 'items'],
    annotation: ['annotations'],
    asset: ['assets'],
    axis: ['axes'],
    block: ['blocks'],
    branch: ['branches'],
    bubble: ['bubbles'],
    cat: ['categories', 'data'],
    category: ['categories'],
    chain: ['chains', 'chain'],
    conclusion: ['conclusions', 'points'],
    criterion: ['criteria'],
    dim: ['dims', 'dimensions'],
    dimension: ['dimensions', 'dims'],
    exp: ['experiences'],
    factor: ['factors'],
    feature: ['features'],
    field: ['fields'],
    flowStage: ['flow', 'stages'],
    frame: ['frames', 'media'],
    funnelStage: ['funnel', 'stages'],
    group: ['groups', 'layers'],
    image: ['images', 'media'],
    imageSlot: ['images', 'imageSlots', 'media'],
    img: ['images', 'imgs', 'media'],
    info: ['infoList', 'infos'],
    lab: ['labs'],
    leaf: ['leaves', 'branches'],
    line: ['lines'],
    logo: ['logos', 'images'],
    media: ['media', 'images'],
    member: ['members', 'avatars', 'media'],
    meta: ['meta'],
    objective: ['objectives'],
    petal: ['petals', 'items'],
    photo: ['photos', 'media', 'images'],
    region: ['regions', 'data'],
    ring: ['rings'],
    scene: ['scenes'],
    secondary: ['secondaries'],
    set: ['sets'],
    skill: ['skills'],
    stack: ['stacks', 'stackLabels', 'items'],
    takeaway: ['takeaways'],
    task: ['tasks'],
    thumb: ['thumbs', 'images'],
    track: ['tracks', 'media'],
  };
  return [
    stem,
    pluralize(stem),
    `${stem}List`,
    `${stem}Items`,
    ...(explicit[stem] || []),
  ];
}

function lowerFirst(value) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
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

function normalizeControls(page) {
  if (page.spec?.controls) {
    const defaults = {};
    page.spec.controls.forEach(control => {
      if (control.prop) defaults[control.prop] = control.default;
    });
    return normalizePublicControls(page.spec.controls.filter(control => !isRemovedControl(control)).map(control => normalizeControl({
      key: control.prop,
      label: control.label,
      desc: control.desc || control.description || control.describe,
      type: control.type,
      defaultValue: control.default,
      min: control.min,
      max: control.max,
      step: control.step,
      options: control.options,
      countKey: control.countKey,
      countIndex: control.countIndex,
      countArrays: control.countArrays,
      maxFromKey: control.maxFromKey,
      maxFromKeyOffset: control.maxFromKeyOffset,
      maxByKey: control.maxByKey,
      maxByValue: control.maxByValue,
      displayOffset: control.displayOffset,
      display: control.display,
      dependsOn: control.dependsOn,
      dependsOnValue: control.dependsOnValue,
      dependsOnValues: control.dependsOnValues,
    }, defaults)), { layout: page.key, themeKey: page.themeKey });
  }

  return normalizePublicControls((page.controls || []).filter(control => !isRemovedControl(control)).map(control => normalizeControl({
    key: control.key || control.prop,
    label: control.label,
    desc: control.desc || control.description || control.describe,
    type: control.type,
    defaultValue: control.default ?? control.def,
    min: control.min,
    max: control.max,
    step: control.step,
    options: control.options,
    countKey: control.countKey,
    countIndex: control.countIndex,
    countArrays: control.countArrays,
    maxFromKey: control.maxFromKey,
    maxFromKeyOffset: control.maxFromKeyOffset,
    maxByKey: control.maxByKey,
    maxByValue: control.maxByValue,
    displayOffset: control.displayOffset,
    display: control.display,
    dependsOn: control.dependsOn,
    dependsOnValue: control.dependsOnValue,
    dependsOnValues: control.dependsOnValues,
  }, page.defaultProps || {})), { layout: page.key, themeKey: page.themeKey });
}

function isRemovedControl(control) {
  return REMOVED_CONTROL_TYPES.has(String(control?.type || '').toLowerCase());
}

function normalizeControl(control, defaults) {
  return {
    key: control.key,
    label: control.label || control.key,
    type: normalizeControlType(control.type),
    default: serializeValue(control.defaultValue),
    min: resolveControlValue(control.min, defaults),
    max: resolveControlValue(control.max, defaults),
    step: serializeValue(control.step),
    options: normalizeControlOptions(serializeValue(control.options)),
    countKey: serializeValue(control.countKey),
    countIndex: serializeValue(control.countIndex),
    countArrays: serializeValue(control.countArrays),
    maxFromKey: serializeValue(control.maxFromKey),
    maxFromKeyOffset: serializeValue(control.maxFromKeyOffset),
    maxByKey: serializeValue(control.maxByKey),
    maxByValue: serializeValue(control.maxByValue),
    displayOffset: serializeValue(control.displayOffset),
    display: serializeValue(control.display),
    dependsOn: serializeValue(control.dependsOn),
    dependsOnValue: serializeValue(control.dependsOnValue),
    dependsOnValues: serializeValue(control.dependsOnValues),
    desc: control.desc,
  };
}

function normalizeCountArrays(value) {
  if (typeof value === 'string' && value) return [value];
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string' && item);
  return null;
}

function isBooleanControl(control) {
  return control?.type === 'toggle' || typeof control?.default === 'boolean';
}

function normalizeControlType(type) {
  if (type === 'slider' || type === 'number') return 'range';
  if (type === 'icons') return 'icons';
  if (type === 'images') return 'images';
  if (type === 'radio' || type === 'enum' || type === 'labelType' || type === 'segment' || type === 'color' || type === 'palette') return 'select';
  if (type === 'focus' || type === 'boolean') return 'toggle';
  return type || 'range';
}

function deriveCount(props, binding) {
  if (binding.key === 'phaseCount') return derivePhaseCount(props);

  const counts = binding.arrays.flatMap(key => collectArrayCounts(props, key));

  if (!counts.length) return null;
  if (binding.arrays.some(isNestedArrayPath)) return collapseNestedCounts(counts);
  return collapseCounts(counts);
}

function collectArrayCounts(value, pathName, sourcePrefix = '') {
  if (!value || typeof value !== 'object') return [];
  const [segment, ...restParts] = String(pathName || '').split('.');
  const rest = restParts.join('.');
  const arraySegment = segment.endsWith('[]');
  const key = arraySegment ? segment.slice(0, -2) : segment;
  const next = value[key];
  const source = sourcePrefix ? `${sourcePrefix}.${key}` : key;

  if (arraySegment) {
    if (!Array.isArray(next)) return [];
    if (!rest) return [{ source, count: next.length }];
    return next.flatMap((item, index) => collectArrayCounts(item, rest, `${source}[${index}]`));
  }

  if (!rest) {
    return Array.isArray(next) ? [{ source, count: next.length }] : [];
  }
  return collectArrayCounts(next, rest, source);
}

function isNestedArrayPath(pathName) {
  return String(pathName || '').includes('[].');
}

function derivePhaseCount(props) {
  const counts = [];
  if (Array.isArray(props.phases)) counts.push({ source: 'phases', count: props.phases.length });
  if (Array.isArray(props.lanes)) {
    props.lanes.forEach((lane, index) => {
      if (Array.isArray(lane?.items)) {
        counts.push({ source: `lanes[${index}].items`, count: lane.items.length });
      }
    });
  }
  if (!counts.length) return null;
  return collapseCounts(counts);
}

function collapseCounts(counts) {
  const unique = [...new Set(counts.map(item => item.count))];
  if (unique.length > 1) {
    return {
      error: counts.map(item => `${item.source}=${item.count}`).join(', ') + ' 数量不一致',
    };
  }
  return {
    count: unique[0],
    source: counts.map(item => item.source).join('/'),
  };
}

function collapseNestedCounts(counts) {
  return {
    count: Math.min(...counts.map(item => item.count)),
    source: counts.map(item => `${item.source}=${item.count}`).join('/'),
  };
}

function validateCountRange(binding, count, source, errors) {
  const min = Number(binding.min);
  const max = Number(binding.max);
  if (Number.isFinite(min) && count < min) {
    errors.push(`${source} 的数量 ${count} 小于 ${binding.key} 最小值 ${min}`);
  }
  if (Number.isFinite(max) && count > max) {
    errors.push(`${source} 的数量 ${count} 大于最大值 ${max}`);
  }
}

function resolveControlValue(value, defaults) {
  if (typeof value === 'function') return serializeValue(value(defaults));
  return serializeValue(value);
}

export function serializeValue(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (isSerializedReactElementLike(value)) return reactElementText(value);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, serializeValue(item)])
      .filter(([, item]) => item !== undefined),
  );
}

export function isSerializedReactElementLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!value.props || typeof value.props !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(value, 'type')
    || Object.prototype.hasOwnProperty.call(value, 'ref')
    || Object.prototype.hasOwnProperty.call(value, 'key')
    || Object.prototype.hasOwnProperty.call(value, '_owner')
    || Object.prototype.hasOwnProperty.call(value, '_store');
}

export function reactElementText(value) {
  if (value == null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(reactElementText).join('');
  if (!value || typeof value !== 'object') return '';
  if (String(value.type || '').toLowerCase() === 'br') return '\n';
  if (isSerializedReactElementLike(value)) return reactElementText(value.props?.children);
  return '';
}
