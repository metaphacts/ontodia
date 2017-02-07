import * as React from 'react';
import { findDOMNode } from 'react-dom';
import * as joint from 'jointjs';
import * as Backbone from 'backbone';
import { hcl } from 'd3-color';

import { Property } from '../data/model';

import { TemplateProps } from '../customization/props';
import { HandlebarsTemplate } from '../customization/handlebarsTemplate';

import { Element } from './elements';
import { uri2name } from './model';
import { DiagramView } from './view';

export interface Props {
    paper: joint.dia.Paper;
    view: DiagramView;
}

export class ElementLayer extends React.Component<Props, void> {
    private readonly listener = new Backbone.Model();

    private layer: HTMLDivElement;

    render() {
        const models = this.props.view.model.elements;

        const ctm = this.props.paper.viewport.getCTM();
        const scale = {x: ctm.a, y: ctm.d};
        const translate = {x: ctm.e, y: ctm.f};

        return <div className='ontodia-element-layer'
            ref={layer => this.layer = layer}
            style={{
                position: 'absolute', left: 0, top: 0,
                transform: `translate(${translate.x}px,${translate.y}px) scale(${scale.x},${scale.y})`,
            }}>
            {models.map(model => <OverlayedElement key={model.id}
                model={model}
                view={this.props.view}
                onResize={this.updateElementSize}
                onRender={this.updateElementSize} />)}
        </div>;
    }

    componentDidMount() {
        const {paper} = this.props;
        const graph = paper.model;
        this.listener.listenTo(graph, 'add remove reset', this.updateAll);
        this.listener.listenTo(paper, 'scale', this.updateAll);
        this.listener.listenTo(paper, 'translate resize', this.updateAll);
    }

    private updateAll = () => this.forceUpdate();

    componentWillUnmount() {
        this.listener.stopListening();
    }

    private updateElementSize = (element: Element, node: HTMLDivElement) => {
        const {clientWidth, clientHeight} = node;
        element.set('size', {width: clientWidth, height: clientHeight});
    }
}

interface OverlayedElementProps {
    model: Element;
    view: DiagramView;
    onResize: (model: Element, node: HTMLDivElement) => void;
    onRender: (model: Element, node: HTMLDivElement) => void;
}

interface OverlayedElementState {
    readonly templateProps?: TemplateProps;
}

class OverlayedElement extends React.Component<OverlayedElementProps, OverlayedElementState> {
    private readonly listener = new Backbone.Model();

    private typesObserver = new KeyedObserver({
        subscribe: key => {
            const type = this.props.view.model.getClassesById(key);
            if (type) { this.listener.listenTo(type, 'change:label', this.rerenderTemplate); }
        },
        unsubscribe: key => {
            const type = this.props.view.model.getClassesById(key);
            if (type) { this.listener.stopListening(type); }
        },
    });

    private propertyObserver = new KeyedObserver({
        subscribe: key => {
            const property = this.props.view.model.getPropertyById(key);
            if (property) { this.listener.listenTo(property, 'change:label', this.rerenderTemplate); }
        },
        unsubscribe: key => {
            const property = this.props.view.model.getPropertyById(key);
            if (property) { this.listener.stopListening(property); }
        },
    });

    constructor(props: OverlayedElementProps) {
        super(props);
        this.state = {
            templateProps: this.templateProps(),
        };
    }

    private rerenderTemplate = () => this.setState({templateProps: this.templateProps()});

    render(): React.ReactElement<any> {
        const {model, view, onResize, onRender} = this.props;

        this.typesObserver.observe(model.template.types);
        this.propertyObserver.observe(Object.keys(model.template.properties));

        const template = view.getElementTemplate(model.template.types);

        const {x = 0, y = 0} = model.get('position') || {};
        let transform = `translate(${x}px,${y}px)`;

        const angle = model.get('angle') || 0;
        if (angle) { transform += `rotate(${angle}deg)`; }

        return <div className='ontodia-overlayed-element'
            style={{position: 'absolute', transform}}
            tabIndex={0}
            // resize element when child image loaded
            onLoad={() => onResize(model, findDOMNode(this) as HTMLDivElement)}
            onError={() => onResize(model, findDOMNode(this) as HTMLDivElement)}
            onClick={e => {
                if (e.target instanceof HTMLElement && e.target.localName === 'a') {
                    const anchor = e.target as HTMLAnchorElement;
                    model.iriClick(anchor.href);
                    e.preventDefault();
                }
            }}
            onDoubleClick={() => {
                model.isExpanded = !model.isExpanded;
            }}
            ref={node => {
                if (!node) { return; }
                // set `model-id` to translate mouse events to paper
                node.setAttribute('model-id', model.id);
                onRender(model, node);
            }}>
            {typeof template === 'string'
                ? <HandlebarsTemplate template={template}
                    templateProps={this.state.templateProps}
                    onLoad={() => onResize(model, findDOMNode(this) as HTMLDivElement)} />
                : React.createElement(template, this.state.templateProps)}
        </div>;
    }

    componentDidMount() {
        const {model, view} = this.props;
        this.listener.listenTo(view, 'change:language', this.rerenderTemplate);
        this.listener.listenTo(model, 'state:loaded', this.rerenderTemplate);
        this.listener.listenTo(model, 'focus-on-me', () => {
            const element = findDOMNode(this) as HTMLElement;
            if (element) { element.focus(); }
        });
        this.listener.listenTo(model, 'change', () => {
            let invalidateRendering = false,
                invalidateAll = false;

            for (const changedKey in model.changed) {
                if (!model.changed.hasOwnProperty(changedKey)) { continue; }
                if (changedKey === 'size') {
                    /* ignore size changes */
                } else if (changedKey === 'position' || changedKey === 'angle') {
                    invalidateRendering = true;
                } else {
                    invalidateAll = true;
                }
            }

            if (invalidateAll) {
                this.rerenderTemplate();
            } else if (invalidateRendering) {
                this.forceUpdate();
            }
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    shouldComponentUpdate(nextProps: OverlayedElementProps, nextState: OverlayedElementState) {
        return nextState !== this.state;
    }

    componentDidUpdate() {
        this.props.onResize(this.props.model, findDOMNode(this) as HTMLDivElement);
    }

    private templateProps(): TemplateProps {
        const {model, view} = this.props;

        const types = model.template.types.length > 0
            ? view.getElementTypeString(model.template) : 'Thing';
        const label = view.getLocalizedText(model.template.label.values).text;
        const {color, icon} = this.styleFor(model);
        const propsAsList = this.getPropertyTable();

        return {
            types,
            label,
            color,
            icon,
            iri: model.template.id,
            imgUrl: model.template.image,
            isExpanded: model.isExpanded,
            props: model.template.properties,
            propsAsList,
        };
    }

    private getPropertyTable(): Array<{ id: string; name: string; property: Property; }> {
        const {model, view} = this.props;

        if (!model.template.properties) { return []; }

        const propTable = Object.keys(model.template.properties).map(key => {
            const property = view ? view.model.getPropertyById(key) : undefined;
            const name = view ? view.getLocalizedText(property.label.values).text : uri2name(key);
            return {
                id: key,
                name: name,
                property: model.template.properties[key],
            };
        });

        propTable.sort((a, b) => {
            const aLabel = (a.name || a.id).toLowerCase();
            const bLabel = (b.name || b.id).toLowerCase();
            return aLabel.localeCompare(bLabel);
        });
        return propTable;
    }

    private styleFor(model: Element) {
        const {color: {h, c, l}, icon} = this.props.view.getTypeStyle(model.template.types);
        return {
            icon: icon ? icon : 'ontodia-default-icon',
            color: hcl(h, c, l).toString(),
        };
    }
}

class KeyedObserver {
    private observedKeys = this.createMap<boolean>();

    private subscribe: (key: string) => void;
    private unsubscribe: (key: string) => void;

    constructor(params: {
        subscribe: (key: string) => void;
        unsubscribe: (key: string) => void;
    }) {
        this.subscribe = params.subscribe;
        this.unsubscribe = params.unsubscribe;
    }

    private createMap<V>(): { [key: string]: V; } {
        const map = Object.create(null);
        delete map['hint'];
        return map;
    }

    observe(keys: string[]) {
        const newObservedKeys = this.createMap<boolean>();

        for (const key of keys) {
            if (newObservedKeys[key]) { continue; }
            newObservedKeys[key] = true;
            if (!this.observedKeys[key]) {
                this.subscribe(key);
            }
        }

        for (const key in this.observedKeys) {
            if (!newObservedKeys[key]) {
                this.unsubscribe(key);
            }
        }

        this.observedKeys = newObservedKeys;
    }
}
