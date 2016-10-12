import * as _ from 'lodash';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Backbone from 'backbone';

import LinkTypesToolboxModel from './linksToolboxModel';
import { FatLinkType } from '../diagram/elements';
import DiagramView from '../diagram/view';

export { LinkTypesToolboxModel };
export interface LinkInToolBoxProps {
    model: FatLinkType;
    onFilter?: (FatLinkType) => void;
}

/**
 * Events:
 *     filter-click(link: FatLinkType) - when filter button clicked
 */
export class LinkInToolBox extends React.Component<LinkInToolBoxProps, {}> {
    private model: FatLinkType;
    connectedElementCount: number;

    constructor(props: LinkInToolBoxProps) {
        super(props);
        this.model = props.model;
        // this.listenTo(this.model, 'change:visible', this.onChangeLinkState);
        // this.listenTo(this.model, 'change:showLabel', this.onChangeLinkState);
        // this.listenTo(this.view, 'change:language', this.updateText);
    }

    public getLinkState(): string {
        if (!this.model.get('visible')) {
            return 'invisible';
        } else if (!this.model.get('showLabel')) {
            return 'withoutLabels';
        } else {
            return 'allVisible';
        }
    }

    public setLinkState(state: string, options?: {isFromHandler?: boolean}) {
        if (state === 'invisible') {
            this.model.set({visible: false, showLabel: false}, options);
        } else if (state === 'withoutLabels') {
            this.model.set({visible: true, showLabel: false}, options);
        } else if (state === 'allVisible') {
            this.model.set({visible: true, showLabel: true}, options);
        }
    }

    render() {
        let linkState = this.getLinkState();

        const onButtonClick = () => {
            this.setLinkState(this.model.id, {isFromHandler: true});
        };

        let badgeContainer = '';
        if (this.model.get('isNew')) {
            badgeContainer = <div>
                <span className='label label-warning'>new</span>
                <span className='badge'>{this.getLinkCount()}</span>
            </div>;
        }

        const onFilter = () => {
            if (this.props.onFilter) {
                this.props.onFilter(this.model);
            }
        };

        return (
            <li data-linkTypeId={this.model.id} className='list-group-item linkInToolBox clearfix'>
                <span className='btn-group btn-group-xs' data-toggle='buttons'>
                    <label className='btn btn-default'
                        id='invisible'
                        title='Hide links and labels'
                        onClick={onButtonClick}
                    >
                        <input type='radio' autoComplete='off' checked={linkState === 'invisible'}/>
                        <span className={'glyphicon glyphicon-remove' + (linkState === 'invisible' ? ' active' : '')}/>
                    </label>
                    <label className='btn btn-default'
                        id='withoutLabels'
                        title='Show links without labels'
                        onClick={onButtonClick}
                    >
                        <input type='radio' autoComplete='off' checked={linkState === 'withoutLabels'}/>
                        <span className={'glyphicon glyphicon-resize-horizontal'
                                        + (linkState === 'withoutLabels' ? ' active' : '')}/>
                    </label>
                    <label className='btn btn-default'
                        id='allVisible'
                        title='Show links with labels'
                        onClick={onButtonClick}
                    >
                        <input type='radio' autoComplete='off' checked={linkState === 'allVisible'}/>
                        <span className={'glyphicon glyphicon-text-width'
                                        + (linkState === 'allVisible' ? ' active' : '')}/>
                    </label>
                </span>
                <div className='link-title'>{this.getText()}</div>
                {badgeContainer}
                <a className='filter-button' onClick={onFilter}><img/></a>
            </li>
        );
    }

    private getText() {
        return this.model.get('label').values[0].text;
    }

    private getLinkCount() {
        if (this.connectedElementCount && this.connectedElementCount > 0) {
            return this.connectedElementCount;
        }
    }
}

export interface LinkTypesToolboxProps extends Backbone.ViewOptions<LinkTypesToolboxModel> {
    links: FatLinkType[];
    filterCallback?: (FatLinkType) => void;
}

export class LinkTypesToolbox extends React.Component<LinkTypesToolboxProps, {}> {
    private links: FatLinkType[];
    private views: LinkInToolBox[] = [];

    constructor(props: LinkTypesToolboxProps) {
        super(props);
        this.links = props.links || [];
    }

    render() {
        for (const link of this.links) {
            this.views.push(<LinkInToolBox key={link.id} model={link} onFilter={this.props.filterCallback}/>);
        }

        return (
            <div className='link-types-toolbox stateBasedProgress'>
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
                    <h4 className='links-heading'>
                        Connected to
                        <span></span>
                    </h4>
                    <ul className='list-group connected-links'>{this.views}</ul>
                    <h4 className='links-heading'>Other</h4>
                    <ul className='list-group'></ul>
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
    private filterCallback: (FatLinkType) => void;
    private linksOfElement: FatLinkType[] = [];

    constructor(public props: LinkTypesToolboxShellProps) {
        super(_.extend({
            tagName: 'div',
            className: 'link-types-toolbox stateBasedProgress',
        }, props));
        this.$el.addClass(_.result(this, 'className') as string);
        this.view = props.view;
        this.listenTo(this.view.model, 'state:dataLoaded', () => {
            this.render();
        });
        this.listenTo(this.view, 'change:language', this.updateLinks);
        this.listenTo(this.view.selection, 'add remove reset', _.debounce(() => {
            const single = this.view.selection.length === 1
                ? this.view.selection.first() : null;
            if (single !== this.model.get('selectedElement')) {
                this.model.set('selectedElement', single);
            }
        }, 50));
        this.listenTo(this.model, 'state:beginQuery', () => {
            this.$el.attr('data-state', 'querying');
        });
        this.listenTo(this.model, 'state:endQuery', () => {
            if (this.model.connectionsOfSelectedElement) {
                this.$el.attr('data-state', 'finished');
            } else {
                this.$el.removeAttr('data-state');
            }
            this.updateLinks();
        });
        this.listenTo(this.model, 'state:queryError', () => this.$el.attr('data-state', 'error'));

        this.filterCallback = (linkType: FatLinkType) => {
            let selectedElement: Element = this.model.get('selectedElement');
            this.view.model.graph.trigger('add-to-filter', selectedElement, linkType);
        };
    }

    private updateLinks() {
        if (this.model.connectionsOfSelectedElement) {
            const linkTypeIds = _.keys(this.model.connectionsOfSelectedElement);
            this.unsubscribeOnLinksEevents(this.linksOfElement);
            this.linksOfElement = linkTypeIds.map(id => {
                return this.view.model.getLinkType(id);
            });
            this.subscribeOnLinksEevents(this.linksOfElement);
            this.$('.links-heading').show();
        } else {
            this.$('.links-heading').hide();
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

    public render(): LinkTypesToolboxShell {
        this.$el.empty();
        ReactDOM.render(
            React.createElement(LinkTypesToolbox, {
                links: this.linksOfElement,
                filterCallback: this.filterCallback,
            }),
            this.$el.get(0),
        );
        return this;
    }
}

export default LinkTypesToolboxShell;
