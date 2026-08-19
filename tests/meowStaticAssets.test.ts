import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path, { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public', 'meow-generator');

const requiredFiles = [
  'vendor/meow-generator/package.json',
  'vendor/meow-generator/src/main.js',
  'vendor/meow-generator/LICENSE',
  'vendor/meow-generator/COMMERCIAL-LICENSE.md',
  'vendor/meow-generator/UPSTREAM.md',
  'public/meow-generator/index.html',
  'public/meow-generator/LICENSE',
  'public/meow-generator/UPSTREAM.md',
];

const requiredDirectories = [
  'vendor/meow-generator/shots',
  'vendor/meow-generator/third_party/mesh2motion',
];

const isWithin = (root: string, candidate: string) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const isLocalReference = (reference: string) =>
  reference !== '' && !reference.startsWith('#') && !reference.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(reference);

type AssetReference = {
  tagName: 'script' | 'link';
  attribute: 'src' | 'href';
  value: string;
};

const extractAssetReferences = (html: string): AssetReference[] => {
  const uncommentedHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const htmlWithoutRawText = uncommentedHtml
    .replace(/(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?<\/script\s*>/gi, '$1</script>')
    .replace(/(<style\b(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?<\/style\s*>/gi, '$1</style>');
  const references: AssetReference[] = [];
  const tagPattern = /<(script|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

  for (const tagMatch of htmlWithoutRawText.matchAll(tagPattern)) {
    const tagName = tagMatch[1].toLowerCase() as AssetReference['tagName'];
    const attributePattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

    for (const attributeMatch of tagMatch[2].matchAll(attributePattern)) {
      const attribute = attributeMatch[1].toLowerCase();
      if (attribute !== 'src' && attribute !== 'href') continue;

      references.push({
        tagName,
        attribute,
        value: (attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? '').trim(),
      });
    }
  }

  return references;
};

test('includes the required vendored and public Meow Generator assets', () => {
  const missingOrInvalid = [
    ...requiredFiles.filter((relativePath) => {
      const target = path.join(projectRoot, relativePath);
      return !existsSync(target) || !statSync(target).isFile();
    }),
    ...requiredDirectories.filter((relativePath) => {
      const target = path.join(projectRoot, relativePath);
      return !existsSync(target) || !statSync(target).isDirectory();
    }),
  ];

  assert.deepEqual(missingOrInvalid, [], `Missing or invalid Meow Generator assets:\n${missingOrInvalid.join('\n')}`);
});

test('keeps every local script and link reference inside the public Meow Generator directory', () => {
  const indexPath = path.join(publicRoot, 'index.html');
  assert.ok(existsSync(indexPath), 'public/meow-generator/index.html must exist before its references can be checked');

  const html = readFileSync(indexPath, 'utf8');
  const assetReferences = extractAssetReferences(html);
  const scriptSources = assetReferences
    .filter(({ tagName, attribute }) => tagName === 'script' && attribute === 'src')
    .map(({ value }) => value)
    .filter(isLocalReference);
  assert.ok(scriptSources.length > 0, 'public/meow-generator/index.html must include at least one local script src');

  const references = assetReferences
    .map(({ value }) => value)
    .filter(isLocalReference);
  const canonicalRoot = realpathSync(publicRoot);
  const pageUrl = new URL('https://local.invalid/meow-generator/index.html');

  for (const reference of references) {
    const resolvedUrl = new URL(reference, pageUrl);
    assert.ok(
      resolvedUrl.pathname.startsWith('/meow-generator/'),
      `Local reference escapes public/meow-generator: ${reference}`,
    );

    const relativePath = decodeURIComponent(resolvedUrl.pathname.slice('/meow-generator/'.length));
    const target = path.resolve(publicRoot, relativePath);
    assert.ok(isWithin(publicRoot, target), `Local reference escapes public/meow-generator: ${reference}`);
    assert.ok(existsSync(target), `Local Meow Generator asset does not exist: ${reference}`);
    assert.ok(statSync(target).isFile(), `Local Meow Generator reference is not a file: ${reference}`);
    assert.ok(
      isWithin(canonicalRoot, realpathSync(target)),
      `Local reference resolves outside public/meow-generator: ${reference}`,
    );
  }
});

test('ships the latest happiness-card copy and dedicated layout in public bundles', () => {
  const indexPath = path.join(publicRoot, 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  const bundleText = extractAssetReferences(html)
    .map(({ value }) => value)
    .filter(isLocalReference)
    .filter((reference) => /\.(?:js|css)(?:[?#]|$)/i.test(reference))
    .map((reference) => {
      const resolvedUrl = new URL(reference, 'https://local.invalid/meow-generator/index.html');
      const relativePath = decodeURIComponent(resolvedUrl.pathname.slice('/meow-generator/'.length));
      return readFileSync(path.resolve(publicRoot, relativePath), 'utf8');
    })
    .join('\n');

  assert.match(bundleText, /JIEYOU×生命万岁企划/);
  assert.match(bundleText, /GXMU/);
  assert.match(bundleText, /（P）/);
  assert.match(bundleText, /欲买桂花同载酒，终不似，少年游。希望你的幸福能一直陪着你😊/);
  assert.match(bundleText, /data-happiness/);
  assert.match(bundleText, /share-card-live-title/);
  assert.match(bundleText, /jieyou:happiness-star-context/);
  assert.match(bundleText, /createdAt/);
  assert.match(bundleText, /日期未知/);
});
