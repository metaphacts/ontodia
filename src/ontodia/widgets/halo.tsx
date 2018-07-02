import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';

import { Element as DiagramElement, ElementEvents } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';
import { PaperWidgetProps } from '../diagram/paperArea';

import { EditorController } from '../editor/editorController';
import { AuthoringKind } from '../editor/authoringState';

import { AnyListener, Unsubscribe, EventObserver } from '../viewUtils/events';
import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

export interface Props extends PaperWidgetProps {
    target: DiagramElement | undefined;
    editor: EditorController;
    metadataApi?: MetadataApi;
    onRemove?: () => void;
    onExpand?: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
    onAddToFilter?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onRevert?: () => void;
    onEstablishNewLink?: (point: { x: number; y: number; }) => void;
}

export interface State {
    canDelete?: boolean;
    canEdit?: boolean;
    canLink?: boolean;
}

const CLASS_NAME = 'ontodia-halo';

export class Halo extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const {editor, target} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', this.updateAuthoringButtons);
        this.listenToElement(target);
        this.updateAuthoringButtons();
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.target !== this.props.target) {
            this.listenToElement(this.props.target);
            this.updateAuthoringButtons();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.listenToElement(undefined);
        this.cancellation.abort();
    }

    listenToElement(element: DiagramElement | undefined) {
        this.targetListener.stopListening();
        if (element) {
            this.targetListener.listenAny(element.events, this.onElementEvent);
        }
    }

    private updateAuthoringButtons = () => {
        this.canDelete(this.props.target);
        this.canEdit(this.props.target);
        this.canLink(this.props.target);
    }

    private canDelete(target: DiagramElement) {
        const {metadataApi} = this.props;
        if (!metadataApi) {
            this.setState({canDelete: false});
        } else {
            this.setState({canDelete: undefined});
            metadataApi.canDeleteElement(target.data, this.cancellation.signal).then(canDelete => {
                if (!this.cancellation.signal.aborted && this.props.target.iri === target.iri) {
                    this.setState({canDelete});
                }
            });
        }
    }

    private canEdit(target: DiagramElement) {
        const {metadataApi, editor} = this.props;
        if (!metadataApi) {
            this.setState({canEdit: false});
            return;
        }
        const event = editor.authoringState.index.elements.get(target.iri);
        if (event && event.type === AuthoringKind.DeleteElement) {
            this.setState({canEdit: false});
        } else {
            this.setState({canEdit: undefined});
            metadataApi.canEditElement(target.data, this.cancellation.signal).then(canEdit => {
                if (!this.cancellation.signal.aborted && this.props.target.iri === target.iri) {
                    this.setState({canEdit});
                }
            });
        }
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
            metadataApi.canLinkElement(target.data, this.cancellation.signal).then(canLink => {
                if (!this.cancellation.signal.aborted && this.props.target.iri === target.iri) {
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
            this.updateAuthoringButtons();
        }
    }

    private onEstablishNewLink = (e: React.MouseEvent<HTMLElement>) => {
        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.props.onEstablishNewLink(point);
    }

    private renderEditButton() {
        const {onEdit} = this.props;
        if (!onEdit) { return null; }

        const {canEdit} = this.state;
        if (canEdit === undefined) {
            return (
                <div className={`${CLASS_NAME}__edit-spinner`}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canEdit ? 'Edit entity' : 'Editing is unavailable for the selected element';
        return (
            <button className={`${CLASS_NAME}__edit`} title={title} onClick={onEdit} disabled={!canEdit} />
        );
    }

    private renderDeleteButton() {
        const {onDelete} = this.props;
        if (!onDelete) { return null; }

        const {canDelete} = this.state;
        if (canDelete === undefined) {
            return (
                <div className={`${CLASS_NAME}__delete-spinner`}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        return (
            <button className={`${CLASS_NAME}__delete`}
                title={canDelete ? 'Delete entity' : 'Deletion is unavailable for the selected element'}
                disabled={!canDelete}
                onClick={onDelete} />
        );
    }

    private renderRevertButton() {
        const {onRevert} = this.props;
        if (!onRevert) { return null; }
        return (
            <button className={`${CLASS_NAME}__revert`}
                title={`Revert deletion of the selected element`}
                onClick={onRevert} />
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
        const title =
            canLink ? 'Establish connection' : 'Establishing connection is unavailable for the selected element';
        return (
            <button className={`${CLASS_NAME}__establish-connection`} title={title}
                onMouseDown={this.onEstablishNewLink} disabled={!canLink} />
        );
    }

    render() {
        const {
            paperArea, editor, target, navigationMenuOpened, onRemove, onToggleNavigationMenu,
            onAddToFilter, onExpand,
        } = this.props;

        if (!target) {
            return <div className={CLASS_NAME} style={{display: 'none'}} />;
        }

        const event = editor.authoringState.index.elements.get(target.iri);
        const isElementDeleted = event && event.type === AuthoringKind.DeleteElement;

        const bbox = boundsOf(target);
        const {x: x0, y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const style: React.CSSProperties = {left: x0, top: y0, width: x1 - x0, height: y1 - y0};

        return (
            <div className={CLASS_NAME} style={style}>
                {onRemove && <div className={`${CLASS_NAME}__remove`}
                    role='button'
                    title='Remove an element from the diagram'
                    onClick={onRemove} />}
                {onToggleNavigationMenu && <div className={`${CLASS_NAME}__navigate ` +
                    `${CLASS_NAME}__navigate--${navigationMenuOpened ? 'closed' : 'open'}`}
                    role='button'
                    title='Open a dialog to navigate to connected elements'
                    onClick={onToggleNavigationMenu} />}
                {onAddToFilter && <div className={`${CLASS_NAME}__add-to-filter`}
                    role='button'
                    title='Search for connected elements'
                    onClick={onAddToFilter} />}
                {onExpand && <div className={`${CLASS_NAME}__expand ` +
                    `${CLASS_NAME}__expand--${target.isExpanded ? 'closed' : 'open'}`}
                    role='button'
                    title={`Expand an element to reveal additional properties`}
                    onClick={onExpand} />}
                {this.renderEditButton()}
                {isElementDeleted ? this.renderRevertButton() : this.renderDeleteButton()}
                {this.renderEstablishNewLinkButton()}
            </div>
        );
    }
}
