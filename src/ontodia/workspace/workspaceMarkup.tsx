import * as React from 'react';

import { ElementIri, ElementTypeIri, ElementModel } from '../data/model';

import { Element } from '../diagram/elements';
import { Vector } from '../diagram/geometry';
import { DiagramView, DropOnPaperEvent, WidgetAttachment } from '../diagram/view';
import { PaperArea, ZoomOptions } from '../diagram/paperArea';

import { ClassTree } from '../widgets/classTree';
import { InstancesSearch, SearchCriteria } from '../widgets/instancesSearch';
import { LinkTypesToolbox } from '../widgets/linksToolbox';

import { AsyncModel } from '../editor/asyncModel';
import { EditorController } from '../editor/editorController';

import {
    WorkspaceContextWrapper, WorkspaceContext, WorkspaceContextTypes, WorkspaceEventHandler, WorkspaceEventKey,
} from './workspaceContext';

import { MetadataApi } from '../data/metadataApi';
import { Cancellation, CancellationToken } from '../viewUtils/async';

import { WorkspaceLayout, WorkspaceLayoutType, WorkspaceLayoutNode } from './layout/layout';

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
    isRightPanelOpen?: boolean;
    onWorkspaceEvent?: WorkspaceEventHandler;
    watermarkSvg?: string;
    watermarkUrl?: string;
    elementsSearchPanel?: React.ReactElement<any>;
}

export class WorkspaceMarkup extends React.Component<WorkspaceMarkupProps, {}> {
    static childContextTypes = WorkspaceContextTypes;

    element: HTMLElement;
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

    private addToolbarWidgetToPaper() {
        const {hideToolbar, view, toolbar} = this.props;
        if (!hideToolbar) {
            view.setPaperWidget({
                key: 'toolbar',
                widget: <ToolbarWidget>{toolbar}</ToolbarWidget>,
                attachment: WidgetAttachment.Viewport,
            });
        }
    }

    private onCreateInstance = async (classId: ElementTypeIri, position?: Vector) => {
        const {editor, view, model, metadataApi} = this.props;
        await forceNonReactExecutionContext();
        const batch = model.history.startBatch();

        const signal = this.cancellation.signal;
        const elementModel = await CancellationToken.mapCancelledToNull(
            signal,
            metadataApi.generateNewElement([classId], signal)
        );
        if (elementModel === null) { return; }

        const element = editor.createNewEntity({elementModel});
        const targetPosition = position || getViewportCenterInPaperCoords(this.paperArea);
        element.setPosition(targetPosition);

        view.performSyncUpdate();
        centerElementToPosition(element, targetPosition);

        batch.store();
        editor.setSelection([element]);
        editor.showEditEntityForm(element);
    }

    private getLeftPanelLayout(): WorkspaceLayoutNode {
        const {view, editor, model, searchCriteria, onSearchCriteriaChanged} = this.props;
        const classTree = (
            <ClassTree view={view}
                editor={editor}
                onClassSelected={classId => {
                    const elementType = model.createClass(classId);
                    onSearchCriteriaChanged({elementType});
                }}
                onCreateInstance={this.onCreateInstance}
            />
        );
        const instancesSearch = (
            <InstancesSearch view={view}
                model={model}
                criteria={searchCriteria || {}}
                onCriteriaChanged={onSearchCriteriaChanged}
            />
        );
        return {
            type: WorkspaceLayoutType.Column,
            children: [{
                id: 'classes',
                type: WorkspaceLayoutType.Component,
                content: classTree,
                heading: 'Classes',
            }, {
                id: 'instances',
                type: WorkspaceLayoutType.Component,
                content: instancesSearch,
                heading: 'Instances',
            }],
            defaultSize: 275,
            defaultCollapsed: !this.props.isLeftPanelOpen,
        };
    }

    private getRightPanelLayout(): WorkspaceLayoutNode {
        const {view, editor, elementsSearchPanel} = this.props;
        const rightPanel: WorkspaceLayoutNode = {
            type: WorkspaceLayoutType.Column,
            children: [{
                id: 'connections',
                type: WorkspaceLayoutType.Component,
                content: <LinkTypesToolbox view={view} editor={editor}/>,
                heading: 'Connections',
            }],
            defaultSize: 275,
            defaultCollapsed: !this.props.isRightPanelOpen,
        };
        if (elementsSearchPanel) {
            rightPanel.children = [
                ...rightPanel.children,
                {
                    id: 'search',
                    type: WorkspaceLayoutType.Component,
                    content: React.cloneElement(elementsSearchPanel, {view, editor}),
                    heading: 'Search in diagram',
                }
            ];
        }
        return rightPanel;
    }

    render() {
        const paper: WorkspaceLayoutNode = {
            id: 'paper',
            type: WorkspaceLayoutType.Component,
            content: (
                <div className='ontodia__main-panel' style={{flex: '1 1 0px', width: '100%'}}>
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
            ),
        };
        const workspaceLayout: WorkspaceLayoutNode = this.props.hidePanels ? paper : {
            type: WorkspaceLayoutType.Row,
            children: [
                this.getLeftPanelLayout(),
                paper,
                this.getRightPanelLayout(),
            ]
        };
        return (
            <div ref={e => this.element = e} className='ontodia'>
                <div className='ontodia__workspace'>
                    <WorkspaceLayout layout={workspaceLayout} _onStartResize={direction =>
                        this.untilMouseUp({
                            preventTextSelection: true,
                            verticalResizing: direction === 'vertical',
                            horizontalResizing: direction === 'horizontal',
                        })
                    } />
                </div>
            </div>
        );
    }

    componentDidMount() {
        document.addEventListener('mouseup', this.onDocumentMouseUp);
        this.addToolbarWidgetToPaper();
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

class ToolbarWidget extends React.Component<{ children: JSX.Element }> {
    render() {
        return (
            <div className='ontodia__toolbar-widget'>
                {this.props.children}
            </div>
        );
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
