import { Component, createElement, ReactElement } from 'react';
import * as Backbone from 'backbone';

import { DiagramModel } from '../diagram/model';
import { Link, FatLinkType } from '../diagram/elements';
import { DiagramView, DiagramViewOptions } from '../diagram/view';
import {
    forceLayout, removeOverlaps, padded, translateToPositiveQuadrant,
    LayoutNode, LayoutLink, translateToCenter,
} from '../viewUtils/layout';
import { ClassTree } from '../widgets/classTree';
import { dataURLToBlob } from '../viewUtils/toSvg';

import { EditorToolbar, Props as EditorToolbarProps } from '../widgets/toolbar';
import { SearchCriteria } from '../widgets/instancesSearch';
import { showTutorial, showTutorialIfNotSeen } from '../tutorial/tutorial';

import { WorkspaceMarkup, Props as MarkupProps } from './workspaceMarkup';

import { ZoomOptions } from '../diagram/paperArea';

export interface WorkspaceProps {
    onSaveDiagram?: (workspace: Workspace) => void;
    onShareDiagram?: (workspace: Workspace) => void;
    onEditAtMainSite?: (workspace: Workspace) => void;
    isViewOnly?: boolean;
    isDiagramSaved?: boolean;
    hideTutorial?: boolean;
    viewOptions?: DiagramViewOptions;
    leftPanelInitiallyOpen?: boolean;
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
    toolbar?: ReactElement<any>;
}

export interface WorkspaceLanguage {
    code: string;
    label: string;
}

export interface State {
    readonly criteria?: SearchCriteria;
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

    private markup: WorkspaceMarkup;

    private readonly model: DiagramModel;
    private readonly diagram: DiagramView;
    private tree: ClassTree;
    constructor(props: WorkspaceProps) {
        super(props);
        this.model = new DiagramModel(this.props.isViewOnly);
        this.diagram = new DiagramView(this.model, this.props.viewOptions);
        this.diagram.setLanguage(this.props.language);
        this.state = {};
    }

    componentWillReceiveProps(nextProps: WorkspaceProps) {
        if (nextProps.language !== this.diagram.getLanguage()) {
            this.diagram.setLanguage(nextProps.language);
        }
    }

    render(): ReactElement<any> {
        const {languages, toolbar, isViewOnly, onSaveDiagram} = this.props;
        return createElement(WorkspaceMarkup, {
            ref: markup => { this.markup = markup; },
            isViewOnly: this.props.isViewOnly,
            view: this.diagram,
            leftPanelInitiallyOpen: this.props.leftPanelInitiallyOpen,
            rightPanelInitiallyOpen: this.props.rightPanelInitiallyOpen,
            searchCriteria: this.state.criteria,
            onSearchCriteriaChanged: criteria => this.setState({criteria}),
            zoomOptions: this.props.zoomOptions,
            onZoom: this.props.onZoom,
            toolbar: toolbar !== undefined ? toolbar : createElement<EditorToolbarProps>(EditorToolbar, {
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
                selectedLanguage: this.diagram.getLanguage(),
                onChangeLanguage: this.changeLanguage,
                onShowTutorial: this.showTutorial,
                isViewOnly,
            }),
        } as MarkupProps & React.ClassAttributes<WorkspaceMarkup>);
    }

    componentDidMount() {
        this.diagram.initializePaperComponents();

        if (this.props.isViewOnly) { return; }

        this.model.graph.on('add-to-filter', (element: Element, linkType?: FatLinkType, direction?: 'in' | 'out') => {
            this.setState({
                criteria: {
                    refElementId: element.id,
                    refElementLinkId: linkType && linkType.id,
                    linkDirection: direction,
                },
            });
        });

        if (!this.props.hideTutorial) {
            showTutorialIfNotSeen();
        }
    }

    componentWillUnmount() {
        this.diagram.dispose();
    }

    getModel() { return this.model; }
    getDiagram() { return this.diagram; }

    preventTextSelectionUntilMouseUp() { this.markup.preventTextSelection(); }

    zoomToFit = () => {
        this.markup.paperArea.zoomToFit();
    }

    showWaitIndicatorWhile(promise: Promise<any>) {
        this.markup.paperArea.showIndicator(promise);
    }

    forceLayout = () => {
        const nodes: LayoutNode[] = [];
        const nodeById: { [id: string]: LayoutNode } = {};
        for (const element of this.model.elements) {
            const size = element.get('size');
            const position = element.get('position');
            const node: LayoutNode = {
                id: element.id,
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            };
            nodeById[element.id] = node;
            nodes.push(node);
        }

        type LinkWithReference = LayoutLink & { link: Link };
        const links: LinkWithReference[] = [];
        for (const link of this.model.links) {
            if (!this.model.isSourceAndTargetVisible(link)) { continue; }
            const source = this.model.sourceOf(link);
            const target = this.model.targetOf(link);
            links.push({
                link,
                source: nodeById[source.id],
                target: nodeById[target.id],
            });
        }

        forceLayout({nodes, links, preferredLinkLength: 200});
        padded(nodes, {x: 10, y: 10}, () => removeOverlaps(nodes));
        translateToPositiveQuadrant({nodes, padding: {x: 150, y: 150}});
        for (const node of nodes) {
            this.model.getElement(node.id).position(node.x, node.y);
        }
        this.markup.paperArea.adjustPaper();
        translateToCenter({
            nodes,
            paperSize: this.markup.paperArea.getPaperSize(),
            contentBBox: this.markup.paperArea.getContentFittingBox(),
        });

        for (const node of nodes) {
            this.model.getElement(node.id).position(node.x, node.y);
        }

        for (const {link} of links) {
            link.set('vertices', []);
        }
    }

    exportSvg = (link: HTMLAnchorElement) => {
        this.diagram.exportSVG().then(svg => {
            if (!link.download || link.download.match(/^diagram\.[a-z]+$/)) {
                link.download = 'diagram.svg';
            }
            const xmlEncodingHeader = '<?xml version="1.0" encoding="UTF-8"?>';
            link.href = window.URL.createObjectURL(
                new Blob([xmlEncodingHeader + svg], {type: 'image/svg+xml'}));
            link.click();
        });
    }

    exportPng = (link: HTMLAnchorElement) => {
        this.diagram.exportPNG({backgroundColor: 'white'}).then(dataUri => {
            if (!link.download || link.download.match(/^diagram\.[a-z]+$/)) {
                link.download = 'diagram.png';
            }
            link.href = window.URL.createObjectURL(dataURLToBlob(dataUri));
            link.click();
        });
    }

    undo = () => {
        this.model.undo();
    }

    redo = () => {
        this.model.redo();
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
        this.diagram.print();
    }

    changeLanguage = (language: string) => {
        // if onLanguageChange is set we'll just forward the change
        if (this.props.onLanguageChange) {
            this.props.onLanguageChange(language);
        } else {
            this.diagram.setLanguage(language);
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

export default Workspace;
