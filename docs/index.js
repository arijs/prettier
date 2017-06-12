'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var require$$0 = _interopDefault(require('assert'));

function assertDoc(val) {
  if (
    !(typeof val === "string" || (val != null && typeof val.type === "string"))
  ) {
    throw new Error(
      "Value " + JSON.stringify(val) + " is not a valid document"
    );
  }
}

function concat$1(parts) {
  parts.forEach(assertDoc);

  // We cannot do this until we change `printJSXElement` to not
  // access the internals of a document directly.
  // if(parts.length === 1) {
  //   // If it's a single document, no need to concat it.
  //   return parts[0];
  // }
  return { type: "concat", parts };
}

function indent$1(contents) {
  assertDoc(contents);

  return { type: "indent", contents };
}

function align(n, contents) {
  assertDoc(contents);

  return { type: "align", contents, n };
}

function group(contents, opts) {
  opts = opts || {};

  assertDoc(contents);

  return {
    type: "group",
    contents: contents,
    break: !!opts.shouldBreak,
    expandedStates: opts.expandedStates
  };
}

function conditionalGroup(states, opts) {
  return group(
    states[0],
    Object.assign(opts || {}, { expandedStates: states })
  );
}

function fill(parts) {
  parts.forEach(assertDoc);

  return { type: "fill", parts };
}

function ifBreak(breakContents, flatContents) {
  if (breakContents) {
    assertDoc(breakContents);
  }
  if (flatContents) {
    assertDoc(flatContents);
  }

  return { type: "if-break", breakContents, flatContents };
}

function lineSuffix$1(contents) {
  assertDoc(contents);
  return { type: "line-suffix", contents };
}

const lineSuffixBoundary = { type: "line-suffix-boundary" };
const breakParent$1 = { type: "break-parent" };
const line = { type: "line" };
const softline = { type: "line", soft: true };
const hardline$1 = concat$1([{ type: "line", hard: true }, breakParent$1]);
const literalline = concat$1([
  { type: "line", hard: true, literal: true },
  breakParent$1
]);
const cursor$1 = { type: "cursor", placeholder: Symbol() };

function join$1(sep, arr) {
  const res = [];

  for (let i = 0; i < arr.length; i++) {
    if (i !== 0) {
      res.push(sep);
    }

    res.push(arr[i]);
  }

  return concat$1(res);
}

function addAlignmentToDoc(doc, size, tabWidth) {
  let aligned = doc;
  if (size > 0) {
    // Use indent to add tabs for all the levels of tabs we need
    for (let i = 0; i < Math.floor(size / tabWidth); ++i) {
      aligned = indent$1(aligned);
    }
    // Use align for all the spaces that are needed
    aligned = align(size % tabWidth, aligned);
    // size is absolute from 0 and not relative to the current
    // indentation, so we use -Infinity to reset the indentation to 0
    aligned = align(-Infinity, aligned);
  }
  return aligned;
}

var docBuilders$1 = {
  concat: concat$1,
  join: join$1,
  line,
  softline,
  hardline: hardline$1,
  literalline,
  group,
  conditionalGroup,
  fill,
  lineSuffix: lineSuffix$1,
  lineSuffixBoundary,
  cursor: cursor$1,
  breakParent: breakParent$1,
  ifBreak,
  indent: indent$1,
  align,
  addAlignmentToDoc
};

function isExportDeclaration(node) {
  if (node) {
    switch (node.type) {
      case "ExportDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportDefaultSpecifier":
      case "DeclareExportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportAllDeclaration":
        return true;
    }
  }

  return false;
}

function getParentExportDeclaration(path) {
  const parentNode = path.getParentNode();
  if (path.getName() === "declaration" && isExportDeclaration(parentNode)) {
    return parentNode;
  }

  return null;
}

function getPenultimate(arr) {
  if (arr.length > 1) {
    return arr[arr.length - 2];
  }
  return null;
}

function getLast(arr) {
  if (arr.length > 0) {
    return arr[arr.length - 1];
  }
  return null;
}

function skip(chars) {
  return (text, index, opts) => {
    const backwards = opts && opts.backwards;

    // Allow `skip` functions to be threaded together without having
    // to check for failures (did someone say monads?).
    if (index === false) {
      return false;
    }

    const length = text.length;
    let cursor = index;
    while (cursor >= 0 && cursor < length) {
      const c = text.charAt(cursor);
      if (chars instanceof RegExp) {
        if (!chars.test(c)) {
          return cursor;
        }
      } else if (chars.indexOf(c) === -1) {
        return cursor;
      }

      backwards ? cursor-- : cursor++;
    }

    if (cursor === -1 || cursor === length) {
      // If we reached the beginning or end of the file, return the
      // out-of-bounds cursor. It's up to the caller to handle this
      // correctly. We don't want to indicate `false` though if it
      // actually skipped valid characters.
      return cursor;
    }
    return false;
  };
}

const skipWhitespace = skip(/\s/);
const skipSpaces = skip(" \t");
const skipToLineEnd = skip(",; \t");
const skipEverythingButNewLine = skip(/[^\r\n]/);

function skipInlineComment(text, index) {
  if (index === false) {
    return false;
  }

  if (text.charAt(index) === "/" && text.charAt(index + 1) === "*") {
    for (let i = index + 2; i < text.length; ++i) {
      if (text.charAt(i) === "*" && text.charAt(i + 1) === "/") {
        return i + 2;
      }
    }
  }
  return index;
}

function skipTrailingComment(text, index) {
  if (index === false) {
    return false;
  }

  if (text.charAt(index) === "/" && text.charAt(index + 1) === "/") {
    return skipEverythingButNewLine(text, index);
  }
  return index;
}

// This one doesn't use the above helper function because it wants to
// test \r\n in order and `skip` doesn't support ordering and we only
// want to skip one newline. It's simple to implement.
function skipNewline(text, index, opts) {
  const backwards = opts && opts.backwards;
  if (index === false) {
    return false;
  }

  const atIndex = text.charAt(index);
  if (backwards) {
    if (text.charAt(index - 1) === "\r" && atIndex === "\n") {
      return index - 2;
    }
    if (
      atIndex === "\n" ||
      atIndex === "\r" ||
      atIndex === "\u2028" ||
      atIndex === "\u2029"
    ) {
      return index - 1;
    }
  } else {
    if (atIndex === "\r" && text.charAt(index + 1) === "\n") {
      return index + 2;
    }
    if (
      atIndex === "\n" ||
      atIndex === "\r" ||
      atIndex === "\u2028" ||
      atIndex === "\u2029"
    ) {
      return index + 1;
    }
  }

  return index;
}

function hasNewline(text, index, opts) {
  opts = opts || {};
  const idx = skipSpaces(text, opts.backwards ? index - 1 : index, opts);
  const idx2 = skipNewline(text, idx, opts);
  return idx !== idx2;
}

function hasNewlineInRange(text, start, end) {
  for (let i = start; i < end; ++i) {
    if (text.charAt(i) === "\n") {
      return true;
    }
  }
  return false;
}

// Note: this function doesn't ignore leading comments unlike isNextLineEmpty
function isPreviousLineEmpty(text, node) {
  let idx = locStart$1(node) - 1;
  idx = skipSpaces(text, idx, { backwards: true });
  idx = skipNewline(text, idx, { backwards: true });
  idx = skipSpaces(text, idx, { backwards: true });
  const idx2 = skipNewline(text, idx, { backwards: true });
  return idx !== idx2;
}

function isNextLineEmpty(text, node) {
  let oldIdx = null;
  let idx = locEnd$1(node);
  while (idx !== oldIdx) {
    // We need to skip all the potential trailing inline comments
    oldIdx = idx;
    idx = skipToLineEnd(text, idx);
    idx = skipInlineComment(text, idx);
    idx = skipSpaces(text, idx);
  }
  idx = skipTrailingComment(text, idx);
  idx = skipNewline(text, idx);
  return hasNewline(text, idx);
}

function getNextNonSpaceNonCommentCharacter$1(text, node) {
  let oldIdx = null;
  let idx = locEnd$1(node);
  while (idx !== oldIdx) {
    oldIdx = idx;
    idx = skipSpaces(text, idx);
    idx = skipInlineComment(text, idx);
    idx = skipTrailingComment(text, idx);
    idx = skipNewline(text, idx);
  }
  return text.charAt(idx);
}

function hasSpaces(text, index, opts) {
  opts = opts || {};
  const idx = skipSpaces(text, opts.backwards ? index - 1 : index, opts);
  return idx !== index;
}

function locStart$1(node) {
  if (node.decorators && node.decorators.length > 0) {
    return locStart$1(node.decorators[0]);
  }
  if (node.range) {
    return node.range[0];
  }
  if (typeof node.start === "number") {
    return node.start;
  }
  if (node.source) {
    return lineColumnToIndex(node.source.start, node.source.input.css) - 1;
  }
}

function locEnd$1(node) {
  if (node.range) {
    return node.range[1];
  }
  if (typeof node.end === "number") {
    return node.end;
  }
  if (node.source) {
    return lineColumnToIndex(node.source.end, node.source.input.css);
  }
}

// Super inefficient, needs to be cached.
function lineColumnToIndex(lineColumn, text) {
  let index = 0;
  for (let i = 0; i < lineColumn.line - 1; ++i) {
    index = text.indexOf("\n", index) + 1;
    if (index === -1) {
      return -1;
    }
  }
  return index + lineColumn.column;
}

function setLocStart(node, index) {
  if (node.range) {
    node.range[0] = index;
  } else {
    node.start = index;
  }
}

function setLocEnd(node, index) {
  if (node.range) {
    node.range[1] = index;
  } else {
    node.end = index;
  }
}

const PRECEDENCE = {};
[
  ["||"],
  ["&&"],
  ["|"],
  ["^"],
  ["&"],
  ["==", "===", "!=", "!=="],
  ["<", ">", "<=", ">=", "in", "instanceof"],
  [">>", "<<", ">>>"],
  ["+", "-"],
  ["*", "/", "%"],
  ["**"]
].forEach((tier, i) => {
  tier.forEach(op => {
    PRECEDENCE[op] = i;
  });
});

function getPrecedence(op) {
  return PRECEDENCE[op];
}

// Tests if an expression starts with `{`, or (if forbidFunctionAndClass holds) `function` or `class`.
// Will be overzealous if there's already necessary grouping parentheses.
function startsWithNoLookaheadToken(node, forbidFunctionAndClass) {
  node = getLeftMost(node);
  switch (node.type) {
    case "FunctionExpression":
    case "ClassExpression":
      return forbidFunctionAndClass;
    case "ObjectExpression":
      return true;
    case "MemberExpression":
      return startsWithNoLookaheadToken(node.object, forbidFunctionAndClass);
    case "TaggedTemplateExpression":
      if (node.tag.type === "FunctionExpression") {
        // IIFEs are always already parenthesized
        return false;
      }
      return startsWithNoLookaheadToken(node.tag, forbidFunctionAndClass);
    case "CallExpression":
      if (node.callee.type === "FunctionExpression") {
        // IIFEs are always already parenthesized
        return false;
      }
      return startsWithNoLookaheadToken(node.callee, forbidFunctionAndClass);
    case "ConditionalExpression":
      return startsWithNoLookaheadToken(node.test, forbidFunctionAndClass);
    case "UpdateExpression":
      return (
        !node.prefix &&
        startsWithNoLookaheadToken(node.argument, forbidFunctionAndClass)
      );
    case "BindExpression":
      return (
        node.object &&
        startsWithNoLookaheadToken(node.object, forbidFunctionAndClass)
      );
    case "SequenceExpression":
      return startsWithNoLookaheadToken(
        node.expressions[0],
        forbidFunctionAndClass
      );
    case "TSAsExpression":
      return startsWithNoLookaheadToken(
        node.expression,
        forbidFunctionAndClass
      );
    default:
      return false;
  }
}

function getLeftMost(node) {
  if (node.left) {
    return getLeftMost(node.left);
  } else {
    return node;
  }
}

function hasBlockComments(node) {
  return node.comments && node.comments.some(isBlockComment);
}

function isBlockComment(comment) {
  return comment.type === "Block" || comment.type === "CommentBlock";
}

function getAlignmentSize(value, tabWidth, startIndex) {
  startIndex = startIndex || 0;

  let size = 0;
  for (let i = startIndex; i < value.length; ++i) {
    if (value[i] === "\t") {
      // Tabs behave in a way that they are aligned to the nearest
      // multiple of tabWidth:
      // 0 -> 4, 1 -> 4, 2 -> 4, 3 -> 4
      // 4 -> 8, 5 -> 8, 6 -> 8, 7 -> 8 ...
      size = size + tabWidth - size % tabWidth;
    } else {
      size++;
    }
  }

  return size;
}

var util$2 = {
  getPrecedence,
  isExportDeclaration,
  getParentExportDeclaration,
  getPenultimate,
  getLast,
  getNextNonSpaceNonCommentCharacter: getNextNonSpaceNonCommentCharacter$1,
  skipWhitespace,
  skipSpaces,
  skipNewline,
  isNextLineEmpty,
  isPreviousLineEmpty,
  hasNewline,
  hasNewlineInRange,
  hasSpaces,
  locStart: locStart$1,
  locEnd: locEnd$1,
  setLocStart,
  setLocEnd,
  startsWithNoLookaheadToken,
  hasBlockComments,
  isBlockComment,
  getAlignmentSize
};

const assert = require$$0;
const docBuilders = docBuilders$1;
const concat = docBuilders.concat;
const hardline = docBuilders.hardline;
const breakParent = docBuilders.breakParent;
const indent = docBuilders.indent;
const lineSuffix = docBuilders.lineSuffix;
const join = docBuilders.join;
const cursor = docBuilders.cursor;
const util$1 = util$2;
const childNodesCacheKey = Symbol("child-nodes");
const locStart = util$1.locStart;
const locEnd = util$1.locEnd;
const getNextNonSpaceNonCommentCharacter =
  util$1.getNextNonSpaceNonCommentCharacter;

function getSortedChildNodes(node, text, resultArray) {
  if (!node) {
    return;
  }

  if (resultArray) {
    if (
      node &&
      node.type &&
      node.type !== "CommentBlock" &&
      node.type !== "CommentLine" &&
      node.type !== "Line" &&
      node.type !== "Block" &&
      node.type !== "EmptyStatement" &&
      node.type !== "TemplateElement"
    ) {
      // This reverse insertion sort almost always takes constant
      // time because we almost always (maybe always?) append the
      // nodes in order anyway.
      let i;
      for (i = resultArray.length - 1; i >= 0; --i) {
        if (
          locStart(resultArray[i]) <= locStart(node) &&
          locEnd(resultArray[i]) <= locEnd(node)
        ) {
          break;
        }
      }
      resultArray.splice(i + 1, 0, node);
      return;
    }
  } else if (node[childNodesCacheKey]) {
    return node[childNodesCacheKey];
  }

  let names;
  if (node && typeof node === "object") {
    names = Object.keys(node).filter(
      n =>
        n !== "enclosingNode" && n !== "precedingNode" && n !== "followingNode"
    );
  } else {
    return;
  }

  if (!resultArray) {
    Object.defineProperty(node, childNodesCacheKey, {
      value: (resultArray = []),
      enumerable: false
    });
  }

  for (
    let i = 0,
      nameCount = names.length;
    i < nameCount;
    ++i
  ) {
    getSortedChildNodes(node[names[i]], text, resultArray);
  }

  return resultArray;
}

// As efficiently as possible, decorate the comment object with
// .precedingNode, .enclosingNode, and/or .followingNode properties, at
// least one of which is guaranteed to be defined.
function decorateComment(node, comment, text) {
  const childNodes = getSortedChildNodes(node, text);
  let precedingNode, followingNode;
  // Time to dust off the old binary search robes and wizard hat.
  let left = 0,
    right = childNodes.length;
  while (left < right) {
    const middle = (left + right) >> 1;
    const child = childNodes[middle];

    if (
      locStart(child) - locStart(comment) <= 0 &&
      locEnd(comment) - locEnd(child) <= 0
    ) {
      // The comment is completely contained by this child node.
      comment.enclosingNode = child;

      decorateComment(child, comment, text);
      return; // Abandon the binary search at this level.
    }

    if (locEnd(child) - locStart(comment) <= 0) {
      // This child node falls completely before the comment.
      // Because we will never consider this node or any nodes
      // before it again, this node must be the closest preceding
      // node we have encountered so far.
      precedingNode = child;
      left = middle + 1;
      continue;
    }

    if (locEnd(comment) - locStart(child) <= 0) {
      // This child node falls completely after the comment.
      // Because we will never consider this node or any nodes after
      // it again, this node must be the closest following node we
      // have encountered so far.
      followingNode = child;
      right = middle;
      continue;
    }

    throw new Error("Comment location overlaps with node location");
  }

  // We don't want comments inside of different expressions inside of the same
  // template literal to move to another expression.
  if (
    comment.enclosingNode &&
    comment.enclosingNode.type === "TemplateLiteral"
  ) {
    const quasis = comment.enclosingNode.quasis;
    const commentIndex = findExpressionIndexForComment(quasis, comment);

    if (
      precedingNode &&
      findExpressionIndexForComment(quasis, precedingNode) !== commentIndex
    ) {
      precedingNode = null;
    }
    if (
      followingNode &&
      findExpressionIndexForComment(quasis, followingNode) !== commentIndex
    ) {
      followingNode = null;
    }
  }

  if (precedingNode) {
    comment.precedingNode = precedingNode;
  }

  if (followingNode) {
    comment.followingNode = followingNode;
  }
}

function attach(comments, ast, text) {
  if (!Array.isArray(comments)) {
    return;
  }

  const tiesToBreak = [];

  comments.forEach((comment, i) => {
    decorateComment(ast, comment, text);

    const precedingNode = comment.precedingNode;
    const enclosingNode = comment.enclosingNode;
    const followingNode = comment.followingNode;

    const isLastComment = comments.length - 1 === i;

    if (util$1.hasNewline(text, locStart(comment), { backwards: true })) {
      // If a comment exists on its own line, prefer a leading comment.
      // We also need to check if it's the first line of the file.
      if (
        handleLastFunctionArgComments(
          text,
          precedingNode,
          enclosingNode,
          followingNode,
          comment
        ) ||
        handleMemberExpressionComments(enclosingNode, followingNode, comment) ||
        handleIfStatementComments(
          text,
          precedingNode,
          enclosingNode,
          followingNode,
          comment
        ) ||
        handleTryStatementComments(enclosingNode, followingNode, comment) ||
        handleClassComments(enclosingNode, comment) ||
        handleImportSpecifierComments(enclosingNode, comment) ||
        handleObjectPropertyComments(enclosingNode, comment) ||
        handleForComments(enclosingNode, precedingNode, comment) ||
        handleUnionTypeComments(
          precedingNode,
          enclosingNode,
          followingNode,
          comment
        ) ||
        handleOnlyComments(enclosingNode, ast, comment, isLastComment) ||
        handleImportDeclarationComments(
          text,
          enclosingNode,
          precedingNode,
          comment
        ) ||
        handleAssignmentPatternComments(enclosingNode, comment)
      ) {
        // We're good
      } else if (followingNode) {
        // Always a leading comment.
        addLeadingComment(followingNode, comment);
      } else if (precedingNode) {
        addTrailingComment(precedingNode, comment);
      } else if (enclosingNode) {
        addDanglingComment(enclosingNode, comment);
      } else {
        // There are no nodes, let's attach it to the root of the ast
        addDanglingComment(ast, comment);
      }
    } else if (util$1.hasNewline(text, locEnd(comment))) {
      if (
        handleLastFunctionArgComments(
          text,
          precedingNode,
          enclosingNode,
          followingNode,
          comment
        ) ||
        handleConditionalExpressionComments(
          enclosingNode,
          precedingNode,
          followingNode,
          comment,
          text
        ) ||
        handleImportSpecifierComments(enclosingNode, comment) ||
        handleIfStatementComments(
          text,
          precedingNode,
          enclosingNode,
          followingNode,
          comment
        ) ||
        handleClassComments(enclosingNode, comment) ||
        handleLabeledStatementComments(enclosingNode, comment) ||
        handleCallExpressionComments(precedingNode, enclosingNode, comment) ||
        handlePropertyComments(enclosingNode, comment) ||
        handleExportNamedDeclarationComments(enclosingNode, comment) ||
        handleOnlyComments(enclosingNode, ast, comment, isLastComment) ||
        handleClassMethodComments(enclosingNode, comment) ||
        handleTypeAliasComments(enclosingNode, followingNode, comment) ||
        handleVariableDeclaratorComments(enclosingNode, followingNode, comment)
      ) {
        // We're good
      } else if (precedingNode) {
        // There is content before this comment on the same line, but
        // none after it, so prefer a trailing comment of the previous node.
        addTrailingComment(precedingNode, comment);
      } else if (followingNode) {
        addLeadingComment(followingNode, comment);
      } else if (enclosingNode) {
        addDanglingComment(enclosingNode, comment);
      } else {
        // There are no nodes, let's attach it to the root of the ast
        addDanglingComment(ast, comment);
      }
    } else {
      if (
        handleIfStatementComments(
          text,
          precedingNode,
          enclosingNode,
          followingNode,
          comment
        ) ||
        handleObjectPropertyAssignment(enclosingNode, precedingNode, comment) ||
        handleCommentInEmptyParens(text, enclosingNode, comment) ||
        handleOnlyComments(enclosingNode, ast, comment, isLastComment)
      ) {
        // We're good
      } else if (precedingNode && followingNode) {
        // Otherwise, text exists both before and after the comment on
        // the same line. If there is both a preceding and following
        // node, use a tie-breaking algorithm to determine if it should
        // be attached to the next or previous node. In the last case,
        // simply attach the right node;
        const tieCount = tiesToBreak.length;
        if (tieCount > 0) {
          const lastTie = tiesToBreak[tieCount - 1];
          if (lastTie.followingNode !== comment.followingNode) {
            breakTies(tiesToBreak, text);
          }
        }
        tiesToBreak.push(comment);
      } else if (precedingNode) {
        addTrailingComment(precedingNode, comment);
      } else if (followingNode) {
        addLeadingComment(followingNode, comment);
      } else if (enclosingNode) {
        addDanglingComment(enclosingNode, comment);
      } else {
        // There are no nodes, let's attach it to the root of the ast
        addDanglingComment(ast, comment);
      }
    }
  });

  breakTies(tiesToBreak, text);

  comments.forEach(comment => {
    // These node references were useful for breaking ties, but we
    // don't need them anymore, and they create cycles in the AST that
    // may lead to infinite recursion if we don't delete them here.
    delete comment.precedingNode;
    delete comment.enclosingNode;
    delete comment.followingNode;
  });
}

function breakTies(tiesToBreak, text) {
  const tieCount = tiesToBreak.length;
  if (tieCount === 0) {
    return;
  }

  const precedingNode = tiesToBreak[0].precedingNode;
  const followingNode = tiesToBreak[0].followingNode;
  let gapEndPos = locStart(followingNode);

  // Iterate backwards through tiesToBreak, examining the gaps
  // between the tied comments. In order to qualify as leading, a
  // comment must be separated from followingNode by an unbroken series of
  // whitespace-only gaps (or other comments).
  let indexOfFirstLeadingComment;
  for (
    indexOfFirstLeadingComment = tieCount;
    indexOfFirstLeadingComment > 0;
    --indexOfFirstLeadingComment
  ) {
    const comment = tiesToBreak[indexOfFirstLeadingComment - 1];
    assert.strictEqual(comment.precedingNode, precedingNode);
    assert.strictEqual(comment.followingNode, followingNode);

    const gap = text.slice(locEnd(comment), gapEndPos);
    if (/\S/.test(gap)) {
      // The gap string contained something other than whitespace.
      break;
    }

    gapEndPos = locStart(comment);
  }

  tiesToBreak.forEach((comment, i) => {
    if (i < indexOfFirstLeadingComment) {
      addTrailingComment(precedingNode, comment);
    } else {
      addLeadingComment(followingNode, comment);
    }
  });

  tiesToBreak.length = 0;
}

function addCommentHelper(node, comment) {
  const comments = node.comments || (node.comments = []);
  comments.push(comment);
  comment.printed = false;
}

function addLeadingComment(node, comment) {
  comment.leading = true;
  comment.trailing = false;
  addCommentHelper(node, comment);
}

function addDanglingComment(node, comment) {
  comment.leading = false;
  comment.trailing = false;
  addCommentHelper(node, comment);
}

function addTrailingComment(node, comment) {
  comment.leading = false;
  comment.trailing = true;
  addCommentHelper(node, comment);
}

function addBlockStatementFirstComment(node, comment) {
  const body = node.body.filter(n => n.type !== "EmptyStatement");
  if (body.length === 0) {
    addDanglingComment(node, comment);
  } else {
    addLeadingComment(body[0], comment);
  }
}

function addBlockOrNotComment(node, comment) {
  if (node.type === "BlockStatement") {
    addBlockStatementFirstComment(node, comment);
  } else {
    addLeadingComment(node, comment);
  }
}

// There are often comments before the else clause of if statements like
//
//   if (1) { ... }
//   // comment
//   else { ... }
//
// They are being attached as leading comments of the BlockExpression which
// is not well printed. What we want is to instead move the comment inside
// of the block and make it leadingComment of the first element of the block
// or dangling comment of the block if there is nothing inside
//
//   if (1) { ... }
//   else {
//     // comment
//     ...
//   }
function handleIfStatementComments(
  text,
  precedingNode,
  enclosingNode,
  followingNode,
  comment
) {
  if (
    !enclosingNode ||
    enclosingNode.type !== "IfStatement" ||
    !followingNode
  ) {
    return false;
  }

  // We unfortunately have no way using the AST or location of nodes to know
  // if the comment is positioned before or after the condition parenthesis:
  //   if (a /* comment */) {}
  //   if (a) /* comment */ {}
  // The only workaround I found is to look at the next character to see if
  // it is a ).
  if (getNextNonSpaceNonCommentCharacter(text, comment) === ")") {
    addTrailingComment(precedingNode, comment);
    return true;
  }

  if (followingNode.type === "BlockStatement") {
    addBlockStatementFirstComment(followingNode, comment);
    return true;
  }

  if (followingNode.type === "IfStatement") {
    addBlockOrNotComment(followingNode.consequent, comment);
    return true;
  }

  return false;
}

// Same as IfStatement but for TryStatement
function handleTryStatementComments(enclosingNode, followingNode, comment) {
  if (
    !enclosingNode ||
    enclosingNode.type !== "TryStatement" ||
    !followingNode
  ) {
    return false;
  }

  if (followingNode.type === "BlockStatement") {
    addBlockStatementFirstComment(followingNode, comment);
    return true;
  }

  if (followingNode.type === "TryStatement") {
    addBlockOrNotComment(followingNode.finalizer, comment);
    return true;
  }

  if (followingNode.type === "CatchClause") {
    addBlockOrNotComment(followingNode.body, comment);
    return true;
  }

  return false;
}

function handleMemberExpressionComments(enclosingNode, followingNode, comment) {
  if (
    enclosingNode &&
    enclosingNode.type === "MemberExpression" &&
    followingNode &&
    followingNode.type === "Identifier"
  ) {
    addLeadingComment(enclosingNode, comment);
    return true;
  }

  return false;
}

function handleConditionalExpressionComments(
  enclosingNode,
  precedingNode,
  followingNode,
  comment,
  text
) {
  const isSameLineAsPrecedingNode =
    precedingNode &&
    !util$1.hasNewlineInRange(text, locEnd(precedingNode), locStart(comment));

  if (
    (!precedingNode || !isSameLineAsPrecedingNode) &&
    enclosingNode &&
    enclosingNode.type === "ConditionalExpression" &&
    followingNode
  ) {
    addLeadingComment(followingNode, comment);
    return true;
  }
  return false;
}

function handleObjectPropertyAssignment(enclosingNode, precedingNode, comment) {
  if (
    enclosingNode &&
    (enclosingNode.type === "ObjectProperty" ||
      enclosingNode.type === "Property") &&
    enclosingNode.shorthand &&
    enclosingNode.key === precedingNode &&
    enclosingNode.value.type === "AssignmentPattern"
  ) {
    addTrailingComment(enclosingNode.value.left, comment);
    return true;
  }
  return false;
}

function handleCommentInEmptyParens(text, enclosingNode, comment) {
  if (getNextNonSpaceNonCommentCharacter(text, comment) !== ")") {
    return false;
  }

  // Only add dangling comments to fix the case when no params are present,
  // i.e. a function without any argument.
  if (
    enclosingNode &&
    (((enclosingNode.type === "FunctionDeclaration" ||
      enclosingNode.type === "FunctionExpression" ||
      enclosingNode.type === "ArrowFunctionExpression" ||
      enclosingNode.type === "ClassMethod" ||
      enclosingNode.type === "ObjectMethod") &&
      enclosingNode.params.length === 0) ||
      (enclosingNode.type === "CallExpression" &&
        enclosingNode.arguments.length === 0))
  ) {
    addDanglingComment(enclosingNode, comment);
    return true;
  }
  if (
    enclosingNode &&
    (enclosingNode.type === "MethodDefinition" &&
      enclosingNode.value.params.length === 0)
  ) {
    addDanglingComment(enclosingNode.value, comment);
    return true;
  }
  return false;
}

function handleLastFunctionArgComments(
  text,
  precedingNode,
  enclosingNode,
  followingNode,
  comment
) {
  // Type definitions functions
  if (
    precedingNode &&
    precedingNode.type === "FunctionTypeParam" &&
    enclosingNode &&
    enclosingNode.type === "FunctionTypeAnnotation" &&
    followingNode &&
    followingNode.type !== "FunctionTypeParam"
  ) {
    addTrailingComment(precedingNode, comment);
    return true;
  }

  // Real functions
  if (
    precedingNode &&
    (precedingNode.type === "Identifier" ||
      precedingNode.type === "AssignmentPattern") &&
    enclosingNode &&
    (enclosingNode.type === "ArrowFunctionExpression" ||
      enclosingNode.type === "FunctionExpression" ||
      enclosingNode.type === "FunctionDeclaration" ||
      enclosingNode.type === "ObjectMethod" ||
      enclosingNode.type === "ClassMethod") &&
    getNextNonSpaceNonCommentCharacter(text, comment) === ")"
  ) {
    addTrailingComment(precedingNode, comment);
    return true;
  }
  return false;
}

function handleClassComments(enclosingNode, comment) {
  if (
    enclosingNode &&
    (enclosingNode.type === "ClassDeclaration" ||
      enclosingNode.type === "ClassExpression")
  ) {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleImportSpecifierComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === "ImportSpecifier") {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleObjectPropertyComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === "ObjectProperty") {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleLabeledStatementComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === "LabeledStatement") {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleCallExpressionComments(precedingNode, enclosingNode, comment) {
  if (
    enclosingNode &&
    enclosingNode.type === "CallExpression" &&
    precedingNode &&
    enclosingNode.callee === precedingNode &&
    enclosingNode.arguments.length > 0
  ) {
    addLeadingComment(enclosingNode.arguments[0], comment);
    return true;
  }
  return false;
}

function handleUnionTypeComments(
  precedingNode,
  enclosingNode,
  followingNode,
  comment
) {
  if (
    enclosingNode &&
    (enclosingNode.type === "UnionTypeAnnotation" ||
      enclosingNode.type === "TSUnionType")
  ) {
    addTrailingComment(precedingNode, comment);
    return true;
  }
  return false;
}

function handlePropertyComments(enclosingNode, comment) {
  if (
    enclosingNode &&
    (enclosingNode.type === "Property" ||
      enclosingNode.type === "ObjectProperty")
  ) {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleExportNamedDeclarationComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === "ExportNamedDeclaration") {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleOnlyComments(enclosingNode, ast, comment, isLastComment) {
  // With Flow the enclosingNode is undefined so use the AST instead.
  if (ast && ast.body && ast.body.length === 0) {
    if (isLastComment) {
      addDanglingComment(ast, comment);
    } else {
      addLeadingComment(ast, comment);
    }
    return true;
  } else if (
    enclosingNode &&
    enclosingNode.type === "Program" &&
    enclosingNode.body.length === 0 &&
    enclosingNode.directives &&
    enclosingNode.directives.length === 0
  ) {
    if (isLastComment) {
      addDanglingComment(enclosingNode, comment);
    } else {
      addLeadingComment(enclosingNode, comment);
    }
    return true;
  }
  return false;
}

function handleForComments(enclosingNode, precedingNode, comment) {
  if (
    enclosingNode &&
    (enclosingNode.type === "ForInStatement" ||
      enclosingNode.type === "ForOfStatement")
  ) {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleImportDeclarationComments(
  text,
  enclosingNode,
  precedingNode,
  comment
) {
  if (
    precedingNode &&
    enclosingNode &&
    enclosingNode.type === "ImportDeclaration" &&
    util$1.hasNewline(text, util$1.locEnd(comment))
  ) {
    addTrailingComment(precedingNode, comment);
    return true;
  }
  return false;
}

function handleAssignmentPatternComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === "AssignmentPattern") {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleClassMethodComments(enclosingNode, comment) {
  if (enclosingNode && enclosingNode.type === "ClassMethod") {
    addTrailingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleTypeAliasComments(enclosingNode, followingNode, comment) {
  if (enclosingNode && enclosingNode.type === "TypeAlias") {
    addLeadingComment(enclosingNode, comment);
    return true;
  }
  return false;
}

function handleVariableDeclaratorComments(
  enclosingNode,
  followingNode,
  comment
) {
  if (
    enclosingNode &&
    enclosingNode.type === "VariableDeclarator" &&
    followingNode &&
    (followingNode.type === "ObjectExpression" ||
      followingNode.type === "ArrayExpression")
  ) {
    addLeadingComment(followingNode, comment);
    return true;
  }
  return false;
}

function printComment(commentPath, options) {
  const comment = commentPath.getValue();
  comment.printed = true;

  switch (comment.type) {
    case "CommentBlock":
    case "Block":
      return "/*" + comment.value + "*/";
    case "CommentLine":
    case "Line":
      // Print shebangs with the proper comment characters
      if (options.originalText.slice(util$1.locStart(comment)).startsWith("#!")) {
        return "#!" + comment.value;
      }
      return "//" + comment.value;
    default:
      throw new Error("Not a comment: " + JSON.stringify(comment));
  }
}

function findExpressionIndexForComment(quasis, comment) {
  const startPos = locStart(comment) - 1;

  for (let i = 1; i < quasis.length; ++i) {
    if (startPos < getQuasiRange(quasis[i]).start) {
      return i - 1;
    }
  }

  // We haven't found it, it probably means that some of the locations are off.
  // Let's just return the first one.
  return 0;
}

function getQuasiRange(expr) {
  if (expr.start !== undefined) {
    // Babylon
    return { start: expr.start, end: expr.end };
  }
  // Flow
  return { start: expr.range[0], end: expr.range[1] };
}

function printLeadingComment(commentPath, print, options) {
  const comment = commentPath.getValue();
  const contents = printComment(commentPath, options);
  if (!contents) {
    return "";
  }
  const isBlock = util$1.isBlockComment(comment);

  // Leading block comments should see if they need to stay on the
  // same line or not.
  if (isBlock) {
    return concat([
      contents,
      util$1.hasNewline(options.originalText, locEnd(comment)) ? hardline : " "
    ]);
  }

  return concat([contents, hardline]);
}

function printTrailingComment(commentPath, print, options) {
  const comment = commentPath.getValue();
  const contents = printComment(commentPath, options);
  if (!contents) {
    return "";
  }
  const isBlock = util$1.isBlockComment(comment);

  if (
    util$1.hasNewline(options.originalText, locStart(comment), {
      backwards: true
    })
  ) {
    // This allows comments at the end of nested structures:
    // {
    //   x: 1,
    //   y: 2
    //   // A comment
    // }
    // Those kinds of comments are almost always leading comments, but
    // here it doesn't go "outside" the block and turns it into a
    // trailing comment for `2`. We can simulate the above by checking
    // if this a comment on its own line; normal trailing comments are
    // always at the end of another expression.

    const isLineBeforeEmpty = util$1.isPreviousLineEmpty(
      options.originalText,
      comment
    );

    return lineSuffix(
      concat([hardline, isLineBeforeEmpty ? hardline : "", contents])
    );
  } else if (isBlock) {
    // Trailing block comments never need a newline
    return concat([" ", contents]);
  }

  return concat([lineSuffix(" " + contents), !isBlock ? breakParent : ""]);
}

function printDanglingComments(path, options, sameIndent) {
  const parts = [];
  const node = path.getValue();

  if (!node || !node.comments) {
    return "";
  }

  path.each(commentPath => {
    const comment = commentPath.getValue();
    if (comment && !comment.leading && !comment.trailing) {
      parts.push(printComment(commentPath, options));
    }
  }, "comments");

  if (parts.length === 0) {
    return "";
  }

  if (sameIndent) {
    return join(hardline, parts);
  }
  return indent(concat([hardline, join(hardline, parts)]));
}

function prependCursorPlaceholder(path, options, printed) {
  if (path.getNode() === options.cursorNode) {
    return concat([cursor, printed]);
  }
  return printed;
}

function printComments(path, print, options, needsSemi) {
  const value = path.getValue();
  const printed = print(path);
  const comments = value && value.comments;

  if (!comments || comments.length === 0) {
    return prependCursorPlaceholder(path, options, printed);
  }

  const leadingParts = [];
  const trailingParts = [needsSemi ? ";" : "", printed];

  path.each(commentPath => {
    const comment = commentPath.getValue();
    const leading = comment.leading;
    const trailing = comment.trailing;

    if (leading) {
      const contents = printLeadingComment(commentPath, print, options);
      if (!contents) {
        return;
      }
      leadingParts.push(contents);

      const text = options.originalText;
      if (util$1.hasNewline(text, util$1.skipNewline(text, util$1.locEnd(comment)))) {
        leadingParts.push(hardline);
      }
    } else if (trailing) {
      trailingParts.push(printTrailingComment(commentPath, print, options));
    }
  }, "comments");

  return prependCursorPlaceholder(
    path,
    options,
    concat(leadingParts.concat(trailingParts))
  );
}

var comments$1 = {
  attach,
  printComments,
  printDanglingComments,
  getSortedChildNodes
};

var name = "prettier";
var version$1 = "1.4.2";
var description = "Prettier is an opinionated JavaScript formatter";
var bin = {"prettier":"./bin/prettier.js"};
var repository = "prettier/prettier";
var author = "James Long";
var license = "MIT";
var main = "./index.js";
var dependencies = {};
var devDependencies = {"babel-code-frame":"7.0.0-alpha.12","babylon":"7.0.0-beta.10","chalk":"1.1.3","cross-spawn":"5.1.0","diff":"3.2.0","eslint":"3.19.0","eslint-plugin-prettier":"2.1.1","esutils":"2.0.2","flow-parser":"0.47.0","get-stdin":"5.0.1","glob":"7.1.2","jest":"20.0.0","jest-validate":"20.0.3","minimist":"1.2.0","mkdirp":"^0.5.1","postcss":"^6.0.1","postcss-less":"^1.0.0","postcss-media-query-parser":"0.2.3","postcss-scss":"1.0.0","postcss-selector-parser":"2.2.3","postcss-values-parser":"git://github.com/shellscape/postcss-values-parser.git#5e351360479116f3fe309602cdd15b0a233bc29f","prettier":"1.4.0","rimraf":"2.6.1","rollup":"0.41.1","rollup-plugin-commonjs":"7.0.0","rollup-plugin-json":"2.1.0","rollup-plugin-node-builtins":"2.0.0","rollup-plugin-node-globals":"1.1.0","rollup-plugin-node-resolve":"2.0.0","rollup-plugin-replace":"1.1.1","typescript":"2.3.2","typescript-eslint-parser":"git://github.com/vjeux/typescript-eslint-parser.git#488ba4f273f52ee6ef8d951d7ae84d28231e2fe9","uglify-es":"3.0.15","webpack":"2.6.1"};
var scripts = {"test":"jest","test-integration":"jest tests_integration","lint":"eslint .","build":"./scripts/build/build.sh","build:docs":"rollup -c docs/rollup.config.js"};
var jest = {"setupFiles":["<rootDir>/tests_config/run_spec.js"],"snapshotSerializers":["<rootDir>/tests_config/raw-serializer.js"],"testRegex":"jsfmt\\.spec\\.js$|__tests__/.*\\.js$","testPathIgnorePatterns":["tests/new_react","tests/more_react"]};
var _package = {
	name: name,
	version: version$1,
	description: description,
	bin: bin,
	repository: repository,
	author: author,
	license: license,
	main: main,
	dependencies: dependencies,
	devDependencies: devDependencies,
	scripts: scripts,
	jest: jest
};

var _package$1 = Object.freeze({
	name: name,
	version: version$1,
	description: description,
	bin: bin,
	repository: repository,
	author: author,
	license: license,
	main: main,
	dependencies: dependencies,
	devDependencies: devDependencies,
	scripts: scripts,
	jest: jest,
	default: _package
});

const assert$2 = require$$0;
const util$5 = util$2;
const startsWithNoLookaheadToken$1 = util$5.startsWithNoLookaheadToken;

function FastPath$1(value) {
  assert$2.ok(this instanceof FastPath$1);
  this.stack = [value];
}

// The name of the current property is always the penultimate element of
// this.stack, and always a String.
FastPath$1.prototype.getName = function getName() {
  const s = this.stack;
  const len = s.length;
  if (len > 1) {
    return s[len - 2];
  }
  // Since the name is always a string, null is a safe sentinel value to
  // return if we do not know the name of the (root) value.
  return null;
};

// The value of the current property is always the final element of
// this.stack.
FastPath$1.prototype.getValue = function getValue() {
  const s = this.stack;
  return s[s.length - 1];
};

function getNodeHelper(path, count) {
  const s = path.stack;

  for (let i = s.length - 1; i >= 0; i -= 2) {
    const value = s[i];

    if (value && !Array.isArray(value) && --count < 0) {
      return value;
    }
  }

  return null;
}

FastPath$1.prototype.getNode = function getNode(count) {
  return getNodeHelper(this, ~~count);
};

FastPath$1.prototype.getParentNode = function getParentNode(count) {
  return getNodeHelper(this, ~~count + 1);
};

// Temporarily push properties named by string arguments given after the
// callback function onto this.stack, then call the callback with a
// reference to this (modified) FastPath object. Note that the stack will
// be restored to its original state after the callback is finished, so it
// is probably a mistake to retain a reference to the path.
FastPath$1.prototype.call = function call(callback /*, name1, name2, ... */) {
  const s = this.stack;
  const origLen = s.length;
  let value = s[origLen - 1];
  const argc = arguments.length;
  for (let i = 1; i < argc; ++i) {
    const name = arguments[i];
    value = value[name];
    s.push(name, value);
  }
  const result = callback(this);
  s.length = origLen;
  return result;
};

// Similar to FastPath.prototype.call, except that the value obtained by
// accessing this.getValue()[name1][name2]... should be array-like. The
// callback will be called with a reference to this path object for each
// element of the array.
FastPath$1.prototype.each = function each(callback /*, name1, name2, ... */) {
  const s = this.stack;
  const origLen = s.length;
  let value = s[origLen - 1];
  const argc = arguments.length;

  for (let i = 1; i < argc; ++i) {
    const name = arguments[i];
    value = value[name];
    s.push(name, value);
  }

  for (let i = 0; i < value.length; ++i) {
    if (i in value) {
      s.push(i, value[i]);
      // If the callback needs to know the value of i, call
      // path.getName(), assuming path is the parameter name.
      callback(this);
      s.length -= 2;
    }
  }

  s.length = origLen;
};

// Similar to FastPath.prototype.each, except that the results of the
// callback function invocations are stored in an array and returned at
// the end of the iteration.
FastPath$1.prototype.map = function map(callback /*, name1, name2, ... */) {
  const s = this.stack;
  const origLen = s.length;
  let value = s[origLen - 1];
  const argc = arguments.length;

  for (let i = 1; i < argc; ++i) {
    const name = arguments[i];
    value = value[name];
    s.push(name, value);
  }

  const result = new Array(value.length);

  for (let i = 0; i < value.length; ++i) {
    if (i in value) {
      s.push(i, value[i]);
      result[i] = callback(this, i);
      s.length -= 2;
    }
  }

  s.length = origLen;

  return result;
};

FastPath$1.prototype.needsParens = function() {
  const parent = this.getParentNode();
  if (!parent) {
    return false;
  }

  const name = this.getName();
  const node = this.getNode();

  // If the value of this path is some child of a Node and not a Node
  // itself, then it doesn't need parentheses. Only Node objects (in
  // fact, only Expression nodes) need parentheses.
  if (this.getValue() !== node) {
    return false;
  }

  // Only statements don't need parentheses.
  if (isStatement(node)) {
    return false;
  }

  // Identifiers never need parentheses.
  if (node.type === "Identifier") {
    return false;
  }

  if (parent.type === "ParenthesizedExpression") {
    return false;
  }

  // Add parens around the extends clause of a class. It is needed for almost
  // all expressions.
  if (
    (parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
    parent.superClass === node &&
    (node.type === "ArrowFunctionExpression" ||
      node.type === "AssignmentExpression" ||
      node.type === "AwaitExpression" ||
      node.type === "BinaryExpression" ||
      node.type === "ConditionalExpression" ||
      node.type === "LogicalExpression" ||
      node.type === "NewExpression" ||
      node.type === "ObjectExpression" ||
      node.type === "ParenthesizedExpression" ||
      node.type === "SequenceExpression" ||
      node.type === "TaggedTemplateExpression" ||
      node.type === "UnaryExpression" ||
      node.type === "UpdateExpression" ||
      node.type === "YieldExpression")
  ) {
    return true;
  }

  if (
    (parent.type === "ArrowFunctionExpression" &&
      parent.body === node &&
      startsWithNoLookaheadToken$1(node, /* forbidFunctionAndClass */ false)) ||
    (parent.type === "ExpressionStatement" &&
      startsWithNoLookaheadToken$1(node, /* forbidFunctionAndClass */ true))
  ) {
    return true;
  }

  switch (node.type) {
    case "CallExpression":
      if (parent.type === "NewExpression" && parent.callee === node) {
        return true;
      }
      return false;

    case "SpreadElement":
    case "SpreadProperty":
      return (
        parent.type === "MemberExpression" &&
        name === "object" &&
        parent.object === node
      );

    case "UpdateExpression":
      if (parent.type === "UnaryExpression") {
        return (
          node.prefix &&
          ((node.operator === "++" && parent.operator === "+") ||
            (node.operator === "--" && parent.operator === "-"))
        );
      }
    // else fallthrough
    case "UnaryExpression":
      switch (parent.type) {
        case "UnaryExpression":
          return (
            node.operator === parent.operator &&
            (node.operator === "+" || node.operator === "-")
          );

        case "MemberExpression":
          return name === "object" && parent.object === node;

        case "TaggedTemplateExpression":
          return true;

        case "NewExpression":
        case "CallExpression":
          return name === "callee" && parent.callee === node;

        case "BinaryExpression":
          return parent.operator === "**" && name === "left";

        default:
          return false;
      }

    case "BinaryExpression": {
      if (parent.type === "UpdateExpression") {
        return true;
      }

      const isLeftOfAForStatement = node => {
        let i = 0;
        while (node) {
          const parent = this.getParentNode(i++);
          if (!parent) {
            return false;
          }
          if (parent.type === "ForStatement" && parent.init === node) {
            return true;
          }
          node = parent;
        }
        return false;
      };
      if (node.operator === "in" && isLeftOfAForStatement(node)) {
        return true;
      }
    }
    // fallthrough
    case "TSTypeAssertionExpression":
    case "TSAsExpression":
    case "LogicalExpression":
      switch (parent.type) {
        case "CallExpression":
        case "NewExpression":
          return name === "callee" && parent.callee === node;

        case "ClassDeclaration":
          return name === "superClass" && parent.superClass === node;
        case "TSTypeAssertionExpression":
        case "TaggedTemplateExpression":
        case "UnaryExpression":
        case "SpreadElement":
        case "SpreadProperty":
        case "AwaitExpression":
        case "TSAsExpression":
        case "TSNonNullExpression":
          return true;

        case "MemberExpression":
          return name === "object" && parent.object === node;

        case "BinaryExpression":
        case "LogicalExpression": {
          if (!node.operator) {
            return true;
          }

          const po = parent.operator;
          const pp = util$5.getPrecedence(po);
          const no = node.operator;
          const np = util$5.getPrecedence(no);

          if (po === "||" && no === "&&") {
            return true;
          }

          if (pp > np) {
            return true;
          }

          if (no === "**" && po === "**") {
            return name === "left";
          }

          if (pp === np && name === "right") {
            assert$2.strictEqual(parent.right, node);
            return true;
          }

          // Add parenthesis when working with binary operators
          // It's not stricly needed but helps with code understanding
          if (["|", "^", "&", ">>", "<<", ">>>"].indexOf(po) !== -1) {
            return true;
          }

          return false;
        }

        default:
          return false;
      }

    case "SequenceExpression":
      switch (parent.type) {
        case "ReturnStatement":
          return false;

        case "ForStatement":
          // Although parentheses wouldn't hurt around sequence
          // expressions in the head of for loops, traditional style
          // dictates that e.g. i++, j++ should not be wrapped with
          // parentheses.
          return false;

        case "ExpressionStatement":
          return name !== "expression";

        default:
          // Otherwise err on the side of overparenthesization, adding
          // explicit exceptions above if this proves overzealous.
          return true;
      }

    case "YieldExpression":
      if (
        parent.type === "UnaryExpression" ||
        parent.type === "AwaitExpression" ||
        parent.type === "TSAsExpression"
      ) {
        return true;
      }
    // else fallthrough
    case "AwaitExpression":
      switch (parent.type) {
        case "TaggedTemplateExpression":
        case "BinaryExpression":
        case "LogicalExpression":
        case "SpreadElement":
        case "SpreadProperty":
        case "TSAsExpression":
          return true;

        case "MemberExpression":
          return parent.object === node;

        case "NewExpression":
        case "CallExpression":
          return parent.callee === node;

        case "ConditionalExpression":
          return parent.test === node;

        default:
          return false;
      }

    case "ArrayTypeAnnotation":
      return parent.type === "NullableTypeAnnotation";

    case "IntersectionTypeAnnotation":
    case "UnionTypeAnnotation":
      return (
        parent.type === "ArrayTypeAnnotation" ||
        parent.type === "NullableTypeAnnotation" ||
        parent.type === "IntersectionTypeAnnotation" ||
        parent.type === "UnionTypeAnnotation"
      );

    case "NullableTypeAnnotation":
      return parent.type === "ArrayTypeAnnotation";

    case "FunctionTypeAnnotation":
      return (
        parent.type === "UnionTypeAnnotation" ||
        parent.type === "IntersectionTypeAnnotation"
      );

    case "NumericLiteral":
    case "Literal":
      return (
        parent.type === "MemberExpression" &&
        typeof node.value === "number" &&
        name === "object" &&
        parent.object === node
      );

    case "AssignmentExpression": {
      const grandParent = this.getParentNode(1);

      if (parent.type === "ArrowFunctionExpression" && parent.body === node) {
        return true;
      } else if (
        parent.type === "ClassProperty" &&
        parent.key === node &&
        parent.computed
      ) {
        return false;
      } else if (
        parent.type === "TSPropertySignature" &&
        parent.name === node
      ) {
        return false;
      } else if (
        parent.type === "ForStatement" &&
        (parent.init === node || parent.update === node)
      ) {
        return false;
      } else if (parent.type === "ExpressionStatement") {
        return node.left.type === "ObjectPattern";
      } else if (parent.type === "TSPropertySignature" && parent.key === node) {
        return false;
      } else if (parent.type === "AssignmentExpression") {
        return false;
      } else if (
        parent.type === "SequenceExpression" &&
        grandParent &&
        grandParent.type === "ForStatement" &&
        (grandParent.init === parent || grandParent.update === parent)
      ) {
        return false;
      }
      return true;
    }
    case "ConditionalExpression":
      switch (parent.type) {
        case "TaggedTemplateExpression":
        case "UnaryExpression":
        case "SpreadElement":
        case "SpreadProperty":
        case "BinaryExpression":
        case "LogicalExpression":
        case "ExportDefaultDeclaration":
        case "AwaitExpression":
        case "JSXSpreadAttribute":
        case "TSTypeAssertionExpression":
        case "TSAsExpression":
        case "TSNonNullExpression":
          return true;

        case "NewExpression":
        case "CallExpression":
          return name === "callee" && parent.callee === node;

        case "ConditionalExpression":
          return name === "test" && parent.test === node;

        case "MemberExpression":
          return name === "object" && parent.object === node;

        default:
          return false;
      }

    case "FunctionExpression":
      switch (parent.type) {
        case "CallExpression":
          return name === "callee"; // Not strictly necessary, but it's clearer to the reader if IIFEs are wrapped in parentheses.
        case "TaggedTemplateExpression":
          return true; // This is basically a kind of IIFE.
        case "ExportDefaultDeclaration":
          return true;
        default:
          return false;
      }

    case "ArrowFunctionExpression":
      switch (parent.type) {
        case "CallExpression":
          return name === "callee";

        case "NewExpression":
          return name === "callee";

        case "MemberExpression":
          return name === "object";

        case "TSAsExpression":
        case "BindExpression":
        case "TaggedTemplateExpression":
        case "UnaryExpression":
        case "LogicalExpression":
        case "BinaryExpression":
        case "AwaitExpression":
        case "TSTypeAssertionExpression":
          return true;

        case "ConditionalExpression":
          return name === "test";

        default:
          return false;
      }

    case "ClassExpression":
      return parent.type === "ExportDefaultDeclaration";

    case "StringLiteral":
      return parent.type === "ExpressionStatement"; // To avoid becoming a directive
  }

  return false;
};

function isStatement(node) {
  return (
    node.type === "BlockStatement" ||
    node.type === "BreakStatement" ||
    node.type === "ClassBody" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassMethod" ||
    node.type === "ClassProperty" ||
    node.type === "ContinueStatement" ||
    node.type === "DebuggerStatement" ||
    node.type === "DeclareClass" ||
    node.type === "DeclareExportAllDeclaration" ||
    node.type === "DeclareExportDeclaration" ||
    node.type === "DeclareFunction" ||
    node.type === "DeclareInterface" ||
    node.type === "DeclareModule" ||
    node.type === "DeclareModuleExports" ||
    node.type === "DeclareVariable" ||
    node.type === "DoWhileStatement" ||
    node.type === "ExportAllDeclaration" ||
    node.type === "ExportDefaultDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ExpressionStatement" ||
    node.type === "ForAwaitStatement" ||
    node.type === "ForInStatement" ||
    node.type === "ForOfStatement" ||
    node.type === "ForStatement" ||
    node.type === "FunctionDeclaration" ||
    node.type === "IfStatement" ||
    node.type === "ImportDeclaration" ||
    node.type === "InterfaceDeclaration" ||
    node.type === "LabeledStatement" ||
    node.type === "MethodDefinition" ||
    node.type === "ReturnStatement" ||
    node.type === "SwitchStatement" ||
    node.type === "ThrowStatement" ||
    node.type === "TryStatement" ||
    node.type === "TSAbstractClassDeclaration" ||
    node.type === "TSEnumDeclaration" ||
    node.type === "TSImportEqualsDeclaration" ||
    node.type === "TSInterfaceDeclaration" ||
    node.type === "TSModuleDeclaration" ||
    node.type === "TSNamespaceExportDeclaration" ||
    node.type === "TSNamespaceFunctionDeclaration" ||
    node.type === "TypeAlias" ||
    node.type === "VariableDeclaration" ||
    node.type === "WhileStatement" ||
    node.type === "WithStatement"
  );
}

var fastPath = FastPath$1;

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var ast = createCommonjsModule(function (module) {
/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS'
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function () {
    'use strict';

    function isExpression(node) {
        if (node == null) { return false; }
        switch (node.type) {
            case 'ArrayExpression':
            case 'AssignmentExpression':
            case 'BinaryExpression':
            case 'CallExpression':
            case 'ConditionalExpression':
            case 'FunctionExpression':
            case 'Identifier':
            case 'Literal':
            case 'LogicalExpression':
            case 'MemberExpression':
            case 'NewExpression':
            case 'ObjectExpression':
            case 'SequenceExpression':
            case 'ThisExpression':
            case 'UnaryExpression':
            case 'UpdateExpression':
                return true;
        }
        return false;
    }

    function isIterationStatement(node) {
        if (node == null) { return false; }
        switch (node.type) {
            case 'DoWhileStatement':
            case 'ForInStatement':
            case 'ForStatement':
            case 'WhileStatement':
                return true;
        }
        return false;
    }

    function isStatement(node) {
        if (node == null) { return false; }
        switch (node.type) {
            case 'BlockStatement':
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'DebuggerStatement':
            case 'DoWhileStatement':
            case 'EmptyStatement':
            case 'ExpressionStatement':
            case 'ForInStatement':
            case 'ForStatement':
            case 'IfStatement':
            case 'LabeledStatement':
            case 'ReturnStatement':
            case 'SwitchStatement':
            case 'ThrowStatement':
            case 'TryStatement':
            case 'VariableDeclaration':
            case 'WhileStatement':
            case 'WithStatement':
                return true;
        }
        return false;
    }

    function isSourceElement(node) {
      return isStatement(node) || node != null && node.type === 'FunctionDeclaration';
    }

    function trailingStatement(node) {
        switch (node.type) {
        case 'IfStatement':
            if (node.alternate != null) {
                return node.alternate;
            }
            return node.consequent;

        case 'LabeledStatement':
        case 'ForStatement':
        case 'ForInStatement':
        case 'WhileStatement':
        case 'WithStatement':
            return node.body;
        }
        return null;
    }

    function isProblematicIfStatement(node) {
        var current;

        if (node.type !== 'IfStatement') {
            return false;
        }
        if (node.alternate == null) {
            return false;
        }
        current = node.consequent;
        do {
            if (current.type === 'IfStatement') {
                if (current.alternate == null)  {
                    return true;
                }
            }
            current = trailingStatement(current);
        } while (current);

        return false;
    }

    module.exports = {
        isExpression: isExpression,
        isStatement: isStatement,
        isIterationStatement: isIterationStatement,
        isSourceElement: isSourceElement,
        isProblematicIfStatement: isProblematicIfStatement,

        trailingStatement: trailingStatement
    };
}());
/* vim: set sw=4 ts=4 et tw=80 : */
});

var code = createCommonjsModule(function (module) {
/*
  Copyright (C) 2013-2014 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2014 Ivan Nikulin <ifaaan@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function () {
    'use strict';

    var ES6Regex, ES5Regex, NON_ASCII_WHITESPACES, IDENTIFIER_START, IDENTIFIER_PART, ch;

    // See `tools/generate-identifier-regex.js`.
    ES5Regex = {
        // ECMAScript 5.1/Unicode v7.0.0 NonAsciiIdentifierStart:
        NonAsciiIdentifierStart: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B2\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/,
        // ECMAScript 5.1/Unicode v7.0.0 NonAsciiIdentifierPart:
        NonAsciiIdentifierPart: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B2\u08E4-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA69D\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2D\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/
    };

    ES6Regex = {
        // ECMAScript 6/Unicode v7.0.0 NonAsciiIdentifierStart:
        NonAsciiIdentifierStart: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B2\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDE00-\uDE11\uDE13-\uDE2B\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF5D-\uDF61]|\uD805[\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDE00-\uDE2F\uDE44\uDE80-\uDEAA]|\uD806[\uDCA0-\uDCDF\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF98]|\uD809[\uDC00-\uDC6E]|[\uD80C\uD840-\uD868\uD86A-\uD86C][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D]|\uD87E[\uDC00-\uDE1D]/,
        // ECMAScript 6/Unicode v7.0.0 NonAsciiIdentifierPart:
        NonAsciiIdentifierPart: /[\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B2\u08E4-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA69D\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2D\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDD0-\uDDDA\uDE00-\uDE11\uDE13-\uDE37\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF01-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9]|\uD806[\uDCA0-\uDCE9\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF98]|\uD809[\uDC00-\uDC6E]|[\uD80C\uD840-\uD868\uD86A-\uD86C][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF]/
    };

    function isDecimalDigit(ch) {
        return 0x30 <= ch && ch <= 0x39;  // 0..9
    }

    function isHexDigit(ch) {
        return 0x30 <= ch && ch <= 0x39 ||  // 0..9
            0x61 <= ch && ch <= 0x66 ||     // a..f
            0x41 <= ch && ch <= 0x46;       // A..F
    }

    function isOctalDigit(ch) {
        return ch >= 0x30 && ch <= 0x37;  // 0..7
    }

    // 7.2 White Space

    NON_ASCII_WHITESPACES = [
        0x1680, 0x180E,
        0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
        0x202F, 0x205F,
        0x3000,
        0xFEFF
    ];

    function isWhiteSpace(ch) {
        return ch === 0x20 || ch === 0x09 || ch === 0x0B || ch === 0x0C || ch === 0xA0 ||
            ch >= 0x1680 && NON_ASCII_WHITESPACES.indexOf(ch) >= 0;
    }

    // 7.3 Line Terminators

    function isLineTerminator(ch) {
        return ch === 0x0A || ch === 0x0D || ch === 0x2028 || ch === 0x2029;
    }

    // 7.6 Identifier Names and Identifiers

    function fromCodePoint(cp) {
        if (cp <= 0xFFFF) { return String.fromCharCode(cp); }
        var cu1 = String.fromCharCode(Math.floor((cp - 0x10000) / 0x400) + 0xD800);
        var cu2 = String.fromCharCode(((cp - 0x10000) % 0x400) + 0xDC00);
        return cu1 + cu2;
    }

    IDENTIFIER_START = new Array(0x80);
    for(ch = 0; ch < 0x80; ++ch) {
        IDENTIFIER_START[ch] =
            ch >= 0x61 && ch <= 0x7A ||  // a..z
            ch >= 0x41 && ch <= 0x5A ||  // A..Z
            ch === 0x24 || ch === 0x5F;  // $ (dollar) and _ (underscore)
    }

    IDENTIFIER_PART = new Array(0x80);
    for(ch = 0; ch < 0x80; ++ch) {
        IDENTIFIER_PART[ch] =
            ch >= 0x61 && ch <= 0x7A ||  // a..z
            ch >= 0x41 && ch <= 0x5A ||  // A..Z
            ch >= 0x30 && ch <= 0x39 ||  // 0..9
            ch === 0x24 || ch === 0x5F;  // $ (dollar) and _ (underscore)
    }

    function isIdentifierStartES5(ch) {
        return ch < 0x80 ? IDENTIFIER_START[ch] : ES5Regex.NonAsciiIdentifierStart.test(fromCodePoint(ch));
    }

    function isIdentifierPartES5(ch) {
        return ch < 0x80 ? IDENTIFIER_PART[ch] : ES5Regex.NonAsciiIdentifierPart.test(fromCodePoint(ch));
    }

    function isIdentifierStartES6(ch) {
        return ch < 0x80 ? IDENTIFIER_START[ch] : ES6Regex.NonAsciiIdentifierStart.test(fromCodePoint(ch));
    }

    function isIdentifierPartES6(ch) {
        return ch < 0x80 ? IDENTIFIER_PART[ch] : ES6Regex.NonAsciiIdentifierPart.test(fromCodePoint(ch));
    }

    module.exports = {
        isDecimalDigit: isDecimalDigit,
        isHexDigit: isHexDigit,
        isOctalDigit: isOctalDigit,
        isWhiteSpace: isWhiteSpace,
        isLineTerminator: isLineTerminator,
        isIdentifierStartES5: isIdentifierStartES5,
        isIdentifierPartES5: isIdentifierPartES5,
        isIdentifierStartES6: isIdentifierStartES6,
        isIdentifierPartES6: isIdentifierPartES6
    };
}());
/* vim: set sw=4 ts=4 et tw=80 : */
});

var keyword = createCommonjsModule(function (module) {
/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function () {
    'use strict';

    var code$$1 = code;

    function isStrictModeReservedWordES6(id) {
        switch (id) {
        case 'implements':
        case 'interface':
        case 'package':
        case 'private':
        case 'protected':
        case 'public':
        case 'static':
        case 'let':
            return true;
        default:
            return false;
        }
    }

    function isKeywordES5(id, strict) {
        // yield should not be treated as keyword under non-strict mode.
        if (!strict && id === 'yield') {
            return false;
        }
        return isKeywordES6(id, strict);
    }

    function isKeywordES6(id, strict) {
        if (strict && isStrictModeReservedWordES6(id)) {
            return true;
        }

        switch (id.length) {
        case 2:
            return (id === 'if') || (id === 'in') || (id === 'do');
        case 3:
            return (id === 'var') || (id === 'for') || (id === 'new') || (id === 'try');
        case 4:
            return (id === 'this') || (id === 'else') || (id === 'case') ||
                (id === 'void') || (id === 'with') || (id === 'enum');
        case 5:
            return (id === 'while') || (id === 'break') || (id === 'catch') ||
                (id === 'throw') || (id === 'const') || (id === 'yield') ||
                (id === 'class') || (id === 'super');
        case 6:
            return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
                (id === 'switch') || (id === 'export') || (id === 'import');
        case 7:
            return (id === 'default') || (id === 'finally') || (id === 'extends');
        case 8:
            return (id === 'function') || (id === 'continue') || (id === 'debugger');
        case 10:
            return (id === 'instanceof');
        default:
            return false;
        }
    }

    function isReservedWordES5(id, strict) {
        return id === 'null' || id === 'true' || id === 'false' || isKeywordES5(id, strict);
    }

    function isReservedWordES6(id, strict) {
        return id === 'null' || id === 'true' || id === 'false' || isKeywordES6(id, strict);
    }

    function isRestrictedWord(id) {
        return id === 'eval' || id === 'arguments';
    }

    function isIdentifierNameES5(id) {
        var i, iz, ch;

        if (id.length === 0) { return false; }

        ch = id.charCodeAt(0);
        if (!code$$1.isIdentifierStartES5(ch)) {
            return false;
        }

        for (i = 1, iz = id.length; i < iz; ++i) {
            ch = id.charCodeAt(i);
            if (!code$$1.isIdentifierPartES5(ch)) {
                return false;
            }
        }
        return true;
    }

    function decodeUtf16(lead, trail) {
        return (lead - 0xD800) * 0x400 + (trail - 0xDC00) + 0x10000;
    }

    function isIdentifierNameES6(id) {
        var i, iz, ch, lowCh, check;

        if (id.length === 0) { return false; }

        check = code$$1.isIdentifierStartES6;
        for (i = 0, iz = id.length; i < iz; ++i) {
            ch = id.charCodeAt(i);
            if (0xD800 <= ch && ch <= 0xDBFF) {
                ++i;
                if (i >= iz) { return false; }
                lowCh = id.charCodeAt(i);
                if (!(0xDC00 <= lowCh && lowCh <= 0xDFFF)) {
                    return false;
                }
                ch = decodeUtf16(ch, lowCh);
            }
            if (!check(ch)) {
                return false;
            }
            check = code$$1.isIdentifierPartES6;
        }
        return true;
    }

    function isIdentifierES5(id, strict) {
        return isIdentifierNameES5(id) && !isReservedWordES5(id, strict);
    }

    function isIdentifierES6(id, strict) {
        return isIdentifierNameES6(id) && !isReservedWordES6(id, strict);
    }

    module.exports = {
        isKeywordES5: isKeywordES5,
        isKeywordES6: isKeywordES6,
        isReservedWordES5: isReservedWordES5,
        isReservedWordES6: isReservedWordES6,
        isRestrictedWord: isRestrictedWord,
        isIdentifierNameES5: isIdentifierNameES5,
        isIdentifierNameES6: isIdentifierNameES6,
        isIdentifierES5: isIdentifierES5,
        isIdentifierES6: isIdentifierES6
    };
}());
/* vim: set sw=4 ts=4 et tw=80 : */
});

var utils = createCommonjsModule(function (module, exports) {
/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


(function () {
    'use strict';

    exports.ast = ast;
    exports.code = code;
    exports.keyword = keyword;
}());
/* vim: set sw=4 ts=4 et tw=80 : */
});

function traverseDoc(doc, onEnter, onExit, shouldTraverseConditionalGroups) {
  function traverseDocRec(doc) {
    let shouldRecurse = true;
    if (onEnter) {
      if (onEnter(doc) === false) {
        shouldRecurse = false;
      }
    }

    if (shouldRecurse) {
      if (doc.type === "concat" || doc.type === "fill") {
        for (let i = 0; i < doc.parts.length; i++) {
          traverseDocRec(doc.parts[i]);
        }
      } else if (doc.type === "if-break") {
        if (doc.breakContents) {
          traverseDocRec(doc.breakContents);
        }
        if (doc.flatContents) {
          traverseDocRec(doc.flatContents);
        }
      } else if (doc.type === "group" && doc.expandedStates) {
        if (shouldTraverseConditionalGroups) {
          doc.expandedStates.forEach(traverseDocRec);
        } else {
          traverseDocRec(doc.contents);
        }
      } else if (doc.contents) {
        traverseDocRec(doc.contents);
      }
    }

    if (onExit) {
      onExit(doc);
    }
  }

  traverseDocRec(doc);
}

function mapDoc(doc, func) {
  doc = func(doc);

  if (doc.type === "concat" || doc.type === "fill") {
    return Object.assign({}, doc, {
      parts: doc.parts.map(d => mapDoc(d, func))
    });
  } else if (doc.type === "if-break") {
    return Object.assign({}, doc, {
      breakContents: doc.breakContents && mapDoc(doc.breakContents, func),
      flatContents: doc.flatContents && mapDoc(doc.flatContents, func)
    });
  } else if (doc.contents) {
    return Object.assign({}, doc, { contents: mapDoc(doc.contents, func) });
  } else {
    return doc;
  }
}

function findInDoc(doc, fn, defaultValue) {
  let result = defaultValue;
  let hasStopped = false;
  traverseDoc(doc, doc => {
    const maybeResult = fn(doc);
    if (maybeResult !== undefined) {
      hasStopped = true;
      result = maybeResult;
    }
    if (hasStopped) {
      return false;
    }
  });
  return result;
}

function isEmpty$1(n) {
  return typeof n === "string" && n.length === 0;
}

function isLineNext$1(doc) {
  return findInDoc(
    doc,
    doc => {
      if (typeof doc === "string") {
        return false;
      }
      if (doc.type === "line") {
        return true;
      }
    },
    false
  );
}

function willBreak$1(doc) {
  return findInDoc(
    doc,
    doc => {
      if (doc.type === "group" && doc.break) {
        return true;
      }
      if (doc.type === "line" && doc.hard) {
        return true;
      }
      if (doc.type === "break-parent") {
        return true;
      }
    },
    false
  );
}

function breakParentGroup(groupStack) {
  if (groupStack.length > 0) {
    const parentGroup = groupStack[groupStack.length - 1];
    // Breaks are not propagated through conditional groups because
    // the user is expected to manually handle what breaks.
    if (!parentGroup.expandedStates) {
      parentGroup.break = true;
    }
  }
  return null;
}

function propagateBreaks(doc) {
  const alreadyVisited = new Map();
  const groupStack = [];
  traverseDoc(
    doc,
    doc => {
      if (doc.type === "break-parent") {
        breakParentGroup(groupStack);
      }
      if (doc.type === "group") {
        groupStack.push(doc);
        if (alreadyVisited.has(doc)) {
          return false;
        }
        alreadyVisited.set(doc, true);
      }
    },
    doc => {
      if (doc.type === "group") {
        const group = groupStack.pop();
        if (group.break) {
          breakParentGroup(groupStack);
        }
      }
    },
    /* shouldTraverseConditionalGroups */ true
  );
}

var docUtils$1 = {
  isEmpty: isEmpty$1,
  willBreak: willBreak$1,
  isLineNext: isLineNext$1,
  traverseDoc,
  mapDoc,
  propagateBreaks
};

const assert$1 = require$$0;
const comments$3 = comments$1;
const FastPath = fastPath;
const util$4 = util$2;
const isIdentifierName = utils.keyword.isIdentifierNameES6;

const docBuilders$3 = docBuilders$1;
const concat$2 = docBuilders$3.concat;
const join$2 = docBuilders$3.join;
const line$1 = docBuilders$3.line;
const hardline$2 = docBuilders$3.hardline;
const softline$1 = docBuilders$3.softline;
const literalline$1 = docBuilders$3.literalline;
const group$1 = docBuilders$3.group;
const indent$2 = docBuilders$3.indent;
const align$1 = docBuilders$3.align;
const conditionalGroup$1 = docBuilders$3.conditionalGroup;
const fill$1 = docBuilders$3.fill;
const ifBreak$1 = docBuilders$3.ifBreak;
const breakParent$2 = docBuilders$3.breakParent;
const lineSuffixBoundary$1 = docBuilders$3.lineSuffixBoundary;
const addAlignmentToDoc$1 = docBuilders$3.addAlignmentToDoc;

const docUtils = docUtils$1;
const willBreak = docUtils.willBreak;
const isLineNext = docUtils.isLineNext;
const isEmpty = docUtils.isEmpty;

function shouldPrintComma(options, level) {
  level = level || "es5";

  switch (options.trailingComma) {
    case "all":
      if (level === "all") {
        return true;
      }
    // fallthrough
    case "es5":
      if (level === "es5") {
        return true;
      }
    // fallthrough
    case "none":
    default:
      return false;
  }
}

function genericPrint(path, options, printPath, args) {
  assert$1.ok(path instanceof FastPath);

  const node = path.getValue();

  // Escape hatch
  if (
    node &&
    node.comments &&
    node.comments.length > 0 &&
    node.comments.some(comment => comment.value.trim() === "prettier-ignore")
  ) {
    return options.originalText.slice(util$4.locStart(node), util$4.locEnd(node));
  }

  const parts = [];
  let needsParens = false;
  const linesWithoutParens = genericPrintNoParens(
    path,
    options,
    printPath,
    args
  );

  if (!node || isEmpty(linesWithoutParens)) {
    return linesWithoutParens;
  }

  if (
    node.decorators &&
    node.decorators.length > 0 &&
    // If the parent node is an export declaration, it will be
    // responsible for printing node.decorators.
    !util$4.getParentExportDeclaration(path)
  ) {
    let separator = hardline$2;
    path.each(decoratorPath => {
      let prefix = "@";
      let decorator = decoratorPath.getValue();
      if (decorator.expression) {
        decorator = decorator.expression;
        prefix = "";
      }

      // #1817
      if (
        node.decorators.length === 1 &&
        node.type !== "ClassDeclaration" &&
        node.type !== "MethodDefinition" &&
        node.type !== "ClassMethod" &&
        (decorator.type === "Identifier" ||
          decorator.type === "MemberExpression" ||
          (decorator.type === "CallExpression" &&
            (decorator.arguments.length === 0 ||
              (decorator.arguments.length === 1 &&
                (isStringLiteral(decorator.arguments[0]) ||
                  decorator.arguments[0].type === "Identifier" ||
                  decorator.arguments[0].type === "MemberExpression")))))
      ) {
        separator = " ";
      }

      parts.push(prefix, printPath(decoratorPath), separator);
    }, "decorators");
  } else if (
    util$4.isExportDeclaration(node) &&
    node.declaration &&
    node.declaration.decorators
  ) {
    // Export declarations are responsible for printing any decorators
    // that logically apply to node.declaration.
    path.each(
      decoratorPath => {
        const decorator = decoratorPath.getValue();
        const prefix = decorator.type === "Decorator" ||
          decorator.type === "TSDecorator"
          ? ""
          : "@";
        parts.push(prefix, printPath(decoratorPath), line$1);
      },
      "declaration",
      "decorators"
    );
  } else {
    // Nodes with decorators can't have parentheses, so we can avoid
    // computing path.needsParens() except in this case.
    needsParens = path.needsParens();
  }

  if (node.type) {
    // HACK: ASI prevention in no-semi mode relies on knowledge of whether
    // or not a paren has been inserted (see `exprNeedsASIProtection()`).
    // For now, we're just passing that information by mutating the AST here,
    // but it would be nice to find a cleaner way to do this.
    node.needsParens = needsParens;
  }

  if (needsParens) {
    parts.unshift("(");
  }

  parts.push(linesWithoutParens);

  if (needsParens) {
    parts.push(")");
  }

  return concat$2(parts);
}

function genericPrintNoParens(path, options, print, args) {
  const n = path.getValue();
  const semi = options.semi ? ";" : "";

  if (!n) {
    return "";
  }

  if (typeof n === "string") {
    return n;
  }

  let parts = [];
  switch (n.type) {
    case "File":
      return path.call(print, "program");
    case "Program":
      // Babel 6
      if (n.directives) {
        path.each(childPath => {
          parts.push(print(childPath), semi, hardline$2);
          if (
            util$4.isNextLineEmpty(options.originalText, childPath.getValue())
          ) {
            parts.push(hardline$2);
          }
        }, "directives");
      }

      parts.push(
        path.call(bodyPath => {
          return printStatementSequence(bodyPath, options, print);
        }, "body")
      );

      parts.push(
        comments$3.printDanglingComments(path, options, /* sameIndent */ true)
      );

      // Only force a trailing newline if there were any contents.
      if (n.body.length || n.comments) {
        parts.push(hardline$2);
      }

      return concat$2(parts);
    // Babel extension.
    case "Noop":
    case "EmptyStatement":
      return "";
    case "ExpressionStatement":
      // Detect Flow-parsed directives
      if (n.directive) {
        return concat$2([nodeStr(n.expression, options, true), semi]);
      }
      return concat$2([path.call(print, "expression"), semi]); // Babel extension.
    case "ParenthesizedExpression":
      return concat$2(["(", path.call(print, "expression"), ")"]);
    case "AssignmentExpression":
      return printAssignment(
        n.left,
        path.call(print, "left"),
        concat$2([" ", n.operator]),
        n.right,
        path.call(print, "right"),
        options
      );
    case "BinaryExpression":
    case "LogicalExpression": {
      const parent = path.getParentNode();
      const parentParent = path.getParentNode(1);
      const isInsideParenthesis =
        n !== parent.body &&
        (parent.type === "IfStatement" ||
          parent.type === "WhileStatement" ||
          parent.type === "DoStatement");

      const parts = printBinaryishExpressions(
        path,
        print,
        options,
        /* isNested */ false,
        isInsideParenthesis
      );

      //   if (
      //     this.hasPlugin("dynamicImports") && this.lookahead().type === tt.parenLeft
      //   ) {
      //
      // looks super weird, we want to break the children if the parent breaks
      //
      //   if (
      //     this.hasPlugin("dynamicImports") &&
      //     this.lookahead().type === tt.parenLeft
      //   ) {
      if (isInsideParenthesis) {
        return concat$2(parts);
      }

      if (parent.type === "UnaryExpression") {
        return group$1(
          concat$2([indent$2(concat$2([softline$1, concat$2(parts)])), softline$1])
        );
      }

      // Avoid indenting sub-expressions in assignment/return/etc statements.
      if (
        parent.type === "AssignmentExpression" ||
        parent.type === "VariableDeclarator" ||
        shouldInlineLogicalExpression(n) ||
        parent.type === "ReturnStatement" ||
        (parent.type === "JSXExpressionContainer" &&
          parentParent.type === "JSXAttribute") ||
        (n === parent.body && parent.type === "ArrowFunctionExpression") ||
        (n !== parent.body && parent.type === "ForStatement")
      ) {
        return group$1(concat$2(parts));
      }

      const rest = concat$2(parts.slice(1));

      return group$1(
        concat$2([
          // Don't include the initial expression in the indentation
          // level. The first item is guaranteed to be the first
          // left-most expression.
          parts.length > 0 ? parts[0] : "",
          indent$2(rest)
        ])
      );
    }
    case "AssignmentPattern":
      return concat$2([
        path.call(print, "left"),
        " = ",
        path.call(print, "right")
      ]);
    case "TSTypeAssertionExpression":
      return concat$2([
        "<",
        path.call(print, "typeAnnotation"),
        ">",
        path.call(print, "expression")
      ]);
    case "MemberExpression": {
      const parent = path.getParentNode();
      let firstNonMemberParent;
      let i = 0;
      do {
        firstNonMemberParent = path.getParentNode(i);
        i++;
      } while (
        firstNonMemberParent && firstNonMemberParent.type === "MemberExpression"
      );

      const shouldInline =
        (firstNonMemberParent &&
          ((firstNonMemberParent.type === "VariableDeclarator" &&
            firstNonMemberParent.id.type !== "Identifier") ||
            (firstNonMemberParent.type === "AssignmentExpression" &&
              firstNonMemberParent.left.type !== "Identifier"))) ||
        n.computed ||
        (n.object.type === "Identifier" &&
          n.property.type === "Identifier" &&
          parent.type !== "MemberExpression");

      return concat$2([
        path.call(print, "object"),
        shouldInline
          ? printMemberLookup(path, options, print)
          : group$1(
              indent$2(
                concat$2([softline$1, printMemberLookup(path, options, print)])
              )
            )
      ]);
    }
    case "MetaProperty":
      return concat$2([
        path.call(print, "meta"),
        ".",
        path.call(print, "property")
      ]);
    case "BindExpression":
      if (n.object) {
        parts.push(path.call(print, "object"));
      }

      parts.push("::", path.call(print, "callee"));

      return concat$2(parts);
    case "Path":
      return join$2(".", n.body);
    case "Identifier": {
      const parentNode = path.getParentNode();
      const isFunctionDeclarationIdentifier =
        parentNode.type === "DeclareFunction" && parentNode.id === n;

      return concat$2([
        n.name,
        n.optional ? "?" : "",
        n.typeAnnotation && !isFunctionDeclarationIdentifier ? ": " : "",
        path.call(print, "typeAnnotation")
      ]);
    }
    case "SpreadElement":
    case "SpreadElementPattern":
    case "RestProperty":
    case "ExperimentalRestProperty":
    case "ExperimentalSpreadProperty":
    case "SpreadProperty":
    case "SpreadPropertyPattern":
    case "RestElement":
    case "ObjectTypeSpreadProperty":
      return concat$2([
        "...",
        path.call(print, "argument"),
        n.typeAnnotation ? ": " : "",
        path.call(print, "typeAnnotation")
      ]);
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "TSNamespaceFunctionDeclaration":
      if (isNodeStartingWithDeclare(n, options)) {
        parts.push("declare ");
      }
      parts.push(printFunctionDeclaration(path, print, options));
      if (n.type === "TSNamespaceFunctionDeclaration" && !n.body) {
        parts.push(semi);
      }
      return concat$2(parts);
    case "ArrowFunctionExpression": {
      if (n.async) {
        parts.push("async ");
      }

      parts.push(printFunctionTypeParameters(path, options, print));

      if (canPrintParamsWithoutParens(n)) {
        parts.push(path.call(print, "params", 0));
      } else {
        parts.push(
          group$1(
            concat$2([
              printFunctionParams(
                path,
                print,
                options,
                args && (args.expandLastArg || args.expandFirstArg)
              ),
              printReturnType(path, print)
            ])
          )
        );
      }

      parts.push(" =>");

      const body = path.call(bodyPath => print(bodyPath, args), "body");
      const collapsed = concat$2([concat$2(parts), " ", body]);

      // We want to always keep these types of nodes on the same line
      // as the arrow.
      if (
        !hasLeadingOwnLineComment(options.originalText, n.body) &&
        (n.body.type === "ArrayExpression" ||
          n.body.type === "ObjectExpression" ||
          n.body.type === "BlockStatement" ||
          n.body.type === "SequenceExpression" ||
          isTemplateOnItsOwnLine(n.body, options.originalText) ||
          n.body.type === "ArrowFunctionExpression")
      ) {
        return group$1(collapsed);
      }

      // if the arrow function is expanded as last argument, we are adding a
      // level of indentation and need to add a softline to align the closing )
      // with the opening (.
      const shouldAddSoftLine = args && args.expandLastArg;

      // In order to avoid confusion between
      // a => a ? a : a
      // a <= a ? a : a
      const shouldAddParens =
        n.body.type === "ConditionalExpression" &&
        !util$4.startsWithNoLookaheadToken(
          n.body,
          /* forbidFunctionAndClass */ false
        );

      return group$1(
        concat$2([
          concat$2(parts),
          group$1(
            concat$2([
              indent$2(
                concat$2([
                  line$1,
                  shouldAddParens ? ifBreak$1("", "(") : "",
                  body,
                  shouldAddParens ? ifBreak$1("", ")") : ""
                ])
              ),
              shouldAddSoftLine
                ? concat$2([
                    ifBreak$1(shouldPrintComma(options, "all") ? "," : ""),
                    softline$1
                  ])
                : ""
            ])
          )
        ])
      );
    }
    case "MethodDefinition":
    case "TSAbstractMethodDefinition":
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.type === "TSAbstractMethodDefinition") {
        parts.push("abstract ");
      }

      parts.push(printMethod(path, options, print));

      return concat$2(parts);
    case "YieldExpression":
      parts.push("yield");

      if (n.delegate) {
        parts.push("*");
      }
      if (n.argument) {
        parts.push(" ", path.call(print, "argument"));
      }

      return concat$2(parts);
    case "AwaitExpression":
      parts.push("await");

      if (n.all) {
        parts.push("*");
      }
      if (n.argument) {
        parts.push(" ", path.call(print, "argument"));
      }

      return concat$2(parts);
    case "ModuleDeclaration":
      parts.push("module", path.call(print, "id"));

      if (n.source) {
        assert$1.ok(!n.body);

        parts.push("from", path.call(print, "source"));
      } else {
        parts.push(path.call(print, "body"));
      }

      return join$2(" ", parts);
    case "ImportSpecifier":
      if (n.imported) {
        if (n.importKind) {
          parts.push(path.call(print, "importKind"), " ");
        }

        parts.push(path.call(print, "imported"));

        if (n.local && n.local.name !== n.imported.name) {
          parts.push(" as ", path.call(print, "local"));
        }
      } else if (n.id) {
        parts.push(path.call(print, "id"));

        if (n.name) {
          parts.push(" as ", path.call(print, "name"));
        }
      }

      return concat$2(parts);
    case "ExportSpecifier":
      if (n.local) {
        parts.push(path.call(print, "local"));

        if (n.exported && n.exported.name !== n.local.name) {
          parts.push(" as ", path.call(print, "exported"));
        }
      } else if (n.id) {
        parts.push(path.call(print, "id"));

        if (n.name) {
          parts.push(" as ", path.call(print, "name"));
        }
      }

      return concat$2(parts);
    case "ExportBatchSpecifier":
      return "*";
    case "ImportNamespaceSpecifier":
      parts.push("* as ");

      if (n.local) {
        parts.push(path.call(print, "local"));
      } else if (n.id) {
        parts.push(path.call(print, "id"));
      }

      return concat$2(parts);
    case "ImportDefaultSpecifier":
      if (n.local) {
        return path.call(print, "local");
      }

      return path.call(print, "id");
    case "ExportDeclaration":
    case "ExportDefaultDeclaration":
    case "ExportNamedDeclaration":
      return printExportDeclaration(path, options, print);
    case "ExportAllDeclaration":
      parts.push("export *");

      if (n.exported) {
        parts.push(" as ", path.call(print, "exported"));
      }

      parts.push(" from ", path.call(print, "source"), semi);

      return concat$2(parts);
    case "ExportNamespaceSpecifier":
    case "ExportDefaultSpecifier":
      return path.call(print, "exported");
    case "ImportDeclaration": {
      parts.push("import ");

      if (n.importKind && n.importKind !== "value") {
        parts.push(n.importKind + " ");
      }

      const standalones = [];
      const grouped = [];
      if (n.specifiers && n.specifiers.length > 0) {
        path.each(specifierPath => {
          const value = specifierPath.getValue();
          if (
            value.type === "ImportDefaultSpecifier" ||
            value.type === "ImportNamespaceSpecifier"
          ) {
            standalones.push(print(specifierPath));
          } else {
            grouped.push(print(specifierPath));
          }
        }, "specifiers");

        if (standalones.length > 0) {
          parts.push(join$2(", ", standalones));
        }

        if (standalones.length > 0 && grouped.length > 0) {
          parts.push(", ");
        }

        if (
          grouped.length === 1 &&
          n.specifiers &&
          !n.specifiers.some(node => node.comments)
        ) {
          parts.push(
            concat$2([
              "{",
              options.bracketSpacing ? " " : "",
              concat$2(grouped),
              options.bracketSpacing ? " " : "",
              "}"
            ])
          );
        } else if (grouped.length >= 1) {
          parts.push(
            group$1(
              concat$2([
                "{",
                indent$2(
                  concat$2([
                    options.bracketSpacing ? line$1 : softline$1,
                    join$2(concat$2([",", line$1]), grouped)
                  ])
                ),
                ifBreak$1(shouldPrintComma(options) ? "," : ""),
                options.bracketSpacing ? line$1 : softline$1,
                "}"
              ])
            )
          );
        }

        parts.push(" ", "from ");
      } else if (n.importKind && n.importKind === "type") {
        parts.push("{} from ");
      }

      parts.push(path.call(print, "source"), semi);

      return concat$2(parts);
    }

    case "Import":
      return "import";
    case "BlockStatement": {
      const naked = path.call(bodyPath => {
        return printStatementSequence(bodyPath, options, print);
      }, "body");

      const hasContent = n.body.find(node => node.type !== "EmptyStatement");
      const hasDirectives = n.directives && n.directives.length > 0;

      const parent = path.getParentNode();
      const parentParent = path.getParentNode(1);
      if (
        !hasContent &&
        !hasDirectives &&
        !n.comments &&
        (parent.type === "ArrowFunctionExpression" ||
          parent.type === "FunctionExpression" ||
          parent.type === "FunctionDeclaration" ||
          parent.type === "ObjectMethod" ||
          parent.type === "ClassMethod" ||
          parent.type === "ForStatement" ||
          parent.type === "WhileStatement" ||
          parent.type === "DoWhileStatement" ||
          (parent.type === "CatchClause" && !parentParent.finalizer))
      ) {
        return "{}";
      }

      parts.push("{");

      // Babel 6
      if (hasDirectives) {
        path.each(childPath => {
          parts.push(indent$2(concat$2([hardline$2, print(childPath), semi])));
        }, "directives");
      }

      if (hasContent) {
        parts.push(indent$2(concat$2([hardline$2, naked])));
      }

      parts.push(comments$3.printDanglingComments(path, options));
      parts.push(hardline$2, "}");

      return concat$2(parts);
    }
    case "ReturnStatement":
      parts.push("return");

      if (n.argument) {
        if (returnArgumentHasLeadingComment(options, n.argument)) {
          parts.push(
            concat$2([
              " (",
              indent$2(concat$2([softline$1, path.call(print, "argument")])),
              line$1,
              ")"
            ])
          );
        } else if (
          n.argument.type === "LogicalExpression" ||
          n.argument.type === "BinaryExpression"
        ) {
          parts.push(
            group$1(
              concat$2([
                ifBreak$1(" (", " "),
                indent$2(concat$2([softline$1, path.call(print, "argument")])),
                softline$1,
                ifBreak$1(")")
              ])
            )
          );
        } else {
          parts.push(" ", path.call(print, "argument"));
        }
      }

      if (hasDanglingComments(n)) {
        parts.push(
          " ",
          comments$3.printDanglingComments(path, options, /* sameIndent */ true)
        );
      }

      parts.push(semi);

      return concat$2(parts);
    case "CallExpression": {
      if (
        // We want to keep require calls as a unit
        (n.callee.type === "Identifier" && n.callee.name === "require") ||
        // Template literals as single arguments
        (n.arguments.length === 1 &&
          isTemplateOnItsOwnLine(n.arguments[0], options.originalText)) ||
        // Keep test declarations on a single line
        // e.g. `it('long name', () => {`
        (n.callee.type === "Identifier" &&
          (n.callee.name === "it" ||
            n.callee.name === "test" ||
            n.callee.name === "describe") &&
          n.arguments.length === 2 &&
          (n.arguments[0].type === "StringLiteral" ||
            n.arguments[0].type === "TemplateLiteral" ||
            (n.arguments[0].type === "Literal" &&
              typeof n.arguments[0].value === "string")) &&
          (n.arguments[1].type === "FunctionExpression" ||
            n.arguments[1].type === "ArrowFunctionExpression") &&
          n.arguments[1].params.length <= 1)
      ) {
        return concat$2([
          path.call(print, "callee"),
          path.call(print, "typeParameters"),
          concat$2(["(", join$2(", ", path.map(print, "arguments")), ")"])
        ]);
      }

      // We detect calls on member lookups and possibly print them in a
      // special chain format. See `printMemberChain` for more info.
      if (n.callee.type === "MemberExpression") {
        return printMemberChain(path, options, print);
      }

      return concat$2([
        path.call(print, "callee"),
        printFunctionTypeParameters(path, options, print),
        printArgumentsList(path, options, print)
      ]);
    }
    case "TSInterfaceDeclaration":
      parts.push(
        n.abstract ? "abstract " : "",
        printTypeScriptModifiers(path, options, print),
        "interface ",
        path.call(print, "id"),
        n.typeParameters ? path.call(print, "typeParameters") : "",
        " "
      );

      if (n.heritage.length) {
        parts.push("extends ", join$2(", ", path.map(print, "heritage")), " ");
      }

      parts.push(path.call(print, "body"));

      return concat$2(parts);
    case "ObjectExpression":
    case "ObjectPattern":
    case "ObjectTypeAnnotation":
    case "TSInterfaceBody":
    case "TSTypeLiteral": {
      const isTypeAnnotation = n.type === "ObjectTypeAnnotation";
      const shouldBreak =
        n.type !== "ObjectPattern" &&
        util$4.hasNewlineInRange(
          options.originalText,
          util$4.locStart(n),
          util$4.locEnd(n)
        );
      const separator = n.type === "TSInterfaceBody" ||
        n.type === "TSTypeLiteral"
        ? shouldBreak ? semi : ";"
        : ",";
      const fields = [];
      const leftBrace = n.exact ? "{|" : "{";
      const rightBrace = n.exact ? "|}" : "}";
      const parent = path.getParentNode(0);

      let propertiesField;

      if (n.type === "TSTypeLiteral") {
        propertiesField = "members";
      } else if (n.type === "TSInterfaceBody") {
        propertiesField = "body";
      } else {
        propertiesField = "properties";
      }

      if (isTypeAnnotation) {
        fields.push("indexers", "callProperties");
      }
      fields.push(propertiesField);

      // Unfortunately, things are grouped together in the ast can be
      // interleaved in the source code. So we need to reorder them before
      // printing them.
      const propsAndLoc = [];
      fields.forEach(field => {
        path.each(childPath => {
          const node = childPath.getValue();
          propsAndLoc.push({
            node: node,
            printed: print(childPath),
            loc: util$4.locStart(node)
          });
        }, field);
      });

      let separatorParts = [];
      const props = propsAndLoc.sort((a, b) => a.loc - b.loc).map(prop => {
        const result = concat$2(separatorParts.concat(group$1(prop.printed)));
        separatorParts = [separator, line$1];
        if (util$4.isNextLineEmpty(options.originalText, prop.node)) {
          separatorParts.push(hardline$2);
        }
        return result;
      });

      const lastElem = util$4.getLast(n[propertiesField]);

      const canHaveTrailingSeparator = !(
        lastElem &&
        (lastElem.type === "RestProperty" || lastElem.type === "RestElement")
      );

      let content;
      if (props.length === 0 && !n.typeAnnotation) {
        if (!hasDanglingComments(n)) {
          return concat$2([leftBrace, rightBrace]);
        }

        content = group$1(
          concat$2([
            leftBrace,
            comments$3.printDanglingComments(path, options),
            softline$1,
            rightBrace
          ])
        );
      } else {
        content = concat$2([
          leftBrace,
          indent$2(
            concat$2([options.bracketSpacing ? line$1 : softline$1, concat$2(props)])
          ),
          ifBreak$1(
            canHaveTrailingSeparator &&
              (separator !== "," || shouldPrintComma(options))
              ? separator
              : ""
          ),
          concat$2([options.bracketSpacing ? line$1 : softline$1, rightBrace]),
          n.typeAnnotation ? ": " : "",
          path.call(print, "typeAnnotation")
        ]);
      }

      // If we inline the object as first argument of the parent, we don't want
      // to create another group so that the object breaks before the return
      // type
      const parentParentParent = path.getParentNode(2);
      if (
        (n.type === "ObjectPattern" &&
          parent &&
          shouldHugArguments(parent) &&
          parent.params[0] === n) ||
        (shouldHugType(n) &&
          parentParentParent &&
          shouldHugArguments(parentParentParent) &&
          parentParentParent.params[0].typeAnnotation.typeAnnotation === n)
      ) {
        return content;
      }

      return group$1(content, { shouldBreak });
    }
    case "PropertyPattern":
      return concat$2([
        path.call(print, "key"),
        ": ",
        path.call(print, "pattern")
      ]);
    // Babel 6
    case "ObjectProperty": // Non-standard AST node type.
    case "Property":
      if (n.method || n.kind === "get" || n.kind === "set") {
        return printMethod(path, options, print);
      }

      if (n.shorthand) {
        parts.push(path.call(print, "value"));
      } else {
        let printedLeft;
        if (n.computed) {
          printedLeft = concat$2(["[", path.call(print, "key"), "]"]);
        } else {
          printedLeft = printPropertyKey(path, options, print);
        }
        parts.push(
          printAssignment(
            n.key,
            printedLeft,
            ":",
            n.value,
            path.call(print, "value"),
            options
          )
        );
      }

      return concat$2(parts); // Babel 6
    case "ClassMethod":
      if (n.static) {
        parts.push("static ");
      }

      parts = parts.concat(printObjectMethod(path, options, print));

      return concat$2(parts); // Babel 6
    case "ObjectMethod":
      return printObjectMethod(path, options, print);
    case "TSDecorator":
    case "Decorator":
      return concat$2(["@", path.call(print, "expression")]);
    case "ArrayExpression":
    case "ArrayPattern":
      if (n.elements.length === 0) {
        if (!hasDanglingComments(n)) {
          parts.push("[]");
        } else {
          parts.push(
            group$1(
              concat$2([
                "[",
                comments$3.printDanglingComments(path, options),
                softline$1,
                "]"
              ])
            )
          );
        }
      } else {
        const lastElem = util$4.getLast(n.elements);
        const canHaveTrailingComma = !(
          lastElem && lastElem.type === "RestElement"
        );

        // JavaScript allows you to have empty elements in an array which
        // changes its length based on the number of commas. The algorithm
        // is that if the last argument is null, we need to force insert
        // a comma to ensure JavaScript recognizes it.
        //   [,].length === 1
        //   [1,].length === 1
        //   [1,,].length === 2
        //
        // Note that util.getLast returns null if the array is empty, but
        // we already check for an empty array just above so we are safe
        const needsForcedTrailingComma =
          canHaveTrailingComma && lastElem === null;

        parts.push(
          group$1(
            concat$2([
              "[",
              indent$2(
                concat$2([
                  softline$1,
                  printArrayItems(path, options, "elements", print)
                ])
              ),
              needsForcedTrailingComma ? "," : "",
              ifBreak$1(
                canHaveTrailingComma &&
                  !needsForcedTrailingComma &&
                  shouldPrintComma(options)
                  ? ","
                  : ""
              ),
              comments$3.printDanglingComments(
                path,
                options,
                /* sameIndent */ true
              ),
              softline$1,
              "]"
            ])
          )
        );
      }

      if (n.typeAnnotation) {
        parts.push(": ", path.call(print, "typeAnnotation"));
      }

      return concat$2(parts);
    case "SequenceExpression": {
      const parent = path.getParentNode();
      const shouldInline =
        parent.type === "ReturnStatement" ||
        parent.type === "ForStatement" ||
        parent.type === "ExpressionStatement";

      if (shouldInline) {
        return join$2(", ", path.map(print, "expressions"));
      }
      return group$1(
        concat$2([
          indent$2(
            concat$2([
              softline$1,
              join$2(concat$2([",", line$1]), path.map(print, "expressions"))
            ])
          ),
          softline$1
        ])
      );
    }
    case "ThisExpression":
      return "this";
    case "Super":
      return "super";
    case "NullLiteral": // Babel 6 Literal split
      return "null";
    case "RegExpLiteral": // Babel 6 Literal split
      return printRegex(n);
    case "NumericLiteral": // Babel 6 Literal split
      return printNumber(n.extra.raw);
    case "BooleanLiteral": // Babel 6 Literal split
    case "StringLiteral": // Babel 6 Literal split
    case "Literal":
      if (n.regex) {
        return printRegex(n.regex);
      }
      if (typeof n.value === "number") {
        return printNumber(n.raw);
      }
      if (typeof n.value !== "string") {
        return "" + n.value;
      }
      return nodeStr(n, options); // Babel 6
    case "Directive":
      return path.call(print, "value"); // Babel 6
    case "DirectiveLiteral":
      return nodeStr(n, options);
    case "ModuleSpecifier":
      if (n.local) {
        throw new Error("The ESTree ModuleSpecifier type should be abstract");
      }

      // The Esprima ModuleSpecifier type is just a string-valued
      // Literal identifying the imported-from module.
      return nodeStr(n, options);
    case "UnaryExpression":
      parts.push(n.operator);

      if (/[a-z]$/.test(n.operator)) {
        parts.push(" ");
      }

      parts.push(path.call(print, "argument"));

      return concat$2(parts);
    case "UpdateExpression":
      parts.push(path.call(print, "argument"), n.operator);

      if (n.prefix) {
        parts.reverse();
      }

      return concat$2(parts);
    case "ConditionalExpression": {
      const parent = path.getParentNode();
      const printed = concat$2([
        line$1,
        "? ",
        n.consequent.type === "ConditionalExpression" ? ifBreak$1("", "(") : "",
        align$1(2, path.call(print, "consequent")),
        n.consequent.type === "ConditionalExpression" ? ifBreak$1("", ")") : "",
        line$1,
        ": ",
        align$1(2, path.call(print, "alternate"))
      ]);

      return group$1(
        concat$2([
          path.call(print, "test"),
          parent.type === "ConditionalExpression" ? printed : indent$2(printed)
        ])
      );
    }
    case "NewExpression":
      parts.push(
        "new ",
        path.call(print, "callee"),
        printFunctionTypeParameters(path, options, print)
      );

      if (n.arguments) {
        parts.push(printArgumentsList(path, options, print));
      }

      return concat$2(parts);
    case "VariableDeclaration": {
      const printed = path.map(childPath => {
        return print(childPath);
      }, "declarations");

      // We generally want to terminate all variable declarations with a
      // semicolon, except when they in the () part of for loops.
      const parentNode = path.getParentNode();

      const isParentForLoop =
        parentNode.type === "ForStatement" ||
        parentNode.type === "ForInStatement" ||
        parentNode.type === "ForOfStatement" ||
        parentNode.type === "ForAwaitStatement";

      const hasValue = n.declarations.some(decl => decl.init);

      parts = [
        isNodeStartingWithDeclare(n, options) ? "declare " : "",
        n.kind,
        printed.length ? concat$2([" ", printed[0]]) : "",
        indent$2(
          concat$2(
            printed
              .slice(1)
              .map(p =>
                concat$2([",", hasValue && !isParentForLoop ? hardline$2 : line$1, p])
              )
          )
        )
      ];

      if (!(isParentForLoop && parentNode.body !== n)) {
        parts.push(semi);
      }

      return group$1(concat$2(parts));
    }
    case "VariableDeclarator":
      return printAssignment(
        n.id,
        concat$2([path.call(print, "id"), path.call(print, "typeParameters")]),
        " =",
        n.init,
        n.init && path.call(print, "init"),
        options
      );
    case "WithStatement":
      return group$1(
        concat$2([
          "with (",
          path.call(print, "object"),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );
    case "IfStatement": {
      const con = adjustClause(n.consequent, path.call(print, "consequent"));
      const opening = group$1(
        concat$2([
          "if (",
          group$1(
            concat$2([
              indent$2(concat$2([softline$1, path.call(print, "test")])),
              softline$1
            ])
          ),
          ")",
          con
        ])
      );

      parts.push(opening);

      if (n.alternate) {
        if (n.consequent.type === "BlockStatement") {
          parts.push(" else");
        } else {
          parts.push(hardline$2, "else");
        }

        parts.push(
          group$1(
            adjustClause(
              n.alternate,
              path.call(print, "alternate"),
              n.alternate.type === "IfStatement"
            )
          )
        );
      }

      return concat$2(parts);
    }
    case "ForStatement": {
      const body = adjustClause(n.body, path.call(print, "body"));

      // We want to keep dangling comments above the loop to stay consistent.
      // Any comment positioned between the for statement and the parentheses
      // is going to be printed before the statement.
      const dangling = comments$3.printDanglingComments(
        path,
        options,
        /* sameLine */ true
      );
      const printedComments = dangling ? concat$2([dangling, softline$1]) : "";

      if (!n.init && !n.test && !n.update) {
        return concat$2([printedComments, group$1(concat$2(["for (;;)", body]))]);
      }

      return concat$2([
        printedComments,
        group$1(
          concat$2([
            "for (",
            group$1(
              concat$2([
                indent$2(
                  concat$2([
                    softline$1,
                    path.call(print, "init"),
                    ";",
                    line$1,
                    path.call(print, "test"),
                    ";",
                    line$1,
                    path.call(print, "update")
                  ])
                ),
                softline$1
              ])
            ),
            ")",
            body
          ])
        )
      ]);
    }
    case "WhileStatement":
      return group$1(
        concat$2([
          "while (",
          group$1(
            concat$2([
              indent$2(concat$2([softline$1, path.call(print, "test")])),
              softline$1
            ])
          ),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );
    case "ForInStatement":
      // Note: esprima can't actually parse "for each (".
      return group$1(
        concat$2([
          n.each ? "for each (" : "for (",
          path.call(print, "left"),
          " in ",
          path.call(print, "right"),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );

    case "ForOfStatement":
    case "ForAwaitStatement": {
      // Babylon 7 removed ForAwaitStatement in favor of ForOfStatement
      // with `"await": true`:
      // https://github.com/estree/estree/pull/138
      const isAwait = n.type === "ForAwaitStatement" || n.await;

      return group$1(
        concat$2([
          "for",
          isAwait ? " await" : "",
          " (",
          path.call(print, "left"),
          " of ",
          path.call(print, "right"),
          ")",
          adjustClause(n.body, path.call(print, "body"))
        ])
      );
    }

    case "DoWhileStatement": {
      const clause = adjustClause(n.body, path.call(print, "body"));
      const doBody = group$1(concat$2(["do", clause]));
      parts = [doBody];

      if (n.body.type === "BlockStatement") {
        parts.push(" ");
      } else {
        parts.push(hardline$2);
      }
      parts.push("while (");

      parts.push(
        group$1(concat$2([indent$2(softline$1), path.call(print, "test"), softline$1])),
        ")",
        semi
      );

      return concat$2(parts);
    }
    case "DoExpression":
      return concat$2(["do ", path.call(print, "body")]);
    case "BreakStatement":
      parts.push("break");

      if (n.label) {
        parts.push(" ", path.call(print, "label"));
      }

      parts.push(semi);

      return concat$2(parts);
    case "ContinueStatement":
      parts.push("continue");

      if (n.label) {
        parts.push(" ", path.call(print, "label"));
      }

      parts.push(semi);

      return concat$2(parts);
    case "LabeledStatement":
      if (n.body.type === "EmptyStatement") {
        return concat$2([path.call(print, "label"), ":;"]);
      }

      return concat$2([
        path.call(print, "label"),
        ": ",
        path.call(print, "body")
      ]);
    case "TryStatement":
      parts.push("try ", path.call(print, "block"));

      if (n.handler) {
        parts.push(" ", path.call(print, "handler"));
      } else if (n.handlers) {
        path.each(handlerPath => {
          parts.push(" ", print(handlerPath));
        }, "handlers");
      }

      if (n.finalizer) {
        parts.push(" finally ", path.call(print, "finalizer"));
      }

      return concat$2(parts);
    case "CatchClause":
      parts.push("catch (", path.call(print, "param"));

      if (n.guard) {
        // Note: esprima does not recognize conditional catch clauses.
        parts.push(" if ", path.call(print, "guard"));
      }

      parts.push(") ", path.call(print, "body"));

      return concat$2(parts);
    case "ThrowStatement":
      return concat$2(["throw ", path.call(print, "argument"), semi]);
    // Note: ignoring n.lexical because it has no printing consequences.
    case "SwitchStatement":
      return concat$2([
        "switch (",
        path.call(print, "discriminant"),
        ") {",
        n.cases.length > 0
          ? indent$2(
              concat$2([
                hardline$2,
                join$2(
                  hardline$2,
                  path.map(casePath => {
                    const caseNode = casePath.getValue();
                    return concat$2([
                      casePath.call(print),
                      n.cases.indexOf(caseNode) !== n.cases.length - 1 &&
                        util$4.isNextLineEmpty(options.originalText, caseNode)
                        ? hardline$2
                        : ""
                    ]);
                  }, "cases")
                )
              ])
            )
          : "",
        hardline$2,
        "}"
      ]);
    case "SwitchCase": {
      if (n.test) {
        parts.push("case ", path.call(print, "test"), ":");
      } else {
        parts.push("default:");
      }

      const consequent = n.consequent.filter(
        node => node.type !== "EmptyStatement"
      );

      if (consequent.length > 0) {
        const cons = path.call(consequentPath => {
          return join$2(
            hardline$2,
            consequentPath
              .map((p, i) => {
                if (n.consequent[i].type === "EmptyStatement") {
                  return null;
                }
                const shouldAddLine =
                  i !== n.consequent.length - 1 &&
                  util$4.isNextLineEmpty(options.originalText, p.getValue());
                return concat$2([print(p), shouldAddLine ? hardline$2 : ""]);
              })
              .filter(e => e !== null)
          );
        }, "consequent");

        parts.push(
          consequent.length === 1 && consequent[0].type === "BlockStatement"
            ? concat$2([" ", cons])
            : indent$2(concat$2([hardline$2, cons]))
        );
      }

      return concat$2(parts);
    }
    // JSX extensions below.
    case "DebuggerStatement":
      return concat$2(["debugger", semi]);
    case "JSXAttribute":
      parts.push(path.call(print, "name"));

      if (n.value) {
        let res;
        if (isStringLiteral(n.value)) {
          const value = n.value.extra ? n.value.extra.raw : n.value.raw;
          res = '"' + value.slice(1, -1).replace(/"/g, "&quot;") + '"';
        } else {
          res = path.call(print, "value");
        }
        parts.push("=", res);
      }

      return concat$2(parts);
    case "JSXIdentifier":
      // Can be removed when this is fixed:
      // https://github.com/eslint/typescript-eslint-parser/issues/307
      if (!n.name) {
        return "this";
      }
      return "" + n.name;
    case "JSXNamespacedName":
      return join$2(":", [
        path.call(print, "namespace"),
        path.call(print, "name")
      ]);
    case "JSXMemberExpression":
      return join$2(".", [
        path.call(print, "object"),
        path.call(print, "property")
      ]);
    case "TSQualifiedName":
      return join$2(".", [path.call(print, "left"), path.call(print, "right")]);
    case "JSXSpreadAttribute":
      return concat$2(["{...", path.call(print, "argument"), "}"]);
    case "JSXExpressionContainer": {
      const parent = path.getParentNode(0);

      const shouldInline =
        n.expression.type === "ArrayExpression" ||
        n.expression.type === "ObjectExpression" ||
        n.expression.type === "ArrowFunctionExpression" ||
        n.expression.type === "CallExpression" ||
        n.expression.type === "FunctionExpression" ||
        n.expression.type === "JSXEmptyExpression" ||
        n.expression.type === "TemplateLiteral" ||
        n.expression.type === "TaggedTemplateExpression" ||
        (parent.type === "JSXElement" &&
          (n.expression.type === "ConditionalExpression" ||
            isBinaryish(n.expression)));

      if (shouldInline) {
        return group$1(
          concat$2(["{", path.call(print, "expression"), lineSuffixBoundary$1, "}"])
        );
      }

      return group$1(
        concat$2([
          "{",
          indent$2(concat$2([softline$1, path.call(print, "expression")])),
          softline$1,
          lineSuffixBoundary$1,
          "}"
        ])
      );
    }
    case "JSXElement": {
      const elem = comments$3.printComments(
        path,
        () => printJSXElement(path, options, print),
        options
      );
      return maybeWrapJSXElementInParens(path, elem);
    }
    case "JSXOpeningElement": {
      const n = path.getValue();

      // don't break up opening elements with a single long text attribute
      if (
        n.attributes.length === 1 &&
        n.attributes[0].value &&
        isStringLiteral(n.attributes[0].value)
      ) {
        return group$1(
          concat$2([
            "<",
            path.call(print, "name"),
            " ",
            concat$2(path.map(print, "attributes")),
            n.selfClosing ? " />" : ">"
          ])
        );
      }

      const attributes = concat$2(
        path.map(attr => concat$2([line$1, print(attr)]), "attributes")
      );

      return group$1(
        concat$2([
          "<",
          path.call(print, "name"),
          concat$2([
            options.jsxAttributesIndent
              ? align$1({ forceSpace: true }, attributes)
              : indent$2(attributes),
            n.selfClosing ? line$1 : options.jsxBracketSameLine ? ">" : softline$1
          ]),
          n.selfClosing ? "/>" : options.jsxBracketSameLine ? "" : ">"
        ])
      );
    }
    case "JSXClosingElement":
      return concat$2(["</", path.call(print, "name"), ">"]);
    case "JSXText":
      throw new Error("JSXTest should be handled by JSXElement");
    case "JSXEmptyExpression": {
      const requiresHardline =
        n.comments && !n.comments.every(util$4.isBlockComment);

      return concat$2([
        comments$3.printDanglingComments(
          path,
          options,
          /* sameIndent */ !requiresHardline
        ),
        requiresHardline ? hardline$2 : ""
      ]);
    }
    case "TypeAnnotatedIdentifier":
      return concat$2([
        path.call(print, "annotation"),
        " ",
        path.call(print, "identifier")
      ]);
    case "ClassBody":
      if (!n.comments && n.body.length === 0) {
        return "{}";
      }

      return concat$2([
        "{",
        n.body.length > 0
          ? indent$2(
              concat$2([
                hardline$2,
                path.call(bodyPath => {
                  return printStatementSequence(bodyPath, options, print);
                }, "body")
              ])
            )
          : comments$3.printDanglingComments(path, options),
        hardline$2,
        "}"
      ]);
    case "ClassPropertyDefinition":
      parts.push("static ", path.call(print, "definition"));

      if (
        n.definition.type !== "MethodDefinition" &&
        n.definition.type !== "TSAbstractMethodDefinition"
      ) {
        parts.push(semi);
      }

      return concat$2(parts);
    case "ClassProperty":
    case "TSAbstractClassProperty": {
      const variance = getFlowVariance(n);
      if (variance) {
        parts.push(variance);
      }
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.type === "TSAbstractClassProperty") {
        parts.push("abstract ");
      }
      if (n.readonly) {
        parts.push("readonly ");
      }
      if (n.computed) {
        parts.push("[", path.call(print, "key"), "]");
      } else {
        parts.push(printPropertyKey(path, options, print));
      }
      if (n.typeAnnotation) {
        parts.push(": ", path.call(print, "typeAnnotation"));
      }
      if (n.value) {
        parts.push(
          " =",
          printAssignmentRight(
            n.value,
            path.call(print, "value"),
            false, // canBreak
            options
          )
        );
      }

      parts.push(semi);

      return concat$2(parts);
    }
    case "ClassDeclaration":
    case "ClassExpression":
    case "TSAbstractClassDeclaration":
      if (isNodeStartingWithDeclare(n, options)) {
        parts.push("declare ");
      }
      parts.push(concat$2(printClass(path, options, print)));
      return concat$2(parts);
    case "TSInterfaceHeritage":
      parts.push(path.call(print, "id"));

      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }

      return concat$2(parts);
    case "TSHeritageClause":
      return join$2(", ", path.map(print, "types"));
    case "TSExpressionWithTypeArguments":
      return concat$2([
        path.call(print, "expression"),
        printTypeParameters(path, options, print, "typeArguments")
      ]);
    case "TemplateElement":
      return join$2(literalline$1, n.value.raw.split(/\r?\n/g));
    case "TemplateLiteral": {
      const expressions = path.map(print, "expressions");

      parts.push("`");

      path.each(childPath => {
        const i = childPath.getName();

        parts.push(print(childPath));

        if (i < expressions.length) {
          // For a template literal of the following form:
          //   `someQuery {
          //     ${call({
          //       a,
          //       b,
          //     })}
          //   }`
          // the expression is on its own line (there is a \n in the previous
          // quasi literal), therefore we want to indent the JavaScript
          // expression inside at the beginning of ${ instead of the beginning
          // of the `.
          let size = 0;
          const value = childPath.getValue().value.raw;
          const index = value.lastIndexOf("\n");
          const tabWidth = options.tabWidth;
          if (index !== -1) {
            size = util$4.getAlignmentSize(
              // All the leading whitespaces
              value.slice(index + 1).match(/^[ \t]*/)[0],
              tabWidth
            );
          }

          const aligned = addAlignmentToDoc$1(expressions[i], size, tabWidth);

          parts.push("${", aligned, lineSuffixBoundary$1, "}");
        }
      }, "quasis");

      parts.push("`");

      return concat$2(parts);
    }
    // These types are unprintable because they serve as abstract
    // supertypes for other (printable) types.
    case "TaggedTemplateExpression":
      return concat$2([path.call(print, "tag"), path.call(print, "quasi")]);
    case "Node":
    case "Printable":
    case "SourceLocation":
    case "Position":
    case "Statement":
    case "Function":
    case "Pattern":
    case "Expression":
    case "Declaration":
    case "Specifier":
    case "NamedSpecifier":
    case "Comment":
    case "MemberTypeAnnotation": // Flow
    case "Type":
      throw new Error("unprintable type: " + JSON.stringify(n.type));
    // Type Annotations for Facebook Flow, typically stripped out or
    // transformed away before printing.
    case "TypeAnnotation":
      if (n.typeAnnotation) {
        return path.call(print, "typeAnnotation");
      }

      return "";
    case "TSTupleType":
    case "TupleTypeAnnotation": {
      const typesField = n.type === "TSTupleType" ? "elementTypes" : "types";
      return group$1(
        concat$2([
          "[",
          indent$2(
            concat$2([
              softline$1,
              printArrayItems(path, options, typesField, print)
            ])
          ),
          // TypeScript doesn't support trailing commas in tuple types
          n.type === "TSTupleType"
            ? ""
            : ifBreak$1(shouldPrintComma(options) ? "," : ""),
          comments$3.printDanglingComments(path, options, /* sameIndent */ true),
          softline$1,
          "]"
        ])
      );
    }

    case "ExistsTypeAnnotation":
      return "*";
    case "EmptyTypeAnnotation":
      return "empty";
    case "AnyTypeAnnotation":
      return "any";
    case "MixedTypeAnnotation":
      return "mixed";
    case "ArrayTypeAnnotation":
      return concat$2([path.call(print, "elementType"), "[]"]);
    case "BooleanTypeAnnotation":
      return "boolean";
    case "BooleanLiteralTypeAnnotation":
      return "" + n.value;
    case "DeclareClass":
      return printFlowDeclaration(path, printClass(path, options, print));
    case "DeclareFunction":
      // For TypeScript the DeclareFunction node shares the AST
      // structure with FunctionDeclaration
      if (n.params) {
        return concat$2([
          "declare ",
          printFunctionDeclaration(path, print, options)
        ]);
      }
      return printFlowDeclaration(path, [
        "function ",
        path.call(print, "id"),
        n.predicate ? " " : "",
        path.call(print, "predicate"),
        semi
      ]);
    case "DeclareModule":
      return printFlowDeclaration(path, [
        "module ",
        path.call(print, "id"),
        " ",
        path.call(print, "body")
      ]);
    case "DeclareModuleExports":
      return printFlowDeclaration(path, [
        "module.exports",
        ": ",
        path.call(print, "typeAnnotation"),
        semi
      ]);
    case "DeclareVariable":
      return printFlowDeclaration(path, ["var ", path.call(print, "id"), semi]);
    case "DeclareExportAllDeclaration":
      return concat$2(["declare export * from ", path.call(print, "source")]);
    case "DeclareExportDeclaration":
      return concat$2(["declare ", printExportDeclaration(path, options, print)]);
    case "FunctionTypeAnnotation":
    case "TSFunctionType": {
      // FunctionTypeAnnotation is ambiguous:
      // declare function foo(a: B): void; OR
      // var A: (a: B) => void;
      const parent = path.getParentNode(0);
      const parentParent = path.getParentNode(1);
      const parentParentParent = path.getParentNode(2);
      let isArrowFunctionTypeAnnotation =
        n.type === "TSFunctionType" ||
        !(
          (parent.type === "ObjectTypeProperty" &&
            !getFlowVariance(parent) &&
            !parent.optional &&
            util$4.locStart(parent) === util$4.locStart(n)) ||
          parent.type === "ObjectTypeCallProperty" ||
          (parentParentParent && parentParentParent.type === "DeclareFunction")
        );

      let needsColon =
        isArrowFunctionTypeAnnotation && parent.type === "TypeAnnotation";

      // Sadly we can't put it inside of FastPath::needsColon because we are
      // printing ":" as part of the expression and it would put parenthesis
      // around :(
      const needsParens =
        needsColon &&
        isArrowFunctionTypeAnnotation &&
        parent.type === "TypeAnnotation" &&
        parentParent.type === "ArrowFunctionExpression";

      if (isObjectTypePropertyAFunction(parent)) {
        isArrowFunctionTypeAnnotation = true;
        needsColon = true;
      }

      if (needsParens) {
        parts.push("(");
      }

      parts.push(
        printFunctionTypeParameters(path, options, print),
        printFunctionParams(path, print, options)
      );

      // The returnType is not wrapped in a TypeAnnotation, so the colon
      // needs to be added separately.
      if (n.returnType || n.predicate || n.typeAnnotation) {
        parts.push(
          isArrowFunctionTypeAnnotation ? " => " : ": ",
          path.call(print, "returnType"),
          path.call(print, "predicate"),
          path.call(print, "typeAnnotation")
        );
      }
      if (needsParens) {
        parts.push(")");
      }

      return group$1(concat$2(parts));
    }
    case "FunctionTypeParam":
      return concat$2([
        path.call(print, "name"),
        n.optional ? "?" : "",
        n.name ? ": " : "",
        path.call(print, "typeAnnotation")
      ]);
    case "GenericTypeAnnotation":
      return concat$2([
        path.call(print, "id"),
        path.call(print, "typeParameters")
      ]);
    case "DeclareInterface":
    case "InterfaceDeclaration": {
      if (
        n.type === "DeclareInterface" ||
        isNodeStartingWithDeclare(n, options)
      ) {
        parts.push("declare ");
      }

      parts.push(
        "interface ",
        path.call(print, "id"),
        path.call(print, "typeParameters")
      );

      if (n["extends"].length > 0) {
        parts.push(
          group$1(
            indent$2(
              concat$2([line$1, "extends ", join$2(", ", path.map(print, "extends"))])
            )
          )
        );
      }

      parts.push(" ");
      parts.push(path.call(print, "body"));

      return group$1(concat$2(parts));
    }
    case "ClassImplements":
    case "InterfaceExtends":
      return concat$2([
        path.call(print, "id"),
        path.call(print, "typeParameters")
      ]);
    case "TSIntersectionType":
    case "IntersectionTypeAnnotation": {
      const types = path.map(print, "types");
      const result = [];
      for (let i = 0; i < types.length; ++i) {
        if (i === 0) {
          result.push(types[i]);
        } else if (!isObjectType(n.types[i - 1]) && !isObjectType(n.types[i])) {
          // If no object is involved, go to the next line if it breaks
          result.push(indent$2(concat$2([" &", line$1, types[i]])));
        } else {
          // If you go from object to non-object or vis-versa, then inline it
          result.push(" & ", i > 1 ? indent$2(types[i]) : types[i]);
        }
      }
      return group$1(concat$2(result));
    }
    case "TSUnionType":
    case "UnionTypeAnnotation": {
      // single-line variation
      // A | B | C

      // multi-line variation
      // | A
      // | B
      // | C

      const parent = path.getParentNode();
      // If there's a leading comment, the parent is doing the indentation
      const shouldIndent =
        parent.type !== "TypeParameterInstantiation" &&
        parent.type !== "GenericTypeAnnotation" &&
        !(
          (parent.type === "TypeAlias" ||
            parent.type === "VariableDeclarator") &&
          hasLeadingOwnLineComment(options.originalText, n)
        );

      // {
      //   a: string
      // } | null | void
      // should be inlined and not be printed in the multi-line variant
      const shouldHug = shouldHugType(n);

      // We want to align the children but without its comment, so it looks like
      // | child1
      // // comment
      // | child2
      const printed = path.map(typePath => {
        let printedType = typePath.call(print);
        if (!shouldHug && shouldIndent) {
          printedType = align$1(2, printedType);
        }
        return comments$3.printComments(typePath, () => printedType, options);
      }, "types");

      if (shouldHug) {
        return join$2(" | ", printed);
      }

      const code = concat$2([
        ifBreak$1(concat$2([shouldIndent ? line$1 : "", "| "])),
        join$2(concat$2([line$1, "| "]), printed)
      ]);

      return group$1(shouldIndent ? indent$2(code) : code);
    }
    case "NullableTypeAnnotation":
      return concat$2(["?", path.call(print, "typeAnnotation")]);
    case "NullLiteralTypeAnnotation":
      return "null";
    case "ThisTypeAnnotation":
      return "this";
    case "NumberTypeAnnotation":
      return "number";
    case "ObjectTypeCallProperty":
      if (n.static) {
        parts.push("static ");
      }

      parts.push(path.call(print, "value"));

      return concat$2(parts);
    case "ObjectTypeIndexer": {
      const variance = getFlowVariance(n);
      return concat$2([
        variance || "",
        "[",
        path.call(print, "id"),
        n.id ? ": " : "",
        path.call(print, "key"),
        "]: ",
        path.call(print, "value")
      ]);
    }
    case "ObjectTypeProperty": {
      const variance = getFlowVariance(n);

      return concat$2([
        n.static ? "static " : "",
        isGetterOrSetter(n) ? n.kind + " " : "",
        variance || "",
        path.call(print, "key"),
        n.optional ? "?" : "",
        isFunctionNotation(n) ? "" : ": ",
        path.call(print, "value")
      ]);
    }
    case "QualifiedTypeIdentifier":
      return concat$2([
        path.call(print, "qualification"),
        ".",
        path.call(print, "id")
      ]);
    case "StringLiteralTypeAnnotation":
      return nodeStr(n, options);
    case "NumberLiteralTypeAnnotation":
      assert$1.strictEqual(typeof n.value, "number");

      if (n.extra != null) {
        return printNumber(n.extra.raw);
      } else {
        return printNumber(n.raw);
      }
    case "StringTypeAnnotation":
      return "string";
    case "DeclareTypeAlias":
    case "TypeAlias": {
      if (
        n.type === "DeclareTypeAlias" ||
        isNodeStartingWithDeclare(n, options)
      ) {
        parts.push("declare ");
      }

      const canBreak = n.right.type === "StringLiteralTypeAnnotation";

      const printed = printAssignmentRight(
        n.right,
        path.call(print, "right"),
        canBreak,
        options
      );

      parts.push(
        "type ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
        " =",
        printed,
        semi
      );

      return group$1(concat$2(parts));
    }
    case "TypeCastExpression":
      return concat$2([
        "(",
        path.call(print, "expression"),
        ": ",
        path.call(print, "typeAnnotation"),
        ")"
      ]);
    case "TypeParameterDeclaration":
    case "TypeParameterInstantiation":
      return printTypeParameters(path, options, print, "params");
    case "TypeParameter": {
      const variance = getFlowVariance(n);

      if (variance) {
        parts.push(variance);
      }

      parts.push(path.call(print, "name"));

      if (n.bound) {
        parts.push(": ");
        parts.push(path.call(print, "bound"));
      }

      if (n.constraint) {
        parts.push(" extends ", path.call(print, "constraint"));
      }

      if (n["default"]) {
        parts.push(" = ", path.call(print, "default"));
      }

      return concat$2(parts);
    }
    case "TypeofTypeAnnotation":
      return concat$2(["typeof ", path.call(print, "argument")]);
    case "VoidTypeAnnotation":
      return "void";
    case "NullTypeAnnotation":
      return "null";
    case "InferredPredicate":
      return "%checks";
    // Unhandled types below. If encountered, nodes of these types should
    // be either left alone or desugared into AST types that are fully
    // supported by the pretty-printer.
    case "DeclaredPredicate":
      return concat$2(["%checks(", path.call(print, "value"), ")"]);
    case "TSAbstractKeyword":
      return "abstract";
    case "TSAnyKeyword":
      return "any";
    case "TSAsyncKeyword":
      return "async";
    case "TSBooleanKeyword":
      return "boolean";
    case "TSConstKeyword":
      return "const";
    case "TSDeclareKeyword":
      return "declare";
    case "TSExportKeyword":
      return "export";
    case "TSNeverKeyword":
      return "never";
    case "TSNumberKeyword":
      return "number";
    case "TSObjectKeyword":
      return "object";
    case "TSProtectedKeyword":
      return "protected";
    case "TSPrivateKeyword":
      return "private";
    case "TSPublicKeyword":
      return "public";
    case "TSReadonlyKeyword":
      return "readonly";
    case "TSSymbolKeyword":
      return "symbol";
    case "TSStaticKeyword":
      return "static";
    case "TSStringKeyword":
      return "string";
    case "TSUndefinedKeyword":
      return "undefined";
    case "TSVoidKeyword":
      return "void";
    case "TSAsExpression":
      return concat$2([
        path.call(print, "expression"),
        " as ",
        path.call(print, "typeAnnotation")
      ]);
    case "TSArrayType":
      return concat$2([path.call(print, "elementType"), "[]"]);
    case "TSPropertySignature": {
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.export) {
        parts.push("export ");
      }
      if (n.static) {
        parts.push("static ");
      }

      if (n.readonly) {
        parts.push("readonly ");
      }

      if (n.computed) {
        parts.push("[");
      }

      parts.push(path.call(print, "key"));

      if (n.computed) {
        parts.push("]");
      }

      if (n.optional) {
        parts.push("?");
      }

      if (n.typeAnnotation) {
        parts.push(": ");
        parts.push(path.call(print, "typeAnnotation"));
      }

      // This isn't valid semantically, but it's in the AST so we can print it.
      if (n.initializer) {
        parts.push(" = ", path.call(print, "initializer"));
      }

      return concat$2(parts);
    }
    case "TSParameterProperty":
      if (n.accessibility) {
        parts.push(n.accessibility + " ");
      }
      if (n.export) {
        parts.push("export ");
      }
      if (n.static) {
        parts.push("static ");
      }
      if (n.readonly) {
        parts.push("readonly ");
      }

      parts.push(path.call(print, "parameter"));

      return concat$2(parts);
    case "TSTypeReference":
      return concat$2([
        path.call(print, "typeName"),
        printTypeParameters(path, options, print, "typeParameters")
      ]);
    case "TSTypeQuery":
      return concat$2(["typeof ", path.call(print, "exprName")]);
    case "TSParenthesizedType":
      return concat$2(["(", path.call(print, "typeAnnotation"), ")"]);
    case "TSIndexSignature": {
      let printedParams = [];
      if (n.params) {
        printedParams = path.map(print, "params");
      }
      if (n.parameters) {
        printedParams = path.map(print, "parameters");
      }

      return concat$2([
        n.accessibility ? concat$2([n.accessibility, " "]) : "",
        n.export ? "export " : "",
        n.static ? "static " : "",
        n.readonly ? "readonly " : "",
        "[",
        path.call(print, "index"),
        // This should only contain a single element, however TypeScript parses
        // it using parseDelimitedList that uses commas as delimiter.
        join$2(", ", printedParams),
        "]: ",
        path.call(print, "typeAnnotation")
      ]);
    }
    case "TSTypePredicate":
      return concat$2([
        path.call(print, "parameterName"),
        " is ",
        path.call(print, "typeAnnotation")
      ]);
    case "TSNonNullExpression":
      return concat$2([path.call(print, "expression"), "!"]);
    case "TSThisType":
      return "this";
    case "TSLastTypeNode":
      return path.call(print, "literal");
    case "TSIndexedAccessType":
      return concat$2([
        path.call(print, "objectType"),
        "[",
        path.call(print, "indexType"),
        "]"
      ]);
    case "TSConstructSignature":
    case "TSConstructorType":
    case "TSCallSignature": {
      if (n.type !== "TSCallSignature") {
        parts.push("new ");
      }
      const isType = n.type === "TSConstructorType";

      if (n.typeParameters) {
        parts.push(printTypeParameters(path, options, print, "typeParameters"));
      }

      const params = n.params
        ? path.map(print, "params")
        : path.map(print, "parameters");
      parts.push("(", join$2(", ", params), ")");
      if (n.typeAnnotation) {
        parts.push(isType ? " => " : ": ", path.call(print, "typeAnnotation"));
      }
      return concat$2(parts);
    }
    case "TSTypeOperator":
      return concat$2(["keyof ", path.call(print, "typeAnnotation")]);
    case "TSMappedType":
      return group$1(
        concat$2([
          "{",
          indent$2(
            concat$2([
              options.bracketSpacing ? line$1 : softline$1,
              n.readonlyToken
                ? concat$2([path.call(print, "readonlyToken"), " "])
                : "",
              printTypeScriptModifiers(path, options, print),
              "[",
              path.call(print, "typeParameter"),
              "]",
              n.questionToken ? "?" : "",
              ": ",
              path.call(print, "typeAnnotation")
            ])
          ),
          comments$3.printDanglingComments(path, options, /* sameIndent */ true),
          options.bracketSpacing ? line$1 : softline$1,
          "}"
        ])
      );
    case "TSTypeParameter":
      parts.push(path.call(print, "name"));

      if (n.constraint) {
        parts.push(" in ", path.call(print, "constraint"));
      }

      return concat$2(parts);
    case "TSMethodSignature":
      parts.push(
        n.accessibility ? concat$2([n.accessibility, " "]) : "",
        n.export ? "export " : "",
        n.static ? "static " : "",
        n.readonly ? "readonly " : "",
        n.computed ? "[" : "",
        path.call(print, "key"),
        n.computed ? "]" : "",
        n.optional ? "?" : "",
        printFunctionTypeParameters(path, options, print),
        printFunctionParams(path, print, options)
      );

      if (n.typeAnnotation) {
        parts.push(": ", path.call(print, "typeAnnotation"));
      }
      return concat$2(parts);
    case "TSNamespaceExportDeclaration":
      if (n.declaration) {
        // Temporary fix until https://github.com/eslint/typescript-eslint-parser/issues/263
        const isDefault = options.originalText
          .slice(util$4.locStart(n), util$4.locStart(n.declaration))
          .match(/\bdefault\b/);
        parts.push(
          "export ",
          isDefault ? "default " : "",
          path.call(print, "declaration")
        );
      } else {
        parts.push("export as namespace ", path.call(print, "name"));

        if (options.semi) {
          parts.push(";");
        }
      }

      return group$1(concat$2(parts));
    case "TSEnumDeclaration":
      if (n.modifiers) {
        parts.push(printTypeScriptModifiers(path, options, print));
      }

      parts.push("enum ", path.call(print, "name"), " ");

      if (n.members.length === 0) {
        parts.push(
          group$1(
            concat$2([
              "{",
              comments$3.printDanglingComments(path, options),
              softline$1,
              "}"
            ])
          )
        );
      } else {
        parts.push(
          group$1(
            concat$2([
              "{",
              indent$2(
                concat$2([
                  hardline$2,
                  printArrayItems(path, options, "members", print),
                  shouldPrintComma(options, "es5") ? "," : ""
                ])
              ),
              comments$3.printDanglingComments(
                path,
                options,
                /* sameIndent */ true
              ),
              hardline$2,
              "}"
            ])
          )
        );
      }

      return concat$2(parts);
    case "TSEnumMember":
      parts.push(path.call(print, "name"));
      if (n.initializer) {
        parts.push(" = ", path.call(print, "initializer"));
      }
      return concat$2(parts);
    case "TSImportEqualsDeclaration":
      parts.push(
        printTypeScriptModifiers(path, options, print),
        "import ",
        path.call(print, "name"),
        " = ",
        path.call(print, "moduleReference")
      );

      if (options.semi) {
        parts.push(";");
      }

      return group$1(concat$2(parts));
    case "TSExternalModuleReference":
      return concat$2(["require(", path.call(print, "expression"), ")"]);
    case "TSModuleDeclaration": {
      const parent = path.getParentNode();
      const isExternalModule = isLiteral(n.name);
      const parentIsDeclaration = parent.type === "TSModuleDeclaration";
      const bodyIsDeclaration = n.body && n.body.type === "TSModuleDeclaration";

      if (parentIsDeclaration) {
        parts.push(".");
      } else {
        parts.push(printTypeScriptModifiers(path, options, print));

        // Global declaration looks like this:
        // declare global { ... }
        const isGlobalDeclaration =
          n.name.type === "Identifier" &&
          n.name.name === "global" &&
          n.modifiers &&
          n.modifiers.some(modifier => modifier.type === "TSDeclareKeyword");

        if (!isGlobalDeclaration) {
          parts.push(isExternalModule ? "module " : "namespace ");
        }
      }

      parts.push(path.call(print, "name"));

      if (bodyIsDeclaration) {
        parts.push(path.call(print, "body"));
      } else if (n.body) {
        parts.push(
          " {",
          indent$2(
            concat$2([
              line$1,
              path.call(
                bodyPath =>
                  comments$3.printDanglingComments(bodyPath, options, true),
                "body"
              ),
              group$1(path.call(print, "body"))
            ])
          ),
          line$1,
          "}"
        );
      } else {
        parts.push(semi);
      }

      return concat$2(parts);
    }
    case "TSModuleBlock":
      return path.call(bodyPath => {
        return printStatementSequence(bodyPath, options, print);
      }, "body");
    // postcss
    case "css-root": {
      return concat$2([printNodeSequence(path, options, print), hardline$2]);
    }
    case "css-comment": {
      if (n.raws.content) {
        return n.raws.content;
      }
      const text = options.originalText.slice(util$4.locStart(n), util$4.locEnd(n));
      const rawText = n.raws.text || n.text;
      // Workaround a bug where the location is off.
      // https://github.com/postcss/postcss-scss/issues/63
      if (text.indexOf(rawText) === -1) {
        if (n.raws.inline) {
          return concat$2(["// ", rawText]);
        }
        return concat$2(["/* ", rawText, " */"]);
      }
      return text;
    }
    case "css-rule": {
      return concat$2([
        path.call(print, "selector"),
        n.important ? " !important" : "",
        n.nodes
          ? concat$2([
              " {",
              n.nodes.length > 0
                ? indent$2(
                    concat$2([hardline$2, printNodeSequence(path, options, print)])
                  )
                : "",
              hardline$2,
              "}"
            ])
          : ";"
      ]);
    }
    case "css-decl": {
      return concat$2([
        n.raws.before.replace(/[\s;]/g, ""),
        n.prop,
        ": ",
        path.call(print, "value"),
        n.important ? " !important" : "",
        n.nodes
          ? concat$2([
              " {",
              indent$2(
                concat$2([softline$1, printNodeSequence(path, options, print)])
              ),
              softline$1,
              "}"
            ])
          : ";"
      ]);
    }
    case "css-atrule": {
      const hasParams =
        n.params &&
        !(n.params.type === "media-query-list" && n.params.value === "");
      return concat$2([
        "@",
        n.name,
        hasParams ? concat$2([" ", path.call(print, "params")]) : "",
        n.nodes
          ? concat$2([
              " {",
              indent$2(
                concat$2([
                  n.nodes.length > 0 ? softline$1 : "",
                  printNodeSequence(path, options, print)
                ])
              ),
              softline$1,
              "}"
            ])
          : ";"
      ]);
    }
    case "css-import": {
      return concat$2([
        "@",
        n.name,
        " ",
        n.directives ? concat$2([n.directives, " "]) : "",
        n.importPath,
        ";"
      ]);
    }
    // postcss-media-query-parser
    case "media-query-list": {
      const parts = [];
      path.each(childPath => {
        const node = childPath.getValue();
        if (node.type === "media-query" && node.value === "") {
          return;
        }
        parts.push(childPath.call(print));
      }, "nodes");
      return join$2(", ", parts);
    }
    case "media-query": {
      return join$2(" ", path.map(print, "nodes"));
    }
    case "media-type": {
      return n.value;
    }
    case "media-feature-expression": {
      if (!n.nodes) {
        return n.value;
      }
      return concat$2(["(", concat$2(path.map(print, "nodes")), ")"]);
    }
    case "media-feature": {
      return n.value.replace(/ +/g, " ");
    }
    case "media-colon": {
      return concat$2([n.value, " "]);
    }
    case "media-value": {
      return n.value;
    }
    case "media-keyword": {
      return n.value;
    }
    case "media-url": {
      return n.value;
    }
    case "media-unknown": {
      return n.value;
    }
    // postcss-selector-parser
    case "selector-root": {
      return group$1(join$2(concat$2([",", line$1]), path.map(print, "nodes")));
    }
    case "selector-comment": {
      return n.value;
    }
    case "selector-string": {
      return n.value;
    }
    case "selector-tag": {
      return n.value;
    }
    case "selector-id": {
      return concat$2(["#", n.value]);
    }
    case "selector-class": {
      return concat$2([".", n.value]);
    }
    case "selector-attribute": {
      return concat$2([
        "[",
        n.attribute,
        n.operator ? n.operator : "",
        n.value ? n.value : "",
        n.insensitive ? " i" : "",
        "]"
      ]);
    }
    case "selector-combinator": {
      if (n.value === "+" || n.value === ">" || n.value === "~") {
        const parent = path.getParentNode();
        const leading = parent.type === "selector-selector" &&
          parent.nodes[0] === n
          ? ""
          : line$1;
        return concat$2([leading, n.value, " "]);
      }
      return n.value;
    }
    case "selector-universal": {
      return n.value;
    }
    case "selector-selector": {
      return group$1(indent$2(concat$2(path.map(print, "nodes"))));
    }
    case "selector-pseudo": {
      return concat$2([
        n.value,
        n.nodes && n.nodes.length > 0
          ? concat$2(["(", join$2(", ", path.map(print, "nodes")), ")"])
          : ""
      ]);
    }
    case "selector-nesting": {
      return printValue(n.value);
    }
    // postcss-values-parser
    case "value-root": {
      return path.call(print, "group");
    }
    case "value-comma_group": {
      const printed = path.map(print, "groups");
      const parts = [];
      for (let i = 0; i < n.groups.length; ++i) {
        parts.push(printed[i]);
        if (
          i !== n.groups.length - 1 &&
          n.groups[i + 1].raws &&
          n.groups[i + 1].raws.before !== ""
        ) {
          if (
            n.groups[i + 1].type === "value-operator" &&
            ["+", "-", "/", "*", "%"].indexOf(n.groups[i + 1].value) !== -1
          ) {
            parts.push(" ");
          } else {
            parts.push(line$1);
          }
        }
      }

      return group$1(indent$2(concat$2(parts)));
    }
    case "value-paren_group": {
      const parent = path.getParentNode();
      const isURLCall =
        parent && parent.type === "value-func" && parent.value === "url";

      if (
        isURLCall &&
        (n.groups.length === 1 ||
          (n.groups.length > 0 &&
            n.groups[0].type === "value-comma_group" &&
            n.groups[0].groups.length > 0 &&
            n.groups[0].groups[0].type === "value-word" &&
            n.groups[0].groups[0].value === "data"))
      ) {
        return concat$2([
          n.open ? path.call(print, "open") : "",
          join$2(",", path.map(print, "groups")),
          n.close ? path.call(print, "close") : ""
        ]);
      }

      if (!n.open) {
        return group$1(
          indent$2(join$2(concat$2([",", line$1]), path.map(print, "groups")))
        );
      }

      return group$1(
        concat$2([
          n.open ? path.call(print, "open") : "",
          indent$2(
            concat$2([
              softline$1,
              join$2(concat$2([",", line$1]), path.map(print, "groups"))
            ])
          ),
          softline$1,
          n.close ? path.call(print, "close") : ""
        ])
      );
    }
    case "value-value": {
      return path.call(print, "group");
    }
    case "value-func": {
      return concat$2([n.value, path.call(print, "group")]);
    }
    case "value-paren": {
      if (n.raws.before !== "") {
        return concat$2([line$1, n.value]);
      }
      return n.value;
    }
    case "value-number": {
      return concat$2([n.value, n.unit]);
    }
    case "value-operator": {
      return n.value;
    }
    case "value-word": {
      return n.value;
    }
    case "value-colon": {
      return n.value;
    }
    case "value-comma": {
      return concat$2([n.value, " "]);
    }
    case "value-string": {
      return concat$2([
        n.quoted ? n.raws.quote : "",
        n.value,
        n.quoted ? n.raws.quote : ""
      ]);
    }
    case "value-atword": {
      return concat$2(["@", n.value]);
    }

    default:
      throw new Error("unknown type: " + JSON.stringify(n.type));
  }
}

function printValue(value) {
  return value;
}

function printNodeSequence(path, options, print) {
  const node = path.getValue();
  const parts = [];
  let i = 0;
  path.map(pathChild => {
    parts.push(pathChild.call(print));
    if (i !== node.nodes.length - 1) {
      if (
        node.nodes[i + 1].type === "css-comment" &&
        !util$4.hasNewline(
          options.originalText,
          util$4.locStart(node.nodes[i + 1]),
          { backwards: true }
        )
      ) {
        parts.push(" ");
      } else {
        parts.push(hardline$2);
        if (util$4.isNextLineEmpty(options.originalText, pathChild.getValue())) {
          parts.push(hardline$2);
        }
      }
    }
    i++;
  }, "nodes");

  return concat$2(parts);
}

function printStatementSequence(path, options, print) {
  const printed = [];

  const bodyNode = path.getNode();
  const isClass = bodyNode.type === "ClassBody";

  path.map((stmtPath, i) => {
    const stmt = stmtPath.getValue();

    // Just in case the AST has been modified to contain falsy
    // "statements," it's safer simply to skip them.
    if (!stmt) {
      return;
    }

    // Skip printing EmptyStatement nodes to avoid leaving stray
    // semicolons lying around.
    if (stmt.type === "EmptyStatement") {
      return;
    }

    const stmtPrinted = print(stmtPath);
    const text = options.originalText;
    const parts = [];

    // in no-semi mode, prepend statement with semicolon if it might break ASI
    if (!options.semi && !isClass && stmtNeedsASIProtection(stmtPath)) {
      if (stmt.comments && stmt.comments.some(comment => comment.leading)) {
        // Note: stmtNeedsASIProtection requires stmtPath to already be printed
        // as it reads needsParens which is mutated on the instance
        parts.push(print(stmtPath, { needsSemi: true }));
      } else {
        parts.push(";", stmtPrinted);
      }
    } else {
      parts.push(stmtPrinted);
    }

    if (!options.semi && isClass) {
      if (classPropMayCauseASIProblems(stmtPath)) {
        parts.push(";");
      } else if (stmt.type === "ClassProperty") {
        const nextChild = bodyNode.body[i + 1];
        if (classChildNeedsASIProtection(nextChild)) {
          parts.push(";");
        }
      }
    }

    if (util$4.isNextLineEmpty(text, stmt) && !isLastStatement(stmtPath)) {
      parts.push(hardline$2);
    }

    printed.push(concat$2(parts));
  });

  return join$2(hardline$2, printed);
}

function printPropertyKey(path, options, print) {
  const node = path.getNode();
  const key = node.key;

  if (isStringLiteral(key) && isIdentifierName(key.value) && !node.computed) {
    // 'a' -> a
    return path.call(
      keyPath => comments$3.printComments(keyPath, () => key.value, options),
      "key"
    );
  }
  return path.call(print, "key");
}

function printMethod(path, options, print) {
  const node = path.getNode();
  const semi = options.semi ? ";" : "";
  const kind = node.kind;
  const parts = [];

  if (node.type === "ObjectMethod" || node.type === "ClassMethod") {
    node.value = node;
  }

  if (node.value.async) {
    parts.push("async ");
  }

  if (!kind || kind === "init" || kind === "method" || kind === "constructor") {
    if (node.value.generator) {
      parts.push("*");
    }
  } else {
    assert$1.ok(kind === "get" || kind === "set");

    parts.push(kind, " ");
  }

  let key = printPropertyKey(path, options, print);

  if (node.computed) {
    key = concat$2(["[", key, "]"]);
  }

  parts.push(
    key,
    concat$2(
      path.call(
        valuePath => [
          printFunctionTypeParameters(valuePath, options, print),
          group$1(
            concat$2([
              printFunctionParams(valuePath, print, options),
              printReturnType(valuePath, print)
            ])
          )
        ],
        "value"
      )
    )
  );

  if (!node.value.body || node.value.body.length === 0) {
    parts.push(semi);
  } else {
    parts.push(" ", path.call(print, "value", "body"));
  }

  return concat$2(parts);
}

function couldGroupArg(arg) {
  return (
    (arg.type === "ObjectExpression" && arg.properties.length > 0) ||
    (arg.type === "ArrayExpression" && arg.elements.length > 0) ||
    arg.type === "FunctionExpression" ||
    (arg.type === "ArrowFunctionExpression" &&
      (arg.body.type === "BlockStatement" ||
        arg.body.type === "ArrowFunctionExpression" ||
        arg.body.type === "ObjectExpression" ||
        arg.body.type === "ArrayExpression" ||
        arg.body.type === "CallExpression" ||
        arg.body.type === "JSXElement"))
  );
}

function shouldGroupLastArg(args) {
  const lastArg = util$4.getLast(args);
  const penultimateArg = util$4.getPenultimate(args);
  return (
    (!lastArg.comments || !lastArg.comments.length) &&
    couldGroupArg(lastArg) &&
    // If the last two arguments are of the same type,
    // disable last element expansion.
    (!penultimateArg || penultimateArg.type !== lastArg.type)
  );
}

function shouldGroupFirstArg(args) {
  if (args.length !== 2) {
    return false;
  }

  const firstArg = args[0];
  const secondArg = args[1];
  return (
    (!firstArg.comments || !firstArg.comments.length) &&
    (firstArg.type === "FunctionExpression" ||
      (firstArg.type === "ArrowFunctionExpression" &&
        firstArg.body.type === "BlockStatement")) &&
    !couldGroupArg(secondArg)
  );
}

function printArgumentsList(path, options, print) {
  const printed = path.map(print, "arguments");
  if (printed.length === 0) {
    return concat$2([
      "(",
      comments$3.printDanglingComments(path, options, /* sameIndent */ true),
      ")"
    ]);
  }

  const args = path.getValue().arguments;
  // This is just an optimization; I think we could return the
  // conditional group for all function calls, but it's more expensive
  // so only do it for specific forms.
  const shouldGroupFirst = shouldGroupFirstArg(args);
  const shouldGroupLast = shouldGroupLastArg(args);
  if (shouldGroupFirst || shouldGroupLast) {
    const shouldBreak = shouldGroupFirst
      ? printed.slice(1).some(willBreak)
      : printed.slice(0, -1).some(willBreak);

    // We want to print the last argument with a special flag
    let printedExpanded;
    let i = 0;
    path.each(argPath => {
      if (shouldGroupFirst && i === 0) {
        printedExpanded = [
          argPath.call(p => print(p, { expandFirstArg: true }))
        ].concat(printed.slice(1));
      }
      if (shouldGroupLast && i === args.length - 1) {
        printedExpanded = printed
          .slice(0, -1)
          .concat(argPath.call(p => print(p, { expandLastArg: true })));
      }
      i++;
    }, "arguments");

    return concat$2([
      printed.some(willBreak) ? breakParent$2 : "",
      conditionalGroup$1(
        [
          concat$2(["(", join$2(concat$2([", "]), printedExpanded), ")"]),
          shouldGroupFirst
            ? concat$2([
                "(",
                group$1(printedExpanded[0], { shouldBreak: true }),
                printed.length > 1 ? ", " : "",
                join$2(concat$2([",", line$1]), printed.slice(1)),
                ")"
              ])
            : concat$2([
                "(",
                join$2(concat$2([",", line$1]), printed.slice(0, -1)),
                printed.length > 1 ? ", " : "",
                group$1(util$4.getLast(printedExpanded), {
                  shouldBreak: true
                }),
                ")"
              ]),
          group$1(
            concat$2([
              "(",
              indent$2(concat$2([line$1, join$2(concat$2([",", line$1]), printed)])),
              shouldPrintComma(options, "all") ? "," : "",
              line$1,
              ")"
            ]),
            { shouldBreak: true }
          )
        ],
        { shouldBreak }
      )
    ]);
  }

  return group$1(
    concat$2([
      "(",
      indent$2(concat$2([softline$1, join$2(concat$2([",", line$1]), printed)])),
      ifBreak$1(shouldPrintComma(options, "all") ? "," : ""),
      softline$1,
      ")"
    ]),
    { shouldBreak: printed.some(willBreak) }
  );
}

function printFunctionTypeParameters(path, options, print) {
  const fun = path.getValue();
  const paramsFieldIsArray = Array.isArray(fun["typeParameters"]);

  if (fun.typeParameters) {
    // for TSFunctionType typeParameters is an array
    // for FunctionTypeAnnotation it's a single node
    if (paramsFieldIsArray) {
      return concat$2("<", join$2(", ", path.map(print, "typeParameters")), ">");
    } else {
      return path.call(print, "typeParameters");
    }
  } else {
    return "";
  }
}

function printFunctionParams(path, print, options, expandArg) {
  const fun = path.getValue();
  const paramsField = fun.parameters ? "parameters" : "params";

  let printed = [];
  if (fun[paramsField]) {
    printed = path.map(print, paramsField);
  }

  if (fun.defaults) {
    path.each(defExprPath => {
      const i = defExprPath.getName();
      const p = printed[i];

      if (p && defExprPath.getValue()) {
        printed[i] = concat$2([p, " = ", print(defExprPath)]);
      }
    }, "defaults");
  }

  if (fun.rest) {
    printed.push(concat$2(["...", path.call(print, "rest")]));
  }

  if (printed.length === 0) {
    return concat$2([
      "(",
      comments$3.printDanglingComments(path, options, /* sameIndent */ true),
      ")"
    ]);
  }

  const lastParam = util$4.getLast(fun[paramsField]);

  // If the parent is a call with the first/last argument expansion and this is the
  // params of the first/last argument, we dont want the arguments to break and instead
  // want the whole expression to be on a new line.
  //
  // Good:                 Bad:
  //   verylongcall(         verylongcall((
  //     (a, b) => {           a,
  //     }                     b,
  //   })                    ) => {
  //                         })
  if (expandArg) {
    return group$1(concat$2(["(", join$2(", ", printed.map(removeLines)), ")"]));
  }

  // Single object destructuring should hug
  //
  // function({
  //   a,
  //   b,
  //   c
  // }) {}
  if (shouldHugArguments(fun)) {
    return concat$2(["(", join$2(", ", printed), ")"]);
  }

  const parent = path.getParentNode();

  const flowTypeAnnotations = [
    "AnyTypeAnnotation",
    "NullLiteralTypeAnnotation",
    "GenericTypeAnnotation",
    "ThisTypeAnnotation",
    "NumberTypeAnnotation",
    "VoidTypeAnnotation",
    "NullTypeAnnotation",
    "EmptyTypeAnnotation",
    "MixedTypeAnnotation",
    "BooleanTypeAnnotation",
    "BooleanLiteralTypeAnnotation",
    "StringTypeAnnotation"
  ];

  const isFlowShorthandWithOneArg =
    (isObjectTypePropertyAFunction(parent) ||
      isTypeAnnotationAFunction(parent) ||
      parent.type === "TypeAlias" ||
      parent.type === "UnionTypeAnnotation" ||
      parent.type === "TSUnionType" ||
      parent.type === "IntersectionTypeAnnotation" ||
      (parent.type === "FunctionTypeAnnotation" &&
        parent.returnType === fun)) &&
    fun[paramsField].length === 1 &&
    fun[paramsField][0].name === null &&
    fun[paramsField][0].typeAnnotation &&
    flowTypeAnnotations.indexOf(fun[paramsField][0].typeAnnotation.type) !==
      -1 &&
    !(
      fun[paramsField][0].typeAnnotation.type === "GenericTypeAnnotation" &&
      fun[paramsField][0].typeAnnotation.typeParameters
    ) &&
    !fun.rest;

  if (isFlowShorthandWithOneArg) {
    return concat$2(printed);
  }

  const canHaveTrailingComma =
    !(lastParam && lastParam.type === "RestElement") && !fun.rest;

  return concat$2([
    "(",
    indent$2(concat$2([softline$1, join$2(concat$2([",", line$1]), printed)])),
    ifBreak$1(
      canHaveTrailingComma && shouldPrintComma(options, "all") ? "," : ""
    ),
    softline$1,
    ")"
  ]);
}

function canPrintParamsWithoutParens(node) {
  return (
    node.params.length === 1 &&
    !node.rest &&
    node.params[0].type === "Identifier" &&
    !node.params[0].typeAnnotation &&
    !util$4.hasBlockComments(node.params[0]) &&
    !node.params[0].optional &&
    !node.predicate &&
    !node.returnType
  );
}

function printFunctionDeclaration(path, print, options) {
  const n = path.getValue();
  const parts = [];

  if (n.async) {
    parts.push("async ");
  }

  parts.push("function");

  if (n.generator) {
    parts.push("*");
  }
  if (n.id) {
    parts.push(" ", path.call(print, "id"));
  }

  parts.push(
    printFunctionTypeParameters(path, options, print),
    group$1(
      concat$2([
        printFunctionParams(path, print, options),
        printReturnType(path, print)
      ])
    ),
    n.body ? " " : "",
    path.call(print, "body")
  );

  return concat$2(parts);
}

function printObjectMethod(path, options, print) {
  const objMethod = path.getValue();
  const parts = [];

  if (objMethod.async) {
    parts.push("async ");
  }
  if (objMethod.generator) {
    parts.push("*");
  }
  if (
    objMethod.method ||
    objMethod.kind === "get" ||
    objMethod.kind === "set"
  ) {
    return printMethod(path, options, print);
  }

  const key = printPropertyKey(path, options, print);

  if (objMethod.computed) {
    parts.push("[", key, "]");
  } else {
    parts.push(key);
  }

  parts.push(
    printFunctionTypeParameters(path, options, print),
    group$1(
      concat$2([
        printFunctionParams(path, print, options),
        printReturnType(path, print)
      ])
    ),
    " ",
    path.call(print, "body")
  );

  return concat$2(parts);
}

function printReturnType(path, print) {
  const n = path.getValue();
  const parts = [path.call(print, "returnType")];

  // prepend colon to TypeScript type annotation
  if (n.returnType && n.returnType.typeAnnotation) {
    parts.unshift(": ");
  }

  if (n.predicate) {
    // The return type will already add the colon, but otherwise we
    // need to do it ourselves
    parts.push(n.returnType ? " " : ": ", path.call(print, "predicate"));
  }

  return concat$2(parts);
}

function printExportDeclaration(path, options, print) {
  const decl = path.getValue();
  const semi = options.semi ? ";" : "";
  const parts = ["export "];

  if (decl["default"] || decl.type === "ExportDefaultDeclaration") {
    // Temp fix, delete after https://github.com/eslint/typescript-eslint-parser/issues/304
    if (
      decl.declaration &&
      /=/.test(
        options.originalText.slice(
          util$4.locStart(decl),
          util$4.locStart(decl.declaration)
        )
      )
    ) {
      parts.push("= ");
    } else {
      parts.push("default ");
    }
  }

  parts.push(
    comments$3.printDanglingComments(path, options, /* sameIndent */ true)
  );

  if (decl.declaration) {
    parts.push(path.call(print, "declaration"));

    if (
      decl.type === "ExportDefaultDeclaration" &&
      (decl.declaration.type !== "ClassDeclaration" &&
        decl.declaration.type !== "FunctionDeclaration" &&
        decl.declaration.type !== "TSAbstractClassDeclaration")
    ) {
      parts.push(semi);
    }
  } else {
    if (decl.specifiers && decl.specifiers.length > 0) {
      if (
        decl.specifiers.length === 1 &&
        decl.specifiers[0].type === "ExportBatchSpecifier"
      ) {
        parts.push("*");
      } else {
        const specifiers = [];
        const defaultSpecifiers = [];
        const namespaceSpecifiers = [];

        path.map(specifierPath => {
          const specifierType = path.getValue().type;
          if (specifierType === "ExportSpecifier") {
            specifiers.push(print(specifierPath));
          } else if (specifierType === "ExportDefaultSpecifier") {
            defaultSpecifiers.push(print(specifierPath));
          } else if (specifierType === "ExportNamespaceSpecifier") {
            namespaceSpecifiers.push(concat$2(["* as ", print(specifierPath)]));
          }
        }, "specifiers");

        const isNamespaceFollowed =
          namespaceSpecifiers.length !== 0 &&
          (specifiers.length !== 0 || defaultSpecifiers.length !== 0);
        const isDefaultFollowed =
          defaultSpecifiers.length !== 0 && specifiers.length !== 0;

        parts.push(
          decl.exportKind === "type" ? "type " : "",
          concat$2(namespaceSpecifiers),
          concat$2([isNamespaceFollowed ? ", " : ""]),
          concat$2(defaultSpecifiers),
          concat$2([isDefaultFollowed ? ", " : ""]),
          specifiers.length !== 0
            ? group$1(
                concat$2([
                  "{",
                  indent$2(
                    concat$2([
                      options.bracketSpacing ? line$1 : softline$1,
                      join$2(concat$2([",", line$1]), specifiers)
                    ])
                  ),
                  ifBreak$1(shouldPrintComma(options) ? "," : ""),
                  options.bracketSpacing ? line$1 : softline$1,
                  "}"
                ])
              )
            : ""
        );
      }
    } else {
      parts.push("{}");
    }

    if (decl.source) {
      parts.push(" from ", path.call(print, "source"));
    }

    parts.push(semi);
  }

  return concat$2(parts);
}

function printFlowDeclaration(path, parts) {
  const parentExportDecl = util$4.getParentExportDeclaration(path);

  if (parentExportDecl) {
    assert$1.strictEqual(parentExportDecl.type, "DeclareExportDeclaration");
  } else {
    // If the parent node has type DeclareExportDeclaration, then it
    // will be responsible for printing the "declare" token. Otherwise
    // it needs to be printed with this non-exported declaration node.
    parts.unshift("declare ");
  }

  return concat$2(parts);
}

function getFlowVariance(path) {
  if (!path.variance) {
    return null;
  }

  // Babylon 7.0 currently uses variance node type, and flow should
  // follow suit soon:
  // https://github.com/babel/babel/issues/4722
  const variance = path.variance.kind || path.variance;

  switch (variance) {
    case "plus":
      return "+";

    case "minus":
      return "-";

    default:
      return variance;
  }
}

function printTypeScriptModifiers(path, options, print) {
  const n = path.getValue();
  if (!n.modifiers || !n.modifiers.length) {
    return "";
  }
  return concat$2([join$2(" ", path.map(print, "modifiers")), " "]);
}

function printTypeParameters(path, options, print, paramsKey) {
  const n = path.getValue();

  if (!n[paramsKey]) {
    return "";
  }

  // for TypeParameterDeclaration typeParameters is a single node
  if (!Array.isArray(n[paramsKey])) {
    return path.call(print, paramsKey);
  }

  const shouldInline =
    n[paramsKey].length === 1 &&
    (shouldHugType(n[paramsKey][0]) ||
      (n[paramsKey][0].type === "GenericTypeAnnotation" &&
        shouldHugType(n[paramsKey][0].id)) ||
      n[paramsKey][0].type === "NullableTypeAnnotation");

  if (shouldInline) {
    return concat$2(["<", join$2(", ", path.map(print, paramsKey)), ">"]);
  }

  return group$1(
    concat$2([
      "<",
      indent$2(
        concat$2([
          softline$1,
          join$2(concat$2([",", line$1]), path.map(print, paramsKey))
        ])
      ),
      ifBreak$1(
        options.parser !== "typescript" && shouldPrintComma(options, "all")
          ? ","
          : ""
      ),
      softline$1,
      ">"
    ])
  );
}

function printClass(path, options, print) {
  const n = path.getValue();
  const parts = [];

  if (n.accessibility) {
    parts.push(n.accessibility + " ");
  }
  if (n.type === "TSAbstractClassDeclaration") {
    parts.push("abstract ");
  }

  parts.push("class");

  if (n.id) {
    parts.push(" ", path.call(print, "id"));
  }

  parts.push(path.call(print, "typeParameters"));

  const partsGroup = [];
  if (n.superClass) {
    parts.push(
      " extends ",
      path.call(print, "superClass"),
      path.call(print, "superTypeParameters")
    );
  } else if (n.extends && n.extends.length > 0) {
    parts.push(" extends ", join$2(", ", path.map(print, "extends")));
  }

  if (n["implements"] && n["implements"].length > 0) {
    partsGroup.push(
      line$1,
      "implements ",
      group$1(indent$2(join$2(concat$2([",", line$1]), path.map(print, "implements"))))
    );
  }

  if (partsGroup.length > 0) {
    parts.push(group$1(indent$2(concat$2(partsGroup))));
  }

  parts.push(" ", path.call(print, "body"));

  return parts;
}

function printMemberLookup(path, options, print) {
  const property = path.call(print, "property");
  const n = path.getValue();

  if (!n.computed) {
    return concat$2([".", property]);
  }

  if (
    !n.property ||
    (n.property.type === "Literal" && typeof n.property.value === "number") ||
    n.property.type === "NumericLiteral"
  ) {
    return concat$2(["[", property, "]"]);
  }

  return group$1(
    concat$2(["[", indent$2(concat$2([softline$1, property])), softline$1, "]"])
  );
}

// We detect calls on member expressions specially to format a
// comman pattern better. The pattern we are looking for is this:
//
// arr
//   .map(x => x + 1)
//   .filter(x => x > 10)
//   .some(x => x % 2)
//
// The way it is structured in the AST is via a nested sequence of
// MemberExpression and CallExpression. We need to traverse the AST
// and make groups out of it to print it in the desired way.
function printMemberChain(path, options, print) {
  // The first phase is to linearize the AST by traversing it down.
  //
  //   a().b()
  // has the following AST structure:
  //   CallExpression(MemberExpression(CallExpression(Identifier)))
  // and we transform it into
  //   [Identifier, CallExpression, MemberExpression, CallExpression]
  const printedNodes = [];

  function rec(path) {
    const node = path.getValue();
    if (node.type === "CallExpression") {
      printedNodes.unshift({
        node: node,
        printed: comments$3.printComments(
          path,
          () =>
            concat$2([
              printFunctionTypeParameters(path, options, print),
              printArgumentsList(path, options, print)
            ]),
          options
        )
      });
      path.call(callee => rec(callee), "callee");
    } else if (node.type === "MemberExpression") {
      printedNodes.unshift({
        node: node,
        printed: comments$3.printComments(
          path,
          () => printMemberLookup(path, options, print),
          options
        )
      });
      path.call(object => rec(object), "object");
    } else {
      printedNodes.unshift({
        node: node,
        printed: path.call(print)
      });
    }
  }
  // Note: the comments of the root node have already been printed, so we
  // need to extract this first call without printing them as they would
  // if handled inside of the recursive call.
  printedNodes.unshift({
    node: path.getValue(),
    printed: concat$2([
      printFunctionTypeParameters(path, options, print),
      printArgumentsList(path, options, print)
    ])
  });
  path.call(callee => rec(callee), "callee");

  // Once we have a linear list of printed nodes, we want to create groups out
  // of it.
  //
  //   a().b.c().d().e
  // will be grouped as
  //   [
  //     [Identifier, CallExpression],
  //     [MemberExpression, MemberExpression, CallExpression],
  //     [MemberExpression, CallExpression],
  //     [MemberExpression],
  //   ]
  // so that we can print it as
  //   a()
  //     .b.c()
  //     .d()
  //     .e

  // The first group is the first node followed by
  //   - as many CallExpression as possible
  //       < fn()()() >.something()
  //   - then, as many MemberExpression as possible but the last one
  //       < this.items >.something()
  const groups = [];
  let currentGroup = [printedNodes[0]];
  let i = 1;
  for (; i < printedNodes.length; ++i) {
    if (printedNodes[i].node.type === "CallExpression") {
      currentGroup.push(printedNodes[i]);
    } else {
      break;
    }
  }
  for (; i + 1 < printedNodes.length; ++i) {
    if (
      printedNodes[i].node.type === "MemberExpression" &&
      printedNodes[i + 1].node.type === "MemberExpression"
    ) {
      currentGroup.push(printedNodes[i]);
    } else {
      break;
    }
  }
  groups.push(currentGroup);
  currentGroup = [];

  // Then, each following group is a sequence of MemberExpression followed by
  // a sequence of CallExpression. To compute it, we keep adding things to the
  // group until we has seen a CallExpression in the past and reach a
  // MemberExpression
  let hasSeenCallExpression = false;
  for (; i < printedNodes.length; ++i) {
    if (
      hasSeenCallExpression &&
      printedNodes[i].node.type === "MemberExpression"
    ) {
      // [0] should be appended at the end of the group instead of the
      // beginning of the next one
      if (printedNodes[i].node.computed) {
        currentGroup.push(printedNodes[i]);
        continue;
      }

      groups.push(currentGroup);
      currentGroup = [];
      hasSeenCallExpression = false;
    }

    if (printedNodes[i].node.type === "CallExpression") {
      hasSeenCallExpression = true;
    }
    currentGroup.push(printedNodes[i]);

    if (
      printedNodes[i].node.comments &&
      printedNodes[i].node.comments.some(comment => comment.trailing)
    ) {
      groups.push(currentGroup);
      currentGroup = [];
      hasSeenCallExpression = false;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // There are cases like Object.keys(), Observable.of(), _.values() where
  // they are the subject of all the chained calls and therefore should
  // be kept on the same line:
  //
  //   Object.keys(items)
  //     .filter(x => x)
  //     .map(x => x)
  //
  // In order to detect those cases, we use an heuristic: if the first
  // node is just an identifier with the name starting with a capital
  // letter, just a sequence of _$ or this. The rationale is that they are
  // likely to be factories.
  const shouldMerge =
    groups.length >= 2 &&
    !groups[1][0].node.comments &&
    groups[0].length === 1 &&
    (groups[0][0].node.type === "ThisExpression" ||
      (groups[0][0].node.type === "Identifier" &&
        groups[0][0].node.name.match(/(^[A-Z])|^[_$]+$/)));

  function printGroup(printedGroup) {
    return concat$2(printedGroup.map(tuple => tuple.printed));
  }

  function printIndentedGroup(groups) {
    if (groups.length === 0) {
      return "";
    }
    return indent$2(
      group$1(concat$2([hardline$2, join$2(hardline$2, groups.map(printGroup))]))
    );
  }

  const printedGroups = groups.map(printGroup);
  const oneLine = concat$2(printedGroups);

  const flatGroups = groups
    .slice(0, shouldMerge ? 3 : 2)
    .reduce((res, group) => res.concat(group), []);

  const hasComment =
    flatGroups.slice(1, -1).some(node => hasLeadingComment(node.node)) ||
    flatGroups.slice(0, -1).some(node => hasTrailingComment(node.node));

  // If we only have a single `.`, we shouldn't do anything fancy and just
  // render everything concatenated together.
  if (
    groups.length <= (shouldMerge ? 3 : 2) &&
    !hasComment &&
    // (a || b).map() should be break before .map() instead of ||
    groups[0][0].node.type !== "LogicalExpression"
  ) {
    return group$1(oneLine);
  }

  const expanded = concat$2([
    printGroup(groups[0]),
    shouldMerge ? concat$2(groups.slice(1, 2).map(printGroup)) : "",
    printIndentedGroup(groups.slice(shouldMerge ? 2 : 1))
  ]);

  // If there's a comment, we don't want to print in one line.
  if (hasComment) {
    return group$1(expanded);
  }

  // If any group but the last one has a hard line, we want to force expand
  // it. If the last group is a function it's okay to inline if it fits.
  if (printedGroups.slice(0, -1).some(willBreak)) {
    return group$1(expanded);
  }

  return concat$2([
    // We only need to check `oneLine` because if `expanded` is chosen
    // that means that the parent group has already been broken
    // naturally
    willBreak(oneLine) ? breakParent$2 : "",
    conditionalGroup$1([oneLine, expanded])
  ]);
}

function isEmptyJSXElement(node) {
  if (node.children.length === 0) {
    return true;
  }
  if (node.children.length > 1) {
    return false;
  }

  // if there is one child but it's just a newline, treat as empty
  const value = node.children[0].value;
  if (!/\S/.test(value) && /\n/.test(value)) {
    return true;
  } else {
    return false;
  }
}

// JSX Children are strange, mostly for two reasons:
// 1. JSX reads newlines into string values, instead of skipping them like JS
// 2. up to one whitespace between elements within a line is significant,
//    but not between lines.
//
// So for one thing, '\n' needs to be parsed out of string literals
// and turned into hardlines (with string boundaries otherwise using softline)
//
// For another, leading, trailing, and lone whitespace all need to
// turn themselves into the rather ugly `{' '}` when breaking.
//
// Finally we print JSX using the `fill` doc primitive.
// This requires that we give it an array of alternating
// content and whitespace elements.
// To ensure this we add dummy `""` content elements as needed.
function printJSXChildren(path, options, print, jsxWhitespace) {
  const n = path.getValue();
  const children = [];

  // using `map` instead of `each` because it provides `i`
  path.map((childPath, i) => {
    const child = childPath.getValue();
    if (isLiteral(child) && typeof child.value === "string") {
      const value = child.raw || child.extra.raw;

      // Contains a non-whitespace character
      if (/[^ \n\r\t]/.test(value)) {
        // treat each line of text as its own entity
        value.split(/(\r?\n\s*)/).forEach(textLine => {
          const newlines = textLine.match(/\n/g);
          if (newlines) {
            children.push("");
            children.push(hardline$2);

            // allow one extra newline
            if (newlines.length > 1) {
              children.push("");
              children.push(hardline$2);
            }
            return;
          }

          if (textLine.length === 0) {
            return;
          }

          const beginSpace = /^[ \n\r\t]+/.test(textLine);
          if (beginSpace) {
            children.push("");
            children.push(jsxWhitespace);
          }

          const stripped = textLine.replace(/^[ \n\r\t]+|[ \n\r\t]+$/g, "");
          // Split text into words separated by "line"s.
          stripped.split(/([ \n\r\t]+)/).forEach(word => {
            const space = /[ \n\r\t]+/.test(word);
            if (space) {
              children.push(line$1);
            } else {
              children.push(word);
            }
          });

          const endSpace = /[ \n\r\t]+$/.test(textLine);
          if (endSpace) {
            children.push(jsxWhitespace);
          } else {
            // Ideally this would be a `softline` to allow a break between
            // tags and text.
            // Unfortunately Facebook have a custom translation pipeline
            // (https://github.com/prettier/prettier/issues/1581#issuecomment-300975032)
            // that uses the JSX syntax, but does not follow the React whitespace
            // rules.
            // Ensuring that we never have a break between tags and text in JSX
            // will allow Facebook to adopt Prettier without too much of an
            // adverse effect on formatting algorithm.
            children.push("");
          }
        });
      } else if (/\n/.test(value)) {
        children.push("");
        children.push(hardline$2);

        // allow one extra newline
        if (value.match(/\n/g).length > 1) {
          children.push("");
          children.push(hardline$2);
        }
      } else if (/[ \n\r\t]/.test(value)) {
        // whitespace(s)-only without newlines,
        // eg; one or more spaces separating two elements
        for (let i = 0; i < value.length; ++i) {
          // Because fill expects alternating content and whitespace parts
          // we need to include an empty content part before each JSX
          // whitespace.
          children.push("");
          children.push(jsxWhitespace);
        }
      }
    } else {
      children.push(print(childPath));

      const next = n.children[i + 1];
      const followedByJSXElement = next && !isLiteral(next);
      if (followedByJSXElement) {
        children.push(softline$1);
      } else {
        // Ideally this would be a softline as well.
        // See the comment above about the Facebook translation pipeline as
        // to why this is an empty string.
        children.push("");
      }
    }
  }, "children");

  return children;
}

// JSX expands children from the inside-out, instead of the outside-in.
// This is both to break children before attributes,
// and to ensure that when children break, their parents do as well.
//
// Any element that is written without any newlines and fits on a single line
// is left that way.
// Not only that, any user-written-line containing multiple JSX siblings
// should also be kept on one line if possible,
// so each user-written-line is wrapped in its own group.
//
// Elements that contain newlines or don't fit on a single line (recursively)
// are fully-split, using hardline and shouldBreak: true.
//
// To support that case properly, all leading and trailing spaces
// are stripped from the list of children, and replaced with a single hardline.
function printJSXElement(path, options, print) {
  const n = path.getValue();

  // Turn <div></div> into <div />
  if (isEmptyJSXElement(n)) {
    n.openingElement.selfClosing = true;
    delete n.closingElement;
  }

  const openingLines = path.call(print, "openingElement");
  const closingLines = path.call(print, "closingElement");

  if (
    n.children.length === 1 &&
    n.children[0].type === "JSXExpressionContainer" &&
    (n.children[0].expression.type === "TemplateLiteral" ||
      n.children[0].expression.type === "TaggedTemplateExpression")
  ) {
    return concat$2([
      openingLines,
      concat$2(path.map(print, "children")),
      closingLines
    ]);
  }

  // If no children, just print the opening element
  if (n.openingElement.selfClosing) {
    assert$1.ok(!n.closingElement);
    return openingLines;
  }
  // Record any breaks. Should never go from true to false, only false to true.
  let forcedBreak = willBreak(openingLines);

  const rawJsxWhitespace = options.singleQuote ? "{' '}" : '{" "}';
  const jsxWhitespace = ifBreak$1(concat$2([softline$1, rawJsxWhitespace]), " ");

  const children = printJSXChildren(path, options, print, jsxWhitespace);

  // Remove multiple filler empty strings
  // These can occur when a text element is followed by a newline.
  for (let i = children.length - 2; i >= 0; i--) {
    if (children[i] === "" && children[i + 1] === "") {
      children.splice(i, 2);
    }
  }

  // Trim trailing lines (or empty strings), recording if there was a hardline
  let numTrailingHard = 0;
  while (
    children.length &&
    (isLineNext(util$4.getLast(children)) || isEmpty(util$4.getLast(children)))
  ) {
    if (willBreak(util$4.getLast(children))) {
      ++numTrailingHard;
      forcedBreak = true;
    }
    children.pop();
  }
  // allow one extra newline
  if (numTrailingHard > 1) {
    children.push("");
    children.push(hardline$2);
  }

  // Trim leading lines (or empty strings), recording if there was a hardline
  let numLeadingHard = 0;
  while (
    children.length &&
    (isLineNext(children[0]) || isEmpty(children[0])) &&
    (isLineNext(children[1]) || isEmpty(children[1]))
  ) {
    if (willBreak(children[0]) || willBreak(children[1])) {
      ++numLeadingHard;
      forcedBreak = true;
    }
    children.shift();
    children.shift();
  }
  // allow one extra newline
  if (numLeadingHard > 1) {
    children.unshift(hardline$2);
    children.unshift("");
  }

  // Tweak how we format children if outputting this element over multiple lines.
  // Also detect whether we will force this element to output over multiple lines.
  const multilineChildren = [];
  children.forEach((child, i) => {
    // Ensure that we display leading, trailing, and solitary whitespace as
    // `{" "}` when outputting this element over multiple lines.
    if (child === jsxWhitespace) {
      if (i === 1 && children[i - 1] === "") {
        multilineChildren.push(rawJsxWhitespace);
        return;
      } else if (i === children.length - 1) {
        multilineChildren.push(concat$2([hardline$2, rawJsxWhitespace]));
        return;
      } else if (willBreak(children[i - 1]) || willBreak(children[i + 1])) {
        // If we come before or after a JSX element that is multiline
        // ensure the JSX whitespace appears on a line by itself.
        // NOTE: Currently this only detects elements that are already
        // multiline before formatting!
        multilineChildren.push(concat$2([hardline$2, rawJsxWhitespace, hardline$2]));
        return;
      }
    }

    multilineChildren.push(child);

    if (willBreak(child)) {
      forcedBreak = true;
    }
  });

  const multiLineElem = group$1(
    concat$2([
      openingLines,
      indent$2(concat$2([hardline$2, fill$1(multilineChildren)])),
      hardline$2,
      closingLines
    ])
  );

  if (forcedBreak) {
    return multiLineElem;
  }

  return conditionalGroup$1([
    group$1(concat$2([openingLines, fill$1(children), closingLines])),
    multiLineElem
  ]);
}

function maybeWrapJSXElementInParens(path, elem) {
  const parent = path.getParentNode();
  if (!parent) {
    return elem;
  }

  const NO_WRAP_PARENTS = {
    ArrayExpression: true,
    JSXElement: true,
    JSXExpressionContainer: true,
    ExpressionStatement: true,
    CallExpression: true,
    ConditionalExpression: true,
    LogicalExpression: true,
    ArrowFunctionExpression: true
  };
  if (NO_WRAP_PARENTS[parent.type]) {
    return elem;
  }

  return group$1(
    concat$2([
      ifBreak$1("("),
      indent$2(concat$2([softline$1, elem])),
      softline$1,
      ifBreak$1(")")
    ])
  );
}

function isBinaryish(node) {
  return node.type === "BinaryExpression" || node.type === "LogicalExpression";
}

function shouldInlineLogicalExpression(node) {
  if (node.type !== "LogicalExpression") {
    return false;
  }

  if (
    node.right.type === "ObjectExpression" &&
    node.right.properties.length !== 0
  ) {
    return true;
  }

  if (
    node.right.type === "ArrayExpression" &&
    node.right.elements.length !== 0
  ) {
    return true;
  }

  return false;
}

// For binary expressions to be consistent, we need to group
// subsequent operators with the same precedence level under a single
// group. Otherwise they will be nested such that some of them break
// onto new lines but not all. Operators with the same precedence
// level should either all break or not. Because we group them by
// precedence level and the AST is structured based on precedence
// level, things are naturally broken up correctly, i.e. `&&` is
// broken before `+`.
function printBinaryishExpressions(
  path,
  print,
  options,
  isNested,
  isInsideParenthesis
) {
  let parts = [];
  const node = path.getValue();

  // We treat BinaryExpression and LogicalExpression nodes the same.
  if (isBinaryish(node)) {
    // Put all operators with the same precedence level in the same
    // group. The reason we only need to do this with the `left`
    // expression is because given an expression like `1 + 2 - 3`, it
    // is always parsed like `((1 + 2) - 3)`, meaning the `left` side
    // is where the rest of the expression will exist. Binary
    // expressions on the right side mean they have a difference
    // precedence level and should be treated as a separate group, so
    // print them normally. (This doesn't hold for the `**` operator,
    // which is unique in that it is right-associative.)
    if (
      util$4.getPrecedence(node.left.operator) ===
        util$4.getPrecedence(node.operator) &&
      node.operator !== "**"
    ) {
      // Flatten them out by recursively calling this function.
      parts = parts.concat(
        path.call(
          left =>
            printBinaryishExpressions(
              left,
              print,
              options,
              /* isNested */ true,
              isInsideParenthesis
            ),
          "left"
        )
      );
    } else {
      parts.push(path.call(print, "left"));
    }

    const right = concat$2([
      node.operator,
      shouldInlineLogicalExpression(node) ? " " : line$1,
      path.call(print, "right")
    ]);

    // If there's only a single binary expression, we want to create a group
    // in order to avoid having a small right part like -1 be on its own line.
    const parent = path.getParentNode();
    const shouldGroup =
      !(isInsideParenthesis && node.type === "LogicalExpression") &&
      parent.type !== node.type &&
      node.left.type !== node.type &&
      node.right.type !== node.type;

    parts.push(" ", shouldGroup ? group$1(right) : right);

    // The root comments are already printed, but we need to manually print
    // the other ones since we don't call the normal print on BinaryExpression,
    // only for the left and right parts
    if (isNested && node.comments) {
      parts = comments$3.printComments(path, () => concat$2(parts), options);
    }
  } else {
    // Our stopping case. Simply print the node normally.
    parts.push(path.call(print));
  }

  return parts;
}

function printAssignmentRight(rightNode, printedRight, canBreak, options) {
  if (hasLeadingOwnLineComment(options.originalText, rightNode)) {
    return indent$2(concat$2([hardline$2, printedRight]));
  }

  if (canBreak) {
    return indent$2(concat$2([line$1, printedRight]));
  }

  return concat$2([" ", printedRight]);
}

function printAssignment(
  leftNode,
  printedLeft,
  operator,
  rightNode,
  printedRight,
  options
) {
  if (!rightNode) {
    return printedLeft;
  }

  const canBreak =
    (isBinaryish(rightNode) && !shouldInlineLogicalExpression(rightNode)) ||
    ((leftNode.type === "Identifier" ||
      isStringLiteral(leftNode) ||
      leftNode.type === "MemberExpression") &&
      (isStringLiteral(rightNode) || isMemberExpressionChain(rightNode)));

  const printed = printAssignmentRight(
    rightNode,
    printedRight,
    canBreak,
    options
  );

  return group$1(concat$2([printedLeft, operator, printed]));
}

function adjustClause(node, clause, forceSpace) {
  if (node.type === "EmptyStatement") {
    return ";";
  }

  if (node.type === "BlockStatement" || forceSpace) {
    return concat$2([" ", clause]);
  }

  return indent$2(concat$2([line$1, clause]));
}

function nodeStr(node, options, isFlowDirectiveLiteral) {
  const raw = node.extra ? node.extra.raw : node.raw;
  // `rawContent` is the string exactly like it appeared in the input source
  // code, with its enclosing quote.
  const rawContent = raw.slice(1, -1);

  const double = { quote: '"', regex: /"/g };
  const single = { quote: "'", regex: /'/g };

  const preferred = options.singleQuote ? single : double;
  const alternate = preferred === single ? double : single;

  let shouldUseAlternateQuote = false;
  const isDirectiveLiteral =
    isFlowDirectiveLiteral || node.type === "DirectiveLiteral";
  let canChangeDirectiveQuotes = false;

  // If `rawContent` contains at least one of the quote preferred for enclosing
  // the string, we might want to enclose with the alternate quote instead, to
  // minimize the number of escaped quotes.
  // Also check for the alternate quote, to determine if we're allowed to swap
  // the quotes on a DirectiveLiteral.
  if (
    rawContent.includes(preferred.quote) ||
    rawContent.includes(alternate.quote)
  ) {
    const numPreferredQuotes = (rawContent.match(preferred.regex) || []).length;
    const numAlternateQuotes = (rawContent.match(alternate.regex) || []).length;

    shouldUseAlternateQuote = numPreferredQuotes > numAlternateQuotes;
  } else {
    canChangeDirectiveQuotes = true;
  }

  const enclosingQuote = shouldUseAlternateQuote
    ? alternate.quote
    : preferred.quote;

  // Directives are exact code unit sequences, which means that you can't
  // change the escape sequences they use.
  // See https://github.com/prettier/prettier/issues/1555
  // and https://tc39.github.io/ecma262/#directive-prologue
  if (isDirectiveLiteral) {
    if (canChangeDirectiveQuotes) {
      return enclosingQuote + rawContent + enclosingQuote;
    } else {
      return raw;
    }
  }

  // It might sound unnecessary to use `makeString` even if `node.raw` already
  // is enclosed with `enclosingQuote`, but it isn't. `node.raw` could contain
  // unnecessary escapes (such as in `"\'"`). Always using `makeString` makes
  // sure that we consistently output the minimum amount of escaped quotes.
  return makeString(rawContent, enclosingQuote);
}

function makeString(rawContent, enclosingQuote) {
  const otherQuote = enclosingQuote === '"' ? "'" : '"';

  // Matches _any_ escape and unescaped quotes (both single and double).
  const regex = /\\([\s\S])|(['"])/g;

  // Escape and unescape single and double quotes as needed to be able to
  // enclose `rawContent` with `enclosingQuote`.
  const newContent = rawContent.replace(regex, (match, escaped, quote) => {
    // If we matched an escape, and the escaped character is a quote of the
    // other type than we intend to enclose the string with, there's no need for
    // it to be escaped, so return it _without_ the backslash.
    if (escaped === otherQuote) {
      return escaped;
    }

    // If we matched an unescaped quote and it is of the _same_ type as we
    // intend to enclose the string with, it must be escaped, so return it with
    // a backslash.
    if (quote === enclosingQuote) {
      return "\\" + quote;
    }

    if (quote) {
      return quote;
    }

    // Unescape any unnecessarily escaped character.
    // Adapted from https://github.com/eslint/eslint/blob/de0b4ad7bd820ade41b1f606008bea68683dc11a/lib/rules/no-useless-escape.js#L27
    return /^[^\\nrvtbfux\r\n\u2028\u2029"'0-7]$/.test(escaped)
      ? escaped
      : "\\" + escaped;
  });

  return enclosingQuote + newContent + enclosingQuote;
}

function printRegex(node) {
  const flags = node.flags.split("").sort().join("");
  return `/${node.pattern}/${flags}`;
}

function printNumber(rawNumber) {
  return (
    rawNumber
      .toLowerCase()
      // Remove unnecessary plus and zeroes from scientific notation.
      .replace(/^([\d.]+e)(?:\+|(-))?0*(\d)/, "$1$2$3")
      // Remove unnecessary scientific notation (1e0).
      .replace(/^([\d.]+)e[+-]?0+$/, "$1")
      // Make sure numbers always start with a digit.
      .replace(/^\./, "0.")
      // Remove extraneous trailing decimal zeroes.
      .replace(/(\.\d+?)0+(?=e|$)/, "$1")
      // Remove trailing dot.
      .replace(/\.(?=e|$)/, "")
  );
}

function isLastStatement(path) {
  const parent = path.getParentNode();
  if (!parent) {
    return true;
  }
  const node = path.getValue();
  const body = parent.body.filter(stmt => stmt.type !== "EmptyStatement");
  return body && body[body.length - 1] === node;
}

function hasLeadingComment(node) {
  return node.comments && node.comments.some(comment => comment.leading);
}

function hasTrailingComment(node) {
  return node.comments && node.comments.some(comment => comment.trailing);
}

function hasLeadingOwnLineComment(text, node) {
  if (node.type === "JSXElement") {
    return false;
  }

  const res =
    node.comments &&
    node.comments.some(
      comment => comment.leading && util$4.hasNewline(text, util$4.locEnd(comment))
    );
  return res;
}

function hasNakedLeftSide(node) {
  return (
    node.type === "AssignmentExpression" ||
    node.type === "BinaryExpression" ||
    node.type === "LogicalExpression" ||
    node.type === "ConditionalExpression" ||
    node.type === "CallExpression" ||
    node.type === "MemberExpression" ||
    node.type === "SequenceExpression" ||
    node.type === "TaggedTemplateExpression" ||
    (node.type === "UpdateExpression" && !node.prefix)
  );
}

function getLeftSide(node) {
  if (node.expressions) {
    return node.expressions[0];
  }
  return (
    node.left ||
    node.test ||
    node.callee ||
    node.object ||
    node.tag ||
    node.argument ||
    node.expression
  );
}

function exprNeedsASIProtection(node) {
  // HACK: node.needsParens is added in `genericPrint()` for the sole purpose
  // of being used here. It'd be preferable to find a cleaner way to do this.
  const maybeASIProblem =
    node.needsParens ||
    node.type === "ParenthesizedExpression" ||
    node.type === "TypeCastExpression" ||
    (node.type === "ArrowFunctionExpression" &&
      !canPrintParamsWithoutParens(node)) ||
    node.type === "ArrayExpression" ||
    node.type === "ArrayPattern" ||
    (node.type === "UnaryExpression" &&
      node.prefix &&
      (node.operator === "+" || node.operator === "-")) ||
    node.type === "TemplateLiteral" ||
    node.type === "TemplateElement" ||
    node.type === "JSXElement" ||
    node.type === "BindExpression" ||
    node.type === "RegExpLiteral" ||
    (node.type === "Literal" && node.pattern) ||
    (node.type === "Literal" && node.regex);

  if (maybeASIProblem) {
    return true;
  }

  if (!hasNakedLeftSide(node)) {
    return false;
  }

  return exprNeedsASIProtection(getLeftSide(node));
}

function stmtNeedsASIProtection(path) {
  if (!path) {
    return false;
  }
  const node = path.getNode();

  if (node.type !== "ExpressionStatement") {
    return false;
  }

  return exprNeedsASIProtection(node.expression);
}

function classPropMayCauseASIProblems(path) {
  const node = path.getNode();

  if (node.type !== "ClassProperty") {
    return false;
  }

  const name = node.key && node.key.name;
  if (!name) {
    return false;
  }

  // this isn't actually possible yet with most parsers available today
  // so isn't properly tested yet.
  if (name === "static" || name === "get" || name === "set") {
    return true;
  }
}

function classChildNeedsASIProtection(node) {
  if (!node) {
    return;
  }

  if (!node.computed) {
    const name = node.key && node.key.name;
    if (name === "in" || name === "instanceof") {
      return true;
    }
  }
  switch (node.type) {
    case "ClassProperty":
    case "TSAbstractClassProperty":
      return node.computed;
    case "MethodDefinition": // Flow
    case "TSAbstractMethodDefinition": // TypeScript
    case "ClassMethod": {
      // Babylon
      const isAsync = node.value ? node.value.async : node.async;
      const isGenerator = node.value ? node.value.generator : node.generator;
      if (
        isAsync ||
        node.static ||
        node.kind === "get" ||
        node.kind === "set"
      ) {
        return false;
      }
      if (node.computed || isGenerator) {
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}

// This recurses the return argument, looking for the first token
// (the leftmost leaf node) and, if it (or its parents) has any
// leadingComments, returns true (so it can be wrapped in parens).
function returnArgumentHasLeadingComment(options, argument) {
  if (hasLeadingOwnLineComment(options.originalText, argument)) {
    return true;
  }

  if (hasNakedLeftSide(argument)) {
    let leftMost = argument;
    let newLeftMost;
    while ((newLeftMost = getLeftSide(leftMost))) {
      leftMost = newLeftMost;

      if (hasLeadingOwnLineComment(options.originalText, leftMost)) {
        return true;
      }
    }
  }

  return false;
}

function isMemberExpressionChain(node) {
  if (node.type !== "MemberExpression") {
    return false;
  }
  if (node.object.type === "Identifier") {
    return true;
  }
  return isMemberExpressionChain(node.object);
}

// Hack to differentiate between the following two which have the same ast
// type T = { method: () => void };
// type T = { method(): void };
function isObjectTypePropertyAFunction(node) {
  return (
    node.type === "ObjectTypeProperty" &&
    node.value.type === "FunctionTypeAnnotation" &&
    !node.static &&
    !isFunctionNotation(node)
  );
}

// TODO: This is a bad hack and we need a better way to distinguish between
// arrow functions and otherwise
function isFunctionNotation(node) {
  return isGetterOrSetter(node) || sameLocStart(node, node.value);
}

function isGetterOrSetter(node) {
  return node.kind === "get" || node.kind === "set";
}

function sameLocStart(nodeA, nodeB) {
  return util$4.locStart(nodeA) === util$4.locStart(nodeB);
}

// Hack to differentiate between the following two which have the same ast
// declare function f(a): void;
// var f: (a) => void;
function isTypeAnnotationAFunction(node) {
  return (
    node.type === "TypeAnnotation" &&
    node.typeAnnotation.type === "FunctionTypeAnnotation" &&
    !node.static &&
    !sameLocStart(node, node.typeAnnotation)
  );
}

function isNodeStartingWithDeclare(node, options) {
  if (!(options.parser === "flow" || options.parser === "typescript")) {
    return false;
  }
  return (
    options.originalText.slice(0, util$4.locStart(node)).match(/declare\s*$/) ||
    options.originalText
      .slice(node.range[0], node.range[1])
      .startsWith("declare ")
  );
}

function shouldHugType(node) {
  if (node.type === "ObjectTypeAnnotation") {
    return true;
  }

  if (node.type === "UnionTypeAnnotation" || node.type === "TSUnionType") {
    const count = node.types.filter(
      n =>
        n.type === "VoidTypeAnnotation" ||
        n.type === "TSVoidKeyword" ||
        n.type === "NullLiteralTypeAnnotation" ||
        (n.type === "Literal" && n.value === null)
    ).length;

    if (node.types.length - 1 === count) {
      return true;
    }
  }
  return false;
}

function shouldHugArguments(fun) {
  return (
    fun &&
    fun.params &&
    fun.params.length === 1 &&
    !fun.params[0].comments &&
    (fun.params[0].type === "ObjectPattern" ||
      (fun.params[0].type === "Identifier" &&
        fun.params[0].typeAnnotation &&
        fun.params[0].typeAnnotation.type === "TypeAnnotation" &&
        shouldHugType(fun.params[0].typeAnnotation.typeAnnotation)) ||
      (fun.params[0].type === "FunctionTypeParam" &&
        shouldHugType(fun.params[0].typeAnnotation))) &&
    !fun.rest
  );
}

function templateLiteralHasNewLines(template) {
  return template.quasis.some(quasi => quasi.value.raw.includes("\n"));
}

function isTemplateOnItsOwnLine(n, text) {
  return (
    ((n.type === "TemplateLiteral" && templateLiteralHasNewLines(n)) ||
      (n.type === "TaggedTemplateExpression" &&
        templateLiteralHasNewLines(n.quasi))) &&
    !util$4.hasNewline(text, util$4.locStart(n), { backwards: true })
  );
}

function printArrayItems(path, options, printPath, print) {
  const printedElements = [];
  let separatorParts = [];

  path.each(childPath => {
    printedElements.push(concat$2(separatorParts));
    printedElements.push(group$1(print(childPath)));

    separatorParts = [",", line$1];
    if (
      childPath.getValue() &&
      util$4.isNextLineEmpty(options.originalText, childPath.getValue())
    ) {
      separatorParts.push(softline$1);
    }
  }, printPath);

  return concat$2(printedElements);
}

function hasDanglingComments(node) {
  return (
    node.comments &&
    node.comments.some(comment => !comment.leading && !comment.trailing)
  );
}

function isLiteral(node) {
  return (
    node.type === "BooleanLiteral" ||
    node.type === "DirectiveLiteral" ||
    node.type === "Literal" ||
    node.type === "NullLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "RegExpLiteral" ||
    node.type === "StringLiteral" ||
    node.type === "TemplateLiteral" ||
    node.type === "TSTypeLiteral" ||
    node.type === "JSXText"
  );
}

function isStringLiteral(node) {
  return (
    node.type === "StringLiteral" ||
    (node.type === "Literal" && typeof node.value === "string")
  );
}

function removeLines(doc) {
  // Force this doc into flat mode by statically converting all
  // lines into spaces (or soft lines into nothing). Hard lines
  // should still output because there's too great of a chance
  // of breaking existing assumptions otherwise.
  return docUtils.mapDoc(doc, d => {
    if (d.type === "line" && !d.hard) {
      return d.soft ? "" : " ";
    } else if (d.type === "if-break") {
      return d.flatContents || "";
    }
    return d;
  });
}

function isObjectType(n) {
  return n.type === "ObjectTypeAnnotation" || n.type === "TSTypeLiteral";
}

function printAstToDoc$1(ast, options, addAlignmentSize) {
  addAlignmentSize = addAlignmentSize || 0;

  function printGenerically(path, args) {
    const node = path.getValue();
    const parent = path.getParentNode(0);
    // We let JSXElement print its comments itself because it adds () around
    // UnionTypeAnnotation has to align the child without the comments
    if (
      (node && node.type === "JSXElement") ||
      (parent &&
        (parent.type === "UnionTypeAnnotation" ||
          parent.type === "TSUnionType"))
    ) {
      return genericPrint(path, options, printGenerically, args);
    }

    return comments$3.printComments(
      path,
      p => genericPrint(p, options, printGenerically, args),
      options,
      args && args.needsSemi
    );
  }

  let doc = printGenerically(new FastPath(ast));
  if (addAlignmentSize > 0) {
    // Add a hardline to make the indents take effect
    // It should be removed in index.js format()
    doc = addAlignmentToDoc$1(
      removeLines(concat$2([hardline$2, doc])),
      addAlignmentSize,
      options.tabWidth
    );
  }
  docUtils.propagateBreaks(doc);
  return doc;
}

var printer = { printAstToDoc: printAstToDoc$1 };

const docBuilders$4 = docBuilders$1;
const concat$3 = docBuilders$4.concat;
const fill$2 = docBuilders$4.fill;
const cursor$2 = docBuilders$4.cursor;

const MODE_BREAK = 1;
const MODE_FLAT = 2;

function rootIndent() {
  return {
    indent: 0,
    align: {
      spaces: 0,
      tabs: 0
    }
  };
}

function makeIndent(ind) {
  return {
    indent: ind.indent + 1,
    align: ind.align
  };
}

function makeAlign(ind, n) {
  if (n === -Infinity) {
    return {
      indent: 0,
      align: {
        spaces: 0,
        tabs: 0
      }
    };
  }

  if (isNaN(n) && n.forceSpace) {
    return {
      indent: ind.indent,
      align: {
        spaces: ind.align.spaces,
        tabs: ind.align.tabs,
        forceSpace: ind.indent
      }
    };
  }

  return {
    indent: ind.indent,
    align: {
      spaces: ind.align.spaces + n,
      tabs: ind.align.tabs + (n ? 1 : 0)
    }
  };
}

function fits(next, restCommands, width, mustBeFlat) {
  let restIdx = restCommands.length;
  const cmds = [next];
  while (width >= 0) {
    if (cmds.length === 0) {
      if (restIdx === 0) {
        return true;
      } else {
        cmds.push(restCommands[restIdx - 1]);

        restIdx--;

        continue;
      }
    }

    const x = cmds.pop();
    const ind = x[0];
    const mode = x[1];
    const doc = x[2];

    if (typeof doc === "string") {
      width -= doc.length;
    } else {
      switch (doc.type) {
        case "concat":
          for (let i = doc.parts.length - 1; i >= 0; i--) {
            cmds.push([ind, mode, doc.parts[i]]);
          }

          break;
        case "indent":
          cmds.push([makeIndent(ind), mode, doc.contents]);

          break;
        case "align":
          cmds.push([makeAlign(ind, doc.n), mode, doc.contents]);

          break;
        case "group":
          if (mustBeFlat && doc.break) {
            return false;
          }
          cmds.push([ind, doc.break ? MODE_BREAK : mode, doc.contents]);

          break;
        case "fill":
          for (let i = doc.parts.length - 1; i >= 0; i--) {
            cmds.push([ind, mode, doc.parts[i]]);
          }

          break;
        case "if-break":
          if (mode === MODE_BREAK) {
            if (doc.breakContents) {
              cmds.push([ind, mode, doc.breakContents]);
            }
          }
          if (mode === MODE_FLAT) {
            if (doc.flatContents) {
              cmds.push([ind, mode, doc.flatContents]);
            }
          }

          break;
        case "line":
          switch (mode) {
            // fallthrough
            case MODE_FLAT:
              if (!doc.hard) {
                if (!doc.soft) {
                  width -= 1;
                }

                break;
              }
              return true;

            case MODE_BREAK:
              return true;
          }
          break;
      }
    }
  }
  return false;
}

function printDocToString$1(doc, options) {
  const width = options.printWidth;
  const newLine = options.newLine || "\n";
  let pos = 0;
  // cmds is basically a stack. We've turned a recursive call into a
  // while loop which is much faster. The while loop below adds new
  // cmds to the array instead of recursively calling `print`.
  const cmds = [[rootIndent(), MODE_BREAK, doc]];
  const out = [];
  let shouldRemeasure = false;
  let lineSuffix = [];

  while (cmds.length !== 0) {
    const x = cmds.pop();
    const ind = x[0];
    const mode = x[1];
    const doc = x[2];

    if (typeof doc === "string") {
      out.push(doc);

      pos += doc.length;
    } else {
      switch (doc.type) {
        case "cursor":
          out.push(cursor$2.placeholder);

          break;
        case "concat":
          for (let i = doc.parts.length - 1; i >= 0; i--) {
            cmds.push([ind, mode, doc.parts[i]]);
          }

          break;
        case "indent":
          cmds.push([makeIndent(ind), mode, doc.contents]);

          break;
        case "align":
          cmds.push([makeAlign(ind, doc.n), mode, doc.contents]);

          break;
        case "group":
          switch (mode) {
            case MODE_FLAT:
              if (!shouldRemeasure) {
                cmds.push([
                  ind,
                  doc.break ? MODE_BREAK : MODE_FLAT,
                  doc.contents
                ]);

                break;
              }
            // fallthrough

            case MODE_BREAK: {
              shouldRemeasure = false;

              const next = [ind, MODE_FLAT, doc.contents];
              const rem = width - pos;

              if (!doc.break && fits(next, cmds, rem)) {
                cmds.push(next);
              } else {
                // Expanded states are a rare case where a document
                // can manually provide multiple representations of
                // itself. It provides an array of documents
                // going from the least expanded (most flattened)
                // representation first to the most expanded. If a
                // group has these, we need to manually go through
                // these states and find the first one that fits.
                if (doc.expandedStates) {
                  const mostExpanded =
                    doc.expandedStates[doc.expandedStates.length - 1];

                  if (doc.break) {
                    cmds.push([ind, MODE_BREAK, mostExpanded]);

                    break;
                  } else {
                    for (let i = 1; i < doc.expandedStates.length + 1; i++) {
                      if (i >= doc.expandedStates.length) {
                        cmds.push([ind, MODE_BREAK, mostExpanded]);

                        break;
                      } else {
                        const state = doc.expandedStates[i];
                        const cmd = [ind, MODE_FLAT, state];

                        if (fits(cmd, cmds, rem)) {
                          cmds.push(cmd);

                          break;
                        }
                      }
                    }
                  }
                } else {
                  cmds.push([ind, MODE_BREAK, doc.contents]);
                }
              }

              break;
            }
          }
          break;
        // Fills each line with as much code as possible before moving to a new
        // line with the same indentation.
        //
        // Expects doc.parts to be an array of alternating content and
        // whitespace. The whitespace contains the linebreaks.
        //
        // For example:
        //   ["I", line, "love", line, "monkeys"]
        // or
        //   [{ type: group, ... }, softline, { type: group, ... }]
        //
        // It uses this parts structure to handle three main layout cases:
        // * The first two content items fit on the same line without
        //   breaking
        //   -> output the first content item and the whitespace "flat".
        // * Only the first content item fits on the line without breaking
        //   -> output the first content item "flat" and the whitespace with
        //   "break".
        // * Neither content item fits on the line without breaking
        //   -> output the first content item and the whitespace with "break".
        case "fill": {
          const rem = width - pos;

          const parts = doc.parts;
          if (parts.length === 0) {
            break;
          }

          const content = parts[0];
          const contentFlatCmd = [ind, MODE_FLAT, content];
          const contentBreakCmd = [ind, MODE_BREAK, content];
          const contentFits = fits(contentFlatCmd, [], width - rem, true);

          if (parts.length === 1) {
            if (contentFits) {
              cmds.push(contentFlatCmd);
            } else {
              cmds.push(contentBreakCmd);
            }
            break;
          }

          const whitespace = parts[1];
          const whitespaceFlatCmd = [ind, MODE_FLAT, whitespace];
          const whitespaceBreakCmd = [ind, MODE_BREAK, whitespace];

          if (parts.length === 2) {
            if (contentFits) {
              cmds.push(whitespaceFlatCmd);
              cmds.push(contentFlatCmd);
            } else {
              cmds.push(whitespaceBreakCmd);
              cmds.push(contentBreakCmd);
            }
            break;
          }

          const remaining = parts.slice(2);
          const remainingCmd = [ind, mode, fill$2(remaining)];

          const secondContent = parts[2];
          const firstAndSecondContentFlatCmd = [
            ind,
            MODE_FLAT,
            concat$3([content, whitespace, secondContent])
          ];
          const firstAndSecondContentFits = fits(
            firstAndSecondContentFlatCmd,
            [],
            rem,
            true
          );

          if (firstAndSecondContentFits) {
            cmds.push(remainingCmd);
            cmds.push(whitespaceFlatCmd);
            cmds.push(contentFlatCmd);
          } else if (contentFits) {
            cmds.push(remainingCmd);
            cmds.push(whitespaceBreakCmd);
            cmds.push(contentFlatCmd);
          } else {
            cmds.push(remainingCmd);
            cmds.push(whitespaceBreakCmd);
            cmds.push(contentBreakCmd);
          }
          break;
        }
        case "if-break":
          if (mode === MODE_BREAK) {
            if (doc.breakContents) {
              cmds.push([ind, mode, doc.breakContents]);
            }
          }
          if (mode === MODE_FLAT) {
            if (doc.flatContents) {
              cmds.push([ind, mode, doc.flatContents]);
            }
          }

          break;
        case "line-suffix":
          lineSuffix.push([ind, mode, doc.contents]);
          break;
        case "line-suffix-boundary":
          if (lineSuffix.length > 0) {
            cmds.push([ind, mode, { type: "line", hard: true }]);
          }
          break;
        case "line":
          switch (mode) {
            case MODE_FLAT:
              if (!doc.hard) {
                if (!doc.soft) {
                  out.push(" ");

                  pos += 1;
                }

                break;
              } else {
                // This line was forced into the output even if we
                // were in flattened mode, so we need to tell the next
                // group that no matter what, it needs to remeasure
                // because the previous measurement didn't accurately
                // capture the entire expression (this is necessary
                // for nested groups)
                shouldRemeasure = true;
              }
            // fallthrough

            case MODE_BREAK:
              if (lineSuffix.length) {
                cmds.push([ind, mode, doc]);
                [].push.apply(cmds, lineSuffix.reverse());
                lineSuffix = [];
                break;
              }

              if (doc.literal) {
                out.push(newLine);
                pos = 0;
              } else {
                if (out.length > 0) {
                  // Trim whitespace at the end of line
                  while (
                    out.length > 0 &&
                    out[out.length - 1].match(/^[^\S\n]*$/)
                  ) {
                    out.pop();
                  }

                  if (out.length) {
                    out[out.length - 1] = out[out.length - 1].replace(
                      /[^\S\n]*$/,
                      ""
                    );
                  }
                }

                const length = ind.indent * options.tabWidth + ind.align.spaces;
                let indentString = options.useTabs
                  ? "\t".repeat(ind.indent + ind.align.tabs)
                  : " ".repeat(length);

                if (ind.align.forceSpace !== undefined && ind.align.forceSpace === ind.indent) {
                  indentString += " ";
                }

                out.push(newLine + indentString);
                pos = length;
              }
              break;
          }
          break;
        default:
      }
    }
  }

  const cursorPlaceholderIndex = out.indexOf(cursor$2.placeholder);
  if (cursorPlaceholderIndex !== -1) {
    const beforeCursor = out.slice(0, cursorPlaceholderIndex).join("");
    const afterCursor = out.slice(cursorPlaceholderIndex + 1).join("");

    return {
      formatted: beforeCursor + afterCursor,
      cursor: beforeCursor.length
    };
  }

  return { formatted: out.join("") };
}

var docPrinter = { printDocToString: printDocToString$1 };

var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

var index$6 = function (str) {
	if (typeof str !== 'string') {
		throw new TypeError('Expected a string');
	}

	return str.replace(matchOperatorsRe, '\\$&');
};

var index$8 = createCommonjsModule(function (module) {
'use strict';

function assembleStyles () {
	var styles = {
		modifiers: {
			reset: [0, 0],
			bold: [1, 22], // 21 isn't widely supported and 22 does the same thing
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29]
		},
		colors: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],
			gray: [90, 39]
		},
		bgColors: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49]
		}
	};

	// fix humans
	styles.colors.grey = styles.colors.gray;

	Object.keys(styles).forEach(function (groupName) {
		var group = styles[groupName];

		Object.keys(group).forEach(function (styleName) {
			var style = group[styleName];

			styles[styleName] = group[styleName] = {
				open: '\u001b[' + style[0] + 'm',
				close: '\u001b[' + style[1] + 'm'
			};
		});

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false
		});
	});

	return styles;
}

Object.defineProperty(module, 'exports', {
	enumerable: true,
	get: assembleStyles
});
});

var index$12 = function () {
	return /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]/g;
};

var ansiRegex = index$12();

var index$10 = function (str) {
	return typeof str === 'string' ? str.replace(ansiRegex, '') : str;
};

var ansiRegex$1 = index$12;
var re = new RegExp(ansiRegex$1().source); // remove the `g` flag
var index$14 = re.test.bind(re);

var argv = process.argv;

var terminator = argv.indexOf('--');
var hasFlag = function (flag) {
	flag = '--' + flag;
	var pos = argv.indexOf(flag);
	return pos !== -1 && (terminator !== -1 ? pos < terminator : true);
};

var index$16 = (function () {
	if ('FORCE_COLOR' in process.env) {
		return true;
	}

	if (hasFlag('no-color') ||
		hasFlag('no-colors') ||
		hasFlag('color=false')) {
		return false;
	}

	if (hasFlag('color') ||
		hasFlag('colors') ||
		hasFlag('color=true') ||
		hasFlag('color=always')) {
		return true;
	}

	if (process.stdout && !process.stdout.isTTY) {
		return false;
	}

	if (process.platform === 'win32') {
		return true;
	}

	if ('COLORTERM' in process.env) {
		return true;
	}

	if (process.env.TERM === 'dumb') {
		return false;
	}

	if (/^screen|^xterm|^vt100|color|ansi|cygwin|linux/i.test(process.env.TERM)) {
		return true;
	}

	return false;
})();

var escapeStringRegexp = index$6;
var ansiStyles = index$8;
var stripAnsi = index$10;
var hasAnsi = index$14;
var supportsColor = index$16;
var defineProps = Object.defineProperties;
var isSimpleWindowsTerm = process.platform === 'win32' && !/^xterm/i.test(process.env.TERM);

function Chalk(options) {
	// detect mode if not set manually
	this.enabled = !options || options.enabled === undefined ? supportsColor : options.enabled;
}

// use bright blue on Windows as the normal blue color is illegible
if (isSimpleWindowsTerm) {
	ansiStyles.blue.open = '\u001b[94m';
}

var styles = (function () {
	var ret = {};

	Object.keys(ansiStyles).forEach(function (key) {
		ansiStyles[key].closeRe = new RegExp(escapeStringRegexp(ansiStyles[key].close), 'g');

		ret[key] = {
			get: function () {
				return build.call(this, this._styles.concat(key));
			}
		};
	});

	return ret;
})();

var proto = defineProps(function chalk() {}, styles);

function build(_styles) {
	var builder = function () {
		return applyStyle.apply(builder, arguments);
	};

	builder._styles = _styles;
	builder.enabled = this.enabled;
	// __proto__ is used because we must return a function, but there is
	// no way to create a function with a different prototype.
	/* eslint-disable no-proto */
	builder.__proto__ = proto;

	return builder;
}

function applyStyle() {
	// support varags, but simply cast to string in case there's only one arg
	var args = arguments;
	var argsLen = args.length;
	var str = argsLen !== 0 && String(arguments[0]);

	if (argsLen > 1) {
		// don't slice `arguments`, it prevents v8 optimizations
		for (var a = 1; a < argsLen; a++) {
			str += ' ' + args[a];
		}
	}

	if (!this.enabled || !str) {
		return str;
	}

	var nestedStyles = this._styles;
	var i = nestedStyles.length;

	// Turns out that on Windows dimmed gray text becomes invisible in cmd.exe,
	// see https://github.com/chalk/chalk/issues/58
	// If we're on Windows and we're dealing with a gray color, temporarily make 'dim' a noop.
	var originalDim = ansiStyles.dim.open;
	if (isSimpleWindowsTerm && (nestedStyles.indexOf('gray') !== -1 || nestedStyles.indexOf('grey') !== -1)) {
		ansiStyles.dim.open = '';
	}

	while (i--) {
		var code = ansiStyles[nestedStyles[i]];

		// Replace any instances already present with a re-opening code
		// otherwise only the part of the string until said closing code
		// will be colored, and the rest will simply be 'plain'.
		str = code.open + str.replace(code.closeRe, code.open) + code.close;
	}

	// Reset the original 'dim' if we changed it to work around the Windows dimmed gray issue.
	ansiStyles.dim.open = originalDim;

	return str;
}

function init() {
	var ret = {};

	Object.keys(styles).forEach(function (name) {
		ret[name] = {
			get: function () {
				return build.call(this, [name]);
			}
		};
	});

	return ret;
}

defineProps(Chalk.prototype, init());

var index$4 = new Chalk();
var styles_1 = ansiStyles;
var hasColor = hasAnsi;
var stripColor = stripAnsi;
var supportsColor_1 = supportsColor;

index$4.styles = styles_1;
index$4.hasColor = hasColor;
index$4.stripColor = stripColor;
index$4.supportsColor = supportsColor_1;

var index$26 = {
	"aliceblue": [240, 248, 255],
	"antiquewhite": [250, 235, 215],
	"aqua": [0, 255, 255],
	"aquamarine": [127, 255, 212],
	"azure": [240, 255, 255],
	"beige": [245, 245, 220],
	"bisque": [255, 228, 196],
	"black": [0, 0, 0],
	"blanchedalmond": [255, 235, 205],
	"blue": [0, 0, 255],
	"blueviolet": [138, 43, 226],
	"brown": [165, 42, 42],
	"burlywood": [222, 184, 135],
	"cadetblue": [95, 158, 160],
	"chartreuse": [127, 255, 0],
	"chocolate": [210, 105, 30],
	"coral": [255, 127, 80],
	"cornflowerblue": [100, 149, 237],
	"cornsilk": [255, 248, 220],
	"crimson": [220, 20, 60],
	"cyan": [0, 255, 255],
	"darkblue": [0, 0, 139],
	"darkcyan": [0, 139, 139],
	"darkgoldenrod": [184, 134, 11],
	"darkgray": [169, 169, 169],
	"darkgreen": [0, 100, 0],
	"darkgrey": [169, 169, 169],
	"darkkhaki": [189, 183, 107],
	"darkmagenta": [139, 0, 139],
	"darkolivegreen": [85, 107, 47],
	"darkorange": [255, 140, 0],
	"darkorchid": [153, 50, 204],
	"darkred": [139, 0, 0],
	"darksalmon": [233, 150, 122],
	"darkseagreen": [143, 188, 143],
	"darkslateblue": [72, 61, 139],
	"darkslategray": [47, 79, 79],
	"darkslategrey": [47, 79, 79],
	"darkturquoise": [0, 206, 209],
	"darkviolet": [148, 0, 211],
	"deeppink": [255, 20, 147],
	"deepskyblue": [0, 191, 255],
	"dimgray": [105, 105, 105],
	"dimgrey": [105, 105, 105],
	"dodgerblue": [30, 144, 255],
	"firebrick": [178, 34, 34],
	"floralwhite": [255, 250, 240],
	"forestgreen": [34, 139, 34],
	"fuchsia": [255, 0, 255],
	"gainsboro": [220, 220, 220],
	"ghostwhite": [248, 248, 255],
	"gold": [255, 215, 0],
	"goldenrod": [218, 165, 32],
	"gray": [128, 128, 128],
	"green": [0, 128, 0],
	"greenyellow": [173, 255, 47],
	"grey": [128, 128, 128],
	"honeydew": [240, 255, 240],
	"hotpink": [255, 105, 180],
	"indianred": [205, 92, 92],
	"indigo": [75, 0, 130],
	"ivory": [255, 255, 240],
	"khaki": [240, 230, 140],
	"lavender": [230, 230, 250],
	"lavenderblush": [255, 240, 245],
	"lawngreen": [124, 252, 0],
	"lemonchiffon": [255, 250, 205],
	"lightblue": [173, 216, 230],
	"lightcoral": [240, 128, 128],
	"lightcyan": [224, 255, 255],
	"lightgoldenrodyellow": [250, 250, 210],
	"lightgray": [211, 211, 211],
	"lightgreen": [144, 238, 144],
	"lightgrey": [211, 211, 211],
	"lightpink": [255, 182, 193],
	"lightsalmon": [255, 160, 122],
	"lightseagreen": [32, 178, 170],
	"lightskyblue": [135, 206, 250],
	"lightslategray": [119, 136, 153],
	"lightslategrey": [119, 136, 153],
	"lightsteelblue": [176, 196, 222],
	"lightyellow": [255, 255, 224],
	"lime": [0, 255, 0],
	"limegreen": [50, 205, 50],
	"linen": [250, 240, 230],
	"magenta": [255, 0, 255],
	"maroon": [128, 0, 0],
	"mediumaquamarine": [102, 205, 170],
	"mediumblue": [0, 0, 205],
	"mediumorchid": [186, 85, 211],
	"mediumpurple": [147, 112, 219],
	"mediumseagreen": [60, 179, 113],
	"mediumslateblue": [123, 104, 238],
	"mediumspringgreen": [0, 250, 154],
	"mediumturquoise": [72, 209, 204],
	"mediumvioletred": [199, 21, 133],
	"midnightblue": [25, 25, 112],
	"mintcream": [245, 255, 250],
	"mistyrose": [255, 228, 225],
	"moccasin": [255, 228, 181],
	"navajowhite": [255, 222, 173],
	"navy": [0, 0, 128],
	"oldlace": [253, 245, 230],
	"olive": [128, 128, 0],
	"olivedrab": [107, 142, 35],
	"orange": [255, 165, 0],
	"orangered": [255, 69, 0],
	"orchid": [218, 112, 214],
	"palegoldenrod": [238, 232, 170],
	"palegreen": [152, 251, 152],
	"paleturquoise": [175, 238, 238],
	"palevioletred": [219, 112, 147],
	"papayawhip": [255, 239, 213],
	"peachpuff": [255, 218, 185],
	"peru": [205, 133, 63],
	"pink": [255, 192, 203],
	"plum": [221, 160, 221],
	"powderblue": [176, 224, 230],
	"purple": [128, 0, 128],
	"rebeccapurple": [102, 51, 153],
	"red": [255, 0, 0],
	"rosybrown": [188, 143, 143],
	"royalblue": [65, 105, 225],
	"saddlebrown": [139, 69, 19],
	"salmon": [250, 128, 114],
	"sandybrown": [244, 164, 96],
	"seagreen": [46, 139, 87],
	"seashell": [255, 245, 238],
	"sienna": [160, 82, 45],
	"silver": [192, 192, 192],
	"skyblue": [135, 206, 235],
	"slateblue": [106, 90, 205],
	"slategray": [112, 128, 144],
	"slategrey": [112, 128, 144],
	"snow": [255, 250, 250],
	"springgreen": [0, 255, 127],
	"steelblue": [70, 130, 180],
	"tan": [210, 180, 140],
	"teal": [0, 128, 128],
	"thistle": [216, 191, 216],
	"tomato": [255, 99, 71],
	"turquoise": [64, 224, 208],
	"violet": [238, 130, 238],
	"wheat": [245, 222, 179],
	"white": [255, 255, 255],
	"whitesmoke": [245, 245, 245],
	"yellow": [255, 255, 0],
	"yellowgreen": [154, 205, 50]
};

var conversions$1 = createCommonjsModule(function (module) {
/* MIT license */
var cssKeywords = index$26;

// NOTE: conversions should only return primitive values (i.e. arrays, or
//       values that give correct `typeof` results).
//       do not use box values types (i.e. Number(), String(), etc.)

var reverseKeywords = {};
for (var key in cssKeywords) {
	if (cssKeywords.hasOwnProperty(key)) {
		reverseKeywords[cssKeywords[key]] = key;
	}
}

var convert = module.exports = {
	rgb: {channels: 3, labels: 'rgb'},
	hsl: {channels: 3, labels: 'hsl'},
	hsv: {channels: 3, labels: 'hsv'},
	hwb: {channels: 3, labels: 'hwb'},
	cmyk: {channels: 4, labels: 'cmyk'},
	xyz: {channels: 3, labels: 'xyz'},
	lab: {channels: 3, labels: 'lab'},
	lch: {channels: 3, labels: 'lch'},
	hex: {channels: 1, labels: ['hex']},
	keyword: {channels: 1, labels: ['keyword']},
	ansi16: {channels: 1, labels: ['ansi16']},
	ansi256: {channels: 1, labels: ['ansi256']},
	hcg: {channels: 3, labels: ['h', 'c', 'g']},
	apple: {channels: 3, labels: ['r16', 'g16', 'b16']},
	gray: {channels: 1, labels: ['gray']}
};

// hide .channels and .labels properties
for (var model in convert) {
	if (convert.hasOwnProperty(model)) {
		if (!('channels' in convert[model])) {
			throw new Error('missing channels property: ' + model);
		}

		if (!('labels' in convert[model])) {
			throw new Error('missing channel labels property: ' + model);
		}

		if (convert[model].labels.length !== convert[model].channels) {
			throw new Error('channel and label counts mismatch: ' + model);
		}

		var channels = convert[model].channels;
		var labels = convert[model].labels;
		delete convert[model].channels;
		delete convert[model].labels;
		Object.defineProperty(convert[model], 'channels', {value: channels});
		Object.defineProperty(convert[model], 'labels', {value: labels});
	}
}

convert.rgb.hsl = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;
	var min = Math.min(r, g, b);
	var max = Math.max(r, g, b);
	var delta = max - min;
	var h;
	var s;
	var l;

	if (max === min) {
		h = 0;
	} else if (r === max) {
		h = (g - b) / delta;
	} else if (g === max) {
		h = 2 + (b - r) / delta;
	} else if (b === max) {
		h = 4 + (r - g) / delta;
	}

	h = Math.min(h * 60, 360);

	if (h < 0) {
		h += 360;
	}

	l = (min + max) / 2;

	if (max === min) {
		s = 0;
	} else if (l <= 0.5) {
		s = delta / (max + min);
	} else {
		s = delta / (2 - max - min);
	}

	return [h, s * 100, l * 100];
};

convert.rgb.hsv = function (rgb) {
	var r = rgb[0];
	var g = rgb[1];
	var b = rgb[2];
	var min = Math.min(r, g, b);
	var max = Math.max(r, g, b);
	var delta = max - min;
	var h;
	var s;
	var v;

	if (max === 0) {
		s = 0;
	} else {
		s = (delta / max * 1000) / 10;
	}

	if (max === min) {
		h = 0;
	} else if (r === max) {
		h = (g - b) / delta;
	} else if (g === max) {
		h = 2 + (b - r) / delta;
	} else if (b === max) {
		h = 4 + (r - g) / delta;
	}

	h = Math.min(h * 60, 360);

	if (h < 0) {
		h += 360;
	}

	v = ((max / 255) * 1000) / 10;

	return [h, s, v];
};

convert.rgb.hwb = function (rgb) {
	var r = rgb[0];
	var g = rgb[1];
	var b = rgb[2];
	var h = convert.rgb.hsl(rgb)[0];
	var w = 1 / 255 * Math.min(r, Math.min(g, b));

	b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));

	return [h, w * 100, b * 100];
};

convert.rgb.cmyk = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;
	var c;
	var m;
	var y;
	var k;

	k = Math.min(1 - r, 1 - g, 1 - b);
	c = (1 - r - k) / (1 - k) || 0;
	m = (1 - g - k) / (1 - k) || 0;
	y = (1 - b - k) / (1 - k) || 0;

	return [c * 100, m * 100, y * 100, k * 100];
};

/**
 * See https://en.m.wikipedia.org/wiki/Euclidean_distance#Squared_Euclidean_distance
 * */
function comparativeDistance(x, y) {
	return (
		Math.pow(x[0] - y[0], 2) +
		Math.pow(x[1] - y[1], 2) +
		Math.pow(x[2] - y[2], 2)
	);
}

convert.rgb.keyword = function (rgb) {
	var reversed = reverseKeywords[rgb];
	if (reversed) {
		return reversed;
	}

	var currentClosestDistance = Infinity;
	var currentClosestKeyword;

	for (var keyword in cssKeywords) {
		if (cssKeywords.hasOwnProperty(keyword)) {
			var value = cssKeywords[keyword];

			// Compute comparative distance
			var distance = comparativeDistance(rgb, value);

			// Check if its less, if so set as closest
			if (distance < currentClosestDistance) {
				currentClosestDistance = distance;
				currentClosestKeyword = keyword;
			}
		}
	}

	return currentClosestKeyword;
};

convert.keyword.rgb = function (keyword) {
	return cssKeywords[keyword];
};

convert.rgb.xyz = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;

	// assume sRGB
	r = r > 0.04045 ? Math.pow(((r + 0.055) / 1.055), 2.4) : (r / 12.92);
	g = g > 0.04045 ? Math.pow(((g + 0.055) / 1.055), 2.4) : (g / 12.92);
	b = b > 0.04045 ? Math.pow(((b + 0.055) / 1.055), 2.4) : (b / 12.92);

	var x = (r * 0.4124) + (g * 0.3576) + (b * 0.1805);
	var y = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
	var z = (r * 0.0193) + (g * 0.1192) + (b * 0.9505);

	return [x * 100, y * 100, z * 100];
};

convert.rgb.lab = function (rgb) {
	var xyz = convert.rgb.xyz(rgb);
	var x = xyz[0];
	var y = xyz[1];
	var z = xyz[2];
	var l;
	var a;
	var b;

	x /= 95.047;
	y /= 100;
	z /= 108.883;

	x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
	y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
	z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

	l = (116 * y) - 16;
	a = 500 * (x - y);
	b = 200 * (y - z);

	return [l, a, b];
};

convert.hsl.rgb = function (hsl) {
	var h = hsl[0] / 360;
	var s = hsl[1] / 100;
	var l = hsl[2] / 100;
	var t1;
	var t2;
	var t3;
	var rgb;
	var val;

	if (s === 0) {
		val = l * 255;
		return [val, val, val];
	}

	if (l < 0.5) {
		t2 = l * (1 + s);
	} else {
		t2 = l + s - l * s;
	}

	t1 = 2 * l - t2;

	rgb = [0, 0, 0];
	for (var i = 0; i < 3; i++) {
		t3 = h + 1 / 3 * -(i - 1);
		if (t3 < 0) {
			t3++;
		}
		if (t3 > 1) {
			t3--;
		}

		if (6 * t3 < 1) {
			val = t1 + (t2 - t1) * 6 * t3;
		} else if (2 * t3 < 1) {
			val = t2;
		} else if (3 * t3 < 2) {
			val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
		} else {
			val = t1;
		}

		rgb[i] = val * 255;
	}

	return rgb;
};

convert.hsl.hsv = function (hsl) {
	var h = hsl[0];
	var s = hsl[1] / 100;
	var l = hsl[2] / 100;
	var smin = s;
	var lmin = Math.max(l, 0.01);
	var sv;
	var v;

	l *= 2;
	s *= (l <= 1) ? l : 2 - l;
	smin *= lmin <= 1 ? lmin : 2 - lmin;
	v = (l + s) / 2;
	sv = l === 0 ? (2 * smin) / (lmin + smin) : (2 * s) / (l + s);

	return [h, sv * 100, v * 100];
};

convert.hsv.rgb = function (hsv) {
	var h = hsv[0] / 60;
	var s = hsv[1] / 100;
	var v = hsv[2] / 100;
	var hi = Math.floor(h) % 6;

	var f = h - Math.floor(h);
	var p = 255 * v * (1 - s);
	var q = 255 * v * (1 - (s * f));
	var t = 255 * v * (1 - (s * (1 - f)));
	v *= 255;

	switch (hi) {
		case 0:
			return [v, t, p];
		case 1:
			return [q, v, p];
		case 2:
			return [p, v, t];
		case 3:
			return [p, q, v];
		case 4:
			return [t, p, v];
		case 5:
			return [v, p, q];
	}
};

convert.hsv.hsl = function (hsv) {
	var h = hsv[0];
	var s = hsv[1] / 100;
	var v = hsv[2] / 100;
	var vmin = Math.max(v, 0.01);
	var lmin;
	var sl;
	var l;

	l = (2 - s) * v;
	lmin = (2 - s) * vmin;
	sl = s * vmin;
	sl /= (lmin <= 1) ? lmin : 2 - lmin;
	sl = sl || 0;
	l /= 2;

	return [h, sl * 100, l * 100];
};

// http://dev.w3.org/csswg/css-color/#hwb-to-rgb
convert.hwb.rgb = function (hwb) {
	var h = hwb[0] / 360;
	var wh = hwb[1] / 100;
	var bl = hwb[2] / 100;
	var ratio = wh + bl;
	var i;
	var v;
	var f;
	var n;

	// wh + bl cant be > 1
	if (ratio > 1) {
		wh /= ratio;
		bl /= ratio;
	}

	i = Math.floor(6 * h);
	v = 1 - bl;
	f = 6 * h - i;

	if ((i & 0x01) !== 0) {
		f = 1 - f;
	}

	n = wh + f * (v - wh); // linear interpolation

	var r;
	var g;
	var b;
	switch (i) {
		default:
		case 6:
		case 0: r = v; g = n; b = wh; break;
		case 1: r = n; g = v; b = wh; break;
		case 2: r = wh; g = v; b = n; break;
		case 3: r = wh; g = n; b = v; break;
		case 4: r = n; g = wh; b = v; break;
		case 5: r = v; g = wh; b = n; break;
	}

	return [r * 255, g * 255, b * 255];
};

convert.cmyk.rgb = function (cmyk) {
	var c = cmyk[0] / 100;
	var m = cmyk[1] / 100;
	var y = cmyk[2] / 100;
	var k = cmyk[3] / 100;
	var r;
	var g;
	var b;

	r = 1 - Math.min(1, c * (1 - k) + k);
	g = 1 - Math.min(1, m * (1 - k) + k);
	b = 1 - Math.min(1, y * (1 - k) + k);

	return [r * 255, g * 255, b * 255];
};

convert.xyz.rgb = function (xyz) {
	var x = xyz[0] / 100;
	var y = xyz[1] / 100;
	var z = xyz[2] / 100;
	var r;
	var g;
	var b;

	r = (x * 3.2406) + (y * -1.5372) + (z * -0.4986);
	g = (x * -0.9689) + (y * 1.8758) + (z * 0.0415);
	b = (x * 0.0557) + (y * -0.2040) + (z * 1.0570);

	// assume sRGB
	r = r > 0.0031308
		? ((1.055 * Math.pow(r, 1.0 / 2.4)) - 0.055)
		: r * 12.92;

	g = g > 0.0031308
		? ((1.055 * Math.pow(g, 1.0 / 2.4)) - 0.055)
		: g * 12.92;

	b = b > 0.0031308
		? ((1.055 * Math.pow(b, 1.0 / 2.4)) - 0.055)
		: b * 12.92;

	r = Math.min(Math.max(0, r), 1);
	g = Math.min(Math.max(0, g), 1);
	b = Math.min(Math.max(0, b), 1);

	return [r * 255, g * 255, b * 255];
};

convert.xyz.lab = function (xyz) {
	var x = xyz[0];
	var y = xyz[1];
	var z = xyz[2];
	var l;
	var a;
	var b;

	x /= 95.047;
	y /= 100;
	z /= 108.883;

	x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
	y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
	z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

	l = (116 * y) - 16;
	a = 500 * (x - y);
	b = 200 * (y - z);

	return [l, a, b];
};

convert.lab.xyz = function (lab) {
	var l = lab[0];
	var a = lab[1];
	var b = lab[2];
	var x;
	var y;
	var z;

	y = (l + 16) / 116;
	x = a / 500 + y;
	z = y - b / 200;

	var y2 = Math.pow(y, 3);
	var x2 = Math.pow(x, 3);
	var z2 = Math.pow(z, 3);
	y = y2 > 0.008856 ? y2 : (y - 16 / 116) / 7.787;
	x = x2 > 0.008856 ? x2 : (x - 16 / 116) / 7.787;
	z = z2 > 0.008856 ? z2 : (z - 16 / 116) / 7.787;

	x *= 95.047;
	y *= 100;
	z *= 108.883;

	return [x, y, z];
};

convert.lab.lch = function (lab) {
	var l = lab[0];
	var a = lab[1];
	var b = lab[2];
	var hr;
	var h;
	var c;

	hr = Math.atan2(b, a);
	h = hr * 360 / 2 / Math.PI;

	if (h < 0) {
		h += 360;
	}

	c = Math.sqrt(a * a + b * b);

	return [l, c, h];
};

convert.lch.lab = function (lch) {
	var l = lch[0];
	var c = lch[1];
	var h = lch[2];
	var a;
	var b;
	var hr;

	hr = h / 360 * 2 * Math.PI;
	a = c * Math.cos(hr);
	b = c * Math.sin(hr);

	return [l, a, b];
};

convert.rgb.ansi16 = function (args) {
	var r = args[0];
	var g = args[1];
	var b = args[2];
	var value = 1 in arguments ? arguments[1] : convert.rgb.hsv(args)[2]; // hsv -> ansi16 optimization

	value = Math.round(value / 50);

	if (value === 0) {
		return 30;
	}

	var ansi = 30
		+ ((Math.round(b / 255) << 2)
		| (Math.round(g / 255) << 1)
		| Math.round(r / 255));

	if (value === 2) {
		ansi += 60;
	}

	return ansi;
};

convert.hsv.ansi16 = function (args) {
	// optimization here; we already know the value and don't need to get
	// it converted for us.
	return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
};

convert.rgb.ansi256 = function (args) {
	var r = args[0];
	var g = args[1];
	var b = args[2];

	// we use the extended greyscale palette here, with the exception of
	// black and white. normal palette only has 4 greyscale shades.
	if (r === g && g === b) {
		if (r < 8) {
			return 16;
		}

		if (r > 248) {
			return 231;
		}

		return Math.round(((r - 8) / 247) * 24) + 232;
	}

	var ansi = 16
		+ (36 * Math.round(r / 255 * 5))
		+ (6 * Math.round(g / 255 * 5))
		+ Math.round(b / 255 * 5);

	return ansi;
};

convert.ansi16.rgb = function (args) {
	var color = args % 10;

	// handle greyscale
	if (color === 0 || color === 7) {
		if (args > 50) {
			color += 3.5;
		}

		color = color / 10.5 * 255;

		return [color, color, color];
	}

	var mult = (~~(args > 50) + 1) * 0.5;
	var r = ((color & 1) * mult) * 255;
	var g = (((color >> 1) & 1) * mult) * 255;
	var b = (((color >> 2) & 1) * mult) * 255;

	return [r, g, b];
};

convert.ansi256.rgb = function (args) {
	// handle greyscale
	if (args >= 232) {
		var c = (args - 232) * 10 + 8;
		return [c, c, c];
	}

	args -= 16;

	var rem;
	var r = Math.floor(args / 36) / 5 * 255;
	var g = Math.floor((rem = args % 36) / 6) / 5 * 255;
	var b = (rem % 6) / 5 * 255;

	return [r, g, b];
};

convert.rgb.hex = function (args) {
	var integer = ((Math.round(args[0]) & 0xFF) << 16)
		+ ((Math.round(args[1]) & 0xFF) << 8)
		+ (Math.round(args[2]) & 0xFF);

	var string = integer.toString(16).toUpperCase();
	return '000000'.substring(string.length) + string;
};

convert.hex.rgb = function (args) {
	var match = args.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
	if (!match) {
		return [0, 0, 0];
	}

	var colorString = match[0];

	if (match[0].length === 3) {
		colorString = colorString.split('').map(function (char) {
			return char + char;
		}).join('');
	}

	var integer = parseInt(colorString, 16);
	var r = (integer >> 16) & 0xFF;
	var g = (integer >> 8) & 0xFF;
	var b = integer & 0xFF;

	return [r, g, b];
};

convert.rgb.hcg = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;
	var max = Math.max(Math.max(r, g), b);
	var min = Math.min(Math.min(r, g), b);
	var chroma = (max - min);
	var grayscale;
	var hue;

	if (chroma < 1) {
		grayscale = min / (1 - chroma);
	} else {
		grayscale = 0;
	}

	if (chroma <= 0) {
		hue = 0;
	} else
	if (max === r) {
		hue = ((g - b) / chroma) % 6;
	} else
	if (max === g) {
		hue = 2 + (b - r) / chroma;
	} else {
		hue = 4 + (r - g) / chroma + 4;
	}

	hue /= 6;
	hue %= 1;

	return [hue * 360, chroma * 100, grayscale * 100];
};

convert.hsl.hcg = function (hsl) {
	var s = hsl[1] / 100;
	var l = hsl[2] / 100;
	var c = 1;
	var f = 0;

	if (l < 0.5) {
		c = 2.0 * s * l;
	} else {
		c = 2.0 * s * (1.0 - l);
	}

	if (c < 1.0) {
		f = (l - 0.5 * c) / (1.0 - c);
	}

	return [hsl[0], c * 100, f * 100];
};

convert.hsv.hcg = function (hsv) {
	var s = hsv[1] / 100;
	var v = hsv[2] / 100;

	var c = s * v;
	var f = 0;

	if (c < 1.0) {
		f = (v - c) / (1 - c);
	}

	return [hsv[0], c * 100, f * 100];
};

convert.hcg.rgb = function (hcg) {
	var h = hcg[0] / 360;
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;

	if (c === 0.0) {
		return [g * 255, g * 255, g * 255];
	}

	var pure = [0, 0, 0];
	var hi = (h % 1) * 6;
	var v = hi % 1;
	var w = 1 - v;
	var mg = 0;

	switch (Math.floor(hi)) {
		case 0:
			pure[0] = 1; pure[1] = v; pure[2] = 0; break;
		case 1:
			pure[0] = w; pure[1] = 1; pure[2] = 0; break;
		case 2:
			pure[0] = 0; pure[1] = 1; pure[2] = v; break;
		case 3:
			pure[0] = 0; pure[1] = w; pure[2] = 1; break;
		case 4:
			pure[0] = v; pure[1] = 0; pure[2] = 1; break;
		default:
			pure[0] = 1; pure[1] = 0; pure[2] = w;
	}

	mg = (1.0 - c) * g;

	return [
		(c * pure[0] + mg) * 255,
		(c * pure[1] + mg) * 255,
		(c * pure[2] + mg) * 255
	];
};

convert.hcg.hsv = function (hcg) {
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;

	var v = c + g * (1.0 - c);
	var f = 0;

	if (v > 0.0) {
		f = c / v;
	}

	return [hcg[0], f * 100, v * 100];
};

convert.hcg.hsl = function (hcg) {
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;

	var l = g * (1.0 - c) + 0.5 * c;
	var s = 0;

	if (l > 0.0 && l < 0.5) {
		s = c / (2 * l);
	} else
	if (l >= 0.5 && l < 1.0) {
		s = c / (2 * (1 - l));
	}

	return [hcg[0], s * 100, l * 100];
};

convert.hcg.hwb = function (hcg) {
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;
	var v = c + g * (1.0 - c);
	return [hcg[0], (v - c) * 100, (1 - v) * 100];
};

convert.hwb.hcg = function (hwb) {
	var w = hwb[1] / 100;
	var b = hwb[2] / 100;
	var v = 1 - b;
	var c = v - w;
	var g = 0;

	if (c < 1) {
		g = (v - c) / (1 - c);
	}

	return [hwb[0], c * 100, g * 100];
};

convert.apple.rgb = function (apple) {
	return [(apple[0] / 65535) * 255, (apple[1] / 65535) * 255, (apple[2] / 65535) * 255];
};

convert.rgb.apple = function (rgb) {
	return [(rgb[0] / 255) * 65535, (rgb[1] / 255) * 65535, (rgb[2] / 255) * 65535];
};

convert.gray.rgb = function (args) {
	return [args[0] / 100 * 255, args[0] / 100 * 255, args[0] / 100 * 255];
};

convert.gray.hsl = convert.gray.hsv = function (args) {
	return [0, 0, args[0]];
};

convert.gray.hwb = function (gray) {
	return [0, 100, gray[0]];
};

convert.gray.cmyk = function (gray) {
	return [0, 0, 0, gray[0]];
};

convert.gray.lab = function (gray) {
	return [gray[0], 0, 0];
};

convert.gray.hex = function (gray) {
	var val = Math.round(gray[0] / 100 * 255) & 0xFF;
	var integer = (val << 16) + (val << 8) + val;

	var string = integer.toString(16).toUpperCase();
	return '000000'.substring(string.length) + string;
};

convert.rgb.gray = function (rgb) {
	var val = (rgb[0] + rgb[1] + rgb[2]) / 3;
	return [val / 255 * 100];
};
});

var conversions$3 = conversions$1;

/*
	this function routes a model to all other models.

	all functions that are routed have a property `.conversion` attached
	to the returned synthetic function. This property is an array
	of strings, each with the steps in between the 'from' and 'to'
	color models (inclusive).

	conversions that are not possible simply are not included.
*/

// https://jsperf.com/object-keys-vs-for-in-with-closure/3
var models$1 = Object.keys(conversions$3);

function buildGraph() {
	var graph = {};

	for (var len = models$1.length, i = 0; i < len; i++) {
		graph[models$1[i]] = {
			// http://jsperf.com/1-vs-infinity
			// micro-opt, but this is simple.
			distance: -1,
			parent: null
		};
	}

	return graph;
}

// https://en.wikipedia.org/wiki/Breadth-first_search
function deriveBFS(fromModel) {
	var graph = buildGraph();
	var queue = [fromModel]; // unshift -> queue -> pop

	graph[fromModel].distance = 0;

	while (queue.length) {
		var current = queue.pop();
		var adjacents = Object.keys(conversions$3[current]);

		for (var len = adjacents.length, i = 0; i < len; i++) {
			var adjacent = adjacents[i];
			var node = graph[adjacent];

			if (node.distance === -1) {
				node.distance = graph[current].distance + 1;
				node.parent = current;
				queue.unshift(adjacent);
			}
		}
	}

	return graph;
}

function link(from, to) {
	return function (args) {
		return to(from(args));
	};
}

function wrapConversion(toModel, graph) {
	var path = [graph[toModel].parent, toModel];
	var fn = conversions$3[graph[toModel].parent][toModel];

	var cur = graph[toModel].parent;
	while (graph[cur].parent) {
		path.unshift(graph[cur].parent);
		fn = link(conversions$3[graph[cur].parent][cur], fn);
		cur = graph[cur].parent;
	}

	fn.conversion = path;
	return fn;
}

var route$1 = function (fromModel) {
	var graph = deriveBFS(fromModel);
	var conversion = {};

	var models = Object.keys(graph);
	for (var len = models.length, i = 0; i < len; i++) {
		var toModel = models[i];
		var node = graph[toModel];

		if (node.parent === null) {
			// no possible conversion, or this node is the source model.
			continue;
		}

		conversion[toModel] = wrapConversion(toModel, graph);
	}

	return conversion;
};

var conversions = conversions$1;
var route = route$1;

var convert = {};

var models = Object.keys(conversions);

function wrapRaw(fn) {
	var wrappedFn = function (args) {
		if (args === undefined || args === null) {
			return args;
		}

		if (arguments.length > 1) {
			args = Array.prototype.slice.call(arguments);
		}

		return fn(args);
	};

	// preserve .conversion property if there is one
	if ('conversion' in fn) {
		wrappedFn.conversion = fn.conversion;
	}

	return wrappedFn;
}

function wrapRounded(fn) {
	var wrappedFn = function (args) {
		if (args === undefined || args === null) {
			return args;
		}

		if (arguments.length > 1) {
			args = Array.prototype.slice.call(arguments);
		}

		var result = fn(args);

		// we're assuming the result is an array here.
		// see notice in conversions.js; don't use box types
		// in conversion functions.
		if (typeof result === 'object') {
			for (var len = result.length, i = 0; i < len; i++) {
				result[i] = Math.round(result[i]);
			}
		}

		return result;
	};

	// preserve .conversion property if there is one
	if ('conversion' in fn) {
		wrappedFn.conversion = fn.conversion;
	}

	return wrappedFn;
}

models.forEach(function (fromModel) {
	convert[fromModel] = {};

	Object.defineProperty(convert[fromModel], 'channels', {value: conversions[fromModel].channels});
	Object.defineProperty(convert[fromModel], 'labels', {value: conversions[fromModel].labels});

	var routes = route(fromModel);
	var routeModels = Object.keys(routes);

	routeModels.forEach(function (toModel) {
		var fn = routes[toModel];

		convert[fromModel][toModel] = wrapRounded(fn);
		convert[fromModel][toModel].raw = wrapRaw(fn);
	});
});

var index$24 = convert;

var index$22 = createCommonjsModule(function (module) {
'use strict';
const colorConvert = index$24;

const wrapAnsi16 = (fn, offset) => function () {
	const code = fn.apply(colorConvert, arguments);
	return `\u001B[${code + offset}m`;
};

const wrapAnsi256 = (fn, offset) => function () {
	const code = fn.apply(colorConvert, arguments);
	return `\u001B[${38 + offset};5;${code}m`;
};

const wrapAnsi16m = (fn, offset) => function () {
	const rgb = fn.apply(colorConvert, arguments);
	return `\u001B[${38 + offset};2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
};

function assembleStyles() {
	const styles = {
		modifier: {
			reset: [0, 0],
			// 21 isn't widely supported and 22 does the same thing
			bold: [1, 22],
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29]
		},
		color: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],
			gray: [90, 39]
		},
		bgColor: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49]
		}
	};

	// fix humans
	styles.color.grey = styles.color.gray;

	Object.keys(styles).forEach(groupName => {
		const group = styles[groupName];

		Object.keys(group).forEach(styleName => {
			const style = group[styleName];

			styles[styleName] = group[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`
			};
		});

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false
		});
	});

	const rgb2rgb = (r, g, b) => [r, g, b];

	styles.color.close = '\u001B[39m';
	styles.bgColor.close = '\u001B[49m';

	styles.color.ansi = {};
	styles.color.ansi256 = {};
	styles.color.ansi16m = {
		rgb: wrapAnsi16m(rgb2rgb, 0)
	};

	styles.bgColor.ansi = {};
	styles.bgColor.ansi256 = {};
	styles.bgColor.ansi16m = {
		rgb: wrapAnsi16m(rgb2rgb, 10)
	};

	for (const key of Object.keys(colorConvert)) {
		if (typeof colorConvert[key] !== 'object') {
			continue;
		}

		const suite = colorConvert[key];

		if ('ansi16' in suite) {
			styles.color.ansi[key] = wrapAnsi16(suite.ansi16, 0);
			styles.bgColor.ansi[key] = wrapAnsi16(suite.ansi16, 10);
		}

		if ('ansi256' in suite) {
			styles.color.ansi256[key] = wrapAnsi256(suite.ansi256, 0);
			styles.bgColor.ansi256[key] = wrapAnsi256(suite.ansi256, 10);
		}

		if ('rgb' in suite) {
			styles.color.ansi16m[key] = wrapAnsi16m(suite.rgb, 0);
			styles.bgColor.ansi16m[key] = wrapAnsi16m(suite.rgb, 10);
		}
	}

	return styles;
}

Object.defineProperty(module, 'exports', {
	enumerable: true,
	get: assembleStyles
});
});

const asymmetricMatcher = Symbol.for('jest.asymmetricMatcher'); /**
                                                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                                 *
                                                                 * This source code is licensed under the BSD-style license found in the
                                                                 * LICENSE file in the root directory of this source tree. An additional grant
                                                                 * of patent rights can be found in the PATENTS file in the same directory.
                                                                 *
                                                                 * 
                                                                 */const SPACE = ' ';class ArrayContaining extends Array {}class ObjectContaining extends Object {}const print$1 = (val, print,
indent,
opts,
colors) =>
{
  const stringedValue = val.toString();

  if (stringedValue === 'ArrayContaining') {
    const array = ArrayContaining.from(val.sample);
    return opts.spacing === SPACE ?
    stringedValue + SPACE + print(array) :
    print(array);
  }

  if (stringedValue === 'ObjectContaining') {
    const object = Object.assign(new ObjectContaining(), val.sample);
    return opts.spacing === SPACE ?
    stringedValue + SPACE + print(object) :
    print(object);
  }

  if (stringedValue === 'StringMatching') {
    return stringedValue + SPACE + print(val.sample);
  }

  if (stringedValue === 'StringContaining') {
    return stringedValue + SPACE + print(val.sample);
  }

  return val.toAsymmetricMatcher();
};

const test = object => object && object.$$typeof === asymmetricMatcher;

var AsymmetricMatcher$1 = { print: print$1, test };

const ansiRegex$2 = index$12; /**
                                          * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                          *
                                          * This source code is licensed under the BSD-style license found in the
                                          * LICENSE file in the root directory of this source tree. An additional grant
                                          * of patent rights can be found in the PATENTS file in the same directory.
                                          *
                                          * 
                                          */const toHumanReadableAnsi = text => {const style = index$22;return text.replace(ansiRegex$2(), (match, offset, string) => {switch (match) {case style.red.close:case style.green.close:case style.reset.open:
      case style.reset.close:
        return '</>';
      case style.red.open:
        return '<red>';
      case style.green.open:
        return '<green>';
      case style.dim.open:
        return '<dim>';
      case style.bold.open:
        return '<bold>';
      default:
        return '';}

  });
};

const test$1 = value =>
typeof value === 'string' && value.match(ansiRegex$2());

const print$2 = (
val,
print,
indent,
opts,
colors) =>
print(toHumanReadableAnsi(val));

var ConvertAnsi = { print: print$2, test: test$1 };

function escapeHTML$1(str) {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var escapeHTML_1 = escapeHTML$1;

const escapeHTML = escapeHTML_1; /**
                                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                 *
                                                 * This source code is licensed under the BSD-style license found in the
                                                 * LICENSE file in the root directory of this source tree. An additional grant
                                                 * of patent rights can be found in the PATENTS file in the same directory.
                                                 *
                                                 * 
                                                 */















const HTML_ELEMENT_REGEXP = /(HTML\w*?Element)|Text|Comment/;
const test$2 = isHTMLElement;

function isHTMLElement(value) {
  return (
    value !== undefined &&
    value !== null && (
    value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 8) &&
    value.constructor !== undefined &&
    value.constructor.name !== undefined &&
    HTML_ELEMENT_REGEXP.test(value.constructor.name));

}

function printChildren(flatChildren, print, indent, colors, opts) {
  return flatChildren.
  map(node => {
    if (typeof node === 'object') {
      return print(node, print, indent, colors, opts);
    } else if (typeof node === 'string') {
      return colors.content.open + escapeHTML(node) + colors.content.close;
    } else {
      return print(node);
    }
  }).
  filter(value => value.trim().length).
  join(opts.edgeSpacing);
}

function printAttributes(attributes, indent, colors, opts) {
  return attributes.
  sort().
  map(attribute => {
    return (
      opts.spacing +
      indent(colors.prop.open + attribute.name + colors.prop.close + '=') +
      colors.value.open +
      `"${attribute.value}"` +
      colors.value.close);

  }).
  join('');
}

const print$3 = (
element,
print,
indent,
opts,
colors) =>
{
  if (element.nodeType === 3) {
    return element.data.
    split('\n').
    map(text => text.trimLeft()).
    filter(text => text.length).
    join(' ');
  } else if (element.nodeType === 8) {
    return (
      colors.comment.open +
      '<!-- ' +
      element.data.trim() +
      ' -->' +
      colors.comment.close);

  }

  let result = colors.tag.open + '<';
  const elementName = element.tagName.toLowerCase();
  result += elementName + colors.tag.close;

  const hasAttributes = element.attributes && element.attributes.length;
  if (hasAttributes) {
    const attributes = Array.prototype.slice.call(element.attributes);
    result += printAttributes(attributes, indent, colors, opts);
  }

  const flatChildren = Array.prototype.slice.call(element.childNodes);
  if (!flatChildren.length && element.textContent) {
    flatChildren.push(element.textContent);
  }

  const closeInNewLine = hasAttributes && !opts.min;
  if (flatChildren.length) {
    const children = printChildren(flatChildren, print, indent, colors, opts);
    result +=
    colors.tag.open + (
    closeInNewLine ? '\n' : '') +
    '>' +
    colors.tag.close +
    opts.edgeSpacing +
    indent(children) +
    opts.edgeSpacing +
    colors.tag.open +
    '</' +
    elementName +
    '>' +
    colors.tag.close;
  } else {
    result +=
    colors.tag.open + (closeInNewLine ? '\n' : ' ') + '/>' + colors.tag.close;
  }

  return result;
};

var HTMLElement$1 = { print: print$3, test: test$2 };

var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}();











const IMMUTABLE_NAMESPACE = 'Immutable.'; /**
                                           * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                           *
                                           * This source code is licensed under the BSD-style license found in the
                                           * LICENSE file in the root directory of this source tree. An additional grant
                                           * of patent rights can be found in the PATENTS file in the same directory.
                                           *
                                           * 
                                           */const SPACE$1 = ' ';const addKey = (isMap, key) => isMap ? key + ': ' : '';const addFinalEdgeSpacing = (length, edgeSpacing) => length > 0 ? edgeSpacing : '';const printImmutable$1 = (
val,
print,
indent,
opts,
colors,
immutableDataStructureName,
isMap) =>
{var _ref =
  isMap ? ['{', '}'] : ['[', ']'],_ref2 = _slicedToArray(_ref, 2);const openTag = _ref2[0],closeTag = _ref2[1];
  let result =
  IMMUTABLE_NAMESPACE +
  immutableDataStructureName +
  SPACE$1 +
  openTag +
  opts.edgeSpacing;

  const immutableArray = [];
  val.forEach((item, key) =>
  immutableArray.push(
  indent(addKey(isMap, key) + print(item, print, indent, opts, colors))));



  result += immutableArray.join(',' + opts.spacing);
  if (!opts.min && immutableArray.length > 0) {
    result += ',';
  }

  return (
    result +
    addFinalEdgeSpacing(immutableArray.length, opts.edgeSpacing) +
    closeTag);

};

var printImmutable_1 = printImmutable$1;

const printImmutable = printImmutable_1; /**
                                                         * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                         *
                                                         * This source code is licensed under the BSD-style license found in the
                                                         * LICENSE file in the root directory of this source tree. An additional grant
                                                         * of patent rights can be found in the PATENTS file in the same directory.
                                                         *
                                                         * 
                                                         */const IS_LIST = '@@__IMMUTABLE_LIST__@@';const test$3 = maybeList => !!(maybeList && maybeList[IS_LIST]);const print$4 = (val, print, indent,
opts,
colors) =>
printImmutable(val, print, indent, opts, colors, 'List', false);

var ImmutableList = { print: print$4, test: test$3 };

const printImmutable$2 = printImmutable_1; /**
                                                         * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                         *
                                                         * This source code is licensed under the BSD-style license found in the
                                                         * LICENSE file in the root directory of this source tree. An additional grant
                                                         * of patent rights can be found in the PATENTS file in the same directory.
                                                         *
                                                         * 
                                                         */const IS_SET = '@@__IMMUTABLE_SET__@@';const IS_ORDERED = '@@__IMMUTABLE_ORDERED__@@';const test$4 = maybeSet => !!(maybeSet && maybeSet[IS_SET] && !maybeSet[IS_ORDERED]);const print$5 = (val,
print,
indent,
opts,
colors) =>
printImmutable$2(val, print, indent, opts, colors, 'Set', false);

var ImmutableSet = { print: print$5, test: test$4 };

const printImmutable$3 = printImmutable_1; /**
                                                         * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                         *
                                                         * This source code is licensed under the BSD-style license found in the
                                                         * LICENSE file in the root directory of this source tree. An additional grant
                                                         * of patent rights can be found in the PATENTS file in the same directory.
                                                         *
                                                         * 
                                                         */const IS_MAP = '@@__IMMUTABLE_MAP__@@';const IS_ORDERED$1 = '@@__IMMUTABLE_ORDERED__@@';const test$5 = maybeMap => !!(maybeMap && maybeMap[IS_MAP] && !maybeMap[IS_ORDERED$1]);const print$6 = (val,
print,
indent,
opts,
colors) =>
printImmutable$3(val, print, indent, opts, colors, 'Map', true);

var ImmutableMap = { print: print$6, test: test$5 };

const printImmutable$4 = printImmutable_1; /**
                                                         * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                         *
                                                         * This source code is licensed under the BSD-style license found in the
                                                         * LICENSE file in the root directory of this source tree. An additional grant
                                                         * of patent rights can be found in the PATENTS file in the same directory.
                                                         *
                                                         * 
                                                         */const IS_STACK = '@@__IMMUTABLE_STACK__@@';const test$6 = maybeStack => !!(maybeStack && maybeStack[IS_STACK]);const print$7 = (val, print, indent,
opts,
colors) =>
printImmutable$4(val, print, indent, opts, colors, 'Stack', false);

var ImmutableStack = { print: print$7, test: test$6 };

const printImmutable$5 = printImmutable_1; /**
                                                         * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                         *
                                                         * This source code is licensed under the BSD-style license found in the
                                                         * LICENSE file in the root directory of this source tree. An additional grant
                                                         * of patent rights can be found in the PATENTS file in the same directory.
                                                         *
                                                         * 
                                                         */const IS_SET$1 = '@@__IMMUTABLE_SET__@@';const IS_ORDERED$2 = '@@__IMMUTABLE_ORDERED__@@';const test$7 = maybeOrderedSet => maybeOrderedSet && maybeOrderedSet[IS_SET$1] && maybeOrderedSet[IS_ORDERED$2];const print$8 = (val,
print,
indent,
opts,
colors) =>
printImmutable$5(val, print, indent, opts, colors, 'OrderedSet', false);

var ImmutableOrderedSet = { print: print$8, test: test$7 };

const printImmutable$6 = printImmutable_1; /**
                                                         * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                         *
                                                         * This source code is licensed under the BSD-style license found in the
                                                         * LICENSE file in the root directory of this source tree. An additional grant
                                                         * of patent rights can be found in the PATENTS file in the same directory.
                                                         *
                                                         * 
                                                         */const IS_MAP$1 = '@@__IMMUTABLE_MAP__@@';const IS_ORDERED$3 = '@@__IMMUTABLE_ORDERED__@@';const test$8 = maybeOrderedMap => maybeOrderedMap && maybeOrderedMap[IS_MAP$1] && maybeOrderedMap[IS_ORDERED$3];const print$9 = (val,
print,
indent,
opts,
colors) =>
printImmutable$6(val, print, indent, opts, colors, 'OrderedMap', true);

var ImmutableOrderedMap = { print: print$9, test: test$8 };

var ImmutablePlugins = [
ImmutableList,
ImmutableSet,
ImmutableMap,
ImmutableStack,
ImmutableOrderedSet,
ImmutableOrderedMap];

const escapeHTML$2 = escapeHTML_1; /**
                                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                 *
                                                 * This source code is licensed under the BSD-style license found in the
                                                 * LICENSE file in the root directory of this source tree. An additional grant
                                                 * of patent rights can be found in the PATENTS file in the same directory.
                                                 *
                                                 * 
                                                 */const reactElement = Symbol.for('react.element');function traverseChildren(opaqueChildren, cb) {if (Array.isArray(opaqueChildren)) {opaqueChildren.forEach(child => traverseChildren(child, cb));} else if (opaqueChildren != null && opaqueChildren !== false) {cb(opaqueChildren);
  }
}

function printChildren$1(flatChildren, print, indent, colors, opts) {
  return flatChildren.
  map(node => {
    if (typeof node === 'object') {
      return print(node, print, indent, colors, opts);
    } else if (typeof node === 'string') {
      return colors.content.open + escapeHTML$2(node) + colors.content.close;
    } else {
      return print(node);
    }
  }).
  join(opts.edgeSpacing);
}

function printProps(props, print, indent, colors, opts) {
  return Object.keys(props).
  sort().
  map(name => {
    if (name === 'children') {
      return '';
    }

    const prop = props[name];
    let printed = print(prop);

    if (typeof prop !== 'string') {
      if (printed.indexOf('\n') !== -1) {
        printed =
        '{' +
        opts.edgeSpacing +
        indent(indent(printed) + opts.edgeSpacing + '}');
      } else {
        printed = '{' + printed + '}';
      }
    }

    return (
      opts.spacing +
      indent(colors.prop.open + name + colors.prop.close + '=') +
      colors.value.open +
      printed +
      colors.value.close);

  }).
  join('');
}

const print$10 = (
element,
print,
indent,
opts,
colors) =>
{
  let result = colors.tag.open + '<';
  let elementName;
  if (typeof element.type === 'string') {
    elementName = element.type;
  } else if (typeof element.type === 'function') {
    elementName = element.type.displayName || element.type.name || 'Unknown';
  } else {
    elementName = 'Unknown';
  }
  result += elementName + colors.tag.close;
  result += printProps(element.props, print, indent, colors, opts);

  const opaqueChildren = element.props.children;
  const hasProps = !!Object.keys(element.props).filter(
  propName => propName !== 'children').
  length;
  const closeInNewLine = hasProps && !opts.min;

  if (opaqueChildren) {
    const flatChildren = [];
    traverseChildren(opaqueChildren, child => {
      flatChildren.push(child);
    });
    const children = printChildren$1(flatChildren, print, indent, colors, opts);
    result +=
    colors.tag.open + (
    closeInNewLine ? '\n' : '') +
    '>' +
    colors.tag.close +
    opts.edgeSpacing +
    indent(children) +
    opts.edgeSpacing +
    colors.tag.open +
    '</' +
    elementName +
    '>' +
    colors.tag.close;
  } else {
    result +=
    colors.tag.open + (closeInNewLine ? '\n' : ' ') + '/>' + colors.tag.close;
  }

  return result;
};

const test$9 = object => object && object.$$typeof === reactElement;

var ReactElement$1 = { print: print$10, test: test$9 };

const escapeHTML$3 = escapeHTML_1; /**
                                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                 *
                                                 * This source code is licensed under the BSD-style license found in the
                                                 * LICENSE file in the root directory of this source tree. An additional grant
                                                 * of patent rights can be found in the PATENTS file in the same directory.
                                                 *
                                                 * 
                                                 */const reactTestInstance = Symbol.for('react.test.json');function printChildren$2(children, print, indent, colors,
opts)
{
  return children.
  map(child => printInstance(child, print, indent, colors, opts)).
  join(opts.edgeSpacing);
}

function printProps$1(props, print, indent, colors, opts) {
  return Object.keys(props).
  sort().
  map(name => {
    const prop = props[name];
    let printed = print(prop);

    if (typeof prop !== 'string') {
      if (printed.indexOf('\n') !== -1) {
        printed =
        '{' +
        opts.edgeSpacing +
        indent(indent(printed) + opts.edgeSpacing + '}');
      } else {
        printed = '{' + printed + '}';
      }
    }

    return (
      opts.spacing +
      indent(colors.prop.open + name + colors.prop.close + '=') +
      colors.value.open +
      printed +
      colors.value.close);

  }).
  join('');
}

function printInstance(instance, print, indent, colors, opts) {
  if (typeof instance == 'number') {
    return print(instance);
  } else if (typeof instance === 'string') {
    return colors.content.open + escapeHTML$3(instance) + colors.content.close;
  }

  let closeInNewLine = false;
  let result = colors.tag.open + '<' + instance.type + colors.tag.close;

  if (instance.props) {
    closeInNewLine = !!Object.keys(instance.props).length && !opts.min;
    result += printProps$1(instance.props, print, indent, colors, opts);
  }

  if (instance.children) {
    const children = printChildren$2(
    instance.children,
    print,
    indent,
    colors,
    opts);

    result +=
    colors.tag.open + (
    closeInNewLine ? '\n' : '') +
    '>' +
    colors.tag.close +
    opts.edgeSpacing +
    indent(children) +
    opts.edgeSpacing +
    colors.tag.open +
    '</' +
    instance.type +
    '>' +
    colors.tag.close;
  } else {
    result +=
    colors.tag.open + (closeInNewLine ? '\n' : ' ') + '/>' + colors.tag.close;
  }

  return result;
}

const print$11 = (
val,
print,
indent,
opts,
colors) =>
printInstance(val, print, indent, colors, opts);

const test$10 = object =>
object && object.$$typeof === reactTestInstance;

var ReactTestComponent = { print: print$11, test: test$10 };

const style = index$22; /**
                                       * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                       *
                                       * This source code is licensed under the BSD-style license found in the
                                       * LICENSE file in the root directory of this source tree. An additional grant
                                       * of patent rights can be found in the PATENTS file in the same directory.
                                       *
                                       * 
                                       */















const toString = Object.prototype.toString;
const toISOString = Date.prototype.toISOString;
const errorToString = Error.prototype.toString;
const regExpToString = RegExp.prototype.toString;
const symbolToString = Symbol.prototype.toString;

const SYMBOL_REGEXP = /^Symbol\((.*)\)(.*)$/;
const NEWLINE_REGEXP = /\n/gi;

const getSymbols = Object.getOwnPropertySymbols || (obj => []);

function isToStringedArrayType(toStringed) {
  return (
    toStringed === '[object Array]' ||
    toStringed === '[object ArrayBuffer]' ||
    toStringed === '[object DataView]' ||
    toStringed === '[object Float32Array]' ||
    toStringed === '[object Float64Array]' ||
    toStringed === '[object Int8Array]' ||
    toStringed === '[object Int16Array]' ||
    toStringed === '[object Int32Array]' ||
    toStringed === '[object Uint8Array]' ||
    toStringed === '[object Uint8ClampedArray]' ||
    toStringed === '[object Uint16Array]' ||
    toStringed === '[object Uint32Array]');

}

function printNumber$1(val) {
  if (val != +val) {
    return 'NaN';
  }
  const isNegativeZero = val === 0 && 1 / val < 0;
  return isNegativeZero ? '-0' : '' + val;
}

function printFunction(val, printFunctionName) {
  if (!printFunctionName) {
    return '[Function]';
  } else if (val.name === '') {
    return '[Function anonymous]';
  } else {
    return '[Function ' + val.name + ']';
  }
}

function printSymbol(val) {
  return symbolToString.call(val).replace(SYMBOL_REGEXP, 'Symbol($1)');
}

function printError(val) {
  return '[' + errorToString.call(val) + ']';
}

function printBasicValue(
val,
printFunctionName,
escapeRegex)
{
  if (val === true || val === false) {
    return '' + val;
  }
  if (val === undefined) {
    return 'undefined';
  }
  if (val === null) {
    return 'null';
  }

  const typeOf = typeof val;

  if (typeOf === 'number') {
    return printNumber$1(val);
  }
  if (typeOf === 'string') {
    return '"' + val.replace(/"|\\/g, '\\$&') + '"';
  }
  if (typeOf === 'function') {
    return printFunction(val, printFunctionName);
  }
  if (typeOf === 'symbol') {
    return printSymbol(val);
  }

  const toStringed = toString.call(val);

  if (toStringed === '[object WeakMap]') {
    return 'WeakMap {}';
  }
  if (toStringed === '[object WeakSet]') {
    return 'WeakSet {}';
  }
  if (
  toStringed === '[object Function]' ||
  toStringed === '[object GeneratorFunction]')
  {
    return printFunction(val, printFunctionName);
  }
  if (toStringed === '[object Symbol]') {
    return printSymbol(val);
  }
  if (toStringed === '[object Date]') {
    return toISOString.call(val);
  }
  if (toStringed === '[object Error]') {
    return printError(val);
  }
  if (toStringed === '[object RegExp]') {
    if (escapeRegex) {
      // https://github.com/benjamingr/RegExp.escape/blob/master/polyfill.js
      return regExpToString.call(val).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    return regExpToString.call(val);
  }
  if (toStringed === '[object Arguments]' && val.length === 0) {
    return 'Arguments []';
  }
  if (isToStringedArrayType(toStringed) && val.length === 0) {
    return val.constructor.name + ' []';
  }

  if (val instanceof Error) {
    return printError(val);
  }

  return null;
}

function printList(
list,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  let body = '';

  if (list.length) {
    body += edgeSpacing;

    const innerIndent = prevIndent + indent;

    for (let i = 0; i < list.length; i++) {
      body +=
      innerIndent +
      print(
      list[i],
      indent,
      innerIndent,
      spacing,
      edgeSpacing,
      refs,
      maxDepth,
      currentDepth,
      plugins,
      min,
      callToJSON,
      printFunctionName,
      escapeRegex,
      colors);


      if (i < list.length - 1) {
        body += ',' + spacing;
      }
    }

    body += (min ? '' : ',') + edgeSpacing + prevIndent;
  }

  return '[' + body + ']';
}

function printArguments(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  return (
    (min ? '' : 'Arguments ') +
    printList(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors));


}

function printArray(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  return (
    (min ? '' : val.constructor.name + ' ') +
    printList(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors));


}

function printMap(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  let result = 'Map {';
  const iterator = val.entries();
  let current = iterator.next();

  if (!current.done) {
    result += edgeSpacing;

    const innerIndent = prevIndent + indent;

    while (!current.done) {
      const key = print(
      current.value[0],
      indent,
      innerIndent,
      spacing,
      edgeSpacing,
      refs,
      maxDepth,
      currentDepth,
      plugins,
      min,
      callToJSON,
      printFunctionName,
      escapeRegex,
      colors);

      const value = print(
      current.value[1],
      indent,
      innerIndent,
      spacing,
      edgeSpacing,
      refs,
      maxDepth,
      currentDepth,
      plugins,
      min,
      callToJSON,
      printFunctionName,
      escapeRegex,
      colors);


      result += innerIndent + key + ' => ' + value;

      current = iterator.next();

      if (!current.done) {
        result += ',' + spacing;
      }
    }

    result += (min ? '' : ',') + edgeSpacing + prevIndent;
  }

  return result + '}';
}

function printObject(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  const constructor = min ?
  '' :
  val.constructor ? val.constructor.name + ' ' : 'Object ';
  let result = constructor + '{';
  let keys = Object.keys(val).sort();
  const symbols = getSymbols(val);

  if (symbols.length) {
    keys = keys.
    filter(
    key =>
    // $FlowFixMe string literal `symbol`. This value is not a valid `typeof` return value
    !(typeof key === 'symbol' ||
    toString.call(key) === '[object Symbol]')).

    concat(symbols);
  }

  if (keys.length) {
    result += edgeSpacing;

    const innerIndent = prevIndent + indent;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const name = print(
      key,
      indent,
      innerIndent,
      spacing,
      edgeSpacing,
      refs,
      maxDepth,
      currentDepth,
      plugins,
      min,
      callToJSON,
      printFunctionName,
      escapeRegex,
      colors);

      const value = print(
      val[key],
      indent,
      innerIndent,
      spacing,
      edgeSpacing,
      refs,
      maxDepth,
      currentDepth,
      plugins,
      min,
      callToJSON,
      printFunctionName,
      escapeRegex,
      colors);


      result += innerIndent + name + ': ' + value;

      if (i < keys.length - 1) {
        result += ',' + spacing;
      }
    }

    result += (min ? '' : ',') + edgeSpacing + prevIndent;
  }

  return result + '}';
}

function printSet(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  let result = 'Set {';
  const iterator = val.entries();
  let current = iterator.next();

  if (!current.done) {
    result += edgeSpacing;

    const innerIndent = prevIndent + indent;

    while (!current.done) {
      result +=
      innerIndent +
      print(
      current.value[1],
      indent,
      innerIndent,
      spacing,
      edgeSpacing,
      refs,
      maxDepth,
      currentDepth,
      plugins,
      min,
      callToJSON,
      printFunctionName,
      escapeRegex,
      colors);


      current = iterator.next();

      if (!current.done) {
        result += ',' + spacing;
      }
    }

    result += (min ? '' : ',') + edgeSpacing + prevIndent;
  }

  return result + '}';
}

function printComplexValue(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  refs = refs.slice();
  if (refs.indexOf(val) > -1) {
    return '[Circular]';
  } else {
    refs.push(val);
  }

  currentDepth++;

  const hitMaxDepth = currentDepth > maxDepth;

  if (
  callToJSON &&
  !hitMaxDepth &&
  val.toJSON &&
  typeof val.toJSON === 'function')
  {
    return print(
    val.toJSON(),
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors);

  }

  const toStringed = toString.call(val);
  if (toStringed === '[object Arguments]') {
    return hitMaxDepth ?
    '[Arguments]' :
    printArguments(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors);

  } else if (isToStringedArrayType(toStringed)) {
    return hitMaxDepth ?
    '[Array]' :
    printArray(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors);

  } else if (toStringed === '[object Map]') {
    return hitMaxDepth ?
    '[Map]' :
    printMap(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors);

  } else if (toStringed === '[object Set]') {
    return hitMaxDepth ?
    '[Set]' :
    printSet(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors);

  }

  return hitMaxDepth ?
  '[Object]' :
  printObject(
  val,
  indent,
  prevIndent,
  spacing,
  edgeSpacing,
  refs,
  maxDepth,
  currentDepth,
  plugins,
  min,
  callToJSON,
  printFunctionName,
  escapeRegex,
  colors);

}

function printPlugin(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  let plugin;

  for (let p = 0; p < plugins.length; p++) {
    if (plugins[p].test(val)) {
      plugin = plugins[p];
      break;
    }
  }

  if (!plugin) {
    return null;
  }

  function boundPrint(val) {
    return print(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    maxDepth,
    currentDepth,
    plugins,
    min,
    callToJSON,
    printFunctionName,
    escapeRegex,
    colors);

  }

  function boundIndent(str) {
    const indentation = prevIndent + indent;
    return indentation + str.replace(NEWLINE_REGEXP, '\n' + indentation);
  }

  const opts = {
    edgeSpacing,
    min,
    spacing };

  return plugin.print(val, boundPrint, boundIndent, opts, colors);
}

function print(
val,
indent,
prevIndent,
spacing,
edgeSpacing,
refs,
maxDepth,
currentDepth,
plugins,
min,
callToJSON,
printFunctionName,
escapeRegex,
colors)
{
  const pluginsResult = printPlugin(
  val,
  indent,
  prevIndent,
  spacing,
  edgeSpacing,
  refs,
  maxDepth,
  currentDepth,
  plugins,
  min,
  callToJSON,
  printFunctionName,
  escapeRegex,
  colors);

  if (typeof pluginsResult === 'string') {
    return pluginsResult;
  }

  const basicResult = printBasicValue(val, printFunctionName, escapeRegex);
  if (basicResult !== null) {
    return basicResult;
  }

  return printComplexValue(
  val,
  indent,
  prevIndent,
  spacing,
  edgeSpacing,
  refs,
  maxDepth,
  currentDepth,
  plugins,
  min,
  callToJSON,
  printFunctionName,
  escapeRegex,
  colors);

}

const DEFAULTS = {
  callToJSON: true,
  edgeSpacing: '\n',
  escapeRegex: false,
  highlight: false,
  indent: 2,
  maxDepth: Infinity,
  min: false,
  plugins: [],
  printFunctionName: true,
  spacing: '\n',
  theme: {
    comment: 'gray',
    content: 'reset',
    prop: 'yellow',
    tag: 'cyan',
    value: 'green' } };



function validateOptions(opts) {
  Object.keys(opts).forEach(key => {
    if (!DEFAULTS.hasOwnProperty(key)) {
      throw new Error(`pretty-format: Unknown option "${key}".`);
    }
  });

  if (opts.min && opts.indent !== undefined && opts.indent !== 0) {
    throw new Error(
    'pretty-format: Options "min" and "indent" cannot be used together.');

  }
}

function normalizeOptions$1(opts) {
  const result = {};

  Object.keys(DEFAULTS).forEach(
  key =>
  result[key] = opts.hasOwnProperty(key) ?
  key === 'theme' ? normalizeTheme(opts.theme) : opts[key] :
  DEFAULTS[key]);


  if (result.min) {
    result.indent = 0;
  }

  // $FlowFixMe the type cast below means YOU are responsible to verify the code above.
  return result;
}

function normalizeTheme(themeOption) {
  if (!themeOption) {
    throw new Error(`pretty-format: Option "theme" must not be null.`);
  }

  if (typeof themeOption !== 'object') {
    throw new Error(
    `pretty-format: Option "theme" must be of type "object" but instead received "${typeof themeOption}".`);

  }

  // Silently ignore any keys in `theme` that are not in defaults.
  const themeRefined = themeOption;
  const themeDefaults = DEFAULTS.theme;
  return Object.keys(themeDefaults).reduce((theme, key) => {
    theme[key] = Object.prototype.hasOwnProperty.call(themeOption, key) ?
    themeRefined[key] :
    themeDefaults[key];
    return theme;
  }, {});
}

function createIndent(indent) {
  return new Array(indent + 1).join(' ');
}

function prettyFormat$1(val, initialOptions) {
  let opts;
  if (!initialOptions) {
    opts = DEFAULTS;
  } else {
    validateOptions(initialOptions);
    opts = normalizeOptions$1(initialOptions);
  }

  const colors = {
    comment: { close: '', open: '' },
    content: { close: '', open: '' },
    prop: { close: '', open: '' },
    tag: { close: '', open: '' },
    value: { close: '', open: '' } };

  Object.keys(opts.theme).forEach(key => {
    if (opts.highlight) {
      const color = colors[key] = style[opts.theme[key]];
      if (
      !color ||
      typeof color.close !== 'string' ||
      typeof color.open !== 'string')
      {
        throw new Error(
        `pretty-format: Option "theme" has a key "${key}" whose value "${opts.theme[key]}" is undefined in ansi-styles.`);

      }
    }
  });

  let indent;
  let refs;
  const prevIndent = '';
  const currentDepth = 0;
  const spacing = opts.min ? ' ' : '\n';
  const edgeSpacing = opts.min ? '' : '\n';

  if (opts && opts.plugins.length) {
    indent = createIndent(opts.indent);
    refs = [];
    const pluginsResult = printPlugin(
    val,
    indent,
    prevIndent,
    spacing,
    edgeSpacing,
    refs,
    opts.maxDepth,
    currentDepth,
    opts.plugins,
    opts.min,
    opts.callToJSON,
    opts.printFunctionName,
    opts.escapeRegex,
    colors);

    if (typeof pluginsResult === 'string') {
      return pluginsResult;
    }
  }

  const basicResult = printBasicValue(
  val,
  opts.printFunctionName,
  opts.escapeRegex);

  if (basicResult !== null) {
    return basicResult;
  }

  if (!indent) {
    indent = createIndent(opts.indent);
  }
  if (!refs) {
    refs = [];
  }
  return printComplexValue(
  val,
  indent,
  prevIndent,
  spacing,
  edgeSpacing,
  refs,
  opts.maxDepth,
  currentDepth,
  opts.plugins,
  opts.min,
  opts.callToJSON,
  opts.printFunctionName,
  opts.escapeRegex,
  colors);

}

prettyFormat$1.plugins = {
  AsymmetricMatcher: AsymmetricMatcher$1,
  ConvertAnsi: ConvertAnsi,
  HTMLElement: HTMLElement$1,
  Immutable: ImmutablePlugins,
  ReactElement: ReactElement$1,
  ReactTestComponent: ReactTestComponent };


var index$20 = prettyFormat$1;

const chalk$1 = index$4;
const prettyFormat = index$20;var _require$plugins =





index$20.plugins;const AsymmetricMatcher = _require$plugins.AsymmetricMatcher; const ReactElement = _require$plugins.ReactElement; const HTMLElement = _require$plugins.HTMLElement; const Immutable = _require$plugins.Immutable;

const PLUGINS = [AsymmetricMatcher, ReactElement, HTMLElement].concat(
Immutable);
















const EXPECTED_COLOR = chalk$1.green;
const EXPECTED_BG = chalk$1.bgGreen;
const RECEIVED_COLOR = chalk$1.red;
const RECEIVED_BG = chalk$1.bgRed;

const NUMBERS = [
'zero',
'one',
'two',
'three',
'four',
'five',
'six',
'seven',
'eight',
'nine',
'ten',
'eleven',
'twelve',
'thirteen'];


// get the type of a value with handling the edge cases like `typeof []`
// and `typeof null`
const getType$1 = value => {
  if (typeof value === 'undefined') {
    return 'undefined';
  } else if (value === null) {
    return 'null';
  } else if (Array.isArray(value)) {
    return 'array';
  } else if (typeof value === 'boolean') {
    return 'boolean';
  } else if (typeof value === 'function') {
    return 'function';
  } else if (typeof value === 'number') {
    return 'number';
  } else if (typeof value === 'string') {
    return 'string';
  } else if (typeof value === 'object') {
    if (value.constructor === RegExp) {
      return 'regexp';
    } else if (value.constructor === Map) {
      return 'map';
    } else if (value.constructor === Set) {
      return 'set';
    }
    return 'object';
    // $FlowFixMe https://github.com/facebook/flow/issues/1015
  } else if (typeof value === 'symbol') {
    return 'symbol';
  }

  throw new Error(`value of unknown type: ${value}`);
};

const stringify = function (object) {let maxDepth = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 10;
  const MAX_LENGTH = 10000;
  let result;

  try {
    result = prettyFormat(object, {
      maxDepth,
      min: true,
      plugins: PLUGINS });

  } catch (e) {
    result = prettyFormat(object, {
      callToJSON: false,
      maxDepth,
      min: true,
      plugins: PLUGINS });

  }

  return result.length >= MAX_LENGTH && maxDepth > 1 ?
  stringify(object, Math.floor(maxDepth / 2)) :
  result;
};

const highlightTrailingWhitespace = (text, bgColor) =>
text.replace(/\s+$/gm, bgColor('$&'));

const printReceived = object =>
highlightTrailingWhitespace(RECEIVED_COLOR(stringify(object)), RECEIVED_BG);
const printExpected = value =>
highlightTrailingWhitespace(EXPECTED_COLOR(stringify(value)), EXPECTED_BG);

const printWithType = (
name,
received,
print) =>
{
  const type = getType$1(received);
  return (
    name +
    ':' + (
    type !== 'null' && type !== 'undefined' ? '\n  ' + type + ': ' : ' ') +
    print(received));

};

const ensureNoExpected = (expected, matcherName) => {
  matcherName || (matcherName = 'This');
  if (typeof expected !== 'undefined') {
    throw new Error(
    matcherHint('[.not]' + matcherName, undefined, '') +
    '\n\n' +
    'Matcher does not accept any arguments.\n' +
    printWithType('Got', expected, printExpected));

  }
};

const ensureActualIsNumber = (actual, matcherName) => {
  matcherName || (matcherName = 'This matcher');
  if (typeof actual !== 'number') {
    throw new Error(
    matcherHint('[.not]' + matcherName) +
    '\n\n' +
    `Received value must be a number.\n` +
    printWithType('Received', actual, printReceived));

  }
};

const ensureExpectedIsNumber = (expected, matcherName) => {
  matcherName || (matcherName = 'This matcher');
  if (typeof expected !== 'number') {
    throw new Error(
    matcherHint('[.not]' + matcherName) +
    '\n\n' +
    `Expected value must be a number.\n` +
    printWithType('Got', expected, printExpected));

  }
};

const ensureNumbers = (actual, expected, matcherName) => {
  ensureActualIsNumber(actual, matcherName);
  ensureExpectedIsNumber(expected, matcherName);
};

const pluralize = (word, count) =>
(NUMBERS[count] || count) + ' ' + word + (count === 1 ? '' : 's');

const matcherHint = function (
matcherName)






{let received = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'received';let expected = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'expected';let options = arguments[3];
  const secondArgument = options && options.secondArgument;
  const isDirectExpectCall = options && options.isDirectExpectCall;
  return (
    chalk$1.dim('expect' + (isDirectExpectCall ? '' : '(')) +
    RECEIVED_COLOR(received) +
    chalk$1.dim((isDirectExpectCall ? '' : ')') + matcherName + '(') +
    EXPECTED_COLOR(expected) + (
    secondArgument ? `, ${EXPECTED_COLOR(secondArgument)}` : '') +
    chalk$1.dim(')'));

};

var index$18 = {
  EXPECTED_BG,
  EXPECTED_COLOR,
  RECEIVED_BG,
  RECEIVED_COLOR,
  ensureActualIsNumber,
  ensureExpectedIsNumber,
  ensureNoExpected,
  ensureNumbers,
  getType: getType$1,
  highlightTrailingWhitespace,
  matcherHint,
  pluralize,
  printExpected,
  printReceived,
  printWithType,
  stringify };

/* eslint-disable no-nested-ternary */
var arr = [];
var charCodeCache = [];

var index$28 = function (a, b) {
	if (a === b) {
		return 0;
	}

	var swap = a;

	// Swapping the strings if `a` is longer than `b` so we know which one is the
	// shortest & which one is the longest
	if (a.length > b.length) {
		a = b;
		b = swap;
	}

	var aLen = a.length;
	var bLen = b.length;

	if (aLen === 0) {
		return bLen;
	}

	if (bLen === 0) {
		return aLen;
	}

	// Performing suffix trimming:
	// We can linearly drop suffix common to both strings since they
	// don't increase distance at all
	// Note: `~-` is the bitwise way to perform a `- 1` operation
	while (aLen > 0 && (a.charCodeAt(~-aLen) === b.charCodeAt(~-bLen))) {
		aLen--;
		bLen--;
	}

	if (aLen === 0) {
		return bLen;
	}

	// Performing prefix trimming
	// We can linearly drop prefix common to both strings since they
	// don't increase distance at all
	var start = 0;

	while (start < aLen && (a.charCodeAt(start) === b.charCodeAt(start))) {
		start++;
	}

	aLen -= start;
	bLen -= start;

	if (aLen === 0) {
		return bLen;
	}

	var bCharCode;
	var ret;
	var tmp;
	var tmp2;
	var i = 0;
	var j = 0;

	while (i < aLen) {
		charCodeCache[start + i] = a.charCodeAt(start + i);
		arr[i] = ++i;
	}

	while (j < bLen) {
		bCharCode = b.charCodeAt(start + j);
		tmp = j++;
		ret = j;

		for (i = 0; i < aLen; i++) {
			tmp2 = bCharCode === charCodeCache[start + i] ? tmp : tmp + 1;
			tmp = arr[i];
			ret = arr[i] = tmp > ret ? tmp2 > ret ? ret + 1 : tmp2 : tmp2 > tmp ? tmp + 1 : tmp2;
		}
	}

	return ret;
};

const chalk$2 = index$4;
const BULLET = chalk$2.bold('\u25cf');
const DEPRECATION = `${BULLET} Deprecation Warning`;
const ERROR$1 = `${BULLET} Validation Error`;
const WARNING = `${BULLET} Validation Warning`;

const format$2 = value =>
typeof value === 'function' ?
value.toString() :
index$20(value, { min: true });

class ValidationError$1 extends Error {



  constructor(name, message, comment) {
    super();
    comment = comment ? '\n\n' + comment : '\n';
    this.name = '';
    this.stack = '';
    this.message = chalk$2.red(chalk$2.bold(name) + ':\n\n' + message + comment);
    Error.captureStackTrace(this, () => {});
  }}


const logValidationWarning = (
name,
message,
comment) =>
{
  comment = comment ? '\n\n' + comment : '\n';
  console.warn(chalk$2.yellow(chalk$2.bold(name) + ':\n\n' + message + comment));
};

const createDidYouMeanMessage = (
unrecognized,
allowedOptions) =>
{
  const leven = index$28;
  const suggestion = allowedOptions.find(option => {
    const steps = leven(option, unrecognized);
    return steps < 3;
  });

  return suggestion ? `Did you mean ${chalk$2.bold(format$2(suggestion))}?` : '';
};

var utils$2 = {
  DEPRECATION,
  ERROR: ERROR$1,
  ValidationError: ValidationError$1,
  WARNING,
  createDidYouMeanMessage,
  format: format$2,
  logValidationWarning };

const chalk = index$4; /**
                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                 *
                                 * This source code is licensed under the BSD-style license found in the
                                 * LICENSE file in the root directory of this source tree. An additional grant
                                 * of patent rights can be found in the PATENTS file in the same directory.
                                 *
                                 * 
                                 */var _require = index$18;const getType = _require.getType;var _require2 = utils$2;const format$1 = _require2.format; const ValidationError = _require2.ValidationError; const ERROR = _require2.ERROR;const errorMessage = (option, received, defaultValue, options) =>
{
  const message = `  Option ${chalk.bold(`"${option}"`)} must be of type:
    ${chalk.bold.green(getType(defaultValue))}
  but instead received:
    ${chalk.bold.red(getType(received))}

  Example:
  {
    ${chalk.bold(`"${option}"`)}: ${chalk.bold(format$1(defaultValue))}
  }`;

  const comment = options.comment;
  const name = options.title && options.title.error || ERROR;

  throw new ValidationError(name, message, comment);
};

var errors = {
  ValidationError,
  errorMessage };

var _require$2 =











utils$2;const logValidationWarning$1 = _require$2.logValidationWarning; const DEPRECATION$2 = _require$2.DEPRECATION; /**
                                                                                                                   * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                                                                                   *
                                                                                                                   * This source code is licensed under the BSD-style license found in the
                                                                                                                   * LICENSE file in the root directory of this source tree. An additional grant
                                                                                                                   * of patent rights can be found in the PATENTS file in the same directory.
                                                                                                                   *
                                                                                                                   * 
                                                                                                                   */const deprecationMessage = (message, options) => {const comment = options.comment;const name = options.title && options.title.deprecation || DEPRECATION$2;logValidationWarning$1(name, message, comment);};
const deprecationWarning$1 = (
config,
option,
deprecatedOptions,
options) =>
{
  if (option in deprecatedOptions) {
    deprecationMessage(deprecatedOptions[option](config), options);

    return true;
  }

  return false;
};

var deprecated = {
  deprecationWarning: deprecationWarning$1 };

const chalk$3 = index$4; /**
                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                 *
                                 * This source code is licensed under the BSD-style license found in the
                                 * LICENSE file in the root directory of this source tree. An additional grant
                                 * of patent rights can be found in the PATENTS file in the same directory.
                                 *
                                 * 
                                 */var _require$3 = utils$2;const format$3 = _require$3.format; const logValidationWarning$2 = _require$3.logValidationWarning; const createDidYouMeanMessage$1 = _require$3.createDidYouMeanMessage; const WARNING$2 = _require$3.WARNING;const unknownOptionWarning$1 = (
config,
exampleConfig,
option,
options) =>
{
  const didYouMean = createDidYouMeanMessage$1(
  option,
  Object.keys(exampleConfig));

  const message =
  `  Unknown option ${chalk$3.bold(`"${option}"`)} with value ${chalk$3.bold(format$3(config[option]))} was found.` + (
  didYouMean && ` ${didYouMean}`) +
  `\n  This is probably a typing mistake. Fixing it will remove this message.`;

  const comment = options.comment;
  const name = options.title && options.title.warning || WARNING$2;

  logValidationWarning$2(name, message, comment);
};

var warnings = {
  unknownOptionWarning: unknownOptionWarning$1 };

const config = {
  comment: '  A comment',
  condition: (option, validOption) => true,
  deprecate: (config, option, deprecatedOptions, options) => false,
  deprecatedConfig: {
    key: config => {} },

  error: (option, received, defaultValue, options) => {},
  exampleConfig: { key: 'value', test: 'case' },
  title: {
    deprecation: 'Deprecation Warning',
    error: 'Validation Error',
    warning: 'Validation Warning' },

  unknown: (config, option, options) => {} }; /**
                                               * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                               *
                                               * This source code is licensed under the BSD-style license found in the
                                               * LICENSE file in the root directory of this source tree. An additional grant
                                               * of patent rights can be found in the PATENTS file in the same directory.
                                               *
                                               * 
                                               */var exampleConfig$2 = config;

const toString$1 = Object.prototype.toString;

const validationCondition$1 = (option, validOption) => {
  return (
    option === null ||
    option === undefined ||
    toString$1.call(option) === toString$1.call(validOption));

};

var condition = validationCondition$1;

var _require$1 =











deprecated;const deprecationWarning = _require$1.deprecationWarning; /**
                                                                                 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                                                 *
                                                                                 * This source code is licensed under the BSD-style license found in the
                                                                                 * LICENSE file in the root directory of this source tree. An additional grant
                                                                                 * of patent rights can be found in the PATENTS file in the same directory.
                                                                                 *
                                                                                 * 
                                                                                 */var _require2$1 = warnings;const unknownOptionWarning = _require2$1.unknownOptionWarning;var _require3 = errors;const errorMessage$1 = _require3.errorMessage;const exampleConfig$1 = exampleConfig$2;const validationCondition = condition;var _require4 = utils$2;const ERROR$2 = _require4.ERROR; const DEPRECATION$1 = _require4.DEPRECATION; const WARNING$1 = _require4.WARNING;var defaultConfig$1 = { comment: '',
  condition: validationCondition,
  deprecate: deprecationWarning,
  deprecatedConfig: {},
  error: errorMessage$1,
  exampleConfig: exampleConfig$1,
  title: {
    deprecation: DEPRECATION$1,
    error: ERROR$2,
    warning: WARNING$1 },

  unknown: unknownOptionWarning };

const defaultConfig = defaultConfig$1; /**
                                                   * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
                                                   *
                                                   * This source code is licensed under the BSD-style license found in the
                                                   * LICENSE file in the root directory of this source tree. An additional grant
                                                   * of patent rights can be found in the PATENTS file in the same directory.
                                                   *
                                                   * 
                                                   */const _validate = (config, options) => {let hasDeprecationWarnings = false;for (const key in config) {if (options.deprecatedConfig && key in options.deprecatedConfig &&
    typeof options.deprecate === 'function')
    {
      const isDeprecatedKey = options.deprecate(
      config,
      key,
      options.deprecatedConfig,
      options);


      hasDeprecationWarnings = hasDeprecationWarnings || isDeprecatedKey;
    } else if (hasOwnProperty.call(options.exampleConfig, key)) {
      if (
      typeof options.condition === 'function' &&
      typeof options.error === 'function' &&
      !options.condition(config[key], options.exampleConfig[key]))
      {
        options.error(key, config[key], options.exampleConfig[key], options);
      }
    } else {
      options.unknown &&
      options.unknown(config, options.exampleConfig, key, options);
    }
  }

  return { hasDeprecationWarnings };
};

const validate$1 = (config, options) => {
  _validate(options, defaultConfig); // validate against jest-validate config

  const defaultedOptions = Object.assign(
  {},
  defaultConfig,
  options,
  { title: Object.assign({}, defaultConfig.title, options.title) });var _validate2 =


  _validate(config, defaultedOptions);const hasDeprecationWarnings = _validate2.hasDeprecationWarnings;

  return {
    hasDeprecationWarnings,
    isValid: true };

};

var validate_1 = validate$1;

var index$2 = {
  ValidationError: errors.ValidationError,
  createDidYouMeanMessage: utils$2.createDidYouMeanMessage,
  format: utils$2.format,
  logValidationWarning: utils$2.logValidationWarning,
  validate: validate_1 };

const deprecated$2 = {
  useFlowParser: config =>
    `  The ${'"useFlowParser"'} option is deprecated. Use ${'"parser"'} instead.

  Prettier now treats your configuration as:
  {
    ${'"parser"'}: ${config.useFlowParser ? '"flow"' : '"babylon"'}
  }`
};

var deprecated_1 = deprecated$2;

const validate = index$2.validate;
const deprecatedConfig = deprecated_1;

const defaults = {
  cursorOffset: -1,
  rangeStart: 0,
  rangeEnd: Infinity,
  useTabs: false,
  tabWidth: 2,
  printWidth: 80,
  singleQuote: false,
  trailingComma: "none",
  bracketSpacing: true,
  jsxBracketSameLine: false,
  jsxAttributesIndent: false,
  parser: "babylon",
  semi: true
};

const exampleConfig = Object.assign({}, defaults, {
  filepath: "path/to/Filename",
  printWidth: 80,
  originalText: "text"
});

// Copy options and fill in default values.
function normalize(options) {
  const normalized = Object.assign({}, options || {});
  const filepath = normalized.filepath;

  if (/\.(css|less|scss)$/.test(filepath)) {
    normalized.parser = "postcss";
  } else if (/\.(ts|tsx)$/.test(filepath)) {
    normalized.parser = "typescript";
  }

  if (typeof normalized.trailingComma === "boolean") {
    // Support a deprecated boolean type for the trailing comma config
    // for a few versions. This code can be removed later.
    normalized.trailingComma = "es5";

    console.warn(
      "Warning: `trailingComma` without any argument is deprecated. " +
        'Specify "none", "es5", or "all".'
    );
  }

  validate(normalized, { exampleConfig, deprecatedConfig });

  // For backward compatibility. Deprecated in 0.0.10
  if ("useFlowParser" in normalized) {
    normalized.parser = normalized.useFlowParser ? "flow" : "babylon";
    delete normalized.useFlowParser;
  }

  Object.keys(defaults).forEach(k => {
    if (normalized[k] == null) {
      normalized[k] = defaults[k];
    }
  });

  return normalized;
}

var options = { normalize };

var index$32 = createCommonjsModule(function (module, exports) {
// Copyright 2014, 2015, 2016, 2017 Simon Lydell
// License: MIT. (See LICENSE.)

Object.defineProperty(exports, "__esModule", {
  value: true
});

// This regex comes from regex.coffee, and is inserted here by generate-index.js
// (run `npm run build`).
exports.default = /((['"])(?:(?!\2|\\).|\\(?:\r\n|[\s\S]))*(\2)?|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)|\$\{(?:[^{}]|\{[^}]*\}?)*\}?)*(`)?)|(\/\/.*)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)|(\/(?!\*)(?:\[(?:(?![\]\\]).|\\.)*\]|(?![\/\]\\]).|\\.)+\/(?:(?!\s*(?:\b|[\u0080-\uFFFF$\\'"~({]|[+\-!](?!=)|\.?\d))|[gmiyu]{1,5}\b(?![\u0080-\uFFFF$\\]|\s*(?:[+\-*%&|^<>!=?({]|\/(?![\/*])))))|(0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)|((?!\d)(?:(?!\s)[$\w\u0080-\uFFFF]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+)|(--|\+\+|&&|\|\||=>|\.{3}|(?:[+\-\/%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2})=?|[?~.,:;[\](){}])|(\s+)|(^$|[\s\S])/g;

exports.matchToToken = function(match) {
  var token = {type: "invalid", value: match[0]};
       if (match[ 1]) token.type = "string" , token.closed = !!(match[3] || match[4]);
  else if (match[ 5]) token.type = "comment";
  else if (match[ 6]) token.type = "comment", token.closed = !!match[7];
  else if (match[ 8]) token.type = "regex";
  else if (match[ 9]) token.type = "number";
  else if (match[10]) token.type = "name";
  else if (match[11]) token.type = "punctuator";
  else if (match[12]) token.type = "whitespace";
  return token
};
});

var index$30 = createCommonjsModule(function (module, exports) {
"use strict";

exports.__esModule = true;
exports.codeFrameColumns = codeFrameColumns;

exports.default = function (rawLines, lineNumber, colNumber) {
  var opts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

  if (!deprecationWarningShown) {
    deprecationWarningShown = true;

    var deprecationError = new Error("Passing lineNumber and colNumber is deprecated to babel-code-frame. Please use `codeFrameColumns`.");
    deprecationError.name = "DeprecationWarning";

    if (process.emitWarning) {
      process.emitWarning(deprecationError);
    } else {
      console.warn(deprecationError);
    }
  }

  colNumber = Math.max(colNumber, 0);

  var location = { start: { column: colNumber, line: lineNumber } };

  return codeFrameColumns(rawLines, location, opts);
};

var _jsTokens = index$32;

var _jsTokens2 = _interopRequireDefault(_jsTokens);

var _esutils = utils;

var _esutils2 = _interopRequireDefault(_esutils);

var _chalk = index$4;

var _chalk2 = _interopRequireDefault(_chalk);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var deprecationWarningShown = false;

function getDefs(chalk) {
  return {
    keyword: chalk.cyan,
    capitalized: chalk.yellow,
    jsx_tag: chalk.yellow,
    punctuator: chalk.yellow,

    number: chalk.magenta,
    string: chalk.green,
    regex: chalk.magenta,
    comment: chalk.grey,
    invalid: chalk.white.bgRed.bold,
    gutter: chalk.grey,
    marker: chalk.red.bold
  };
}

var NEWLINE = /\r\n|[\n\r\u2028\u2029]/;

var JSX_TAG = /^[a-z][\w-]*$/i;

var BRACKET = /^[()\[\]{}]$/;

function getTokenType(match) {
  var _match$slice = match.slice(-2),
      offset = _match$slice[0],
      text = _match$slice[1];

  var token = (0, _jsTokens.matchToToken)(match);

  if (token.type === "name") {
    if (_esutils2.default.keyword.isReservedWordES6(token.value)) {
      return "keyword";
    }

    if (JSX_TAG.test(token.value) && (text[offset - 1] === "<" || text.substr(offset - 2, 2) == "</")) {
      return "jsx_tag";
    }

    if (token.value[0] !== token.value[0].toLowerCase()) {
      return "capitalized";
    }
  }

  if (token.type === "punctuator" && BRACKET.test(token.value)) {
    return "bracket";
  }

  return token.type;
}

function highlight(defs, text) {
  return text.replace(_jsTokens2.default, function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var type = getTokenType(args);
    var colorize = defs[type];
    if (colorize) {
      return args[0].split(NEWLINE).map(function (str) {
        return colorize(str);
      }).join("\n");
    } else {
      return args[0];
    }
  });
}

function getMarkerLines(loc, source, opts) {
  var startLoc = Object.assign({}, { column: 0, line: -1 }, loc.start);
  var endLoc = Object.assign({}, startLoc, loc.end);
  var linesAbove = opts.linesAbove || 2;
  var linesBelow = opts.linesBelow || 3;

  var startLine = startLoc.line;
  var startColumn = startLoc.column;
  var endLine = endLoc.line;
  var endColumn = endLoc.column;

  var start = Math.max(startLine - (linesAbove + 1), 0);
  var end = Math.min(source.length, endLine + linesBelow);

  if (startLine === -1) {
    start = 0;
  }

  if (endLine === -1) {
    end = source.length;
  }

  var lineDiff = endLine - startLine;
  var markerLines = {};

  if (lineDiff) {
    for (var i = 0; i <= lineDiff; i++) {
      var lineNumber = i + startLine;

      if (!startColumn) {
        markerLines[lineNumber] = true;
      } else if (i === 0) {
        var sourceLength = source[lineNumber - 1].length;

        markerLines[lineNumber] = [startColumn, sourceLength - startColumn];
      } else if (i === lineDiff) {
        markerLines[lineNumber] = [0, endColumn];
      } else {
        var _sourceLength = source[lineNumber - i].length;

        markerLines[lineNumber] = [0, _sourceLength];
      }
    }
  } else {
    if (startColumn === endColumn) {
      if (startColumn) {
        markerLines[startLine] = [startColumn, 0];
      } else {
        markerLines[startLine] = true;
      }
    } else {
      markerLines[startLine] = [startColumn, endColumn - startColumn];
    }
  }

  return { start: start, end: end, markerLines: markerLines };
}

function codeFrameColumns(rawLines, loc) {
  var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  var highlighted = opts.highlightCode && _chalk2.default.supportsColor || opts.forceColor;
  var chalk = _chalk2.default;
  if (opts.forceColor) {
    chalk = new _chalk2.default.constructor({ enabled: true });
  }
  var maybeHighlight = function maybeHighlight(chalkFn, string) {
    return highlighted ? chalkFn(string) : string;
  };
  var defs = getDefs(chalk);
  if (highlighted) rawLines = highlight(defs, rawLines);

  var lines = rawLines.split(NEWLINE);

  var _getMarkerLines = getMarkerLines(loc, lines, opts),
      start = _getMarkerLines.start,
      end = _getMarkerLines.end,
      markerLines = _getMarkerLines.markerLines;

  var numberMaxWidth = String(end).length;

  var frame = lines.slice(start, end).map(function (line, index) {
    var number = start + 1 + index;
    var paddedNumber = (" " + number).slice(-numberMaxWidth);
    var gutter = " " + paddedNumber + " | ";
    var hasMarker = markerLines[number];
    if (hasMarker) {
      var markerLine = "";
      if (Array.isArray(hasMarker)) {
        var markerSpacing = line.slice(0, Math.max(hasMarker[0] - 1, 0)).replace(/[^\t]/g, " ");
        var numberOfMarkers = hasMarker[1] || 1;

        markerLine = ["\n ", maybeHighlight(defs.gutter, gutter.replace(/\d/g, " ")), markerSpacing, maybeHighlight(defs.marker, "^").repeat(numberOfMarkers)].join("");
      }
      return [maybeHighlight(defs.marker, ">"), maybeHighlight(defs.gutter, gutter), line, markerLine].join("");
    } else {
      return " " + maybeHighlight(defs.gutter, gutter) + line;
    }
  }).join("\n");

  if (highlighted) {
    return chalk.reset(frame);
  } else {
    return frame;
  }
}
});

function parse(text, opts) {
  let parseFunction;

  if (opts.parser === "flow") {
    parseFunction = eval("require")("./src/parser-flow");
  } else if (opts.parser === "typescript") {
    parseFunction = eval("require")("./src/parser-typescript");
  } else if (opts.parser === "postcss") {
    parseFunction = eval("require")("./src/parser-postcss");
  } else {
    parseFunction = eval("require")("./src/parser-babylon");
  }

  try {
    return parseFunction(text);
  } catch (error) {
    const loc = error.loc;

    if (loc) {
      const codeFrame = index$30;
      error.codeFrame = codeFrame.codeFrameColumns(text, loc, {
        highlightCode: true
      });
      error.message += "\n" + error.codeFrame;
      throw error;
    }

    throw error.stack;
  }
}

var parser$1 = { parse };

function flattenDoc(doc) {
  if (doc.type === "concat") {
    const res = [];

    for (let i = 0; i < doc.parts.length; ++i) {
      const doc2 = doc.parts[i];
      if (typeof doc2 !== "string" && doc2.type === "concat") {
        [].push.apply(res, flattenDoc(doc2).parts);
      } else {
        const flattened = flattenDoc(doc2);
        if (flattened !== "") {
          res.push(flattened);
        }
      }
    }

    return Object.assign({}, doc, { parts: res });
  } else if (doc.type === "if-break") {
    return Object.assign({}, doc, {
      breakContents: doc.breakContents != null
        ? flattenDoc(doc.breakContents)
        : null,
      flatContents: doc.flatContents != null
        ? flattenDoc(doc.flatContents)
        : null
    });
  } else if (doc.type === "group") {
    return Object.assign({}, doc, {
      contents: flattenDoc(doc.contents),
      expandedStates: doc.expandedStates
        ? doc.expandedStates.map(flattenDoc)
        : doc.expandedStates
    });
  } else if (doc.contents) {
    return Object.assign({}, doc, { contents: flattenDoc(doc.contents) });
  } else {
    return doc;
  }
}

function printDoc(doc) {
  if (typeof doc === "string") {
    return JSON.stringify(doc);
  }

  if (doc.type === "line") {
    if (doc.literalline) {
      return "literalline";
    }
    if (doc.hard) {
      return "hardline";
    }
    if (doc.soft) {
      return "softline";
    }
    return "line";
  }

  if (doc.type === "break-parent") {
    return "breakParent";
  }

  if (doc.type === "concat") {
    return "[" + doc.parts.map(printDoc).join(", ") + "]";
  }

  if (doc.type === "indent") {
    return "indent(" + printDoc(doc.contents) + ")";
  }

  if (doc.type === "align") {
    return "align(" + doc.n + ", " + printDoc(doc.contents) + ")";
  }

  if (doc.type === "if-break") {
    return (
      "ifBreak(" +
      printDoc(doc.breakContents) +
      (doc.flatContents ? ", " + printDoc(doc.flatContents) : "") +
      ")"
    );
  }

  if (doc.type === "group") {
    if (doc.expandedStates) {
      return (
        "conditionalGroup(" +
        "[" +
        doc.expandedStates.map(printDoc).join(",") +
        "])"
      );
    }

    return (
      (doc.break ? "wrappedGroup" : "group") +
      "(" +
      printDoc(doc.contents) +
      ")"
    );
  }

  if (doc.type === "fill") {
    return "fill" + "(" + doc.parts.map(printDoc).join(", ") + ")";
  }

  if (doc.type === "line-suffix") {
    return "lineSuffix(" + printDoc(doc.contents) + ")";
  }

  if (doc.type === "line-suffix-boundary") {
    return "lineSuffixBoundary";
  }

  throw new Error("Unknown doc type " + doc.type);
}

var docDebug = {
  printDocToDebug: function(doc) {
    return printDoc(flattenDoc(doc));
  }
};

var require$$1$13 = ( _package$1 && _package$1['default'] ) || _package$1;

const comments = comments$1;
const version = require$$1$13.version;
const printAstToDoc = printer.printAstToDoc;
const util = util$2;
const printDocToString = docPrinter.printDocToString;
const normalizeOptions = options.normalize;
const parser = parser$1;
const printDocToDebug = docDebug.printDocToDebug;

function guessLineEnding(text) {
  const index = text.indexOf("\n");
  if (index >= 0 && text.charAt(index - 1) === "\r") {
    return "\r\n";
  }
  return "\n";
}

function attachComments(text, ast, opts) {
  const astComments = ast.comments;
  if (astComments) {
    delete ast.comments;
    comments.attach(astComments, ast, text, opts);
  }
  ast.tokens = [];
  opts.originalText = text.trimRight();
  return astComments;
}

function ensureAllCommentsPrinted(astComments) {
  if (!astComments) {
    return;
  }

  for (let i = 0; i < astComments.length; ++i) {
    if (astComments[i].value.trim() === "prettier-ignore") {
      // If there's a prettier-ignore, we're not printing that sub-tree so we
      // don't know if the comments was printed or not.
      return;
    }
  }

  astComments.forEach(comment => {
    if (!comment.printed) {
      throw new Error(
        'Comment "' +
          comment.value.trim() +
          '" was not printed. Please report this error!'
      );
    }
    delete comment.printed;
  });
}

function formatWithCursor(text, opts, addAlignmentSize) {
  addAlignmentSize = addAlignmentSize || 0;

  const ast = parser.parse(text, opts);

  const formattedRangeOnly = formatRange(text, opts, ast);
  if (formattedRangeOnly) {
    return { formatted: formattedRangeOnly };
  }

  let cursorOffset;
  if (opts.cursorOffset >= 0) {
    const cursorNodeAndParents = findNodeAtOffset(ast, opts.cursorOffset);
    const cursorNode = cursorNodeAndParents.node;
    if (cursorNode) {
      cursorOffset = opts.cursorOffset - util.locStart(cursorNode);
      opts.cursorNode = cursorNode;
    }
  }

  const astComments = attachComments(text, ast, opts);
  const doc = printAstToDoc(ast, opts, addAlignmentSize);
  opts.newLine = guessLineEnding(text);
  const toStringResult = printDocToString(doc, opts);
  const str = toStringResult.formatted;
  const cursorOffsetResult = toStringResult.cursor;
  ensureAllCommentsPrinted(astComments);
  // Remove extra leading indentation as well as the added indentation after last newline
  if (addAlignmentSize > 0) {
    return { formatted: str.trim() + opts.newLine };
  }

  if (cursorOffset !== undefined) {
    return {
      formatted: str,
      cursorOffset: cursorOffsetResult + cursorOffset
    };
  }

  return { formatted: str };
}

function format(text, opts, addAlignmentSize) {
  return formatWithCursor(text, opts, addAlignmentSize).formatted;
}

function findSiblingAncestors(startNodeAndParents, endNodeAndParents) {
  let resultStartNode = startNodeAndParents.node;
  let resultEndNode = endNodeAndParents.node;

  for (const endParent of endNodeAndParents.parentNodes) {
    if (util.locStart(endParent) >= util.locStart(startNodeAndParents.node)) {
      resultEndNode = endParent;
    } else {
      break;
    }
  }

  for (const startParent of startNodeAndParents.parentNodes) {
    if (util.locEnd(startParent) <= util.locEnd(endNodeAndParents.node)) {
      resultStartNode = startParent;
    } else {
      break;
    }
  }

  return {
    startNode: resultStartNode,
    endNode: resultEndNode
  };
}

function findNodeAtOffset(node, offset, parentNodes) {
  parentNodes = parentNodes || [];
  const start = util.locStart(node);
  const end = util.locEnd(node);
  if (start <= offset && offset <= end) {
    for (const childNode of comments.getSortedChildNodes(node)) {
      const childResult = findNodeAtOffset(
        childNode,
        offset,
        [node].concat(parentNodes)
      );
      if (childResult) {
        return childResult;
      }
    }

    if (isSourceElement(node)) {
      return {
        node: node,
        parentNodes: parentNodes
      };
    }
  }
}

// See https://www.ecma-international.org/ecma-262/5.1/#sec-A.5
function isSourceElement(node) {
  if (node == null) {
    return false;
  }
  switch (node.type) {
    case "FunctionDeclaration":
    case "BlockStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "DebuggerStatement":
    case "DoWhileStatement":
    case "EmptyStatement":
    case "ExpressionStatement":
    case "ForInStatement":
    case "ForStatement":
    case "IfStatement":
    case "LabeledStatement":
    case "ReturnStatement":
    case "SwitchStatement":
    case "ThrowStatement":
    case "TryStatement":
    case "VariableDeclaration":
    case "WhileStatement":
    case "WithStatement":
      return true;
  }
  return false;
}

function calculateRange(text, opts, ast) {
  // Contract the range so that it has non-whitespace characters at its endpoints.
  // This ensures we can format a range that doesn't end on a node.
  const rangeStringOrig = text.slice(opts.rangeStart, opts.rangeEnd);
  const startNonWhitespace = Math.max(
    opts.rangeStart + rangeStringOrig.search(/\S/),
    opts.rangeStart
  );
  let endNonWhitespace;
  for (
    endNonWhitespace = opts.rangeEnd;
    endNonWhitespace > opts.rangeStart;
    --endNonWhitespace
  ) {
    if (text[endNonWhitespace - 1].match(/\S/)) {
      break;
    }
  }

  const startNodeAndParents = findNodeAtOffset(ast, startNonWhitespace);
  const endNodeAndParents = findNodeAtOffset(ast, endNonWhitespace);
  const siblingAncestors = findSiblingAncestors(
    startNodeAndParents,
    endNodeAndParents
  );
  const startNode = siblingAncestors.startNode;
  const endNode = siblingAncestors.endNode;
  const rangeStart = Math.min(util.locStart(startNode), util.locStart(endNode));
  const rangeEnd = Math.max(util.locEnd(startNode), util.locEnd(endNode));

  return {
    rangeStart: rangeStart,
    rangeEnd: rangeEnd
  };
}

function formatRange(text, opts, ast) {
  if (0 < opts.rangeStart || opts.rangeEnd < text.length) {
    const range = calculateRange(text, opts, ast);
    const rangeStart = range.rangeStart;
    const rangeEnd = range.rangeEnd;
    const rangeString = text.slice(rangeStart, rangeEnd);

    // Try to extend the range backwards to the beginning of the line.
    // This is so we can detect indentation correctly and restore it.
    // Use `Math.min` since `lastIndexOf` returns 0 when `rangeStart` is 0
    const rangeStart2 = Math.min(
      rangeStart,
      text.lastIndexOf("\n", rangeStart) + 1
    );
    const indentString = text.slice(rangeStart2, rangeStart);

    const alignmentSize = util.getAlignmentSize(indentString, opts.tabWidth);

    const rangeFormatted = format(
      rangeString,
      Object.assign({}, opts, {
        rangeStart: 0,
        rangeEnd: Infinity,
        printWidth: opts.printWidth - alignmentSize
      }),
      alignmentSize
    );

    // Since the range contracts to avoid trailing whitespace,
    // we need to remove the newline that was inserted by the `format` call.
    const rangeTrimmed = rangeFormatted.trimRight();

    return text.slice(0, rangeStart) + rangeTrimmed + text.slice(rangeEnd);
  }
}

var index = {
  formatWithCursor: function(text, opts) {
    return formatWithCursor(text, normalizeOptions(opts));
  },
  format: function(text, opts) {
    return format(text, normalizeOptions(opts));
  },
  check: function(text, opts) {
    try {
      const formatted = format(text, normalizeOptions(opts));
      return formatted === text;
    } catch (e) {
      return false;
    }
  },
  version: version,
  __debug: {
    parse: function(text, opts) {
      return parser.parse(text, opts);
    },
    formatAST: function(ast, opts) {
      opts = normalizeOptions(opts);
      const doc = printAstToDoc(ast, opts);
      const str = printDocToString(doc, opts);
      return str;
    },
    // Doesn't handle shebang for now
    formatDoc: function(doc, opts) {
      opts = normalizeOptions(opts);
      const debug = printDocToDebug(doc);
      const str = format(debug, opts);
      return str;
    },
    printToDoc: function(text, opts) {
      opts = normalizeOptions(opts);
      const ast = parser.parse(text, opts);
      attachComments(text, ast, opts);
      const doc = printAstToDoc(ast, opts);
      return doc;
    },
    printDocToString: function(doc, opts) {
      opts = normalizeOptions(opts);
      const str = printDocToString(doc, opts);
      return str;
    }
  }
};

module.exports = index;
