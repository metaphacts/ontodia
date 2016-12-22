import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { hcl } from 'd3-color';
import { compile as compileTemplate, registerHelper } from 'handlebars';

import { Dictionary, Property } from '../data/model';
import { TemplateProps } from '../customization/props';

import { Element, LazyLabel } from './elements';
import { uri2name } from './model';
import { DiagramView } from './view';

registerHelper('getProperty', function(props: Dictionary<Property>, id: string) {
    if (props && props[id]) {
        return props[id].values.map(v => v.text).join(', ');
    } else {
        return undefined;
    }
});

export class TemplatedUIElementView extends joint.dia.ElementView {
    model: Element;

    paper?: { diagramView?: DiagramView };

    private view: DiagramView;
    private foreignObject: SVGForeignObjectElement;
    private isReactMounted = false;
    private subscribedOnce = false;

    initialize() {
        joint.dia.ElementView.prototype.initialize.apply(this, arguments);
        this.listenTo(this.model, 'state:loaded', () => {
            this.subscribeOnTypesChanging();
            this.updateUI();
        });
        this.listenTo(this.model, 'change:isExpanded', () => {
            this.updateUI();
        });
        this.listenTo(this.model, 'focus-on-me', () => {
            (this.foreignObject.firstChild as HTMLElement).focus();
        });
    }

    render(): TemplatedUIElementView {
        const result: any = super.render();
        this.createUI();
        this.update();
        if (!this.view && this.paper && this.paper.diagramView) {
            this.setView(this.paper.diagramView);
        }
        return result;
    }

    remove(): this {
        this.unregisterBodyListeners();
        if (this.foreignObject && this.isReactMounted) {
            ReactDOM.unmountComponentAtNode(this.foreignObject);
        }
        return super.remove() as this;
    }

    private subscribeOnTypesChanging() {
        if (this.model.template && this.model.template.types) {
            this.model.template.types.forEach(type => {
                this.listenTo(this.view.model.getClassesById(type), 'change:label', this.updateUI);
            });
        }
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
        // set default width to correctly calculate width of node
        this.foreignObject.setAttribute('width', '350px');
        this.foreignObject.ondblclick = () => {
            this.model.set('isExpanded', !this.model.get('isExpanded'));
        };
        $root.append(this.foreignObject);
    }

    private onImageLoad: () => void;
    private onClick: (e: MouseEvent) => void;
    private registerBodyListeners() {
        const body = this.foreignObject.firstChild as HTMLElement;
        this.onImageLoad = () => {
            this.resizeContainer();
        };
        body.addEventListener('load', this.onImageLoad, true);

        this.onClick = (e: MouseEvent) => {
            if (e.target instanceof HTMLElement && (e.target as HTMLElement).localName === 'a') {
                this.model.trigger('action:iriClick', this.model.template.id);
                e.preventDefault();
            }
        };
        body.addEventListener('click', this.onClick, true);
    }

    private unregisterBodyListeners() {
        const body = this.foreignObject.firstChild as HTMLElement;
        body.removeEventListener('load', this.onImageLoad);
        body.removeEventListener('click', this.onClick);
    }

    private subscribeOnLazyLabels(lazyLabels: LazyLabel[]) {
        if (!this.subscribedOnce && this.model.get('isExpanded')) {
            this.subscribedOnce = true;
            for (const ll of lazyLabels) {
                ll.on('change:label', () => {
                    ll.off('change:label');
                    this.updateUI();
                });
            }
        }
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
            body.setAttribute('tabindex', '0');
            this.registerBodyListeners();
        }
    }

    private resizeContainer() {
        const body = this.foreignObject.firstChild as HTMLElement;
        let width = body.offsetWidth ? body.offsetWidth : body.clientWidth;
        let height = body.offsetHeight ? body.offsetHeight : body.clientHeight;

        // HACK: fix sometimes missing bottom/right borders
        width += 1;
        height += 1;

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
        const types = (this.view && this.model.template.types.length > 0 ?
                        this.view.getElementTypeString(this.model.template) :
                        'Thing');
        const label = (this.view ? this.view.getLocalizedText(this.model.template.label.values).text : '');
        let propTable: Array<{ id: string; name: string; property: Property; }> = [];

        if (this.model.template.properties) {
            const lazyLabels: LazyLabel[] = [];
            propTable = Object.keys(this.model.template.properties).map(key => {

                let lazyLabel: LazyLabel;
                if (this.view) {
                    lazyLabel = this.view.model.getPropertyLabelById(key);
                    lazyLabels.push(lazyLabel);
                }

                const name = this.view ? this.view.getLocalizedText(lazyLabel.get('label').values).text : uri2name(key);

                return {
                    id: key,
                    name: name,
                    property: this.model.template.properties[key],
                };
            });
            this.subscribeOnLazyLabels(lazyLabels);
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
