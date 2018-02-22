/** Generates random 16-digit hexadecimal string. */
export function generate64BitID() {
    function randomHalfDigits() {
        return Math.floor((1 + Math.random()) * 0x100000000)
            .toString(16).substring(1);
    }
    // generate by half because of restricted numerical precision
    return randomHalfDigits() + randomHalfDigits();
}
