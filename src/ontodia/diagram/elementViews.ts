import * as joint from 'jointjs';
import * as d3 from 'd3';
import { merge, cloneDeep } from 'lodash';

import * as svgui from '../../svgui/svgui';
import { ElementModel } from '../data/model';
import { Element, Link, FatLinkType } from './elements';
import { uri2name } from './model';
import DiagramView from './view';

export class UIElementView extends joint.dia.ElementView {
    model: Element;
    private view: DiagramView;
    private name: svgui.Label;
    private label: svgui.Label;
    private iri: svgui.Label;
    private image: svgui.Image;
    private expander: svgui.Expander;
    private box: svgui.NamedBox;
    private table: svgui.PropertyTable;
    private properties: Array<{ left: string; right: string; }>;

    initialize() {
        joint.dia.ElementView.prototype.initialize.apply(this, arguments);
        this.listenTo(this.model, 'state:loaded', this.updateUI);
        this.listenTo(this.model, 'change:isExpanded', () => {
            const isExpanded = Boolean(this.model.get('isExpanded'));
            if (Boolean(this.expander.get('expanded')) !== isExpanded) {
                this.expander.set('expanded', isExpanded);
                this.expander.update();
                this.updateProperties();
                this.layoutUI();
            }
        });
    }
    render(): UIElementView {
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
        const $root = this.$('.rootOfUI').empty();
        this.box = new svgui.NamedBox({
            parent: d3.select($root.get(0)),
            captionText: '<loading...>',
        });

        this.expander = new svgui.Expander({
            parent: this.box.root,
            splitterMargin: 3,
            expanded: this.model.get('isExpanded'),
        });
        this.expander.splitter
            .style('stroke', this.box.get('color'))
            .style('stroke-width', 1);

        const expanderTopWhenExpanded = new svgui.Stack({
            parent: this.expander.root,
            alignment: svgui.Alignment.START,
        });

        const expanderTop = new svgui.Stack({
            parent: this.expander.root,
            alignment: svgui.Alignment.START,
        });

        this.name = new svgui.Label({
            parent: expanderTop.root,
            raze: false,
            margin: {top: 5, right: 0, bottom: 5, left: 0},
            text: '<loading...>',
        });

        this.image = new svgui.Image({
            parent: expanderTop.root,
            minSize: {y: 100},
            margin: {top: 5, right: 0, bottom: 0, left: 0},
        });

        expanderTop.set('children', [this.name, this.image]);
        expanderTop.update();

        this.label = new svgui.Label({text: '<loading...>'});

        const pair = new svgui.Pair({});
        const iriLabel = new svgui.Label({
            parent: pair.root,
            text: 'IRI:',
            textClass: 'uiElementView__iri',
        });
        this.iri = new svgui.Label({
            parent: pair.root,
            text: '<loading...>',
            textClass: 'uiElementView__iri',
        });
        this.listenTo(this.iri, 'action:click', () => {
            this.model.trigger('action:iriClick', this.model.template.id);
        });
        pair.set('left', iriLabel);
        pair.set('right', this.iri);
        pair.update();

        expanderTopWhenExpanded.set('children', [this.label, pair]);
        expanderTopWhenExpanded.update();

        this.table = new svgui.PropertyTable({
            parent: this.expander.root,
            margin: {top: 2, right: 0, bottom: 0, left: 0},
            horIndent: 0,
        });
        this.expander.set('expandedfirst', expanderTopWhenExpanded);
        this.expander.set('first', expanderTop);
        this.expander.set('second', this.table);
        this.expander.update();
        this.box.root.on('dblclick', () => {
            this.model.set('isExpanded', !this.model.get('isExpanded'));
        });
        this.box.set('child', this.expander);
        this.box.update();
        this.updateUI();
    }
    private layoutUI() {
        const measuredSize = svgui.measure(this.box, {x: 250, y: Infinity});
        svgui.arrange(this.box, 0, 0);
        this.model.resize(measuredSize.x, measuredSize.y);
    }
    private updateUI() {
        if (this.model.template && this.view) {
            this.box.set('captionText', this.view.getElementTypeString(this.model.template));
            const {h, c, l} = this.view.getTypeStyle(this.model.template.types).color;
            this.box.set('color', d3.hcl(h, c, l));
            this.box.update();
            this.updateUIList();
            this.updateProperties();
            this.expander.splitter.style('stroke', this.box.get('color'));
            this.image.set('imageUrl', this.model.template.image);
            this.image.set('borderColor', this.box.get('color'));
            this.image.update();
        }
        this.layoutUI();
    }

    private updateUIList() {
        const iri = this.model.template.id;
        let name = this.view.getLocalizedText(this.model.template.label.values).text;
        if (!name) { name = iri; }
        this.label.set('text', name);
        this.name.set('text', name);
        this.iri.set('text', iri);
        this.label.update();
        this.name.update();
        this.iri.update();
    }

    private updateProperties() {
        if (!this.expander.get('expanded')) { return; }
        if (!this.properties) {
            this.properties = [];
            listPropertyValues(this.model.template, this.view.getLanguage(), (propertyName, values) => {
                this.properties.push({left: uri2name(propertyName), right: values[0]});
                for (let i = 1; i < values.length; i++) {
                    this.properties.push({left: '', right: values[i]});
                }
            });
            if (this.properties.length === 0) {
                this.properties.push({left: 'no properties', right: ''});
            }
        }
        this.table.set('content', [{name: '', val: this.properties}]);
        this.table.update();
    }
}

function listPropertyValues(
    elementModel: ElementModel, language: string,
    handler: (propertyName: string, values: string[]) => void
) {
    for (const propertyName in elementModel.properties) {
        if (elementModel.properties.hasOwnProperty(propertyName)) {
            const values = elementModel.properties[propertyName];
            const stringValues = [];
            for (const property of values) {
                if (property.type === 'string') {
                    const localized = property.value;
                    if (localized.lang.length === 0 || localized.lang === language) {
                        stringValues.push(localized.text);
                    }
                }
            }
            if (stringValues.length > 0) {
                handler(propertyName, stringValues);
            }
        }
    }
}

export class LinkView extends joint.dia.LinkView {
    model: Link;
    private view: DiagramView;
    initialize() {
        joint.dia.LinkView.prototype.initialize.apply(this, arguments);
        this.listenTo(this.model, 'state:loaded', this.updateLabel);
        this.listenTo(this.model, 'change:layoutOnly', this.updateLabel);
    }
    render(): LinkView {
        const result: any = super.render();
        if (!this.view && this['paper'] && this['paper']['diagramView']) {
            this.setView(this['paper']['diagramView']);
        }
        return result;
    }
    getTypeModel(): FatLinkType {
        return this.view.model.linkTypes[this.model.get('typeId')];
    }
    private setView(view: DiagramView) {
        this.view = view;
        this.listenTo(this.view, 'change:language', this.updateLabel);

        const typeModel = this.getTypeModel();
        if (typeModel) {
            // if type model is missing => link will be deleted from diagram
            this.listenTo(typeModel, 'change:showLabel', this.updateLabel);
            this.listenTo(typeModel, 'change:label', this.updateLabel);
        }

        this.updateLabel();
    }
    private updateLabel() {
        const linkTypeId: string = this.model.get('typeId');
        const typeModel = this.view.model.linkTypes[linkTypeId];

        let style: any = getDefaultLinkStyle(this.model.layoutOnly);

        const customStyle = this.view.getLinkStyle(this.model.get('typeId'));
        if (customStyle) {
            style = merge(style, cloneDeep(customStyle));
        }

        let labelStyle;
        if (typeModel && typeModel.get('showLabel')) {
            labelStyle = {
                labels: [{
                    position: 0.5,
                    attrs: {text: {
                        text: this.view.getLinkLabel(linkTypeId).text,
                    }},
                }],
            };
        } else {
            labelStyle = {labels: []};
        }
        // this.model.set('labels', labelStyle.labels);
        style = merge(style, labelStyle);
        this.model.set(style);
    }
}

function getDefaultLinkStyle(layoutOnly: boolean): joint.dia.LinkAttributes {
    return {
        attrs: {
            '.marker-target': {
                d: 'M 10 0 L 0 5 L 10 10 z',
                'fill': layoutOnly ? 'white' : null,
            },
            '.connection': {'stroke-dasharray': layoutOnly ? '5,5' : null},
        },
        z: 0,
    };
}
