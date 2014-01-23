macro $adt__compile {
  case { _ $ctx $name $body $derivs } => {
    var ctx  = #{ $ctx };
    var here = #{ here };
    var name = #{ $name };
    var body = #{ $body }[0].token.inner;
    var derivs = #{ $derivs }[0].token.inner;
    var options = {};

    //= letstx.js
    //= utils.js
    //= options.js
    //= parser.js
    //= compiler.js

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
