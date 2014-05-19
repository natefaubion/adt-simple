/*!
 * adt-simple
 * ----------
 * author: Nathan Faubion <nathan@n-son.com>
 * version: 0.1.3
 * license: MIT
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('adt-simple', factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.adt = exports;
  }
})(this, function () {

  var Eq = {
    nativeEquals: function(a, b) {
      return a === b;
    },
    derive: eachVariant(function(v) {
      if (v.fields) {
        v.prototype.equals = function(that) {
          if (this === that) return true;
          if (!(that instanceof v.constructor)) return false;
          for (var i = 0, len = v.fields.length; i < len; i++) {
            var f = v.fields[i];
            var vala = this[f];
            var valb = that[f];
            if (vala && vala.equals) {
              if (!vala.equals(valb)) return false;
            } else if (!Eq.nativeEquals(vala, valb)) {
              return false;
            }
          }
          return true;
        };
      } else {
        v.prototype.equals = function(that) {
          return this === that;
        }
      }
    })
  };

  var Clone = {
    nativeClone: function(a) {
      return a;
    },
    derive: eachVariant(function(v) {
      if (v.fields) {
        v.prototype.clone = function() {
          var self = this;
          var args = map(v.fields, function(f) {
            var val = self[f];
            return val && val.clone ? val.clone() : Clone.nativeClone(val);
          });
          return unrollApply(v.constructor, args);
        };
      } else {
        v.prototype.clone = function() {
          return this;
        };
      }
    })
  };

  var Setter = {
    derive: eachVariant(function(v, adt) {
      if (v.fields) {
        v.constructor.create = function(obj) {
          var args = map(v.fields, function(f) {
            if (!obj.hasOwnProperty(f)) {
              throw new TypeError('Missing field: ' + [adt.name, v.name, f].join('.'));
            }
            return obj[f];
          });
          return unrollApply(v.constructor, args);
        };
        v.prototype.set = function(obj) {
          var self = this;
          var args = map(v.fields, function(f) {
            return obj.hasOwnProperty(f) ? obj[f] : self[f];
          });
          return unrollApply(v.constructor, args);
        };
      }
    })
  };

  var ToString = {
    toString: function(x) {
      if (x === null) return 'null';
      if (x === void 0) return 'undefined';
      if (Object.prototype.toString.call(x) === '[object Array]') {
        return '[' + map(x, function(v) {
          return ToString.toString(v);
        }).join(', ') + ']';
      }
      return x.toString();
    },
    derive: eachVariant(function(v) {
      if (v.fields) {
        v.prototype.toString = function() {
          var self = this;
          return v.name + '(' + map(v.fields, function(f) {
            return ToString.toString(self[f]);
          }).join(', ') + ')';
        };
      } else {
        v.prototype.toString = function() {
          return v.name;
        };
      }
    })
  };

  var ToJSON = {
    toJSONValue: function(x) {
      return x && typeof x === 'object' && x.toJSON ? x.toJSON() : x;
    },
    derive: eachVariant(function(v) {
      if (v.fields) {
        v.prototype.toJSON = function() {
          var res = {};
          var self = this;
          each(v.fields, function(f) {
            res[f] = ToJSON.toJSONValue(self[f]);
          });
          return res;
        }
      } else {
        v.prototype.toJSON = function() {
          return this.hasOwnProperty('value') ? this.value : v.name
        };
      }
    })
  };

  var Curry = {
    derive: eachVariant(function(v, adt) {
      if (v.fields && v.fields.length) {
        var ctr = v.constructor;
        function curried() {
          var args = arguments;
          if (args.length < v.fields.length) {
            return function() {
              return unrollApply(curried, concat(args, arguments));
            };
          }
          var res = unrollApply(ctr, args);
          return res;
        };

        v.constructor = curried;
        v.constructor.prototype = ctr.prototype;
        v.prototype.constructor = curried;

        if (adt.constructor === ctr) {
          adt.constructor = v.constructor;
          for (var k in ctr) {
            if (ctr.hasOwnProperty(k)) {
              adt.constructor[k] = ctr[k];
            }
          }
        }
      }
    })
  };

  var Extractor = {
    derive: eachVariant(function(v) {
      if (v.fields) {
        v.constructor.hasInstance = function(x) {
          return x && x.constructor === v.constructor;
        };
        v.constructor.unapply = function(x) {
          if (v.constructor.hasInstance(x)) {
            return map(v.fields, function(f) {
              return x[f];
            });
          }
        };
        v.constructor.unapplyObject = function(x) {
          if (v.constructor.hasInstance(x)) {
            var res = {};
            each(v.fields, function(f) { res[f] = x[f] });
            return res;
          }
        };
      } else {
        v.prototype.hasInstance = function(x) {
          return x === this;
        };
      }
    })
  };

  var Reflect = {
    derive: function(adt) {
      adt.constructor.__names__ = map(adt.variants, function(v) {
        v.prototype['is' + v.name] = true;
        v.constructor.__fields__ = v.fields ? v.fields.slice() : null;
        return v.name;
      });
      return adt;
    }
  };
  
  var Cata = {
    derive: eachVariant(function(v, adt) {
      v.prototype.cata = function(dispatch) {
        if (!dispatch.hasOwnProperty(v.name)) {
          throw new TypeError('No branch for: ' + [adt.name, v.name].join('.'));
        }
        var self = this;
        var args = v.fields
          ? map(v.fields, function(f) { return self[f] })
          : [];
        return dispatch[v.name].apply(this, args);
      };
    })
  };

  var LateDeriving = {
    derive: function(adt) {
      // Singleton data constructors need it on the prototype
      var ctr = adt.variants && adt.variants[0] &&
                adt.variants[0].constructor === adt.constructor &&
                !adt.variants[0].fields
        ? adt.prototype
        : adt.constructor

      ctr.deriving = function() {
        var res = adt;
        for (var i = 0, c; c = arguments[i]; i++) {
          res = c.derive(res);
        }
      }
      return adt;
    }
  };

  var Base = composeDeriving(Eq, Clone, Setter, ToString, Reflect, Extractor);

  // Export
  // ------

  return {
    eachVariant: eachVariant,
    composeDeriving: composeDeriving,
    Eq: Eq,
    Clone: Clone,
    Setter: Setter,
    ToString: ToString,
    ToJSON: ToJSON,
    Curry: Curry,
    Extractor: Extractor,
    Reflect: Reflect,
    Cata: Cata,
    LateDeriving: LateDeriving,
    Base: Base
  };

  // Utilities
  // ---------

  function each(arr, fn) {
    for (var i = 0, len = arr.length; i < len; i++) {
      fn(arr[i], i, arr);
    }
  }

  function map(arr, fn) {
    var res = [];
    for (var i = 0, len = arr.length; i < len; i++) {
      res[res.length] = fn(arr[i], i, arr);
    }
    return res;
  }

  function eachVariant(fn) {
    return function(adt) {
      each(adt.variants, function(v) {
        fn(v, adt);
      });
      return adt;
    }
  }

  function composeDeriving() {
    var classes = arguments;
    return {
      derive: function(adt) {
        var res = adt;
        for (var i = 0, len = classes.length; i < len; i++) {
          res = classes[i].derive(res);
        }
        return res;
      }
    };
  }

  function unrollApply(fn, a) {
    switch (a.length) {
      case 0:  return fn();
      case 1:  return fn(a[0]);
      case 2:  return fn(a[0], a[1]);
      case 3:  return fn(a[0], a[1], a[2]);
      case 4:  return fn(a[0], a[1], a[2], a[3]);
      default: return fn.apply(null, a);
    }
  }

  function concat(a, b) {
    var res = [], i, len;
    for (i = 0, len = a.length; i < len; i++) res[res.length] = a[i];
    for (i = 0, len = b.length; i < len; i++) res[res.length] = b[i];
    return res;
  }
});
