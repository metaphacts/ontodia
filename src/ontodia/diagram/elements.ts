import * as Backbone from 'backbone';
import * as joint from 'jointjs';

import { LocalizedString, ElementModel, LinkType } from '../data/model';
import DiagramModel from './model';

export class UIElement extends joint.shapes.basic.Generic {
    markup: string;
    defaults() {
        return joint.util.deepSupplement({
            type: 'Ontodia.Element',
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
export class Link extends joint.dia.Link {
    markup: string;
    get layoutOnly() { return this.get('layoutOnly'); }
    initialize(attributes?: {id: string}) {
        this.set('labels', [{position: 0.5}]);
    }
}

/**
 * Properties:
 *     visible: boolean
 *     showLabel: boolean
 *     isNew?: boolean
 */
export class FatLinkType extends Backbone.Model {
    // label: { values: LocalizedString[] };
    diagram: DiagramModel;

    constructor(params: {
        linkType: LinkType;
        diagram: DiagramModel;
    }) {
        super({id: params.linkType.id});
        // this.label = params.linkType.label;
        this.set('label', params.linkType.label);
        this.diagram = params.diagram;
        this.listenTo(this, 'change:visible', this.onVisibilityChanged);
    }


    private onVisibilityChanged(self: FatLinkType, visible: boolean, options: any) {
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
