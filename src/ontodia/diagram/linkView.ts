import * as joint from 'jointjs';
import { merge } from 'lodash';

import { isIE11 } from '../viewUtils/detectBrowser';

import { Link, FatLinkType } from './elements';
import { DiagramView } from './view';
import { LinkStyle } from '../customization/props';

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

    private onRoutingUpdate(_bendingPoint: { x: number, y: number }, properties: { silent?: boolean } = {}) {
        if (!this.bendingPoint ||
            this.bendingPoint.x !== _bendingPoint.x ||
            this.bendingPoint.y !== _bendingPoint.y
        ) {
            this.bendingPoint = _bendingPoint;
            if (!properties.silent) {
                this.update();
            }
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
        const style = this.view.getLinkStyle(this.model.get('template'));
        merge(style, {connection: {'stroke-dasharray': this.model.layoutOnly ? '5,5' : null}});

        let linkAttributes: joint.dia.LinkAttributes = {
            labels: this.createLabelsAttributes(style),
            connector: style.connector,
            router: style.router,
            z: 0,
        };
        if (style.connection) {
            merge(linkAttributes, {attrs: {'.connection': style.connection}});
        }

        this.model.set(linkAttributes, options);
    }

    private createLabelsAttributes = (style: LinkStyle): joint.dia.LinkLabelAttributes[] => {
        const linkTypeId: string = this.model.get('typeId');
        const typeModel = this.view.model.getLinkType(linkTypeId);
        const showLabels = typeModel && typeModel.get('showLabel');
        const labelAttributes: joint.dia.LinkLabelAttributes[] = [];

        if (showLabels) {
            if (style.label) {
                const label = {};
                const value = style.label.attrs && style.label.attrs.text ? style.label.attrs.text.text : undefined;
                const text = value ? this.view.getLocalizedText(value).text : this.view.getLinkLabel(linkTypeId).text;
                merge(label, style.label, {position: style.label.position || 0.5, attrs: {text: {text}}});
                labelAttributes.push(label);
            } else {
                const text = this.view.getLinkLabel(linkTypeId).text;
                const label = {position: 0.5, attrs: {text: {text}}};
                labelAttributes.push(label);
            }

            if (style.properties) {
                style.properties.forEach(prop => {
                    const property = {};
                    const value = prop.attrs && prop.attrs.text ? prop.attrs.text.text : undefined;
                    const text = value ? this.view.getLocalizedText(value).text : '';
                    merge(property, prop, {position: prop.position || 0.5, attrs: {text: {text}}});
                    labelAttributes.push(property);
                });
            }
        }

        return labelAttributes;
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
