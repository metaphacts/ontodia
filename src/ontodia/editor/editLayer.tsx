import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ElementModel, ElementTypeIri, LinkTypeIri } from '../data/model';

import { DiagramView } from '../diagram/view';
import { LinkLayer, LinkMarkers } from '../diagram/linkLayer';
import { Element, Link } from '../diagram/elements';
import { boundsOf, Vector } from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { PaperWidgetProps } from '../diagram/paperArea';

import { Cancellation } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { Spinner } from '../viewUtils/spinner';

import { EditorController } from './editorController';

export enum EditMode {
    establishNewLink,
    moveLinkSource,
    moveLinkTarget,
}

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    editor: EditorController;
    metadataApi: MetadataApi | undefined;
    mode: EditMode;
    target: Element | Link;
    point: { x: number; y: number };
}

export interface State {
    targetElement?: Element;
    canDropOnCanvas?: boolean;
    canDropOnElement?: boolean;
}

const ELEMENT_TYPE = '' as ElementTypeIri;
const LINK_TYPE = '' as LinkTypeIri;

export class EditLayer extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    private temporaryLink: Link;
    private temporaryElement: Element;
    private oldLink: Link;

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {mode, target, point} = this.props;
        if (mode === EditMode.establishNewLink) {
            this.beginCreatingLink({sourceId: target.id, point});
        } else if (mode === EditMode.moveLinkSource || mode === EditMode.moveLinkTarget) {
            this.beginMovingLink({link: target as Link, point});
        } else {
            throw new Error('Unknown edit mode');
        }
        this.forceUpdate();
        this.canDropOnCanvas();
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    private beginCreatingLink = (params: { sourceId: string; point: Vector }) => {
        const {editor, view} = this.props;
        const {sourceId, point} = params;

        const temporaryElement = this.createTemporaryElement(point);
        const temporaryLink = view.model.addLink(new Link({
            typeId: LINK_TYPE,
            sourceId,
            targetId: temporaryElement.id,
        }));

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private beginMovingLink(params: { link: Link; point: Vector }) {
        const {editor, mode} = this.props;
        const {link, point} = params;

        this.oldLink = link;
        editor.model.removeLink(link.id);
        const {id, typeId, sourceId, targetId, data, vertices} = link;

        const temporaryElement = this.createTemporaryElement(point);
        let temporaryLink: Link;

        if (mode === EditMode.moveLinkSource) {
            temporaryLink = editor.model.addLink(new Link({
                id, typeId, sourceId: temporaryElement.id, targetId, data, vertices,
            }));
        } else if (mode === EditMode.moveLinkTarget) {
            temporaryLink = editor.model.addLink(new Link({
                id, typeId, sourceId, targetId: temporaryElement.id, data, vertices,
            }));
        } else {
            throw new Error('Unknown edit mode');
        }

        this.temporaryElement = temporaryElement;
        this.temporaryLink = temporaryLink;
    }

    private createTemporaryElement(point: Vector) {
        const temporaryElement = this.props.view.model.createTemporaryElement();
        temporaryElement.setPosition(point);

        return temporaryElement;
    }

    private onMouseMove = (e: MouseEvent) => {
        const {targetElement} = this.state;

        e.preventDefault();
        e.stopPropagation();

        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.temporaryElement.setPosition(point);

        const newTargetElement = this.findElementFormPoint(point);

        if (newTargetElement && (!targetElement || newTargetElement.iri !== targetElement.iri)) {
            this.canDropOnElement(newTargetElement);
        }
        this.setState({targetElement: newTargetElement});
    }

    private canDropOnCanvas() {
        const {mode, editor, metadataApi} = this.props;

        if (!metadataApi || mode !== EditMode.establishNewLink) {
            this.setState({canDropOnCanvas: false});
            return;
        }

        this.setState({canDropOnCanvas: undefined});

        const source = editor.model.getElement(this.temporaryLink.sourceId).data;
        metadataApi.canDropOnCanvas(source, this.cancellation.signal).then(canDropOnCanvas => {
            if (!this.cancellation.signal.aborted) {
                this.setState({canDropOnCanvas});
            }
        });
    }

    private canDropOnElement(targetElement: Element) {
        const {mode, editor, metadataApi} = this.props;

        if (!metadataApi) {
            this.setState({canDropOnElement: false});
            return;
        }

        this.setState({canDropOnElement: undefined});

        let source: ElementModel;
        let target: ElementModel;

        if (mode === EditMode.establishNewLink || mode === EditMode.moveLinkTarget) {
            source = editor.model.getElement(this.temporaryLink.sourceId).data;
            target = targetElement.data;
        } else if (mode === EditMode.moveLinkSource) {
            source = targetElement.data;
            target = editor.model.getElement(this.temporaryLink.targetId).data;
        }

        metadataApi.canDropOnElement(source, target, this.cancellation.signal).then(canDropOnElement => {
            if (!this.cancellation.signal.aborted) {
                this.setState({canDropOnElement});
            }
        });
    }

    private onMouseUp = (e: MouseEvent) => {
        const {editor, mode} = this.props;
        const {targetElement, canDropOnElement, canDropOnCanvas} = this.state;

        editor.model.removeElement(this.temporaryElement.id);

        if (targetElement || (mode === EditMode.moveLinkSource || mode === EditMode.moveLinkTarget)) {
            const link = this.endChangingLink({link: this.temporaryLink, targetElement, canDrop: canDropOnElement});
            if (link) {
                editor.setSelection([link]);
                editor.showEditLinkForm(link);
            }
        } else if (canDropOnCanvas) {
            const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
            this.createNewEntity(point).then(element => {
                const link = this.endChangingLink({
                    link: this.temporaryLink, targetElement: element, canDrop: canDropOnCanvas,
                });
                if (link) {
                    this.listener.listenOnce(element.events, 'changeData', () => {
                        editor.setSelection([link]);
                        editor.showEditLinkForm(link);
                    });
                }
            });
        }

        editor.finishEditing();
    }

    private endChangingLink(params: { link: Link; targetElement?: Element; canDrop: boolean }): Link | undefined {
        const {editor, mode} = this.props;
        const {link, targetElement, canDrop} = params;

        let originalLink: Link;

        editor.model.removeLink(link.id);
        if (this.oldLink) {
            originalLink = editor.model.addLink(this.oldLink);
        }

        if (mode === EditMode.establishNewLink) {
            const sourceElement = editor.model.getElement(link.sourceId);
            if (canDrop && targetElement) {
                const typeId = LINK_TYPE;
                return editor.createNewLink(new Link({
                    typeId,
                    sourceId: sourceElement.id,
                    targetId: targetElement.id,
                    data: {
                        linkTypeId: typeId,
                        sourceId: sourceElement.iri,
                        targetId: targetElement.iri,
                    },
                }));
            }
        } else if (mode === EditMode.moveLinkSource) {
            if (canDrop && targetElement) {
                return editor.moveLinkSource({link, newSource: targetElement});
            }
        } else if (mode === EditMode.moveLinkTarget) {
            if (canDrop && targetElement) {
                return editor.moveLinkTarget({link, newTarget: targetElement});
            }
        } else {
            throw new Error('Unknown edit mode');
        }

        return originalLink;
    }

    private createNewEntity(point: { x: number; y: number }): Promise<Element | undefined> {
        const {editor, metadataApi, view} = this.props;
        if (!metadataApi) {
            return Promise.resolve(undefined);
        }

        const source = editor.model.getElement(this.temporaryLink.sourceId).data;

        return metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal).then(elementTypes => {
            if (!elementTypes.length) { return undefined; }

            const batch = editor.model.history.startBatch('Create new entity');
            const element = editor.createNewEntity(ELEMENT_TYPE);
            element.setPosition(point);
            batch.store();

            view.performSyncUpdate();
            editor.setSelection([element]);
            editor.showEditEntityForm(element, elementTypes);

            return element;
        });
    }

    private findElementFormPoint(point: { x: number; y: number }): Element | undefined {
        const {elements} = this.props.view.model;

        for (let i = elements.length - 1; i >= 0; i--) {
            const element = elements[i];
            const {x, y, width, height} = boundsOf(element);

            if (element.temporary) { continue; }

            if (point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height) {
                return element;
            }
        }

        return undefined;
    }

    private renderHighlight() {
        const {targetElement, canDropOnElement} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement);

        if (canDropOnElement === undefined) {
            return (
                <g transform={`translate(${x},${y})`}>
                    <rect width={width} height={height} fill={'white'} fillOpacity={0.5} />
                    <Spinner size={30} position={{x: width / 2, y: height / 2}}/>
                </g>
            );
        }

        const stroke = canDropOnElement ? '#5cb85c' : '#c9302c';

        return (
            <rect x={x} y={y} width={width} height={height} fill={'transparent'} stroke={stroke} strokeWidth={3} />
        );
    }

    private renderCanDropIndicator() {
        const {targetElement, canDropOnCanvas} = this.state;

        if (targetElement) { return null; }

        const {x, y} = this.temporaryElement.position;

        let indicator: React.ReactElement<any>;
        if (canDropOnCanvas === undefined) {
            indicator = <Spinner size={1.2} position={{x: 0.5, y: -0.5}}/>;
        } else if (canDropOnCanvas) {
            indicator = <path d='M0.5,0 L0.5,-1 M0,-0.5 L1,-0.5' strokeWidth={0.2} stroke='#5cb85c'/>;
        } else {
            indicator = (
                <g>
                    <circle cx='0.5' cy='-0.5' r='0.5' fill='none' strokeWidth={0.2} stroke='#c9302c'/>
                    <path d='M0.5,0 L0.5,-1' strokeWidth={0.2} stroke='#c9302c' transform='rotate(-45 0.5 -0.5)'/>
                </g>
            );
        }

        return (
            <g transform={`translate(${x} ${y})scale(40)`}>
                <rect x={-0.5} y={-0.5} width={1} height={1} fill='rgba(0, 0, 0, 0.1)' rx={0.25} ry={0.25} />
                <g transform={`translate(${0.5}, -${0.5})scale(${0.25})`}>{indicator}</g>
            </g>
        );
    }

    render() {
        const {view, paperTransform} = this.props;

        if (!this.temporaryLink) { return null; }

        return (
            <TransformedSvgCanvas paperTransform={paperTransform} style={{overflow: 'visible'}}>
                <LinkMarkers view={view} />
                {this.renderHighlight()}
                {this.renderCanDropIndicator()}
                <LinkLayer view={view} links={[this.temporaryLink]}/>
            </TransformedSvgCanvas>
        );
    }
}
