import { Dictionary } from '../../data/model';
import { Element, Link } from '../../diagram/elements';
import { DiagramModel } from '../../diagram/model';
import { DiagramView } from '../../diagram/view';
import { boundsOf, Vector } from '../../diagram/geometry';
import {
    LayoutNode,
    LayoutLink,
    removeOverlaps,
    padded,
    translateToPositiveQuadrant,
    translateToCenter,
    forceLayout,
    flowLayout,
} from '../../viewUtils/layout';

export type Parameter = StringParameter | NumericParameter | BooleanParameter;

export interface BooleanParameter {
    type: 'boolean';
    value: boolean;
    label: string;
}

export interface StringParameter {
    type: 'string';
    value?: string;
    label: string;
}

export interface NumericParameter {
    type: 'number';
    value: number;
    min: number;
    max: number;
    label: string;
}

export interface LayouAlgorithm {
    id: string;
    style: {
        label?: string;
        icon: string;
    };
    isSupportAnimation: boolean;
    apply: (
        nodes: LayoutNode[],
        links: LayoutLink[],
        interactive: boolean,
    ) => void;
    parameters: Dictionary<Parameter>;
    setParameter: (paramId: string, value: any) => void;
}

const DEFAULT_LINK_LENGTH = 200;
const ITERATION_COUNT = 30; const QUICK_ITERATION_COUNT = 1;

export class ForceLayout implements LayouAlgorithm {
    id = 'forceLayout';
    isSupportAnimation = true;
    _paramteres: Dictionary<Parameter> = {
        'linkLength': {
            type: 'number',
            label: 'Link length',
            value: 200,
            min: 1,
            max: 400,
        },
    };

    apply(nodes: LayoutNode[], links: LayoutLink[], interactive: boolean) {
        const parameters = convertParametersToValuesMap(this._paramteres);
        const linkLength = parameters.linkLength || DEFAULT_LINK_LENGTH;
        const iterations = interactive ? QUICK_ITERATION_COUNT : ITERATION_COUNT;

        const additionalLinks = [];
        const previousPositions: Dictionary<Vector> = {};
        if (interactive) {
            for (const node of nodes) {
                previousPositions[node.id] =  {x: node.x, y: node.y};
            }

            const orphanNodes = findOrphanNodes(nodes, links);
            let abstractRoot: LayoutNode;
            for (const n of orphanNodes) {
                if (!abstractRoot) {
                    abstractRoot = n;
                } else {
                    additionalLinks.push({
                        source: abstractRoot,
                        target: n,
                    });
                }
            }
        }

        forceLayout({
            iterations,
            nodes, links: links.concat(additionalLinks),
            preferredLinkLength: linkLength,
        });

        if (!interactive) {
            padded(nodes, {x: 10, y: 10}, () => removeOverlaps(nodes));
        }

        if (interactive) {
            const MAX_OFFSET = 100;
            for (const node of nodes) {
                const prevPosition = previousPositions[node.id];

                let dx = (node.x - prevPosition.x) / 2;
                if (Math.abs(dx) > MAX_OFFSET) {
                    dx = dx > 0 ? MAX_OFFSET : -MAX_OFFSET;
                    node.x = prevPosition.x + dx;
                }
                let dy = (node.y - prevPosition.y) / 2;
                if (Math.abs(dy) > MAX_OFFSET) {
                    dy = dy > 0 ? MAX_OFFSET : -MAX_OFFSET;
                    node.y = prevPosition.y + dy;
                }
            }
        }
    };

    get parameters(): Dictionary<Parameter> {
        return this._paramteres;
    }

    setParameter(paramId: string, value: any) {
        this._paramteres[paramId].value = value;
    }

    get style() {
        return {
            label: 'Force layout',
            icon: 'fa fa-snowflake-o',
        };
    };
};

export class FlowLayout implements LayouAlgorithm {
    id = 'flowLayout';
    isSupportAnimation = true;
    _paramteres: Dictionary<Parameter> = {
        'linkLength': {
            type: 'number',
            label: 'Link length',
            value: 200,
            min: 1,
            max: 400,
        },
    };

    apply(nodes: LayoutNode[], links: LayoutLink[], interactive: boolean) {
        const parameters = convertParametersToValuesMap(this._paramteres);
        const linkLength = parameters.linkLength || DEFAULT_LINK_LENGTH;
        const iterations = interactive ? QUICK_ITERATION_COUNT : ITERATION_COUNT;

        const additionalLinks = [];
        const previousPositions: Dictionary<Vector> = {};
        if (interactive) {
            for (const node of nodes) {
                previousPositions[node.id] =  {x: node.x, y: node.y};
            }

            const orphanNodes = findOrphanNodes(nodes, links);
            let abstractRoot: LayoutNode;
            for (const n of orphanNodes) {
                if (!abstractRoot) {
                    abstractRoot = n;
                } else {
                    additionalLinks.push({
                        source: abstractRoot,
                        target: n,
                    });
                }
            }
        }

        flowLayout({
            iterations,
            nodes, links: links.concat(additionalLinks),
            preferredLinkLength: linkLength,
        });

        if (!interactive) {
            padded(nodes, {x: 10, y: 10}, () => removeOverlaps(nodes));
        }

        if (interactive) {
            const MAX_OFFSET = 100;
            for (const node of nodes) {
                const prevPosition = previousPositions[node.id];

                let dx = (node.x - prevPosition.x) / 2;
                if (Math.abs(dx) > MAX_OFFSET) {
                    dx = dx > 0 ? MAX_OFFSET : -MAX_OFFSET;
                    node.x = prevPosition.x + dx;
                }
                let dy = (node.y - prevPosition.y) / 2;
                if (Math.abs(dy) > MAX_OFFSET) {
                    dy = dy > 0 ? MAX_OFFSET : -MAX_OFFSET;
                    node.y = prevPosition.y + dy;
                }
            }
        }
    };

    get parameters(): Dictionary<Parameter> {
        return this._paramteres;
    }

    setParameter(paramId: string, value: any) {
        this._paramteres[paramId].value = value;
    }

    get style() {
        return {
            label: 'Flow layout',
            icon: 'fa fa-sitemap',
        };
    };
};

export const DEFAULT_ALGORITHMS: LayouAlgorithm[] = [
    new ForceLayout(), new FlowLayout(),
];

export function convertParametersToValuesMap(parameters: Dictionary<Parameter>): Dictionary<any> {
    const params: Dictionary<any> = {};
    if (parameters) {
        Object.keys(parameters).forEach(key => {
            params[key] = parameters[key].value;
        });
    }
    return params;
}

export function findOrphanNodes(nodes: LayoutNode[], links: LayoutLink[]) {
    const isRelatedMap: Dictionary<boolean> = {};
    for (const link of links) {
        isRelatedMap[link.source.id] = true;
        isRelatedMap[link.target.id] = true;
    }
    return nodes.filter(node => {
        return !isRelatedMap[node.id];
    });
}
