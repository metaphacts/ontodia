import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { hcl } from 'd3';
import { compile as compileTemplate, registerHelper } from 'handlebars';

import { TemplateProps } from '../customization/props';

import { Element } from './elements';
import { uri2name } from './model';
import { DiagramView } from './view';

registerHelper('getProperty', function(props, id) {
    if (props && props[id] && props[id].length > 0) {
        return props[id].map(p => p.value.text).join(', ');
    } else {
        return undefined;
    }
});

export class TemplatedUIElementView extends joint.dia.ElementView {
    model: Element;
    private view: DiagramView;
    private foreignObject: SVGForeignObjectElement;
    private isReactMounted = false;

    initialize() {
        joint.dia.ElementView.prototype.initialize.apply(this, arguments);
        this.listenTo(this.model, 'state:loaded', this.updateUI);
        this.listenTo(this.model, 'change:isExpanded', () => {
            this.updateUI();
        });
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

    remove() {
        if (this.foreignObject && this.isReactMounted) {
            ReactDOM.unmountComponentAtNode(this.foreignObject);
        }
        return super.remove() as this;
    }

    private setView(view: DiagramView) {
        this.view = view;
        this.listenTo(this.view, 'change:language', this.updateUI);
        this.updateUI();
    }

    private createUI() {
        if (this.foreignObject) {
            throw new Error('Attempted to call createUI() after UI already created.');
        }

        const $root = this.$('.rootOfUI');
        $root.attr('cursor', 'pointer');
        this.foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        this.foreignObject.ondblclick = () => {
            this.model.set('isExpanded', !this.model.get('isExpanded'));
        };
        $root.append(this.foreignObject);
    }

    private updateUI() {
        if (this.model.template && this.view) {
            const template = this.getTemplate();

            if (typeof template === 'string') {
                this.createUIFromStringTemplate(template);
            } else {
                this.createUIFromReactDom(template);
            }

            const body = this.foreignObject.firstChild as HTMLElement;
            const onImageLoad = () => {
                body.removeEventListener('load', onImageLoad);
                this.resizeContainer();
            };
            body.addEventListener('load', onImageLoad, true);
        }
    }

    private resizeContainer() {
        const body = this.foreignObject.firstChild as HTMLElement;
        const width = body.clientWidth ? body.clientWidth : body.offsetWidth;
        const height = body.clientHeight ? body.clientHeight : body.offsetHeight;
        this.foreignObject.setAttribute('style', `width: ${width}px; height: ${height}px`);
        this.foreignObject.setAttribute('width', width.toString());
        this.foreignObject.setAttribute('height', height.toString());
        this.model.resize(width, height);
    }

    private createUIFromStringTemplate(templateString: string) {
        while (this.foreignObject.firstChild) {
            this.foreignObject.removeChild(this.foreignObject.firstChild);
        }

        const domParser = new DOMParser();
        const doc = domParser.parseFromString(templateString, 'text/html');

        const body = doc.body.firstChild as HTMLElement;
        body.style.cursor = 'pointer';
        this.foreignObject.appendChild(body);
        this.resizeContainer();
    }

    private createUIFromReactDom(reactTemplate: React.ReactElement<any>) {
        this.isReactMounted = true;
        ReactDOM.render(reactTemplate, this.foreignObject);
    }

    private getTemplateOptions(): TemplateProps {
        const types = (this.view ? this.view.getElementTypeString(this.model.template) : 'Thing');
        const label = (this.view ? this.view.getLocalizedText(this.model.template.label.values).text : '');
        let propTable = [];
        if (this.model.template.properties) {
            propTable = Object.keys(this.model.template.properties).map(key => ({
                id: key,
                name: uri2name(key),
                properties: this.model.template.properties[key],
            }));
        }
        const style = this.getStyle();
        return {
            types: types,
            label: label,
            color: style.color,
            icon: style.icon,
            iri: this.model.template.id,
            imgUrl: this.model.template.image,
            isExpanded: this.model.get('isExpanded'),
            propsAsList: propTable,
            props: this.model.template.properties,
        };
    }

    private getStyle() {
        if (this.view) {
            const {color: {h, c, l}, icon} = this.view.getTypeStyle(this.model.template.types);
            return {
                icon: icon ? icon : 'ontodia-default-icon',
                color: hcl(h, c, l).toString(),
            };
        } else {
            return {icon: 'ontodia-default-icon', color: 'green'};
        }
    }

    private getTemplate(): React.ReactElement<any> | string {
        const template = this.view.getElementTemplate(this.model.template.types);

        let templateFunction: (props: TemplateProps) => React.ReactElement<any> | string;
        if (typeof template === 'string') {
            templateFunction = compileTemplate(template);
        } else {
            templateFunction = options => {
                const reactProps: TemplateProps & React.ClassAttributes<any> = options;
                reactProps.ref = element => {
                    if (element) {
                        this.resizeContainer();
                    }
                };
                return React.createElement(template, reactProps);
            };
        }
        return templateFunction(this.getTemplateOptions());
    }
}
