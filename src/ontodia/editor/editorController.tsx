import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ValidationApi, ElementError } from '../data/validationApi';
import { ElementModel, LinkModel, ElementIri, LinkTypeIri, ElementTypeIri, sameLink } from '../data/model';
import { generate64BitID } from '../data/utils';

import { setElementExpanded, setElementData, setLinkData } from '../diagram/commands';
import { Element, Link, LinkVertex } from '../diagram/elements';
import { Vector, Size, boundsOf, computeGrouping } from '../diagram/geometry';
import { Command } from '../diagram/history';
import { DiagramModel } from '../diagram/model';
import { PaperArea, PointerUpEvent, PaperWidgetProps, getContentFittingBox } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';

import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';

import { Dialog } from '../widgets/dialog';
import { ConnectionsMenu, PropertySuggestionHandler } from '../widgets/connectionsMenu';
import { EditEntityForm } from '../widgets/editEntityForm';
import { EditLinkForm } from '../widgets/editLinkForm';
import { Halo } from '../widgets/halo';
import { HaloLink } from '../widgets/haloLink';
import { StatesWidget } from './statesWidget';

import {
    LayoutNode, LayoutLink, forceLayout, padded, removeOverlaps, translateToPositiveQuadrant,
} from '../viewUtils/layout';
import { Spinner, Props as SpinnerProps } from '../viewUtils/spinner';

import { AsyncModel, restoreLinksBetweenElements } from './asyncModel';
import {
    AuthoringState, AuthoringKind, ElementChange, LinkChange, linkConnectedToElement,
    isSourceOrTargetChanged,
} from './authoringState';
import { EditLayer, EditMode } from './editLayer';

import { Cancellation } from '../viewUtils/async';

export interface PropertyEditorOptions {
    elementData: ElementModel;
    onSubmit: (newData: ElementModel) => void;
}
export type RenderPropertyEditor = (options: PropertyEditorOptions) => React.ReactElement<any>;

export enum DialogTypes {
    ConnectionsMenu,
    EditEntityForm,
    EditLinkForm,
}

export type SelectionItem = Element | Link;

export interface EditorProps extends EditorOptions {
    model: AsyncModel;
    view: DiagramView;
}

export interface EditorOptions {
    metadataApi?: MetadataApi;
    validationApi?: ValidationApi;
    disableHalo?: boolean;
    suggestProperties?: PropertySuggestionHandler;
    renderPropertyEditor?: RenderPropertyEditor;
}

export interface EditorEvents {
    changeSelection: PropertyChange<EditorController, ReadonlyArray<SelectionItem>>;
    changeAuthoringState: PropertyChange<EditorController, AuthoringState>;
    changeValidation: PropertyChange<EditorController, Map<ElementIri, ElementError[]>>;
    toggleDialog: { isOpened: boolean };
}

export class EditorController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<EditorEvents>();
    readonly events: Events<EditorEvents> = this.source;

    readonly model: AsyncModel;
    private readonly view: DiagramView;
    private readonly options: EditorOptions;

    private _authoringState = AuthoringState.empty;
    private _selection: ReadonlyArray<SelectionItem> = [];

    private _validation = new Map<ElementIri, ElementError[]>();

    private dialogType: DialogTypes;
    private dialogTarget: SelectionItem;

    private readonly cancellation = new Cancellation();

    constructor(props: EditorProps) {
        const {model, view, ...options} = props;
        this.model = model;
        this.view = view;
        this.options = options;

        this.listener.listen(this.events, 'changeAuthoringState', e => {
            console.log('authoringState', this.authoringState);
            this.validate();
        });
    }

    get validation() { return this._validation; }
    setValidation(elementIri: ElementIri, errors: ElementError[]) {
        const previous = this._validation;
        if (errors.length) {
            this._validation.set(elementIri, errors);
        } else {
            this._validation.delete(elementIri);
        }
        this.source.trigger('changeValidation', {source: this, previous});
    }

    private validate() {
        const {validationApi} = this.options;

        if (!validationApi) { return; }

        this.model.elements.forEach(element => {
            const state = this.authoringState.index.elements.get(element.iri);
            const changedLinks = this.model.links.filter(link =>
                link.data.sourceId === element.iri && this.authoringState.index.links.get(link.data)
            );
            if (state || changedLinks.length) {
                validationApi.validateElement(
                    element.data, this.authoringState, this.cancellation.signal
                ).then(errors => this.setValidation(element.iri, errors));
            } else if (this.validation.has(element.iri)) {
                this.setValidation(element.iri, []);
            }
        });

        this.model.links.forEach(({data, sourceId, targetId}) => {
            const event = this.authoringState.index.links.get(data);
            const source = this.model.getElement(sourceId);
            const target = this.model.getElement(targetId);
            if (event && event.type === AuthoringKind.ChangeLink) {
                validationApi.validateLink(data, source.data, target.data, this.cancellation.signal).then(errors => {
                    /* nothing */
                });
            }
        });
    }

    _initializePaperComponents(paperArea: PaperArea) {
        this.listener.listen(paperArea.events, 'pointerUp', e => this.onPaperPointerUp(e));
        this.listener.listen(this.model.events, 'changeCells', () => this.onCellsChanged());
        this.listener.listen(this.model.events, 'elementEvent', e => {
            if (e.key === 'requestedGroupContent') {
                this.loadGroupContent(e.data.requestedGroupContent.source);
            }
        });

        this.listener.listen(this.model.events, 'createLoadedLink', e => {
            const event = this.authoringState.index.links.get(e.model);
            const isDeleted = event && event.type === AuthoringKind.DeleteLink;

            let isChanged = false;
            this.authoringState.index.links.forEach(evt => {
                if (evt.type === AuthoringKind.ChangeLink && evt.before && sameLink(evt.before, e.model)) {
                    isChanged = true;
                }
            });

            if (isDeleted || isChanged) {
                e.cancel();
            }
        });
        this.listener.listen(this.model.events, 'loadingStart', () => this.setSpinner({}));
        this.listener.listen(this.model.events, 'loadingSuccess', () => {
            this.setSpinner(undefined);

            const widget = <StatesWidget editor={this} view={this.view} />;
            this.view.setPaperWidget({key: 'states', widget});
        });
        this.listener.listen(this.model.events, 'loadingError', ({error}) => {
            this.setSpinner({statusText: error.message, errorOccured: true});
        });

        if (!this.options.disableHalo) {
            this.configureHalo();
            document.addEventListener('keyup', this.onKeyUp);
            this.listener.listen(this.view.events, 'dispose', () => {
                document.removeEventListener('keyup', this.onKeyUp);
            });
        }
    }

    get authoringState() { return this._authoringState; }
    setAuthoringState(value: AuthoringState) {
        const previous = this._authoringState;
        if (previous === value) { return; }
        this.model.history.execute(this.updateAuthoringState(value));
    }

    private updateAuthoringState(state: AuthoringState): Command {
        const previous = this._authoringState;
        return Command.create('Create or delete entities and links', () => {
            this._authoringState = state;
            this.source.trigger('changeAuthoringState', {source: this, previous});
            return this.updateAuthoringState(previous);
        });
    }

    get selection() { return this._selection; }
    setSelection(value: ReadonlyArray<SelectionItem>) {
        const previous = this._selection;
        if (previous === value) { return; }
        this._selection = value;
        this.source.trigger('changeSelection', {source: this, previous});
    }

    cancelSelection() {
        this.setSelection([]);
    }

    private onKeyUp = (e: KeyboardEvent) => {
        const DELETE_KEY_CODE = 46;
        if (e.keyCode === DELETE_KEY_CODE &&
            document.activeElement.localName !== 'input'
        ) {
            this.removeSelectedElements();
        }
    }

    removeSelectedElements() {
        const elementsToRemove = this.selection;
        if (elementsToRemove.length === 0) { return; }

        this.cancelSelection();

        const batch = this.model.history.startBatch();
        for (const element of elementsToRemove) {
            this.model.removeElement(element.id);
        }
        batch.store();
    }

    private onPaperPointerUp(event: PointerUpEvent) {
        if (this.options.disableHalo) { return; }
        const {sourceEvent, target, triggerAsClick} = event;

        if (sourceEvent.ctrlKey || sourceEvent.shiftKey || sourceEvent.metaKey) { return; }

        if (target instanceof Element) {
            this.setSelection([target]);
            target.focus();
        } else if (target instanceof Link) {
            this.setSelection([target]);
        } else if (target instanceof LinkVertex) {
            this.setSelection([target.link]);
        } else if (!target && triggerAsClick) {
            this.setSelection([]);
            this.hideDialog();
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
        }
    }

    private onCellsChanged() {
        if (this.selection.length === 0) { return; }
        const newSelection = this.selection.filter(el => this.model.getElement(el.id));
        if (newSelection.length < this.selection.length) {
            this.setSelection(newSelection);
        }
    }

    setSpinner(props: SpinnerProps | undefined) {
        const widget = props ? <LoadingWidget spinnerProps={props} /> : undefined;
        this.view.setPaperWidget({key: LoadingWidget.Key, widget, pinnedToScreen: true});
    }

    private configureHalo() {
        if (this.options.disableHalo) { return; }

        this.listener.listen(this.events, 'changeSelection', () => {
            const selected = this.selection.length === 1 ? this.selection[0] : undefined;
            if (this.dialogTarget && selected !== this.dialogTarget) {
                this.hideDialog();
            }
            this.renderDefaultHalo();
        });

        this.listener.listen(this.events, 'toggleDialog', ({isOpened}) => {
            this.renderDefaultHalo();
        });

        this.renderDefaultHalo();
    }

    private renderDefaultHalo() {
        const selectedElement = this.selection.length === 1 ? this.selection[0] : undefined;

        let halo: React.ReactElement<Halo | HaloLink>;

        if (selectedElement instanceof Element) {
            halo = (
                <Halo editor={this}
                    target={selectedElement}
                    onRemove={() => this.removeSelectedElements()}
                    onExpand={() => {
                        this.model.history.execute(
                            setElementExpanded(selectedElement, !selectedElement.isExpanded)
                        );
                    }}
                    navigationMenuOpened={this.dialogType === DialogTypes.ConnectionsMenu}
                    onToggleNavigationMenu={() => {
                        if (this.dialogTarget && this.dialogType === DialogTypes.ConnectionsMenu) {
                            this.hideDialog();
                        } else {
                            this.showConnectionsMenu(selectedElement);
                        }
                        this.renderDefaultHalo();
                    }}
                    onAddToFilter={() => selectedElement.addToFilter()}
                    onEdit={() => {
                        if (this.options.renderPropertyEditor) {
                            const customPropertyEditor = this.options.renderPropertyEditor({
                                elementData: selectedElement.data,
                                onSubmit: newData => {
                                    this.hideDialog();
                                    this.changeEntityData(newData.id, newData);
                                },
                            });
                            this.showDialog({
                                target: selectedElement, dialogType: DialogTypes.EditEntityForm,
                                content: customPropertyEditor,
                            });
                        } else {
                            this.showEditEntityForm(selectedElement);
                        }
                    }}
                    onDelete={() => this.deleteEntity(selectedElement.iri)}
                    onEstablishNewLink={(point: { x: number; y: number }) =>
                        this.startEditing({target: selectedElement, mode: EditMode.establishNewLink, point})
                    }
                />
            );
        } else if (selectedElement instanceof Link) {
            halo = (
                <HaloLink view={this.view}
                    target={selectedElement}
                    onEdit={() => this.showEditLinkForm(selectedElement)}
                    onRemove={() => this.deleteLink(selectedElement.data)}
                    onSourceMove={(point: { x: number; y: number }) =>
                        this.startEditing({target: selectedElement, mode: EditMode.moveLinkSource, point})
                    }
                    onTargetMove={(point: { x: number; y: number }) =>
                        this.startEditing({target: selectedElement, mode: EditMode.moveLinkTarget, point})
                    }
                />
            );
        }

        this.view.setPaperWidget({key: 'halo', widget: halo});
    }

    showConnectionsMenu(target: Element) {
        const dialogType = DialogTypes.ConnectionsMenu;
        const content = (
            <ConnectionsMenu view={this.view}
                editor={this}
                target={target}
                onClose={() => this.hideDialog()}
                suggestProperties={this.options.suggestProperties}
            />
        );
        this.showDialog({target, dialogType, content});
    }

    showEditEntityForm(target: Element, elementTypes?: ReadonlyArray<ElementTypeIri>) {
        const dialogType = DialogTypes.EditEntityForm;
        const content = (
            <EditEntityForm view={this.view}
                entity={target.data}
                elementTypes={elementTypes}
                onApply={(elementModel: ElementModel) => {
                    this.hideDialog();
                    this.changeEntityData(target.iri, elementModel);
                }}
                onCancel={() => this.hideDialog()}/>
        );
        this.showDialog({target, dialogType, content});
    }

    showEditLinkForm(target: Link) {
        const dialogType = DialogTypes.EditLinkForm;
        const content = (
            <EditLinkForm view={this.view}
                metadataApi={this.options.metadataApi}
                link={target}
                onApply={(newData: LinkModel) => {
                    this.hideDialog();
                    this.changeLinkData(target.data, newData);
                }}
                onCancel={() => this.hideDialog()}/>
        );
        this.showDialog({target, dialogType, content});
    }

    showDialog(params: {
        target: SelectionItem;
        dialogType: DialogTypes;
        content: React.ReactElement<any>;
    }) {
        const {target, dialogType, content} = params;

        this.dialogTarget = target;
        this.dialogType = dialogType;

        const dialog = (
            <Dialog view={this.view} target={target}>{content}</Dialog>
        );
        this.view.setPaperWidget({key: 'dialog', widget: dialog});
        this.source.trigger('toggleDialog', {isOpened: false});
    }

    hideDialog() {
        if (this.dialogTarget) {
            this.dialogType = undefined;
            this.dialogTarget = undefined;
            this.view.setPaperWidget({key: 'dialog', widget: undefined});
            this.source.trigger('toggleDialog', {isOpened: false});
        }
    }

    onDragDrop(e: DragEvent, paperPosition: Vector) {
        e.preventDefault();
        let elementIris: ElementIri[];
        try {
            elementIris = JSON.parse(e.dataTransfer.getData('application/x-ontodia-elements'));
        } catch (ex) {
            try {
                elementIris = JSON.parse(e.dataTransfer.getData('text')); // IE fix
            } catch (ex) {
                const draggedUri = e.dataTransfer.getData('text/uri-list');
                // element dragged from the class tree has URI of the form:
                // <window.location without hash>#<class URI>
                const uriFromTreePrefix = window.location.href.split('#')[0] + '#';
                const uri = draggedUri.indexOf(uriFromTreePrefix) === 0
                    ? draggedUri.substring(uriFromTreePrefix.length) : draggedUri;
                elementIris = [uri as ElementIri];
            }
        }
        if (!elementIris || elementIris.length === 0) { return; }

        const batch = this.model.history.startBatch('Drag and drop onto diagram');
        const placedElements = placeElements(this.model, elementIris, paperPosition);
        batch.history.execute(
            restoreLinksBetweenElements(this.model, elementIris)
        );
        batch.store();

        if (placedElements.length > 0) {
            placedElements[placedElements.length - 1].focus();
        }

        this.setSelection(placedElements);
    }

    private loadGroupContent(element: Element): Promise<void> {
        return this.model.loadEmbeddedElements(element.iri).then(models => {
            const batch = this.model.history.startBatch();
            const elementIris = Object.keys(models) as ElementIri[];
            const elements = elementIris.map(
                key => this.model.createElement(models[key], element.id)
            );
            batch.discard();

            return Promise.all([
                this.model.requestElementData(elementIris),
                this.model.requestLinksOfType(),
            ]).then(() => {
                this.view.performSyncUpdate();
                const grouping = computeGrouping(this.model.elements);
                recursiveForceLayout(this.model, grouping, element.id);
                this.model.triggerChangeGroupContent(element.id);
            });
        });
    }

    createNewEntity(classIri: ElementTypeIri): Element {
        const batch = this.model.history.startBatch('Create new entity');
        const elementModel = {
            // TODO: change IRI generation
            id: `http://ontodia.org/newEntity_${generate64BitID()}` as ElementIri,
            types: [classIri],
            label: {values: [{text: 'New Entity', lang: ''}]},
            properties: {},
        };
        const element = this.model.createElement(elementModel);
        this.setAuthoringState(
            AuthoringState.addElement(this._authoringState, element.data)
        );
        batch.store();
        return element;
    }

    changeEntityData(targetIri: ElementIri, newData: ElementModel) {
        const elements = this.model.elements.filter(el => el.iri === targetIri);
        if (elements.length === 0) {
            return;
        }
        const oldData = elements[0].data;
        const batch = this.model.history.startBatch('Edit entity');
        this.model.history.execute(setElementData(this.model, targetIri, newData));
        this.setAuthoringState(
            AuthoringState.changeElement(this._authoringState, oldData, newData)
        );
        batch.store();
    }

    deleteEntity(elementIri: ElementIri) {
        const state = this.authoringState;
        const elements = this.model.elements.filter(el => el.iri === elementIri);
        if (elements.length === 0) {
            return;
        }

        const batch = this.model.history.startBatch('Delete entity');
        this.setAuthoringState(
            AuthoringState.deleteElement(state, elementIri, this.model)
        );
        if (AuthoringState.isNewElement(state, elementIri)) {
            for (const element of elements) {
                this.model.removeElement(element.id);
            }
        }
        const newConnectedLinks = this.model.links.filter(link => {
            if (!link.data) { return false; }
            const event = state.index.links.get(link.data);
            return event && event.type === AuthoringKind.ChangeLink
                && (!event.before || isSourceOrTargetChanged(event))
                && linkConnectedToElement(event.after, elementIri);
        });
        for (const link of newConnectedLinks) {
            this.model.removeLink(link.id);
        }
        batch.store();
    }

    createNewLink(base: Link): Link {
        const batch = this.model.history.startBatch('Create new link');

        this.model.createLinks(base.data);
        const links = this.model.links.filter(link => sameLink(link.data, base.data));
        if (links.length > 0) {
            this.setAuthoringState(
                AuthoringState.addLink(this._authoringState, base.data)
            );
            batch.store();
        } else {
            batch.discard();
        }

        return links.find(({sourceId, targetId}) => sourceId === base.sourceId && targetId === base.targetId);
    }

    changeLinkData(oldData: LinkModel, newData: LinkModel) {
        const batch = this.model.history.startBatch('Change link');
        if (sameLink(oldData, newData)) {
            this.model.history.execute(setLinkData(this.model, oldData, newData));
        } else {
            this.model.links
                .filter(link => sameLink(link.data, oldData))
                .forEach(link => this.model.removeLink(link.id));
            this.model.createLinks(newData);
        }
        this.setAuthoringState(
            AuthoringState.changeLink(this._authoringState, oldData, newData)
        );
        batch.store();
    }

    moveLinkSource(params: { link: Link; newSource: Element }): Link {
        const {link, newSource} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeLinkData(link.data, {...link.data, sourceId: newSource.iri});
        const newLink = this.model.findLink(link.typeId, newSource.id, link.targetId);
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    moveLinkTarget(params: { link: Link; newTarget: Element }): Link {
        const {link, newTarget} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeLinkData(link.data, {...link.data, targetId: newTarget.iri});
        const newLink = this.model.findLink(link.typeId, link.sourceId, newTarget.id);
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    deleteLink(model: LinkModel) {
        const state = this.authoringState;
        const links = this.model.links.filter(({data}) => sameLink(data, model));
        if (links.length === 0) {
            return;
        }
        const batch = this.model.history.startBatch('Delete link');
        this.setAuthoringState(
            AuthoringState.deleteLink(state, model, this.model)
        );
        if (AuthoringState.isNewLink(state, model)) {
            for (const link of links) {
                this.model.removeLink(link.id);
            }
        } else if (AuthoringState.isMovedLink(state, model)) {
            const event = state.index.links.get(model) as LinkChange;
            this.model.createLinks(event.before);
            for (const link of links) {
                this.model.removeLink(link.id);
            }
        }
        batch.store();
    }

    private startEditing(params: { target: Element | Link; mode: EditMode; point: Vector }) {
        const {target, mode, point} = params;
        const editLayer = (
            <EditLayer view={this.view}
                editor={this}
                metadataApi={this.options.metadataApi}
                mode={mode}
                target={target}
                point={point}
            />
        );
        this.view.setPaperWidget({key: 'editLayer', widget: editLayer});
    }

    finishEditing() {
        this.view.setPaperWidget({key: 'editLayer', widget: undefined});
    }
}

interface LoadingWidgetProps extends PaperWidgetProps {
    spinnerProps: Partial<SpinnerProps>;
}

class LoadingWidget extends React.Component<LoadingWidgetProps, {}> {
    static readonly Key = 'loadingWidget';

    render() {
        const {spinnerProps, paperArea} = this.props;
        const areaMetrics = paperArea.getAreaMetrics();
        const paneWidth = areaMetrics.clientWidth;
        const paneHeight = areaMetrics.clientHeight;

        const x = spinnerProps.statusText ? paneWidth / 3 : paneWidth / 2;
        const position = {x, y: paneHeight / 2};
        return (
            <div className='ontodia-loading-widget'>
                <svg width={paneWidth} height={paneHeight}>
                    <Spinner position={position} {...spinnerProps} />
                </svg>
            </div>
        );
    }
}

function placeElements(
    model: AsyncModel, elementIris: ReadonlyArray<ElementIri>, position: Vector
): Element[] {
    const elements: Element[] = [];
    let totalXOffset = 0;
    const {x, y} = position;
    for (const elementIri of elementIris) {
        const center = elementIris.length === 1;
        const {element, size} = createElementAt(
            model, elementIri, {x: x + totalXOffset, y, center}
        );
        elements.push(element);
        totalXOffset += size.width + 20;
    }
    return elements;
}

function createElementAt(
    model: AsyncModel,
    elementIri: ElementIri,
    position: { x: number; y: number; center?: boolean; },
) {
    const element = model.createElement(elementIri);

    let {x, y} = position;
    let {width, height} = boundsOf(element);
    if (width === 0) { width = 100; }
    if (height === 0) { height = 50; }

    if (position.center) {
        x -= width / 2;
        y -= height / 2;
    }
    element.setPosition({x, y});

    return {element, size: {width, height}};
}

export function recursiveForceLayout(model: DiagramModel, grouping: Map<string, Element[]>, group?: string) {
    const elements = group
        ? grouping.get(group)
        : model.elements.filter(el => el.group === undefined);

    for (const element of elements) {
        if (grouping.has(element.id)) {
            recursiveForceLayout(model, grouping, element.id);
        }
    }

    const nodes: LayoutNode[] = [];
    const nodeById: { [id: string]: LayoutNode } = {};
    for (const element of elements) {
        const {x, y, width, height} = boundsOf(element);
        const node: LayoutNode = {id: element.id, x, y, width, height};
        nodeById[element.id] = node;
        nodes.push(node);
    }

    const links: LayoutLink[] = [];
    for (const link of model.links) {
        if (!model.isSourceAndTargetVisible(link)) {
            continue;
        }
        const source = model.sourceOf(link);
        const target = model.targetOf(link);

        const sourceNode = nodeById[source.id];
        const targetNode = nodeById[target.id];

        if (sourceNode && targetNode) {
            links.push({source: sourceNode, target: targetNode});
        }
    }

    forceLayout({nodes, links, preferredLinkLength: 200});
    padded(nodes, {x: 10, y: 10}, () => removeOverlaps(nodes));

    const padding: Vector = group ? getContentFittingBox(elements, []) : {x: 150, y: 150};
    translateToPositiveQuadrant({nodes, padding});

    for (const node of nodes) {
        const element = model.getElement(node.id);
        element.setPosition({x: node.x, y: node.y});
    }
}
