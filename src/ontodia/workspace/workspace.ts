import * as $ from 'jquery';
import { Component, createElement, ReactElement } from 'react';

import { DiagramModel } from '../diagram/model';
import { Link } from '../diagram/elements';
import { DiagramView, DiagramViewOptions } from '../diagram/view';
import { forceLayout, removeOverlaps, padded, LayoutNode, LayoutLink } from '../viewUtils/layout';
import { ClassTree } from '../widgets/classTree';
import { FilterView, FilterModel } from '../widgets/filter';
import { LinkTypesToolboxShell, LinkTypesToolboxModel } from '../widgets/linksToolbox';
import { dataURLToBlob } from '../viewUtils/toSvg';

import { resizePanel, setPanelHeight } from '../resizable-panels';
import { resizeItem } from '../resizable-items';
import { EditorToolbar, Props as EditorToolbarProps } from '../widgets/toolbar';
import { showTutorial, showTutorialIfNotSeen } from '../tutorial/tutorial';

import WorkspaceMarkup from './workspaceMarkup';

export interface Props {
    onSaveDiagram?: (workspace: Workspace) => void;
    onShareDiagram?: (workspace: Workspace) => void;
    onEditAtMainSite?: (workspace: Workspace) => void;
    isViewOnly?: boolean;
    isDiagramSaved?: boolean;
    hideTutorial?: boolean;
    viewOptions?: DiagramViewOptions;
}

export class Workspace extends Component<Props, {}> {
    private markup: WorkspaceMarkup;

    private model: DiagramModel;
    private diagram: DiagramView;
    private tree: ClassTree;
    private filter: FilterView;
    private linksToolbox: LinkTypesToolboxShell;

    constructor(props: Props) {
        super(props);
        this.model = new DiagramModel(this.props.isViewOnly);
    }

    render(): ReactElement<any> {
        return createElement(WorkspaceMarkup, {
            isViewOnly: this.props.isViewOnly,
            toolbar: createElement<EditorToolbarProps>(EditorToolbar, {
                onUndo: () => this.model.undo(),
                onRedo: () => this.model.redo(),
                onZoomIn: () => this.diagram.zoomIn(),
                onZoomOut: () => this.diagram.zoomOut(),
                onZoomToFit: () => this.diagram.zoomToFit(),
                onPrint: () => this.diagram.print(),
                onExportSVG: link => this.onExportSvg(link),
                onExportPNG: link => this.onExportPng(link),
                onShare: this.props.onShareDiagram ? () => this.props.onShareDiagram(this) : undefined,
                onSaveDiagram: () => this.props.onSaveDiagram(this),
                onForceLayout: () => {
                    this.forceLayout();
                    this.diagram.zoomToFit();
                },
                onChangeLanguage: language => this.diagram.setLanguage(language),
                onShowTutorial: () => {
                    if (!this.props.hideTutorial) { showTutorial(); }
                },
                onEditAtMainSite: () => this.props.onEditAtMainSite(this),
                isEmbeddedMode: this.props.isViewOnly,
                isDiagramSaved: this.props.isDiagramSaved,
            }),
            ref: markup => { this.markup = markup; },
        });
    }

    componentDidMount() {
        this.diagram = new DiagramView(this.model, this.markup.chartPanel, this.props.viewOptions);
        if (this.props.isViewOnly) { return; }

        this.filter = new FilterView({
            model: new FilterModel(this.diagram.model),
            view: this.diagram,
            el: this.markup.filterPanel,
        }).render();

        this.tree = new ClassTree({
            model: new FilterModel(this.diagram.model),
            view: this.diagram,
            el: this.markup.classTreePanel,
        }).render();

        this.tree.on('action:classSelected', (classId: string) => {
            this.filter.model.filterByType(classId);
        });

        this.linksToolbox = new LinkTypesToolboxShell({
            model: new LinkTypesToolboxModel(this.model),
            view: this.diagram,
            el: this.markup.linkTypesPanel,
        });

        resizePanel({
            panel: this.markup.element.querySelector('.ontodia-left-panel') as HTMLElement,
        });
        resizePanel({
            panel: this.markup.element.querySelector('.ontodia-right-panel') as HTMLElement,
            initiallyClosed: true,
        });
        $(this.markup.element).find('.filter-item').each(resizeItem);
        $(window).resize(this.onWindowResize);

        if (!this.props.isViewOnly && !this.props.hideTutorial) {
            showTutorialIfNotSeen();
        }
    }

    componentWillUnmount() {
        if (this.filter) {
            this.filter.remove();
        }

        if (this.tree) {
            this.tree.remove();
        }

        if (this.linksToolbox) {
            // this.linksToolbox.remove();
        }

        $(window).off('resize', this.onWindowResize);
    }

    private onWindowResize = () => {
        if (this.markup && !this.props.isViewOnly) {
            $(this.markup.element).find('.filter-panel').each(setPanelHeight);
        }
    }

    public getModel() {
        return this.model;
    }

    public getDiagram() {
        return this.diagram;
    }

    public forceLayout() {
        const nodes: LayoutNode[] = [];
        const nodeById: { [id: string]: LayoutNode } = {};
        for (const elementId in this.model.elements) {
            if (this.model.elements.hasOwnProperty(elementId)) {
                const element = this.model.elements[elementId];
                if (!element.get('presentOnDiagram')) { continue; }
                const size = element.get('size');
                const position = element.get('position');
                const node: LayoutNode = {
                    id: elementId,
                    x: position.x,
                    y: position.y,
                    width: size.width,
                    height: size.height,
                };
                nodeById[elementId] = node;
                nodes.push(node);
            }
        }

        interface LinkWithReference extends LayoutLink {
            link: Link;
            vertices?: Array<{ x: number; y: number; }>;
        }
        const links: LinkWithReference[] = [];
        for (const linkId in this.model.linksByType) {
            if (this.model.linksByType.hasOwnProperty(linkId)) {
                const linksOfType = this.model.linksByType[linkId];
                for (const link of linksOfType) {
                    if (!this.model.isSourceAndTargetVisible(link)) { continue; }
                    const source = this.model.sourceOf(link);
                    const target = this.model.targetOf(link);
                    links.push({
                        link,
                        source: nodeById[source.id],
                        target: nodeById[target.id],
                    });
                }
            }
        }

        forceLayout({nodes, links, preferredLinkLength: 150});
        padded(nodes, {x: 5, y: 5}, () => {
            removeOverlaps(nodes);
        });

        let minX = Infinity, minY = Infinity;
        for (const node of nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
        }

        const canvasPadding = 150;
        for (const node of nodes) {
            this.model.elements[node.id].position(
                node.x - minX + canvasPadding,
                node.y - minY + canvasPadding);
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
