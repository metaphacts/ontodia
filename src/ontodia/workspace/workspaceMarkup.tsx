import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { PaperArea } from '../diagram/paperArea';

import { TutorialProps } from '../tutorial/tutorial';

import { InstancesSearch, SearchCriteria } from '../widgets/instancesSearch';

export interface Props {
    toolbar: React.ReactElement<any>;
    view: DiagramView;
    isViewOnly?: boolean;

    searchCriteria?: SearchCriteria;
    onSearchCriteriaChanged: (criteria: SearchCriteria) => void;
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

    render() {
        let leftPanel = (
            <DragResizableColumn className='ontodia__left-panel' tutorialProps={{
                'data-position': 'right', 'data-step': '7', 'data-intro-id': 'resize', 'data-intro': INTRO_RESIZE}}>
                <ToggableColumnWidget heading='Classes' bodyRef={e => this.classTreePanel = e}
                    tutorialProps={{
                        'data-position': 'right',
                        'data-step': '1',
                        'data-intro-id': 'tree-view',
                        'data-intro': INTRO_CLASSES,
                    }}>
                </ToggableColumnWidget>
                <ToggableColumnWidget heading='Instances'
                    bodyClassName='filter-view'
                    tutorialProps={{
                        'data-position': 'top',
                        'data-step': '2',
                        'data-intro-id': 'filter-view',
                        'data-intro': INTRO_INSTANCES,
                    }}>
                    <InstancesSearch className='filter-item__body'
                        view={this.props.view} criteria={this.props.searchCriteria || {}}
                        onCriteriaChanged={this.props.onSearchCriteriaChanged} />
                </ToggableColumnWidget>
            </DragResizableColumn>
        );

        let rightPanel = (
            <DragResizableColumn className='ontodia__right-panel'>
                <ToggableColumnWidget heading='Connections'
                    bodyClassName='link-types-toolbox' bodyRef={e => this.linkTypesPanel = e}
                    tutorialProps={{
                        'data-position': 'left',
                        'data-step': '4',
                        'data-intro-id': 'link-types-toolbox',
                        'data-intro': INTRO_CONNECTIONS,
                    }}>
                </ToggableColumnWidget>
            </DragResizableColumn>
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
                            zoomOptions={{min: 0.2, max: 2, maxFit: 1, fitPadding: 20}}
                            preventTextSelection={() => this.preventTextSelection()}
                            onDragDrop={(e, position) => this.props.view.onDragDrop(e, position)} />
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

    preventTextSelection() {
        this.element.classList.add('ontodia--unselectable');
    }

    private onDocumentMouseUp = () => {
        this.element.classList.remove('ontodia--unselectable');
    }
}

interface DragResizableColumnProps {
    className?: string;
    tutorialProps?: TutorialProps;
    children?: React.ReactNode;
}

class DragResizableColumn extends React.Component<DragResizableColumnProps, void> {
    render() {
        return <div className={`filter-panel ${this.props.className || ''}`} {...this.props.tutorialProps}>
            {this.props.children}
            <div className='filter-panel__handle'>
                <div className='filter-panel__handle-btn'></div>
            </div>
        </div>;
    }
}

interface ToggableColumnWidgetProps {
    heading: string;
    bodyClassName?: string;
    bodyRef?: (body: HTMLDivElement) => void;
    tutorialProps?: TutorialProps;
    children?: React.ReactNode;
}

class ToggableColumnWidget extends React.Component<ToggableColumnWidgetProps, void> {
    render() {
        return <div className='filter-item ontodia-widget' {...this.props.tutorialProps}>
            <div className='filter-item__inner'>
                <div className='ontodia-widget-heading filter-item__header'>{this.props.heading}</div>
                {this.props.children ? this.props.children :
                    <div ref={this.props.bodyRef}
                        className={`filter-item__body ${this.props.bodyClassName || ''}`}>
                        {this.props.children}
                    </div>
                }
            </div>
            <div className='filter-item__handle'></div>
        </div>;
    }
}

export default WorkspaceMarkup;
