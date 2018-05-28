import * as React from 'react';

import { EditorController } from './editorController';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';
import { Element, Link } from '../diagram/elements';
import { boundsOf, computePolyline } from '../diagram/geometry';
import { Unsubscribe } from '../viewUtils/events';
import { AuthoringKind } from '../editor/authoringState';

export interface Props extends PaperWidgetProps {
    editor: EditorController;
    view: DiagramView;
}

export class StatesWidget extends React.Component<Props, {}> {
    private unsubscribe: {[id: string]: Unsubscribe} = {};

    private updateAll = () => this.forceUpdate();

    componentWillUnmount() {
        Object.keys(this.unsubscribe).forEach(id => this.unsubscribe[id]());
    }

    private listenToTarget(target: Element | Link) {
        if (this.unsubscribe[target.id]) {
            this.unsubscribe[target.id]();
            this.unsubscribe[target.id] = undefined;
        }

        if (target instanceof Element) {
            this.listenToElement(target);
        } else if (target instanceof Link) {
            this.listenToLink(target);
        }
    }

    private listenToElement(element: Element) {
        element.events.onAny(this.updateAll);
        this.unsubscribe[element.id] = () => element.events.offAny(this.updateAll);
    }

    private listenToLink(link: Link) {
        link.events.onAny(this.updateAll);
        this.unsubscribe[link.id] = () => link.events.offAny(this.updateAll);
    }

    private renderLinksStates() {
        const {editor, view} = this.props;

        const elements: React.ReactElement<SVGPathElement>[] = [];

        editor.model.links.forEach(link => {
            const state = editor.authoringState.index.links.get(link.data);
            if (state) {
                const source = editor.model.getElement(link.sourceId);
                const target = editor.model.getElement(link.targetId);

                const route = view.getRouting(link.id);
                const verticesDefinedByUser = link.vertices || [];
                const vertices = route ? route.vertices : verticesDefinedByUser;

                const polyline = computePolyline(source, target, vertices);
                const path = 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');

                let color: string;
                if (state.type === AuthoringKind.ChangeLink) {
                    color = state.before ? 'blue' : 'green';
                } else if (state.type === AuthoringKind.DeleteLink) {
                    color = 'red';
                }

                elements.push(
                    <path key={link.id} d={path} fill={'none'} stroke={color} strokeWidth={5} strokeOpacity={0.5} />
                );

                this.listenToTarget(source);
                this.listenToTarget(target);
                this.listenToTarget(link);
            }
        });

        return elements;
    }

    private renderElementsStates() {
        const {editor} = this.props;

        const elements: React.ReactElement<SVGRectElement>[] = [];

        editor.model.elements.forEach(element => {
            const state = editor.authoringState.index.elements.get(element.iri);
            if (state) {
                const {x, y, width, height} = boundsOf(element);

                let color: string;
                if (state.type === AuthoringKind.ChangeElement) {
                    color = state.before ? 'blue' : 'green';
                } else if (state.type === AuthoringKind.DeleteElement) {
                    color = 'red';
                }

                elements.push(
                    <rect key={element.id} x={x} y={y} width={width} height={height} fill={'none'} stroke={color}
                        strokeWidth={3} strokeOpacity={0.7} />
                );

                this.listenToTarget(element);
            }
        });

        return elements;
    }

    render() {
        const {paperArea} = this.props;

        const {paperWidth, paperHeight, originX, originY} = paperArea.computeAdjustedBox();
        const scale = paperArea.getScale();

        const scaledWidth = paperWidth * scale;
        const scaledHeight = paperHeight * scale;

        return (
            <svg width={scaledWidth} height={scaledHeight}
                 style={{position: 'absolute', top: 0, left: 0, pointerEvents: 'none'}}>
                <g transform={`scale(${scale},${scale})translate(${originX},${originY})`}>
                    {this.renderLinksStates()}
                    {this.renderElementsStates()}
                </g>
            </svg>
        );
    }
}
