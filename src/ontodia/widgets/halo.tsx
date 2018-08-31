import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';

import { Element as DiagramElement, ElementEvents, Element } from '../diagram/elements';
import { Vector, boundsOf } from '../diagram/geometry';
import { PaperWidgetProps } from '../diagram/paperArea';

import { EditorController } from '../editor/editorController';
import { AuthoringState, AuthoringKind } from '../editor/authoringState';

import { AnyListener, Unsubscribe, EventObserver } from '../viewUtils/events';
import { Cancellation, Debouncer } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';
import { ElementIri } from '../..';

export interface Props extends PaperWidgetProps {
    target: DiagramElement | undefined;
    editor: EditorController;
    metadataApi?: MetadataApi;
    onRemove?: () => void;
    onExpand?: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
    onAddToFilter?: () => void;
    onEstablishNewLink?: (point: Vector) => void;
    onFolowLink?: (element: Element, event: React.MouseEvent<any>) => void;
}

export interface State {
    canLink?: boolean;
}

const CLASS_NAME = 'ontodia-halo';

export class Halo extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();
    private queryDebouncer = new Debouncer();
    private queryCancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {editor, target} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.queryAllowedActions();
        });
        this.listenToElement(target);
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.target !== this.props.target) {
            this.listenToElement(this.props.target);
            this.queryAllowedActions();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.listenToElement(undefined);
        this.queryDebouncer.dispose();
        this.queryCancellation.abort();
    }

    listenToElement(element: DiagramElement | undefined) {
        this.targetListener.stopListening();
        if (element) {
            this.targetListener.listenAny(element.events, this.onElementEvent);
        }
    }

    private queryAllowedActions() {
        this.queryDebouncer.call(() => {
            this.queryCancellation.abort();
            this.queryCancellation = new Cancellation();
            this.canLink(this.props.target);
        });
    }

    private canLink(target: DiagramElement) {
        const {metadataApi, editor} = this.props;
        if (!metadataApi) {
            this.setState({canLink: false});
            return;
        }
        const event = editor.authoringState.index.elements.get(target.iri);
        if (event && event.type === AuthoringKind.DeleteElement) {
            this.setState({canLink: false});
        } else {
            this.setState({canLink: undefined});
            const signal = this.queryCancellation.signal;
            metadataApi.canLinkElement(target.data, signal).then(canLink => {
                if (signal.aborted) { return; }
                if (this.props.target.iri === target.iri) {
                    this.setState({canLink});
                }
            });
        }
    }

    private onElementEvent: AnyListener<ElementEvents> = data => {
        if (data.changePosition || data.changeSize || data.changeExpanded) {
            this.forceUpdate();
        }
        if (data.changeData) {
            this.queryAllowedActions();
        }
    }

    render() {
        const {
            paperArea, editor, target, navigationMenuOpened, onToggleNavigationMenu, onAddToFilter,
            onExpand, onFolowLink,
        } = this.props;

        if (!target) {
            return <div className={CLASS_NAME} style={{display: 'none'}} />;
        }

        const bbox = boundsOf(target);
        const {x: x0, y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const style: React.CSSProperties = {left: x0, top: y0, width: x1 - x0, height: y1 - y0};

        return (
            <div className={CLASS_NAME} style={style}>
                {this.renderRemoveOrDeleteButton()}
                {onToggleNavigationMenu && <div className={`${CLASS_NAME}__navigate ` +
                    `${CLASS_NAME}__navigate--${navigationMenuOpened ? 'closed' : 'open'}`}
                    role='button'
                    title='Open a dialog to navigate to connected elements'
                    onClick={onToggleNavigationMenu} />}
                {onFolowLink && <a className={`${CLASS_NAME}__folow`}
                    href={target.iri}
                    role='button'
                    title='Jump to resource'
                    onClick={e => onFolowLink(target, e)} />}
                {onAddToFilter && <div className={`${CLASS_NAME}__add-to-filter`}
                    role='button'
                    title='Search for connected elements'
                    onClick={onAddToFilter} />}
                {onExpand && <div className={`${CLASS_NAME}__expand ` +
                    `${CLASS_NAME}__expand--${target.isExpanded ? 'closed' : 'open'}`}
                    role='button'
                    title={`Expand an element to reveal additional properties`}
                    onClick={onExpand} />}
                {editor.inAuthoringMode ? this.renderEstablishNewLinkButton() : null}
            </div>
        );
    }

    private renderRemoveOrDeleteButton() {
        const {editor, target, onRemove} = this.props;
        if (!onRemove) {
            return null;
        }

        const isNewElement = AuthoringState.isNewElement(editor.authoringState, target.iri);
        return (
            <div className={isNewElement ? `${CLASS_NAME}__delete` : `${CLASS_NAME}__remove`}
                role='button'
                title={isNewElement ? 'Delete new element' : 'Remove an element from the diagram'}
                onClick={onRemove}>
            </div>
        );
    }

    private renderEstablishNewLinkButton() {
        const {onEstablishNewLink} = this.props;
        const {canLink} = this.state;
        if (!onEstablishNewLink) { return null; }
        if (canLink === undefined) {
            return (
                <div className={`${CLASS_NAME}__establish-connection-spinner`}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canLink
            ? 'Establish connection'
            : 'Establishing connection is unavailable for the selected element';
        return (
            <button className={`${CLASS_NAME}__establish-connection`} title={title}
                onMouseDown={this.onEstablishNewLink} disabled={!canLink} />
        );
    }

    private onEstablishNewLink = (e: React.MouseEvent<HTMLElement>) => {
        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.props.onEstablishNewLink(point);
    }
}
