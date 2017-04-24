import * as Backbone from 'backbone';
import * as joint from 'jointjs';

import { ClassModel, ElementModel, LinkModel, LocalizedString } from '../data/model';
import { DiagramModel, PreventLinksLoading } from './model';

export class UIElement extends joint.shapes.basic.Generic {
    markup: string;
    defaults() {
        return joint.util.deepSupplement({
            type: 'element',
            size: { width: 250, height: 50 },
        }, joint.shapes.basic.Generic.prototype.defaults);
    }
}
UIElement.prototype.markup = '<g class="rotatable"><rect class="rootOfUI"/></g>';

/**
 * Properties:
 *     isExpanded: boolean
 *     position: { x: number, y: number }
 *     size: { width: number, height: number }
 *     angle: number - degrees
 *
 * Events:
 *     state:loaded
 *     add-to-filter
 *     focus-on-me
 *     action:iriClick
 */
export class Element extends UIElement {
    template: ElementModel;
    /** All in and out links of the element */
    links: Link[] = [];

    get isExpanded(): boolean { return this.get('isExpanded'); }
    set isExpanded(value: boolean) { this.set('isExpanded', value); }

    initialize() {
        joint.shapes.basic.Generic.prototype.initialize.apply(this, arguments);
        this.set('z', 1);
        // element is collapsed by default
        if (!this.has('isExpanded')) { this.set('isExpanded', false); }
    }

    addToFilter(linkType?: FatLinkType, direction?: 'in' | 'out') {
        this.trigger('add-to-filter', this, linkType, direction);
    }

    focus() {
        this.trigger('focus-on-me', this);
    }

    iriClick(iri: string) {
        this.trigger('action:iriClick', iri);
    }
}

/**
 * Properties:
 *     id: string
 *     label: { values: LocalizedString[] }
 *     count: number
 */
export class FatClassModel extends Backbone.Model {
    model: ClassModel;

    get label(): { values: LocalizedString[] } { return this.get('label'); }

    constructor(classModel: ClassModel) {
        super({id: classModel.id});
        this.model = classModel;
        this.set('label', classModel.label);
        this.set('count', classModel.count);
    }
}

/**
 * Properties:
 *     id: string
 *     label: { values: LocalizedString[] }
 */
export class RichProperty extends Backbone.Model {
    get label(): { values: LocalizedString[] } { return this.get('label'); }

    constructor(model: {
        id: string;
        label: { values: LocalizedString[] };
    }) {
        super({id: model.id});
        this.set('label', model.label);
    }
}

/**
 * Properties:
 *     typeId: string
 *     typeIndex: number
 *     source: { id: string }
 *     target: { id: string }
 *     layoutOnly: boolean -- link exists only in layout (instead of underlying data)
 * 
 * Events:
 *     state:loaded
 *     updateRouting
 */
export class Link extends joint.dia.Link {
    arrowheadMarkup: string;
    get markup() {
        if (typeof this.typeIndex !== 'number') {
            throw new Error('Missing typeIndex when intializing link\'s markup');
        }
        return `<path class="connection" stroke="black" d="M 0 0 0 0"`
            + ` marker-start="url(#${linkMarkerKey(this.typeIndex, true)})"`
            + ` marker-end="url(#${linkMarkerKey(this.typeIndex, false)})" />`
            + `<path class="connection-wrap" d="M 0 0 0 0"/>`
            + `<g class="labels"/>`
            + `<g class="marker-vertices"/>`
            + `<g class="link-tools"/>`;
    }

    get typeIndex(): number { return this.get('typeIndex'); }
    set typeIndex(value: number) { this.set('typeIndex', value); }

    get typeId(): string { return this.get('typeId'); }

    get sourceId(): string { return this.get('source').id; }
    get targetId(): string { return this.get('target').id; }

    get layoutOnly(): boolean { return this.get('layoutOnly'); }
    set layoutOnly(value: boolean) { this.set('layoutOnly', value); }

    initialize(attributes?: {id: string}) {
        this.set('labels', [{position: 0.5}]);
    }

    updateRouting(bendingPoint: { x: number, y: number }, props?: { silent: boolean }): void {
        this.trigger('updateRouting', bendingPoint, props);
    }
}
Link.prototype.arrowheadMarkup = null;

export function linkMarkerKey(linkTypeIndex: number, startMarker: boolean) {
    return `ontodia-${startMarker ? 'mstart' : 'mend'}-${linkTypeIndex}`;
}

/**
 * Properties:
 *     visible: boolean
 *     showLabel: boolean
 *     isNew?: boolean
 *     label?: { values: LocalizedString[] }
 */
export class FatLinkType extends Backbone.Model {
    private diagram: DiagramModel;

    readonly index: number;

    get label(): { values: LocalizedString[] } { return this.get('label'); }
    set label(value: { values: LocalizedString[] }) { this.set('label', value); }

    get visible(): boolean { return this.get('visible'); }
    setVisibility(
        params: { visible: boolean; showLabel: boolean; },
        options?: PreventLinksLoading,
    ) {
        this.set(params, options);
    }

    constructor(params: {
        id: string;
        index: number;
        label: { values: LocalizedString[] };
        diagram: DiagramModel;
    }) {
        super({
            id: params.id,
            label: params.label,
            visible: true,
            showLabel: true,
        });
        this.index = params.index;
        this.diagram = params.diagram;
        this.listenTo(this, 'change:visible', this.onVisibilityChanged);
    }

    private onVisibilityChanged(self: this, visible: boolean, options: PreventLinksLoading) {
        if (visible) {
            if (!options.preventLoading) {
                this.diagram.requestLinksOfType([this.id]);
            }
        } else {
            const links = [...this.diagram.linksOfType(this.id)];
            for (const link of links) {
                link.remove();
            }
        }
    }
}
