const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();
const rnPlatform = { OS: 'web' };

function load(name) {
  const file = path.join(root, name + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)((id) => {
    if (id === 'react-native') {
      return {
        Platform: rnPlatform,
        Image: { getSize: (_uri, ok) => ok(100, 100) },
      };
    }
    if (id === 'expo-image-manipulator') {
      return {
        SaveFormat: { JPEG: 'jpeg' },
        manipulateAsync: async () => ({ uri: 'file://cropped.jpg', width: 800, height: 800 }),
      };
    }
    if (id.startsWith('@/')) return load(id.slice(2));
    return require(id);
  }, module, module.exports);
  return module.exports;
}

const {
  computeSquareCropRect,
  cropImageLayout,
  clampCropFocus,
  DEFAULT_CROP_FOCUS,
  proposeCropFocus,
} = load('lib/profileImageCrop');

test('default focus crops the centered cover square on a landscape image', () => {
  const rect = computeSquareCropRect(2000, 1000, DEFAULT_CROP_FOCUS);
  assert.equal(rect.width, 1000);
  assert.equal(rect.height, 1000);
  assert.equal(rect.originX, 500);
  assert.equal(rect.originY, 0);
});

test('default focus crops the centered cover square on a portrait image', () => {
  const rect = computeSquareCropRect(800, 1600, DEFAULT_CROP_FOCUS);
  assert.equal(rect.width, 800);
  assert.equal(rect.height, 800);
  assert.equal(rect.originX, 0);
  assert.equal(rect.originY, 400);
});

test('zoom-in shrinks the crop window and keeps it in bounds', () => {
  const rect = computeSquareCropRect(1200, 1200, { x: 50, y: 50, zoom: 2 });
  assert.equal(rect.width, 600);
  assert.equal(rect.height, 600);
  assert.equal(rect.originX, 300);
  assert.equal(rect.originY, 300);
});

test('focal point 0,0 pins the crop to the top-left', () => {
  const rect = computeSquareCropRect(2000, 1000, { x: 0, y: 0, zoom: 1 });
  assert.equal(rect.originX, 0);
  assert.equal(rect.originY, 0);
  assert.equal(rect.width, 1000);
});

test('focal point 100,100 pins the crop to the bottom-right', () => {
  const rect = computeSquareCropRect(2000, 1000, { x: 100, y: 100, zoom: 1 });
  assert.equal(rect.originX, 1000);
  assert.equal(rect.originY, 0);
});

test('clampCropFocus rejects NaN and out-of-range zoom', () => {
  const f = clampCropFocus({ x: NaN, y: 200, zoom: 0.2 });
  assert.equal(f.x, 50);
  assert.equal(f.y, 100);
  assert.equal(f.zoom, 1);
});

test('cropImageLayout maps the crop rect to the square viewport', () => {
  const layout = cropImageLayout(2000, 1000, 300, DEFAULT_CROP_FOCUS);
  assert.equal(layout.width, 600);
  assert.equal(layout.height, 300);
  assert.equal(layout.left, -150);
  assert.ok(layout.top === 0);
});

test('profile crop helpers and cropper UI are wired into portrait entry points', () => {
  const files = [
    'lib/profileImageCrop.ts',
    'components/ProfileImageCropper.tsx',
    'hooks/usePortraitPicker.tsx',
    'components/InitialRealtorSetup.tsx',
    'components/NeutralContentCanvas.tsx',
    'app/admin/index.tsx',
    'app/admin/studio.tsx',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(src.length > 100, rel);
  }
  const setup = fs.readFileSync(path.join(root, 'components/InitialRealtorSetup.tsx'), 'utf8');
  assert.match(setup, /usePortraitPicker/);
  assert.match(setup, /editPortrait/);
  const admin = fs.readFileSync(path.join(root, 'app/admin/index.tsx'), 'utf8');
  assert.match(admin, /portraitCropper|editPortrait/);
  const studio = fs.readFileSync(path.join(root, 'app/admin/studio.tsx'), 'utf8');
  assert.match(studio, /usePortraitPicker/);
  assert.match(studio, /editPortrait/);
});

test('proposeCropFocus biases tall portraits toward the upper third', () => {
  const f = proposeCropFocus(800, 1600);
  assert.equal(f.x, 50);
  assert.ok(f.y < 50, 'face-biased y should sit above center');
  assert.ok(f.zoom >= 1 && f.zoom <= 3);
});

test('proposeCropFocus zooms in on wide landscapes', () => {
  const f = proposeCropFocus(2400, 1000);
  assert.ok(f.zoom > 1, 'wide shots need zoom so the square is not empty sky');
});

test('avatar edit opens adjust for existing photos (not force-upload)', () => {
  const picker = fs.readFileSync(path.join(root, 'hooks/usePortraitPicker.tsx'), 'utf8');
  assert.match(picker, /editPortrait/);
  assert.match(picker, /onReplace/);
  assert.match(picker, /Adjust|existing|reposition|crop\/reposition/i);
  const cropper = fs.readFileSync(path.join(root, 'components/ProfileImageCropper.tsx'), 'utf8');
  assert.match(cropper, /proposeCropFocus/);
  assert.match(cropper, /Replace photo/);
  const admin = fs.readFileSync(path.join(root, 'app/admin/index.tsx'), 'utf8');
  assert.match(admin, /editPortrait\(brandData\.portraitUrl\)/);
});
