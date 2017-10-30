import * as React from 'react';
import * as Backbone from 'backbone';

import { DiagramModel } from '../diagram/model';
import { DiagramView } from '../diagram/view';
import { PaperArea, ZoomOptions } from '../diagram/paperArea';
//import { ElementLayer } from '../diagram/elementLayer';
import { ElementLayer } from '../diagram/elementLayerOwl'; //#owl mark here
import { ClassTree } from '../widgets/classTree';
import { InstancesSearch, SearchCriteria } from '../widgets/instancesSearch';
import { LinkTypesToolboxShell, LinkTypesToolboxModel } from '../widgets/linksToolbox';

import { ResizableSidebar, DockSide } from './resizableSidebar';
import { Accordion } from './accordion';
import { AccordionItem } from './accordionItem';

export interface Props {
    toolbar: React.ReactElement<any>;
    view: DiagramView;
    isViewOnly?: boolean;
    leftPanelInitiallyOpen?: boolean;
    rightPanelInitiallyOpen?: boolean;
    searchCriteria?: SearchCriteria;
    onSearchCriteriaChanged: (criteria: SearchCriteria) => void;
    zoomOptions?: ZoomOptions;
    onZoom?: (scaleX: number, scaleY: number) => void;
}

const INTRO_CLASSES = `<p>Navigate through class tree and click a class to select it.</p>
<p>When the class is selected, its instances are shown in Instances panel</p>
<p>Double-click the class expands it and displays its subclasses.</p>`;

const INTRO_INSTANCES = `<p>Instances of the selected class are displayed here.</p>
<p>You can select one or several instances and drag-and-drop them directly on canvas to
 start your diagram.</p>`;

const INTRO_DIAGRAM = `<h4>Main working area</h4><p><b>Zooming:</b> Ctrl-mousewheel or pinch-zoom on touchpad</p>
<p><b>Pan:</b> Ctrl-mouse drag or mouse wheel</p><h5>Filtering related instances</h5>
<p>When you select an element on the diagram the Ontodia shows a funnel icon underneath the
 element. By clicking the funnel icon, you can filter the related elements into the Instances panel.</p>
<p>Then related elements can be drag-and-dropped into the diagram.</p>
<p>By repeating it you can navigate from one element to another as far as you like and your way
 will be shown on the diagram.</p>`;

const INTRO_CONNECTIONS = `<p>Connections panel lists all the connection present in the data source.</p>
<p>You can define which connections Ontodia should display and which should stay hidden.</p>
<p>You can also change the way they are shown on the diagram: it’s either with the name above
 them or without it.</p>`;

const INTRO_RESIZE = `<p>Panels can be resized and collapsed.</p>`;

export class WorkspaceMarkup extends React.Component<Props, void> {
    element: HTMLElement;
    classTreePanel: HTMLElement;
    linkTypesPanel: HTMLElement;
    paperArea: PaperArea;
    private tree: ClassTree;
    private linksToolbox: LinkTypesToolboxShell;
    private untilMouseUpClasses: string[] = [];

    render() {
        let leftPanel = (
            <ResizableSidebar dockSide={DockSide.Left}
                initiallyOpen={this.props.leftPanelInitiallyOpen}
                onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    horizontalResizing: true,
                })}
                tutorialProps={{
                    'data-position': 'right',
                    'data-step': '7',
                    'data-intro-id': 'resize',
                    'data-intro': INTRO_RESIZE,
                }}>
                <Accordion onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    verticalResizing: true,
                })}>
                    <AccordionItem heading='Classes' bodyRef={this.intializeClassTree}
                        tutorialProps={{
                            'data-position': 'right',
                            'data-step': '1',
                            'data-intro-id': 'tree-view',
                            'data-intro': INTRO_CLASSES,
                        }}>
                    </AccordionItem>
                    <AccordionItem heading='Instances'
                        tutorialProps={{
                            'data-position': 'top',
                            'data-step': '2',
                            'data-intro-id': 'filter-view',
                            'data-intro': INTRO_INSTANCES,
                        }}>
                        <InstancesSearch view={this.props.view}
                            criteria={this.props.searchCriteria || {}}
                            onCriteriaChanged={this.props.onSearchCriteriaChanged} />
                    </AccordionItem>
                </Accordion>
            </ResizableSidebar>
        );

        let rightPanel = (
            <ResizableSidebar dockSide={DockSide.Right}
                initiallyOpen={this.props.rightPanelInitiallyOpen}
                onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    horizontalResizing: true,
                })}>
                <Accordion onStartResize={() => this.untilMouseUp({
                    preventTextSelection: true,
                    verticalResizing: true,
                })}>
                    <AccordionItem heading='Connections'
                        bodyClassName='link-types-toolbox' bodyRef={this.initializeLinksToolbox}
                        tutorialProps={{
                            'data-position': 'left',
                            'data-step': '4',
                            'data-intro-id': 'link-types-toolbox',
                            'data-intro': INTRO_CONNECTIONS,
                        }}>
                    </AccordionItem>
                </Accordion>
            </ResizableSidebar>
        );

        return (
            <div ref={e => this.element = e} className='ontodia'>
                <div className='ontodia__header'>{this.props.toolbar}</div>
                <div className='ontodia__workspace'>
                    {!this.props.isViewOnly ? leftPanel : null}
                    <div className='ontodia__main-panel'
                         data-position='left' data-step='3' data-intro-id='diagram-area' data-intro={INTRO_DIAGRAM}>
                        <PaperArea ref={el => this.paperArea = el}
                            model={this.props.view.model}
                            paper={this.props.view.paper}
                            zoomOptions={this.props.zoomOptions}
                            preventTextSelection={() => this.preventTextSelection()}
                            onDragDrop={(e, position) => this.props.view.onDragDrop(e, position)}
                            onZoom={this.props.onZoom}>
                            <ElementLayer view={this.props.view} paper={this.props.view.paper} />
                        </PaperArea>
                    </div>
                    {!this.props.isViewOnly ? rightPanel : null}
                </div>
            </div>
        );
    }

    componentDidMount() {
        document.addEventListener('mouseup', this.onDocumentMouseUp);
    }

    componentWillUnmount() {
        document.removeEventListener('mouseup', this.onDocumentMouseUp);
    }

    initializeLinksToolbox = (element: HTMLDivElement) => {
        if (element) {
            this.linksToolbox = new LinkTypesToolboxShell({
                model: new LinkTypesToolboxModel(this.props.view.model),
                view: this.props.view,
                el: element,
            }).render();
        } else {
            this.linksToolbox.remove();
        }
    }

    intializeClassTree = (element: HTMLDivElement) => {
        if (element) {
            this.tree = new ClassTree({
                model: new Backbone.Model(this.props.view.model),
                view: this.props.view,
                el: element,
            }).render();

            this.tree.on('action:classSelected', (classId: string) => {
                this.props.onSearchCriteriaChanged({elementTypeId: classId});
            });
        } else {
            this.tree.remove();
        }
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
}

export default WorkspaceMarkup;
