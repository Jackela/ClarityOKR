/* eslint-disable @typescript-eslint/no-require-imports -- Jest 29 uses synchronous CommonJS transformers. */
const instrument = require('istanbul-lib-instrument');
const { createRequire } = require('node:module');
const ts = require('typescript');
const babel = createRequire(require.resolve('istanbul-lib-instrument'))('@babel/core');
exports.instrumentSource = (source, filename) => {
  const inst = instrument.createInstrumenter({
    esModules: true,
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    compact: false,
    produceSourceMap: false,
    parserPlugins: ['typescript', 'decorators-legacy'],
  });
  let code = inst.instrumentSync(source, filename);
  code = babel.transformSync(code, {
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['typescript', 'decorators-legacy'] },
    plugins: [
      ({ types: t }) => ({
        visitor: {
          VariableDeclaration(path) {
            const owner = path.parentPath.isExportNamedDeclaration() ? path.parentPath : path;
            if (!owner.parentPath.isProgram() || path.node.declarations.length !== 1) return;
            const preceding = [];
            for (const d of path.node.declarations) {
              if (!t.isSequenceExpression(d.init)) continue;
              const seq = d.init.expressions;
              if (
                seq
                  .slice(0, -1)
                  .every(
                    (e) =>
                      t.isUpdateExpression(e) &&
                      t.isMemberExpression(e.argument) &&
                      t.isCallExpression(e.argument.object?.object) &&
                      e.argument.object.object.callee.name?.startsWith('cov_'),
                  )
              ) {
                preceding.push(...seq.slice(0, -1).map((e) => t.expressionStatement(e)));
                d.init = seq.at(-1);
              }
            }
            if (preceding.length) owner.insertBefore(preceding);
          },
        },
      }),
    ],
  }).code;
  const m = /^function (cov_\w+)\(\) \{/.exec(code);
  if (m) {
    const end = code.indexOf(`\n${m[1]}();`);
    if (end < 0) throw Error('helper bound');
    let helper = code.slice(0, end);
    helper = helper
      .replace(/^function (cov_\w+)\(\)/, 'function $1(): any')
      .replace(/\bvar (\w+) =/g, 'var $1: any =');
    code = helper + code.slice(end);
  }
  const before = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const overrides = new Set();
  function key(node) {
    return `${node.parent.parent.name?.text ?? ''}/${node.parent.name?.text ?? 'constructor'}/${node.parent.parameters.indexOf(node)}`;
  }
  function visit(n) {
    if (ts.isParameter(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.OverrideKeyword))
      overrides.add(key(n));
    ts.forEachChild(n, visit);
  }
  visit(before);
  if (overrides.size) {
    const after = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
    const edits = [];
    const restore = (n) => {
      if (
        ts.isParameter(n) &&
        overrides.has(key(n)) &&
        !n.modifiers?.some((m) => m.kind === ts.SyntaxKind.OverrideKeyword)
      )
        edits.push(n.getStart(after));
      ts.forEachChild(n, restore);
    };
    restore(after);
    for (const pos of edits.sort((a, b) => b - a))
      code = code.slice(0, pos) + 'override ' + code.slice(pos);
    if (edits.length !== overrides.size) throw Error('Parameter override restoration mismatch');
  }
  return { code, metadata: inst.lastFileCoverage() };
};
