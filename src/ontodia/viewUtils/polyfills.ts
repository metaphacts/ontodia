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
