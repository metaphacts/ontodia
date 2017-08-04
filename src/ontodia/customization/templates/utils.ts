import { Dictionary, Property } from '../../data/model';

export function getProperty(props: Dictionary<Property>, id: string) {
    if (props && props[id]) {
        return props[id].values.map(v => v.text).join(', ');
    } else {
        return undefined;
    }
}
