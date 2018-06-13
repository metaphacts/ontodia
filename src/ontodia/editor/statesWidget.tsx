import * as React from 'react';

import { EditorController } from './editorController';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';
import { boundsOf, computePolyline } from '../diagram/geometry';
import { EventObserver } from '../viewUtils/events';
import { AuthoringKind } from '../editor/authoringState';

export interface Props extends PaperWidgetProps {
    editor: EditorController;
    view: DiagramView;
}

export class StatesWidget extends React.Component<Props, {}> {
    private readonly listener = new EventObserver();

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.listenEvents();
    }

    componentWillReceiveProps() {
        this.listener.stopListening();
        this.listenEvents();
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    private listenEvents() {
        this.listener.listen(this.props.editor.model.events, 'elementEvent',  ({key, data}) => {
            if (data.changeSize || data.changePosition) {
                this.updateAll();
            }
        });
        this.listener.listen(this.props.editor.model.events, 'linkEvent', ({key, data}) => {
            if (data.changeVertices) {
                this.updateAll();
            }
        });
        this.listener.listen(this.props.editor.model.events, 'changeCells', this.updateAll);
        this.listener.listen(this.props.editor.events, 'changeAuthoringState', this.updateAll);
    }

    private renderLinksStates() {
        const {editor, view} = this.props;

        const elements: React.ReactElement<SVGPathElement>[] = [];

        editor.model.links.forEach(link => {
            const state = (
                editor.authoringState.index.links.get(link.data) ||
                editor.authoringState.index.elements.get(link.data.sourceId) ||
                editor.authoringState.index.elements.get(link.data.targetId)
            );
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
                } else if (state.type === AuthoringKind.DeleteLink || state.type === AuthoringKind.DeleteElement) {
                    color = 'red';
                }

                elements.push(
                    <path key={link.id} d={path} fill={'none'} stroke={color} strokeWidth={5} strokeOpacity={0.5} />
                );
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
