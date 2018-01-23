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
