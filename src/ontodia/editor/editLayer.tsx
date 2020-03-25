import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ElementModel, LinkModel } from '../data/model';
import { PLACEHOLDER_ELEMENT_TYPE, PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { DiagramView } from '../diagram/view';
import { LinkLayer, LinkMarkers } from '../diagram/linkLayer';
import { Element, Link, LinkDirection } from '../diagram/elements';
import { boundsOf, Vector, findElementAtPoint } from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { PaperWidgetProps } from '../diagram/paperArea';

import { Cancellation, CancellationToken } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { Spinner } from '../viewUtils/spinner';

import { TemporaryState } from './authoringState';
import { EditorController } from './editorController';

export enum EditLayerMode {
    establishLink,
    moveLinkSource,
    moveLinkTarget,
}

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    editor: EditorController;
    metadataApi: MetadataApi | undefined;
    mode: EditLayerMode;
    target: Element | Link;
    point: { x: number; y: number };
    onFinishEditing: () => void;
}

export interface State {
    targetElement?: Element;
    canLinkFrom?: boolean;
    canDropOnCanvas?: boolean;
    canDropOnElement?: boolean;
    waitingForMetadata?: boolean;
}

export class EditLayer extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    private canDropOnElementCancellation = new Cancellation();

    private temporaryLink: Link | undefined;
    private temporaryElement: Element | undefined;
    private oldLink: Link | undefined;

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {mode, target, point} = this.props;
        if (mode === EditLayerMode.establishLink) {
            this.beginCreatingLink({sourceId: target.id, point});
        } else if (mode === EditLayerMode.moveLinkSource || mode === EditLayerMode.moveLinkTarget) {
            this.beginMovingLink(target as Link, point);
        } else {
            throw new Error('Unknown edit mode');
        }
        this.forceUpdate();
        this.queryCanLinkFrom();
        this.queryCanDropOnCanvas();
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
        this.canDropOnElementCancellation.abort();
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    private beginCreatingLink = (params: { sourceId: string; point: Vector }) => {
        const {editor} = this.props;
        const {sourceId, point} = params;

        const temporaryElement = this.createTemporaryElement(point);
        const linkTemplate = new Link({
            typeId: PLACEHOLDER_LINK_TYPE,
            sourceId,
            targetId: temporaryElement.id,
        });
        const temporaryLink = editor.createNewLink({link: linkTemplate, temporary: true});
        const fatLinkType = editor.model.createLinkType(temporaryLink.typeId);
        fatLinkType.setVisibility({visible: true, showLabel: false});

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private beginMovingLink(target: Link, startingPoint: Vector) {
        const {editor, mode} = this.props;

        if (!(mode === EditLayerMode.moveLinkSource || mode === EditLayerMode.moveLinkTarget)) {
            throw new Error('Unexpected edit mode for moving link');
        }

        this.oldLink = target;
        editor.model.removeLink(target.id);
        const {id, typeId, sourceId, targetId, ...otherProps} = target;

        const temporaryElement = this.createTemporaryElement(startingPoint);
        const linkTemplate = new Link({
            typeId,
            sourceId: mode === EditLayerMode.moveLinkSource ? temporaryElement.id : sourceId,
            targetId: mode === EditLayerMode.moveLinkTarget ? temporaryElement.id : targetId,
            ...otherProps,
        });
        const temporaryLink = editor.createNewLink({link: linkTemplate, temporary: true});

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private createTemporaryElement(point: Vector) {
        const temporaryElement = this.props.view.model.createTemporaryElement();
        temporaryElement.setPosition(point);

        return temporaryElement;
    }

    private onMouseMove = (e: MouseEvent) => {
        const {view, paperArea} = this.props;
        const {targetElement, waitingForMetadata} = this.state;

        e.preventDefault();
        e.stopPropagation();

        if (waitingForMetadata) { return; }

        const point = paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.temporaryElement.setPosition(point);

        const newTargetElement = findElementAtPoint(view.model.elements, point);

        if (newTargetElement !== targetElement) {
            this.queryCanDropOnElement(newTargetElement);
        }
        this.setState({targetElement: newTargetElement});
    }

    private queryCanLinkFrom() {
        const {editor, metadataApi} = this.props;

        if (!metadataApi) {
            this.setState({canLinkFrom: false});
            return;
        }

        this.setState({canLinkFrom: undefined});

        const source = editor.model.getElement(this.temporaryLink.sourceId);
        CancellationToken.mapCancelledToNull(
            this.cancellation.signal,
            metadataApi.canLinkElement(source.data, this.cancellation.signal)
        ).then(
            canLinkFrom => {
                if (canLinkFrom === null) { return; }
                this.setState({canLinkFrom});
            },
            error => {
                // tslint:disable-next-line: no-console
                console.error('Error calling canLinkElement:', error);
                this.setState({canLinkFrom: false});
            }
        );
    }

    private queryCanDropOnCanvas() {
        const {mode, editor, metadataApi} = this.props;

        if (!metadataApi || mode !== EditLayerMode.establishLink) {
            this.setState({canDropOnCanvas: false});
            return;
        }

        this.setState({canDropOnCanvas: undefined});

        const source = editor.model.getElement(this.temporaryLink.sourceId);
        CancellationToken.mapCancelledToNull(
            this.cancellation.signal,
            metadataApi.canDropOnCanvas(source.data, this.cancellation.signal)
        ).then(
            canDropOnCanvas => {
                if (canDropOnCanvas === null) { return; }
                this.setState({canDropOnCanvas});
            },
            error => {
                // tslint:disable-next-line: no-console
                console.error('Error calling canDropOnCanvas:', error);
                this.setState({canDropOnCanvas: false});
            }
        );
    }

    private queryCanDropOnElement(targetElement: Element | undefined) {
        const {mode, editor, metadataApi} = this.props;

        this.canDropOnElementCancellation.abort();
        this.canDropOnElementCancellation = new Cancellation();

        if (!(metadataApi && targetElement)) {
            this.setState({canDropOnElement: false});
            return;
        }

        this.setState({canDropOnElement: undefined});

        let source: ElementModel;
        let target: ElementModel;

        if (mode === EditLayerMode.establishLink || mode === EditLayerMode.moveLinkTarget) {
            source = editor.model.getElement(this.temporaryLink.sourceId).data;
            target = targetElement.data;
        } else if (mode === EditLayerMode.moveLinkSource) {
            source = targetElement.data;
            target = editor.model.getElement(this.temporaryLink.targetId).data;
        }

        const signal = this.canDropOnElementCancellation.signal;
        CancellationToken.mapCancelledToNull(
            signal,
            metadataApi.canDropOnElement(source, target, signal)
        ).then(canDropOnElement => {
            if (canDropOnElement === null) { return; }
            this.setState({canDropOnElement});
        });
    }

    private onMouseUp = (e: MouseEvent) => {
        if (this.state.waitingForMetadata) { return; }
        // show spinner while waiting for additinal MetadataApi queries
        this.setState({waitingForMetadata: true});
        const selectedPosition = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.executeEditOperation(selectedPosition);
    }

    private async executeEditOperation(selectedPosition: Vector): Promise<void> {
        const {view, editor, mode} = this.props;

        try {
            const {targetElement, canLinkFrom, canDropOnCanvas, canDropOnElement} = this.state;

            if (this.oldLink) {
                editor.model.addLink(this.oldLink);
            }

            const canDrop = targetElement ? canDropOnElement : canDropOnCanvas;
            if (canLinkFrom && canDrop) {
                let modifiedLink: Link | undefined;
                let createdTarget: Element | undefined = targetElement;

                switch (mode) {
                    case EditLayerMode.establishLink: {
                        if (!createdTarget) {
                            const source = editor.model.getElement(this.temporaryLink.sourceId);
                            createdTarget = await this.createNewElement(source.data);
                            createdTarget.setPosition(selectedPosition);
                            view.performSyncUpdate();
                            centerElementAtPoint(createdTarget, selectedPosition);
                        }
                        const sourceElement = editor.model.getElement(this.temporaryLink.sourceId);
                        modifiedLink = await this.createNewLink(sourceElement, createdTarget);
                        break;
                    }
                    case EditLayerMode.moveLinkSource: {
                        modifiedLink = editor.moveLinkSource({link: this.oldLink, newSource: targetElement});
                        break;
                    }
                    case EditLayerMode.moveLinkTarget: {
                        modifiedLink = editor.moveLinkTarget({link: this.oldLink, newTarget: targetElement});
                        break;
                    }
                    default: {
                        throw new Error('Unknown edit mode');
                    }
                }

                if (targetElement) {
                    const focusedLink = modifiedLink || this.oldLink;
                    editor.setSelection([focusedLink]);
                    editor.showEditLinkForm(focusedLink);
                } else if (createdTarget && modifiedLink) {
                    editor.setSelection([createdTarget]);
                    const source = editor.model.getElement(modifiedLink.sourceId);
                    editor.showEditElementTypeForm({
                        link: modifiedLink,
                        source,
                        target: createdTarget,
                        targetIsNew: true,
                    });
                }
            }
        } finally {
            this.cleanupAndFinish();
        }
    }

    private createNewElement = async (source: ElementModel): Promise<Element | undefined> => {
        const {editor, metadataApi} = this.props;
        if (!metadataApi) {
            return;
        }
        const elementTypes = await CancellationToken.mapCancelledToNull(
            this.cancellation.signal,
            metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal)
        );
        if (elementTypes === null) { return; }
        const classId = elementTypes.length === 1 ? elementTypes[0] : PLACEHOLDER_ELEMENT_TYPE;
        const elementModel = await CancellationToken.mapCancelledToNull(
            this.cancellation.signal,
            metadataApi.generateNewElement([classId], this.cancellation.signal)
        );
        if (elementModel === null) { return; }
        return editor.createNewEntity({elementModel, temporary: true});
    }

    private async createNewLink(source: Element, target: Element): Promise<Link | undefined> {
        const {editor, metadataApi} = this.props;
        if (!metadataApi) {
            return undefined;
        }
        const linkTypes = await CancellationToken.mapCancelledToNull(
            this.cancellation.signal,
            metadataApi.possibleLinkTypes(source.data, target.data, this.cancellation.signal)
        );
        if (linkTypes === null) { return undefined; }
        const placeholder = {linkTypeIri: PLACEHOLDER_LINK_TYPE, direction: LinkDirection.out};
        const {linkTypeIri: typeId, direction} = linkTypes.length === 1 ? linkTypes[0] : placeholder;
        const data: LinkModel = {
            linkTypeId: typeId,
            sourceId: source.iri,
            targetId: target.iri,
        };
        let [sourceId, targetId] = [source.id, target.id];
        // switches source and target if the direction equals 'in'
        if (direction === LinkDirection.in) {
            data.sourceId = target.iri;
            data.targetId = source.iri;
            [sourceId, targetId] = [targetId, sourceId];
        }
        const link = new Link({typeId, sourceId, targetId, data});
        const existingLink = editor.model.findLink(link.typeId, link.sourceId, link.targetId);
        return existingLink || editor.createNewLink({link, temporary: true});
    }

    private cleanupAndFinish() {
        const {editor, onFinishEditing} = this.props;

        const batch = editor.model.history.startBatch();
        editor.model.removeElement(this.temporaryElement.id);
        editor.model.removeLink(this.temporaryLink.id);
        editor.setTemporaryState(
            TemporaryState.deleteLink(editor.temporaryState, this.temporaryLink.data)
        );
        batch.discard();

        onFinishEditing();
    }

    render() {
        const {view, paperTransform} = this.props;
        const {waitingForMetadata} = this.state;

        if (!this.temporaryLink) { return null; }

        return (
            <TransformedSvgCanvas paperTransform={paperTransform} style={{overflow: 'visible'}}>
                <LinkMarkers view={view} />
                {this.renderHighlight()}
                {this.renderCanDropIndicator()}
                {waitingForMetadata ? null : <LinkLayer view={view} links={[this.temporaryLink]} />}
            </TransformedSvgCanvas>
        );
    }

    private renderHighlight() {
        const {targetElement, canLinkFrom, canDropOnElement, waitingForMetadata} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement);

        if (canLinkFrom === undefined || canDropOnElement === undefined || waitingForMetadata) {
            return (
                <g transform={`translate(${x},${y})`}>
                    <rect width={width} height={height} fill={'white'} fillOpacity={0.5} />
                    <Spinner size={30} position={{x: width / 2, y: height / 2}}/>
                </g>
            );
        }

        const stroke = (canLinkFrom && canDropOnElement) ? '#5cb85c' : '#c9302c';
        return (
            <rect x={x} y={y} width={width} height={height} fill={'transparent'} stroke={stroke} strokeWidth={3} />
        );
    }

    private renderCanDropIndicator() {
        const {targetElement, canLinkFrom, canDropOnCanvas, waitingForMetadata} = this.state;

        if (targetElement) { return null; }

        const {x, y} = this.temporaryElement.position;

        let indicator: React.ReactElement<any>;
        if (canLinkFrom === undefined || canDropOnCanvas === undefined) {
            indicator = <Spinner size={1.2} position={{x: 0.5, y: -0.5}} />;
        } else if (canLinkFrom && canDropOnCanvas) {
            indicator = <path d='M0.5,0 L0.5,-1 M0,-0.5 L1,-0.5' strokeWidth={0.2} stroke='#5cb85c' />;
        } else {
            indicator = (
                <g>
                    <circle cx='0.5' cy='-0.5' r='0.5' fill='none' strokeWidth={0.2} stroke='#c9302c' />
                    <path d='M0.5,0 L0.5,-1' strokeWidth={0.2} stroke='#c9302c' transform='rotate(-45 0.5 -0.5)' />
                </g>
            );
        }

        return (
            <g transform={`translate(${x} ${y})scale(40)`}>
                <rect x={-0.5} y={-0.5} width={1} height={1} fill='rgba(0, 0, 0, 0.1)' rx={0.25} ry={0.25} />
                {waitingForMetadata
                    ? <Spinner size={0.8} />
                    : <g transform={`translate(${0.5}, -${0.5})scale(${0.25})`}>{indicator}</g>}
            </g>
        );
    }
}

function centerElementAtPoint(element: Element, point: Vector) {
    element.setPosition({
        x: point.x - element.size.width / 2,
        y: point.y - element.size.height / 2,
    });
}
