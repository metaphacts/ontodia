import { Component, createElement, ReactElement, cloneElement } from 'react';
import * as ReactDOM from 'react-dom';
import * as saveAs from 'file-saverjs';

import { RestoreGeometry } from '../diagram/commands';
import { Element, Link, FatLinkType } from '../diagram/elements';
import { boundsOf, computeGrouping } from '../diagram/geometry';
import { Batch, Command, CommandHistory, NonRememberingHistory } from '../diagram/history';
import { PaperArea, ZoomOptions, PointerEvent, PointerUpEvent, getContentFittingBox } from '../diagram/paperArea';
import { DiagramView, ViewOptions } from '../diagram/view';

import { AsyncModel, GroupBy } from '../editor/asyncModel';
import { EditorController, EditorOptions, recursiveForceLayout } from '../editor/editorController';

import { MetadataApi } from '../editor/metadata';
import { ExampleMetadataApi } from '../../examples/data/ExampleMetadataApi';

import { EventObserver } from '../viewUtils/events';
import {
    forceLayout, removeOverlaps, padded, translateToPositiveQuadrant,
    LayoutNode, LayoutLink, translateToCenter,
} from '../viewUtils/layout';
import { dataURLToBlob } from '../viewUtils/toSvg';

import { ClassTree } from '../widgets/classTree';
import { SearchCriteria } from '../widgets/instancesSearch';

import { DefaultToolbar, ToolbarProps as DefaultToolbarProps } from './toolbar';
import { showTutorial, showTutorialIfNotSeen } from './tutorial';
import { WorkspaceMarkup, Props as MarkupProps } from './workspaceMarkup';

export interface WorkspaceProps {
    onSaveDiagram?: (workspace: Workspace) => void;
    onPointerDown?: (e: PointerEvent) => void;
    onPointerMove?: (e: PointerEvent) => void;
    onPointerUp?: (e: PointerUpEvent) => void;

    hidePanels?: boolean;
    hideToolbar?: boolean;
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
    toolbar?: ReactElement<any>;
    viewOptions?: DiagramViewOptions;
}

export interface DiagramViewOptions extends ViewOptions, EditorOptions {
    groupBy?: GroupBy[];
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
    private readonly metadata: MetadataApi;

    private markup: WorkspaceMarkup;
    private tree: ClassTree;

    constructor(props: WorkspaceProps) {
        super(props);

        const {hideHalo, language, history, viewOptions = {}} = this.props;
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
        this.metadata = new ExampleMetadataApi();
        this.editor = new EditorController(this.model, this.view, this.metadata, {
            disableDefaultHalo: hideHalo || disableDefaultHalo,
            suggestProperties,
        });

        this.view.setLanguage(this.props.language);
        this.state = {
            isLeftPanelOpen: this.props.leftPanelInitiallyOpen,
            isRightPanelOpen: this.props.rightPanelInitiallyOpen,
        };
    }

    componentWillReceiveProps(nextProps: WorkspaceProps) {
        if (nextProps.language !== this.view.getLanguage()) {
            this.view.setLanguage(nextProps.language);
        }
    }

    _getPaperArea(): PaperArea | undefined {
        return this.markup ? this.markup.paperArea : undefined;
    }

    private getToolbar = () => {
        const {languages, onSaveDiagram, hidePanels, toolbar} = this.props;
        return cloneElement(
            toolbar || createElement<DefaultToolbarProps>(DefaultToolbar), {
                onZoomIn: this.zoomIn,
                onZoomOut: this.zoomOut,
                onZoomToFit: this.zoomToFit,
                onPrint: this.print,
                onExportSVG: this.exportSvg,
                onExportPNG: this.exportPng,
                onSaveDiagram: onSaveDiagram ? () => onSaveDiagram(this) : undefined,
                onForceLayout: () => {
                    this.forceLayout();
                    this.zoomToFit();
                },
                languages,
                selectedLanguage: this.view.getLanguage(),
                onChangeLanguage: this.changeLanguage,
                onShowTutorial: this.showTutorial,
                hidePanels,
                isLeftPanelOpen: this.state.isLeftPanelOpen,
                onLeftPanelToggle: () => {
                    this.setState(prevState => ({isLeftPanelOpen: !prevState.isLeftPanelOpen}));
                },
                isRightPanelOpen: this.state.isRightPanelOpen,
                onRightPanelToggle: () => {
                    this.setState(prevState => ({isRightPanelOpen: !prevState.isRightPanelOpen}));
                },
            },
        );
    }

    render(): ReactElement<any> {
        const {languages, toolbar, hidePanels, hideToolbar} = this.props;
        return createElement(WorkspaceMarkup, {
            ref: markup => { this.markup = markup; },
            hidePanels,
            hideToolbar,
            model: this.model,
            view: this.view,
            editor: this.editor,
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
            toolbar: this.getToolbar(),
        } as MarkupProps & React.ClassAttributes<WorkspaceMarkup>);
    }

    componentDidMount() {
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

        if (!this.props.hideTutorial) {
            showTutorialIfNotSeen();
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

    showWaitIndicatorWhile(operation: Promise<any>) {
        this.markup.paperArea.centerTo();
        this.editor.setSpinner({});
        if (operation) {
            operation.then(() => {
                this.editor.setSpinner(undefined);
            }).catch(error => {
                console.error(error);
                this.editor.setSpinner({statusText: 'Unknown error occured', errorOccured: true});
            });
        }
    }

    forceLayout = () => {
        const batch = this.model.history.startBatch('Force layout');
        batch.history.registerToUndo(this.makeSyncAndZoom());
        batch.history.registerToUndo(RestoreGeometry.capture(this.model));

        const grouping = computeGrouping(this.model.elements);
        recursiveForceLayout(this.model, grouping);

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

    centerTo = (paperPosition?: { x: number; y: number; }) => {
        this.markup.paperArea.centerTo(paperPosition);
    }

    showTutorial = () => {
        showTutorial();
    }
}

export function renderTo<WorkspaceComponentProps>(
    workspace: React.ComponentClass<WorkspaceComponentProps>,
    container: HTMLElement,
    props: WorkspaceComponentProps,
) {
    ReactDOM.render(createElement(workspace, props), container);
}

export default Workspace;
