import * as React from 'react';

import { ElementTypeIri, ElementIri, ElementModel, LinkModel } from '../data/model';

import { setElementExpanded } from '../diagram/commands';
import { Element, Link, LinkVertex } from '../diagram/elements';
import { Vector, Size, boundsOf, computeGrouping } from '../diagram/geometry';
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

import {
    LayoutNode, LayoutLink, forceLayout, padded, removeOverlaps, translateToPositiveQuadrant,
} from '../viewUtils/layout';
import { Spinner, Props as SpinnerProps } from '../viewUtils/spinner';

import { AsyncModel, restoreLinksBetweenElements } from './asyncModel';

export enum DialogTypes {
    ConnectionsMenu,
    EditEntityForm,
    EditLinkForm,
}

type SelectedElement = Element | Link;

export interface EditorOptions {
    disableDefaultHalo?: boolean;
    suggestProperties?: PropertySuggestionHandler;
}

export interface EditorEvents {
    changeSelection: PropertyChange<EditorController, ReadonlyArray<SelectedElement>>;
    toggleDialog: { isOpened: boolean };
    establishLink: { sourceId: string; point: { x: number; y: number } };
    moveLinkSource: { link: Link; point: { x: number; y: number } };
    moveLinkTarget: { link: Link; point: { x: number; y: number } };
}

export class EditorController {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<EditorEvents>();
    readonly events: Events<EditorEvents> = this.source;

    private _selection: ReadonlyArray<SelectedElement> = [];

    private dialogType: DialogTypes;
    private dialogTarget: SelectedElement;

    constructor(
        readonly model: AsyncModel,
        private view: DiagramView,
        private options: EditorOptions,
    ) {}

    _initializePaperComponents(paperArea: PaperArea) {
        this.listener.listen(paperArea.events, 'pointerUp', e => this.onPaperPointerUp(e));
        this.listener.listen(this.model.events, 'changeCells', () => this.onCellsChanged());
        this.listener.listen(this.model.events, 'elementEvent', e => {
            if (e.key === 'requestedGroupContent') {
                this.loadGroupContent(e.data.requestedGroupContent.source);
            }
        });

        this.listener.listen(this.model.events, 'loadingStart', () => this.setSpinner({}));
        this.listener.listen(this.model.events, 'loadingSuccess', () => this.setSpinner(undefined));
        this.listener.listen(this.model.events, 'loadingError', ({error}) => {
            this.setSpinner({statusText: error.message, errorOccured: true});
        });

        if (!this.options.disableDefaultHalo) {
            this.configureHalo();
            document.addEventListener('keyup', this.onKeyUp);
            this.listener.listen(this.view.events, 'dispose', () => {
                document.removeEventListener('keyup', this.onKeyUp);
            });
        }
    }

    get selection() { return this._selection; }
    setSelection(value: ReadonlyArray<SelectedElement>) {
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
        if (this.options.disableDefaultHalo) { return; }
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
        this.view.setPaperWidget({key: LoadingWidget.Key, widget});
    }

    private configureHalo() {
        if (this.options.disableDefaultHalo) { return; }

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
                    onDelete={() => this.removeSelectedElements()}
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
                            this.showDialog(selectedElement, DialogTypes.ConnectionsMenu);
                        }
                        this.renderDefaultHalo();
                    }}
                    onAddToFilter={() => selectedElement.addToFilter()}
                    onEdit={() => this.showDialog(selectedElement, DialogTypes.EditEntityForm)}
                    onEstablishNewLink={(point: { x: number; y: number }) => {
                        this.source.trigger('establishLink', {sourceId: selectedElement.id, point});
                    }}
                />
            );
        } else if (selectedElement instanceof Link) {
            halo = (
                <HaloLink view={this.view}
                    target={selectedElement}
                    onEdit={() => this.showDialog(selectedElement, DialogTypes.EditLinkForm)}
                    onRemove={() => this.model.removeLink(selectedElement.id)}
                    onSourceMove={(point: { x: number; y: number }) => {
                        this.source.trigger('moveLinkSource', {link: selectedElement, point});
                    }}
                    onTargetMove={(point: { x: number; y: number }) => {
                        this.source.trigger('moveLinkTarget', {link: selectedElement, point});
                    }}
                />
            );
        }

        this.view.setPaperWidget({key: 'halo', widget: halo});
    }

    showDialog(target: SelectedElement, dialogType: DialogTypes) {
        if ((this.dialogTarget && this.dialogTarget.id !== target.id) ||
            (this.dialogType && this.dialogType !== dialogType)) {
            this.hideDialog();
        }

        let content: React.ReactElement<any>;

        if (dialogType === DialogTypes.ConnectionsMenu && target instanceof Element) {
            content = (
                <ConnectionsMenu view={this.view}
                    editor={this}
                    target={target}
                    onClose={() => this.hideDialog()}
                    suggestProperties={this.options.suggestProperties}
                />
            );
        } else if (dialogType === DialogTypes.EditEntityForm && target instanceof Element) {
            content = React.createElement(EditEntityForm, {
                view: this.view,
                entity: target.data,
                onApply: (entity: ElementModel) => {
                    this.model.editEntity(entity);
                    this.hideDialog();
                },
                onCancel: () => this.hideDialog(),
            });
        } else if (dialogType === DialogTypes.EditLinkForm && target instanceof Link) {
            content = React.createElement(EditLinkForm, {
                view: this.view,
                link: target.data,
                onApply: (link: LinkModel) => {
                    this.hideDialog();
                },
                onCancel: () => this.hideDialog(),
            });
        } else {
            throw new Error('Unknown dialog type');
        }

        const dialog = (
            <Dialog view={this.view} target={target}>{content}</Dialog>
        );
        this.dialogTarget = target;
        this.dialogType = dialogType;
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

    createNewEntity(classIri?: ElementTypeIri): Element {
        const element = this.model.createNewEntity(classIri);
        this.setSelection([element]);
        this.showDialog(element, DialogTypes.EditEntityForm);

        return element;
    }
}

interface LoadingWidgetProps extends PaperWidgetProps {
    spinnerProps: Partial<SpinnerProps>;
}

class LoadingWidget extends React.Component<LoadingWidgetProps, {}> {
    static readonly Key = 'loadingWidget';

    render() {
        const {spinnerProps, paperArea} = this.props;

        const paperSize = paperArea.getPaperSize();
        const paneStart = paperArea.paperToScrollablePaneCoords(0, 0);
        const paneEnd = paperArea.paperToScrollablePaneCoords(paperSize.width, paperSize.height);
        const paneWidth = paneEnd.x - paneStart.x;
        const paneHeight = paneEnd.y - paneStart.y;

        const x = spinnerProps.statusText ? paneWidth / 3 : paneWidth / 2;
        const position = {x, y: paneHeight / 2};
        return (
            <svg width={paneWidth} height={paneHeight}>
                <Spinner position={position} {...spinnerProps} />
            </svg>
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
