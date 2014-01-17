var assert = require('chai').assert;
var adt = require('../adt-simple');
var Eq = adt.Eq;
var Clone = adt.Clone;
var Setter = adt.Setter;
var ToString = adt.ToString;
var ToJSON = adt.ToJSON;
var Curry = adt.Curry;
var Extractor = adt.Extractor;
var Reflect = adt.Reflect;
var Cata = adt.Cata;
var LateDeriving = adt.LateDeriving;

describe 'Eq' {
  data Test(*, *, *)
    deriving Eq

  it 'should recursively compare values' {
    var a = Test(1, 2, 3);
    var b = Test(1, 2, 3);
    var c = Test(1, 2, Test(3, 4, 5));
    var d = Test(1, 2, Test(3, 4, 5));
    var e = Test(1, 2, Test(3, 4, 6));

    test 'shallow success' { a.equals(b)  }
    test 'shallow failure' { !a.equals(c) }
    test 'nested success'  { c.equals(d)  }
    test 'nested failure'  { !c.equals(e) }
  }

  it 'should compare native values by reference' {
    var a = Test([1, 2]);
    var b = Test([1, 2]);
    var c = Test(a[0]);

    test 'failure' { !a.equals(b) }
    test 'success' { a.equals(c)  }
  }

  it 'should allow override for native comparisons' {
    var a = Test(1);
    var b = Test(2);
    var oldeq = Eq.nativeEquals;
    Eq.nativeEquals = function() { return true };
    test 'success' { a.equals(b) }
    Eq.nativeEquals = oldeq;
  }
}

describe 'Clone' {
  data Test(*)
    deriving (Eq, Clone)

  data Test2
    deriving Clone

  it 'should clone' {
    var a = Test(1);
    var b = a.clone();

    test 'success' { a !== b && a.equals(b) }
  }

  it 'should deep clone' {
    var a = Test(Test(1));
    var b = a.clone();

    test 'success' { a.equals(b) }
  }

  it 'should return the same instance for singletons' {
    var a = Test2;
    var b = a.clone();

    test 'success' { a === b }
  }

  it 'should allow override of native cloning' {
    var a = Test(1);
    var oldclone = Clone.nativeClone;
    Clone.nativeClone = function() { return 'foo' };
    test 'success' { a.clone()[0] === 'foo' }
    Clone.nativeClone = oldclone;
  }
}

describe 'Setter' {
  data Test {
    foo: *,
    bar: *
  } deriving (Eq, Setter)

  it 'should derive create' {
    var a = Test(1, 2);
    var b = Test.create({
      foo: 1,
      bar: 2
    });

    test 'success' { a.equals(b) }
    test 'failure' { Test.create({ foo: 1 }) =!= TypeError }
  }

  it 'should return a clone with values changed' {
    var a = Test(1, Test(2));
    var b = a.set({ foo: 2 });

    test 'success' {
      a !== b &&
      b.foo === 2 &&
      b.bar === a.bar
    }
  }
}

describe 'ToString' {
  union List {
    Nil,
    Cons(*, List)
  } deriving ToString

  it 'should return a good string representation' {
    var a = Cons(1, Cons(2, Cons(3, Nil)));
    test 'success' { a.toString() === 'Cons(1, Cons(2, Cons(3, Nil)))' }
  }

  it 'should return a good representation for arrays' {
    var a = Cons([1, 2, 3], Nil);
    test 'success' { a.toString() === 'Cons([1, 2, 3], Nil)' }
  }
}

describe 'ToJSON' {
  union Test {
    Test1,
    Test2 = 'test',
    Test3 {
      foo: *,
      bar: *
    }
  } deriving ToJSON

  it 'should return the constructor name for singletons' {
    test 'success' { Test1.toJSON() === 'Test1' }
  }

  it 'should return the value for singletons with values' {
    test 'success' { Test2.toJSON() === 'test' }
  }

  it 'should return an object for records' {
    test 'success' { Test3(1, 2).toJSON() =>= { foo: 1, bar: 2 }}
  }
}

describe 'Curry' {
  data Test(*, *, *)
    deriving (Eq, Curry)

  it 'should curry the constructor' {
    var a = Test(1, 2, 3);
    var b = Test(1)(2)(3);

    test 'success' { a.equals(b) }
  }

  it 'should allow partial application' {
    var a = Test(1, 2, 3);
    var b = Test(1, 2)(3);
    var c = Test(1)(2, 3);

    test 'success' { a.equals(b) && b.equals(c) }
  }

  it 'should retain static values' {
    var Foo = {
      derive: function(adt) {
        adt.constructor.test = 'foo';
        return adt;
      }
    };
    data Test2(*)
      deriving (Foo, Curry)

    test 'success' { Test2.test === 'foo' }
  }
}

describe 'Extractor' {
  union Test {
    Test1,
    Test2 { 
      foo: *, 
      bar: * 
    }
  } deriving Extractor

  it 'should derive hasInstance for singletons' {
    test 'success' { Test1.hasInstance(Test1) }
    test 'failure' { !Test1.hasInstance('foo') }
  }

  it 'should derive all extractor methods for records' {
    test 'hasInstance success' { Test2.hasInstance(Test2(1, 2)) }
    test 'hasInstance failure' { !Test2.hasInstance('foo') }

    test 'unapply success' { Test2.unapply(Test2(1, 2)) =>= [1, 2] }
    test 'unapply failure' { !Test2.unapply('foo') }

    test 'unapplyObject success' { Test2.unapplyObject(Test2(1, 2)) =>= { foo: 1, bar: 2 }}
    test 'unapplyObject failure' { !Test2.unapplyObject('foo') }
  }
}

describe 'Reflect' {
  union Test {
    Test1,
    Test2 {
      foo: *,
      bar: *
    }
  } deriving Reflect

  it 'should export type tags' {
    test 'singleton' { Test1.isTest1 }
    test 'record' { Test2(1, 2).isTest2 }
  }

  it 'should export union constructor names' {
    test 'success' { Test.__names__ =>= ['Test1', 'Test2'] }
  }

  it 'should export record field names' {
    test 'success' { Test2.__fields__ =>= ['foo', 'bar'] }
  }
}

describe 'Cata' {
  union Test {
    Test1,
    Test2(*, *),
    Test3
  } deriving Cata

  it 'should dispatch on data constructor name' {
    var dispatch = {
      Test1: function() { return 1 },
      Test2: function() { return 2 }
    };

    test 'success' {
      Test1.cata(dispatch) === 1 &&
      Test2(1, 2).cata(dispatch) === 2
    }
    test 'failure' {
      Test3.cata(dispatch) =!= TypeError
    }
  }

  it 'should destruct constructor arguments' {
    test 'success' {
      Test2(1, 2).cata({
        Test2: function(x, y) {
          return [x, y];
        }
      }) =>= [1, 2]
    }
  }
}

describe 'LateDeriving' {
  data Test1
    deriving LateDeriving

  data Test2(*)
    deriving LateDeriving

  it 'should allow late deriving' {
    Test1.deriving(Eq, Clone);
    Test2.deriving(Eq, Clone);

    test 'success' { 
      Test1.equals(Test1) && Test1.clone() === Test1 &&
      Test2(1).equals(Test2(1)) &&
      Test2(1).clone().equals(Test2(1))
    }
  }
}

describe 'composeDeriving' {
  var Foo = adt.composeDeriving(Eq, Clone);

  data Test
    deriving Foo

  it 'should compose derivers' {
    test 'success' { Test.equals(Test) && Test.clone() === Test }
  }
}
