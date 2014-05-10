// Compiler
// --------

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
