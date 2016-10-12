import * as _ from 'lodash';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Backbone from 'backbone';

import LinkTypesToolboxModel from './linksToolboxModel';
import { FatLinkType } from '../diagram/elements';
import DiagramView from '../diagram/view';

export { LinkTypesToolboxModel };
export interface LinkInToolBoxProps {
    link: FatLinkType;
    onFilter?: (FatLinkType) => void;
}

/**
 * Events:
 *     filter-click(link: FatLinkType) - when filter button clicked
 */
export class LinkInToolBox extends React.Component<LinkInToolBoxProps, {}> {
    connectedElementCount: number;

    constructor(props: LinkInToolBoxProps) {
        super(props);
        // this.listenTo(this.link, 'change:visible', this.onChangeLinkState);
        // this.listenTo(this.link, 'change:showLabel', this.onChangeLinkState);
        // this.listenTo(this.view, 'change:language', this.updateText);
    }

    render() {
        let badgeContainer = '';
        if (this.props.link.get('isNew')) {
            badgeContainer = <div>
                <span className='label label-warning'>new</span>
                <span className='badge'>{this.getLinkCount()}</span>
            </div>;
        }

        const onFilter = () => {
            if (this.props.onFilter) {
                this.props.onFilter(this.props.link);
            }
        };

        const isChecked = (stateName): boolean => {
            let curState;
            if (!this.props.link.get('visible')) {
                curState = 'invisible';
            } else if (!this.props.link.get('showLabel')) {
                curState = 'withoutLabels';
            } else {
                curState = 'allVisible';
            }
            return stateName === curState;
        }

        const onClickDisable = () => {
            this.props.link.set({visible: false, showLabel: false});
        };

        const onClickNoLabels = () => {
            this.props.link.set({visible: true, showLabel: false});
        };

        const onClickAll = () => {
            this.props.link.set({visible: true, showLabel: true});
        };

        return (
            <li data-linkTypeId={this.props.link.id} className='list-group-item linkInToolBox clearfix'>
                <span className='btn-group btn-group-xs' data-toggle='buttons'>
                    <label className={'btn btn-default' + (isChecked('invisible') ? ' active' : '')}
                        id='invisible'
                        title='Hide links and labels'
                        onClick={onClickDisable}
                    >
                        <input type='radio' autoComplete='off' checked={isChecked('invisible')}/>
                        <span className='glyphicon glyphicon-remove'/>
                    </label>
                    <label className={'btn btn-default' + (isChecked('withoutLabels') ? ' active' : '')}
                        id='withoutLabels'
                        title='Show links without labels'
                        onClick={onClickNoLabels}
                    >
                        <input type='radio' autoComplete='off' checked={isChecked('withoutLabels')}/>
                        <span className='glyphicon glyphicon-resize-horizontal'/>
                    </label>
                    <label className={'btn btn-default' + (isChecked('allVisible') ? ' active' : '')}
                        id='allVisible'
                        title='Show links with labels'
                        onClick={onClickAll}
                    >
                        <input type='radio' autoComplete='off' checked={isChecked('allVisible')}/>
                        <span className='glyphicon glyphicon-text-width'/>
                    </label>
                </span>
                <div className='link-title'>{this.getText()}</div>
                {badgeContainer}
                <a className='filter-button' onClick={onFilter}><img/></a>
            </li>
        );
    }

    private getText() {
        return this.props.link.get('label').values[0].text;
    }

    private getLinkCount() {
        if (this.connectedElementCount && this.connectedElementCount > 0) {
            return this.connectedElementCount;
        }
    }
}

export interface LinkTypesToolboxProps extends Backbone.ViewOptions<LinkTypesToolboxModel> {
    links: FatLinkType[];
    dataState?: string;
    selectedElementName?: string;
    filterCallback?: (FatLinkType) => void;
}

export class LinkTypesToolbox extends React.Component<LinkTypesToolboxProps, {}> {
    constructor(props: LinkTypesToolboxProps) {
        super(props);
    }

    render() {
        const links = this.props.links || [];
        const dataState = this.props.dataState || null;
        const views = [];
        for (const link of links) {
            views.push(<LinkInToolBox key={link.id} link={link} onFilter={this.props.filterCallback}/>);
        }

        let selectedElementName = '';
        if (this.props.selectedElementName) {
            selectedElementName = <h4 className='links-heading'>
                Connected to
                <span>{this.props.selectedElementName}</span>
            </h4>;
        }

        return (
            <div className='link-types-toolbox stateBasedProgress' data-state={dataState}>
                <div className='link-types-toolbox-heading'>
                    <div className='btn-group btn-group-xs'>
                        <label className='btn btn-default' title='Hide links and labels'>
                            <input type='hidden'/>
                            <span className='glyphicon glyphicon-remove'/>
                        </label>
                        <label className='btn btn-default' title='Show links without labels'>
                            <input type='hidden'/>
                            <span className='glyphicon glyphicon-resize-horizontal'/>
                        </label>
                        <label className='btn btn-default' title='Show links with labels'>
                            <input type='hidden'/>
                            <span className='glyphicon glyphicon-text-width'/>
                        </label>
                    </div>
                    <span>Switch all</span>
                </div>
                <div className='progress'>
                    <div className='progress-bar progress-bar-striped active'
                        role='progressbar'
                        aria-valuemin='0'
                        aria-valuemax='100'
                        aria-valuenow='100'
                        style={ {width: '100%'} }>
                    </div>
                </div>
                <div className='link-lists'>
                    {selectedElementName}
                    <ul className='list-group connected-links'>{views}</ul>
                </div>
            </div>
        );
    }
}

export interface LinkTypesToolboxShellProps extends Backbone.ViewOptions<LinkTypesToolboxModel> {
    view: DiagramView;
}

export class LinkTypesToolboxShell extends Backbone.View<LinkTypesToolboxModel> {
    private view: DiagramView;
    private dataState: string;
    private filterCallback: (FatLinkType) => void;
    private linksOfElement: FatLinkType[] = [];

    constructor(public props: LinkTypesToolboxShellProps) {
        super(_.extend({ tagName: 'div' }, props));

        this.view = props.view;

        this.listenTo(this.view.model, 'state:dataLoaded', () => this.render());
        this.listenTo(this.view, 'change:language', this.updateLinks);

        this.listenTo(this.view.selection, 'add remove reset', _.debounce(() => {
            const single = this.view.selection.length === 1
                ? this.view.selection.first() : null;
            if (single !== this.model.get('selectedElement')) {
                this.model.set('selectedElement', single);
            }
            this.updateLinks();
        }, 50));

        this.listenTo(this.model, 'state:beginQuery', () => { this.setDataState('querying'); });
        this.listenTo(this.model, 'state:queryError', () => this.setDataState('error'));
        this.listenTo(this.model, 'state:endQuery', () => {
            this.setDataState(this.model.connectionsOfSelectedElement ? 'finished' : null);
            this.updateLinks();
        });

        this.filterCallback = (linkType: FatLinkType) => {
            let selectedElement: Element = this.model.get('selectedElement');
            this.view.model.graph.trigger('add-to-filter', selectedElement, linkType);
        };
    }

    private setDataState(dataState) {
        this.dataState = dataState;
        this.render();
    }

    private updateLinks() {
        if (this.linksOfElement) {
            this.unsubscribeOnLinksEevents(this.linksOfElement);
        }

        if (this.model.connectionsOfSelectedElement) {
            const linkTypeIds = _.keys(this.model.connectionsOfSelectedElement);
            this.linksOfElement = linkTypeIds.map(id => {
                return this.view.model.getLinkType(id);
            });
            this.subscribeOnLinksEevents(this.linksOfElement);
        } else {
           this.linksOfElement = null;
        }
        this.render();
    }

    private subscribeOnLinksEevents(linksOfElement: FatLinkType[]) {
        for (const link of linksOfElement) {
            this.listenTo(link, 'change:label', this.render);
        };
    }

    private unsubscribeOnLinksEevents(linksOfElement: FatLinkType[]) {
        for (const link of linksOfElement) {
            this.stopListening(link);
        };
    }

    public getReactComponent() {
        return React.createElement(LinkTypesToolbox, {
            links: this.linksOfElement,
            filterCallback: this.filterCallback,
            dataState: this.dataState,
        });
    }

    public render(): LinkTypesToolboxShell {
        // this.$el.empty();
        ReactDOM.render(
            this.getReactComponent(),
            this.el,
        );
        return this;
    }
}

export default LinkTypesToolboxShell;
