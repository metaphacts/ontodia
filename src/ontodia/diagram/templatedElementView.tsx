import * as joint from 'jointjs';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { compile as compileTemplate, registerHelper } from 'handlebars';

import { hcl } from 'd3';

import { Element } from './elements';
import { Property } from '../data/model';

import DiagramView from './view';
import { getDefaultTemplate } from '../customization/templates/reactDefaultTemplate';

registerHelper('getProperty', function(props, id) {
    if (props && props[id] && props[id].length > 0) {
        return props[id].map(p => p.value.text).join(', ');
    } else {
        return undefined;
    }
});

export type PropArray = {
    id: string;
    name: string;
    properties: Property[];
}[];

export type TemplateOptions = {
    types: string;
    label: string;
    color: any;
    icon: string;
    iri: string;
    imgUrl?: string;
    isExpanded?: boolean;
    propsAsList?: PropArray;
    props?: { [id: string]: Property[] };
};

export type ElementViewTemplate = React.ClassicComponentClass<any> | string;
export type FilledElementViewTemplate = React.SFCElement<any> | string;

export class TemplatedUIElementView extends joint.dia.ElementView {
    public  model: Element;
    private foreignObject: SVGForeignObjectElement;
    private view: DiagramView;
    private isExpanded: boolean;
    private getTemplateFunction: Function;
    private customTemplate: ElementViewTemplate;

    remove() {
        if (this.foreignObject && this.customTemplate && typeof this.customTemplate !== 'string') {
            ReactDOM.unmountComponentAtNode(this.foreignObject);
        }
        return super.remove();
    }

    initialize() {
        joint.dia.ElementView.prototype.initialize.apply(this, arguments);
        this.listenTo(this.model, 'state:loaded', this.updateUI);
        this.listenTo(this.model, 'change:isExpanded', () => {
            const isExpanded = Boolean(this.model.get('isExpanded'));
            if (this.isExpanded !== isExpanded) {
                this.isExpanded = isExpanded;
                this.updateUI();
            }
        });
        this.isExpanded = this.model.get('isExpanded');
    }

    render(): TemplatedUIElementView {
        const result: any = super.render();
        this.createUI();
        this.update();
        if (!this.view && this['paper'] && this['paper']['diagramView']) {
            this.setView(this['paper']['diagramView']);
        }
        return result;
    }

    private setView(view: DiagramView) {
        this.view = view;
        this.listenTo(this.view, 'change:language', this.updateUI);
        this.updateUI();
    }

    private createUI() {
        if (this.foreignObject && this.customTemplate && typeof this.customTemplate !== 'string') {
            ReactDOM.unmountComponentAtNode(this.foreignObject);
        }
        const $root = this.$('.rootOfUI').empty();
        $root.attr('cursor', 'pointer');
        this.foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        this.foreignObject.ondblclick = () => {
            this.model.set('isExpanded', !this.isExpanded);
        };
        $root.append(this.foreignObject);

        let template = this.getTemplate();

        if (typeof template === 'string') {
            this.createUIFromStringTemplate(template);
        } else {
            this.createUIFromReactDom(template);
        }

        const body: any = this.foreignObject.firstChild;
        const images = body.getElementsByTagName('img');
        for (const image of images) {
            image.addEventListener('load', (event) => {
                this.resizeContainer();
            });
        }

        this.resizeContainer();
    }

    private createUIFromStringTemplate(templateString: string) {
        const domParser = new DOMParser();
        const doc = domParser.parseFromString(templateString, 'text/html');

        const body: any = doc.body.firstChild;
              body.style.cursor = 'pointer';
        this.foreignObject.appendChild(body);
    }

    private createUIFromReactDom(reactTemplate: React.SFCElement<any>) {
        ReactDOM.render(
            reactTemplate,
            this.foreignObject
        );
    }

    private resizeContainer() {
        const body: any = this.foreignObject.firstChild;
        let width = (body.clientWidth ? body.clientWidth : body.offsetWidth);
        let height = (body.clientHeight ? body.clientHeight : body.offsetHeight);
        this.foreignObject.setAttribute('style', `width: ${width}px; height: ${height}px`);
        this.foreignObject.setAttribute('width', width);
        this.foreignObject.setAttribute('height', height);
        this.model.resize(width, height);
    }

    private updateUI() {
        if (this.model.template && this.view) {
            this.createUI();
        }
        this.resizeContainer();
    }

    private getTemplateOptions(): TemplateOptions {
        const types = (this.view ? this.view.getElementTypeString(this.model.template) : 'Thing');
        const label = (this.view ? this.view.getLocalizedText(this.model.template.label.values).text : '');
        let propTable = [];
        if (this.model.template.properties) {
            propTable = Object.keys(this.model.template.properties)
                .map((key) => {
                    return {
                        id: key,
                        name: getNameFromId(key),
                        properties: this.model.template.properties[key],
                    };
                });
        }
        const style = this.getStyle();
        return {
            types: types,
            label: label,
            color: style.color,
            icon: style.icon,
            iri: this.model.template.id,
            imgUrl: this.model.template.image,
            isExpanded: this.isExpanded,
            propsAsList: propTable,
            props: this.model.template.properties,
        };
    }
    private getStyle(): {icon: string, color: any} {
        if (this.view) {
            const result = this.view.getElementStyle(this.model.template);
            const {h, c, l} = result.color;
            return {icon: (result.icon ? result.icon : 'ontodia-default-icon'), color: hcl(h, c, l)};
        } else {
            return {color: 'green', icon: 'ontodia-default-icon'};
        }
    }

    private getTemplate(): FilledElementViewTemplate {
        let template = undefined;

        if (this.view) {
            template = this.view.getElementTemplate(this.model.template);
            if (!template) {
                template = getDefaultTemplate();
            }
        } else {
            template = getDefaultTemplate();
        }

        if (this.customTemplate !== template) {
            this.customTemplate = template;
            if (typeof this.customTemplate === 'string') {
                this.getTemplateFunction = compileTemplate(this.customTemplate);
            } else {
                const ReactTemplate = this.customTemplate;
                this.getTemplateFunction = options => <ReactTemplate element={options}/>;
            }
        }
        return this.getTemplateFunction(this.getTemplateOptions());
    }
}

function getNameFromId(id: string): string {
    const tokens = id.split('/');
    return tokens[tokens.length - 1];
}
