import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';
import { ElementModel, LinkModel, ElementIri, ElementTypeIri, sameLink } from '../data/model';
import { GenerateID } from '../data/schema';

import { setElementExpanded, setElementData, setLinkData, changeLinkTypeVisibility } from '../diagram/commands';
import { Element, Link, LinkVertex, FatLinkType } from '../diagram/elements';
import { Vector, boundsOf } from '../diagram/geometry';
import { Command } from '../diagram/history';
import { DiagramModel } from '../diagram/model';
import { PaperArea, PointerUpEvent, PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';

import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';

import { Dialog } from '../widgets/dialog';
import { ConnectionsMenu, PropertySuggestionHandler } from '../widgets/connectionsMenu';
import { EditEntityForm } from '../widgets/editEntityForm';
import { EditElementTypeForm } from '../widgets/editElementTypeForm';
import { EditLinkForm } from '../widgets/editLinkForm';
import { Halo } from '../widgets/halo';
import { HaloLink } from '../widgets/haloLink';
import { StatesWidget } from './statesWidget';

import {
    forceLayout, padded, removeOverlaps, recursiveLayout, placeElementsAround,
} from '../viewUtils/layout';
import { Spinner, Props as SpinnerProps } from '../viewUtils/spinner';

import { AsyncModel, restoreLinksBetweenElements } from './asyncModel';
import {
    AuthoringState, AuthoringKind, ValidationState,
    isLinkConnectedToElement, TemporaryState, AuthoringEvent,
} from './authoringState';
import { EditLayer, EditLayerMode, isPlaceholderElementType, isPlaceholderLinkType } from './editLayer';

import { Cancellation } from '../viewUtils/async';

export interface PropertyEditorOptions {
    elementData: ElementModel;
    onSubmit: (newData: ElementModel) => void;
}
export type PropertyEditor = (options: PropertyEditorOptions) => React.ReactElement<any>;

export enum DialogTypes {
    ConnectionsMenu,
    EditEntityForm,
    EditLinkForm,
    EditEntityTypeForm,
}

export type SelectionItem = Element | Link;

export interface EditorProps extends EditorOptions {
    model: AsyncModel;
    view: DiagramView;
}

export interface EditorOptions {
    disableHalo?: boolean;
    suggestProperties?: PropertySuggestionHandler;
    validationApi?: ValidationApi;
    propertyEditor?: PropertyEditor;
}

export interface EditorEvents {
    changeMode: { source: EditorController };
    changeSelection: PropertyChange<EditorController, ReadonlyArray<SelectionItem>>;
    changeAuthoringState: PropertyChange<EditorController, AuthoringState>;
    changeValidationState: PropertyChange<EditorController, ValidationState>;
    changeTemporaryState: PropertyChange<EditorController, TemporaryState>;
    toggleDialog: { isOpened: boolean };
    addElements: { elements: ReadonlyArray<Element> };
}

export class EditorController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<EditorEvents>();
    readonly events: Events<EditorEvents> = this.source;

    readonly model: AsyncModel;
    private readonly view: DiagramView;
    private readonly options: EditorOptions;

    private _metadataApi: MetadataApi | undefined;
    private _authoringState = AuthoringState.empty;
    private _validationState = ValidationState.empty;
    private _temporaryState = TemporaryState.empty;
    private _selection: ReadonlyArray<SelectionItem> = [];

    private dialogType: DialogTypes;
    private dialogTarget: SelectionItem;

    private readonly cancellation = new Cancellation();

    constructor(props: EditorProps) {
        const {model, view, ...options} = props;
        this.model = model;
        this.view = view;
        this.options = options;

        this.listener.listen(this.events, 'changeValidationState', e => {
            for (const element of this.model.elements) {
                const previous = e.previous.elements.get(element.iri);
                const current = this.validationState.elements.get(element.iri);
                if (current !== previous) {
                    element.redraw();
                }
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

        this.listener.listen(this.model.events, 'loadingStart', () => this.setSpinner({}));
        this.listener.listen(this.model.events, 'loadingSuccess', () => {
            this.setSpinner(undefined);

            const widget = <StatesWidget editor={this} view={this.view} />;
            this.view.setPaperWidget({key: 'states', widget});
        });
        this.listener.listen(this.model.events, 'loadingError', ({error}) => {
            const statusText = error ? error.message : undefined;
            this.setSpinner({statusText, errorOccured: true});
        });

        if (!this.options.disableHalo) {
            this.configureHalo();
            document.addEventListener('keyup', this.onKeyUp);
            this.listener.listen(this.view.events, 'dispose', () => {
                document.removeEventListener('keyup', this.onKeyUp);
            });
        }
    }

    get inAuthoringMode(): boolean {
        return Boolean(this._metadataApi);
    }

    get metadataApi() { return this._metadataApi; }
    setMetadataApi(value: MetadataApi) {
        const previous = this._metadataApi;
        if (value === previous) { return; }
        this._metadataApi = value;
        if (Boolean(value) !== Boolean(previous)) {
            // authoring mode changed
            this.source.trigger('changeMode', {source: this});
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

    get validationState() { return this._validationState; }
    setValidationState(value: ValidationState) {
        const previous = this._validationState;
        if (value === previous) { return; }
        this._validationState = value;
        this.source.trigger('changeValidationState', {source: this, previous});
    }

    get temporaryState() { return this._temporaryState; }
    setTemporaryState(value: TemporaryState) {
        const previous = this._temporaryState;
        if (value === previous) { return; }
        this._temporaryState = value;
        this.source.trigger('changeTemporaryState', {source: this, previous});
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
        const itemsToRemove = this.selection;
        if (itemsToRemove.length === 0) { return; }

        this.cancelSelection();
        this.removeItems(itemsToRemove);
    }

    removeItems(items: ReadonlyArray<SelectionItem>) {
        const state = this.authoringState;
        const batch = this.model.history.startBatch();
        for (const item of items) {
            if (item instanceof Element) {
                if (AuthoringState.isNewElement(state, item.iri)) {
                    this.deleteEntity(item.iri);
                } else {
                    this.model.removeElement(item.id);
                }
            } else if (item instanceof Link) {
                if (AuthoringState.isNewLink(state, item.data)) {
                    this.deleteLink(item.data);
                }
            }
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
        const selected = this.selection.length === 1 ? this.selection[0] : undefined;

        let halo: React.ReactElement<Halo | HaloLink>;

        if (selected instanceof Element) {
            halo = (
                <Halo editor={this}
                    metadataApi={this.metadataApi}
                    target={selected}
                    onRemove={() => this.removeSelectedElements()}
                    onExpand={() => {
                        this.model.history.execute(
                            setElementExpanded(selected, !selected.isExpanded)
                        );
                    }}
                    navigationMenuOpened={this.dialogType === DialogTypes.ConnectionsMenu}
                    onToggleNavigationMenu={() => {
                        if (this.dialogTarget && this.dialogType === DialogTypes.ConnectionsMenu) {
                            this.hideDialog();
                        } else {
                            this.showConnectionsMenu(selected);
                        }
                        this.renderDefaultHalo();
                    }}
                    onAddToFilter={() => selected.addToFilter()}
                    onEstablishNewLink={(point: { x: number; y: number }) =>
                        this.startEditing({target: selected, mode: EditLayerMode.establishLink, point})
                    }
                    onFolowLink={(element, e) => this.view.onIriClick(element.iri, element, e)}
                />
            );
        } else if (selected instanceof Link && this.inAuthoringMode) {
            halo = (
                <HaloLink view={this.view}
                    editor={this}
                    metadataApi={this.metadataApi}
                    target={selected}
                    onEdit={() => this.showEditLinkForm(selected)}
                    onDelete={() => this.deleteLink(selected.data)}
                    onRevert={() => {
                        const deletion = this.authoringState.index.links.get(selected.data);
                        if (deletion && deletion.type === AuthoringKind.DeleteLink) {
                            this.discardChange(deletion);
                        }
                    }}
                    onSourceMove={(point: { x: number; y: number }) =>
                        this.startEditing({target: selected, mode: EditLayerMode.moveLinkSource, point})
                    }
                    onTargetMove={(point: { x: number; y: number }) =>
                        this.startEditing({target: selected, mode: EditLayerMode.moveLinkTarget, point})
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
                onAddElements={(iris, linkType) =>
                    this.onAddElementsInConnectionMenu(iris, target, linkType)}
                onClose={() => this.hideDialog()}
                suggestProperties={this.options.suggestProperties}
            />
        );
        this.showDialog({target, dialogType, content});
    }

    showEditEntityForm(target: Element) {
        const {propertyEditor} = this.options;
        const dialogType = DialogTypes.EditEntityForm;
        const onSubmit = (newData: ElementModel) => {
            this.hideDialog();
            this.changeEntityData(newData.id, newData);
        };
        const content = propertyEditor ? propertyEditor({elementData: target.data, onSubmit}) : (
            <EditEntityForm view={this.view} entity={target.data} onApply={onSubmit}
                onCancel={() => this.hideDialog()} />
        );
        this.showDialog({target, dialogType, content});
    }

    showEditElementTypeForm(params: {
        link: Link;
        source: Element;
        target: Element;
    }) {
        const {link, source, target} = params;
        const dialogType = DialogTypes.EditEntityTypeForm;
        const content = (
            <EditElementTypeForm view={this.view}
                metadataApi={this.metadataApi}
                link={link.data}
                source={source.data}
                target={target.data}
                onApply={(elementData: ElementModel, linkData: LinkModel) => {
                    if (this.temporaryState.elements.has(target.iri)) {
                        target.setData(elementData);
                        this.setTemporaryState(
                            TemporaryState.deleteElement(this.temporaryState, target.data)
                        );
                        this.addNewEntity(target.data);
                    } else {
                        this.changeEntityData(target.iri, elementData);
                    }
                    if (this.temporaryState.links.has(link.data)) {
                        this.removeTemporaryLink(link);
                        this.createNewLink(new Link({
                            typeId: linkData.linkTypeId,
                            sourceId: link.sourceId,
                            targetId: link.targetId,
                            data: linkData,
                        }));
                    } else {
                        this.changeLink(link.data, linkData);
                    }
                    this.hideDialog();
                    this.showEditEntityForm(target);
                }}
                onCancel={() => {
                    if (this.temporaryState.elements.has(target.iri)) {
                        this.removeTemporaryElement(target);
                    }
                    if (this.temporaryState.links.has(link.data)) {
                        this.removeTemporaryLink(link);
                    }
                    this.hideDialog();
                }}/>
        );
        this.showDialog({target, dialogType, content});
    }

    showEditLinkForm(target: Link) {
        const dialogType = DialogTypes.EditLinkForm;
        const content = (
            <EditLinkForm view={this.view}
                metadataApi={this.metadataApi}
                link={target}
                onApply={(data: LinkModel) => {
                    if (this.temporaryState.links.has(target.data)) {
                        this.removeTemporaryLink(target);
                        this.createNewLink(new Link({
                            typeId: data.linkTypeId,
                            sourceId: target.sourceId,
                            targetId: target.targetId,
                            data,
                        }));
                    } else {
                        this.changeLink(target.data, data);
                    }
                    this.hideDialog();
                }}
                onCancel={() => {
                    if (this.temporaryState.links.has(target.data)) {
                        this.removeTemporaryLink(target);
                    }
                    this.hideDialog();
                }}/>
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
            const isTemporaryElement =
                this.dialogTarget instanceof Element && this.temporaryState.elements.has(this.dialogTarget.iri);
            const isTemporaryLink =
                this.dialogTarget instanceof Link && this.temporaryState.links.has(this.dialogTarget.data);
            if (isTemporaryElement || isTemporaryLink) {
                this.resetTemporaryState();
            }
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
        const placedElements = placeElements(this.view, elementIris, paperPosition);
        batch.history.execute(
            restoreLinksBetweenElements(this.model, elementIris)
        );
        batch.store();

        if (placedElements.length > 0) {
            placedElements[placedElements.length - 1].focus();
        }

        this.setSelection(placedElements);

        this.source.trigger('addElements', { elements: placedElements });
    }

    onAddElementsInConnectionMenu(
        elementIris: ElementIri[],
        targetElement: Element,
        linkType: FatLinkType | undefined,
    ) {
        const batch = this.view.model.history.startBatch();

        const elements = elementIris.map(iri => this.model.createElement(iri));
        this.view.performSyncUpdate();

        placeElementsAround({
            model: this.model,
            elements,
            targetElement,
            prefferedLinksLength: 300,
        }).then(() => {
            this.source.trigger('addElements', { elements });
        });

        if (linkType && !linkType.visible) {
            batch.history.execute(changeLinkTypeVisibility({
                linkType,
                visible: true,
                showLabel: true,
                preventLoading: true,
            }));
        }

        batch.history.execute(
            restoreLinksBetweenElements(this.model, elementIris)
        );
        batch.store();
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
                recursiveForceLayout({
                    model: this.model,
                    group: element.id,
                });
                this.model.triggerChangeGroupContent(element.id);
            });
        });
    }

    createNewEntity(classIri: ElementTypeIri): Element {
        const batch = this.model.history.startBatch('Create new entity');
        const elementModel = {
            id: GenerateID.forNewEntity(),
            types: [classIri],
            label: {values: [{text: 'New Entity', lang: ''}]},
            properties: {},
        };

        const element = this.model.createElement(elementModel);
        element.setExpanded(true);

        if (isPlaceholderElementType(classIri)) {
            this.setTemporaryState(
                TemporaryState.addElement(this.temporaryState, element.data)
            );
            batch.discard();
        } else {
            this.setAuthoringState(
                AuthoringState.addElement(this._authoringState, element.data)
            );
            batch.store();
        }
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
        const model = elements[0].data;

        const event = state.index.elements.get(elementIri);
        if (event && event.type === AuthoringKind.ChangeElement) {
            if (event.before) {
                // restore initial data
                this.model.history.execute(
                    setElementData(this.model, elementIri, event.before)
                );
            } else {
                // delete newly created entity
                for (const element of elements) {
                    this.model.removeElement(element.id);
                }
            }
        }

        const newlyConnectedLinks = this.model.links.filter(link => {
            if (!link.data) { return false; }
            return isLinkConnectedToElement(link.data, elementIri)
                && AuthoringState.isNewLink(state, link.data);
        });
        for (const link of newlyConnectedLinks) {
            this.model.removeLink(link.id);
        }

        this.setAuthoringState(AuthoringState.deleteElement(state, model));
        batch.store();
    }

    createNewLink(base: Link): Link {
        const batch = this.model.history.startBatch('Create new link');

        this.model.createLinks(base.data);
        const links = this.model.links.filter(link => sameLink(link.data, base.data));
        if (links.length > 0) {
            if (isPlaceholderLinkType(base.typeId)) {
                this.setTemporaryState(
                    TemporaryState.addLink(this.temporaryState, base.data)
                );
                batch.discard();
            } else {
                this.setAuthoringState(
                    AuthoringState.addLink(this._authoringState, base.data)
                );
                batch.store();
            }
        } else {
            batch.discard();
        }

        return links.find(({sourceId, targetId}) => sourceId === base.sourceId && targetId === base.targetId);
    }

    changeLink(oldData: LinkModel, newData: LinkModel) {
        const batch = this.model.history.startBatch('Change link');
        if (sameLink(oldData, newData)) {
            this.model.history.execute(setLinkData(this.model, oldData, newData));
            this.setAuthoringState(
                AuthoringState.changeLink(this._authoringState, oldData, newData)
            );
        } else {
            let newState = this._authoringState;
            newState = AuthoringState.deleteLink(newState, oldData);
            newState = AuthoringState.addLink(newState, newData);

            if (AuthoringState.isNewLink(this._authoringState, oldData)) {
                this.model.links
                    .filter(link => sameLink(link.data, oldData))
                    .forEach(link => this.model.removeLink(link.id));
            }
            this.model.createLinks(newData);
            this.setAuthoringState(newState);
        }
        batch.store();
    }

    moveLinkSource(params: { link: Link; newSource: Element }): Link {
        const {link, newSource} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeLink(link.data, {...link.data, sourceId: newSource.iri});
        const newLink = this.model.findLink(link.typeId, newSource.id, link.targetId);
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    moveLinkTarget(params: { link: Link; newTarget: Element }): Link {
        const {link, newTarget} = params;
        const batch = this.model.history.startBatch('Move link to another element');
        this.changeLink(link.data, {...link.data, targetId: newTarget.iri});
        const newLink = this.model.findLink(link.typeId, link.sourceId, newTarget.id);
        newLink.setVertices(link.vertices);
        batch.store();
        return newLink;
    }

    deleteLink(model: LinkModel) {
        const state = this.authoringState;
        const event = state.index.links.get(model);
        if (event && event.type === AuthoringKind.DeleteLink) {
            return;
        }
        const batch = this.model.history.startBatch('Delete link');
        const newState = AuthoringState.deleteLink(state, model);
        if (AuthoringState.isNewLink(state, model)) {
            this.model.links
                .filter(({data}) => sameLink(data, model))
                .forEach(link => this.model.removeLink(link.id));
        }
        this.setAuthoringState(newState);
        batch.store();
    }

    private startEditing(params: { target: Element | Link; mode: EditLayerMode; point: Vector }) {
        const {target, mode, point} = params;
        const editLayer = (
            <EditLayer view={this.view}
                editor={this}
                metadataApi={this.metadataApi}
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

    private validateChangedSince(previousAuthoring: AuthoringState) {
        const {validationApi} = this.options;
        if (!validationApi) { return; }

        const previousValidation = this.validationState;
        const currentAuthoring = this.authoringState;

        const newState = ValidationState.createMutable();
        const hasChangedLinks = new Set<ElementIri>();

        for (const {data} of this.model.links) {
            const current = currentAuthoring.index.links.get(data);
            const previous = previousAuthoring.index.links.get(data);
            const state = previousValidation.links.get(data);

            if (current !== previous) {
                hasChangedLinks.add(data.sourceId);
                newState.links.set(data, {...ValidationState.emptyLink, ...state, loading: true});
            } else if (state) {
                newState.links.set(data, state);
            }
        }

        for (const element of this.model.elements) {
            if (newState.elements.has(element.iri)) { continue; }
            const current = currentAuthoring.index.elements.get(element.iri);
            const previous = previousAuthoring.index.elements.get(element.iri);
            const state = previousValidation.elements.get(element.iri);

            if (hasChangedLinks.has(element.iri) || current !== previous) {
                const loadingState = {...ValidationState.emptyElement, ...state, loading: true};
                newState.elements.set(element.iri, loadingState);

                validationApi.validateElement(
                    element.data,
                    currentAuthoring,
                    this.cancellation.signal
                ).then(loadedErrors => {
                    const stateAfterLoad = this.validationState.elements.get(element.iri);
                    if (stateAfterLoad !== loadingState) { return; }
                    const validation = ValidationState.setElementErrors(
                        this.validationState,
                        element.iri,
                        loadedErrors,
                    );
                    this.setValidationState(validation);
                });
            } else if (state) {
                newState.elements.set(element.iri, state);
            }
        }

        this.setValidationState(newState);
    }

    private addNewEntity(element: ElementModel) {
        const batch = this.model.history.startBatch('Create new entity');
        this.setAuthoringState(
            AuthoringState.addElement(this._authoringState, element)
        );
        batch.store();
    }

    private resetTemporaryState() {
        if (this.temporaryState.elements.size) {
            this.model.elements.forEach(element => {
                if (this.temporaryState.elements.has(element.iri)) {
                    this.removeTemporaryElement(element);
                }
            });
        }
        if (this.temporaryState.links.size) {
            this.model.links.forEach(link => {
                if (this.temporaryState.links.get(link.data)) {
                    this.removeTemporaryLink(link);
                }
            });
        }
    }

    private removeTemporaryElement(element: Element) {
        this.model.removeElement(element.id);
        this.setTemporaryState(
            TemporaryState.deleteElement(this.temporaryState, element.data)
        );
    }

    private removeTemporaryLink(link: Link) {
        this.model.removeLink(link.id);
        this.setTemporaryState(
            TemporaryState.deleteLink(this.temporaryState, link.data)
        );
    }

    discardChange(event: AuthoringEvent) {
        const newState = AuthoringState.discard(this._authoringState, event);
        if (newState === this._authoringState) { return; }

        const batch = this.model.history.startBatch('Discard change');
        if (event.type === AuthoringKind.ChangeElement) {
            if (event.before) {
                this.model.history.execute(
                    setElementData(this.model, event.after.id, event.before)
                );
            } else {
                this.model.elements
                    .filter(el => el.iri === event.after.id)
                    .forEach(el => this.model.removeElement(el.id));
            }
        } else if (event.type === AuthoringKind.ChangeLink) {
            if (event.before) {
                this.model.history.execute(
                    setLinkData(this.model, event.after, event.before)
                );
            } else {
                this.model.links
                    .filter(({data}) => sameLink(data, event.after))
                    .forEach(link => this.model.removeLink(link.id));
            }
        }
        this.setAuthoringState(newState);
        batch.store();
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
    view: DiagramView, elementIris: ReadonlyArray<ElementIri>, position: Vector
): Element[] {
    const elements = elementIris.map(iri => view.model.createElement(iri));
    view.performSyncUpdate();

    let {x, y} = position;
    let isFirst = true;
    for (const element of elements) {
        let {width, height} = boundsOf(element);
        if (width === 0) { width = 100; }
        if (height === 0) { height = 50; }

        if (isFirst) {
            isFirst = false;
            x -= width / 2;
            y -= height / 2;
        }

        element.setPosition({x, y});
        y += height + 20;
    }

    return elements;
}

export function recursiveForceLayout(params: {
    model: DiagramModel;
    fixedElementIds?: ReadonlySet<string>;
    group?: string;
}) {
    const {model, group, fixedElementIds} = params;
    recursiveLayout({
        model,
        group,
        fixedElementIds,
        layoutFunction: (nodes, links) => {
            if (fixedElementIds && fixedElementIds.size > 0) {
                padded(nodes, {x: 50, y: 50}, () => forceLayout({
                    nodes, links, preferredLinkLength: 200,
                    avoidOvelaps: true,
                }));
            } else {
                forceLayout({nodes, links, preferredLinkLength: 200});
                padded(nodes, {x: 50, y: 50}, () => removeOverlaps(nodes));
            }
        },
    });
}
