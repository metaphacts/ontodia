import * as Backbone from 'backbone';
import * as joint from 'jointjs';

import { ClassModel, ElementModel, LocalizedString } from '../data/model';
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
UIElement.prototype.markup = '<g class="rotatable"><g class="nonscalable rootOfUI"/></g>';

/**
 * Properties:
 *     presentOnDiagram: boolean
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

    initialize() {
        joint.shapes.basic.Generic.prototype.initialize.apply(this, arguments);
        // element is collapsed and hidden by default
        this.set('z', 1);
        if (!this.has('isExpanded')) { this.set('isExpanded', false); }
        if (!this.has('presentOnDiagram')) {
            this.set('presentOnDiagram', false);
            this.unset('position');
        }
    }

    addToFilter() {
        this.trigger('add-to-filter', this);
    }

    focus() {
        this.trigger('focus-on-me', this);
    }
}

/**
 * Properties:
 *     typeId: string
 *     source: { id: string }
 *     target: { id: string }
 *     layoutOnly: boolean -- link exists only in layout (instead of underlying data)
 * 
 * Events:
 *     state:loaded
 */
export class FatClassModel extends Backbone.Model {
    model: ClassModel;
    constructor(classModel: ClassModel) {
        super({id: classModel.id});
        this.model = classModel;
        this.set('label', classModel.label);
        this.set('count', classModel.count);
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
 */
export class Link extends joint.dia.Link {
    arrowheadMarkup: string;
    get markup() {
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

    get layoutOnly(): boolean { return this.get('layoutOnly'); }
    set layoutOnly(value: boolean) { this.set('layoutOnly', value); }

    initialize(attributes?: {id: string}) {
        this.set('labels', [{position: 0.5}]);
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
    readonly index: number;
    diagram: DiagramModel;

    get label(): { values: LocalizedString[] } { return this.get('label'); }
    set label(value: { values: LocalizedString[] }) { this.set('label', value); }

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


    private onVisibilityChanged(self: FatLinkType, visible: boolean, options: PreventLinksLoading) {
        const links = this.diagram.linksByType[this.id];
        if (!links) { return; }

        if (visible) {
            for (const link of links) {
                if (this.diagram.sourceOf(link).get('presentOnDiagram') &&
                    this.diagram.targetOf(link).get('presentOnDiagram')
                ) {
                    this.diagram.graph.addCell(link);
                }
            }
            if (!options.preventLoading) {
                this.diagram.requestLinksOfType([this.id]);
            }
        } else {
            for (const link of links) {
                link.remove();
            }
        }
    }
}
