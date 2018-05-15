import * as React from 'react';

import { ElementTypeIri, LinkTypeIri } from '../data/model';

import { EditorController } from '../editor/editorController';

import { EventObserver } from '../viewUtils/events';

import { DiagramView } from './view';
import { LinkLayer, LinkMarkers } from './linkLayer';
import { Element, Link } from './elements';
import { boundsOf } from './geometry';
import { Cancellation } from '../viewUtils/async';
import { Spinner } from '../viewUtils/spinner';

enum EditMode {
    establishNewLink,
    moveLinkSource,
    moveLinkTarget,
}

export interface Props {
    view: DiagramView;
    editor: EditorController;
    paperProps: {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
    };
    pageToPaperCoords: (pageX: number, pageY: number) => { x: number; y: number; };
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
    private mode: EditMode;

    private readonly cancellation = new Cancellation();

    private oldLink: Link;

    constructor(props: Props) {
        super(props);
        this.state = {canDrop: true};
    }

    componentDidMount() {
        const {editor} = this.props;

        this.listener.listen(editor.events, 'establishLink', this.onEstablishLink);
        this.listener.listen(editor.events, 'moveLinkSource', ({link, point}) => {
            this.mode = EditMode.moveLinkSource;
            this.onMoveLink({link, point});
        });
        this.listener.listen(editor.events, 'moveLinkTarget', ({link, point}) => {
            this.mode = EditMode.moveLinkTarget;
            this.onMoveLink({link, point});
        });

        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    private onEstablishLink = (params: { sourceId: string; point: { x: number; y: number } }) => {
        const {editor} = this.props;
        const {sourceId, point} = params;

        this.mode = EditMode.establishNewLink;

        const temporaryElement = this.createTemporaryElement(point);
        const temporaryLink = editor.establishNewLink({linkTypeId: LINK_TYPE, sourceId, targetId: temporaryElement.id});

        this.setState({temporaryLink, temporaryElement});
    }

    private onMoveLink(params: { link: Link; point: { x: number; y: number } }) {
        const {editor} = this.props;
        const {link, point} = params;

        this.oldLink = link;

        const temporaryElement = this.createTemporaryElement(point);

        let temporaryLink: Link;

        if (this.mode === EditMode.moveLinkSource) {
            temporaryLink = editor.moveLinkSource({link, sourceId: temporaryElement.id});
        } else if (this.mode === EditMode.moveLinkTarget) {
            temporaryLink = editor.moveLinkTarget({link, targetId: temporaryElement.id});
        } else {
            throw new Error('Unknown edit mode');
        }

        this.setState({temporaryLink, temporaryElement});
    }

    private createTemporaryElement(point: { x: number; y: number }) {
        const temporaryElement = this.props.view.model.createTemporaryElement();
        temporaryElement.setPosition(point);

        return temporaryElement;
    }

    private onMouseMove = (e: MouseEvent) => {
        const {temporaryElement, targetElement} = this.state;

        if (!temporaryElement) { return; }

        e.preventDefault();
        e.stopPropagation();

        const point = this.props.pageToPaperCoords(e.pageX, e.pageY);
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
        const {model, metadata} = this.props.editor;
        const {temporaryLink} = this.state;

        this.setState({canDrop: undefined});

        let source: Element;
        let target: Element;

        if (this.mode === EditMode.establishNewLink || this.mode === EditMode.moveLinkTarget) {
            source = model.getElement(temporaryLink.sourceId);
            target = targetElement;
        } else if (this.mode === EditMode.moveLinkSource) {
            source = targetElement;
            target = model.getElement(temporaryLink.targetId);
        }

        const canDropPromise = metadata.canDrop(source.data, target.data, this.cancellation.token);

        if (this.mode === EditMode.establishNewLink) {
            canDropPromise.then(canDrop => this.setState({canDrop}));
        } else if (this.mode === EditMode.moveLinkSource || this.mode === EditMode.moveLinkTarget) {
            const linkTypesPromise = metadata.possibleLinkTypes(source.data, target.data, this.cancellation.token);
            Promise.all([canDropPromise, linkTypesPromise]).then(([canDrop, linkTypes]) =>
                this.setState({canDrop: canDrop && linkTypes.indexOf(temporaryLink.typeId) !== -1})
            );
        }
    }

    private onMouseUp = (e: MouseEvent) => {
        if (!this.state.temporaryElement) { return; }

        const {editor} = this.props;
        const {temporaryLink, targetElement, canDrop} = this.state;

        editor.model.removeElement(this.state.temporaryElement.id);

        if (targetElement) {
            const link = this.editLink({link: temporaryLink, targetElement, canDrop});
            if (link) {
                editor.setSelection([link]);
                editor.showEditLinkForm(link);
            }
        } else {
            const point = this.props.pageToPaperCoords(e.pageX, e.pageY);
            this.createNewEntity(point).then(element => {
                const link = this.editLink({link: temporaryLink, targetElement: element, canDrop});
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
    }

    private editLink(params: {link: Link; targetElement?: Element; canDrop: boolean}): Link | undefined {
        const {editor} = this.props;
        const {link, targetElement, canDrop} = params;

        if (this.mode === EditMode.establishNewLink) {
            const {sourceId} = link;
            editor.model.removeLink(link.id);
            if (canDrop && targetElement) {
                return editor.establishNewLink({linkTypeId: LINK_TYPE, sourceId, targetId: targetElement.id});
            }
        } else if (this.mode === EditMode.moveLinkSource) {
            const sourceId = canDrop && targetElement ? targetElement.id : this.oldLink.sourceId;
            return editor.moveLinkSource({link, sourceId});
        } else if (this.mode === EditMode.moveLinkTarget) {
            const targetId = canDrop && targetElement ? targetElement.id : this.oldLink.targetId;
            return editor.moveLinkTarget({link, targetId});
        } else {
            throw new Error('Unknown edit mode');
        }

        return undefined;
    }

    private createNewEntity(point: { x: number; y: number }): Promise<Element | undefined> {
        const {editor} = this.props;

        return this.getTypesOfElementsDraggedFrom().then(elementTypes => {

            if (!elementTypes.length) { return undefined; }

            const element = editor.createNewEntity(ELEMENT_TYPE);
            element.setPosition(point);

            editor.setSelection([element]);
            editor.showEditEntityForm(element, elementTypes);

            return element;
        });
    }

    private getTypesOfElementsDraggedFrom() {
        const {metadata, model} = this.props.editor;

        let source: Element;
        if (this.mode === EditMode.establishNewLink || this.mode === EditMode.moveLinkTarget) {
            source = model.getElement(this.state.temporaryLink.sourceId);
        }

        if (!source) { return Promise.resolve([]); }

        return metadata.typesOfElementsDraggedFrom(source.data, this.cancellation.token);
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
        const {view} = this.props;
        const {temporaryLink} = this.state;

        if (!temporaryLink) { return null; }

        const {width, height, originX, originY, scale} = this.props.paperProps;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;

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
