import * as React from 'react';

import { ElementIri, ElementTypeIri } from '../data/model';

import { Element } from '../diagram/elements';
import { Vector } from '../diagram/geometry';
import { DiagramView, DropOnPaperEvent } from '../diagram/view';
import { PaperArea, ZoomOptions } from '../diagram/paperArea';
import { formatLocalizedLabel } from '../diagram/model';

import { ClassTree } from '../widgets/classTree';
import { InstancesSearch, SearchCriteria } from '../widgets/instancesSearch';
import { LinkTypesToolbox } from '../widgets/linksToolbox';

import { AsyncModel } from '../editor/asyncModel';
import { EditorController } from '../editor/editorController';

import {
    WorkspaceContextWrapper, WorkspaceContext, WorkspaceContextTypes, WorkspaceEventHandler, WorkspaceEventKey,
} from './workspaceContext';

import { ResizableSidebar, DockSide } from './resizableSidebar';
import { Accordion } from './accordion';
import { AccordionItem } from './accordionItem';

import { MetadataApi } from '../data/metadataApi';
import { Cancellation } from '../viewUtils/async';

export interface WorkspaceMarkupProps {
    toolbar: React.ReactElement<any>;
    model: AsyncModel;
    view: DiagramView;
    editor: EditorController;
    metadataApi?: MetadataApi;
    hidePanels?: boolean;
    hideToolbar?: boolean;
    hideScrollBars?: boolean;
    searchCriteria?: SearchCriteria;
    onSearchCriteriaChanged: (criteria: SearchCriteria) => void;
    zoomOptions?: ZoomOptions;
    onZoom?: (scaleX: number, scaleY: number) => void;
    isLeftPanelOpen?: boolean;
    onToggleLeftPanel?: (toggle: boolean) => void;
    isRightPanelOpen?: boolean;
    onToggleRightPanel?: (toggle: boolean) => void;
    onWorkspaceEvent?: WorkspaceEventHandler;
    watermarkSvg?: string;
    watermarkUrl?: string;
    elementsSearchPanel?: React.ReactElement<any>;
}

export class WorkspaceMarkup extends React.Component<WorkspaceMarkupProps, {}> {
    static childContextTypes = WorkspaceContextTypes;

    element: HTMLElement;
    classTreePanel: HTMLElement;
    linkTypesPanel: HTMLElement;
    paperArea: PaperArea;

    private untilMouseUpClasses: string[] = [];
    private readonly cancellation = new Cancellation();

    getChildContext(): WorkspaceContextWrapper {
        const {editor} = this.props;
        const ontodiaWorkspace: WorkspaceContext = {editor, triggerWorkspaceEvent: this.triggerWorkspaceEvent};
        return {ontodiaWorkspace};
    }

    private triggerWorkspaceEvent = (key: WorkspaceEventKey) => {
        const {onWorkspaceEvent} = this.props;
        if (onWorkspaceEvent) {
            onWorkspaceEvent(key);
        }
    }

    private renderToolbar = () => {
        const {hideToolbar, toolbar} = this.props;

        if (hideToolbar) { return null; }

        return <div className='ontodia__header'>{toolbar}</div>;
    }

    private onCreateInstance = async (classId: ElementTypeIri, position: Vector) => {
        const {editor} = this.props;
        await forceNonReactExecutionContext();
        const batch = this.props.model.history.startBatch();

        const type = this.props.editor.model.getClass(classId);
        const typeName = formatLocalizedLabel(classId, type.label, this.props.view.getLanguage());

        const types = [classId];
        const signal = this.cancellation.signal;

        const newEntityIri = await this.props.metadataApi.generateNewElementIri(types, signal);
        if (signal.aborted) { return; }
        const elementModel = {
            id: newEntityIri,
            types,
            label: {values: [{text: `New ${typeName}`, lang: ''}]},
            properties: {},
        };
        const element = editor.createNewEntity({elementModel});
        this.props.view.performSyncUpdate();
        const targetPosition = position || getViewportCenterInPaperCoords(this.paperArea);
        centerElementToPosition(element, targetPosition);

        batch.store();
        editor.setSelection([element]);
        editor.showEditEntityForm(element);
    }

    private renderLeftPanel = () => {
        const {hidePanels, editor, searchCriteria = {}} = this.props;
        if (hidePanels) {
            return null;
        }

        const items: Array<React.ReactElement<any>> = [];
        items.push(
            <AccordionItem key='classTree' heading='Classes'>
                <ClassTree view={this.props.view}
                    editor={this.props.editor}
                    onClassSelected={classId => {
                        const elementType = this.props.model.createClass(classId);
                        this.props.onSearchCriteriaChanged({elementType});
                    }}
                    onCreateInstance={this.onCreateInstance}
                />
            </AccordionItem>
        );
        items.push(
            <AccordionItem key='instancesSearch' heading='Instances'>
                <InstancesSearch view={this.props.view}
                    model={this.props.model}
                    criteria={searchCriteria}
                    onCriteriaChanged={this.props.onSearchCriteriaChanged}
                />
            </AccordionItem>
        );

        return (
            <ResizableSidebar dockSide={DockSide.Left}
                isOpen={this.props.isLeftPanelOpen}
                onOpenOrClose={this.props.onToggleLeftPanel}
                onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    horizontalResizing: true,
                })}>
                {/* Use different key to update when switching mode */}
                <Accordion key={`accordion--${editor.inAuthoringMode ? 'exploring' : 'authoring'}`}
                    onStartResize={() => this.untilMouseUp({
                        preventTextSelection: true,
                        verticalResizing: true,
                    })}>
                    {items}
                </Accordion>
            </ResizableSidebar>
        );
    }

    private renderRightPanel = () => {
        if (this.props.hidePanels) { return null; }

        const {view, editor, elementsSearchPanel} = this.props;

        const items: Array<React.ReactElement<any>> = [];
        items.push(
            <AccordionItem key='connections' heading='Connections' bodyClassName='link-types-toolbox'>
                <LinkTypesToolbox view={view} editor={editor} />
            </AccordionItem>
        );
        if (elementsSearchPanel) {
            items.push(
                <AccordionItem key='search' heading='Search in diagram'>
                    {React.cloneElement(elementsSearchPanel, {view, editor})}
                </AccordionItem>
            );
        }

        return (
            <ResizableSidebar dockSide={DockSide.Right}
                isOpen={this.props.isRightPanelOpen}
                onOpenOrClose={this.props.onToggleRightPanel}
                onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    horizontalResizing: true,
                })}>
                <Accordion onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    verticalResizing: true,
                })}>
                    {items}
                </Accordion>
            </ResizableSidebar>
        );
    }

    render() {
        return (
            <div ref={e => this.element = e} className='ontodia'>
                {this.renderToolbar()}
                <div className='ontodia__workspace'>
                    {this.renderLeftPanel()}
                    <div className='ontodia__main-panel'>
                        <PaperArea ref={el => this.paperArea = el}
                            view={this.props.view}
                            zoomOptions={this.props.zoomOptions}
                            hideScrollBars={this.props.hideScrollBars}
                            watermarkSvg={this.props.watermarkSvg}
                            watermarkUrl={this.props.watermarkUrl}
                            onDragDrop={this.onDropOnPaper}
                            onZoom={this.props.onZoom}>
                        </PaperArea>
                    </div>
                    {this.renderRightPanel()}
                </div>
            </div>
        );
    }

    componentDidMount() {
        document.addEventListener('mouseup', this.onDocumentMouseUp);
    }

    componentWillUnmount() {
        document.removeEventListener('mouseup', this.onDocumentMouseUp);
        this.cancellation.abort();
    }

    preventTextSelection() {
        this.untilMouseUp({preventTextSelection: true});
    }

    private untilMouseUp(params: {
        preventTextSelection?: boolean;
        horizontalResizing?: boolean;
        verticalResizing?: boolean;
    }) {
        this.untilMouseUpClasses = [];
        if (params.preventTextSelection) {
            this.untilMouseUpClasses.push('ontodia--unselectable');
        }
        if (params.horizontalResizing) {
            this.untilMouseUpClasses.push('ontodia--horizontal-resizing');
        }
        if (params.verticalResizing) {
            this.untilMouseUpClasses.push('ontodia--vertical-resizing');
        }

        for (const className of this.untilMouseUpClasses) {
            this.element.classList.add(className);
        }
    }

    private onDocumentMouseUp = () => {
        for (const className of this.untilMouseUpClasses) {
            this.element.classList.remove(className);
        }
        this.untilMouseUpClasses = [];
    }

    private onDropOnPaper = (e: DragEvent, paperPosition: Vector) => {
        e.preventDefault();

        const event: DropOnPaperEvent = {dragEvent: e, paperPosition};
        if (this.props.view._tryHandleDropOnPaper(event)) {
            return;
        }

        const iris = tryParseDefaultDragAndDropData(e);
        if (iris.length > 0) {
            this.props.editor.onDragDrop(iris, paperPosition);
        }
    }
}

function forceNonReactExecutionContext(): Promise<void> {
    // force non-React executing context to resolve forceUpdate() synchronously
    return Promise.resolve();
}

function getViewportCenterInPaperCoords(paperArea: PaperArea): Vector {
    const viewport = paperArea.getAreaMetrics();
    return paperArea.clientToPaperCoords(
        viewport.clientWidth / 2, viewport.clientHeight / 2);
}

function centerElementToPosition(element: Element, center: Vector) {
    const position = {
        x: center.x - element.size.width / 2,
        y: center.y - element.size.height / 2,
    };
    element.setPosition(position);
}

function tryParseDefaultDragAndDropData(e: DragEvent): ElementIri[] {
    const tryGetIri = (type: string, decode: boolean = false) => {
        try {
            const iriString = e.dataTransfer.getData(type);
            if (!iriString) { return undefined; }
            let iris: ElementIri[];
            try {
                iris = JSON.parse(iriString);
            } catch (e) {
                iris = [(decode ? decodeURI(iriString) : iriString) as ElementIri];
            }
            return iris.length === 0 ? undefined : iris;
        } catch (e) {
            return undefined;
        }
    };

    return tryGetIri('application/x-ontodia-elements')
        || tryGetIri('text/uri-list', true)
        || tryGetIri('text') // IE11, Edge
        || [];
}
