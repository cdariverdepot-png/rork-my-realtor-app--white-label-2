const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

test('theme editor carousel uses nested horizontal pager + vertical ScrollView', () => {
  const src = fs.readFileSync(path.join(root, 'components/ThemeCarousel.tsx'), 'utf8');
  assert.match(src, /from "react-native-gesture-handler"/);
  assert.match(src, /pagingEnabled/);
  assert.match(src, /nestedScrollEnabled/);
  assert.match(src, /directionalLockEnabled/);
  assert.match(src, /<FlatList[\s\S]*horizontal/);
  assert.match(src, /<ScrollView[\s\S]*nestedScrollEnabled/);
  assert.doesNotMatch(src, /FanCarousel/);
});

test('theme preview modal pages themes with nested vertical scroll', () => {
  const src = fs.readFileSync(path.join(root, 'components/ThemePreviewModal.tsx'), 'utf8');
  assert.match(src, /from "react-native-gesture-handler"/);
  assert.match(src, /pagingEnabled/);
  assert.match(src, /nestedScrollEnabled/);
  assert.match(src, /directionalLockEnabled/);
  assert.match(src, /slides/);
  // Must not wrap the pager in a competing pan that steals vertical scroll.
  assert.doesNotMatch(src, /Gesture\.Pan\(\)/);
});
