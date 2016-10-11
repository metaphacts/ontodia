import * as $ from 'jquery';
import { Component, createElement, ReactElement } from 'react';
import * as Springy from 'springy';
import * as d3 from 'd3';
import * as _ from 'lodash';

import DiagramModel from '../diagram/model';
import { DiagramView, DiagramViewOptions } from '../diagram/view';
import { ClassTree } from '../widgets/classTree';
import { FilterView, FilterModel } from '../widgets/filter';
import { LinkTypesToolbox, LinkTypesToolboxModel } from '../widgets/linksToolbox';
import { dataURLToBlob } from '../viewUtils/toSvg';
import { resizePanel, setPanelHeight } from '../resizable-panels';
import { resizeItem } from '../resizable-items';
import { EditorToolbar, Props as EditorToolbarProps } from '../widgets/toolbar';
import { showTutorial, showTutorialIfNotSeen } from '../tutorial/tutorial';
import { Element } from '../diagram/elements';

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
    private linksToolbox: LinkTypesToolbox;

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

        this.linksToolbox = new LinkTypesToolbox({
            model: new LinkTypesToolboxModel(this.model),
            view: this.diagram,
            el: this.markup.linkTypesPanel,
        });

        const panelRoot = $(this.markup.element);
        panelRoot.find('.filter-panel').each(resizePanel);
        panelRoot.find('.filter-item').each(resizeItem);

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
            this.linksToolbox.remove();
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

        // Select model.elements values as vertexes for Voronoi diagram
        const vertices = _.values<Element>(this.model.elements);
        let triangulationEdges: d3.geom.voronoi.Link<Element>[] = [];

        // Configure Voronoi
        const myVoronoi = d3.geom.voronoi<Element>()
                        .x(function(d) { return (<Element>d).get('position').x; })
                        .y(function(d) { return (<Element>d).get('position').y; });
        
        // Consider some debugging data
        let overlapping = 0;
        let round = 1;
        
        // Consider safe execution with max number of overlapping issue solving attempts = 100;
        const MAX_ROUNDS = 100;
        const MAX_SSCALE = 1.5;

        while (round < MAX_ROUNDS) {
            // Break if no more overlapping nodes found over Delaunay triangulation
            if(overlapping === 0 && round > 1)
                break;
            
            overlapping = 0;
           
            // Form a proximity graph by Delaunay triangulation on Voronoi diagram            
            triangulationEdges = myVoronoi.links(vertices);

            triangulationEdges.forEach(function(edge) {
                const leftHandEpr = (edge.source.get('size').width/2 + edge.target.get('size').width/2) / (Math.abs(edge.source.get('position').x - edge.target.get('position').x));
                const rightHandExpr = (edge.source.get('size').height/2 + edge.target.get('size').height/2) / (Math.abs(edge.source.get('position').y - edge.target.get('position').y));
                
                // Calculate overlap factor using left and right hand expressions calculated above
                const tFactor = Math.max(Math.min(leftHandEpr, rightHandExpr), 1);

                // If overlapping actually exists
                if (tFactor > 1) {
                    // Increment overlapping rate
                    overlapping++;
                    
                    // Choose an optimal factor (smax = 1.5 is believed to be a good option)
                    const sFactor = Math.min(tFactor, MAX_SSCALE);

                    // Calculate coordinates for both: source and target nodes that form an edge
                    const xSourceCoord = edge.source.get('position').x*sFactor;
                    const ySourceCoord =  edge.source.get('position').y*sFactor;                                        
                    const xTargetCoord = edge.target.get('position').x*sFactor;
                    const yTargetCoord =  edge.target.get('position').y*sFactor;

                    // TODO: Consider in future proper solving of a proximity stress model...

                    // Adjust coordinates considering previously set MAX_POSITION const
                    edge.source.position(Math.max(-MAX_POSITION, Math.min(MAX_POSITION, xSourceCoord)), Math.max(-MAX_POSITION, Math.min(MAX_POSITION, ySourceCoord)));
                    edge.target.position(Math.max(-MAX_POSITION, Math.min(MAX_POSITION, xTargetCoord)), Math.max(-MAX_POSITION, Math.min(MAX_POSITION, yTargetCoord)));
                }
            });

            // Increment round number
            round++;
        }

        // Display some nice debug info
        console.debug('Overlappings left:', overlapping);
        console.debug('Rounds used:', round); 
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
