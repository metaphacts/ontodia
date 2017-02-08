import * as $ from 'jquery';
import { Component, createElement, ReactElement, DOM as D } from 'react';
import * as Backbone from 'backbone';

import { DiagramModel } from '../diagram/model';
import { Link, FatLinkType } from '../diagram/elements';
import { DiagramView, DiagramViewOptions } from '../diagram/view';
import {
    forceLayout, removeOverlaps, padded, translateToPositiveQuadrant,
    LayoutNode, LayoutLink, translateToCenter,
} from '../viewUtils/layout';
import { ClassTree } from '../widgets/classTree';
import { LinkTypesToolboxShell, LinkTypesToolboxModel } from '../widgets/linksToolbox';
import { dataURLToBlob } from '../viewUtils/toSvg';

import { resizePanel, setPanelHeight } from '../resizable-panels';
import { resizeItem } from '../resizable-items';
import { EditorToolbar, Props as EditorToolbarProps } from '../widgets/toolbar';
import { SearchCriteria } from '../widgets/instancesSearch';
import { showTutorial, showTutorialIfNotSeen } from '../tutorial/tutorial';

import { WorkspaceMarkup, Props as MarkupProps } from './workspaceMarkup';

export interface Props {
    onSaveDiagram?: (workspace: Workspace) => void;
    onShareDiagram?: (workspace: Workspace) => void;
    onEditAtMainSite?: (workspace: Workspace) => void;
    isViewOnly?: boolean;
    isDiagramSaved?: boolean;
    hideTutorial?: boolean;
    viewOptions?: DiagramViewOptions;
}

export interface State {
    readonly criteria?: SearchCriteria;
}

export class Workspace extends Component<Props, State> {
    private markup: WorkspaceMarkup;

    private readonly model: DiagramModel;
    private readonly diagram: DiagramView;
    private tree: ClassTree;
    private linksToolbox: LinkTypesToolboxShell;

    constructor(props: Props) {
        super(props);
        this.model = new DiagramModel(this.props.isViewOnly);
        this.diagram = new DiagramView(this.model, this.props.viewOptions);
        this.state = {};
    }

    render(): ReactElement<any> {
        return createElement(WorkspaceMarkup, {
            ref: markup => { this.markup = markup; },
            isViewOnly: this.props.isViewOnly,
            view: this.diagram,
            searchCriteria: this.state.criteria,
            onSearchCriteriaChanged: criteria => this.setState({criteria}),
            toolbar: createElement<EditorToolbarProps>(EditorToolbar, {
                onUndo: () => this.model.undo(),
                onRedo: () => this.model.redo(),
                onZoomIn: () => this.markup.paperArea.zoomBy(0.2),
                onZoomOut: () => this.markup.paperArea.zoomBy(-0.2),
                onZoomToFit: () => this.markup.paperArea.zoomToFit(),
                onPrint: () => this.diagram.print(),
                onExportSVG: link => this.onExportSvg(link),
                onExportPNG: link => this.onExportPng(link),
                onShare: this.props.onShareDiagram ? () => this.props.onShareDiagram(this) : undefined,
                onSaveDiagram: () => this.props.onSaveDiagram(this),
                onForceLayout: () => {
                    this.forceLayout();
                    this.markup.paperArea.zoomToFit();
                },
                onChangeLanguage: language => this.diagram.setLanguage(language),
                onShowTutorial: () => {
                    if (!this.props.hideTutorial) { showTutorial(); }
                },
                onEditAtMainSite: () => this.props.onEditAtMainSite(this),
                isEmbeddedMode: this.props.isViewOnly,
                isDiagramSaved: this.props.isDiagramSaved,
            }),
        } as MarkupProps & React.ClassAttributes<WorkspaceMarkup>);
    }

    componentDidMount() {
        if (this.props.isViewOnly) { return; }

        this.diagram.initializePaperComponents();

        this.tree = new ClassTree({
            model: new Backbone.Model(this.diagram.model),
            view: this.diagram,
            el: this.markup.classTreePanel,
        }).render();

        this.tree.on('action:classSelected', (classId: string) => {
            this.setState({criteria: {elementTypeId: classId}});
        });
        this.model.graph.on('add-to-filter', (element: Element, linkType?: FatLinkType) => {
            this.setState({criteria: {refElementId: element.id, refElementLinkId: linkType && linkType.id}});
        });

        this.linksToolbox = new LinkTypesToolboxShell({
            model: new LinkTypesToolboxModel(this.model),
            view: this.diagram,
            el: this.markup.linkTypesPanel,
        });

        resizePanel({
            panel: this.markup.element.querySelector('.ontodia__left-panel') as HTMLElement,
        });
        resizePanel({
            panel: this.markup.element.querySelector('.ontodia__right-panel') as HTMLElement,
            initiallyClosed: true,
        });
        $(this.markup.element).find('.filter-item').each(resizeItem);
        $(window).resize(this.onWindowResize);

        if (!this.props.isViewOnly && !this.props.hideTutorial) {
            showTutorialIfNotSeen();
        }
    }

    componentWillUnmount() {
        if (this.tree) {
            this.tree.remove();
        }

        $(window).off('resize', this.onWindowResize);
        this.diagram.dispose();
    }

    private onWindowResize = () => {
        if (this.markup && !this.props.isViewOnly) {
            $(this.markup.element).find('.filter-panel').each(setPanelHeight);
        }
    }

    getModel() { return this.model; }
    getDiagram() { return this.diagram; }

    preventTextSelectionUntilMouseUp() { this.markup.preventTextSelection(); }
    zoomToFit() { this.markup.paperArea.zoomToFit(); }

    showWaitIndicatorWhile(promise: Promise<any>) {
        this.markup.paperArea.showIndicator(promise);
    }

    forceLayout() {
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

    private onExportSvg(link: HTMLAnchorElement) {
        this.diagram.exportSVG().then(svg => {
            link.download = 'diagram.svg';
            const xmlEncodingHeader = '<?xml version="1.0" encoding="UTF-8"?>';
            link.href = window.URL.createObjectURL(
                new Blob([xmlEncodingHeader + svg], {type: 'image/svg+xml'}));
            link.click();
        });
    }

    private onExportPng(link: HTMLAnchorElement) {
        this.diagram.exportPNG({backgroundColor: 'white'}).then(dataUri => {
            link.download = 'diagram.png';
            link.href = window.URL.createObjectURL(dataURLToBlob(dataUri));
            link.click();
        });
    }
}

export default Workspace;
