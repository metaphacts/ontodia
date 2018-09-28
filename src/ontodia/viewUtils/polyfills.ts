export function isIE11() {
    return !((window as any).ActiveXObject) && 'ActiveXObject' in window;
}

if (typeof Math.sign === 'undefined') {
    Math.sign = function (n: number): number {
        if (n > 0) { return 1; } else if (n < 0) { return -1; } else { return 0; }
    };
}

if (typeof Number.isNaN === 'undefined') {
    Number.isNaN = function (value) {
        return typeof value === 'number' && isNaN(value);
    };
}

if (typeof Number.isFinite === 'undefined') {
    Number.isFinite = function (n: number): boolean {
        return n !== Infinity && n !== -Infinity && !Number.isNaN(n);
    };
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (search: string, pos?: number) {
        return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
// tslint:disable
if (!Array.prototype.find) {
    const arrayFind = function (this: Array<any>, predicate: any) {
        // 1. Let O be ? ToObject(this value).
        if (this == null) {
            throw new TypeError('"this" is null or not defined');
        }

        var o = Object(this);

        // 2. Let len be ? ToLength(? Get(O, "length")).
        var len = o.length >>> 0;

        // 3. If IsCallable(predicate) is false, throw a TypeError exception.
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }

        // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
        var thisArg = arguments[1];

        // 5. Let k be 0.
        var k = 0;

        // 6. Repeat, while k < len
        while (k < len) {
            // a. Let Pk be ! ToString(k).
            // b. Let kValue be ? Get(O, Pk).
            // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
            // d. If testResult is true, return kValue.
            var kValue = o[k];
            if (predicate.call(thisArg, kValue, k, o)) {
                return kValue;
            }
            // e. Increase k by 1.
            k++;
        }

        // 7. Return undefined.
        return undefined;
    };
    Object.defineProperty(Array.prototype, 'find', {value: arrayFind});
}
// tslint:enable

// from:https://github.com/jserz/js_piece/blob/master/DOM/ChildNode/remove()/remove().md
(function (arr) {
    arr.forEach(function (item) {
        if (item.hasOwnProperty('remove')) {
            return;
        }
        Object.defineProperty(item, 'remove', {
            configurable: true,
            enumerable: true,
            writable: true,
            value: function remove(this: any) {
                if (this.parentNode !== null) {
                    this.parentNode.removeChild(this);
                }
            }
        });
    });
})([Element.prototype, CharacterData.prototype, DocumentType.prototype]);
