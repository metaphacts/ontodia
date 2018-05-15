import * as React from 'react';

import { ElementTypeIri, LinkTypeIri } from '../data/model';

import { EditorController, DialogTypes } from '../editor/editorController';

import { EventObserver } from '../viewUtils/events';

import { DiagramView } from './view';
import { LinkLayer, LinkMarkers } from './linkLayer';
import { Element, Link } from './elements';
import { boundsOf } from './geometry';

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
}

const ELEMENT_TYPE = 'http://www.w3.org/2002/07/owl#Thing' as ElementTypeIri;
const LINK_TYPE = 'http://www.w3.org/2000/01/rdf-schema#subClassOf' as LinkTypeIri;

export class EditLayer extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private mode: EditMode;

    constructor(props: Props) {
        super(props);
        this.state = {};
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
        if (!this.state.temporaryElement) { return; }

        e.preventDefault();
        e.stopPropagation();

        const point = this.props.pageToPaperCoords(e.pageX, e.pageY);
        this.state.temporaryElement.setPosition(point);

        const targetElement = this.findElementFormPoint(point);
        this.setState({targetElement});
    }

    private onMouseUp = (e: MouseEvent) => {
        if (!this.state.temporaryElement) { return; }

        const {view, editor} = this.props;
        const {temporaryLink} = this.state;

        view.model.removeElement(this.state.temporaryElement.id);

        const point = this.props.pageToPaperCoords(e.pageX, e.pageY);
        const element = this.getElementFromPoint(point);

        let link: Link;

        if (this.mode === EditMode.establishNewLink) {
            const params = {linkTypeId: LINK_TYPE, sourceId: temporaryLink.sourceId, targetId: element.id};

            view.model.removeLink(temporaryLink.id);

            link = editor.establishNewLink(params);
        } else if (this.mode === EditMode.moveLinkSource) {
            link = editor.moveLinkSource({link: temporaryLink, sourceId: element.id});
        } else if (this.mode === EditMode.moveLinkTarget) {
            link = editor.moveLinkTarget({link: temporaryLink, targetId: element.id});
        } else {
            throw new Error('Unknown edit mode');
        }

        editor.setSelection([link]);
        editor.showDialog(link, DialogTypes.EditLinkForm);

        this.setState({temporaryLink: undefined, temporaryElement: undefined});
    }

    private getElementFromPoint(point: { x: number; y: number }): Element {
        const {editor} = this.props;

        let element = this.findElementFormPoint(point);

        if (element === undefined) {
            element = editor.createNewEntity(ELEMENT_TYPE);
            element.setPosition(point);
        }

        return element;
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
        const {targetElement} = this.state;

        if (!targetElement) { return null; }

        const {x, y, width, height} = boundsOf(targetElement);

        const canDrop = true;
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
