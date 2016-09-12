* Pay attention to TSLint warnings.

* Module files and directories should be named in camelCase; if module has single important entity like
class or function then this file should be named after it:

    // DO
    (src/foo/bar/bazBazBaz.ts)
    export class BazBazBaz { ... }    
    export function barBaz(baz: BazBazBaz) { ... }
    export default BazBazBaz;

    // DON'T
    (src/foo/bar/BazBazBaz.ts)
    (src/foo/bar/baz-baz-baz.ts)

* Inline interface declarations and module imports block should have spaces inside braces,
object literals should not:

    // DO
    import { barBaz, BazBazBaz } from '../bar/bazBazBaz';
    const point: { x: number; y: number; } = {x: 42, y: 10};
    export { point };
    
    // DON'T
    import {barBaz, BazBazBaz} from '../bar/bazBazBaz';
    const point: {x: number; y: number;} = { x: 42, y: 10; };
    export {point};

* Don't use parenthesis around lambda function with single type inferenced argument:

    // DO
    items.map(item => ...)
    
    // DON'T
    items.map((item) => ...)

* Use const keyword to declare variables by default instead of let if you are not intended to modify it.

* Declare imports from libraries first, then imports from project other than current module directory,
then modules from current directory:

    // DO
    import * as $ from 'jquery';
    import { keyBy } from 'lodash';
    
    import { BazBazBaz } from '../bar/bazBazBaz';

    import { Foo } from './foo';
    import { frob } from './frob';
    
    // DON'T
    import { Foo } from './foo';
    import * as $ from 'jquery';
    import { BazBazBaz } from '../bar/bazBazBaz';
    import { keyBy } from 'lodash';
    import { Foo } from './frob';
