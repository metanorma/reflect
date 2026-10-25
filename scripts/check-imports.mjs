#!/usr/bin/env node
/**
 * check-imports.mjs — runtime-import guard for @metanorma/panel-layout.
 *
 * RULE
 *   Library sources (`*.ts` / `*.tsx` under the target dir, excluding the
 *   `mock/`, `tests/`, `compiled/`, `dist/`, `node_modules/` subtrees) may
 *   import `react`, `react-dom` and `dockview-react` — bare or subpath —
 *   at runtime. `dockview` and `dockview-core` must be TYPE-ONLY
 *   (statement-level `import type` / `export type`, which erase at emit).
 *
 * WHY (verified against the parity mock's importmap): the mock maps
 * `dockview` to an unbundled esm.sh copy while `dockview-react` is a
 * `?bundle` build that inlines dockview + dockview-core. A RUNTIME
 * `dockview` import from this library would resolve to a second
 * dockview-core instance next to the one inlined inside dockview-react —
 * broken DnD that a one-URL-per-package resource check would NOT catch
 * (one URL per package NAME, two instances behind them). Enforcement
 * therefore lives at the source level. The build re-runs this via the
 * workspace `build` script (chained before esbuild).
 *
 * DESIGN — a character-consumption scanner, not per-line regexes (the
 * corpus already has multi-line import statements, e.g.
 * pkg/panel-layout/dragTakeover.ts). States: code / line comment / block
 * comment (JS block comments do NOT nest — a nesting implementation would
 * consume past the comment's real end and silently mask live code, the
 * exact failure class this tool exists to prevent) / single- and
 * double-quoted strings /
 * template literals (dollar-brace holes scanned as code; nested templates
 * supported) / regex literals. Import statements, `export … from`
 * clauses, dynamic `import(…)` and `require(…)` are captured as whole
 * statements; module specifiers are taken structurally (the quoted string
 * after `from`, or the argument of a dynamic call) — a string literal
 * CONTAINING "from 'dockview'" cannot be misread as an import, and an
 * `export const s = …` declaration is aborted before capture so a
 * `require` inside it still gets its own scan.
 *
 * REGEX LITERALS: entering a regex-literal state is a hard failure. The
 * division-vs-regex heuristic cannot be made complete, so any regex the
 * scanner RECOGNIZES (operator position: previous significant token is
 * not an identifier/number, `)`, `]`, string or template end — with
 * expression-preceding keywords like `return` counted as regex position,
 * and `/` after `<` treated as a JSX closing tag, not a regex) is
 * rejected loudly instead of risking a silent mis-scan. The corpus
 * contains none today.
 *
 * Residual, known gaps (all fail toward noise, never toward silence,
 * except where noted): (1) a regex the heuristic does NOT recognize —
 * classic case: statement position after `)` — whose body contains
 * quote-like characters could open a string state and mask later imports
 * on that file; (2) JSX text is not tokenized — a quote character in JSX
 * text can mask the remainder of its line only (quoted strings cannot
 * span lines in JS, so the string state is closed at end of line).
 * Migration path if either bites: a `ts.createProgram` import walker
 * behind this same CLI (target dir argument, exit code).
 *
 * Usage: node scripts/check-imports.mjs [dir]   (default: cwd)
 * Exit 0 clean / 1 violations.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const RUNTIME_ALLOWED = new Set(['react', 'react-dom', 'dockview-react']);
const TYPE_ONLY = new Set(['dockview', 'dockview-core']);
const SKIP_DIRS = new Set([
  'mock', 'tests', 'compiled', 'dist', 'node_modules', '.git',
]);
const WORD_RE = /[A-Za-z0-9_$]/;

/** A `/` after these keywords starts a regex, not division (`return /x/`). */
const REGEX_KEYWORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new',
  'of', 'return', 'throw', 'typeof', 'void', 'yield',
]);

function basePackage(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Scan one source file; returns an array of problem strings
 * (`path:line: message`). See the header for the rule and the design.
 */
function scanFile(source, rel) {
  const problems = [];
  const len = source.length;
  // Frame stack: bottom is plain code; template literals push
  // {kind:'tpl'} frames, their `${` holes push code frames with a brace
  // counter. Strings never nest and use the scalar strState.
  const frames = [{ kind: 'code' }];
  let strState = null; // 'sq' | 'dq' while inside a quoted string
  let strStart = null; // {at, content} — capture-relative, or null
  let lastSig = '';    // last significant char (comments/ws don't count)
  let lastWord = '';   // last identifier run, kept across whitespace
  let cap = null;      // active import/require statement capture
  let i = 0;
  let line = 1;

  const emit = (text) => { if (cap) cap.text += text; };
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

  /** Apply the rule to a finished statement capture. */
  const analyze = (c) => {
    const t = c.text;
    if (c.word === 'require') {
      if (/^require\s*\(/.test(t)) checkDynamic('require', c);
      return;
    }
    if (c.word === 'import' && /^import\s*\(/.test(t)) {
      checkDynamic('dynamic import', c);
      return;
    }
    // Static import / export-from. Type discrimination is the
    // STATEMENT-level `type` keyword (the enforced form, per rule).
    const isType
      = new RegExp('^' + c.word + '\\s+type([\\s{*]|$)').test(t);
    let spec = null;
    if (c.fromAt >= 0) {
      spec = c.strings.find((s) => s.at > c.fromAt) ?? null;
    } else if (c.word === 'import') {
      spec = c.strings[0] ?? null; // bare side-effect import: import 'x'
    }
    if (spec === null) return; // export declaration — no module source
    const base = basePackage(spec.content);
    if (TYPE_ONLY.has(base) && !isType) {
      problems.push(`${rel}:${c.startLine}: runtime import of `
        + `'${spec.content}' — dockview/dockview-core must be type-only `
        + `(use 'import type' / 'export type')`);
    }
  };

  /** Dynamic import()/require(): runtime by nature; specifier must be a
   *  statically readable string (every string in the call is checked). */
  const checkDynamic = (kind, c) => {
    if (c.strings.length === 0 || c.strings.some((s) => s.hasHole)) {
      problems.push(`${rel}:${c.startLine}: non-literal ${kind} — the `
        + 'specifier must be a static string to be verifiable');
      return;
    }
    for (const s of c.strings) {
      if (TYPE_ONLY.has(basePackage(s.content))) {
        problems.push(`${rel}:${c.startLine}: ${kind} of '${s.content}' — `
          + 'dockview/dockview-core must be type-only');
      }
    }
  };

  const finalize = () => { if (cap) { analyze(cap); cap = null; } };

  /** Look-ahead word after export/require: only the forms that can carry
   *  a module source keep the capture; anything else aborts it (the rest
   *  of the line is then scanned normally — a require inside an aborted
   *  export declaration still gets its own capture). */
  const lookWord = (w) => {
    if (cap.word === 'import') { cap.phase = 'body'; return; }
    if (cap.word === 'export') {
      if (!cap.sawType && w === 'type') { cap.sawType = true; return; }
    }
    cap = null; // export declaration, or require followed by a word
  };

  /** Consume a regex literal (escapes and […] classes honored) so the
   *  scan continues sanely past it. The caller reports the hard fail. */
  const consumeRegex = () => {
    i += 1; // opening '/'
    let inClass = false;
    while (i < len) {
      const c = source[i];
      i += 1;
      if (c === '\n') { line += 1; break; } // unterminated — stop at EOL
      if (c === '\\') {
        const n = source[i];
        if (n !== undefined) { i += 1; if (n === '\n') line += 1; }
        continue;
      }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
    }
    while (i < len && WORD_RE.test(source[i])) i += 1; // flags
    lastSig = '/';
    lastWord = '';
  };

  while (i < len) {
    const ch = source[i];
    const frame = frames[frames.length - 1];

    // -- template literal body -------------------------------------------
    if (frame.kind === 'tpl') {
      i += 1;
      if (ch === '\\') {
        const n = source[i];
        if (n !== undefined) {
          i += 1;
          if (n === '\n') line += 1;
          frame.raw += ch + n;
          emit(ch + n);
        }
      } else if (ch === '`') {
        frames.pop();
        lastSig = '`';
        lastWord = '';
        if (cap) {
          cap.strings.push({ at: frame.startAt, content: frame.raw,
            hasHole: frame.holeSeen });
        }
        emit('`');
      } else if (ch === '$' && source[i] === '{') {
        i += 1;
        frame.holeSeen = true;
        frames.push({ kind: 'code', hole: 0 });
        emit('${');
      } else {
        if (ch === '\n') line += 1;
        frame.raw += ch;
        emit(ch);
      }
      continue;
    }

    // -- quoted string ---------------------------------------------------
    if (strState) {
      i += 1;
      if (ch === '\\') {
        const n = source[i];
        if (n !== undefined) {
          i += 1;
          if (n === '\n') line += 1;
          if (strStart) strStart.content += ch + n;
          emit(ch + n);
        }
      } else if (ch === strState) {
        strState = null;
        lastSig = ch;
        lastWord = '';
        if (cap && strStart) {
          cap.strings.push({ at: strStart.at, content: strStart.content,
            hasHole: false });
        }
        strStart = null;
        emit(ch);
      } else {
        // Quoted strings cannot span lines; closing at EOL bounds any
        // JSX-text apostrophe damage to its own line (see header).
        if (ch === '\n') { line += 1; strState = null; strStart = null; }
        else if (strStart) strStart.content += ch;
        emit(ch);
      }
      continue;
    }

    // -- comments (before any other '/' handling) ------------------------
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') i += 1;
      emit(' '); // the '\n' itself is processed as code below
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < len
        && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1; // counted, but not emitted:
        i += 1; // a newline inside a block comment must not end a
      } //      captured statement
      i = Math.min(i + 2, len);
      emit(' ');
      continue;
    }

    // -- identifier-sized word -------------------------------------------
    if (/[A-Za-z_$]/.test(ch)
      && (i === 0 || !WORD_RE.test(source[i - 1]))) {
      let j = i;
      while (j < len && WORD_RE.test(source[j])) j += 1;
      const w = source.slice(i, j);
      const prevSig = lastSig;
      const prevWord = lastWord;
      i = j;
      lastWord = w;
      lastSig = w[w.length - 1];
      const isTrigger = w === 'import' || w === 'export'
        || w === 'require';
      // Block only real property access (`obj.import`, `x.require`) and
      // string-method calls; a KEYWORD before the word (`await import`,
      // `return require`) is a legitimate dynamic-call position.
      const blocked = prevSig === '.'
        || ['\'', '"', '`'].includes(prevSig)
        || (WORD_RE.test(prevSig) && !REGEX_KEYWORDS.has(prevWord));
      if (!cap && isTrigger && !blocked) {
        cap = { word: w, startLine: line, text: w, strings: [],
          fromAt: -1, depth: 0, phase: 'look', sawType: false };
      } else {
        emit(w);
        if (cap) {
          if (cap.phase === 'body' && w === 'from') {
            cap.fromAt = cap.text.length - w.length;
          } else if (cap.phase === 'look') {
            lookWord(w);
          }
        }
      }
      continue;
    }

    // -- statement-capture look-ahead (first significant char) -----------
    if (cap && cap.phase === 'look' && !isWs(ch)) {
      if (cap.word === 'export' && (ch === '{' || ch === '*')) {
        cap.phase = 'body';
      } else if (cap.word === 'import' && ch !== '.') {
        cap.phase = 'body'; // import.meta aborts below
      } else if (cap.word === 'require' && ch === '(') {
        cap.phase = 'body';
      } else {
        cap = null; // import.meta / export declaration / require.x
      } // fall through: the char is still processed normally
    }

    // -- strings and templates -------------------------------------------
    if (ch === '\'' || ch === '"') {
      strState = ch;
      strStart = cap ? { at: cap.text.length, content: '' } : null;
      lastWord = '';
      emit(ch);
      i += 1;
      continue;
    }
    if (ch === '`') {
      frames.push({ kind: 'tpl', raw: '', holeSeen: false,
        startAt: cap ? cap.text.length : -1 });
      lastWord = '';
      emit(ch);
      i += 1;
      continue;
    }

    // -- slash: division / regex / JSX closing tag ------------------------
    if (ch === '/') {
      // `</div>` — a slash right after `<` is JSX punctuation, not regex.
      const afterValue = lastSig === '<' ? false
        : WORD_RE.test(lastSig)
          ? !REGEX_KEYWORDS.has(lastWord)
          : [')', ']', '\'', '"', '`'].includes(lastSig);
      if (afterValue || lastSig === '<') {
        lastSig = '/';
        lastWord = '';
        emit('/');
        i += 1;
      } else {
        const ln = line;
        consumeRegex();
        problems.push(`${rel}:${ln}: regex literal — scanner cannot `
          + 'guarantee correctness here; restructure or port the checker '
          + 'to a TS AST walker');
      }
      continue;
    }

    // -- brackets (capture depth; template-hole braces) -------------------
    if (ch === '(' || ch === '[' || ch === '{') {
      if (cap) cap.depth += 1;
      if (frame.hole !== undefined && ch === '{') frame.hole += 1;
      lastSig = ch;
      lastWord = '';
      emit(ch);
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']') {
      if (cap && cap.depth > 0) cap.depth -= 1;
      lastSig = ch;
      lastWord = '';
      emit(ch);
      i += 1;
      continue;
    }
    if (ch === '}') {
      if (frame.hole !== undefined) {
        if (frame.hole > 0) {
          frame.hole -= 1;
          if (cap && cap.depth > 0) cap.depth -= 1;
        } else {
          frames.pop(); // back into the template literal
          emit('}');
          i += 1;
          continue;
        }
      } else if (cap && cap.depth > 0) {
        cap.depth -= 1;
      }
      lastSig = '}';
      lastWord = '';
      emit(ch);
      i += 1;
      continue;
    }

    // -- everything else (whitespace, `;`, operators) ---------------------
    i += 1;
    if (ch === '\n') line += 1;
    emit(ch);
    if (!isWs(ch)) { lastSig = ch; lastWord = ''; }
    // An import statement may legitimately span lines before its brace or
    // specifier appears; only `;` (or EOF, via the post-loop finalize)
    // closes a body-phase capture. Same for require: its closing paren
    // may sit on a following line.
    if (ch === ';' && cap && cap.phase === 'body') finalize();
  }
  finalize(); // a capture still open at EOF
  return problems;
}

/** Collect `*.ts` / `*.tsx` files under dir, skipping SKIP_DIRS subtrees. */
async function collect(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) await collect(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      out.push(p);
    }
  }
}

const target = resolve(process.argv[2] ?? '.');
const files = [];
await collect(target, files);
let violations = 0;
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const problem of scanFile(source, relative(target, file))) {
    console.error(problem);
    violations += 1;
  }
}
if (violations > 0) {
  console.error(`check-imports: ${violations} violation(s) across `
    + `${files.length} file(s) scanned`);
  process.exit(1);
}
console.log(`check-imports: ${files.length} file(s) scanned — no runtime `
  + 'dockview/dockview-core imports (type-only only)');
