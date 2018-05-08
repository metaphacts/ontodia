/** Generates random 32-digit hexadecimal string. */
export function generate128BitID() {
    function randomQuaterDigits() {
        return Math.floor((1 + Math.random()) * 0x100000000)
            .toString(16).substring(1);
    }
    // generate by half because of restricted numerical precision
    return randomQuaterDigits() + randomQuaterDigits() + randomQuaterDigits() + randomQuaterDigits();
}

/**
 * Calculate a 32 bit FNV-1a hash
 * Found here: https://gist.github.com/vaiorabbit/5657561
 * Ref.: http://isthe.com/chongo/tech/comp/fnv/
 *
 * @param {string} str the input value
 * @param {integer} [seed] optionally pass the hash of the previous chunk
 * @returns {integer}
 */
export function hashFnv32a(str: string, seed = 0x811c9dc5): number {
    /* tslint:disable:no-bitwise */
    let i: number, l: number, hval = seed & 0x7fffffff;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return hval >>> 0;
    /* tslint:enable:no-bitwise */
}
