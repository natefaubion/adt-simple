macro $adt__compile {
  case { _ $ctx $name $body $derivs } => {
    var ctx  = #{ $ctx };
    var here = #{ here };
    var name = #{ $name };
    var body = #{ $body }[0].token.inner;
    var derivs = #{ $derivs }[0].token.inner;
    var options = {};

    let letstx = macro {
      case { $mac $id:ident $punc = $rhs:expr } => {
        var mac = #{ $mac };
        var id  = #{ $id };
        var val = #{ $val };
        var arg = #{ $($rhs) };
        var punc = #{ $punc };
        var here = #{ here };
        if (punc[0].token.type !== parser.Token.Punctuator ||
            punc[0].token.value !== '...') {
          throw new SyntaxError('Unexpected token: ' + punc[0].token.value +
                                ' (expected ...)');
        }
        if (id[0].token.value[0] !== '$') {
          throw new SyntaxError('Syntax identifiers must start with $: ' + 
                                id[0].token.value);
        }
        return [
          makeIdent('match', mac),
          makePunc('.', here),
          makeIdent('patternEnv', here),
          makeDelim('[]', [makeValue(id[0].token.value, here)], here),
          makePunc('=', here),
          makeDelim('{}', [
            makeIdent('level', here), makePunc(':', here), makeValue(1, here), makePunc(',', here),
            makeIdent('match', here), makePunc(':', here), makeDelim('()', #{
              (function(exp) {
                return exp.length
                  ? exp.map(function(t) { return { level: 0, match: [t] } })
                  : [{ level: 0, match: [] }];
              })
            }, here), makeDelim('()', arg, here)
          ], here)
        ];
      }
      case { $mac $id:ident = $rhs:expr } => {
        var mac = #{ $mac };
        var id  = #{ $id };
        var val = #{ $val };
        var arg = #{ $($rhs) };
        var here = #{ here };
        if (id[0].token.value[0] !== '$') {
          throw new SyntaxError('Syntax identifiers must start with $: ' + 
                                id[0].token.value);
        }
        return [
          makeIdent('match', mac),
          makePunc('.', here),
          makeIdent('patternEnv', here),
          makeDelim('[]', [makeValue(id[0].token.value, here)], here),
          makePunc('=', here),
          makeDelim('{}', [
            makeIdent('level', here), makePunc(':', here), makeValue(0, here), makePunc(',', here),
            makeIdent('match', here), makePunc(':', here), arg[0]
          ], here)
        ];
      }
    }
    function syntaxError(tok, err, info) {
      if (!err) err = 'Unexpected token';
      if (info) err += ' (' + info + ')';
      throwSyntaxError('adt-simple', err, tok);
    }
    function matchesToken(tmpl, t) {
      if (t && t.length === 1) t = t[0];
      if (!t || tmpl.type && t.token.type !== tmpl.type 
             || tmpl.value && t.token.value !== tmpl.value) return false;
      return true;
    }
    function input(stx) {
      var pos = 0;
      var inp = {
        length: stx.length,
        buffer: stx,
        peek: peek,
        take: take,
        takeAPeek: takeAPeek,
        back: back,
        rest: rest
      };
      return inp;
      function peek() {
        if (arguments.length === 0) {
          return [stx[pos]];
        }
        if (typeof arguments[0] === 'number') {
          if (inp.length < arguments[0]) return;
          return stx.slice(pos, pos + arguments[0]);
        }
        var res = [];
        for (var i = 0, j = pos, t, a, m; i < arguments.length; i++) {
          a = arguments[i];
          t = stx[j++];
          if (!matchesToken(a, t)) return;
          res.push(t);
        }
        return res;
      }
      function take(len) {
        var res = stx.slice(pos, pos + (len || 1));
        pos += len || 1;
        inp.length -= len || 1;
        return res;
      }
      function takeAPeek() {
        var res = peek.apply(null, arguments);
        if (res) return take(res.length);
      }
      function back(len) {
        pos -= len || 1;
        inp.length += len || 1;
      }
      function rest() {
        return stx.slice(pos);
      }
    }
    var cid = 0;
    function makeConstraint() {
      return [makeIdent('c' + (++cid), here)];
    }
    var pragmas = {
      overrideApply: /@overrideapply\b/gmi,
      newRequired: /@newrequired\b/gmi,
      scoped: /@scoped\b/gmi
    };
    if (ctx[0].token.leadingComments) {
      ctx[0].token.leadingComments.forEach(function(comment) {
        Object.keys(pragmas).forEach(function(optName) {
          if (comment.value.match(pragmas[optName])) {
            options[optName] = true;
          }
        });
      });
    }
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
    var isData = unwrapSyntax(ctx) === 'data';
    var isUnion = unwrapSyntax(ctx) === 'union';
    function compile(tmpls, derivers) {
      letstx $parentName = [makeIdent(unwrapSyntax(name), here)];
      letstx $ctrs ... = compileConstructors(tmpls);
      letstx $derived ... = derivers.length ? compileDeriving(tmpls, derivers) : [];
      letstx $export ... = compileExport(tmpls, derivers.length);
      letstx $unwrapped ... = options.scoped ? [] : compileUnwrap(tmpls);
      if (isData) {
        if (derivers.length) {
          var exp = tmpls[0].fields
            ? #{ return derived.constructor; }
            : #{ return new derived.constructor(); };
          letstx $export ... = exp;
          return #{
            var $name = function() {
              $ctrs ...
              $derived ...
              $export ...
            }();
          }
        } else {
          var exp = tmpls[0].fields
            ? #{ return $parentName; }
            : #{ return new $parentName(); };
          letstx $export ... = exp;
          return #{
            var $name = function() {
              $ctrs ...
              $export ...
            }();
          }
        }
      } else {
        var parentBody = [];
        if (options.overrideApply) {
          parentBody = #{
            if ($parentName.apply !== Function.prototype.apply) {
              return $parentName.apply(this, arguments);
            }
          }
        }
        letstx $parentBody ... = parentBody;
        return #{
          var $name = function() {
            function $parentName() {
              $parentBody ...
            }
            $ctrs ...
            $derived ...
            $export ...
            return $parentName;
          }();
          $unwrapped ...
        }
      }
    }
    function compileConstructors(tmpls) {
      return tmpls.reduce(function(stx, tmpl) {
        var res = tmpl.fields
          ? compileRecord(tmpl)
          : compileSingleton(tmpl);
        return stx.concat(res);
      }, []);
    }
    function compileRecord(tmpl) {
      var args = tmpl.fields.reduce(function(acc, f) {
        f.arg = [makeIdent(f.arg, here)];
        return acc.concat(f.arg);
      }, []);
      var constraints = tmpl.fields.reduce(function(stx, f) {
        if (f.constraint.type !== 'literal') {
          return stx;
        }
        f.constraint.ref = makeConstraint();
        return stx.concat(compileConstraint(f.constraint));
      }, []);
      var fields = tmpl.fields.reduce(function(stx, f) {
        return stx.concat(compileField(f, tmpl));
      }, []);
      if (tmpl.positional) {
        letstx $ctrLength = [makeValue(tmpl.fields.length, here)];
      };
      letstx $ctrName = [makeIdent(tmpl.name, here)];
      letstx $ctrArgs ... = args;
      var ctrBody;
      if (options.newRequired) {
        ctrBody = [];
      } else {
        ctrBody = #{
          if (!(this instanceof $ctrName)) {
            return new $ctrName($ctrArgs (,) ...);
          }
        }
      }
      letstx $ctrBody ... = ctrBody;
      letstx $ctrFields ... = fields;
      letstx $ctrCons ... = constraints;
      return #{
        $ctrCons ...
        function $ctrName($ctrArgs (,) ...) {
          $ctrBody ...
          $ctrFields ...
        }
      }.concat(isData ? [] : #{
        $ctrName.prototype = new $parentName();
        $ctrName.prototype.constructor = $ctrName;
      }).concat(!tmpl.positional ? [] : #{
        $ctrName.prototype.length = $ctrLength;
      });
    }
    function compileSingleton(tmpl) {
      letstx $ctrVal = tmpl.value || [];
      var assign = tmpl.value ? #{ this.value = $ctrVal; } : [];
      letstx $ctrName = [makeIdent(tmpl.name, here)];
      letstx $ctrAssign ... = assign;
      return #{
        function $ctrName() {
          $ctrAssign ...
        }
      }.concat(isData ? [] : #{
        $ctrName.prototype = new $parentName();
        $ctrName.prototype.constructor = $ctrName;
      });
    }
    function compileExport(tmpls, derived) {
      return tmpls.reduce(function(stx, tmpl, i) {
        letstx $ctrName = [makeIdent(tmpl.name, here)];
        letstx $ctrIndex = [makeValue(i, here)];
        var res;
        if (derived) {
          letstx $derivedRef = [makeIdent('derived', here)];
          res = tmpl.fields
            ? #{ $parentName.$ctrName = $derivedRef.variants[$ctrIndex].constructor; }
            : #{ $parentName.$ctrName = new $derivedRef.variants[$ctrIndex].constructor(); }
        } else {
          res = tmpl.fields
            ? #{ $parentName.$ctrName = $ctrName; }
            : #{ $parentName.$ctrName = new $ctrName(); };
        }
        return stx.concat(res);
      }, []);
    }
    function compileField(field, record) {
      letstx $fieldArg = field.arg;
      letstx $fieldName = record.positional
        ? [makeKeyword('this', here), makeDelim('[]', [makeValue(field.name, here)], here)]
        : [makeKeyword('this', here), makePunc('.', here), makeIdent(field.name, here)];
      if (field.constraint.type === 'any') {
        return #{
          $fieldName = $fieldArg;
        }
      }
      if (field.constraint.type === 'class') {
        var fullName = isData
          ? [record.name, field.name].join('.')
          : [unwrapSyntax(name), record.name, field.name].join('.');
        letstx $fieldCheck ... = compileInstanceCheck(field.constraint);
        letstx $fieldError = [makeValue('Unexpected type for field: ' + fullName, here)];
        return #{
          if ($fieldCheck ...) {
            $fieldName = $fieldArg;
          } else {
            throw new TypeError($fieldError);
          }
        }
      }
      if (field.constraint.type === 'literal') {
        letstx $fieldCons = field.constraint.ref;
        return #{
          $fieldName = $fieldCons($fieldArg);
        }
      }
    }
    function compileInstanceCheck(cons) {
      if (cons.stx.length === 1) {
        var name = unwrapSyntax(cons.stx);
        switch(name) {
          case 'String': 
            return #{ 
              typeof $fieldArg === 'string' || 
              Object.prototype.toString.call($fieldArg) === '[object String]' 
            }
          case 'Number': 
            return #{ 
              typeof $fieldArg === 'number' ||
              Object.prototype.toString.call($fieldArg) === '[object Number]'
            }
          case 'Boolean': 
            return #{ 
              typeof $fieldArg === 'boolean' ||
              Object.prototype.toString.call($fieldArg) === '[object Boolean]'
            }
          case 'RegExp': 
            return #{ 
              Object.prototype.toString.call($fieldArg) === '[object RegExp]'
            }
          case 'Date': 
            return #{ 
              Object.prototype.toString.call($fieldArg) === '[object Date]'
            }
          case 'Function': 
            return #{ 
              Object.prototype.toString.call($fieldArg) === '[object Function]'
            }
          case 'Array': 
            return #{ 
              Array.isArray
                ? Array.isArray($fieldArg)
                : Object.prototype.toString.call($fieldArg) === '[object Array]'
            }
          case 'Object': 
            return #{ 
              $fieldArg != null && ($fieldArg = Object($fieldArg))
            }
        }
      }
      letstx $fieldClass ... = cons.stx;
      return #{
        $fieldArg instanceof $fieldClass ...
      }
    }
    function compileConstraint(cons) {
      letstx $consRef = cons.ref;
      letstx $consStx ... = cons.stx;
      return #{
        var $consRef = $consStx ...;
      }
    }
    function compileDeriving(tmpls, derivers) {
      var variants = tmpls.reduce(function(stx, tmpl) {
        return stx.concat(compileTemplate(tmpl));
      }, []);
      letstx $derivedRef = [makeIdent('derived', here)];
      letstx $nameStr = [makeValue(unwrapSyntax(name), here)];
      letstx $variants ... = variants;
      var template = #{{ 
        name: $nameStr, 
        constructor: $parentName,
        prototype: $parentName.prototype,
        variants: [$variants (,) ...] 
      }};
      var calls = derivers.reduce(function(stx, d) {
        letstx $deriver ... = d;
        letstx $deriverArg ... = stx;
        return #{
          $deriver ... .derive($deriverArg ...)
        }
      }, template);
      letstx $derivers ... = calls;
      return #{
        var $derivedRef = $derivers ...;
      }
    }
    function compileTemplate(tmpl) {
      letstx $tmplName = [makeValue(tmpl.name, here)];
      letstx $tmplCtr = [makeIdent(tmpl.name, here)];
      var res = #{
        { 
          name: $tmplName, 
          constructor: $tmplCtr,
          prototype: $tmplCtr.prototype
        }
      };
      if (tmpl.fields) {
        letstx $tmplFields ... = tmpl.fields.map(function(f) {
          return makeValue(f.name, here);
        });
        res[0].token.inner = res[0].token.inner.concat(#{
          , fields: [$tmplFields (,) ...]
        });
      }
      return res;
    }
    function compileUnwrap(tmpls) {
      return tmpls.reduce(function(stx, tmpl) {
        letstx $tmplName = [makeIdent(tmpl.name, ctx)];
        return stx.concat(#{
          var $tmplName = $name.$tmplName;
        });
      }, []);
    }

    return compile(parse(body), parseDerivers(derivs));
  }
}

macro $adt__deriving {
  case { _ $ctx $name $body deriving ( $derivs:expr (,) ... ) } => {
    return #{
      $adt__compile $ctx $name $body ($(($derivs)) ...)
    }
  }
  case { _ $ctx $name $body deriving $deriv:expr } => {
    return #{
      $adt__compile $ctx $name $body (($deriv))
    }
  }
  case { _ $ctx $name $body deriving } => {
    throwSyntaxError('adt-simple', 'Expected deriver', #{ $ctx });
  }
  case { _ $ctx $name $body } => {
    return #{
      $adt__compile $ctx $name $body ()
    }
  }
}

let union = macro {
  case { $ctx $name:ident { $body ... } } => {
    return #{
      $adt__deriving $ctx $name {$body ...}
    }
  }
  case { _ } => {
    return #{ union }
  }
}

let data = macro {
  case { $ctx $name:ident { $fields ... } } => {
    return #{
      $adt__deriving $ctx $name {$name { $fields ... }}
    }
  }
  case { $ctx $name:ident ( $fields ... ) } => {
    return #{
      $adt__deriving $ctx $name {$name ($fields ... )}
    }
  }
  case { $ctx $name:ident = $value:expr } => {
    return #{
      $adt__deriving $ctx $name {$name = $value}
    }
  }
  case { $ctx $name:ident } => {
    return #{
      $adt__deriving $ctx $name {$name}
    }
  }
  case { _ } => {
    return #{ data }
  }
}

export union;
export data;
