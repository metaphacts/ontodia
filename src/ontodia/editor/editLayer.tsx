import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ElementModel, ElementTypeIri, LinkTypeIri } from '../data/model';

import { EditorController } from './editorController';

import { EventObserver } from '../viewUtils/events';

import { DiagramView } from '../diagram/view';
import { LinkLayer, LinkMarkers } from '../diagram/linkLayer';
import { Element, Link } from '../diagram/elements';
import { boundsOf, Vector } from '../diagram/geometry';
import { Cancellation } from '../viewUtils/async';
import { Spinner } from '../viewUtils/spinner';
import { PaperWidgetProps } from '../diagram/paperArea';

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
    temporaryLink?: Link;
    temporaryElement?: Element;
    targetElement?: Element;
    canDrop?: boolean;
}

const ELEMENT_TYPE = '' as ElementTypeIri;
const LINK_TYPE = '' as LinkTypeIri;

export class EditLayer extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    private oldLink: Link;

    constructor(props: Props) {
        super(props);
        this.state = {canDrop: true};
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

        this.setState({temporaryLink, temporaryElement});
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

        this.setState({temporaryLink, temporaryElement});
    }

    private createTemporaryElement(point: Vector) {
        const temporaryElement = this.props.view.model.createTemporaryElement();
        temporaryElement.setPosition(point);

        return temporaryElement;
    }

    private onMouseMove = (e: MouseEvent) => {
        const {temporaryElement, targetElement} = this.state;

        if (!temporaryElement) { return; }

        e.preventDefault();
        e.stopPropagation();

        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.state.temporaryElement.setPosition(point);

        const newTargetElement = this.findElementFormPoint(point);

        if (newTargetElement && (!targetElement || newTargetElement.iri !== targetElement.iri)) {
            this.canDrop(newTargetElement);
            this.setState({targetElement: newTargetElement});
        } else if (!newTargetElement) {
            this.setState({targetElement: undefined, canDrop: true});
        }
    }

    private canDrop(targetElement?: Element) {
        const {mode, editor, metadataApi} = this.props;

        if (!metadataApi) {
            this.setState({canDrop: false});
            return;
        }

        const {temporaryLink} = this.state;
        this.setState({canDrop: undefined});

        let source: ElementModel;
        let target: ElementModel;

        if (mode === EditMode.establishNewLink || mode === EditMode.moveLinkTarget) {
            source = editor.model.getElement(temporaryLink.sourceId).data;
            target = targetElement.data;
        } else if (mode === EditMode.moveLinkSource) {
            source = targetElement.data;
            target = editor.model.getElement(temporaryLink.targetId).data;
        }

        const canDropPromise = metadataApi.canDrop(source, target, this.cancellation.signal);

        if (mode === EditMode.establishNewLink) {
            canDropPromise.then(canDrop => this.setState({canDrop}));
        } else if (mode === EditMode.moveLinkSource || mode === EditMode.moveLinkTarget) {
            const linkTypesPromise = metadataApi.possibleLinkTypes(source, target, this.cancellation.signal);
            Promise.all([canDropPromise, linkTypesPromise]).then(([canDrop, linkTypes]) => {
                this.setState({canDrop: canDrop && linkTypes.indexOf(temporaryLink.typeId) !== -1});
            });
        }
    }

    private onMouseUp = (e: MouseEvent) => {
        if (!this.state.temporaryElement) { return; }

        const {editor, mode} = this.props;
        const {temporaryLink, targetElement, canDrop} = this.state;

        editor.model.removeElement(this.state.temporaryElement.id);

        if (targetElement || (mode === EditMode.moveLinkSource || mode === EditMode.moveLinkTarget)) {
            const link = this.endChangingLink({link: temporaryLink, targetElement, canDrop});
            if (link) {
                editor.setSelection([link]);
                editor.showEditLinkForm(link);
            }
        } else {
            const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
            this.createNewEntity(point).then(element => {
                const link = this.endChangingLink({link: temporaryLink, targetElement: element, canDrop});
                if (link) {
                    this.listener.listenOnce(element.events, 'changeData', () => {
                        editor.setSelection([link]);
                        editor.showEditLinkForm(link);
                    });
                }
            });
        }

        this.oldLink = undefined;
        this.setState({
            temporaryLink: undefined, temporaryElement: undefined, targetElement: undefined, canDrop: undefined,
        });

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
        const {editor, metadataApi} = this.props;
        if (!metadataApi) {
            return Promise.resolve(undefined);
        }

        const source = editor.model.getElement(this.state.temporaryLink.sourceId).data;

        return metadataApi.typesOfElementsDraggedFrom(source, this.cancellation.signal).then(elementTypes => {
            if (!elementTypes.length) { return undefined; }

            const batch = editor.model.history.startBatch('Create new entity');
            const element = editor.createNewEntity(ELEMENT_TYPE);
            element.setPosition(point);
            batch.store();

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
        const {targetElement, canDrop} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement);

        if (canDrop === undefined) {
            return (
                <g transform={`translate(${x},${y})`}>
                    <rect width={width} height={height} fill={'white'} fillOpacity={0.5} />
                    <Spinner size={30} position={{x: width / 2, y: height / 2}}/>
                </g>
            );
        }

        const stroke = canDrop ? '#5cb85c' : '#c9302c';

        return (
            <rect x={x} y={y} width={width} height={height} fill={'transparent'} stroke={stroke} strokeWidth={3} />
        );
    }

    render() {
        const {view, paperArea} = this.props;
        const {temporaryLink} = this.state;

        if (!temporaryLink) { return null; }

        const {paperWidth, paperHeight, originX, originY} = paperArea.computeAdjustedBox();
        const scale = paperArea.getScale();

        const scaledWidth = paperWidth * scale;
        const scaledHeight = paperHeight * scale;

        return (
            <svg width={scaledWidth} height={scaledHeight}
                style={{overflow: 'visible', position: 'absolute', top: 0, left: 0}}>
                <LinkMarkers view={view} />
                <g transform={`scale(${scale},${scale})translate(${originX},${originY})`}>
                    {this.renderHighlight()}
                    <LinkLayer view={view} links={[temporaryLink]}/>
                </g>
            </svg>
        );
    }
}
