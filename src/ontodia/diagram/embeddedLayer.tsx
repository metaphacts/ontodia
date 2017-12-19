import * as React from 'react';

import { DiagramView } from './view';
import { Paper } from './paper';
import { Element } from './elements';
import { ElementLayer } from './elementLayer';
import { EventObserver } from '../viewUtils/events';

export interface Props {
    view: DiagramView;
    element: Element;
}

export class EmbeddedLayer extends React.Component<Props, void> {
    private readonly listener = new EventObserver();
    private layer: HTMLDivElement;
    private elements: Element[] = [];
    private offset: { x: number; y: number } = {x: 0, y: 0};

    componentDidMount() {
        const {view, element} = this.props;
        const {id, template} = element;

        this.listener.listenTo(element, 'change', () => {
            for (const changedKey in element.changed) {
                if (!element.changed.hasOwnProperty(changedKey)) { continue; }

                if (changedKey === 'position') {
                    this.setPositions();
                    this.updateAll();
                }
            }
        });

        view.loadEmbeddedElements(id, template.id).then(res => {
            const elements = Object.keys(res).map(key => view.model.createElement(res[key]));

            view.model.requestElementData(elements);
            view.model.requestLinksOfType();

            this.elements = elements;

            this.setPositions();
            this.updateAll();
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    private updateAll = () => this.forceUpdate();

    private setPositions = () => {
        const {x: elementX, y: elementY} = this.props.element.get('position');
        const {offsetLeft, offsetTop} = this.layer;
        const {x: offsetX, y: offsetY} = this.offset;

        const newOffsetX = elementX + offsetLeft;
        const newOffsetY = elementY + offsetTop;

        const diffX = newOffsetX - offsetX;
        const diffY = newOffsetY - offsetY;

        this.elements.forEach(element => {
            const {x, y} = element.get('position') || {x: 0, y: 0};
            const newPosition = {x: x + diffX, y: y + diffY};
            element.set('position', newPosition);
        });
        this.offset = {x: newOffsetX, y: newOffsetY};
    }

    render() {
        const {view, element} = this.props;
        const {x: offsetX, y: offsetY} = this.offset;

        const style = {
            position: 'absolute', left: -offsetX, top: -offsetY,
        };

        return (
            <div className="ontodia-embedded-layer" ref={layer => this.layer = layer}>
                <Paper view={view}
                       width={400}
                       height={400}
                       originX={-offsetX}
                       originY={-offsetY}
                       scale={1}
                       paddingX={0}
                       paddingY={0}
                       onPointerDown={() => {}}
                       group={element.id}>
                    <ElementLayer view={view} group={element.id} style={style} />
                </Paper>
            </div>
        );
    }
}
