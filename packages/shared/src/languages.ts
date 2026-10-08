/**
 * File classification: language detection by extension, code vs. data,
 * generated/vendored detection, tests, lockfiles, CI configs.
 */
import { basename } from './format.js';

interface LangDef {
  name: string;
  /** Real source code (eligible for bosses, TODO scanning). */
  code: boolean;
  /** Average bytes per line used to estimate LOC when a file wasn't fetched. */
  bpl: number;
}

const L = (name: string, code = true, bpl = 32): LangDef => ({ name, code, bpl });

const EXT: Record<string, LangDef> = {
  js: L('JavaScript'), mjs: L('JavaScript'), cjs: L('JavaScript'), jsx: L('JavaScript'),
  ts: L('TypeScript'), mts: L('TypeScript'), cts: L('TypeScript'), tsx: L('TypeScript'),
  py: L('Python', true, 34), pyi: L('Python', true, 34), pyx: L('Cython', true, 34),
  go: L('Go', true, 28),
  rs: L('Rust', true, 32),
  c: L('C', true, 28), h: L('C', true, 30),
  cc: L('C++'), cpp: L('C++'), cxx: L('C++'), hpp: L('C++'), hh: L('C++'), hxx: L('C++'), ipp: L('C++'), inl: L('C++'),
  java: L('Java', true, 34),
  kt: L('Kotlin'), kts: L('Kotlin'),
  swift: L('Swift'),
  rb: L('Ruby', true, 28),
  php: L('PHP', true, 32),
  cs: L('C#', true, 34),
  fs: L('F#'), fsx: L('F#'),
  sh: L('Shell', true, 30), bash: L('Shell', true, 30), zsh: L('Shell', true, 30), fish: L('Shell', true, 30),
  ps1: L('PowerShell', true, 34), psm1: L('PowerShell', true, 34),
  vue: L('Vue', true, 30), svelte: L('Svelte', true, 30), astro: L('Astro', true, 30),
  dart: L('Dart'),
  ex: L('Elixir', true, 30), exs: L('Elixir', true, 30),
  erl: L('Erlang'), hrl: L('Erlang'),
  hs: L('Haskell'), lhs: L('Haskell'),
  scala: L('Scala'), sc: L('Scala'),
  clj: L('Clojure'), cljs: L('Clojure'), cljc: L('Clojure'),
  ml: L('OCaml'), mli: L('OCaml'),
  elm: L('Elm'),
  lua: L('Lua', true, 30),
  zig: L('Zig'),
  nim: L('Nim'),
  jl: L('Julia'),
  r: L('R'),
  m: L('Objective-C'), mm: L('Objective-C++'),
  pl: L('Perl', true, 30), pm: L('Perl', true, 30),
  sol: L('Solidity'),
  asm: L('Assembly', true, 24), s: L('Assembly', true, 24),
  groovy: L('Groovy'), gradle: L('Groovy'),
  nix: L('Nix'),
  cr: L('Crystal'),
  gleam: L('Gleam'),
  el: L('Emacs Lisp'),
  vim: L('Vim Script'),
  f90: L('Fortran'), f95: L('Fortran'), f: L('Fortran'),
  cmake: L('CMake'),
  sql: L('SQL', false, 40),
  // Markup, styles and data: counted as files, never bosses.
  html: L('HTML', false, 40), htm: L('HTML', false, 40),
  css: L('CSS', false, 30), scss: L('SCSS', false, 30), sass: L('Sass', false, 30), less: L('Less', false, 30),
  md: L('Markdown', false, 60), mdx: L('MDX', false, 60), rst: L('reStructuredText', false, 60), txt: L('Text', false, 60),
  json: L('JSON', false, 30), yaml: L('YAML', false, 30), yml: L('YAML', false, 30), toml: L('TOML', false, 30),
  xml: L('XML', false, 40), csv: L('CSV', false, 60), ini: L('INI', false, 30),
  tex: L('TeX', false, 60), ipynb: L('Jupyter Notebook', false, 60),
};

/** Files without extensions that are still code/config. */
const NAMED: Record<string, LangDef> = {
  Makefile: L('Makefile', true, 30),
  makefile: L('Makefile', true, 30),
  GNUmakefile: L('Makefile', true, 30),
  Dockerfile: L('Dockerfile', true, 30),
  Jenkinsfile: L('Groovy', true, 32),
  Rakefile: L('Ruby', true, 28),
  Gemfile: L('Ruby', true, 28),
  'CMakeLists.txt': L('CMake', true, 30),
  BUILD: L('Starlark', true, 30),
  'BUILD.bazel': L('Starlark', true, 30),
  Kconfig: L('Kconfig', false, 30),
};

const BINARY_EXT = new Set(
  (
    'png jpg jpeg gif ico webp bmp tiff tif psd ai sketch fig xcf heic avif ' +
    'woff woff2 ttf otf eot ' +
    'mp3 mp4 wav ogg oga flac m4a aac webm mov avi mkv ' +
    'zip gz tgz bz2 xz 7z rar tar jar war ear apk ipa dmg iso ' +
    'pdf doc docx xls xlsx ppt pptx key numbers pages ' +
    'exe dll so dylib a o obj lib class pyc pyo bin dat db sqlite sqlite3 ' +
    'wasm lockb pack idx node glb gltf fbx blend unitypackage swf'
  ).split(' '),
);

export const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
  C: '#555555', 'C++': '#f34b7d', Java: '#b07219', Kotlin: '#A97BFF', Swift: '#F05138', Ruby: '#701516',
  PHP: '#4F5D95', 'C#': '#178600', 'F#': '#b845fc', Shell: '#89e051', PowerShell: '#012456', Vue: '#41b883',
  Svelte: '#ff3e00', Astro: '#ff5a03', Dart: '#00B4AB', Elixir: '#6e4a7e', Erlang: '#B83998', Haskell: '#5e5086',
  Scala: '#c22d40', Clojure: '#db5855', OCaml: '#ef7a08', Elm: '#60B5CC', Lua: '#000080', Zig: '#ec915c',
  Nim: '#ffc200', Julia: '#a270ba', R: '#198CE7', 'Objective-C': '#438eff', 'Objective-C++': '#6866fb',
  Perl: '#0298c3', Solidity: '#AA6746', Assembly: '#6E4C13', Groovy: '#4298b8', Nix: '#7e7eff', Crystal: '#000100',
  Gleam: '#ffaff3', 'Emacs Lisp': '#c065db', 'Vim Script': '#199f4b', Fortran: '#4d41b1', CMake: '#DA3434',
  HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Sass: '#a53b70', Less: '#1d365d', Markdown: '#083fa1',
  MDX: '#fcb32c', Makefile: '#427819', Dockerfile: '#384d54', 'Jupyter Notebook': '#DA5B0B', TeX: '#3D6117',
  Starlark: '#76d275', Cython: '#fedf5b', SQL: '#e38c00', JSON: '#292929', YAML: '#cb171e',
};

export function languageColor(name: string | null | undefined): string {
  if (!name) return '#8b8b8b';
  return LANGUAGE_COLORS[name] ?? '#8b8b8b';
}

export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function languageOf(path: string): LangDef | null {
  const name = basename(path);
  if (NAMED[name]) return NAMED[name];
  const ext = extensionOf(path);
  if (!ext) return null;
  // `.R` and `.r` are both R; `.S` and `.s` are both assembly.
  return EXT[ext] ?? null;
}

export function isBinaryPath(path: string): boolean {
  return BINARY_EXT.has(extensionOf(path));
}

const PIT_SEGMENTS = new Set(['node_modules', 'vendor', 'bower_components', '.yarn', 'Pods', '.pnpm-store']);

const GENERATED_SEGMENTS = new Set([
  'node_modules', 'vendor', 'third_party', 'third-party', 'thirdparty', 'bower_components', 'Pods', '.yarn',
  'dist', 'build', 'out', 'target', '.next', '.nuxt', '.svelte-kit', 'coverage', '__snapshots__',
  'fixtures', '__fixtures__', 'testdata', 'test-data', 'generated', '__generated__', 'gen', '.git',
]);

const GENERATED_NAME_RE =
  /(\.min\.(js|css)|\.bundle\.js|\.map|\.pb\.go|_pb2\.py|_pb2_grpc\.py|\.pb\.(cc|h)|\.generated\.[a-z]+|\.g\.dart|\.freezed\.dart|\.designer\.cs|\.snap|\.d\.ts)$/i;

export const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'Cargo.lock',
  'go.sum', 'poetry.lock', 'Pipfile.lock', 'uv.lock', 'composer.lock', 'Gemfile.lock', 'mix.lock', 'pubspec.lock',
  'Podfile.lock', 'flake.lock', 'gradle.lockfile', 'packages.lock.json', 'deno.lock', 'Package.resolved',
]);

export function isLockfile(path: string): boolean {
  return LOCKFILES.has(basename(path));
}

export function segmentsOf(path: string): string[] {
  return path.split('/');
}

/** True if the path lives under node_modules / vendor style dependency folders. */
export function isPitPath(path: string): boolean {
  const segs = segmentsOf(path);
  for (let i = 0; i < segs.length - 1; i++) if (PIT_SEGMENTS.has(segs[i])) return true;
  return false;
}

export function isGeneratedPath(path: string, size = 0): boolean {
  const segs = segmentsOf(path);
  for (let i = 0; i < segs.length - 1; i++) if (GENERATED_SEGMENTS.has(segs[i])) return true;
  if (GENERATED_NAME_RE.test(path)) return true;
  if (isLockfile(path)) return true;
  // Multi-megabyte "source" files are almost always generated or bundled.
  if (size > 1_500_000) return true;
  return false;
}

const TEST_SEGMENTS = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'testing', 'unittest', 'unittests', 'integration-tests',
  'integration_tests', 'cypress', 'playwright', 'selftests', 'kunit',
]);

const TEST_NAME_RE =
  /(\.(test|spec|e2e|cy)\.[a-z]+$|_test\.(go|py|rb|exs|dart|cc|cpp|c)$|^test_.*\.py$|Tests?\.(java|kt|swift|cs|scala|php)$|_spec\.rb$|\.t$)/;

export function isTestPath(path: string): boolean {
  const segs = segmentsOf(path);
  for (let i = 0; i < segs.length - 1; i++) if (TEST_SEGMENTS.has(segs[i].toLowerCase())) return true;
  return TEST_NAME_RE.test(basename(path));
}

const CI_PATTERNS = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.gitlab-ci\.ya?ml$/,
  /^\.circleci\//,
  /^azure-pipelines\.ya?ml$/,
  /^Jenkinsfile$/,
  /^\.travis\.ya?ml$/,
  /^bitbucket-pipelines\.ya?ml$/,
  /^\.buildkite\//,
  /^\.drone\.ya?ml$/,
  /^appveyor\.ya?ml$/,
  /^\.woodpecker(\.ya?ml|\/)/,
  /^\.cirrus\.ya?ml$/,
  /^\.github\/actions\//,
];

export function isCiPath(path: string): boolean {
  return CI_PATTERNS.some((re) => re.test(path));
}

export function isReadmePath(path: string): boolean {
  return /^readme(\.[a-z0-9]+)?$/i.test(path);
}

export function isContributingPath(path: string): boolean {
  return /^(\.github\/|docs\/)?contributing(\.[a-z0-9]+)?$/i.test(path);
}

export function isLicensePath(path: string): boolean {
  return /^(licen[cs]e|copying|unlicense)([.-][a-z0-9.]+)?$/i.test(path);
}

export function isCodeownersPath(path: string): boolean {
  return path === 'CODEOWNERS' || path === '.github/CODEOWNERS' || path === 'docs/CODEOWNERS';
}
