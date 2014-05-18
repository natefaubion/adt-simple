adt-simple
==========

Native algebraic data types for JavaScript using
[sweet.js](https://github.com/mozilla/sweet.js) macros

Features
--------

*   No required runtime dependencies
*   `deriving` sugar for mixing in generic behavior
*   A catalogue of behavior mixins (`Eq`, `Clone`, `ToJSON`, etc)

Install
-------

    npm install -g sweet.js
    npm install adt-simple
    sjs -m adt-simple/macros myfile.js

Basic Usage
-----------

adt-simple exports a `data` macro for creating simple data constructors.

```js
data Singleton
data SingletonVal = 42
data Tuple(*, *)
data Employee {
  name: String,
  salary: Number
}

// Singletons can have constant values
SingletonVal.value === 42;

// Positional fields
var tup = Tuple(1, 2);
tup[0] === 1;
tup[1] === 2;

// Named fields
var pete = Employee('Peter Gibbons', 85000);
pete.name === 'Peter Gibbons';
pete.salary === 85000;
```

It also exports a `union` macro for grouping your constructors.

```js
union Maybe {
  Nothing,
  Just {
    value: *
  }
}

// Basic inheritance
Nothing instanceof Maybe;
Just(42) instanceof Maybe;

// Constructors exported on the parent
Maybe.Nothing === Nothing;
Maybe.Just === Just;
```

You can even build recursive unions.

```js
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
}

var list = Cons(1, Cons(2, Cons(3, Nil)));
list.head === 1;
list.tail.head === 2;
list.tail.tail.head === 3;

// TypeError('Unexpected type for field: List.Cons.tail')
Cons(1, 2)
```

adt-simple doesn't just do instance checking. You can put in your own custom
constraints that validate or transform values:

```js
function toString(x) {
  return x.toString();
}

data OnlyStrings {
  value: toString  
}

OnlyStrings(42).value === '42';
```

It tries to do the right thing: if the identifier starts with a capital letter
(taking namespaces into consideration), it will do instance checking, otherwise
it will call the constraint as a function. The instance checking is smart about
built-in JavaScript types, so it will do proper tag checks for `Boolean`,
`Number`, `Array`, etc beyond just `instanceof`.

Deriving
--------

adt-simple also supports a powerful sugar for deriving generic behaviour:

```js
union Maybe {
  Nothing,
  Just {
    value: *
  }
} deriving (Eq, Clone)
```

This works for both `union` and `data` constructors.

Built-in Derivers
-----------------

You can import built-in derivers by requiring the `adt-simple` library (< 1KB).
It's available as a `UMD` module, so you can use it in the browser with
require.js or with the global `adt` namespace.

```js
var Eq = require('adt-simple').Eq;
```

*   [Eq](#eq)
*   [Clone](#clone)
*   [Setter](#setter)
*   [ToString](#tostring)
*   [ToJSON](#tojson)
*   [Curry](#curry)
*   [Extractor](#extractor)
*   [Reflect](#reflect)
*   [Cata](#cata)
*   [LateDeriving](#latederiving)
*   [Base](#base)

Writing Your Own Derivers
-------------------------

Derivers are simply objects with a `derive` method. The `derive` method is
called with a template of the ADT so you can traverse, inspect, extend, or
modify it. Here's what a template for a `List` union would look like:

```js
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
}

{
  name: 'List',
  constructor: List,
  prototype: List.prototype,
  variants: [
    {
      name: 'Nil',
      constructor: Nil,
      prototype: Nil.prototype
    },
    {
      name: 'Cons',
      constructor: Cons,
      prototype: Cons.prototype,
      fields: ['head', 'tail']
    }
  ]
}
```

Here's how you might write a deriver to get positional fields on a record:

```js
var Get = {
  derive: function(adt) {
    adt.variants.forEach(function(v) {
      if (v.fields) {
        v.prototype.get = function(i) {
          return this[v.fields[i]];
        };
      } else {
        v.prototype.get = function() {
          throw new Error('No fields');
        };
      }
    })
    return adt;
  }
};
```

Notice how you need to return the template at the end of the function to pass
on to the next deriver in the chain. You are free to mutate or tag the template
as needed to communicate between derivers.

Since the above pattern is so common, you can use the `eachVariant` helper to
shorten your code.

```js
var eachVariant = require('adt-simple').eachVariant;
var Get = {
  derive: eachVariant(function(v, adt) {
    if (v.fields) {
      v.prototype.get = function(i) {
        return this[v.fields[i]];
      };
    } else {
      v.prototype.get = function() {
        throw new Error('No fields')
      };
    }
  })
};
```

You can also use `composeDeriving` to compose derivers together into a single
chain.

```js
var composeDeriving = require('adt-simple').composeDeriving;
var MyDeriver = composeDeriving(Eq, Clone, Setter, Curry);

data Foo(*, *) deriving MyDeriver
```

Derivers are just expressions, so you can even parameterize them.

```js
var Log = function(prefix) {
  return {
    derive: eachVariant(function(v) {
      v.prototype.log = function() {
        console.log(prefix + ' ' + this.toString());
      };
    })
  }
};

data Foo(*, *) deriving Log('hello')

Foo(1, 2).log() // logs: hello Foo(1, 2)
```

Compiler Pragmas
----------------

adt-simple has sensible defaults, but you can also configure the output by
adding one or more pragma comments before your definition.

```js
/* @newrequired, @scoped */
union Foo {
  Bar,
  Baz
}
```

### `@newrequired`

By default, constructors can be called without a `new` keyword. This pragma
disables the `instanceof` check that enables this behavior, leaving you with
a simpler constructor. **Note:** this pragma will conflict with the `Curry`
deriver.

### `@scoped`

All union variants are unwrapped and put in the outer scope. This pragma
disables the unwrapping and leaves them scoped to the parent.

### `@overrideapply`

This pragma lets you define a custom `apply` method on the parent constructor,
which lets you call it as a normal function.

```js
/* @overrideapply */
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
} deriving ToString

List.apply = function(ctx, args) {
  // Turn an array into a list
};

List(1, 2, 3).toString() === 'Cons(1, Cons(2, Cons(3, Nil)))';
```

---

### `Eq`

Implements an `equals` method for deep equality:

```js
data Foo(*) deriving Eq
Foo(Foo(1)).equals(Foo(Foo(1))) === true;
```

By default, `Eq` uses reference equality for anything without an `equals`
method, but you can override it. For example, using `lodash`:

```js
Eq.nativeEquals = _.isEqual;
Foo([1, 2, 3]).equals(Foo([1, 2, 3])) === true;
```

### `Clone`

Implements a `clone` method for making deep copies:

```js
data Foo(*) deriving Clone

var foo1 = Foo(1);
var foo2 = foo1.clone();

foo1 !== foo2 && foo2[0] === 1;
```

Like with `Eq`, `Clone` copies by references anything without a `clone` method.
You can override that behavior in a similar way. Using `lodash`:

```js
Clone.nativeClone = _.cloneDeep;
```

### `Setter`

Extends constructors with a `create` method and instances with a `set` method
for setting named values. `set` returns a shallow copy with the provided values
changed.

```js
data Foo {
  bar: *,
  baz: *
} deriving Setter

var foo1 = Foo.create({ bar: 42, baz: 12 });
var foo2 = foo1.set({ bar: 43 });

foo1 !== foo2;
foo2.bar === 43 && foo2.baz === foo1.baz;
```

### `ToString`

Extends instances with a good `toString` implementation.

```js
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
} deriving ToString

var list = Cons(1, Cons(2, Cons(3, Nil)));
list.toString() === 'Cons(1, Cons(2, Cons(3, Nil)))';
```

### `ToJSON`

Implements a `toJSON` method. You can configure how singletons are serialized
by assigning a constant value to it.

```js
union List {
  Nil = null,
  Cons {
    head: *,
    tail: List
  }
} deriving ToJSON

var list = Cons(1, Cons(2, Cons(3, Nil)));
list.toJSON()
{
  head: 1,
  tail: {
    head: 2,
    tail: {
      head: 3,
      tail: null
    }
  }
}
```

### `Curry`

Implements constructor currying and partial application.

```js
data Foo(*, *, *) deriving Curry

Foo(1, 2, 3);
Foo(1)(2)(3);
Foo(1, 2)(3);
Foo(1)(2, 3);
```

### `Extractor`

Implements the [sparkler](https://github.com/natefaubion/sparkler) extractor
protocol so you can pattern match on your data instances.

```js
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
} deriving Extractor

List.prototype.map = function(fn) {
  return match this {
    Nil => Nil,
    Cons(x, xs) => Cons(fn(x), xs.map(fn))
  }
}
```

### `Reflect`

Implements tag properties and field/union name reflection.

```js
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
} deriving Reflect


Nil.isNil === true;
Cons(1, Nil).isCons === true;

List.__names__ // ['Nil', 'Cons']
Cons.__fields__ // ['head', 'tail']
```

### `Cata`

Implements a `cata` method (ala [daggy](https://github.com/puffnfresh/daggy))
for doing dispatching and destructuring.

```js
union List {
  Nil,
  Cons {
    head: *,
    tail: List
  }
} deriving Cata

List.prototype.map = function(fn) {
  return this.cata({
    Nil: function() {
      return Nil;
    },
    Cons: function(x, xs) {
      return Cons(fn(x), xs.map(fn));
    }
  })
}
```

### `LateDeriving`

Extends constructors with a `deriving` method for deriving after-the-fact.

```js
data Foo {
  bar: *,
  baz: *
} deriving LateDeriving

Foo.deriving(Eq, Clone);
```

### `Base`

A composition of `Eq`, `Clone`, `Setter`, `ToString`, `Reflect`, and `Extractor`.

---

### Author
Nathan Faubion (@natefaubion)

### License
MIT
