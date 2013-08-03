(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    
    require.define = function (filename, fn) {
        if (require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};
});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process){var process = module.exports = {};

process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();
});

require.define("vm",function(require,module,exports,__dirname,__filename,process){module.exports = require("vm-browserify")});

require.define("/node_modules/vm-browserify/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"index.js"}});

require.define("/node_modules/vm-browserify/index.js",function(require,module,exports,__dirname,__filename,process){var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInNewContext = function (context) {
    if (!context) context = {};
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
     
    if (!win.eval && win.execScript) {
        // win.eval() magically appears when this is called in IE:
        win.execScript('null');
    }
    
    var res = win.eval(this.code);
    
    forEach(Object_keys(win), function (key) {
        context[key] = win[key];
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInContext = function (context) {
    // seems to be just runInNewContext on magical context objects which are
    // otherwise indistinguishable from objects except plain old objects
    // for the parameter segfaults node
    return this.runInNewContext(context);
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    // not really sure what this one does
    // seems to just make a shallow copy
    var copy = {};
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};
});

require.define("/lib/stanza/message.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');


function Message(data, xml) {
    return stanza.init(this, xml, data);
}
Message.prototype = {
    constructor: {
        value: Message
    },
    _name: 'message',
    NS: 'jabber:client',
    EL: 'message',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get lang() {
        return this.xml.getAttributeNS(stanza.XML_NS, 'lang') || '';
    },
    set lang(value) {
        this.xml.setAttributeNS(stanza.XML_NS, 'lang', value);
    },
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get to() {
        return stanza.getAttribute(this.xml, 'to');
    },
    set to(value) {
        stanza.setAttribute(this.xml, 'to', value);
    },
    get from() {
        return stanza.getAttribute(this.xml, 'from');
    },
    set from(value) {
        stanza.setAttribute(this.xml, 'from', value);
    },
    get type() {
        return stanza.getAttribute(this.xml, 'type', 'normal');
    },
    set type(value) {
        stanza.setAttribute(this.xml, 'type', value);
    },
    get body() {
        var bodies = this.$body;
        return bodies[this.lang] || '';
    },
    get $body() {
        return stanza.getSubLangText(this.xml, this.NS, 'body', this.lang);
    },
    set body(value) {
        stanza.setSubLangText(this.xml, this.NS, 'body', value, this.lang);
    },
    get thread() {
        return stanza.getSubText(this.xml, this.NS, 'thread');
    },
    set thread(value) {
        stanza.setSubText(this.xml, this.NS, 'thread', value);
    },
    get parentThread() {
        return stanza.getSubAttribute(this.xml, this.NS, 'thread', 'parent');
    },
    set parentThread(value) {
        stanza.setSubAttribute(this.xml, this.NS, 'thread', 'parent', value);
    }
};

stanza.topLevel(Message);


module.exports = Message;
});

require.define("/vendor/lodash.js",function(require,module,exports,__dirname,__filename,process){/**
 * @license
 * Lo-Dash 1.3.1 (Custom Build) ../../vendor/lodash.com/license
 * Build: `../../vendor/lodash include="each,unique"`
 * Underscore.js 1.4.4 underscorejs.org/LICENSE
 */
;(function(G){function H(a,d,b){b=(b||0)-1;for(var c=a.length;++b<c;)if(a[b]===d)return b;return-1}function oa(a,d){var b=typeof d;a=a.k;if("boolean"==b||null==d)return a[d];"number"!=b&&"string"!=b&&(b="object");var c="number"==b?d:Z+d;a=a[b]||(a[b]={});return"object"==b?a[c]&&-1<H(a[c],d)?0:-1:a[c]?0:-1}function pa(a){var d=this.k,b=typeof a;if("boolean"==b||null==a)d[a]=!0;else{"number"!=b&&"string"!=b&&(b="object");var c="number"==b?a:Z+a,e=d[b]||(d[b]={});if("object"==b){if((e[c]||(e[c]=[])).push(a)==
this.b.length)d[b]=!1}else e[c]=!0}}function O(){return P.pop()||{a:"",b:null,c:"",k:null,"false":!1,d:"",e:"",f:"","null":!1,number:null,object:null,push:null,g:null,string:null,h:"","true":!1,undefined:!1,i:!1,j:!1}}function $(a){return typeof a.toString!="function"&&typeof(a+"")=="string"}function y(a){a.length=0;z.length<aa&&z.push(a)}function I(a){var d=a.k;d&&I(d);a.b=a.k=a.object=a.number=a.string=null;P.length<aa&&P.push(a)}function g(){}function Q(){var a=O();a.g=R;a.b=a.c=a.f=a.h="";a.e=
"r";a.i=!0;a.j=!!J;for(var d,b=0;d=arguments[b];b++)for(var c in d)a[c]=d[c];b=a.a;a.d=/^[^,]+/.exec(b)[0];d=Function;b="return function("+b+"){";c="var m,r="+a.d+",C="+a.e+";if(!r)return C;"+a.h+";";a.b?(c+="var s=r.length;m=-1;if("+a.b+"){",h.unindexedChars&&(c+="if(q(r)){r=r.split('')}"),c+="while(++m<s){"+a.f+";}}else{"):h.nonEnumArgs&&(c+="var s=r.length;m=-1;if(s&&n(r)){while(++m<s){m+='';"+a.f+";}}else{");h.enumPrototypes&&(c+="var E=typeof r=='function';");h.enumErrorProps&&(c+="var D=r===j||r instanceof Error;");
var e=[];h.enumPrototypes&&e.push('!(E&&m=="prototype")');h.enumErrorProps&&e.push('!(D&&(m=="message"||m=="name"))');if(a.i&&a.j)c+="var A=-1,B=z[typeof r]&&t(r),s=B?B.length:0;while(++A<s){m=B[A];",e.length&&(c+="if("+e.join("&&")+"){"),c+=a.f+";",e.length&&(c+="}"),c+="}";else if(c+="for(m in r){",a.i&&e.push("l.call(r, m)"),e.length&&(c+="if("+e.join("&&")+"){"),c+=a.f+";",e.length&&(c+="}"),c+="}",h.nonEnumShadows){c+="if(r!==y){var h=r.constructor,p=r===(h&&h.prototype),e=r===H?G:r===j?i:J.call(r),v=w[e];";
for(k=0;7>k;k++)c+="m='"+a.g[k]+"';if((!(p&&v[m])&&l.call(r,m))",a.i||(c+="||(!v[m]&&r[m]!==y[m])"),c+="){"+a.f+"}";c+="}"}if(a.b||h.nonEnumArgs)c+="}";c+=a.c+";return C";d=d("i,j,l,n,o,q,t,u,y,z,w,G,H,J",b+c+"}");I(a);return d(ba,S,p,v,T,ca,J,g,A,B,l,K,qa,q)}function v(a){return q.call(a)==U}function w(a,d,b,c,e,r){var L=b===da;if(typeof b=="function"&&!L){b=g.createCallback(b,c,2);var n=b(a,d);if(typeof n!="undefined")return!!n}if(a===d)return 0!==a||1/a==1/d;var m=typeof a,f=typeof d;if(a===a&&
(!a||"function"!=m&&"object"!=m)&&(!d||"function"!=f&&"object"!=f))return!1;if(null==a||null==d)return a===d;f=q.call(a);m=q.call(d);f==U&&(f=C);m==U&&(m=C);if(f!=m)return!1;switch(f){case ea:case fa:return+a==+d;case ga:return a!=+a?d!=+d:0==a?1/a==1/d:a==+d;case ha:case K:return a==String(d)}m=f==V;if(!m){if(p.call(a,"__wrapped__")||p.call(d,"__wrapped__"))return w(a.__wrapped__||a,d.__wrapped__||d,b,c,e,r);if(f!=C||!h.nodeClass&&($(a)||$(d)))return!1;var f=!h.argsObject&&v(a)?Object:a.constructor,
t=!h.argsObject&&v(d)?Object:d.constructor;if(f!=t&&(!D(f)||!(f instanceof f&&D(t)&&t instanceof t)))return!1}t=!e;e||(e=z.pop()||[]);r||(r=z.pop()||[]);for(f=e.length;f--;)if(e[f]==a)return r[f]==d;var l=0,n=!0;e.push(a);r.push(d);if(m){f=a.length;l=d.length;n=l==a.length;if(!n&&!L)return n;for(;l--;)if(m=f,t=d[l],L)for(;m--&&!(n=w(a[m],t,b,c,e,r)););else if(!(n=w(a[l],t,b,c,e,r)))break;return n}W(d,function(d,f,g){if(p.call(g,f))return l++,n=p.call(a,f)&&w(a[f],d,b,c,e,r)});n&&!L&&W(a,function(a,
b,c){if(p.call(c,b))return n=-1<--l});t&&(y(e),y(r));return n}function D(a){return typeof a=="function"}function ia(a){return!(!a||!B[typeof a])}function ca(a){return typeof a=="string"||q.call(a)==K}function ja(a,d,b){if(d&&typeof b=="undefined"&&T(a)){b=-1;for(var c=a.length;++b<c&&false!==d(a[b],b,a););}else ra(a,d,b);return a}function ka(a,d,b){if(typeof b=="number"){var c=a?a.length:0;b=0>b?sa(0,c+b):b||0}else if(b)return b=la(a,d),a[b]===d?b:-1;return a?H(a,d,b):-1}function la(a,d,b,c){var e=0,r=
a?a.length:e;b=b?g.createCallback(b,c,1):X;for(d=b(d);e<r;)c=e+r>>>1,b(a[c])<d?e=c+1:r=c;return e}function X(a){return a}var z=[],P=[],da={},Z=+new Date+"",aa=40,E=(E=/\bthis\b/)&&E.test(function(){return this})&&E,R="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" "),U="[object Arguments]",V="[object Array]",ea="[object Boolean]",fa="[object Date]",ba="[object Error]",ga="[object Number]",C="[object Object]",ha="[object RegExp]",K="[object String]",
B={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1},M=B[typeof exports]&&exports,ma=B[typeof module]&&module&&module.exports==M&&module,s=B[typeof global]&&global;if(s&&(s.global===s||s.window===s))G=s;var S=Error.prototype,A=Object.prototype,qa=String.prototype,s=RegExp("^"+String(A.valueOf).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/valueOf|for [^\]]+/g,".+?")+"$"),ta=Function.prototype.toString,p=A.hasOwnProperty,Y=A.propertyIsEnumerable,q=A.toString,F=s.test(F=q.bind)&&
F,u=s.test(u=Object.create)&&u,x=s.test(x=Array.isArray)&&x,N=s.test(N=Object.keys)&&N,sa=Math.max,u=s.test(G.attachEvent),ua=F&&!/\n|true/.test(F+u),l={};l[V]=l[fa]=l[ga]={constructor:!0,toLocaleString:!0,toString:!0,valueOf:!0};l[ea]=l[K]={constructor:!0,toString:!0,valueOf:!0};l[ba]=l["[object Function]"]=l[ha]={constructor:!0,toString:!0};l[C]={constructor:!0};(function(){for(var a=R.length;a--;){var d=R[a],b;for(b in l)p.call(l,b)&&!p.call(l[b],d)&&(l[b][d]=!1)}})();var h=g.support={};(function(){var a=
function(){this.x=1},d=[];a.prototype={valueOf:1,y:1};for(var b in new a)d.push(b);for(b in arguments);h.argsObject=arguments.constructor==Object&&!(arguments instanceof Array);h.argsClass=v(arguments);h.enumErrorProps=Y.call(S,"message")||Y.call(S,"name");h.enumPrototypes=Y.call(a,"prototype");h.fastBind=F&&!ua;h.nonEnumArgs=0!=b;h.nonEnumShadows=!/valueOf/.test(d);h.unindexedChars="xx"!="x"[0]+Object("x")[0];try{h.nodeClass=!(q.call(document)==C&&!({toString:0}+""))}catch(c){h.nodeClass=!0}})(1);u={a:"f,d,I",h:"d=d&&typeof I=='undefined'?d:u.createCallback(d,I)",
b:"typeof s=='number'",f:"if(d(r[m],m,f)===false)return C"};s={h:"if(!z[typeof r])return C;"+u.h,b:!1};h.argsClass||(v=function(a){return a?p.call(a,"callee"):!1});var T=x||function(a){return a?typeof a=="object"&&q.call(a)==V:!1},na=Q({a:"x",e:"[]",h:"if(!(z[typeof x]))return C",f:"C.push(m)"}),J=!N?na:function(a){return!ia(a)?[]:h.enumPrototypes&&typeof a=="function"||h.nonEnumArgs&&a.length&&v(a)?na(a):N(a)},ra=Q(u),W=Q(u,s,{i:!1});D(/x/)&&(D=function(a){return typeof a=="function"&&"[object Function]"==
q.call(a)});x=function(a){return function(d,b,c,e){typeof b!="boolean"&&null!=b&&(e=c,c=!(e&&e[b]===d)?b:void 0,b=!1);null!=c&&(c=g.createCallback(c,e));return a(d,b,c,e)}}(function(a,d,b){var c=-1,e;e=(e=g.indexOf)===ka?H:e;var r=a?a.length:0,h=[],n=!d&&75<=r&&e===H,m=b||n?z.pop()||[]:h;if(n){var f;f=m;var l=-1,s=f.length,p=O();p["false"]=p["null"]=p["true"]=p.undefined=!1;var q=O();q.b=f;q.k=p;for(q.push=pa;++l<s;)q.push(f[l]);(f=false===p.object?(I(q),null):q)?(e=oa,m=f):(n=!1,m=b?m:(y(m),h))}for(;++c<
r;)if(f=a[c],l=b?b(f,c,a):f,d?!c||m[m.length-1]!==l:0>e(m,l))(b||n)&&m.push(l),h.push(f);n?(y(m.b),I(m)):b&&y(m);return h});g.createCallback=function(a,d,b){if(null==a)return X;var c=typeof a;if("function"!=c){if("object"!=c)return function(b){return b[a]};var e=J(a);return function(b){for(var c=e.length,d=!1;c--&&(d=w(b[e[c]],a[e[c]],da)););return d}}return typeof d=="undefined"||E&&!E.test(ta.call(a))?a:1===b?function(b){return a.call(d,b)}:2===b?function(b,c){return a.call(d,b,c)}:4===b?function(b,
c,e,g){return a.call(d,b,c,e,g)}:function(b,c,e){return a.call(d,b,c,e)}};g.forEach=ja;g.forIn=W;g.keys=J;g.uniq=x;g.each=ja;g.unique=x;g.identity=X;g.indexOf=ka;g.isArguments=v;g.isArray=T;g.isEqual=w;g.isFunction=D;g.isObject=ia;g.isString=ca;g.sortedIndex=la;g.VERSION="1.3.1";typeof define=="function"&&typeof define.amd=="object"&&define.amd?(G._=g, define(function(){return g})):M&&!M.nodeType?ma?(ma.exports=g)._=g:M._=g:G._=g})(this);
});

require.define("/node_modules/jxt/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"jxt.js","browserify":"jxt.js"}});

require.define("/node_modules/jxt/jxt.js",function(require,module,exports,__dirname,__filename,process){var _ = require('./vendor/../../vendor/lodash');
var serializer = new XMLSerializer();
var XML_NS = 'http://www.w3.org/XML/1998/namespace';
var TOP_LEVEL_LOOKUP = {};
var LOOKUP = {};
var LOOKUP_EXT = {};


var find = exports.find = function (xml, NS, selector) {
    var children = xml.querySelectorAll(selector);
    return _.filter(children, function (child) {
        return child.namespaceURI === NS && child.parentNode == xml;
    });
};

exports.findOrCreate = function (xml, NS, selector) {
    var existing = find(xml, NS, selector);
    if (existing.length) {
        return existing[0];
    } else {
        var created = document.createElementNS(NS, selector);
        xml.appendChild(created);
        return created;
    }
};

exports.init = function (self, xml, data) {
    self.xml = xml || document.createElementNS(self.NS, self.EL);
    if (!self.xml.parentNode || self.xml.parentNode.namespaceURI !== self.NS) {
        self.xml.setAttribute('xmlns', self.NS);
    }

    self._extensions = {};
    _.each(self.xml.childNodes, function (child) {
        var childName = child.namespaceURI + '|' + child.localName;
        var ChildJXT = LOOKUP[childName];
        if (ChildJXT !== undefined) {
            var name = ChildJXT.prototype._name;
            self._extensions[name] = new ChildJXT(null, child);
            self._extensions[name].parent = self;
        }
    });

    _.extend(self, data);
    return self;
};

exports.getSubText = function (xml, NS, element) {
    var subs = find(xml, NS, element);
    if (!subs) {
        return '';
    }

    for (var i = 0; i < subs.length; i++) {
        if (subs[i].namespaceURI === NS) {
            return subs[i].textContent || '';
        }
    }
    
    return '';
};

exports.getMultiSubText = function (xml, NS, element, extractor) {
    var subs = find(xml, NS, element);
    var results = [];
    extractor = extractor || function (sub) {
        return sub.textContent || '';
    };

    for (var i = 0; i < subs.length; i++) {
        if (subs[i].namespaceURI === NS) {
            results.push(extractor(subs[i]));
        }
    }
    
    return results;
};

exports.getSubLangText = function (xml, NS, element, defaultLang) {
    var subs = find(xml, NS, element);
    if (!subs) {
        return {};
    }

    var lang, sub;
    var results = {};
    var langs = [];

    for (var i = 0; i < subs.length; i++) {
        sub = subs[i];
        if (sub.namespaceURI === NS) {
            lang = sub.getAttributeNS(XML_NS, 'lang') || defaultLang;
            langs.push(lang);
            results[lang] = sub.textContent || '';
        }
    }
    
    return results;
};


exports.setSubText = function (xml, NS, element, value) {
    var subs = find(xml, NS, element);
    if (!subs.length) {
        if (value) {
            var sub = document.createElementNS(NS, element);
            sub.textContent = value;
            xml.appendChild(sub);
        }
    } else {
        for (var i = 0; i < subs.length; i++) {
            if (subs[i].namespaceURI === NS) {
                if (value) {
                    subs[i].textContent = value;
                    return;
                } else {
                    xml.removeChild(subs[i]);
                }
            }
        }
    }
};

exports.setMultiSubText = function (xml, NS, element, value, builder) {
    var subs = find(xml, NS, element);
    var values = [];
    builder = builder || function (value) {
        var sub = document.createElementNS(NS, element);
        sub.textContent = value;
        xml.appendChild(sub);
    };
    if (typeof value === 'string') {
        values = (value || '').split('\n');
    } else {
        values = value;
    }
    _.forEach(subs, function (sub) {
        xml.removeChild(sub);
    });
    _.forEach(values, function (val) {
        if (val) {
            builder(val);
        }
    });
};

exports.setSubLangText = function (xml, NS, element, value, defaultLang) {
    var sub, lang;
    var subs = find(xml, NS, element);
    if (subs.length) {
        for (var i = 0; i < subs.length; i++) {
            sub = subs[i];
            if (sub.namespaceURI === NS) {
                xml.removeChild(sub);
            }
        }
    }

    if (typeof value === 'string') {
        sub = document.createElementNS(NS, element);
        sub.textContent = value;
        xml.appendChild(sub);
    } else if (typeof value === 'object') {
        for (lang in value) {
            if (value.hasOwnProperty(lang)) {
                sub = document.createElementNS(NS, element);
                if (lang !== defaultLang) {
                    sub.setAttributeNS(XML_NS, 'lang', lang);
                }
                sub.textContent = value[lang];
                xml.appendChild(sub);
            }
        }
    }
};

exports.getAttribute = function (xml, attr, defaultVal) {
    return xml.getAttribute(attr) || defaultVal || '';
};

exports.setAttribute = function (xml, attr, value, force) {
    if (value || force) {
        xml.setAttribute(attr, value);
    } else {
        xml.removeAttribute(attr);
    }
};

exports.getBoolAttribute = function (xml, attr, defaultVal) {
    var val = xml.getAttribute(attr) || defaultVal || '';
    return val === 'true' || val === '1';
};

exports.setBoolAttribute = function (xml, attr, value) {
    if (value) {
        xml.setAttribute(attr, '1');
    } else {
        xml.removeAttribute(attr);
    }
};

exports.getSubAttribute = function (xml, NS, sub, attr, defaultVal) {
    var subs = find(xml, NS, sub);
    if (!subs) {
        return '';
    }

    for (var i = 0; i < subs.length; i++) {
        if (subs[i].namespaceURI === NS) {
            return subs[i].getAttribute(attr) || defaultVal || '';
        }
    }
    
    return '';
};

exports.setSubAttribute = function (xml, NS, sub, attr, value) {
    var subs = find(xml, NS, sub);
    if (!subs.length) {
        if (value) {
            sub = document.createElementNS(NS, sub);
            sub.setAttribute(attr, value);
            xml.appendChild(sub);
        }
    } else {
        for (var i = 0; i < subs.length; i++) {
            if (subs[i].namespaceURI === NS) {
                if (value) {
                    subs[i].setAttribute(attr, value);
                    return;
                } else {
                    subs[i].removeAttribute(attr);
                }
            }
        }
    }
};

exports.toString = function () {
    return serializer.serializeToString(this.xml);
};

exports.toJSON = function () {
    var prop;
    var result = {};
    var exclude = {
        constructor: true,
        NS: true,
        EL: true,
        toString: true,
        toJSON: true,
        _extensions: true,
        prototype: true,
        xml: true,
        parent: true,
        _name: true
    };
    for (prop in this._extensions) {
        if (this._extensions[prop].toJSON) {
            result[prop] = this._extensions[prop].toJSON();
        }
    }
    for (prop in this) {
        if (!exclude[prop] && !((LOOKUP_EXT[this.NS + '|' + this.EL] || {})[prop]) && !this._extensions[prop] && prop[0] !== '_') {
            var val = this[prop];
            if (typeof val == 'function') continue;
            var type = Object.prototype.toString.call(val);
            if (type.indexOf('Object') >= 0) {
                if (Object.keys(val).length > 0) {
                    result[prop] = val;
                }
            } else if (type.indexOf('Array') >= 0) {
                if (val.length > 0) {
                    result[prop] = val;
                }
            } else if (!!val) {
                result[prop] = val;
            }
        }
    }
    return result;
};

exports.extend = function (ParentJXT, ChildJXT) {
    var parentName = ParentJXT.prototype.NS + '|' + ParentJXT.prototype.EL;
    var name = ChildJXT.prototype._name;
    var qName = ChildJXT.prototype.NS + '|' + ChildJXT.prototype.EL;

    LOOKUP[qName] = ChildJXT;
    if (!LOOKUP_EXT[qName]) {
        LOOKUP_EXT[qName] = {};
    }
    if (!LOOKUP_EXT[parentName]) {
        LOOKUP_EXT[parentName] = {};
    }
    LOOKUP_EXT[parentName][name] = ChildJXT;

    ParentJXT.prototype.__defineGetter__(name, function () {
        if (!this._extensions[name]) {
            var existing = exports.find(this.xml, ChildJXT.prototype.NS, ChildJXT.prototype.EL);
            if (!existing.length) {
                this._extensions[name] = new ChildJXT();
                this.xml.appendChild(this._extensions[name].xml);
            } else {
                this._extensions[name] = new ChildJXT(null, existing[0]);
            }
            this._extensions[name].parent = this;
        }
        return this._extensions[name];
    });
    ParentJXT.prototype.__defineSetter__(name, function (value) {
        var child = this[name];
        _.extend(child, value);
    });
};

exports.topLevel = function (JXT) {
    var name = JXT.prototype.NS + '|' + JXT.prototype.EL;
    LOOKUP[name] = JXT;
    TOP_LEVEL_LOOKUP[name] = JXT;
};

exports.build = function (xml) {
    var JXT = TOP_LEVEL_LOOKUP[xml.namespaceURI + '|' + xml.localName];
    if (JXT) {
        return new JXT(null, xml);
    }
};

exports.XML_NS = XML_NS;
exports.TOP_LEVEL_LOOKUP = TOP_LEVEL_LOOKUP;
exports.LOOKUP_EXT = LOOKUP_EXT;
exports.LOOKUP = LOOKUP;
});

require.define("/node_modules/jxt/vendor/lodash.js",function(require,module,exports,__dirname,__filename,process){/**
 * @license
 * Lo-Dash 1.3.1 (Custom Build) ../../vendor/lodash.com/license
 * Build: `../../vendor/lodash include="each,extend,filter"`
 * Underscore.js 1.4.4 underscorejs.org/LICENSE
 */
;!function(t){function r(t){return typeof t.toString!="function"&&typeof(t+"")=="string"}function e(t){t.length=0,g.length<y&&g.push(t)}function n(t){var r=t.k;r&&n(r),t.b=t.k=t.object=t.number=t.string=null,h.length<y&&h.push(t)}function o(){}function u(){var t=h.pop()||{a:"",b:null,c:"",k:null,"false":!1,d:"",e:"",f:"","null":!1,number:null,object:null,push:null,g:null,string:null,h:"","true":!1,undefined:!1,i:!1,j:!1};t.g=v,t.b=t.c=t.f=t.h="",t.e="r",t.i=!0,t.j=!!X;for(var r,e=0;r=arguments[e];e++)for(var u in r)t[u]=r[u];
e=t.a,t.d=/^[^,]+/.exec(e)[0],r=Function,e="return function("+e+"){",u="var m,r="+t.d+",C="+t.e+";if(!r)return C;"+t.h+";",t.b?(u+="var s=r.length;m=-1;if("+t.b+"){",K.unindexedChars&&(u+="if(q(r)){r=r.split('')}"),u+="while(++m<s){"+t.f+";}}else{"):K.nonEnumArgs&&(u+="var s=r.length;m=-1;if(s&&n(r)){while(++m<s){m+='';"+t.f+";}}else{"),K.enumPrototypes&&(u+="var E=typeof r=='function';"),K.enumErrorProps&&(u+="var D=r===j||r instanceof Error;");var c=[];if(K.enumPrototypes&&c.push('!(E&&m=="prototype")'),K.enumErrorProps&&c.push('!(D&&(m=="message"||m=="name"))'),t.i&&t.j)u+="var A=-1,B=z[typeof r]&&t(r),s=B?B.length:0;while(++A<s){m=B[A];",c.length&&(u+="if("+c.join("&&")+"){"),u+=t.f+";",c.length&&(u+="}"),u+="}";
else if(u+="for(m in r){",t.i&&c.push("l.call(r, m)"),c.length&&(u+="if("+c.join("&&")+"){"),u+=t.f+";",c.length&&(u+="}"),u+="}",K.nonEnumShadows){for(u+="if(r!==y){var h=r.constructor,p=r===(h&&h.prototype),e=r===H?G:r===j?i:J.call(r),v=w[e];",k=0;7>k;k++)u+="m='"+t.g[k]+"';if((!(p&&v[m])&&l.call(r,m))",t.i||(u+="||(!v[m]&&r[m]!==y[m])"),u+="){"+t.f+"}";u+="}"}return(t.b||K.nonEnumArgs)&&(u+="}"),u+=t.c+";return C",r=r("i,j,l,n,o,q,t,u,y,z,w,G,H,J",e+u+"}"),n(t),r(_,z,R,a,U,l,X,o,D,P,V,A,N,M)}function a(t){return M.call(t)==j
}function c(t,n,u,i,l,s){var p=u===b;if(typeof u=="function"&&!p){u=o.createCallback(u,i,2);var m=u(t,n);if(typeof m!="undefined")return!!m}if(t===n)return 0!==t||1/t==1/n;var h=typeof t,y=typeof n;if(t===t&&(!t||"function"!=h&&"object"!=h)&&(!n||"function"!=y&&"object"!=y))return!1;if(null==t||null==n)return t===n;if(y=M.call(t),h=M.call(n),y==j&&(y=w),h==j&&(h=w),y!=h)return!1;switch(y){case O:case E:return+t==+n;case x:return t!=+t?n!=+n:0==t?1/t==1/n:t==+n;case S:case A:return t==n+""}if(h=y==C,!h){if(R.call(t,"__wrapped__")||R.call(n,"__wrapped__"))return c(t.__wrapped__||t,n.__wrapped__||n,u,i,l,s);
if(y!=w||!K.nodeClass&&(r(t)||r(n)))return!1;var y=!K.argsObject&&a(t)?Object:t.constructor,d=!K.argsObject&&a(n)?Object:n.constructor;if(y!=d&&(!f(y)||!(y instanceof y&&f(d)&&d instanceof d)))return!1}for(d=!l,l||(l=g.pop()||[]),s||(s=g.pop()||[]),y=l.length;y--;)if(l[y]==t)return s[y]==n;var v=0,m=!0;if(l.push(t),s.push(n),h){if(y=t.length,v=n.length,m=v==t.length,!m&&!p)return m;for(;v--;)if(h=y,d=n[v],p)for(;h--&&!(m=c(t[h],d,u,i,l,s)););else if(!(m=c(t[v],d,u,i,l,s)))break;return m}return Z(n,function(r,e,n){return R.call(n,e)?(v++,m=R.call(t,e)&&c(t[e],r,u,i,l,s)):void 0
}),m&&!p&&Z(t,function(t,r,e){return R.call(e,r)?m=-1<--v:void 0}),d&&(e(l),e(s)),m}function f(t){return typeof t=="function"}function i(t){return!(!t||!P[typeof t])}function l(t){return typeof t=="string"||M.call(t)==A}function s(t,r,e){var n=[];if(r=o.createCallback(r,e),U(t)){e=-1;for(var u=t.length;++e<u;){var a=t[e];r(a,e,t)&&n.push(a)}}else Y(t,function(t,e,o){r(t,e,o)&&n.push(t)});return n}function p(t,r,e){if(r&&typeof e=="undefined"&&U(t)){e=-1;for(var n=t.length;++e<n&&false!==r(t[e],e,t););}else Y(t,r,e);
return t}function m(t){return t}var g=[],h=[],b={},y=40,d=(d=/\bthis\b/)&&d.test(function(){return this})&&d,v="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" "),j="[object Arguments]",C="[object Array]",O="[object Boolean]",E="[object Date]",_="[object Error]",x="[object Number]",w="[object Object]",S="[object RegExp]",A="[object String]",P={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1},I=P[typeof exports]&&exports,B=P[typeof module]&&module&&module.exports==I&&module,F=P[typeof global]&&global;
!F||F.global!==F&&F.window!==F||(t=F);var z=Error.prototype,D=Object.prototype,N=String.prototype,F=RegExp("^"+(D.valueOf+"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/valueOf|for [^\]]+/g,".+?")+"$"),q=Function.prototype.toString,R=D.hasOwnProperty,$=D.propertyIsEnumerable,M=D.toString,T=F.test(T=M.bind)&&T,G=F.test(G=Object.create)&&G,H=F.test(H=Array.isArray)&&H,J=F.test(J=Object.keys)&&J,G=F.test(t.attachEvent),L=T&&!/\n|true/.test(T+G),V={};V[C]=V[E]=V[x]={constructor:!0,toLocaleString:!0,toString:!0,valueOf:!0},V[O]=V[A]={constructor:!0,toString:!0,valueOf:!0},V[_]=V["[object Function]"]=V[S]={constructor:!0,toString:!0},V[w]={constructor:!0},function(){for(var t=v.length;t--;){var r,e=v[t];
for(r in V)R.call(V,r)&&!R.call(V[r],e)&&(V[r][e]=!1)}}();var K=o.support={};!function(){var t=function(){this.x=1},r=[];t.prototype={valueOf:1,y:1};for(var e in new t)r.push(e);for(e in arguments);K.argsObject=arguments.constructor==Object&&!(arguments instanceof Array),K.argsClass=a(arguments),K.enumErrorProps=$.call(z,"message")||$.call(z,"name"),K.enumPrototypes=$.call(t,"prototype"),K.fastBind=T&&!L,K.nonEnumArgs=0!=e,K.nonEnumShadows=!/valueOf/.test(r),K.unindexedChars="xx"!="x"[0]+Object("x")[0];
try{K.nodeClass=!(M.call(document)==w&&!({toString:0}+""))}catch(n){K.nodeClass=!0}}(1);var Q={a:"x,F,k",h:"var a=arguments,b=0,c=typeof k=='number'?2:a.length;while(++b<c){r=a[b];if(r&&z[typeof r]){",f:"if(typeof C[m]=='undefined')C[m]=r[m]",c:"}}"},G={a:"f,d,I",h:"d=d&&typeof I=='undefined'?d:u.createCallback(d,I)",b:"typeof s=='number'",f:"if(d(r[m],m,f)===false)return C"},F={h:"if(!z[typeof r])return C;"+G.h,b:!1};K.argsClass||(a=function(t){return t?R.call(t,"callee"):!1});var U=H||function(t){return t?typeof t=="object"&&M.call(t)==C:!1
},W=u({a:"x",e:"[]",h:"if(!(z[typeof x]))return C",f:"C.push(m)"}),X=J?function(t){return i(t)?K.enumPrototypes&&typeof t=="function"||K.nonEnumArgs&&t.length&&a(t)?W(t):J(t):[]}:W,Y=u(G),H=u(Q,{h:Q.h.replace(";",";if(c>3&&typeof a[c-2]=='function'){var d=u.createCallback(a[--c-1],a[c--],2)}else if(c>2&&typeof a[c-1]=='function'){d=a[--c]}"),f:"C[m]=d?d(C[m],r[m]):r[m]"}),Z=u(G,F,{i:!1});f(/x/)&&(f=function(t){return typeof t=="function"&&"[object Function]"==M.call(t)}),o.assign=H,o.createCallback=function(t,r,e){if(null==t)return m;
var n=typeof t;if("function"!=n){if("object"!=n)return function(r){return r[t]};var o=X(t);return function(r){for(var e=o.length,n=!1;e--&&(n=c(r[o[e]],t[o[e]],b)););return n}}return typeof r=="undefined"||d&&!d.test(q.call(t))?t:1===e?function(e){return t.call(r,e)}:2===e?function(e,n){return t.call(r,e,n)}:4===e?function(e,n,o,u){return t.call(r,e,n,o,u)}:function(e,n,o){return t.call(r,e,n,o)}},o.filter=s,o.forEach=p,o.forIn=Z,o.keys=X,o.each=p,o.extend=H,o.select=s,o.identity=m,o.isArguments=a,o.isArray=U,o.isEqual=c,o.isFunction=f,o.isObject=i,o.isString=l,o.VERSION="1.3.1",typeof define=="function"&&typeof define.amd=="object"&&define.amd?(t._=o, define(function(){return o
})):I&&!I.nodeType?B?(B.exports=o)._=o:I._=o:t._=o}(this);
});

require.define("/lib/stanza/presence.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');


function Presence(data, xml) {
    return stanza.init(this, xml, data);
}
Presence.prototype = {
    constructor: {
        value: Presence
    },
    _name: 'presence',
    NS: 'jabber:client',
    EL: 'presence',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get lang() {
        return this.xml.getAttributeNS(stanza.XML_NS, 'lang') || '';
    },
    set lang(value) {
        this.xml.setAttributeNS(stanza.XML_NS, 'lang', value);
    },
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get to() {
        return stanza.getAttribute(this.xml, 'to');
    },
    set to(value) {
        stanza.setAttribute(this.xml, 'to', value);
    },
    get from() {
        return stanza.getAttribute(this.xml, 'from');
    },
    set from(value) {
        stanza.setAttribute(this.xml, 'from', value);
    },
    get type() {
        return stanza.getAttribute(this.xml, 'type', 'available');
    },
    set type(value) {
        if (value === 'available') {
            value = false;
        }
        stanza.setAttribute(this.xml, 'type', value);
    },
    get status() {
        var statuses = this.$status;
        return statuses[this.lang] || '';
    },
    get $status() {
        return stanza.getSubLangText(this.xml, this.NS, 'status', this.lang);
    },
    set status(value) {
        stanza.setSubLangText(this.xml, this.NS, 'status', value, this.lang);
    },
    get priority() {
        return stanza.getSubText(this.xml, this.NS, 'priority');
    },
    set priority(value) {
        stanza.setSubText(this.xml, this.NS, 'priority', value);
    },
    get show() {
        return stanza.getSubText(this.xml, this.NS, 'show');
    },
    set show(value) {
        stanza.setSubText(this.xml, this.NS, 'show', value);
    }
};

stanza.topLevel(Presence);


module.exports = Presence;
});

require.define("/lib/stanza/iq.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');


function Iq(data, xml) {
    return stanza.init(this, xml, data);
}
Iq.prototype = {
    constructor: {
        value: Iq 
    },
    _name: 'iq',
    NS: 'jabber:client',
    EL: 'iq',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    resultReply: function (data) {
        data.to = this.from;
        data.id = this.id;
        data.type = 'result';
        return new Iq(data);
    },
    errorReply: function (data) {
        data.to = this.from;
        data.id = this.id;
        data.type = 'error';
        return new Iq(data);
    },
    get lang() {
        return this.xml.getAttributeNS(stanza.XML_NS, 'lang') || '';
    },
    set lang(value) {
        this.xml.setAttributeNS(stanza.XML_NS, 'lang', value);
    },
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get to() {
        return stanza.getAttribute(this.xml, 'to');
    },
    set to(value) {
        stanza.setAttribute(this.xml, 'to', value);
    },
    get from() {
        return stanza.getAttribute(this.xml, 'from');
    },
    set from(value) {
        stanza.setAttribute(this.xml, 'from', value);
    },
    get type() {
        return stanza.getAttribute(this.xml, 'type');
    },
    set type(value) {
        stanza.setAttribute(this.xml, 'type', value);
    }
};

stanza.topLevel(Iq);


module.exports = Iq;
});

require.define("/lib/client.js",function(require,module,exports,__dirname,__filename,process){var WildEmitter = require('wildemitter');
var _ = require('../vendor/lodash');
var async = require('async');
var uuid = require('node-uuid');
var SASL = require('./stanza/sasl');
var Message = require('./stanza/message');
var Presence = require('./stanza/presence');
var Iq = require('./stanza/iq');
var WSConnection = require('./websocket');


// Ensure that all basic stanza relationships are established
require('./stanza/stream');
require('./stanza/sm');
require('./stanza/roster');
require('./stanza/error');
require('./stanza/streamError');
require('./stanza/streamFeatures');
require('./stanza/bind');
require('./stanza/session');


function Client(opts) {
    var self = this;

    WildEmitter.call(this);

    this.config = opts || {};
    this._idPrefix = uuid.v4();
    this._idCount = 0;

    this.negotiatedFeatures = {};
    this.featureOrder = [
        'sasl',
        'streamManagement',
        'bind',
        'streamManagement',
        'session'
    ];
    this.features = {};

    this.conn = new WSConnection();
    this.conn.on('*', function (eventName, data) {
        self.emit(eventName, data);    
    });

    this.on('streamFeatures', function (features) {
        var series = [function (cb) { cb(null, features); }];
        var seriesNames = ['setup'];

        self.featureOrder.forEach(function (name) {
            if (features._extensions[name] && !self.negotiatedFeatures[name]) {
                series.push(function (features, cb) {
                    if (!self.negotiatedFeatures[name]) {
                        self.features[name](features, cb);
                    } else {
                        cb(null, features);
                    }
                });
                seriesNames.push(name);
            }
        });

        async.waterfall(series, function (cmd) {
            if (cmd === 'restart') {
                self.conn.restart();
            } else if (cmd === 'disconnect') {
                self.disconnect();
            }
        });
    });

    this.features.sasl = function (features, cb) {
        self.on('sasl:success', 'sasl', function () {
            self.negotiatedFeatures.sasl = true;
            self.releaseGroup('sasl');
            self.emit('auth:success');
            cb('restart');
        });
        self.on('sasl:failure', 'sasl', function () {
            self.releaseGroup('sasl');
            self.emit('auth:failed');
            cb('disconnect');
        });
        self.on('sasl:abort', 'sasl', function () {
            self.releaseGroup('sasl');
            self.emit('auth:failed');
            cb('disconnect');
        });
   
        // Needs to extract mechs and pick the best one, but we need mech implementations first.
        self.send(new SASL.Auth({
            mechanism: 'PLAIN',
            value: '\x00' + self.config.username + '\x00' + self.config.password
        }));
    };

    this.features.bind = function (features, cb) {
        self.sendIq({
            type: 'set',
            bind: {
                resource: self.config.resource
            }
        }, function (err, resp) {
            self.negotiatedFeatures.bind = true;
            self.emit('session:bound', resp.bind.jid);
            self.jid = resp.bind.jid;
            if (!features._extensions.session) {
                self.sessionStarted = true;
                self.emit('session:started', resp.bind.jid);
            }
            cb(null, features);
        });
    };
    
    this.features.session = function (features, cb) {
        self.sendIq({
            type: 'set',
            session: {}
        }, function () {
            self.negotiatedFeatures.session = true;
            self.sessionStarted = true;
            self.emit('session:started');
            cb(null, features);
        });
    };

    this.features.streamManagement = function (features, cb) {
        self.on('stream:management:enabled', 'sm', function (enabled) {
            self.conn.sm.enabled(enabled);
            self.negotiatedFeatures.streamManagement = true;

            self.on('stream:management:ack', 'connection', function (ack) {
                self.conn.sm.process(ack);
            });
            
            self.on('stream:management:request', 'connection', function (request) {
                self.conn.sm.ack();
            });

            self.releaseGroup('sm');
            cb(null, features);
        });

        self.on('stream:management:resumed', 'sm', function (resumed) {
            self.conn.sm.enabled(resumed);
            self.negotiatedFeatures.streamManagement = true;
            self.negotiatedFeatures.bind = true;
            self.sessionStarted = true;

            self.on('stream:management:ack', 'connection', function (ack) {
                self.conn.sm.process(ack);
            });
            
            self.on('stream:management:request', 'connection', function (request) {
                self.conn.sm.ack();
            });

            self.releaseGroup('sm');
            cb(null, features);
        });

        self.on('stream:management:failed', 'sm', function (failed) {
            self.conn.sm.failed();
            self.emit('session:end');
            self.releaseGroup('session');
            self.releaseGroup('sm');
            cb(null, features);
        });

        
        if (!self.conn.sm.id) {
            if (self.negotiatedFeatures.bind) {
                self.conn.sm.enable();
            } else {
                cb(null, features);
            }
        } else if (self.conn.sm.id && self.conn.sm.allowResume) {
            self.conn.sm.resume();
        } else {
            cb(null, features);
        }
    };

    this.on('disconnected', function () {
        self.sessionStarted = false;
        self.negotiatedFeatures.sasl = false;
        self.negotiatedFeatures.streamManagement = false;
        self.negotiatedFeatures.bind = false;
        self.releaseGroup('connection');
    });

    this.on('iq:set:roster', function (iq) {
        self.emit('roster:update', iq);
        self.sendIq({
            id: iq.id,
            type: 'result'
        });
    });

    this.on('iq', function (iq) {
        var iqType = iq.type;
        var exts = Object.keys(iq._extensions);
        var children = iq.xml.childNodes;

        if (iq.type === 'get' || iq.type === 'set') {
            // Invalid request
            if (children.length != 1) {
                return self.sendIq({
                    id: iq.id,
                    type: 'error',
                    error: {
                        type: 'modify',
                        condition: 'bad-request'
                    }
                });
            }

            // Valid request, but we don't have support for the
            // payload data.
            if (!exts.length) {
                return self.sendIq({
                    id: iq.id,
                    type: 'error',
                    error: {
                        type: 'cancel',
                        condition: 'feature-not-implemented'
                    }
                });
            }

            var iqEvent = 'iq:' + iqType + ':' + exts[0];
            if (self.callbacks[iqEvent]) {
                self.emit(iqEvent, iq);
            } else {
                // We support the payload data, but there's
                // nothing registered to handle it.
                self.sendIq({
                    id: iq.id,
                    type: 'error',
                    error: {
                        type: 'cancel',
                        condition: 'feature-not-implemented'
                    }
                });
            }
        }
    });

    this.on('message', function (msg) {
        if (Object.keys(msg.$body).length) {
            if (msg.type === 'chat' || msg.type === 'normal') {
                self.emit('chat', msg);
            } else if (msg.type === 'groupchat') {
                self.emit('groupchat', msg);
            }
        }
    });

    this.on('presence', function (pres) {
        var presType = pres.type || 'available';
        self.emit(presType, pres);
    });
}

Client.prototype = Object.create(WildEmitter.prototype, {
    constructor: {
        value: Client
    }
});

Client.prototype.__defineGetter__('stream', function () {
    return this.conn ? this.conn.stream : undefined;
});

Client.prototype.use = function (pluginInit) {
    pluginInit(this);
};

Client.prototype.nextId = function () {
    return this._idPrefix + '-' + (this._idCount++).toString(16);
};

Client.prototype.connect = function () {
    this.conn.connect(this.config);
};

Client.prototype.disconnect = function () {
    if (this.sessionStarted) {
        this.emit('session:end');
        this.releaseGroup('session');
    }
    this.sessionStarted = false;
    this.releaseGroup('connection');
    if (this.conn) {
        this.conn.disconnect();
    }
};

Client.prototype.send = function (data) {
    this.conn.send(data);
};

Client.prototype.sendMessage = function (data) {
    data = data || {};
    if (!data.id) {
        data.id = this.nextId();
    }
    this.send(new Message(data));
};

Client.prototype.sendPresence = function (data) {
    data = data || {};
    if (!data.id) {
        data.id = this.nextId();
    }
    this.send(new Presence(data));
};

Client.prototype.sendIq = function (data, cb) {
    data = data || {};
    cb = cb || function () {};
    if (!data.id) {
        data.id = this.nextId();
    }
    if (data.type === 'get' || data.type === 'set') {
        this.once('id:' + data.id, 'session', function (resp) {
            if (resp._extensions.error) {
                cb(resp, null);
            } else {
                cb(null, resp);
            }
        });
    }
    this.send(new Iq(data));
};

Client.prototype.getRoster = function (cb) {
    var self = this;
    cb = cb || function () {};

    this.sendIq({
        type: 'get',
        roster: {
            ver: self.config.rosterVer
        }
    }, function (err, resp) {
        if (err) {
            return cb(err);
        }
        if (resp.type === 'result') {
            if (resp.roster.ver) {
                self.config.rosterVer = resp.roster.ver;
                self.emit('roster:ver', resp.roster.ver);
            }
        }
        cb(null, resp);
    });
};

Client.prototype.updateRosterItem = function (item, cb) {
    this.sendIq({
        type: 'set',
        roster: {
            items: [item]
        }
    }, cb);
};

Client.prototype.removeRosterItem = function (jid, cb) {
    this.updateRosterItem({jid: jid, subscription: 'remove'}, cb);
};

Client.prototype.subscribe = function (jid) {
    this.sendPresence({type: 'subscribe', to: jid});
};

Client.prototype.unsubscribe = function (jid) {
    this.sendPresence({type: 'unsubscribe', to: jid});
};

Client.prototype.acceptSubscription = function (jid) {
    this.sendPresence({type: 'subscribed', to: jid});
};

Client.prototype.denySubscription = function (jid) {
    this.sendPresence({type: 'unsubscribed', to: jid});
};


module.exports = Client;
});

require.define("/node_modules/wildemitter/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"wildemitter.js"}});

require.define("/node_modules/wildemitter/wildemitter.js",function(require,module,exports,__dirname,__filename,process){/*
WildEmitter.js is a slim little event emitter by @henrikjoreteg largely based 
on @visionmedia's Emitter from UI Kit.

Why? I wanted it standalone.

I also wanted support for wildcard emitters like this:

emitter.on('*', function (eventName, other, event, payloads) {
    
});

emitter.on('somenamespace*', function (eventName, payloads) {
    
});

Please note that callbacks triggered by wildcard registered events also get 
the event name as the first argument.
*/
module.exports = WildEmitter;

function WildEmitter() {
    this.callbacks = {};
}

// Listen on the given `event` with `fn`. Store a group name if present.
WildEmitter.prototype.on = function (event, groupName, fn) {
    var hasGroup = (arguments.length === 3),
        group = hasGroup ? arguments[1] : undefined, 
        func = hasGroup ? arguments[2] : arguments[1];
    func._groupName = group;
    (this.callbacks[event] = this.callbacks[event] || []).push(func);
    return this;
};

// Adds an `event` listener that will be invoked a single
// time then automatically removed.
WildEmitter.prototype.once = function (event, groupName, fn) {
    var self = this,
        hasGroup = (arguments.length === 3),
        group = hasGroup ? arguments[1] : undefined, 
        func = hasGroup ? arguments[2] : arguments[1];
    function on() {
        self.off(event, on);
        func.apply(this, arguments);
    }
    this.on(event, group, on);
    return this;
};

// Unbinds an entire group
WildEmitter.prototype.releaseGroup = function (groupName) {
    var item, i, len, handlers;
    for (item in this.callbacks) {
        handlers = this.callbacks[item];
        for (i = 0, len = handlers.length; i < len; i++) {
            if (handlers[i]._groupName === groupName) {
                //console.log('removing');
                // remove it and shorten the array we're looping through
                handlers.splice(i, 1);
                i--;
                len--;
            }
        }
    }
    return this;
};

// Remove the given callback for `event` or all
// registered callbacks.
WildEmitter.prototype.off = function (event, fn) {
    var callbacks = this.callbacks[event],
        i;
    
    if (!callbacks) return this;

    // remove all handlers
    if (arguments.length === 1) {
        delete this.callbacks[event];
        return this;
    }

    // remove specific handler
    i = callbacks.indexOf(fn);
    callbacks.splice(i, 1);
    return this;
};

// Emit `event` with the given args.
// also calls any `*` handlers
WildEmitter.prototype.emit = function (event) {
    var args = [].slice.call(arguments, 1),
        callbacks = this.callbacks[event],
        specialCallbacks = this.getWildcardCallbacks(event),
        i,
        len,
        item;

    if (callbacks) {
        for (i = 0, len = callbacks.length; i < len; ++i) {
            if (callbacks[i]) {
                callbacks[i].apply(this, args);
            } else {
                break;
            }
        }
    }

    if (specialCallbacks) {
        for (i = 0, len = specialCallbacks.length; i < len; ++i) {
            if (specialCallbacks[i]) {
                specialCallbacks[i].apply(this, [event].concat(args));
            } else {
                break;
            }
        }
    }

    return this;
};

// Helper for for finding special wildcard event handlers that match the event
WildEmitter.prototype.getWildcardCallbacks = function (eventName) {
    var item,
        split,
        result = [];

    for (item in this.callbacks) {
        split = item.split('*');
        if (item === '*' || (split.length === 2 && eventName.slice(0, split[1].length) === split[1])) {
            result = result.concat(this.callbacks[item]);
        }
    }
    return result;
};
});

require.define("/node_modules/async/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"./lib/async"}});

require.define("/node_modules/async/lib/async.js",function(require,module,exports,__dirname,__filename,process){/*global setImmediate: false, setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root, previous_async;

    root = this;
    if (root != null) {
      previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(root, arguments);
        }
    }

    //// cross-browser compatiblity functions ////

    var _each = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _each(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _each(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
            async.nextTick = function (fn) {
                // not a direct alias for IE10 compatibility
                setImmediate(fn);
            };
            async.setImmediate = async.nextTick;
        }
        else {
            async.nextTick = function (fn) {
                setTimeout(fn, 0);
            };
            async.setImmediate = async.nextTick;
        }
    }
    else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
            async.setImmediate = setImmediate;
        }
        else {
            async.setImmediate = async.nextTick;
        }
    }

    async.each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                }
            }));
        });
    };
    async.forEach = async.each;

    async.eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    async.forEachSeries = async.eachSeries;

    async.eachLimit = function (arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
    };
    async.forEachLimit = async.eachLimit;

    var _eachLimit = function (limit) {

        return function (arr, iterator, callback) {
            callback = callback || function () {};
            if (!arr.length || limit <= 0) {
                return callback();
            }
            var completed = 0;
            var started = 0;
            var running = 0;

            (function replenish () {
                if (completed >= arr.length) {
                    return callback();
                }

                while (running < limit && started < arr.length) {
                    started += 1;
                    running += 1;
                    iterator(arr[started - 1], function (err) {
                        if (err) {
                            callback(err);
                            callback = function () {};
                        }
                        else {
                            completed += 1;
                            running -= 1;
                            if (completed >= arr.length) {
                                callback();
                            }
                            else {
                                replenish();
                            }
                        }
                    });
                }
            })();
        };
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.each].concat(args));
        };
    };
    var doParallelLimit = function(limit, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.eachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = function (arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
    };

    var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
    };

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        if (!keys.length) {
            return callback(null);
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            _each(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (_keys(results).length === keys.length) {
                callback(null, results);
                callback = function () {};
            }
        });

        _each(keys, function (k) {
            var task = (tasks[k] instanceof Function) ? [tasks[k]]: tasks[k];
            var taskCallback = function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _each(_keys(results), function(rkey) {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor !== Array) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback.apply(null, arguments);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.setImmediate(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            eachfn.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            eachfn.each(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.parallel = function (tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.eachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (test()) {
                async.doWhilst(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doUntil = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (!test()) {
                async.doUntil(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.queue = function (worker, concurrency) {
        if (concurrency === undefined) {
            concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if(data.constructor !== Array) {
              data = [data];
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  callback: typeof callback === 'function' ? callback : null
              };

              if (pos) {
                q.tasks.unshift(item);
              } else {
                q.tasks.push(item);
              }

              if (q.saturated && q.tasks.length === concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
              _insert(q, data, false, callback);
            },
            unshift: function (data, callback) {
              _insert(q, data, true, callback);
            },
            process: function () {
                if (workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if (q.empty && q.tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    var next = function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if (q.drain && q.tasks.length + workers === 0) {
                            q.drain();
                        }
                        q.process();
                    };
                    var cb = only_once(next);
                    worker(task.data, cb);
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            }
        };
        return q;
    };

    async.cargo = function (worker, payload) {
        var working     = false,
            tasks       = [];

        var cargo = {
            tasks: tasks,
            payload: payload,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
                if(data.constructor !== Array) {
                    data = [data];
                }
                _each(data, function(task) {
                    tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    if (cargo.saturated && tasks.length === payload) {
                        cargo.saturated();
                    }
                });
                async.setImmediate(cargo.process);
            },
            process: function process() {
                if (working) return;
                if (tasks.length === 0) {
                    if(cargo.drain) cargo.drain();
                    return;
                }

                var ts = typeof payload === 'number'
                            ? tasks.splice(0, payload)
                            : tasks.splice(0);

                var ds = _map(ts, function (task) {
                    return task.data;
                });

                if(cargo.empty) cargo.empty();
                working = true;
                worker(ds, function () {
                    working = false;

                    var args = arguments;
                    _each(ts, function (data) {
                        if (data.callback) {
                            data.callback.apply(null, args);
                        }
                    });

                    process();
                });
            },
            length: function () {
                return tasks.length;
            },
            running: function () {
                return working;
            }
        };
        return cargo;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                callback.apply(null, memo[key]);
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      };
    };

    async.times = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.map(counter, iterator, callback);
    };

    async.timesSeries = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
    };

    async.compose = function (/* functions... */) {
        var fns = Array.prototype.reverse.call(arguments);
        return function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        };
    };

    var _applyEach = function (eachfn, fns /*args...*/) {
        var go = function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            return eachfn(fns, function (fn, cb) {
                fn.apply(that, args.concat([cb]));
            },
            callback);
        };
        if (arguments.length > 2) {
            var args = Array.prototype.slice.call(arguments, 2);
            return go.apply(this, args);
        }
        else {
            return go;
        }
    };
    async.applyEach = doParallel(_applyEach);
    async.applyEachSeries = doSeries(_applyEach);

    async.forever = function (fn, callback) {
        function next(err) {
            if (err) {
                if (callback) {
                    return callback(err);
                }
                throw err;
            }
            fn(next);
        }
        next();
    };

    // AMD / RequireJS
    if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // Node.js
    else if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());
});

require.define("/node_modules/node-uuid/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"./uuid.js"}});

require.define("/node_modules/node-uuid/uuid.js",function(require,module,exports,__dirname,__filename,process){//     uuid.js
//
//     (c) 2010-2012 Robert Kieffer
//     MIT License
//     https://github.com/broofa/node-uuid
(function() {
  var _global = this;

  // Unique ID creation requires a high quality random # generator.  We feature
  // detect to determine the best RNG source, normalizing to a function that
  // returns 128-bits of randomness, since that's what's usually required
  var _rng;

  // Node.js crypto-based RNG - http://nodejs.org/docs/v0.6.2/api/crypto.html
  //
  // Moderately fast, high quality
  if (typeof(require) == 'function') {
    try {
      var _rb = require('crypto').randomBytes;
      _rng = _rb && function() {return _rb(16);};
    } catch(e) {}
  }

  if (!_rng && _global.crypto && crypto.getRandomValues) {
    // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
    //
    // Moderately fast, high quality
    var _rnds8 = new Uint8Array(16);
    _rng = function whatwgRNG() {
      crypto.getRandomValues(_rnds8);
      return _rnds8;
    };
  }

  if (!_rng) {
    // Math.random()-based (RNG)
    //
    // If all else fails, use Math.random().  It's fast, but is of unspecified
    // quality.
    var  _rnds = new Array(16);
    _rng = function() {
      for (var i = 0, r; i < 16; i++) {
        if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
        _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
      }

      return _rnds;
    };
  }

  // Buffer class to use
  var BufferClass = typeof(Buffer) == 'function' ? Buffer : Array;

  // Maps for number <-> hex string conversion
  var _byteToHex = [];
  var _hexToByte = {};
  for (var i = 0; i < 256; i++) {
    _byteToHex[i] = (i + 0x100).toString(16).substr(1);
    _hexToByte[_byteToHex[i]] = i;
  }

  // **`parse()` - Parse a UUID into it's component bytes**
  function parse(s, buf, offset) {
    var i = (buf && offset) || 0, ii = 0;

    buf = buf || [];
    s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
      if (ii < 16) { // Don't overflow!
        buf[i + ii++] = _hexToByte[oct];
      }
    });

    // Zero out remaining bytes if string was short
    while (ii < 16) {
      buf[i + ii++] = 0;
    }

    return buf;
  }

  // **`unparse()` - Convert UUID byte array (ala parse()) into a string**
  function unparse(buf, offset) {
    var i = offset || 0, bth = _byteToHex;
    return  bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]];
  }

  // **`v1()` - Generate time-based UUID**
  //
  // Inspired by https://github.com/LiosK/UUID.js
  // and http://docs.python.org/library/uuid.html

  // random #'s we need to init node and clockseq
  var _seedBytes = _rng();

  // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
  var _nodeId = [
    _seedBytes[0] | 0x01,
    _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
  ];

  // Per 4.2.2, randomize (14 bit) clockseq
  var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

  // Previous uuid creation time
  var _lastMSecs = 0, _lastNSecs = 0;

  // See https://github.com/broofa/node-uuid for API details
  function v1(options, buf, offset) {
    var i = buf && offset || 0;
    var b = buf || [];

    options = options || {};

    var clockseq = options.clockseq != null ? options.clockseq : _clockseq;

    // UUID timestamps are 100 nano-second units since the Gregorian epoch,
    // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
    // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
    // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
    var msecs = options.msecs != null ? options.msecs : new Date().getTime();

    // Per 4.2.1.2, use count of uuid's generated during the current clock
    // cycle to simulate higher resolution clock
    var nsecs = options.nsecs != null ? options.nsecs : _lastNSecs + 1;

    // Time since last uuid creation (in msecs)
    var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

    // Per 4.2.1.2, Bump clockseq on clock regression
    if (dt < 0 && options.clockseq == null) {
      clockseq = clockseq + 1 & 0x3fff;
    }

    // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
    // time interval
    if ((dt < 0 || msecs > _lastMSecs) && options.nsecs == null) {
      nsecs = 0;
    }

    // Per 4.2.1.2 Throw error if too many uuids are requested
    if (nsecs >= 10000) {
      throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
    }

    _lastMSecs = msecs;
    _lastNSecs = nsecs;
    _clockseq = clockseq;

    // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
    msecs += 12219292800000;

    // `time_low`
    var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
    b[i++] = tl >>> 24 & 0xff;
    b[i++] = tl >>> 16 & 0xff;
    b[i++] = tl >>> 8 & 0xff;
    b[i++] = tl & 0xff;

    // `time_mid`
    var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
    b[i++] = tmh >>> 8 & 0xff;
    b[i++] = tmh & 0xff;

    // `time_high_and_version`
    b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
    b[i++] = tmh >>> 16 & 0xff;

    // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
    b[i++] = clockseq >>> 8 | 0x80;

    // `clock_seq_low`
    b[i++] = clockseq & 0xff;

    // `node`
    var node = options.node || _nodeId;
    for (var n = 0; n < 6; n++) {
      b[i + n] = node[n];
    }

    return buf ? buf : unparse(b);
  }

  // **`v4()` - Generate random UUID**

  // See https://github.com/broofa/node-uuid for API details
  function v4(options, buf, offset) {
    // Deprecated - 'format' argument, as supported in v1.2
    var i = buf && offset || 0;

    if (typeof(options) == 'string') {
      buf = options == 'binary' ? new BufferClass(16) : null;
      options = null;
    }
    options = options || {};

    var rnds = options.random || (options.rng || _rng)();

    // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;

    // Copy bytes to buffer, if provided
    if (buf) {
      for (var ii = 0; ii < 16; ii++) {
        buf[i + ii] = rnds[ii];
      }
    }

    return buf || unparse(rnds);
  }

  // Export public API
  var uuid = v4;
  uuid.v1 = v1;
  uuid.v4 = v4;
  uuid.parse = parse;
  uuid.unparse = unparse;
  uuid.BufferClass = BufferClass;

  if (_global.define && define.amd) {
    // Publish as AMD module
    define(function() {return uuid;});
  } else if (typeof(module) != 'undefined' && module.exports) {
    // Publish as node.js module
    module.exports = uuid;
  } else {
    // Publish as global (in browsers)
    var _previousRoot = _global.uuid;

    // **`noConflict()` - (browser only) to reset global 'uuid' var**
    uuid.noConflict = function() {
      _global.uuid = _previousRoot;
      return uuid;
    };

    _global.uuid = uuid;
  }
}());
});

require.define("crypto",function(require,module,exports,__dirname,__filename,process){module.exports = require("crypto-browserify")});

require.define("/node_modules/crypto-browserify/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {}});

require.define("/node_modules/crypto-browserify/index.js",function(require,module,exports,__dirname,__filename,process){var sha = require('./sha')
var rng = require('./rng')

var algorithms = {
  sha1: {
    hex: sha.hex_sha1,
    binary: sha.b64_sha1,
    ascii: sha.str_sha1
  }
}

function error () {
  var m = [].slice.call(arguments).join(' ')
  throw new Error([
    m,
    'we accept pull requests',
    'http://github.com/dominictarr/crypto-browserify'
    ].join('\n'))
}

exports.createHash = function (alg) {
  alg = alg || 'sha1'
  if(!algorithms[alg])
    error('algorithm:', alg, 'is not yet supported')
  var s = ''
  var _alg = algorithms[alg]
  return {
    update: function (data) {
      s += data
      return this
    },
    digest: function (enc) {
      enc = enc || 'binary'
      var fn
      if(!(fn = _alg[enc]))
        error('encoding:', enc , 'is not yet supported for algorithm', alg)
      var r = fn(s)
      s = null //not meant to use the hash after you've called digest.
      return r
    }
  }
}

exports.randomBytes = function(size, callback) {
  if (callback && callback.call) {
    try {
      callback.call(this, undefined, rng(size));
    } catch (err) { callback(err); }
  } else {
    return rng(size);
  }
}

// the least I can do is make error messages for the rest of the node.js/crypto api.
;['createCredentials'
, 'createHmac'
, 'createCypher'
, 'createCypheriv'
, 'createDecipher'
, 'createDecipheriv'
, 'createSign'
, 'createVerify'
, 'createDeffieHellman'
, 'pbkdf2'].forEach(function (name) {
  exports[name] = function () {
    error('sorry,', name, 'is not implemented yet')
  }
})
});

require.define("/node_modules/crypto-browserify/sha.js",function(require,module,exports,__dirname,__filename,process){/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

exports.hex_sha1 = hex_sha1;
exports.b64_sha1 = b64_sha1;
exports.str_sha1 = str_sha1;
exports.hex_hmac_sha1 = hex_hmac_sha1;
exports.b64_hmac_sha1 = b64_hmac_sha1;
exports.str_hmac_sha1 = str_hmac_sha1;

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_sha1(s){return binb2hex(core_sha1(str2binb(s),s.length * chrsz));}
function b64_sha1(s){return binb2b64(core_sha1(str2binb(s),s.length * chrsz));}
function str_sha1(s){return binb2str(core_sha1(str2binb(s),s.length * chrsz));}
function hex_hmac_sha1(key, data){ return binb2hex(core_hmac_sha1(key, data));}
function b64_hmac_sha1(key, data){ return binb2b64(core_hmac_sha1(key, data));}
function str_hmac_sha1(key, data){ return binb2str(core_hmac_sha1(key, data));}

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
  return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Calculate the HMAC-SHA1 of a key and some data
 */
function core_hmac_sha1(key, data)
{
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
  return core_sha1(opad.concat(hash), 512 + 160);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

/*
 * Convert an 8-bit or 16-bit string to an array of big-endian words
 * In 8-bit function, characters >255 have their hi-byte silently ignored.
 */
function str2binb(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (32 - chrsz - i%32);
  return bin;
}

/*
 * Convert an array of big-endian words to a string
 */
function binb2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (32 - chrsz - i%32)) & mask);
  return str;
}

/*
 * Convert an array of big-endian words to a hex string.
 */
function binb2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
           hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
  }
  return str;
}

/*
 * Convert an array of big-endian words to a base-64 string
 */
function binb2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
                | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
                |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}

});

require.define("/node_modules/crypto-browserify/rng.js",function(require,module,exports,__dirname,__filename,process){// Original code adapted from Robert Kieffer.
// details at https://github.com/broofa/node-uuid
(function() {
  var _global = this;

  var mathRNG, whatwgRNG;

  // NOTE: Math.random() does not guarantee "cryptographic quality"
  mathRNG = function(size) {
    var bytes = new Array(size);
    var r;

    for (var i = 0, r; i < size; i++) {
      if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
      bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return bytes;
  }

  // currently only available in webkit-based browsers.
  if (_global.crypto && crypto.getRandomValues) {
    var _rnds = new Uint32Array(4);
    whatwgRNG = function(size) {
      var bytes = new Array(size);
      crypto.getRandomValues(_rnds);

      for (var c = 0 ; c < size; c++) {
        bytes[c] = _rnds[c >> 2] >>> ((c & 0x03) * 8) & 0xff;
      }
      return bytes;
    }
  }

  module.exports = whatwgRNG || mathRNG;

}())});

require.define("/lib/stanza/sasl.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var _ = require('../../vendor/lodash');
var StreamFeatures = require('./streamFeatures');


function Mechanisms(data, xml) {
    return stanza.init(this, xml, data);
}
Mechanisms.prototype = {
    constructor: {
        value: Mechanisms
    },
    _name: 'sasl',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'mechanisms',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    required: true,
    get mechanisms() {
        var result = [];
        var mechs = stanza.find(this.xml, this.NS, 'mechanism');
        if (mechs.length) {
            _.each(mechs, function (mech) {
                result.push(mech.textContent);
            });
        }
        return result;
    },
    set mechanisms(value) {
        var self = this;
        var mechs = stanza.find(this.xml, this.NS, 'mechanism');
        if (mechs.length) {
            _.each(mechs, function (mech) {
                self.xml.remove(mech);
            });
        }
        _.each(value, function (name) {
            var mech = document.createElementNS(self.NS, 'mechanism');
            mech.textContent = name;
            self.xml.appendChild(mech);
        });
    }
};


function Auth(data, xml) {
    return stanza.init(this, xml, data);
}
Auth.prototype = {
    constructor: {
        value: Auth 
    },
    _name: 'saslAuth',
    _eventname: 'sasl:auth',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'auth',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get value() {
        return atob(this.xml.textContent);
    },
    set value(value) {
        this.xml.textContent = btoa(value) || '=';
    },
    get mechanism() {
        return stanza.getAttribute(this.xml, 'mechanism');
    },
    set mechanism(value) {
        stanza.setAttribute(this.xml, 'mechanism', value);
    }
};


function Challenge(data, xml) {
    return stanza.init(this, xml, data);
}
Challenge.prototype = {
    constructor: {
        value: Challenge 
    },
    _name: 'saslChallenge',
    _eventname: 'sasl:challenge',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'challenge',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get value() {
        return atob(this.xml.textContent);
    },
    set value(value) {
        this.xml.textContent = btoa(value) || '=';
    }
};


function Response(data, xml) {
    return stanza.init(this, xml, data);
}
Response.prototype = {
    constructor: {
        value: Response 
    },
    _name: 'saslResponse',
    _eventname: 'sasl:response',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'response',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get value() {
        return atob(this.xml.textContent);
    },
    set value(value) {
        this.xml.textContent = btoa(value) || '=';
    }
};


function Success(data, xml) {
    return stanza.init(this, xml, data);
}
Success.prototype = {
    constructor: {
        value: Success
    },
    _name: 'saslSuccess',
    _eventname: 'sasl:success',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'success',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get value() {
        return atob(this.xml.textContent);
    },
    set value(value) {
        this.xml.textContent = btoa(value) || '=';
    }
};


function Failure(data, xml) {
    return stanza.init(this, xml, data);
}
Failure.prototype = {
    constructor: {
        value: Success
    },
    _CONDITIONS: [
        'aborted', 'account-disabled', 'credentials-expired',
        'encryption-required', 'incorrect-encoding', 'invalid-authzid',
        'invalid-mechanism', 'malformed-request', 'mechanism-too-weak',
        'not-authorized', 'temporary-auth-failure',
    ],
    _name: 'saslFailure',
    _eventname: 'sasl:failure',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'failure',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get lang() {
        return this._lang || '';
    },
    set lang(value) {
        this._lang = value;
    },
    get condition() {
        var self = this;
        var result = [];
        _.each(this._CONDITIONS, function (condition) {
            var exists = stanza.find(self.xml, this.NS, condition);
            if (exists.length) {
                result.push(exists[0].tagName);
            }
        });
        return result[0] || '';
    },
    set condition(value) {
        var self = this;
        _.each(this._CONDITIONS, function (condition) {
            var exists = stanza.find(self.xml, self.NS, condition);
            if (exists.length) {
                self.xml.removeChild(exists[0]);
            }
        });

        if (value) {
            var condition = document.createElementNS(this.NS, value);
            condition.setAttribute('xmlns', this.NS);
            this.xml.appendChild(condition);
        }
    },
    get text() {
        var text = this.$text;
        return text[this.lang] || '';
    },
    get $text() {
        return stanza.getSubLangText(this.xml, this.NS, 'text', this.lang);
    },
    set text(value) {
        stanza.setSubLangText(this.xml, this.NS, 'text', value, this.lang);
    }
};


function Abort(data, xml) {
    return stanza.init(this, xml, data);
}
Abort.prototype = {
    constructor: {
        value: Abort 
    },
    _name: 'saslAbort',
    _eventname: 'sasl:abort',
    NS: 'urn:ietf:params:xml:ns:xmpp-sasl',
    EL: 'abort',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


stanza.extend(StreamFeatures, Mechanisms, 'sasl');
stanza.topLevel(Auth);
stanza.topLevel(Challenge);
stanza.topLevel(Response);
stanza.topLevel(Success);
stanza.topLevel(Failure);
stanza.topLevel(Abort);


exports.Mechanisms = Mechanisms;
exports.Auth = Auth;
exports.Challenge = Challenge;
exports.Response = Response;
exports.Success = Success;
exports.Failure = Failure;
exports.Abort = Abort;
});

require.define("/lib/stanza/streamFeatures.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');


function StreamFeatures(data, xml) {
    return stanza.init(this, xml, data);
}
StreamFeatures.prototype = {
    constructor: {
        value: StreamFeatures
    },
    _name: 'streamFeatures',
    NS: 'http://etherx.jabber.org/streams',
    EL: 'features',
    _FEATURES: [],
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get features() {
        return this._extensions;
    }
};

stanza.topLevel(StreamFeatures);


module.exports = StreamFeatures;
});

require.define("/lib/websocket.js",function(require,module,exports,__dirname,__filename,process){var WildEmitter = require('wildemitter');
var _ = require('../vendor/lodash');
var async = require('async');
var Stream = require('./stanza/stream');
var Message = require('./stanza/message');
var Presence = require('./stanza/presence');
var Iq = require('./stanza/iq');
var StreamManagement = require('./sm');
var uuid = require('node-uuid');


function WSConnection() {
    var self = this;

    WildEmitter.call(this);

    self.sm = new StreamManagement(self);

    self.sendQueue = async.queue(function (data, cb) {
        if (self.conn) {
            self.emit('raw:outgoing', data);

            self.sm.track(data);

            if (typeof data !== 'string') {
                data = data.toString();
            }

            self.conn.send(data);
        }
        cb();
    }, 1);

    function wrap(data) {
        var result = [self.streamStart, data, self.streamEnd].join('');
        return result;
    }

    function parse(data) {
        return (self.parser.parseFromString(data, 'application/xml')).childNodes[0];
    }

    self.on('connected', function () {
        self.send([
            '<stream:stream',
            'xmlns:stream="http://etherx.jabber.org/streams"',
            'xmlns="jabber:client"',
            'version="' + (self.config.version || '1.0') + '"',
            'xml:lang="' + (self.config.lang || 'en') + '"',
            'to="' + self.config.server + '">'
        ].join(' '));
    });

    self.on('raw:incoming', function (data) {
        var streamData, ended;

        data = data.trim();
        data = data.replace(/^(\s*<\?.*\?>\s*)*/, '');
        if (data.match(self.streamEnd)) {
            return self.disconnect();
        } else if (self.hasStream) {
            try {
                streamData = new Stream({}, parse(wrap(data)));
            } catch (e) {
                return self.disconnect();
            }
        } else {
            // Inspect start of stream element to get NS prefix name
            var parts = data.match(/^<(\S+:)?(\S+) /);
            self.streamStart = data;
            self.streamEnd = '</' + (parts[1] || '') + parts[2] + '>';

            ended = false;
            try {
                streamData = new Stream({}, parse(data + self.streamEnd));
            } catch (e) {
                try {
                    streamData = new Stream({}, parse(data));
                    ended = true;
                } catch (e2) {
                    return self.disconnect();
                }
            }

            self.hasStream = true;
            self.stream = streamData;
            self.emit('stream:start', streamData);
        }

        _.each(streamData._extensions, function (stanzaObj) {
            if (!stanzaObj.lang) {
                stanzaObj.lang = self.stream.lang;
            }

            if (stanzaObj._name === 'message' || stanzaObj._name === 'presence' || stanzaObj._name === 'iq') {
                self.sm.handle(stanzaObj);
                self.emit('stanza', stanzaObj);
            }
            self.emit(stanzaObj._eventname || stanzaObj._name, stanzaObj);
            self.emit('stream:data', stanzaObj);

            if (stanzaObj.id) {
                self.emit('id:' + stanzaObj.id, stanzaObj);
            }
        });

        if (ended) {
            self.emit('stream:end');
        }
    });
}

WSConnection.prototype = Object.create(WildEmitter.prototype, {
    constructor: {
        value: WSConnection
    }
});

WSConnection.prototype.connect = function (opts) {
    var self = this;

    self.config = opts;

    self.hasStream = false;
    self.streamStart = '<stream:stream xmlns:stream="http://etherx.jabber.org/streams">';
    self.streamEnd = '</stream:stream>';
    self.parser = new DOMParser();
    self.serializer = new XMLSerializer();

    self.conn = new WebSocket(opts.wsURL, 'xmpp');

    self.conn.onopen = function () {
        self.emit('connected', self);
    };

    self.conn.onclose = function () {
        self.emit('disconnected', self);
    };

    self.conn.onmessage = function (wsMsg) {
        self.emit('raw:incoming', wsMsg.data);
    };
};

WSConnection.prototype.disconnect = function () {
    if (this.conn) {
        if (this.hasStream) {
            this.conn.send('</stream:stream>');
            this.emit('raw:outgoing', '</stream:stream>');
            this.emit('stream:end');
        }
        this.hasStream = false;
        this.conn.close();
        this.stream = undefined;
        this.conn = undefined;
    }
};

WSConnection.prototype.restart = function () {
    var self = this;
    self.hasStream = false;
    self.send([
        '<stream:stream',
        'xmlns:stream="http://etherx.jabber.org/streams"',
        'xmlns="jabber:client"',
        'version="' + (self.config.version || '1.0') + '"',
        'xml:lang="' + (self.config.lang || 'en') + '"',
        'to="' + self.config.server + '">'
    ].join(' '));
};

WSConnection.prototype.send = function (data) {
    this.sendQueue.push(data);
};


module.exports = WSConnection;
});

require.define("/lib/stanza/stream.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');


function Stream(data, xml) {
    return stanza.init(this, xml, data);
}
Stream.prototype = {
    constructor: {
        value: Stream
    },
    _name: 'stream',
    NS: 'http://etherx.jabber.org/streams',
    EL: 'stream',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get lang() {
        return this.xml.getAttributeNS(stanza.XML_NS, 'lang') || '';
    },
    set lang(value) {
        this.xml.setAttributeNS(stanza.XML_NS, 'lang', value);
    },
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get version() {
        return stanza.getAttribute(this.xml, 'version', '1.0');
    },
    set version(value) {
        stanza.setAttribute(this.xml, 'version', value);
    },
    get to() {
        return stanza.getAttribute(this.xml, 'to');
    },
    set to(value) {
        stanza.setAttribute(this.xml, 'to', value);
    },
    get from() {
        return stanza.getAttribute(this.xml, 'from');
    },
    set from(value) {
        stanza.setAttribute(this.xml, 'from', value);
    }
}; 

module.exports = Stream;
});

require.define("/lib/sm.js",function(require,module,exports,__dirname,__filename,process){var SM = require('./stanza/sm');
var MAX_SEQ = Math.pow(2, 32);


function mod(v, n) {
    return ((v % n) + n) % n;
}


function StreamManagement(conn) {
    this.conn = conn;
    this.id = false;
    this.allowResume = true;
    this.started = false;
    this.lastAck = 0;
    this.handled = 0;
    this.windowSize = 1;
    this.windowCount = 0;
    this.unacked = [];
}

StreamManagement.prototype = {
    constructor: {
        value: StreamManagement
    },
    enable: function () {
        var enable = new SM.Enable();
        enable.resume = this.allowResume;
        this.conn.send(enable);
        this.handled = 0;
        this.started = true;
    },
    resume: function () {
        var resume = new SM.Resume({
            h: this.handled,
            previd: this.id
        });
        this.conn.send(resume);
        this.started = true;
    },
    enabled: function (resp) {
        this.id = resp.id;
    },
    resumed: function (resp) {
        this.id = resp.id;
        if (resp.h) {
            this.process(resp, true);
        }
    },
    failed: function (resp) {
        this.started = false;
        this.id = false;
        this.lastAck = 0;
        this.handled = 0;
        this.windowCount = 0;
        this.unacked = [];
    },
    ack: function () {
        this.conn.send(new SM.Ack({
            h: this.handled
        }));
    },
    request: function () {
        this.conn.send(new SM.Request());
    },
    process: function (ack, resend) {
        var self = this;
        var numAcked = mod(ack.h - this.lastAck, MAX_SEQ);

        for (var i = 0; i < numAcked && this.unacked.length > 0; i++) {
            this.conn.emit('stanza:acked', this.unacked.shift());
        }
        if (resend) {
            var resendUnacked = this.unacked;
            this.unacked = [];
            resendUnacked.forEach(function (stanza) {
                self.conn.send(stanza); 
            });
        }
        this.lastAck = ack.h;
    },
    track: function (stanza) {
        var name = stanza._name;
        var acceptable = {
            message: true,
            presence: true,
            iq: true
        };

        if (this.started && acceptable[name]) {
            this.unacked.push(stanza);
            this.windowCount += 1;
            if (this.windowCount == this.windowSize) {
                this.request();
                this.windowCount = 0;
            }
        }
    },
    handle: function (stanza) {
        if (this.started) {
            this.handled = mod(this.handled + 1, MAX_SEQ);
        }
    }
};

module.exports = StreamManagement;
});

require.define("/lib/stanza/sm.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var StreamFeatures = require('./streamFeatures');


function SMFeature(data, xml) {
    return stanza.init(this, xml, data);
}
SMFeature.prototype = {
    constructor: {
        value: SMFeature
    },
    _name: 'streamManagement',
    NS: 'urn:xmpp:sm:3',
    EL: 'sm',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Enable(data, xml) {
    return stanza.init(this, xml, data);
}
Enable.prototype = {
    constructor: {
        value: Enable
    },
    _name: 'smEnable',
    _eventname: 'stream:management:enable',
    NS: 'urn:xmpp:sm:3',
    EL: 'enable',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get resume() {
        return stanza.getBoolAttribute(this.xml, 'resume');
    },
    set resume(val) {
        stanza.setBoolAttribute(this.xml, 'resume', val);
    }
};


function Enabled(data, xml) {
    return stanza.init(this, xml, data);
}
Enabled.prototype = {
    constructor: {
        value: Enabled
    },
    _name: 'smEnabled',
    _eventname: 'stream:management:enabled',
    NS: 'urn:xmpp:sm:3',
    EL: 'enabled',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get resume() {
        return stanza.getBoolAttribute(this.xml, 'resume');
    },
    set resume(val) {
        stanza.setBoolAttribute(this.xml, 'resume', val);
    }
};


function Resume(data, xml) {
    return stanza.init(this, xml, data);
}
Resume.prototype = {
    constructor: {
        value: Resume
    },
    _name: 'smResume',
    _eventname: 'stream:management:resume',
    NS: 'urn:xmpp:sm:3',
    EL: 'resume',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get h() {
        return parseInt(stanza.getAttribute(this.xml, 'h', '0'), 10);
    },
    set h(value) {
        stanza.setAttribute(this.xml, 'h', '' + value);
    },
    get previd() {
        return stanza.getAttribute(this.xml, 'previd');
    },
    set previd(value) {
        stanza.setAttribute(this.xml, 'previd', value);
    }
};


function Resumed(data, xml) {
    return stanza.init(this, xml, data);
}
Resumed.prototype = {
    constructor: {
        value: Resumed
    },
    _name: 'smResumed',
    _eventname: 'stream:management:resumed',
    NS: 'urn:xmpp:sm:3',
    EL: 'resumed',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get h() {
        return parseInt(stanza.getAttribute(this.xml, 'h', '0'), 10);
    },
    set h(value) {
        stanza.setAttribute(this.xml, 'h', '' + value);
    },
    get previd() {
        return stanza.getAttribute(this.xml, 'previd');
    },
    set previd(value) {
        stanza.setAttribute(this.xml, 'previd', value);
    }
};


function Failed(data, xml) {
    return stanza.init(this, xml, data);
}
Failed.prototype = {
    constructor: {
        value: Failed
    },
    _name: 'smFailed',
    _eventname: 'stream:management:failed',
    NS: 'urn:xmpp:sm:3',
    EL: 'failed',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Ack(data, xml) {
    return stanza.init(this, xml, data);
}
Ack.prototype = {
    constructor: {
        value: Ack
    },
    _name: 'smAck',
    _eventname: 'stream:management:ack',
    NS: 'urn:xmpp:sm:3',
    EL: 'a',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get h() {
        return parseInt(stanza.getAttribute(this.xml, 'h', '0'), 10);
    },
    set h(value) {
        stanza.setAttribute(this.xml, 'h', '' + value);
    }
};


function Request(data, xml) {
    return stanza.init(this, xml, data);
}
Request.prototype = {
    constructor: {
        value: Request
    },
    _name: 'smRequest',
    _eventname: 'stream:management:request',
    NS: 'urn:xmpp:sm:3',
    EL: 'r',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


stanza.extend(StreamFeatures, SMFeature);
stanza.topLevel(Ack);
stanza.topLevel(Request);
stanza.topLevel(Enable);
stanza.topLevel(Enabled);
stanza.topLevel(Resume);
stanza.topLevel(Resumed);
stanza.topLevel(Failed);


exports.SMFeature = SMFeature;
exports.Enable = Enable;
exports.Enabled = Enabled;
exports.Resume = Resume;
exports.Resumed = Resumed;
exports.Failed = Failed;
exports.Ack = Ack;
exports.Request = Request;
});

require.define("/lib/stanza/roster.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');
var Iq = require('./iq');


function Roster(data, xml) {
    return stanza.init(this, xml, data);
}
Roster.prototype = {
    constructor: {
        value: Roster
    },
    _name: 'roster',
    NS: 'jabber:iq:roster',
    EL: 'query',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get ver() {
        return stanza.getAttribute(this.xml, 'ver');
    },
    set ver(value) {
        var force = (value === '');
        stanza.setAttribute(this.xml, 'ver', value, force);
    },
    get items() {
        var self = this;

        var items = stanza.find(this.xml, this.NS, 'item');
        if (!items.length) {
            return [];
        }
        var results = [];
        _.each(items, function (item) {
            var data = {
                jid: stanza.getAttribute(item, 'jid', undefined),
                _name: stanza.getAttribute(item, 'name', undefined),
                subscription: stanza.getAttribute(item, 'subscription', 'none'),
                ask: stanza.getAttribute(item, 'ask', undefined),
                groups: []
            };
            var groups = stanza.find(item, self.NS, 'group');
            _.each(groups, function (group) {
                data.groups.push(group.textContent);
            });
            results.push(data);
        });
        return results;
    },
    set items(values) {
        var self = this;
        _.each(values, function (value) {
            var item = document.createElementNS(self.NS, 'item');
            stanza.setAttribute(item, 'jid', value.jid);
            stanza.setAttribute(item, 'name', value.name);
            stanza.setAttribute(item, 'subscription', value.subscription);
            stanza.setAttribute(item, 'ask', value.ask);
            _.each(value.groups || [], function (name) {
                var group = document.createElementNS(self.NS, 'group');
                group.textContent = name;
                item.appendChild(group);
            });
            self.xml.appendChild(item);
        });
    }
};


stanza.extend(Iq, Roster);


module.exports = Roster;
});

require.define("/lib/stanza/error.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');
var Message = require('./message');
var Presence = require('./presence');
var Iq = require('./iq');


function Error(data, xml) {
    return stanza.init(this, xml, data);
}
Error.prototype = {
    constructor: {
        value: Error
    },
    _name: 'error',
    NS: 'jabber:client',
    EL: 'error',
    _ERR_NS: 'urn:ietf:params:xml:ns:xmpp-stanzas',
    _CONDITIONS: [
        'bad-request', 'conflict', 'feature-not-implemented',
        'forbidden', 'gone', 'internal-server-error',
        'item-not-found', 'jid-malformed', 'not-acceptable',
        'not-allowed', 'not-authorized', 'payment-required',
        'recipient-unavailable', 'redirect',
        'registration-required', 'remote-server-not-found',
        'remote-server-timeout', 'resource-constraint',
        'service-unavailable', 'subscription-required',
        'undefined-condition', 'unexpected-request'
    ],
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get lang() {
        if (this.parent) {
            return this.parent.lang;
        }
        return '';
    },
    get condition() {
        var self = this;
        var result = [];
        _.each(this._CONDITIONS, function (condition) {
            var exists = stanza.find(self.xml, self._ERR_NS, condition);
            if (exists.length) {
                result.push(exists[0].tagName);
            }
        });
        return result[0] || '';
    },
    set condition(value) {
        var self = this;
        _.each(this._CONDITIONS, function (condition) {
            var exists = stanza.find(self.xml, self._ERR_NS, condition);
            if (exists.length) {
                self.xml.removeChild(exists[0]);
            }
        });

        if (value) {
            var condition = document.createElementNS(this._ERR_NS, value);
            condition.setAttribute('xmlns', this._ERR_NS);
            this.xml.appendChild(condition);
        }
    },
    get gone() {
        return stanza.getSubText(this.xml, this._ERR_NS, 'gone');
    },
    set gone(value) {
        this.condition = 'gone';
        stanza.setSubText(this.xml, this._ERR_NS, 'gone', value);
    },
    get redirect() {
        return stanza.getSubText(this.xml, this._ERR_NS, 'redirect');
    },
    set redirect(value) {
        this.condition = 'redirect';
        stanza.setSubText(this.xml, this._ERR_NS, 'redirect', value);
    },
    get code() {
        return stanza.getAttribute(this.xml, 'code');
    },
    set code(value) {
        stanza.setAttribute(this.xml, 'code', value);
    },
    get type() {
        return stanza.getAttribute(this.xml, 'type');
    },
    set type(value) {
        stanza.setAttribute(this.xml, 'type', value);
    },
    get by() {
        return stanza.getAttribute(this.xml, 'by');
    },
    set by(value) {
        stanza.setAttribute(this.xml, 'by', value);
    },
    get $text() {
        return stanza.getSubLangText(this.xml, this._ERR_NS, 'text', this.lang);
    },
    set text(value) {
        stanza.setSubLangText(this.xml, this._ERR_NS, 'text', value, this.lang);
    },
    get text() {
        var text = this.$text;
        return text[this.lang] || '';
    },
};

stanza.extend(Message, Error);
stanza.extend(Presence, Error);
stanza.extend(Iq, Error);


module.exports = Error;
});

require.define("/lib/stanza/streamError.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');


function StreamError(data, xml) {
    return stanza.init(this, xml, data);
}
StreamError.prototype = {
    constructor: {
        value: StreamError
    },
    _name: 'streamError',
    NS: 'http://etherx.jabber.org/streams',
    EL: 'error',
    _ERR_NS: 'urn:ietf:params:xml:ns:xmpp-streams',
    _CONDITIONS: [
        'bad-format', 'bad-namespace-prefix', 'conflict',
        'connection-timeout', 'host-gone', 'host-unknown',
        'improper-addressing', 'internal-server-error', 'invalid-from',
        'invalid-namespace', 'invalid-xml', 'not-authorized',
        'not-well-formed', 'policy-violation', 'remote-connection-failed',
        'reset', 'resource-constraint', 'restricted-xml', 'see-other-host',
        'system-shutdown', 'undefined-condition', 'unsupported-encoding',
        'unsupported-feature', 'unsupported-stanza-type',
        'unsupported-version'
    ],
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get lang() {
        return this._lang || '';
    },
    set lang(value) {
        this._lang = value;
    },
    get condition() {
        var self = this;
        var result = [];
        _.each(this._CONDITIONS, function (condition) {
            var exists = stanza.find(self.xml, self._ERR_NS, condition);
            if (exists.length) {
                result.push(exists[0].tagName);
            }
        });
        return result[0] || '';
    },
    set condition(value) {
        var self = this;
        _.each(this._CONDITIONS, function (condition) {
            var exists = stanza.find(self.xml, self._ERR_NS, condition);
            if (exists.length) {
                self.xml.removeChild(exists[0]);
            }
        });

        if (value) {
            var condition = document.createElementNS(this._ERR_NS, value);
            condition.setAttribute('xmlns', this._ERR_NS);
            this.xml.appendChild(condition);
        }
    },
    get seeOtherHost() {
        return stanza.getSubText(this.xml, this._ERR_NS, 'see-other-host');
    },
    set seeOtherHost(value) {
        this.condition = 'see-other-host';
        stanza.setSubText(this.xml, this._ERR_NS, 'see-other-host', value);
    },
    get text() {
        var text = this.$text;
        return text[this.lang] || '';
    },
    get $text() {
        return stanza.getSubLangText(this.xml, this._ERR_NS, 'text', this.lang);
    },
    set text(value) {
        stanza.setSubLangText(this.xml, this._ERR_NS, 'text', value, this.lang);
    }
};

stanza.topLevel(StreamError);


module.exports = StreamError;
});

require.define("/lib/stanza/bind.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Iq = require('./iq');
var StreamFeatures = require('./streamFeatures');


function Bind(data, xml) {
    return stanza.init(this, xml, data);
}
Bind.prototype = {
    constructor: {
        value: Bind
    },
    _name: 'bind',
    NS: 'urn:ietf:params:xml:ns:xmpp-bind',
    EL: 'bind',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get resource() {
        return stanza.getSubText(this.xml, this.NS, 'resource');
    },
    set resource(value) {
        stanza.setSubText(this.xml, this.NS, 'resource');
    },
    get jid() {
        return stanza.getSubText(this.xml, this.NS, 'jid');
    },
    set jid(value) {
        stanza.setSubText(this.xml, this.NS, 'jid');
    }
};


stanza.extend(Iq, Bind);
stanza.extend(StreamFeatures, Bind);


module.exports = Bind;
});

require.define("/lib/stanza/session.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Iq = require('./iq');
var StreamFeatures = require('./streamFeatures');


function Session(data, xml) {
    return stanza.init(this, xml, data);
}
Session.prototype = {
    constructor: {
        value: Session
    },
    _name: 'session',
    NS: 'urn:ietf:params:xml:ns:xmpp-session',
    EL: 'session',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


stanza.extend(StreamFeatures, Session);
stanza.extend(Iq, Session);


module.exports = Session;
});

require.define("/lib/plugins/disco.js",function(require,module,exports,__dirname,__filename,process){/*global unescape, escape */

var _ = require('../../vendor/lodash');
var crypto = require('crypto');

require('../stanza/disco');
require('../stanza/caps');


var UTF8 = {
    encode: function (s) {
        return unescape(encodeURIComponent(s));
    },
    decode: function (s) {
        return decodeURIComponent(escape(s));
    }
};


function verifyVerString(info, hash, check) {
    if (hash === 'sha-1') {
        hash = 'sha1';
    }
    var computed = this._generatedVerString(info, hash);
    return computed && computed == check;
}


function generateVerString(info, hash) {
    var S = '';
    var features = info.features.sort();
    var identities = [];
    var formTypes = {};
    var formOrder = [];

    
    _.forEach(info.identities, function (identity) {
        identities.push([
            identity.category || '',
            identity.type || '',
            identity.lang || '',
            identity.name || ''
        ].join('/'));
    });

    var idLen = identities.length;
    var featureLen = features.length;

    identities = _.unique(identities, true);
    features = _.unique(features, true);

    if (featureLen != features.length || idLen != identities.length) {
        return false;
    }


    S += identities.join('<') + '<';
    S += features.join('<') + '<';


    var illFormed = false;
    _.forEach(info.extensions, function (ext) {
        var fields = ext.fields;
        for (var i = 0, len = fields.length; i < len; i++) {
            if (fields[i].name == 'FORM_TYPE' && fields[i].type == 'hidden') {
                var name = fields[i].value;
                if (formTypes[name]) {
                    illFormed = true;
                    return;
                }
                formTypes[name] = ext;
                formOrder.push(name);
                return;
            }
        }
    });
    if (illFormed) {
        return false;
    }

    formOrder.sort();

    _.forEach(formOrder, function (name) {
        var ext = formTypes[name];
        var fields = {};
        var fieldOrder = [];

        S += '<' + name;
       
        _.forEach(ext.fields, function (field) {
            var fieldName = field.name;
            if (fieldName != 'FORM_TYPE') {
                var values = field.value || '';
                if (typeof values != 'object') {
                    values = values.split('\n');
                }
                fields[fieldName] = values.sort();
                fieldOrder.push(fieldName);
            }
        });

        fieldOrder.sort();
       
        _.forEach(fieldOrder, function (fieldName) {
            S += '<' + fieldName;
            _.forEach(fields[fieldName], function (val) {
                S += '<' + val;
            });
        });
    });

    if (hash === 'sha-1') {
        hash = 'sha1';
    }

    var ver = crypto.createHash(hash).update(UTF8.encode(S)).digest();
    var padding = 4 - ver.length % 4;

    for (var i = 0; i < padding; i++) {
        ver += '=';
    }
    return ver;
}


function Disco(client) {
    this.features = {};
    this.identities = {};
    this.extensions = {};
    this.items = {};
    this.caps = {};
}

Disco.prototype = {
    constructor: {
        value: Disco
    },
    addFeature: function (feature, node) {
        node = node || ''; 
        if (!this.features[node]) {
            this.features[node] = [];
        }
        this.features[node].push(feature);
    },
    addIdentity: function (identity, node) {
        node = node || ''; 
        if (!this.identities[node]) {
            this.identities[node] = [];
        }
        this.identities[node].push(identity);
    },
    addItem: function (item, node) {
        node = node || ''; 
        if (!this.items[node]) {
            this.items[node] = [];
        }
        this.items[node].push(item);
    },
    addExtension: function (form, node) {
        node = node || ''; 
        if (!this.extensions[node]) {
            this.extensions[node] = [];
        }
        this.extensions[node].push(form);
    }
};

module.exports = function (client) {
    client.disco = new Disco(client);

    client.disco.addFeature('http://jabber.org/protocol/disco#info');
    client.disco.addIdentity({
        category: 'client',
        type: 'web'
    });

    client.getDiscoInfo = function (jid, node, cb) {
        this.sendIq({
            to: jid,
            type: 'get',
            discoInfo: {
                node: node
            }
        }, cb);
    };

    client.getDiscoItems = function (jid, node, cb) {
        this.sendIq({
            to: jid,
            type: 'get',
            discoItems: {
                node: node
            }
        }, cb);
    };

    client.updateCaps = function () {
        this.disco.caps = {
            node: this.config.capsNode || 'https://stanza.io',
            hash: 'sha-1',
            ver: generateVerString({
                identities: this.disco.identities[''],
                features: this.disco.features[''],
                extensions: this.disco.extensions['']
            }, 'sha-1')
        };
    };

    client.on('iq:get:discoInfo', function (iq) {
        var node = iq.discoInfo.node;
        var reportedNode = iq.discoInfo.node;

        if (node === client.disco.caps.node + '#' + client.disco.caps.ver) {
            reportedNode = node;
            node = '';
        }
        client.sendIq(iq.resultReply({
            discoInfo: {
                node: reportedNode,
                identities: client.disco.identities[node] || [],
                features: client.disco.features[node] || [],
                extensions: client.disco.extensions[node] || []
            }
        }));
    });

    client.on('iq:get:discoItems', function (iq) {
        var node = iq.discoInfo.node;
        client.sendIq(iq.resultReply({
            discoItems: {
                node: node,
                items: client.disco.items[node] || []
            }
        }));
    });
};
});

require.define("/lib/stanza/disco.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');
var Iq = require('./iq');
var RSM = require('./rsm');
var DataForm = require('./dataforms').DataForm;


function DiscoInfo(data, xml) {
    return stanza.init(this, xml, data);
}
DiscoInfo.prototype = {
    constructor: {
        value: DiscoInfo
    },
    _name: 'discoInfo',
    NS: 'http://jabber.org/protocol/disco#info',
    EL: 'query',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get identities() {
        var result = [];
        var identities = stanza.find(this.xml, this.NS, 'identity');
        _.each(identities, function (identity) {
            result.push({
                category: stanza.getAttribute(identity, 'category'),
                type: stanza.getAttribute(identity, 'type'),
                lang: identity.getAttributeNS(stanza.XML_NS, 'lang'),
                name: stanza.getAttribute(identity, 'name')
            });
        });
        return result;
    },
    set identities(values) {
        var self = this;

        var existing = stanza.find(this.xml, this.NS, 'identity');
        _.each(existing, function (item) {
            this.xml.removeChild(item);
        });
        _.each(values, function (value) {
            var identity = document.createElementNS(self.NS, 'identity');
            stanza.setAttribute(identity, 'category', value.category);
            stanza.setAttribute(identity, 'type', value.type);
            stanza.setAttribute(identity, 'name', value.name);
            if (value.lang) {
                identity.setAttributeNS(stanza.XML_NS, 'lang', value.lang);
            }
            self.xml.appendChild(identity);
        });

    },
    get features() {
        var result = [];
        var features = stanza.find(this.xml, this.NS, 'feature');
        _.each(features, function (feature) {
            result.push(feature.getAttribute('var'));
        });
        return result;
    },
    set features(values) {
        var self = this;

        var existing = stanza.find(this.xml, this.NS, 'feature');
        _.each(existing, function (item) {
            self.xml.removeChild(item);
        });
        _.each(values, function (value) {
            var feature = document.createElementNS(self.NS, 'feature');
            feature.setAttribute('var', value);
            self.xml.appendChild(feature);
        });
    },
    get extensions() {
        var self = this;
        var result = [];

        var forms = stanza.find(this.xml, DataForm.NS, DataForm.EL);
        _.forEach(forms, function (form) {
            var ext = new DataForm({}, form);
            result.push(ext.toJSON());
        });
    },
    set extensions(value) {
        var self = this;

        var forms = stanza.find(this.xml, DataForm.NS, DataForm.EL);
        _.forEach(forms, function (form) {
            self.xml.removeChild(form);
        });

        _.forEach(value, function (ext) {
            var form = new DataForm(ext);
            self.xml.appendChild(form.xml);
        });
    }
};


function DiscoItems(data, xml) {
    return stanza.init(this, xml, data);
}
DiscoItems.prototype = {
    constructor: {
        value: DiscoInfo
    },
    _name: 'discoItems',
    NS: 'http://jabber.org/protocol/disco#items',
    EL: 'query',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get items() {
        var result = [];
        var items = stanza.find(this.xml, this.NS, 'item');
        _.each(items, function (item) {
            result.push({
                jid: stanza.getAttribute(item, 'jid'),
                node: stanza.getAttribute(item, 'node'),
                name: stanza.getAttribute(item, 'name')
            });
        });
        return result;
    },
    set items(values) {
        var self = this;

        var existing = stanza.find(this.xml, this.NS, 'item');
        _.each(existing, function (item) {
            self.xml.removeChild(item);
        });
        _.each(values, function (value) {
            var item = document.createElementNS(self.NS, 'item');
            stanza.setAttribute(item, 'jid', value.jid);
            stanza.setAttribute(item, 'node', value.node);
            stanza.setAttribute(item, 'name', value.name);
            self.xml.appendChild(item);
        });
    }
};


stanza.extend(Iq, DiscoInfo);
stanza.extend(Iq, DiscoItems);
stanza.extend(DiscoItems, RSM);

exports.DiscoInfo = DiscoInfo;
exports.DiscoItems = DiscoItems;
});

require.define("/lib/stanza/rsm.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');


function RSM(data, xml) {
    return stanza.init(this, xml, data);
}
RSM.prototype = {
    constructor: {
        value: RSM 
    },
    NS: 'http://jabber.org/protocol/rsm',
    EL: 'set',
    _name: 'rsm',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get after() {
        return stanza.getSubText(this.xml, this.NS, 'after');
    },
    set after(value) {
        stanza.setSubText(this.xml, this.NS, 'after', value);
    },
    get before() {
        return stanza.getSubText(this.xml, this.NS, 'before');
    },
    set before(value) {
        stanza.setSubText(this.xml, this.NS, 'before', value);
    },
    get count() {
        return parseInt(stanza.getSubText(this.xml, this.NS, 'count') || '0', 10);
    },
    set count(value) {
        stanza.setSubText(this.xml, this.NS, 'count', value.toString());
    },
    get first() {
        return stanza.getSubText(this.xml, this.NS, 'first');
    },
    set first(value) {
        stanza.setSubText(this.xml, this.NS, 'first', value);
    },
    get firstIndex() {
        return stanza.getSubAttribute(this.xml, this.NS, 'first', 'index');
    },
    set firstIndex(value) {
        stanza.setSubAttribute(this.xml, this.NS, 'first', 'index', value);
    },
    get index() {
        return stanza.getSubText(this.xml, this.NS, 'index');
    },
    set index(value) {
        stanza.setSubText(this.xml, this.NS, 'index', value);
    },
    get last() {
        return stanza.getSubText(this.xml, this.NS, 'last');
    },
    set last(value) {
        stanza.setSubText(this.xml, this.NS, 'last', value);
    },
    get max() {
        return stanza.getSubText(this.xml, this.NS, 'max');
    },
    set max(value) {
        stanza.setSubText(this.xml, this.NS, 'max', value.toString());
    }
};


module.exports = RSM;
});

require.define("/lib/stanza/dataforms.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');
var Message = require('./message');


function DataForm(data, xml) {
    return stanza.init(this, xml, data);
}
DataForm.prototype = {
    constructor: {
        value: DataForm 
    },
    NS: 'jabber:x:data',
    EL: 'x',
    _name: 'form',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get title() {
        return stanza.getSubText(this.xml, this.NS, 'title');
    },
    set title(value) {
        stanza.setSubText(this.xml, this.NS, 'title', value);
    },
    get instructions() {
        return stanza.getMultiSubText(this.xml, this.NS, 'title').join('\n');
    },
    set instructions(value) {
        stanza.setMultiSubText(this.xml, this.NS, 'title', value.split('\n'));
    },
    get type() {
        return stanza.getAttribute(this.xml, 'type', 'form');
    },
    set type(value) {
        stanza.setAttribute(this.xml, 'type', value);
    },
    get fields() {
        var fields = stanza.find(this.xml, this.NS, 'field');
        var results = [];

        _.forEach(fields, function (field) {
            results.push(new Field({}, field).toJSON());
        });
        return results;
    },
    set fields(value) {
        var self = this;
        _.forEach(value, function (field) {
            self.addField(field); 
        });
    },
    addField: function (opts) {
        var field = new Field(opts);
        this.xml.appendChild(field.xml);
    },
};


function Field(data, xml) {
    stanza.init(this, xml, data);
    this._type = data.type || this.type;
    return this;
}
Field.prototype = {
    constructor: {
        value: Field
    },
    NS: 'jabber:x:data',
    EL: 'field',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get type() {
        return stanza.getAttribute(this.xml, 'type', 'text-single');
    },
    set type(value) {
        this._type = value;
        stanza.setAttribute(this.xml, 'type', value);
    },
    get name() {
        return stanza.getAttribute(this.xml, 'var');
    },
    set name(value) {
        stanza.setAttribute(this.xml, 'var', value);
    },
    get desc() {
        return stanza.getSubText(this.xml, this.NS, 'desc');
    },
    set desc(value) {
        stanza.setSubText(this.xml, this.NS, 'desc', value);
    },
    get value() {
        var vals = stanza.getMultiSubText(this.xml, this.NS, 'value');
        if (this._type === 'boolean') {
            return vals[0] === '1' || vals[0] === 'true';
        }
        if (vals.length > 1) {
            if (this._type === 'text-multi') {
                return vals.join('\n');
            }
            return vals;
        }
        return vals[0];
    },
    set value(value) {
        if (this._type === 'boolean') {
            stanza.setSubText(this.xml, this.NS, 'value', value ? '1' : '0');
        } else {
            if (this._type === 'text-multi') {
                value = value.split('\n');
            }
            stanza.setMultiSubText(this.xml, this.NS, 'value', value);
        }
    },
    get required() {
        var req = stanza.find(this.xml, this.NS, 'required');
        return req.length > 0;
    },
    set required(value) {
        var reqs = stanza.find(this.xml, this.NS, 'required');
        if (value && reqs.length === 0) {
            var req = document.createElementNS(this.NS, 'required');
            this.xml.appendChild(req);
        } else if (!value && reqs.length > 0) {
            _.forEach(reqs, function (req) {
                this.xml.removeChild(req);
            });
        }
    },
    get label() {
        return stanza.getAttribute(this.xml, 'label');
    },
    set label(value) {
        stanza.setAttribute(this.xml, 'label', value);
    },
    get options() {
        var self = this;
        return stanza.getMultiSubText(this.xml, this.NS, 'option', function (sub) {
            return stanza.getSubText(sub, self.NS, 'value');
        });
    },
    set options(value) {
        var self = this;
        stanza.setMultiSubText(this.xml, this.NS, 'option', value, function (val) {
            var opt = document.createElementNS(self.NS, 'option');
            var value = document.createElementNS(self.NS, 'value');

            opt.appendChild(value);
            value.textContent = val;
            self.xml.appendChild(opt);
        });
    }
};


stanza.extend(Message, DataForm);


exports.DataForm = DataForm;
exports.Field = Field;
});

require.define("/lib/stanza/caps.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Presence = require('./presence');
var StreamFeatures = require('./streamFeatures');


function Caps(data, xml) {
    return stanza.init(this, xml, data);
}
Caps.prototype = {
    constructor: {
        value: Caps 
    },
    NS: 'http://jabber.org/protocol/caps',
    EL: 'c',
    _name: 'caps',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get ver() {
        return stanza.getAttribute(this.xml, 'ver');
    },
    set ver(value) {
        stanza.setAttribute(this.xml, 'ver', value);
    },
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get hash() {
        return stanza.getAttribute(this.xml, 'hash');
    },
    set hash(value) {
        stanza.setAttribute(this.xml, 'hash', value);
    },
    get ext() {
        return stanza.getAttribute(this.xml, 'ext');
    },
    set ext(value) {
        stanza.setAttribute(this.xml, 'ext', value);
    }
};


stanza.extend(Presence, Caps);
stanza.extend(StreamFeatures, Caps);


module.exports = Caps;
});

require.define("/lib/plugins/chatstates.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/chatstates');


module.exports = function (client) {
    client.disco.addFeature('http://jabber.org/protocol/chatstates');
};
});

require.define("/lib/stanza/chatstates.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');


function ChatStateActive(data, xml) {
    return stanza.init(this, xml, data);
}
ChatStateActive.prototype = {
    constructor: {
        value: ChatStateActive
    },
    NS: 'http://jabber.org/protocol/chatstates',
    EL: 'active',
    _name: 'chatStateActive',
    _eventname: 'chat:active',
    toString: stanza.toString,
    toJSON: undefined
};


function ChatStateComposing(data, xml) {
    return stanza.init(this, xml, data);
}
ChatStateComposing.prototype = {
    constructor: {
        value: ChatStateComposing
    },
    NS: 'http://jabber.org/protocol/chatstates',
    EL: 'composing',
    _name: 'chatStateComposing',
    _eventname: 'chat:composing',
    toString: stanza.toString,
    toJSON: undefined
};


function ChatStatePaused(data, xml) {
    return stanza.init(this, xml, data);
}
ChatStatePaused.prototype = {
    constructor: {
        value: ChatStatePaused
    },
    NS: 'http://jabber.org/protocol/chatstates',
    EL: 'paused',
    _name: 'chatStatePaused',
    _eventname: 'chat:paused',
    toString: stanza.toString,
    toJSON: undefined
};


function ChatStateInactive(data, xml) {
    return stanza.init(this, xml, data);
}
ChatStateInactive.prototype = {
    constructor: {
        value: ChatStateInactive
    },
    NS: 'http://jabber.org/protocol/chatstates',
    EL: 'inactive',
    _name: 'chatStateInactive',
    _eventname: 'chat:inactive',
    toString: stanza.toString,
    toJSON: undefined
};


function ChatStateGone(data, xml) {
    return stanza.init(this, xml, data);
}
ChatStateGone.prototype = {
    constructor: {
        value: ChatStateGone
    },
    NS: 'http://jabber.org/protocol/chatstates',
    EL: 'gone',
    _name: 'chatStateGone',
    _eventname: 'chat:gone',
    toString: stanza.toString,
    toJSON: undefined
};


stanza.extend(Message, ChatStateActive);
stanza.extend(Message, ChatStateComposing);
stanza.extend(Message, ChatStatePaused);
stanza.extend(Message, ChatStateInactive);
stanza.extend(Message, ChatStateGone);


Message.prototype.__defineGetter__('chatState', function () {
    var self = this;
    var states = ['Active', 'Composing', 'Paused', 'Inactive', 'Gone'];

    for (var i = 0; i < states.length; i++) {
        if (self._extensions['chatState' + states[i]]) {
            return states[i].toLowerCase();
        }
    }
    return '';
});
Message.prototype.__defineSetter__('chatState', function (value) {    
    var self = this;
    var states = ['Active', 'Composing', 'Paused', 'Inactive', 'Gone'];

    states.forEach(function (state) {
        if (self._extensions['chatState' + state]) {
            self.xml.removeChild(self._extensions['chatState' + state].xml);
            delete self._extensions['chatState' + state];
        }
    });
    if (value) {
        this['chatState' + value.charAt(0).toUpperCase() + value.slice(1)];
    }
});
});

require.define("/lib/plugins/delayed.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/delayed');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:delay');
};
});

require.define("/lib/stanza/delayed.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');
var Presence = require('./presence');


function DelayedDelivery(data, xml) {
    return stanza.init(this, xml, data);
}
DelayedDelivery.prototype = {
    constructor: {
        value: DelayedDelivery
    },
    NS: 'urn:xmpp:delay',
    EL: 'delay',
    _name: 'delay',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get from() {
        return stanza.getAttribute(this.xml, 'from');
    },
    set from(value) {
        stanza.setAttribute(this.xml, 'from', value);
    },
    get stamp() {
        return new Date(stanza.getAttribute(this.xml, 'stamp'));
    },
    set stamp(value) {
        stanza.setAttribute(this.xml, 'stamp', value.toISOString());
    },
    get reason() {
        return this.xml.textContent || '';
    },
    set reason(value) {
        this.xml.textContent = value;
    }
};


stanza.extend(Message, DelayedDelivery);
stanza.extend(Presence, DelayedDelivery);


module.exports = DelayedDelivery;
});

require.define("/lib/plugins/forwarding.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/forwarded');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:forward:0');
};
});

require.define("/lib/stanza/forwarded.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');
var Presence = require('./presence');
var Iq = require('./iq');
var DelayedDelivery = require('./delayed');


function Forwarded(data, xml) {
    return stanza.init(this, xml, data);
}
Forwarded.prototype = {
    constructor: {
        value: Forwarded 
    },
    NS: 'urn:xmpp:forward:0',
    EL: 'forwarded',
    _name: 'forwarded',
    _eventname: 'forward',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


stanza.extend(Message, Forwarded);
stanza.extend(Forwarded, Message);
stanza.extend(Forwarded, Presence);
stanza.extend(Forwarded, Iq);
stanza.extend(Forwarded, DelayedDelivery);


module.exports = Forwarded;
});

require.define("/lib/plugins/carbons.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/carbons');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:carbons:2');

    client.enableCarbons = function (cb) {
        this.sendIq({
            type: 'set',
            enableCarbons: true
        }, cb);
    };

    client.disableCarbons = function (cb) {
        this.sendIq({
            type: 'set',
            disableCarbons: true
        }, cb);
    };

    client.on('message', function (msg) {
        if (msg._extensions.carbonSent) {
            return client.emit('carbon:sent', msg);
        }
        if (msg._extensions.carbonReceived) {
            return client.emit('carbon:received', msg);
        }
    });
};
});

require.define("/lib/stanza/carbons.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');
var Iq = require('./iq');
var Forwarded = require('./forwarded');


function Sent(data, xml) {
    return stanza.init(this, xml, data);
}
Sent.prototype = {
    constructor: {
        value: Sent
    },
    NS: 'urn:xmpp:carbons:2',
    EL: 'sent',
    _name: 'carbonSent',
    _eventname: 'carbon:sent',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Received(data, xml) {
    return stanza.init(this, xml, data);
}
Received.prototype = {
    constructor: {
        value: Received
    },
    NS: 'urn:xmpp:carbons:2',
    EL: 'received',
    _name: 'carbonReceived',
    _eventname: 'carbon:received',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Private(data, xml) {
    return stanza.init(this, xml, data);
}
Private.prototype = {
    constructor: {
        value: Private 
    },
    NS: 'urn:xmpp:carbons:2',
    EL: 'private',
    _name: 'carbonPrivate',
    _eventname: 'carbon:private',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Enable(data, xml) {
    return stanza.init(this, xml, data);
}
Enable.prototype = {
    constructor: {
        value: Enable
    },
    NS: 'urn:xmpp:carbons:2',
    EL: 'enable',
    _name: 'enableCarbons',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Disable(data, xml) {
    return stanza.init(this, xml, data);
}
Disable.prototype = {
    constructor: {
        value: Disable
    },
    NS: 'urn:xmpp:carbons:2',
    EL: 'disable',
    _name: 'disableCarbons',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


stanza.extend(Sent, Forwarded);
stanza.extend(Received, Forwarded);
stanza.extend(Message, Sent);
stanza.extend(Message, Received);
stanza.extend(Message, Private);
stanza.extend(Iq, Enable);
stanza.extend(Iq, Disable);


exports.Sent = Sent;
exports.Received = Received;
exports.Private = Private;
exports.Enable = Enable;
exports.Disable = Disable;
});

require.define("/lib/plugins/time.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/time');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:time');

    client.getTime = function (jid, cb) {
        this.sendIq({
            to: jid,
            type: 'get',
            time: true
        }, cb);
    };

    client.on('iq:get:time', function (iq) {
        var time = new Date();
        client.sendIq(iq.resultReply({
            time: {
                utc: time,
                tzo: time.getTimezoneOffset()
            }
        }));
    });
};
});

require.define("/lib/stanza/time.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Iq = require('./iq');


function EntityTime(data, xml) {
    return stanza.init(this, xml, data);
}
EntityTime.prototype = {
    constructor: {
        value: EntityTime 
    },
    NS: 'urn:xmpp:time',
    EL: 'time',
    _name: 'time',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get tzo() {
        var split, hrs, min;
        var sign = -1;
        var formatted = stanza.getSubText(this.xml, this.NS, 'tzo');

        if (!formatted) {
            return 0;
        }
        if (formatted.charAt(0) === '-') {
            sign = 1;
            formatted.slice(1);
        }
        split = formatted.split(':');
        hrs = parseInt(split[0], 10);
        min = parseInt(split[1], 10);
        return (hrs * 60 + min) * sign;
    },
    set tzo(value) {
        var hrs, min;
        var formatted = '-';
        if (typeof value === 'number') {
            if (value < 0) {
                value = -value;
                formatted = '+';
            }
            hrs = value / 60;
            min = value % 60;
            formatted += (hrs < 10 ? '0' : '') + hrs + ':' + (min < 10 ? '0' : '') + min;
        } else {
            formatted = value;
        }
        stanza.setSubText(this.xml, this.NS, 'tzo', formatted);
    },
    get utc() {
        var stamp = stanza.getSubText(this.xml, this.NS, 'utc');
        if (stamp) {
            return new Date(stamp);
        }
        return '';
    },
    set utc(value) {
        stanza.setSubText(this.xml, this.NS, 'utc', value.toISOString());
    }
};


stanza.extend(Iq, EntityTime);

module.exports = EntityTime;
});

require.define("/lib/plugins/mam.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/mam');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:mam:tmp');

    client.getHistory = function (opts, cb) {
        var self = this;
        var queryid = this.nextId();

        opts = opts || {};
        opts.queryid = queryid;

        var mamResults = [];
        this.on('mam:' + queryid, 'session', function (msg) {
            mamResults.push(msg);
        });

        cb = cb || function () {};

        this.sendIq({
            type: 'get',
            id: queryid,
            mamQuery: opts
        }, function (err, resp) {
            if (err) {
                cb(err);
            } else {
                self.off('mam:' + queryid);
                resp.mamQuery.results = mamResults;
                cb(null, resp);
            }
        });
    };

    client.on('message', function (msg) {
        if (msg._extensions.mam) {
            client.emit('mam:' + msg.mam.queryid, msg);
        }
    });
};
});

require.define("/lib/stanza/mam.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');
var Iq = require('./iq');
var Forwarded = require('./forwarded');
var RSM = require('./rsm');


function MAMQuery(data, xml) {
    return stanza.init(this, xml, data);
}
MAMQuery.prototype = {
    constructor: {
        value: MAMQuery
    },
    NS: 'urn:xmpp:mam:tmp',
    EL: 'query',
    _name: 'mamQuery',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get queryid() {
        return stanza.getAttribute(this.xml, 'queryid');
    },
    set queryid(value) {
        stanza.setAttribute(this.xml, 'queryid', value);
    },
    get start() {
        return new Date(stanza.getSubText(this.xml, this.NS, 'start') || '');
    },
    set start(value) {
        stanza.setSubText(this.xml, this.NS, 'start', value.toISOString());
    },
    get end() {
        return new Date(stanza.getSubText(this.xml, this.NS, 'end') || '');
    },
    set end(value) {
        stanza.setSubText(this.xml, this.NS, 'end', value.toISOString());
    }
};
MAMQuery.prototype.__defineGetter__('with', function () {
    return stanza.getSubText(this.xml, this.NS, 'with');
});
MAMQuery.prototype.__defineSetter__('with', function (value) {
    stanza.setSubText(this.xml, this.NS, 'with', value);
});


function Result(data, xml) {
    return stanza.init(this, xml, data);
}
Result.prototype = {
    constructor: {
        value: Result
    },
    NS: 'urn:xmpp:mam:tmp',
    EL: 'result',
    _name: 'mam',
    _eventname: 'mam:result',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get queryid() {
        return stanza.getAttribute(this.xml, 'queryid');
    },
    set queryid(value) {
        stanza.setAttribute(this.xml, 'queryid', value);
    },
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    }
};


function Archived(data, xml) {
    return stanza.init(this, xml, data);
}
Archived.prototype = {
    constructor: {
        value: Result
    },
    NS: 'urn:xmpp:mam:tmp',
    EL: 'archived',
    _name: 'archived',
    _eventname: 'mam:archived',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get by() {
        return stanza.getAttribute(this.xml, 'by');
    },
    set by(value) {
        stanza.setAttribute(this.xml, 'by', value);
    },
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    }
};


stanza.extend(Iq, MAMQuery);
stanza.extend(Message, Result);
stanza.extend(Message, Archived);
stanza.extend(Result, Forwarded);
stanza.extend(MAMQuery, RSM);

exports.MAMQuery = MAMQuery;
exports.Result = Result;
});

require.define("/lib/plugins/receipts.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/receipts');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:receipts');

    client.on('message', function (msg) {
        var ackTypes = {
            normal: true,
            chat: true,
            headline: true
        };
        if (ackTypes[msg.type] && msg.requestReceipt && !msg._extensions.receipt) {
            client.sendMessage({
                to: msg.from,
                receipt: {
                    id: msg.id
                },
                id: msg.id
            });
        }
        if (msg._extensions.receipt) {
            client.emit('receipt:' + msg.receipt.id);
        }
    });
};
});

require.define("/lib/stanza/receipts.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');


function Request(data, xml) {
    return stanza.init(this, xml, data);
}
Request.prototype = {
    constructor: {
        value: Request
    },
    NS: 'urn:xmpp:receipts',
    EL: 'request',
    _name: '_requestReceipt',
    toString: stanza.toString,
    toJSON: undefined
};


function Received(data, xml) {
    return stanza.init(this, xml, data);
}
Received.prototype = {
    constructor: {
        value: Received 
    },
    NS: 'urn:xmpp:receipts',
    EL: 'received',
    _name: 'receipt',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    }
};


Message.prototype.__defineGetter__('requestReceipt', function () {
    return !!this._extensions._requestReceipt;
});
Message.prototype.__defineSetter__('requestReceipt', function (value) {    
    if (value) {
        this._requestReceipt = true;
    } else if (this._extensions._requestReceipt) {
        this.xml.removeChild(this._extensions._requestReceipt.xml);
        delete this._extensions._requestReceipt;
    }
});


stanza.extend(Message, Received);
stanza.extend(Message, Request);

exports.Request = Request;
exports.Received = Received;
});

require.define("/lib/plugins/idle.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/idle');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:idle:0');
};
});

require.define("/lib/stanza/idle.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Presence = require('./presence');


function Idle(data, xml) {
    return stanza.init(this, xml, data);
}
Idle.prototype = {
    constructor: {
        value: Idle 
    },
    NS: 'urn:xmpp:idle:0',
    EL: 'idle',
    _name: 'idle',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get since() {
        return new Date(stanza.getAttribute(this.xml, 'since'));
    },
    set since(value) {
        stanza.setAttribute(this.xml, 'since', value.toISOString());
    }
};


stanza.extend(Presence, Idle);


module.exports = Idle;
});

require.define("/lib/plugins/correction.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/replace');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:message-correct:0');

    client.on('message', function (msg) {
        if (msg.replace) {
            client.emit('replace:' + msg.id, msg);
        }
    });
};
});

require.define("/lib/stanza/replace.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');


function Replace(data, xml) {
    return stanza.init(this, xml, data);
}
Replace.prototype = {
    constructor: {
        value: Replace 
    },
    NS: 'urn:xmpp:message-correct:0',
    EL: 'replace',
    _name: '_replace',
    toString: stanza.toString,
    toJSON: undefined,
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    }
};


stanza.extend(Message, Replace);

Message.prototype.__defineGetter__('replace', function () {
    if (this._extensions._replace) {
        return this._replace.id;
    }
    return '';
});
Message.prototype.__defineSetter__('replace', function (value) {    
    if (value) {
        this._replace.id = value;
    } else if (this._extensions._replace) {
        this.xml.removeChild(this._extensions._replace.xml);
        delete this._extensions._replace;
    }
});


module.exports = Replace;
});

require.define("/lib/plugins/attention.js",function(require,module,exports,__dirname,__filename,process){require('../stanza/attention');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:attention:0');


    client.getAttention = function (jid, opts) {
        opts = opts || {};
        opts.to = jid;
        opts.type = 'headline';
        opts.attention = true;
        client.sendMessage(opts);
    };

    client.on('message', function (msg) {
        if (msg._extensions._attention) {
            client.emit('attention', msg);
        }
    });
};
});

require.define("/lib/stanza/attention.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');


function Attention(data, xml) {
    return stanza.init(this, xml, data);
}
Attention.prototype = {
    constructor: {
        value: Attention 
    },
    NS: 'urn:xmpp:attention:0',
    EL: 'attention',
    _name: '_attention',
    toString: stanza.toString,
    toJSON: undefined
};

Message.prototype.__defineGetter__('attention', function () {
    return !!this._extensions._attention;
});
Message.prototype.__defineSetter__('attention', function (value) {    
    if (value) {
        this._attention = true;
    } else if (this._extensions._attention) {
        this.xml.removeChild(this._extensions._attention.xml);
        delete this._extensions._attention;
    }
});


stanza.extend(Message, Attention);

module.exports = Attention;
});

require.define("/lib/plugins/version.js",function(require,module,exports,__dirname,__filename,process){require('../stanza/version');


module.exports = function (client) {
    client.disco.addFeature('jabber:iq:version');

    client.on('iq:get:version', function (iq) {
        client.sendIq(iq.resultReply({
            version: client.config.version || {
                name: 'stanza.io'
            }
        }));
    });

    client.getSoftwareVersion = function (jid, cb) {
        this.sendIq({
            to: jid,
            type: 'get',
            version: {}
        }, cb);
    };
};
});

require.define("/lib/stanza/version.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Iq = require('./iq');


function Version(data, xml) {
    return stanza.init(this, xml, data);
}
Version.prototype = {
    constructor: {
        value: Version 
    },
    NS: 'jabber:iq:version',
    EL: 'query',
    _name: 'version',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get name() {
        return stanza.getSubText(this.xml, this.NS, 'name');
    },
    set name(value) {
        stanza.setSubText(this.xml, this.NS, 'name', value);
    },
    get version() {
        return stanza.getSubText(this.xml, this.NS, 'version');
    },
    set version(value) {
        stanza.setSubText(this.xml, this.NS, 'version', value);
    },
    get os() {
        return stanza.getSubText(this.xml, this.NS, 'os');
    },
    set os(value) {
        stanza.setSubText(this.xml, this.NS, 'os', value);
    }
};


stanza.extend(Iq, Version);


module.exports = Version;
});

require.define("/lib/plugins/invisible.js",function(require,module,exports,__dirname,__filename,process){require('../stanza/visibility');


module.exports = function (client) {
    client.goInvisible = function (cb) {
        this.sendIq({
            type: 'set',
            invisible: true
        });
    };

    client.goVisible = function (cb) {
        this.sendIq({
            type: 'set',
            visible: true
        });
    };
};
});

require.define("/lib/stanza/visibility.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Iq = require('./iq');


function Visible(data, xml) {
    return stanza.init(this, xml, data);
}
Visible.prototype = {
    constructor: {
        value: Visible 
    },
    NS: 'urn:xmpp:invisible:0',
    EL: 'visible',
    _name: '_visible',
    toString: stanza.toString,
    toJSON: undefined
};


function Invisible(data, xml) {
    return stanza.init(this, xml, data);
}
Invisible.prototype = {
    constructor: {
        value: Invisible 
    },
    NS: 'urn:xmpp:invisible:0',
    EL: 'invisible',
    _name: '_invisible',
    toString: stanza.toString,
    toJSON: undefined
};



Iq.prototype.__defineGetter__('visible', function () {
    return !!this._extensions._visible;
});
Iq.prototype.__defineSetter__('visible', function (value) {    
    if (value) {
        this._visible = true;
    } else if (this._extensions._visible) {
        this.xml.removeChild(this._extensions._visible.xml);
        delete this._extensions._visible;
    }
});


Iq.prototype.__defineGetter__('invisible', function () {
    return !!this._extensions._invisible;
});
Iq.prototype.__defineSetter__('invisible', function (value) {    
    if (value) {
        this._invisible = true;
    } else if (this._extensions._invisible) {
        this.xml.removeChild(this._extensions._invisible.xml);
        delete this._extensions._invisible;
    }
});


stanza.extend(Iq, Visible);
stanza.extend(Iq, Invisible);

exports.Visible = Visible;
exports.Invisible = Invisible;
});

require.define("/lib/plugins/muc.js",function(require,module,exports,__dirname,__filename,process){require('../stanza/muc');


module.exports = function (client) {
    client.joinRoom = function (room, nick, opts) {
        opts = opts || {};
        opts.to = room + '/' + nick;
        opts.caps = this.disco.caps;
        opts.joinMuc = opts.joinMuc || {};

        this.sendPresence(opts);
    };

    client.leaveRoom = function (room, nick, opts) {
        opts = opts || {};
        opts.to = room + '/' + nick;
        opts.type = 'unavailable';
        this.sendPresence(opts);
    };
};
});

require.define("/lib/stanza/muc.js",function(require,module,exports,__dirname,__filename,process){var stanza = require('jxt');
var Message = require('./message');
var Presence = require('./presence');
var Iq = require('./iq');


function MUCJoin(data, xml) {
    return stanza.init(this, xml, data);
}
MUCJoin.prototype = {
    constructor: {
        value: MUCJoin 
    },
    NS: 'http://jabber.org/protocol/muc',
    EL: 'x',
    _name: 'joinMuc',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get password() {
        return stanza.getSubText(this.xml, this.NS, 'password');
    },
    set password(value) {
        stanza.setSubText(this.xml, this.NS, 'password', value);
    },
    get history() {
        var result = {};
        var hist = stanza.find(this.xml, this.NS, 'history');

        if (!hist.length) {
            return {};
        }
        hist = hist[0];

        var maxchars = hist.getAttribute('maxchars') || '';
        var maxstanzas = hist.getAttribute('maxstanas') || '';
        var seconds = hist.getAttribute('seconds') || '';
        var since = hist.getAttribute('since') || '';


        if (maxchars) {
            result.maxchars = parseInt(maxchars, 10);
        }
        if (maxstanzas) {
            result.maxstanzas = parseInt(maxstanzas, 10);
        }
        if (seconds) {
            result.seconds = parseInt(seconds, 10);
        }
        if (since) {
            result.since = new Date(since);
        }
    },
    set history(opts) {
        var existing = stanza.find(this.xml, this.NS, 'history');
        if (existing.length) {
            for (var i = 0; i < existing.length; i++) {
                this.xml.removeChild(existing[i]);
            }
        }

        var hist = document.createElementNS(this.NS, 'history');
        this.xml.appendChild(hist);

        if (opts.maxchars) {
            hist.setAttribute('' + opts.maxchars);
        }
        if (opts.maxstanzas) {
            hist.setAttribute('' + opts.maxstanzas);
        }
        if (opts.seconds) {
            hist.setAttribute('' + opts.seconds);
        }
        if (opts.since) {
            hist.setAttribute(opts.since.toISOString());
        }
    }
};


stanza.extend(Presence, MUCJoin);

exports.MUCJoin = MUCJoin;
});

require.define("/lib/plugins/webrtc.js",function(require,module,exports,__dirname,__filename,process){var uuid = require('node-uuid');

// normalize environment
var RTCPeerConnection = null;
var RTCSessionDescription = null;
var RTCIceCandidate = null;
var getUserMedia = null;
var attachMediaStream = null;
var reattachMediaStream = null;
var browser = null;
var webRTCSupport = true;


if (navigator.mozGetUserMedia) {
    browser = "firefox";

    // The RTCPeerConnection object.
    RTCPeerConnection = window.mozRTCPeerConnection;

    // The RTCSessionDescription object.
    RTCSessionDescription = window.mozRTCSessionDescription;

    // The RTCIceCandidate object.
    RTCIceCandidate = window.mozRTCIceCandidate;

    // Get UserMedia (only difference is the prefix).
    // Code from Adam Barth.
    getUserMedia = navigator.mozGetUserMedia.bind(navigator);

    // Attach a media stream to an element.
    attachMediaStream = function (element, stream) {
        element.mozSrcObject = stream;
        element.play();
    };

    reattachMediaStream = function (to, from) {
        to.mozSrcObject = from.mozSrcObject;
        to.play();
    };

    // Fake get{Video,Audio}Tracks
    MediaStream.prototype.getVideoTracks = function () {
        return [];
    };

    MediaStream.prototype.getAudioTracks = function () {
        return [];
    };
} else if (navigator.webkitGetUserMedia) {
    browser = "chrome";

    // The RTCPeerConnection object.
    RTCPeerConnection = window.webkitRTCPeerConnection;

    // Get UserMedia (only difference is the prefix).
    // Code from Adam Barth.
    getUserMedia = navigator.webkitGetUserMedia.bind(navigator);

    // Attach a media stream to an element.
    attachMediaStream = function (element, stream) {
        element.autoplay = true;
        element.src = webkitURL.createObjectURL(stream);
    };

    reattachMediaStream = function (to, from) {
        to.src = from.src;
    };

    // The representation of tracks in a stream is changed in M26.
    // Unify them for earlier Chrome versions in the coexisting period.
    if (!webkitMediaStream.prototype.getVideoTracks) {
        webkitMediaStream.prototype.getVideoTracks = function () {
            return this.videoTracks;
        };
        webkitMediaStream.prototype.getAudioTracks = function () {
            return this.audioTracks;
        };
    }

    // New syntax of getXXXStreams method in M26.
    if (!window.webkitRTCPeerConnection.prototype.getLocalStreams) {
        window.webkitRTCPeerConnection.prototype.getLocalStreams = function () {
            return this.localStreams;
        };
        window.webkitRTCPeerConnection.prototype.getRemoteStreams = function () {
            return this.remoteStreams;
        };
    }
} else {
    webRTCSupport = false;
}

 
function WebRTC(client) {
    var self = this;

    this.client = client;
    this.peerConnectionConfig = {
        iceServers: browser == 'firefox' ? [{url: 'stun:124.124.124.2'}] : [{url: 'stun:stun.l.google.com:19302'}]
    };
    this.peerConnectionConstraints = {
        optional: [{DtlsSrtpKeyAgreement: true}]
    };
    this.media = {
        audio: true,
        video: {
            mandatory: {},
            optional: []
        }
    };
    this.sessions = {};
    this.peerSessions = {};

    this.attachMediaStream = attachMediaStream;

    // check for support
    if (!webRTCSupport) {
        client.emit('webrtc:unsupported');
        return self;
    } else {
        client.emit('webrtc:supported');

        client.disco.addFeature('http://stanza.io/protocol/sox');

        client.on('message', function (msg) {
            if (msg.type !== 'error' && msg._extensions.sox) {
                var session;
                var fullId = msg.from + ':' + msg.sox.sid;

                if (msg.sox.type === 'offer') {
                    console.log('got an offer');
                    session = new Peer(client, msg.from, msg.sox.sid);
                    self.sessions[fullId] = session;
                    if (!self.peerSessions[msg.from]) {
                        self.peerSessions[msg.from] = [];
                    }
                    self.peerSessions[msg.from].push(fullId);
                } else if (msg.sox.type === 'answer') {
                    console.log('got an answer');
                    session = self.sessions[fullId];
                    if (session) {
                        console.log('Setting remote description');
                        session.conn.setRemoteDescription(new RTCSessionDescription({
                            type: 'answer',
                            sdp: msg.sox.sdp
                        }));
                    }
                } else if (msg.sox.type === 'candidate') {
                    session = self.sessions[fullId];
                    if (session) {
                        console.log('Adding new ICE candidate');
                        session.conn.addIceCandidate(new RTCIceCandidate({
                            sdpMLineIndex: msg.sox.label,
                            candidate: msg.sox.sdp
                        }));
                    }
                }
                client.emit('webrtc:' + msg.sox.type, msg);
            }
        });
    }
}

WebRTC.prototype = {
    constructor: {
        value: WebRTC
    },
    testReadiness: function () {
        var self = this;
        if (this.localStream && this.client.sessionStarted) {
            // This timeout is a workaround for the strange no-audio bug
            // as described here: https://code.google.com/p/webrtc/issues/detail?id=1525
            // remove timeout when this is fixed.
            setTimeout(function () {
                self.client.emit('webrtc:ready');
            }, 1000);
        }
    },
    startLocalMedia: function (element) {
        var self = this;
        getUserMedia(this.media, function (stream) {
            attachMediaStream(element, stream);
            self.localStream = stream;
            self.testReadiness();
        }, function () {
            throw new Error('Failed to get access to local media.');
        });
    },
    offerSession: function (peer) {
        var self = this;
        var sid = uuid.v4();
        var session = new Peer(this.client, peer, sid);

        this.sessions[peer + ':' + sid] = session;
        if (!this.peerSessions[peer]) {
            this.peerSessions[peer] = [];
        }
        this.peerSessions[peer].push(peer + ':' + sid);

        session.conn.createOffer(function (sdp) {
            console.log('Setting local description');
            session.conn.setLocalDescription(sdp);
            console.log('Sending offer');
            self.client.sendMessage({
                to: peer,
                sox: {
                    type: 'offer',
                    sid: sid,
                    sdp: sdp.sdp
                }
            });
        }, null, this.mediaConstraints);
    },
    acceptSession: function (offerMsg) {
        var self = this;
        var session = self.sessions[offerMsg.from + ':' + offerMsg.sox.sid];

        if (session) {
            console.log('Setting remote description');
            session.conn.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: offerMsg.sox.sdp
            }));
            session.conn.createAnswer(function (sdp) {
                console.log('Setting local description');
                session.conn.setLocalDescription(sdp);
                console.log('Sending answer');
                self.client.sendMessage({
                    to: session.jid,
                    sox: {
                        type: 'answer',
                        sid: session.sid,
                        sdp: sdp.sdp
                    }
                });
            }, null, this.mediaConstraints);
        }
    },
    declineSession: function (offerMsg) {
        this.endSession(offerMsg.from, offerMsg.sox.sid);
    },
    endSession: function (peer, sid) {
        var session = this.sessions[peer + ':' + sid];
        if (session) {
            var fullId = peer + ':' + sid;
            var index = this.peerSessions[peer].indexOf(fullId);

            if (index != -1) {
                this.peerSessions.splice(index, 1);
            }
            this.sessions[fullId] = undefined;

            session.conn.close();
            this.client.emit('webrtc:stream:removed', {
                sid: session.sid,
                peer: session.jid
            });

            this.client.sendMessage({
                to: peer,
                sox: {
                    type: 'end',
                    sid: sid
                }
            });
        }
    },
    // Audio controls
    mute: function () {
        this._audioEnabled(false);
        this.client.emit('webrtc:audio:off');
    },
    unmute: function () {
        this._audioEnabled(true);
        this.client.emit('webrtc:audio:on');
    },
    // Video controls
    pauseVideo: function () {
        this._videoEnabled(false);
        this.client.emit('webrtc:video:off');
    },
    resumeVideo: function () {
        this._videoEnabled(true);
        this.client.emit('webrtc:video:on');
    },
    // Combined controls
    pause: function () {
        this.mute();
        this.pauseVideo();
    },
    resume: function () {
        this.unmute();
        this.resumeVideo();
    },
    // Internal methods for enabling/disabling audio/video
    _audioEnabled: function (bool) {
        this.localStream.getAudioTracks().forEach(function (track) {
            track.enabled = !!bool;
        });
    },
    _videoEnabled: function (bool) {
        this.localStream.getVideoTracks().forEach(function (track) {
            track.enabled = !!bool;
        });
    }
};


function Peer(client, jid, sid) {
    var self = this;

    this.client = client;
    this.jid = jid;
    this.sid = sid;
    this.closed = false;

    this.conn = new RTCPeerConnection(client.webrtc.peerConnectionConfig, client.webrtc.peerConnectionConstraints);
    this.conn.addStream(client.webrtc.localStream);
    this.conn.onicecandidate = function (event) {
        if (self.closed) return;
        if (event.candidate) {
            console.log('Sending candidate');
            self.client.sendMessage({
                mto: self.jid,
                sox: {
                    type: 'candidate',
                    sid: self.sid,
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    sdp: event.candidate.candidate
                }
            });
        } else {
            console.log('End of ICE candidates');
        }
    };
    this.conn.onaddstream = function (event) {
        self.client.emit('webrtc:stream:added', {
            stream: event.stream,
            sid: self.sid,
            peer: self.jid
        });
    };
    this.conn.onremovestream = function (event) {
        self.client.emit('webrtc:stream:removed', {
            sid: self.sid,
            peer: self.jid
        });
    };

    this.mediaConstraints = {
        mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true
        }
    };
}

Peer.prototype = {
    constructor: {
        value: Peer
    }
};


module.exports = function (client) {
    client.webrtc = new WebRTC(client);
};
});

require.define("/lib/plugins/pubsub.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/pubsub');


module.exports = function (client) {

    client.on('message', function (msg) {
        if (msg._extensions.event) {
            client.emit('pubsubEvent', msg);
        }
    });

    client.subscribeToNode = function (jid, opts, cb) {
        client.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                subscribe: {
                    node: opts.node,
                    jid: opts.jid || client.jid
                }
            }
        }, cb);
    };

    client.unsubscribeFromNode = function (jid, opts, cb) {
        client.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                unsubscribe: {
                    node: opts.node,
                    jid: opts.jid || client.jid.split('/')[0]
                }
            }
        }, cb);
    };

    client.publish = function (jid, node, item, cb) {
        client.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                publish: {
                    node: node,
                    item: item
                }
            }
        }, cb);
    };

    client.getItem = function (jid, node, id, cb) {
        client.sendIq({
            type: 'get',
            to: jid,
            pubsub: {
                retrieve: {
                    node: node,
                    item: id
                }
            }
        }, cb);
    };

    client.getItems = function (jid, node, opts, cb) {
        opts = opts || {};
        opts.node = node;
        client.sendIq({
            type: 'get',
            to: jid,
            pubsub: {
                retrieve: {
                    node: node,
                    max: opts.max 
                },
                rsm: opts.rsm
            }
        }, cb);
    };

    client.retract = function (jid, node, id, notify, cb) {
        client.sendIq({
            type: 'set',
            to: jid,
            pubsub: {
                retract: {
                    node: node,
                    notify: notify,
                    id: id
                }
            }
        }, cb);
    };

    client.purgeNode = function (jid, node, cb) {
        client.sendIq({
            type: 'set',
            to: jid,
            pubsubOwner: {
                purge: node
            }
        }, cb);
    };

    client.deleteNode = function (jid, node, cb) {
        client.sendIq({
            type: 'set',
            to: jid,
            pubsubOwner: {
                del: node
            }
        }, cb);
    };

    client.createNode = function (jid, node, config, cb) {
        var cmd = {
            type: 'set',
            to: jid,
            pubsubOwner: {
                create: node
            }
        };
        
        if (config) {
            cmd.pubsubOwner.config = {form: config};
        }

        client.sendIq(cmd, cb);
    };
};
});

require.define("/lib/stanza/pubsub.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');
var Iq = require('./iq');
var Message = require('./message');
var Form = require('./dataforms').DataForm;
var RSM = require('./rsm');


function Pubsub(data, xml) {
    return stanza.init(this, xml, data);
}
Pubsub.prototype = {
    constructor: {
        value: Pubsub
    },
    _name: 'pubsub',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'pubsub',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get publishOptions() {
        var conf = stanza.find(this.xml, this.NS, 'publish-options');
        if (conf.length && conf[0].childNodes.length) {
            return new Form({}, conf[0].childNodes[0]);
        }
    },
    set publishOptions(value) {
        var conf = stanza.findOrCreate(this.xml, this.NS, 'publish-options');
        if (value) {
            var form = new Form(value);
            conf.appendChild(form.xml);
        }
    }
};


function PubsubOwner(data, xml) {
    return stanza.init(this, xml, data);
}
PubsubOwner.prototype = {
    constructor: {
        value: PubsubOwner
    },
    _name: 'pubsubOwner',
    NS: 'http://jabber.org/protocol/pubsub#owner',
    EL: 'pubsub',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get create() {
        return stanza.getSubAttribute(this.xml, this.NS, 'create', 'node');
    },
    set create(value) {
        stanza.setSubAttribute(this.xml, this.NS, 'create', 'node', value);
    },
    get purge() {
        return stanza.getSubAttribute(this.xml, this.NS, 'purge', 'node');
    },
    set purge(value) {
        stanza.setSubAttribute(this.xml, this.NS, 'purge', 'node', value);
    },
    get del() {
        return stanza.getSubAttribute(this.xml, this.NS, 'delete', 'node');
    },
    set del(value) {
        stanza.setSubAttribute(this.xml, this.NS, 'delete', 'node', value);
    },
    get redirect() {
        var del = stanza.find(this.xml, this.NS, 'delete');
        if (del.length) {
            return stanza.getSubAttribute(del, this.NS, 'redirect', 'uri');
        }
        return '';
    },
    set redirect(value) {
        var del = stanza.findOrCreate(this.xml, this.NS, 'delete');
        stanza.setSubAttribute(del, this.NS, 'redirect', 'uri', value);
    }
};


function Configure(data, xml) {
    return stanza.init(this, xml, data);
}
Configure.prototype = {
    constructor: {
        value: Configure
    },
    _name: 'config',
    NS: 'http://jabber.org/protocol/pubsub#owner',
    EL: 'configure',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    }
};


function Event(data, xml) {
    return stanza.init(this, xml, data);
}
Event.prototype = {
    constructor: {
        value: Event
    },
    _name: 'event',
    NS: 'http://jabber.org/protocol/pubsub#event',
    EL: 'event',
    toString: stanza.toString,
    toJSON: stanza.toJSON
};


function Subscribe(data, xml) {
    return stanza.init(this, xml, data);
}
Subscribe.prototype = {
    constructor: {
        value: Subscribe
    },
    _name: 'subscribe',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'subscribe',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get jid() {
        return stanza.getAttribute(this.xml, 'jid');
    },
    set jid(value) {
        stanza.setAttribute(this.xml, 'jid', value);
    }
};


function Subscription(data, xml) {
    return stanza.init(this, xml, data);
}
Subscription.prototype = {
    constructor: {
        value: Subscription
    },
    _name: 'subscription',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'subscription',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get jid() {
        return stanza.getAttribute(this.xml, 'jid');
    },
    set jid(value) {
        stanza.setAttribute(this.xml, 'jid', value);
    },
    get subid() {
        return stanza.getAttribute(this.xml, 'subid');
    },
    set subid(value) {
        stanza.setAttribute(this.xml, 'subid', value);
    },
    get type() {
        return stanza.getAttribute(this.xml, 'subscription');
    },
    set type(value) {
        stanza.setAttribute(this.xml, 'subscription', value);
    }
};


function Unsubscribe(data, xml) {
    return stanza.init(this, xml, data);
}
Unsubscribe.prototype = {
    constructor: {
        value: Unsubscribe
    },
    _name: 'unsubscribe',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'unsubscribe',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get jid() {
        return stanza.getAttribute(this.xml, 'jid');
    },
    set jid(value) {
        stanza.setAttribute(this.xml, 'jid', value);
    }
};


function Publish(data, xml) {
    return stanza.init(this, xml, data);
}
Publish.prototype = {
    constructor: {
        value: Publish
    },
    _name: 'publish',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'publish',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get item() {
        var items = this.items;
        if (items.length) {
            return items[0];
        }
    },
    set item(value) {
        this.items = [value];
    }
};


function Retract(data, xml) {
    return stanza.init(this, xml, data);
}
Retract.prototype = {
    constructor: {
        value: Retract 
    },
    _name: 'retract',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'retract',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get notify() {
        var notify = stanza.getAttribute(this.xml, 'notify');
        return notify === 'true' || notify === '1';
    },
    set notify(value) {
        if (value) {
            value = '1';
        }
        stanza.setAttribute(this.xml, 'notify', value);
    },
    get id() {
        return stanza.getSubAttribute(this.xml, this.NS, 'item', 'id');
    },
    set id(value) {
        stanza.setSubAttribute(this.xml, this.NS, 'item', 'id', value);
    }
};


function Retrieve(data, xml) {
    return stanza.init(this, xml, data);
}
Retrieve.prototype = {
    constructor: {
        value: Retrieve
    },
    _name: 'retrieve',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'items',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get max() {
        return stanza.getAttribute(this.xml, 'max_items');
    },
    set max(value) {
        stanza.setAttribute(this.xml, 'max_items', value);
    }
};


function Item(data, xml) {
    return stanza.init(this, xml, data);
}
Item.prototype = {
    constructor: {
        value: Item 
    },
    _name: 'item',
    NS: 'http://jabber.org/protocol/pubsub',
    EL: 'item',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    }
};


function EventItems(data, xml) {
    return stanza.init(this, xml, data);
}
EventItems.prototype = {
    constructor: {
        value: EventItems
    },
    _name: 'updated',
    NS: 'http://jabber.org/protocol/pubsub#event',
    EL: 'items',
    toString: stanza.toString,
    toJSON: function () {
        var json = stanza.toJSON.apply(this);
        var items = [];
        _.forEach(json.published, function (item) {
            items.push(item.toJSON());
        });
        json.published = items;
        return json;
    },
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get published() {
        var results = [];
        var items = stanza.find(this.xml, this.NS, 'item');

        _.forEach(items, function (xml) {
            results.push(new EventItem({}, xml));
        });
        return results;
    },
    set published(value) {
        var self = this;
        _.forEach(value, function (data) {
            var item = new EventItem(data);
            this.xml.appendChild(item.xml);
        });
    },
    get retracted() {
        var results = [];
        var retracted = stanza.find(this.xml, this.NS, 'retract');

        _.forEach(retracted, function (xml) {
            results.push(xml.getAttribute('id'));
        });
        return results;
    },
    set retracted(value) {
        var self = this;
        _.forEach(value, function (id) {
            var retracted = document.createElementNS(self.NS, 'retract');
            retracted.setAttribute('id', id);
            this.xml.appendChild(retracted);
        });
    }
};


function EventItem(data, xml) {
    return stanza.init(this, xml, data);
}
EventItem.prototype = {
    constructor: {
        value: EventItem
    },
    _name: 'eventItem',
    NS: 'http://jabber.org/protocol/pubsub#event',
    EL: 'item',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get node() {
        return stanza.getAttribute(this.xml, 'node');
    },
    set node(value) {
        stanza.setAttribute(this.xml, 'node', value);
    },
    get publisher() {
        return stanza.getAttribute(this.xml, 'publisher');
    },
    set publisher(value) {
        stanza.setAttribute(this.xml, 'publisher', value);
    }
};


stanza.extend(Pubsub, Subscribe);
stanza.extend(Pubsub, Unsubscribe);
stanza.extend(Pubsub, Publish);
stanza.extend(Pubsub, Retrieve);
stanza.extend(Pubsub, Subscription);
stanza.extend(PubsubOwner, Configure);
stanza.extend(Publish, Item);
stanza.extend(Configure, Form);
stanza.extend(Pubsub, RSM);
stanza.extend(Event, EventItems);
stanza.extend(Message, Event);
stanza.extend(Iq, Pubsub);
stanza.extend(Iq, PubsubOwner);

exports.Pubsub = Pubsub;
exports.Item = Item;
exports.EventItem = EventItem;
});

require.define("/lib/plugins/avatar.js",function(require,module,exports,__dirname,__filename,process){var stanzas = require('../stanza/avatar');


module.exports = function (client) {
    client.disco.addFeature('urn:xmpp:avatar:metadata+notify');

    client.on('pubsubEvent', function (msg) {
        if (!msg.event._extensions.updated) return;
        if (msg.event.updated.node !== 'urn:xmpp:avatar:metadata') return;

        client.emit('avatar', {
            jid: msg.from,
            avatars: msg.updated.published[0].avatars
        });
    });

    client.publishAvatar = function (id, data, cb) {
        client.publish(null, 'urn:xmpp:avatar:data', {
            id: id,
            avatarData: data
        }, cb);
    };

    client.useAvatars = function (info, cb) {
        client.publish(null, 'urn:xmpp:avatar:metadata', {
            id: 'current',
            avatars: info
        }, cb);
    };
};
});

require.define("/lib/stanza/avatar.js",function(require,module,exports,__dirname,__filename,process){var _ = require('../../vendor/lodash');
var stanza = require('jxt');
var Item = require('./pubsub').Item;
var EventItem = require('./pubsub').EventItem;


function getAvatarData() {
    return stanza.getSubText(this.xml, 'urn:xmpp:avatar:data', 'data');
}

function setAvatarData(value) {
    stanza.setSubText(this.xml, 'urn:xmpp:avatar:data', 'data', value);
    stanza.setSubAttribute(this.xml, 'urn:xmpp:avatar:data', 'data', 'xmlns', 'urn:xmpp:avatar:data');
}

function getAvatars() {
    var metadata = stanza.find(this.xml, 'urn:xmpp:avatar:metadata', 'metadata'); 
    var results = [];
    if (metadata.length) {
        var avatars = stanza.find(metadata[0], 'urn:xmpp:avatar:metadata', 'info');
        _.forEach(avatars, function (info) {
            results.push(new Avatar({}, info));
        });
    }
    return results;
}

function setAvatars(value) {
    var metadata = stanza.findOrCreate(this.xml, 'urn:xmpp:avatar:metadata', 'metadata');
    stanza.setAttribute(metadata, 'xmlns', 'urn:xmpp:avatar:metadata');
    _.forEach(value, function (info) {
        var avatar = new Avatar(info);
        metadata.appendChild(avatar.xml);
    });
}


Item.prototype.__defineGetter__('avatarData', getAvatarData);
Item.prototype.__defineSetter__('avatarData', setAvatarData);
EventItem.prototype.__defineGetter__('avatarData', getAvatarData);
EventItem.prototype.__defineSetter__('avatarData', setAvatarData);

Item.prototype.__defineGetter__('avatars', getAvatars);
Item.prototype.__defineSetter__('avatars', setAvatars);
EventItem.prototype.__defineGetter__('avatars', getAvatars);
EventItem.prototype.__defineSetter__('avatars', setAvatars);



function Avatar(data, xml) {
    return stanza.init(this, xml, data);
}
Avatar.prototype = {
    constructor: {
        value: Avatar
    },
    _name: 'avatars',
    NS: 'urn:xmpp:avatar:metadata',
    EL: 'info',
    toString: stanza.toString,
    toJSON: stanza.toJSON,
    get id() {
        return stanza.getAttribute(this.xml, 'id');
    },
    set id(value) {
        stanza.setAttribute(this.xml, 'id', value);
    },
    get bytes() {
        return stanza.getAttribute(this.xml, 'bytes');
    },
    set bytes(value) {
        stanza.setAttribute(this.xml, 'bytes', value);
    },
    get height() {
        return stanza.getAttribute(this.xml, 'height');
    },
    set height(value) {
        stanza.setAttribute(this.xml, 'height', value);
    },
    get width() {
        return stanza.getAttribute(this.xml, 'width');
    },
    set width(value) {
        stanza.setAttribute(this.xml, 'width', value);
    },
    get type() {
        return stanza.getAttribute(this.xml, 'type', 'image/png');
    },
    set type(value) {
        stanza.setAttribute(this.xml, 'type', value);
    },
    get url() {
        return stanza.getAttribute(this.xml, 'url');
    },
    set url(value) {
        stanza.setAttribute(this.xml, 'url', value);
    }
};


module.exports = Avatar;
});

require.define("/index.js",function(require,module,exports,__dirname,__filename,process){exports.Message = require('./lib/stanza/message');
exports.Presence = require('./lib/stanza/presence');
exports.Iq = require('./lib/stanza/iq');

exports.Client = require('./lib/client');

exports.createClient = function (opts) {
    var client = new exports.Client(opts);

    client.use(require('./lib/plugins/disco'));
    client.use(require('./lib/plugins/chatstates'));
    client.use(require('./lib/plugins/delayed'));
    client.use(require('./lib/plugins/forwarding'));
    client.use(require('./lib/plugins/carbons'));
    client.use(require('./lib/plugins/time'));
    client.use(require('./lib/plugins/mam'));
    client.use(require('./lib/plugins/receipts'));
    client.use(require('./lib/plugins/idle'));
    client.use(require('./lib/plugins/correction'));
    client.use(require('./lib/plugins/attention'));
    client.use(require('./lib/plugins/version'));
    client.use(require('./lib/plugins/invisible'));
    client.use(require('./lib/plugins/muc'));
    client.use(require('./lib/plugins/webrtc'));
    client.use(require('./lib/plugins/pubsub'));
    client.use(require('./lib/plugins/avatar'));

    return client;
};
});
require("/index.js");
})();