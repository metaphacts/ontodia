import * as $ from 'jquery';
import { Component, createElement, ReactElement } from 'react';
import * as Springy from 'springy';

import DiagramModel from '../diagram/model';
import DiagramView from '../diagram/view';
import { ClassTree } from '../widgets/classTree';
import { FilterView, FilterModel } from '../widgets/filter';
import { LinkTypesToolbox, LinkTypesToolboxModel } from '../widgets/linksToolbox';
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
}

export class Workspace extends Component<Props, {}> {
    private model: DiagramModel;
    private diagram: DiagramView;
    private tree: ClassTree;
    private filter: FilterView;
    private linksToolbox: LinkTypesToolbox;

    constructor(props: Props) {
        super(props);
        this.model = new DiagramModel(this.props.isViewOnly);
    }

    render(): ReactElement<any> {
        return createElement(WorkspaceMarkup, {
            isViewOnly: this.props.isViewOnly,
            toolbar: createElement<EditorToolbarProps>(EditorToolbar, {
                onUndo: () => {/* this.diagram.undo() */},
                onRedo: () => {/* this.diagram.redo() */},
                onZoomIn: () => this.diagram.zoomIn(),
                onZoomOut: () => this.diagram.zoomOut(),
                onZoomToFit: () => this.diagram.zoomToFit(),
                onPrint: () => this.diagram.print(),
                onExportSVG: link => this.onExportSvg(link),
                onExportPNG: link => this.onExportPng(link),
                onShare: () => this.props.onShareDiagram(this),
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
            ref: markup => {
                if (markup) {
                    this.diagram = new DiagramView(this.model, markup.chartPanel);
                    if (!this.props.isViewOnly) {
                        this.filter = new FilterView({
                            model: new FilterModel(this.diagram.model),
                            view: this.diagram,
                            el: markup.filterPanel,
                        }).render();

                        this.tree = new ClassTree({
                            model: new FilterModel(this.diagram.model),
                            view: this.diagram,
                            el: markup.classTreePanel,
                        }).render();

                        this.tree.on('action:classSelected', (classId: string) => {
                            this.filter.model.filterByType(classId);
                        });

                        this.linksToolbox = new LinkTypesToolbox({
                            model: new LinkTypesToolboxModel(this.model),
                            view: this.diagram,
                            el: markup.linkTypesPanel,
                        });

                        const panelRoot = $(markup.element);
                        panelRoot.find('.filter-panel').each(resizePanel);
                        panelRoot.find('.filter-item').each(resizeItem);

                        $(window).resize(() => {
                            if (!this.props.isViewOnly) {
                                panelRoot.find('.filter-panel').each(setPanelHeight);
                            }
                        });

                        if (!this.props.isViewOnly && !this.props.hideTutorial) {
                            showTutorialIfNotSeen();
                        }
                    }
                }
            },
        });
    }

    public getModel() {
        return this.model;
    }

    public getDiagram() {
        return this.diagram;
    }

    public forceLayout() {
        const SCALE_FACTOR = 50;
        const MAX_POSITION = 1000;

        const graph = new Springy.Graph();
        for (const elementId in this.model.elements) {
            if (this.model.elements.hasOwnProperty(elementId)) {
                const element: any = this.model.elements[elementId];
                if (!this.props.isViewOnly || element.get('presentOnDiagram')) {
                    element.graphNode = graph.newNode();
                    element.graphNode.real = element;
                }
            }
        }
        for (const linkId in this.model.linksByType) {
            if (this.model.linksByType.hasOwnProperty(linkId)) {
                const links = this.model.linksByType[linkId];
                for (const link of links) {
                    const graphLink: any = link;
                    const source: any = this.model.sourceOf(link);
                    const target: any = this.model.targetOf(link);
                    if (!this.props.isViewOnly || this.model.isSourceAndTargetVisible(link)) {
                        graphLink.graphEdge = graph.newEdge(source.graphNode, target.graphNode);
                        graphLink.graphEdge.real = link;
                    }
                }
            }
        }
        const layout = new Springy.Layout.ForceDirected(graph, 300.0, 300.0, 0.4);
        for (let j = 0; j < 1000; j++) {
            layout.tick(0.03);
        }

        layout.eachNode((node, point) => {
            let x = SCALE_FACTOR * point.p.x;
            let y = SCALE_FACTOR * point.p.y;

            x = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, x));
            y = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, y));

            (<any>node).real.position(x, y);
        });
    }

    private onExportSvg(link: HTMLAnchorElement) {
        this.diagram.exportSVG().then(svg => {
            link.download = 'diagram.svg';
            link.href = window.URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
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
