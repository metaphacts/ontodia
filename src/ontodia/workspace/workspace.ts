import { Component, createElement, ReactElement, cloneElement } from 'react';
import * as ReactDOM from 'react-dom';
import * as saveAs from 'file-saverjs';

import { MetadataApi } from '../data/metadataApi';
import { ValidationApi } from '../data/validationApi';

import { RestoreGeometry } from '../diagram/commands';
import { Element, Link, FatLinkType } from '../diagram/elements';
import { boundsOf, computeGrouping } from '../diagram/geometry';
import { Batch, Command, CommandHistory, NonRememberingHistory } from '../diagram/history';
import { PaperArea, ZoomOptions, PointerEvent, PointerUpEvent, getContentFittingBox } from '../diagram/paperArea';
import { DiagramView, ViewOptions } from '../diagram/view';

import { AsyncModel, GroupBy } from '../editor/asyncModel';
import {
    EditorController, EditorOptions, PropertyEditor, recursiveForceLayout,
} from '../editor/editorController';
import { AuthoringState } from '../editor/authoringState';

import { EventObserver } from '../viewUtils/events';
import { dataURLToBlob } from '../viewUtils/toSvg';

import { ClassTree } from '../widgets/classTree';
import { PropertySuggestionHandler } from '../widgets/connectionsMenu';
import { SearchCriteria } from '../widgets/instancesSearch';

import { DefaultToolbar, ToolbarProps } from './toolbar';
import { showTutorial, showTutorialIfNotSeen } from './tutorial';
import { WorkspaceMarkup, WorkspaceMarkupProps } from './workspaceMarkup';
import { WorkspaceEventHandler, WorkspaceEventKey } from './workspaceContext';

const ONTODIA_WEBSITE = 'https://ontodia.org/';
const ONTODIA_LOGO_SVG = require<string>('../../../images/ontodia-logo.svg');

export interface WorkspaceProps {
    /** Saves diagram layout (position and state of elements and links). */
    onSaveDiagram?: (workspace: Workspace) => void;
    /** Persists authored changes in the editor. */
    onPersistChanges?: (workspace: Workspace) => void;
    onPointerDown?: (e: PointerEvent) => void;
    onPointerMove?: (e: PointerEvent) => void;
    onPointerUp?: (e: PointerUpEvent) => void;

    /**
     * Custom toolbar to replace the default one.
     */
    toolbar?: ReactElement<any>;
    /** @default false */
    hidePanels?: boolean;
    /** @default false */
    hideToolbar?: boolean;
    /** @default false */
    hideScrollBars?: boolean;
    /** @default false */
    hideHalo?: boolean;
    /** @default true */
    hideTutorial?: boolean;
    /** @default true */
    leftPanelInitiallyOpen?: boolean;
    /** @default false */
    rightPanelInitiallyOpen?: boolean;

    /**
     * Set of languages to display diagram data.
     */
    languages?: ReadonlyArray<WorkspaceLanguage>;
    /**
     * Currently selected language.
     */
    language?: string;
    /**
     * Called when user selected another language from the UI.
     *
     * If this function is set, language selection will work in controlled mode;
     * otherwise language selection will function in uncontrolled mode.
     */
    onLanguageChange?: (language: string) => void;

    zoomOptions?: ZoomOptions;
    onZoom?: (scaleX: number, scaleY: number) => void;

    history?: CommandHistory;
    viewOptions?: DiagramViewOptions;

    /**
     * If provided, switches editor into "authoring mode".
     */
    metadataApi?: MetadataApi;
    validationApi?: ValidationApi;
    propertyEditor?: PropertyEditor;
    onWorkspaceEvent?: WorkspaceEventHandler;
}

export interface DiagramViewOptions extends ViewOptions {
    groupBy?: GroupBy[];
    disableDefaultHalo?: boolean;
    suggestProperties?: PropertySuggestionHandler;
}

export interface WorkspaceLanguage {
    code: string;
    label: string;
}

export interface State {
    readonly criteria?: SearchCriteria;
    readonly isLeftPanelOpen?: boolean;
    readonly isRightPanelOpen?: boolean;
}

export class Workspace extends Component<WorkspaceProps, State> {
    static readonly defaultProps: Partial<WorkspaceProps> = {
        hideTutorial: true,
        leftPanelInitiallyOpen: true,
        rightPanelInitiallyOpen: false,
        languages: [
            {code: 'en', label: 'English'},
            {code: 'ru', label: 'Russian'},
        ],
        language: 'en',
    };

    private readonly listener = new EventObserver();

    private readonly model: AsyncModel;
    private readonly view: DiagramView;
    private readonly editor: EditorController;

    private markup: WorkspaceMarkup;
    private tree: ClassTree;

    private _watermarkSvg: string | undefined = ONTODIA_LOGO_SVG;
    private _watermarkUrl: string | undefined = ONTODIA_WEBSITE;

    constructor(props: WorkspaceProps) {
        super(props);

        const {
            hideHalo, language, history, viewOptions = {},
            metadataApi, validationApi, propertyEditor,
        } = this.props;
        const {
            templatesResolvers, linkTemplateResolvers, typeStyleResolvers, linkRouter, onIriClick,
            disableDefaultHalo, suggestProperties, groupBy,
        } = viewOptions;

        this.model = new AsyncModel(
            history || new NonRememberingHistory(),
            groupBy || [],
        );
        this.view = new DiagramView(this.model, {
            templatesResolvers,
            linkTemplateResolvers,
            typeStyleResolvers,
            linkRouter,
            onIriClick,
        });
        this.editor = new EditorController({
            model: this.model,
            view: this.view,
            disableHalo: hideHalo || disableDefaultHalo,
            suggestProperties,
            validationApi,
            propertyEditor,
        });
        this.editor.setMetadataApi(metadataApi);

        this.view.setLanguage(this.props.language);
        this.state = {
            isLeftPanelOpen: this.props.leftPanelInitiallyOpen,
            isRightPanelOpen: this.props.rightPanelInitiallyOpen,
        };
    }

    _getPaperArea(): PaperArea | undefined {
        return this.markup ? this.markup.paperArea : undefined;
    }

    _setWatermark(watermarkSvg: string | undefined, watermarkUrl: string | undefined) {
        this._watermarkSvg = watermarkSvg;
        this._watermarkUrl = watermarkUrl;
        this.forceUpdate();
    }

    render(): ReactElement<any> {
        const {languages, toolbar, hidePanels, hideToolbar, metadataApi, hideScrollBars, onWorkspaceEvent} = this.props;
        return createElement(WorkspaceMarkup, {
            ref: markup => { this.markup = markup; },
            hidePanels,
            hideToolbar,
            hideScrollBars,
            model: this.model,
            view: this.view,
            editor: this.editor,
            metadataApi,
            leftPanelInitiallyOpen: this.props.leftPanelInitiallyOpen,
            rightPanelInitiallyOpen: this.props.rightPanelInitiallyOpen,
            searchCriteria: this.state.criteria,
            onSearchCriteriaChanged: criteria => this.setState({criteria}),
            zoomOptions: this.props.zoomOptions,
            onZoom: this.props.onZoom,
            isLeftPanelOpen: this.state.isLeftPanelOpen,
            onToggleLeftPanel: isLeftPanelOpen => this.setState({isLeftPanelOpen}),
            isRightPanelOpen: this.state.isRightPanelOpen,
            onToggleRightPanel: isRightPanelOpen => this.setState({isRightPanelOpen}),
            toolbar: createElement(ToolbarWrapper, {workspace: this}),
            onWorkspaceEvent,
            watermarkSvg: this._watermarkSvg,
            watermarkUrl: this._watermarkUrl,
        } as WorkspaceMarkupProps & React.ClassAttributes<WorkspaceMarkup>);
    }

    componentDidMount() {
        const {onWorkspaceEvent} = this.props;

        this.editor._initializePaperComponents(this.markup.paperArea);

        this.listener.listen(this.model.events, 'loadingSuccess', () => {
            this.view.performSyncUpdate();
            this.markup.paperArea.centerContent();
        });

        this.listener.listen(this.model.events, 'elementEvent', ({key, data}) => {
            if (!data.requestedAddToFilter) { return; }
            const {source, linkType, direction} = data.requestedAddToFilter;
            this.setState({
                criteria: {
                    refElement: source,
                    refElementLink: linkType,
                    linkDirection: direction,
                },
            });
            if (onWorkspaceEvent) {
                onWorkspaceEvent(WorkspaceEventKey.searchUpdateCriteria);
            }
        });

        this.listener.listen(this.markup.paperArea.events, 'pointerUp', e => {
            if (this.props.onPointerUp) {
                this.props.onPointerUp(e);
            }
        });
        this.listener.listen(this.markup.paperArea.events, 'pointerMove', e => {
            if (this.props.onPointerMove) {
                this.props.onPointerMove(e);
            }
        });
        this.listener.listen(this.markup.paperArea.events, 'pointerDown', e => {
            if (this.props.onPointerDown) {
                this.props.onPointerDown(e);
            }
        });

        if (onWorkspaceEvent) {
            this.listener.listen(this.editor.events, 'changeSelection', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorChangeSelection)
            );
            this.listener.listen(this.editor.events, 'toggleDialog', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorToggleDialog)
            );
            this.listener.listen(this.editor.events, 'addElements', () =>
                onWorkspaceEvent(WorkspaceEventKey.editorAddElements)
            );
        }

        if (!this.props.hideTutorial) {
            showTutorialIfNotSeen();
        }
    }

    componentWillReceiveProps(nextProps: WorkspaceProps) {
        if (nextProps.language !== this.view.getLanguage()) {
            this.view.setLanguage(nextProps.language);
        }

        if (nextProps.metadataApi !== this.editor.metadataApi) {
            this.editor.setMetadataApi(nextProps.metadataApi);
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.view.dispose();
    }

    getModel() { return this.model; }
    getDiagram() { return this.view; }
    getEditor() { return this.editor; }

    preventTextSelectionUntilMouseUp() { this.markup.preventTextSelection(); }

    zoomToFit = () => {
        this.markup.paperArea.zoomToFit();
    }

    clearAll = () => {
        this.editor.removeItems([...this.model.elements]);
    }

    showWaitIndicatorWhile(operation: Promise<any>) {
        this.markup.paperArea.centerTo();
        this.editor.setSpinner({});
        if (operation) {
            operation.then(() => {
                this.editor.setSpinner(undefined);
            }).catch(error => {
                // tslint:disable-next-line:no-console
                console.error(error);
                this.editor.setSpinner({statusText: 'Unknown error occured', errorOccured: true});
            });
        }
    }

    forceLayout = () => {
        const batch = this.model.history.startBatch('Force layout');
        batch.history.registerToUndo(this.makeSyncAndZoom());
        batch.history.registerToUndo(RestoreGeometry.capture(this.model));

        recursiveForceLayout({model: this.model});

        for (const link of this.model.links) {
            link.setVertices([]);
        }

        batch.history.execute(this.makeSyncAndZoom());
        batch.store();
    }

    private makeSyncAndZoom(): Command {
        return Command.effect('Sync and zoom to fit', () => {
            this.view.performSyncUpdate();
            this.zoomToFit();
        });
    }

    exportSvg = (fileName?: string) => {
        this.markup.paperArea.exportSVG().then(svg => {
            fileName = fileName || 'diagram.svg';
            const xmlEncodingHeader = '<?xml version="1.0" encoding="UTF-8"?>';
            const blob = new Blob([xmlEncodingHeader + svg], {type: 'image/svg+xml'});
            saveAs(blob, fileName);
        });
    }

    exportPng = (fileName?: string) => {
        fileName = fileName || 'diagram.png';
        this.markup.paperArea.exportPNG({backgroundColor: 'white'}).then(dataUri => {
            const blob = dataURLToBlob(dataUri);
            saveAs(blob, fileName);
        });
    }

    undo = () => {
        this.model.history.undo();
    }

    redo = () => {
        this.model.history.redo();
    }

    zoomBy = (value: number) => {
        this.markup.paperArea.zoomBy(value);
    }

    zoomIn = () => {
        this.markup.paperArea.zoomIn();
    }

    zoomOut = () => {
        this.markup.paperArea.zoomOut();
    }

    print = () => {
        this.markup.paperArea.exportSVG().then(svg => {
            const printWindow = window.open('', undefined, 'width=1280,height=720');
            printWindow.document.write(svg);
            printWindow.document.close();
            printWindow.print();
        });
    }

    changeLanguage = (language: string) => {
        // if onLanguageChange is set we'll just forward the change
        if (this.props.onLanguageChange) {
            this.props.onLanguageChange(language);
        } else {
            this.view.setLanguage(language);
            // since we have toolbar dependent on language, we're forcing update here
            this.forceUpdate();
        }
    }

    centerTo = (paperPosition?: { x: number; y: number }) => {
        this.markup.paperArea.centerTo(paperPosition);
    }

    showTutorial = () => {
        showTutorial();
    }
}

interface ToolbarWrapperProps {
    workspace: Workspace;
}

class ToolbarWrapper extends Component<ToolbarWrapperProps, {}> {
    private readonly listener = new EventObserver();

    render() {
        const {workspace} = this.props;
        const view = workspace.getDiagram();
        const editor = workspace.getEditor();
        const {languages, onSaveDiagram, onPersistChanges, hidePanels, toolbar, metadataApi} = workspace.props;

        const canPersistChanges = onPersistChanges ? editor.authoringState.events.length > 0 : undefined;
        const canSaveDiagram = !canPersistChanges;

        const toolbarProps: ToolbarProps = {
            onZoomIn: workspace.zoomIn,
            onZoomOut: workspace.zoomOut,
            onZoomToFit: workspace.zoomToFit,
            onPrint: workspace.print,
            onExportSVG: workspace.exportSvg,
            onExportPNG: workspace.exportPng,
            canSaveDiagram,
            onSaveDiagram: onSaveDiagram ? () => onSaveDiagram(workspace) : undefined,
            canPersistChanges,
            onPersistChanges: onPersistChanges ? () => onPersistChanges(workspace) : undefined,
            onForceLayout: () => {
                workspace.forceLayout();
                workspace.zoomToFit();
            },
            onClearAll: workspace.clearAll,
            languages,
            selectedLanguage: view.getLanguage(),
            onChangeLanguage: workspace.changeLanguage,
            onShowTutorial: workspace.showTutorial,
            hidePanels,
            isLeftPanelOpen: workspace.state.isLeftPanelOpen,
            onLeftPanelToggle: () => {
                workspace.setState(prevState => ({isLeftPanelOpen: !prevState.isLeftPanelOpen}));
            },
            isRightPanelOpen: workspace.state.isRightPanelOpen,
            onRightPanelToggle: () => {
                workspace.setState(prevState => ({isRightPanelOpen: !prevState.isRightPanelOpen}));
            },
        };
        return toolbar
            ? cloneElement(toolbar, toolbarProps)
            : createElement(DefaultToolbar, toolbarProps);
    }

    componentDidMount() {
        const {workspace} = this.props;
        const editor = workspace.getEditor();
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.forceUpdate();
        });
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }
}

export function renderTo<WorkspaceComponentProps>(
    workspace: React.ComponentClass<WorkspaceComponentProps>,
    container: HTMLElement,
    props: WorkspaceComponentProps,
) {
    ReactDOM.render(createElement(workspace, props), container);
}
