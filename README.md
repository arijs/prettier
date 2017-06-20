# Prettier Miscellaneous

[![Gitter](https://badges.gitter.im/gitterHQ/gitter.svg)](https://gitter.im/jlongster/prettier)
[![Build Status](https://travis-ci.org/arijs/prettier-miscellaneous.svg?branch=master)](https://travis-ci.org/arijs/prettier-miscellaneous)
[![CircleCI Status](https://circleci.com/gh/arijs/prettier-miscellaneous.svg?style=shield&circle-token=5b135ff8817790a20e0eb1c5853752b931bc42c0)](https://circleci.com/gh/arijs/prettier-miscellaneous)
[![NPM version](https://img.shields.io/npm/v/prettier-miscellaneous.svg)](https://www.npmjs.com/package/prettier-miscellaneous)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier_misc-ff69b4.svg)](https://github.com/arijs/prettier-miscellaneous)

> # CONFIGURATION WELCOME
>
> This is a fork of [prettier/prettier](https://github.com/prettier/prettier), with a goal of supporting additional options not picked up by official Prettier.
>
> If you want to add an option to Prettier Miscellaneous, please send a PR! 😃
>
> ![Happyness](https://i.redd.it/p63sznfyu38y.jpg)

<details>
<summary><strong>Table of Contents</strong></summary>

- [Usage](#usage)
  * [CLI](#cli)
    + [Pre-commit hook for changed files](#pre-commit-hook-for-changed-files)
  * [Options](#options)
  * [API](#api)
    + [Custom Parser API](#custom-parser-api)
  * [Excluding code from formatting](#excluding-code-from-formatting)
- [Editor Integration](#editor-integration)
  * [Atom](#atom)
  * [Emacs](#emacs)
  * [Vim](#vim)
  * [Visual Studio Code](#visual-studio-code)
  * [Visual Studio](#visual-studio)
  * [Sublime Text](#sublime-text)
  * [WebStorm](#webstorm)
- [Language Support](#language-support)
- [Related Projects](#related-projects)
- [Technical Details](#technical-details)
- [Badge](#badge)
- [Contributing](#contributing)
</details>

--------------------------------------------------------------------------------

Prettier is an opinionated code formatter inspired by
[refmt](https://facebook.github.io/reason/tools.html) with advanced
support for language features from:
* JavaScript, including [ES2017](https://github.com/tc39/proposals/blob/master/finished-proposals.md)
* [JSX](https://facebook.github.io/jsx/)
* [Flow](https://flow.org/)
* [TypeScript](https://www.typescriptlang.org/)
* CSS, [LESS](http://lesscss.org/), and [SCSS](http://sass-lang.com)

It removes all original styling[\*](#styling-footnote) and ensures that all outputted code
conforms to a consistent style. (See this [blog post](http://jlongster.com/A-Prettier-Formatter))

If you are interested in the details, you can watch those two conference talks:

<a href="https://www.youtube.com/watch?v=hkfBvpEfWdA"><img width="298" src="https://cloud.githubusercontent.com/assets/197597/24886367/dda8a6f0-1e08-11e7-865b-22492450f10f.png"></a> <a href="https://www.youtube.com/watch?v=0Q4kUNx85_4"><img width="298" src="https://cloud.githubusercontent.com/assets/197597/24886368/ddacd6f8-1e08-11e7-806a-9febd23cbf47.png"></a>

A few of the [many projects](https://www.npmjs.com/browse/depended/prettier) using Prettier[\*\*](#using-footnote):

<table>
<tr>
<td><p align="center"><a href="https://facebook.github.io/react/"><img src="images/react-200x100.png" alt="React" width="200" height="100"><br>React</a></p></td>
<td><p align="center"><a href="https://facebook.github.io/jest/"><img src="images/jest-200x100.png" alt="Jest" width="200" height="100"><br>Jest</a></p></td>
<td><p align="center"><a href="https://yarnpkg.com"><img src="images/yarn-200x100.png" alt="Yarn" width="200" height="100"><br>Yarn</a></p></td>
</tr>
<tr>
<td><p align="center"><a href="https://babeljs.io/"><img src="images/babel-200x100.png" alt="Babel" width="200" height="100"><br>Babel</a></p></td>
<td><p align="center"><a href="https://zeit.co/"><img src="images/zeit-200x100.png" alt="Zeit" width="200" height="100"><br>Zeit</a></p></td>
<td><p align="center"><a href="https://webpack.js.org/api/cli/"><img src="images/webpack-200x100.png" alt="Webpack-cli" width="200" height="100"><br>Webpack-cli</a></p></td>
</tr>
</table>

In the case of JavaScript, this goes way beyond [ESLint](http://eslint.org/) and other projects
[built on it](https://github.com/feross/standard). Unlike ESLint,
there aren't a million configuration options and rules. But more
importantly: **everything is fixable**. This works because Prettier
never "checks" anything; it takes JavaScript as input and delivers the
formatted JavaScript as output.

In technical terms: Prettier parses your JavaScript into an AST (Abstract Syntax Tree) and
pretty-prints the AST, completely ignoring any of the original
formatting[\*](#styling-footnote). Say hello to completely consistent syntax!

There's an extremely important piece missing from existing styling
tools: **the maximum line length**. Sure, you can tell ESLint to warn
you when you have a line that's too long, but that's an after-thought
(ESLint *never* knows how to fix it). The maximum line length is a
critical piece the formatter needs for laying out and wrapping code.

For example, take the following code:

```js
foo(arg1, arg2, arg3, arg4);
```

That looks like the right way to format it. However, we've all run
into this situation:

```js
foo(reallyLongArg(), omgSoManyParameters(), IShouldRefactorThis(), isThereSeriouslyAnotherOne());
```

Suddenly our previous format for calling function breaks down because
this is too long. What you would probably do is this instead:

```js
foo(
  reallyLongArg(),
  omgSoManyParameters(),
  IShouldRefactorThis(),
  isThereSeriouslyAnotherOne()
);
```

This clearly shows that the maximum line length has a direct impact on
the style of code we desire. The fact that current style tools ignore
this means they can't really help with the situations that are
actually the most troublesome. Individuals on teams will all format
these differently according to their own rules and we lose the
consistency we sought after.

Even if we disregard line lengths, it's too easy to sneak in various
styles of code in all other linters. The most strict linter I know
happily lets all these styles happen:

```js
foo({ num: 3 },
  1, 2)

foo(
  { num: 3 },
  1, 2)

foo(
  { num: 3 },
  1,
  2
)
```

Prettier bans all custom styling[\*](#styling-footnote) by parsing it away and re-printing
the parsed AST with its own rules that take the maximum line length
into account, wrapping code when necessary.

<a href="#styling-footnote" name="styling-footnote">\*</a>_Well actually, some
original styling is preserved when practical—see [empty lines] and [multi-line
objects]._

<a href="#using-footnote" name="using-footnote">\*\*</a>_See Issue #1351 for discussion about how these projects using Prettier were chosen._

[empty lines]:Rationale.md#empty-lines
[multi-line objects]:Rationale.md#multi-line-objects

## Usage

Install:

```
yarn add prettier-miscellaneous --dev
=======
yarn add prettier --dev
```

You can install it globally if you like:

```
yarn global add prettier-miscellaneous
```

*We're defaulting to `yarn` but you can use `npm` if you like:*

```
npm install [-g] prettier-miscellaneous
```

### CLI

Run Prettier through the CLI with this script. Run it without any
arguments to see the [options](#options).

To format a file in-place, use `--write`. You may want to consider
committing your code before doing that, just in case.

```bash
prettier [opts] [filename ...]
```

In practice, this may look something like:

```bash
prettier --single-quote --trailing-comma es5 --write "{app,__{tests,mocks}__}/**/*.js"
```

Don't forget the quotes around the globs! The quotes make sure that Prettier
expands the globs rather than your shell, for cross-platform usage.
The [glob syntax from the glob module](https://github.com/isaacs/node-glob/blob/master/README.md#glob-primer)
is used.

Prettier CLI will ignore files located in `node_modules` directory. To opt-out from this behavior use `--with-node-modules` flag.

If you're worried that Prettier will change the correctness of your code, add `--debug-check` to the command.
This will cause Prettier to print an error message if it detects that code correctness might have changed.
Note that `--write` cannot be used with `--debug-check`.

Another useful flag is `--list-different` (or `-l`) which prints the filenames of files that are different from Prettier formatting. If there are differences the script errors out, which is useful in a CI scenario.

```bash
prettier --single-quote --list-different "src/**/*.js"
```

#### Pre-commit hook for changed files

You can use this with a pre-commit tool. This can re-format your files that are marked as "staged" via `git add`  before you commit.

##### 1. [lint-staged](https://github.com/okonet/lint-staged)

Install it along with [husky](https://github.com/typicode/husky):

```bash
yarn add lint-staged husky --dev
```

and add this config to your `package.json`:

```json
{
  "scripts": {
    "precommit": "lint-staged"
  },
  "lint-staged": {
    "*.js": [
      "prettier --write",
      "git add"
    ]
  }
}
```

See https://github.com/okonet/lint-staged#configuration for more details about how you can configure lint-staged.


##### 2. [pre-commit](https://github.com/pre-commit/pre-commit)

Copy the following config in your pre-commit config yaml file:

```yaml

    -   repo: https://github.com/awebdeveloper/pre-commit-prettier
        sha: ''  # Use the sha or tag you want to point at
        hooks:
        -   id: prettier
            additional_dependencies: ['prettier@1.4.2']

 ```

Find more info from [here](https://github.com/awebdeveloper/pre-commit-prettier).

##### 3. bash script

Alternately you can save this script as `.git/hooks/pre-commit` and give it execute permission:

```bash
#!/bin/sh
jsfiles=$(git diff --cached --name-only --diff-filter=ACM | grep '\.jsx\?$' | tr '\n' ' ')
[ -z "$jsfiles" ] && exit 0

diffs=$(node_modules/.bin/prettier -l $jsfiles)
[ -z "$diffs" ] && exit 0

echo "here"
echo >&2 "Javascript files must be formatted with prettier. Please run:"
echo >&2 "node_modules/.bin/prettier --write "$diffs""

exit 1
```


### Options

Prettier ships with a handful of customizable format options, usable in both the CLI and API.

| Option | Default | Override |
| ------ | ------- | -------- |
| **Print Width** - Specify the length of line that the printer will wrap on.<br /><br /><strong>We strongly recommend against using more than 80 columns</strong>. Prettier works by cramming as much content as possible until it reaches the limit, which happens to work well for 80 columns but makes lines that are very crowded. When a bigger column count is used in styleguides, it usually means that code is allowed to go beyond 80 columns, but not to make every single line go there, like prettier would do.  | `80` | CLI: `--print-width <int>` <br />API: `printWidth: <int>`
| **Tab Width** - Specify the number of spaces per indentation-level. | `2` | CLI: `--tab-width <int>` <br />API: `tabWidth: <int>` |
| **Tabs** - Indent lines with tabs instead of spaces. | `false` | CLI: `--use-tabs` <br />API: `useTabs: <bool>` |
| **Semicolons** - Print semicolons at the ends of statements.<br /><br />Valid options: <ul><li>`true` - add a semicolon at the end of every statement</li><li>`false` - only add semicolons at the beginning of lines that may introduce ASI failures</li></ul> | `true` | CLI: `--no-semi` <br />API: `semi: <bool>` |
| **Quotes** - Use single quotes instead of double quotes.<br /><br />Notes:<ul><li>Quotes in JSX will always be double and ignore this setting.</li><li>If the number of quotes outweighs the other quote, the quote which is less used will be used to format the string - Example: `"I'm double quoted"` results in `"I'm double quoted"` and `"This \"example\" is single quoted"` results in `'This "example" is single quoted'`.</li></ul> | `false` | CLI: `--single-quote` <br />API: `singleQuote: <bool>` |
| **Trailing Commas** - Print trailing commas wherever possible.<br /><br />Valid options: <ul><li>`"none"` - no trailing commas </li><li>`"es5"` - trailing commas where valid in ES5 (objects, arrays, etc.)</li><li>`"all"` - trailing commas wherever possible (function arguments). This requires node 8 or a [transform](https://babeljs.io/docs/plugins/syntax-trailing-function-commas/).</li></ul> | `"none"` | CLI: <code>--trailing-comma <none&#124;es5&#124;all></code> <br />API: <code>trailingComma: "<none&#124;es5&#124;all>"</code> |
| **Trailing Commas (extended)** - You can also customize each place to use trailing commas:<br /><br />Valid options: <br /> - `"array"` <br/> - `"object"` <br /> - `"import"` <br /> - `"export"` <br /> - `"arguments"` | `"none"` | You can use a comma separated string list, or an object in the API.<br /><br />CLI: <code>--trailing-comma "array,object,import,export,arguments"</code> <br />API: <code>trailingComma: { array: true, object: true, import: true, export: true, arguments: false }</code> |
| **Bracket Spacing** - Print spaces between brackets in array literals.<br /><br />Valid options: <br /> - `true` - Example: `[ foo: bar ]` <br /> - `false` - Example: `[foo: bar]` | `true` | CLI: `--no-bracket-spacing` <br/>API: `bracketSpacing: <bool>` |
| **Braces Spacing** - Print spaces between braces in object literals.<br /><br />Valid options: <ul><li>`true` - Example: `{ foo: bar }`</li><li>`false` - Example: `{foo: bar}`</li> | `true` | CLI: `--no-braces-spacing` <br />API: `bracesSpacing: <bool>` |
| **JSX Brackets on Same Line** - Put the `>` of a multi-line JSX element at the end of the last line instead of being alone on the next line | `false` | CLI: `--jsx-bracket-same-line` <br />API: `jsxBracketSameLine: <bool>` |
| **Align Object Properties** - Align colons in multiline object literals. Does nothing if object has computed property names. | `false` | CLI: `--align-object-properties` <br/>API: `alignObjectProperties: <bool>` |
| **No Space in Empty Function** - Omit space before empty anonymous function body.<br /><br />Valid options: <br /> - `true` <br /> - `false` | `false` | CLI: `--no-space-empty-fn` <br/>API: `noSpaceEmptyFn: <bool>` |
| **Space before Function Paren** - Put a [space before function parenthesis](http://eslint.org/docs/rules/space-before-function-paren#always).<br /><br />Valid options: <br /> - `true` <br /> - `false` | `false` | CLI: `--space-before-function-paren` <br/>API: `spaceBeforeFunctionParen: <bool>` |
| **Cursor Offset** - Specify where the cursor is. This option only works with `prettier.formatWithCursor`, and cannot be used with `rangeStart` and `rangeEnd`. | `-1` | CLI: `--cursor-offset <int>` <br />API: `cursorOffset: <int>` |
| **Range Start** - Format code starting at a given character offset. The range will extend backwards to the start of the first line containing the selected statement. This option cannot be used with `cursorOffset`. | `0` | CLI: `--range-start <int>` <br />API: `rangeStart: <int>` |
| **Range End** - Format code ending at a given character offset (exclusive). The range will extend forwards to the end of the selected statement. This option cannot be used with `cursorOffset`. | `Infinity` | CLI: `--range-end <int>` <br />API: `rangeEnd: <int>` |
| **Parser** - Specify which parser to use. Both the `babylon` and `flow` parsers support the same set of JavaScript features (including Flow). Prettier automatically infers the parser from the input file path, so you shouldn't have to change this setting. <br />Built-in parsers: <ul><li>`babylon`</li><li>`flow`</li><li>`typescript`</li><li>`postcss`</li><li>`json`</li></ul>[Custom parsers](#custom-parser-api) are also supported. | `babylon` | CLI: <br />`--parser <string>` <br />`--parser ./path/to/my-parser` <br />API: <br />`parser: "<string>"` <br />`parser: require("./my-parser")` |
| **Filepath** - Specify the input filepath this will be used to do parser inference.<br /><br /> Example: <br />`cat foo \| prettier --stdin-filepath foo.css`<br /> will default to use `postcss` parser |  | CLI: `--stdin-filepath` <br />API: `filepath: "<string>"` |

### API

The API has three functions, exported as `format`, `check`, and `formatWithCursor`. `format` usage is as follows:

```js
const prettier = require("prettier-miscellaneous");

const options = {} // optional
prettier.format(source, options);
```

`check` checks to see if the file has been formatted with Prettier given those options and returns a Boolean.
This is similar to the `--list-different` parameter in the CLI and is useful for running Prettier in CI scenarios.

`formatWithCursor` both formats the code, and translates a cursor position from unformatted code to formatted code.
This is useful for editor integrations, to prevent the cursor from moving when code is formatted. For example:

```js
const prettier = require("prettier");

prettier.formatWithCursor(" 1", { cursorOffset: 2 });
// -> { formatted: '1;\n', cursorOffset: 1 }
```

#### Custom Parser API

If you need to make modifications to the AST (such as codemods), or you want to provide an alternate parser, you can do so by setting the `parser` option to a function. The function signature of the parser function is:
```js
(text: string, parsers: object, options: object) => AST;
```

Prettier's built-in parsers are exposed as properties on the `parsers` argument.


##### Example

```js
prettier.format("lodash ( )", {
  parser(text, { babylon }) {
    const ast = babylon(text);
    ast.program.body[0].expression.callee.name = "_";
    return ast;
  }
}); // ==> "_();\n"
```

The `--parser` CLI option may be a path to a node.js module exporting a parse function.

### Excluding code from formatting

A JavaScript comment of `// prettier-ignore` will exclude the next node in the abstract syntax tree from formatting.

For example:

```js
matrix(
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
)

// prettier-ignore
matrix(
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
)
```

will be transformed to:

```js
matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);

// prettier-ignore
matrix(
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
)
```

## Editor Integration

### Atom

Atom users can simply install the [`prettier-atom-with-tabs`](https://atom.io/packages/prettier-atom-with-tabs) package and use
`Ctrl+Alt+F` to format a file (or format on save if enabled).

### Emacs

Emacs users should see [this repository](https://github.com/prettier/prettier-emacs)
for on-demand formatting.

### Vim

Vim users can simply install either [sbdchd](https://github.com/sbdchd)/[neoformat](https://github.com/sbdchd/neoformat) or [mitermayer](https://github.com/mitermayer)/[vim-prettier](https://github.com/mitermayer/vim-prettier), for more details see [this directory](https://github.com/prettier/prettier/tree/master/editors/vim)

### Visual Studio Code

Can be installed using the extension sidebar. Search for `Prettier - JavaScript formatter`.

Can also be installed using `ext install prettier-vscode-with-tabs`

[Check its repository for configuration and shortcuts](https://marketplace.visualstudio.com/items?itemName=passionkind.prettier-vscode-with-tabs)

### Visual Studio

Install the [JavaScript Prettier extension](https://github.com/madskristensen/JavaScriptPrettier).

### Sublime Text

Sublime Text support is available through Package Control and
the [JsPrettier](https://packagecontrol.io/packages/JsPrettier) plug-in.

### WebStorm

See the [WebStorm
guide](https://github.com/jlongster/prettier/tree/master/editors/webstorm/README.md).

## Language Support

Prettier attempts to support all JavaScript language features,
including non-standardized ones. By default it uses the
[Babylon](https://github.com/babel/babylon) parser with all language
features enabled, but you can also use the
[Flow](https://github.com/facebook/flow) parser with the
`parser` API or `--parser` CLI [option](#options).

All of JSX and Flow syntax is supported. In fact, the test suite in
`tests` *is* the entire Flow test suite and they all pass.

Prettier also supports [TypeScript](https://www.typescriptlang.org/), CSS, [LESS](http://lesscss.org/), and [SCSS](http://sass-lang.com).

The minimum version of TypeScript supported is 2.1.3 as it introduces the ability to have leading `|` for type definitions which prettier outputs.

## Related Projects

- [`eslint-plugin-prettier`](https://github.com/prettier/eslint-plugin-prettier) plugs Prettier into your ESLint workflow
- [`eslint-config-prettier`](https://github.com/prettier/eslint-config-prettier) turns off all ESLint rules that are unnecessary or might conflict with Prettier
- [`prettier-eslint`](https://github.com/prettier/prettier-eslint)
passes `prettier` output to `eslint --fix`
- [`prettier-standard`](https://github.com/sheerun/prettier-standard)
uses `prettier` and `prettier-eslint` to format code with standard rules
- [`prettier-standard-formatter`](https://github.com/dtinth/prettier-standard-formatter)
passes `prettier` output to `standard --fix`
- [`prettier-miscellaneous`](https://github.com/arijs/prettier-miscellaneous)
`prettier` with a few minor extra options
- [`neutrino-preset-prettier`](https://github.com/SpencerCDixon/neutrino-preset-prettier) allows you to use Prettier as a Neutrino preset
- [`prettier_d`](https://github.com/josephfrazier/prettier_d.js) runs Prettier as a server to avoid Node.js startup delay
- [`Prettier Bookmarklet`](https://prettier.glitch.me/) provides a bookmarklet and exposes a REST API for Prettier that allows to format CodeMirror editor in your browser
- [`prettier-github`](https://github.com/jgierer12/prettier-github) formats code in GitHub comments

## Technical Details

This printer is a fork of
[recast](https://github.com/benjamn/recast)'s printer with its
algorithm replaced by the one described by Wadler in "[A prettier
printer](http://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)".
There still may be leftover code from recast that needs to be cleaned
up.

The basic idea is that the printer takes an AST and returns an
intermediate representation of the output, and the printer uses that
to generate a string. The advantage is that the printer can "measure"
the IR and see if the output is going to fit on a line, and break if
not.

This means that most of the logic of printing an AST involves
generating an abstract representation of the output involving certain
commands. For example, `concat(["(", line, arg, line ")"])` would
represent a concatenation of opening parens, an argument, and closing
parens. But if that doesn't fit on one line, the printer can break
where `line` is specified.

More (rough) details can be found in [commands.md](commands.md).

## Badge

Show the world you're using *Prettier* → [![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

```md
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
