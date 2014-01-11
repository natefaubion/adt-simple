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
