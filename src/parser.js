// Parser
// ------

var T        = parser.Token;
var EQ       = { type: T.Punctuator, value: '=' };
var COLON    = { type: T.Punctuator, value: ':' };
var COMMA    = { type: T.Punctuator, value: ',' };
var PERIOD   = { type: T.Punctuator, value: '.' };
var WILDCARD = { type: T.Punctuator, value: '*' };
var PARENS   = { type: T.Delimiter,  value: '()' };
var BRACES   = { type: T.Delimiter,  value: '{}' };
var IDENT    = { type: T.Identifier };
var KEYWORD  = { type: T.Keyword };

function parse(stx) {
  var inp = input(stx);
  var res = commaSeparated(parseConstructor, inp);
  if (res.length === 0) {
    syntaxError(null, 'Expected constructor');
  }
  return res;
}

function parseConstructor(inp) {
  return parseRecord(inp)
      || parsePositional(inp)
      || parseSingleton(inp);
}

function parseRecord(inp) {
  var res = inp.takeAPeek(IDENT, BRACES);
  if (res) {
    return {
      name: unwrapSyntax(res[0]),
      fields: commaSeparated(parseField, input(res[1].expose().token.inner))
    };
  }
}

function parsePositional(inp) {
  var res = inp.takeAPeek(IDENT, PARENS);
  if (res) {
    var inp2 = input(res[1].expose().token.inner);
    return {
      name: unwrapSyntax(res[0]),
      positional: true,
      fields: commaSeparated(parseConstraint, inp2).map(function(c, i) {
        return { name: i.toString(), arg: '_' + i.toString(),  constraint: c };
      })
    };
  }
}

function parseSingleton(inp) {
  var res = inp.takeAPeek(IDENT);
  var val;
  if (res) {
    if (inp.takeAPeek(EQ)) {
      val = takeUntil(COMMA, inp);
      if (!val) syntaxError(inp.back().take(), 'Expected value');
    }
    var ret = { name: unwrapSyntax(res[0]) };
    if (val) ret.value = val;
    return ret;
  }
}

function parseField(inp) {
  var res1 = inp.takeAPeek(IDENT) || inp.takeAPeek(KEYWORD);
  if (res1) {
    var name = unwrapSyntax(res1[0]);
    var arg = res1[0].token.type === T.Keyword ? '_' + name : name;
    var res2 = inp.takeAPeek(COLON);
    if (res2) {
      var cons = parseConstraint(inp);
      if (cons) {
        return {
          name: name,
          arg: arg,
          constraint: cons
        };
      }
      syntaxError(res2, 'Expected constraint');
    } else {
      return {
        name: name,
        arg: arg,
        constraint: { type: 'any' }
      }
    }
  }
}

function parseConstraint(inp) {
  var res = inp.takeAPeek(WILDCARD);
  if (res) return { type: 'any' };

  res = parseClassName(inp);
  if (res) return { type: 'class', stx: res };

  res = takeUntil(COMMA, inp);
  if (res.length) {
    var expr = getExpr(res);
    if (expr.success && !expr.rest.length) {
      return { type: 'literal', stx: expr.result };
    }
    syntaxError(expr.success ? expr.rest[0] : res[0]);
  }
  if (inp.length) {
    syntaxError(inp.take());
  }
}

function parseClassName(inp) {
  var stx = [], tok;
  while (tok = inp.peek()) {
    if (stx.length === 0 && matchesToken(IDENT, tok) ||
        stx.length && matchesToken(IDENT, stx[0]) && matchesToken(PERIOD, tok) ||
        stx.length && matchesToken(IDENT, tok) && matchesToken(PERIOD, stx[0])) {
      stx.unshift(inp.take()[0]);
    } else break;
  }

  if (stx.length) {
    if (matchesToken(PERIOD, stx[0])) syntaxError(stx[0]);
    var name = stx[0].token.value;
    if (name[0].toUpperCase() === name[0] &&
        name[0] !== '$' && name[0] !== '_') {
      return stx.reverse();
    } else {
      inp.back(stx.length);
    }
  }
}

function parseDerivers(stx) {
  return stx.map(function(delim) {
    return delim.expose().token.inner;
  });
}

function commaSeparated(parser, inp, cb) {
  var all = [], res;
  while (inp.length) {
    res = parser(inp);
    if (res && !cb || res && cb(res, inp)) {
      all.push(res);
      if (!inp.takeAPeek(COMMA) && inp.length) {
        syntaxError(inp.take(), null, 'maybe you meant ,');
      }
    } else if (!res) {
      syntaxError(inp.take());
    }
  }
  return all;
}

function takeUntil(tok, inp) {
  var res = [];
  while (inp.length && !inp.peek(tok)) {
    res.push(inp.take()[0]);
  }
  return res;
}
