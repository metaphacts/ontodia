import * as joint from 'jointjs';
import { merge } from 'lodash';

import { isIE11 } from '../viewUtils/detectBrowser';

import { Link, FatLinkType } from './elements';
import { DiagramView } from './view';

export class LinkView extends joint.dia.LinkView {
    model: Link;

    paper?: { diagramView?: DiagramView };

    private view: DiagramView;
    private bendingPoint: { x: number, y: number };

    initialize() {
        joint.dia.LinkView.prototype.initialize.apply(this, arguments);
        this.listenTo(this.model, 'change:layoutOnly', this.updateLabel);
        this.listenTo(this.model, 'updateRouting', this.onRoutingUpdate);
    }
    render(): LinkView {
        if (!this.view && this.paper && this.paper.diagramView) {
            this.setView(this.paper.diagramView);
        }
        const result: any = super.render();
        return result;
    }
    getTypeModel(): FatLinkType {
        return this.view.model.getLinkType(this.model.get('typeId'));
    }

    private onRoutingUpdate (bp: { x: number, y: number }) {
        if (!this.bendingPoint ||
            this.bendingPoint.x !== bp.x ||
            this.bendingPoint.y !== bp.y
        ) {
            this.bendingPoint = bp;
            this.update();
        }
    }

    private setView(view: DiagramView) {
        this.view = view;
        this.listenTo(this.view, 'change:language', this.updateLabel);

        const typeModel = this.getTypeModel();
        this.listenTo(typeModel, 'change:showLabel', this.updateLabel);
        this.listenTo(typeModel, 'change:label', this.updateLabel);

        this.updateLabelWithOptions({silent: true});
    }

    private updateLabel() {
        this.updateLabelWithOptions();
    }

    private updateLabelWithOptions(options?: { silent?: boolean }) {
        const linkTypeId: string = this.model.get('typeId');
        const typeModel = this.view.model.getLinkType(linkTypeId);

        const style = this.view.getLinkStyle(this.model.get('typeId'));
        merge(style, {connection: {'stroke-dasharray': this.model.layoutOnly ? '5,5' : null}});

        let linkAttributes: joint.dia.LinkAttributes = {
            labels: style.labels,
            connector: style.connector,
            router: style.router,
            z: 0,
        };
        if (style.connection) {
            merge(linkAttributes, {attrs: {'.connection': style.connection}});
        }

        const showLabels = typeModel && typeModel.get('showLabel');
        const labelAttributes = showLabels ? [{
            position: 0.5,
            attrs: {text: {
                text: this.view.getLinkLabel(linkTypeId).text,
            }},
        }] : [];

        merge(linkAttributes, {labels: labelAttributes});
        this.model.set(linkAttributes, options);
    }
}

if (isIE11()) {
    // workaround for "Dynamically updated SVG path with a marker-end does not update" issue
    // https://connect.microsoft.com/IE/feedback/details/801938/
    (LinkView.prototype as any).update = function (this: LinkView) {
        (joint.dia.LinkView.prototype as any).update.apply(this, arguments);
        const path = (this.el as HTMLElement).querySelector('.connection') as SVGPathElement;
        if (path) {
            const pathParent = path.parentNode;
            if (pathParent) {
                pathParent.removeChild(path);
                pathParent.insertBefore(path, pathParent.firstChild);
            }
        }
    };
}
