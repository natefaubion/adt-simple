var assert = require('chai').assert;

describe 'Expansion' {
  it 'should support the data macro' {
    data Test1
    data Test2 = 'test'
    data Test3(*, *)
    data Test4 { foo: *, bar }

    var posTest = Test3(1, 2);
    var recTest = Test4(3, 4);

    test 'singleton, no value' { Test1 }
    test 'singleton, w/ value' { Test2.value === 'test' }
    test 'positional' { posTest[0] === 1 && posTest[1] === 2 }
    test 'record' { recTest.foo === 3 && recTest.bar === 4 }
  }

  it 'should support the union macro' {
    union Test {
      Test1,
      Test2 = 'test',
      Test3(*, *),
      Test4 { foo: *, bar }
    }

    var posTest = Test3(1, 2);
    var recTest = Test4(3, 4);

    test 'singleton, no value' { Test1 }
    test 'singleton, w/ value' { Test2.value === 'test' }
    test 'positional' { posTest[0] === 1 && posTest[1] === 2 }
    test 'record' { recTest.foo === 3 && recTest.bar === 4 }

    test 'exported on parent' {
      Test.Test1 === Test1 &&
      Test.Test2 === Test2 &&
      Test.Test3 === Test3 &&
      Test.Test4 === Test4
    }

    test 'inheritance' {
      Test1 instanceof Test &&
      Test2 instanceof Test &&
      Test3(1, 2) instanceof Test &&
      Test4(3, 4) instanceof Test
    }
  }

  it 'should support deriving sugar' {
    var TestDerive1 = {
      derive: function(adt) {
        adt.prototype.test1 = 'foo';
        return adt;
      }
    };

    var TestDerive2 = {
      derive: function(adt) {
        adt.prototype.test2 = 'bar';
        return adt;
      }
    };

    data Test1
      deriving TestDerive1

    union Test {
      Test2
    } deriving (TestDerive1, TestDerive2)

    test 'single deriver' { Test1.test1 === 'foo' }
    test 'multiple derivers' { Test2.test1 === 'foo' && Test2.test2 === 'bar' }
  }

  it 'should support deriving arbitrary expression' {
    var TestDerive1 = function(param) {
      return {
        derive: function(adt) {
          adt.prototype.test1 = param;
          return adt;
        }
      }
    };

    data Test1 
      deriving TestDerive1('foo')

    data Test2
      deriving {
        derive: function(adt) {
          adt.prototype.test2 = 'bar';
          return adt;
        }
      }

    test 'success' { Test1.test1 === 'foo' && Test2.test2 === 'bar' }
  }

  it 'should derive in order' {
    var ord = [];
    var TestDerive1 = {
      derive: function(adt) {
        ord.push(1);
        return adt;
      }
    };

    var TestDerive2 = {
      derive: function(adt) {
        ord.push(2);
        return adt;
      }
    };

    var TestDerive3 = {
      derive: function(adt) {
        ord.push(3);
        return adt;
      }
    };

    data Test
      deriving (TestDerive1, TestDerive2, TestDerive3)

    test 'order' { [1, 2, 3] =>= ord }
  }

  it 'should generate an accurate template' {
    var tmpl;
    var TestDerive = {
      derive: function(adt) {
        tmpl = adt;
        return adt;
      }
    };

    union Test {
      Test1,
      Test2(*, *),
      Test3{ foo: *, bar: * }
    } deriving TestDerive

    test 'template' {
      {
        name: 'Test',
        constructor: Test,
        prototype: Test.prototype,
        variants: [
          {
            name: 'Test1',
            constructor: Test1.constructor,
            prototype: Test1.constructor.prototype
          },
          {
            name: 'Test2',
            constructor: Test2,
            prototype: Test2.prototype,
            fields: ['0', '1']
          },
          {
            name: 'Test3',
            constructor: Test3,
            prototype: Test3.prototype,
            fields: ['foo', 'bar']
          },
        ]
      } =>= tmpl
    }
  }

  it 'should support class instance constraints' {
    union Foo {
      One,
      Two
    }

    var deep = {
      namespace: {
        Foo: Foo
      }
    };

    data Bar(Foo)
    data Baz(deep.namespace.Foo)

    test 'class success' { Bar(One) }
    test 'class failure' { Bar(1) =!= TypeError }

    test 'namespace success' { Baz(One) }
    test 'namespace failure' { Baz(1) =!= TypeError }
  }

  it 'should support function constraints' {
    data Foo {
      bar: function(x) {
        return x.toString();
      }
    }

    test 'success' { Foo(42).bar === '42' }
  }

  it 'should support the @scoped pragma' {
    /* @scoped */
    union Foo {
      Bar,
      Baz
    }

    test 'success' { Foo.Bar && Foo.Baz }
    test 'fail 1' { Bar =!= ReferenceError }
    test 'fail 2' { Baz =!= ReferenceError }
  }

  it 'should support the @newrequired pragma' {
    /* @newrequired */
    data Foo { aaa, bbb }
    var a = new Foo(1, 2);
    var b = Foo(1, 2);

    test 'success' { a instanceof Foo }
    test 'fail' { b === void 0 }
  }

  it 'should support the @overrideapply pragma' {
    /* @overrideapply */
    union Foo {
      Bar,
      Baz
    }

    Foo.apply = function(ctx, args) {
      return args[0] ? Bar : Baz;
    };

    test 'success' { Foo(true) === Bar && Foo(false) === Baz }
  }

  it 'should support keyword properties' {
    data Foo { case, default, class }
    var a = Foo(1, 2, 3);

    test 'success' { a.case === 1 && a.default === 2 && a.class === 3 }
  }

  it 'should support other ADTs as constraints' {
    data Foo(*)
    data Bar { a: Foo }
    union Baz {
      A { a: Foo }
    }

    test 'data'    { Bar(Foo(1)) }
    test 'union'   { A(Foo(1)) }
    test 'failure' { A(42) =!= TypeError }
  }
}
