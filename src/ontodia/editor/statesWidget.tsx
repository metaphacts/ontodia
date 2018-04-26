import * as React from 'react';

import { boundsOf, computePolyline } from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';
import { Link } from '../diagram/elements';

import { EventObserver } from '../viewUtils/events';

import { AuthoringEvent, AuthoringKind } from './authoringState';
import { EditorController } from './editorController';

export interface Props extends PaperWidgetProps {
    editor: EditorController;
    view: DiagramView;
}

const CLASS_NAME = `ontodia-states-widget`;

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
        this.listener.listen(this.props.editor.events, 'changeTemporaryState', this.updateAll);
    }

    private calculateLinkPath(link: Link) {
        const {editor, view} = this.props;

        const source = editor.model.getElement(link.sourceId);
        const target = editor.model.getElement(link.targetId);

        const route = view.getRouting(link.id);
        const verticesDefinedByUser = link.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        const polyline = computePolyline(source, target, vertices);
        return 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');
    }

    private renderLinksStates() {
        const {editor} = this.props;
        return editor.model.links.map(link => {
            if (editor.temporaryState.links.has(link.data)) {
                const path = this.calculateLinkPath(link);
                return (
                    <path key={link.id} d={path} fill={'none'} stroke={'grey'} strokeWidth={5} strokeOpacity={0.5}
                        strokeDasharray={'8 8'}/>
                );
            }
            const state = (
                editor.authoringState.index.links.get(link.data) ||
                editor.authoringState.index.elements.get(link.data.sourceId) ||
                editor.authoringState.index.elements.get(link.data.targetId)
            );
            if (state) {
                const path = this.calculateLinkPath(link);
                let color: string;
                if (state.type === AuthoringKind.ChangeLink) {
                    color = state.before ? 'blue' : 'green';
                } else if (state.type === AuthoringKind.DeleteLink || state.type === AuthoringKind.DeleteElement) {
                    color = 'red';
                }
                return (
                    <path key={link.id} d={path} fill={'none'} stroke={color} strokeWidth={5} strokeOpacity={0.5} />
                );
            }
            return null;
        });
    }

    private renderElementsStates() {
        const {editor} = this.props;
        return editor.model.elements.map(element => {
            const {x, y, width, height} = boundsOf(element);
            if (editor.temporaryState.elements.has(element.iri)) {
                return (
                    <rect key={element.id} x={x} y={y} width={width} height={height} fill={'none'} stroke={'grey'}
                        strokeWidth={3} strokeOpacity={0.7} strokeDasharray={'8 8'} />
                );
            }
            const state = editor.authoringState.index.elements.get(element.iri);
            if (state) {
                const actionClass = `${CLASS_NAME}__action`;
                const cancelClass = `${CLASS_NAME}__cancel`;
                const onCancel = () => editor.discardChange(state);

                if (state.type === AuthoringKind.ChangeElement && !state.before) {
                    return <g key={element.id}>
                        <text x={x} y={y} dy='-1ex' pointerEvents='all'>
                            <tspan className={actionClass}>New</tspan> [
                                <tspan className={cancelClass}
                                    onClick={onCancel}>
                                    <title>Revert creation of the element</title>
                                    cancel
                                </tspan>
                            ]
                        </text>
                    </g>;
                } else if (state.type === AuthoringKind.ChangeElement && state.before) {
                    return <g key={element.id}>
                        <text x={x} y={y} dy='-1ex' pointerEvents='all'>
                            <tspan className={actionClass}>Change</tspan> [
                                <tspan className={cancelClass}
                                    onClick={onCancel}>
                                    <title>Revert all changes in properties of the element</title>
                                    cancel
                                </tspan>
                            ]
                        </text>
                    </g>;
                } else if (state.type === AuthoringKind.DeleteElement) {
                    const right = x + width;
                    const bottom = y + height;
                    return <g key={element.id}>
                        <text x={x} y={y} dy='-1ex' pointerEvents='all'>
                            <tspan className={actionClass}>Delete</tspan> [
                                <tspan className={cancelClass}
                                    onClick={onCancel}>
                                    <title>Revert deletion of the element</title>
                                    cancel
                                </tspan>
                            ]
                        </text>
                        <rect x={x} y={y} width={width} height={height} fill='white' fillOpacity={0.5} />
                        <line x1={x} y1={y} x2={right} y2={bottom} stroke='red' />
                        <line x1={right} y1={y} x2={x} y2={bottom} stroke='red' />
                    </g>;
                } else {
                    throw new Error('Unexpected element status');
                }
            }
            return null;
        });
    }

    render() {
        const {paperTransform} = this.props;
        return (
            <TransformedSvgCanvas paperTransform={paperTransform} style={{overflow: 'visible', pointerEvents: 'none'}}>
                {this.renderLinksStates()}
                {this.renderElementsStates()}
            </TransformedSvgCanvas>
        );
    }
}
