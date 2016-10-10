import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as $ from 'jquery';

import LinkTypesToolboxModel from './linksToolboxModel';
import { Element, FatLinkType } from '../diagram/elements';
import DiagramView from '../diagram/view';

export { LinkTypesToolboxModel };

export interface LinkInToolBoxOptions extends Backbone.ViewOptions<any> {
    view: DiagramView;
}

/**
 * Events:
 *     filter-click(link: FatLinkType) - when filter button clicked
 */
export class LinkInToolBox extends Backbone.View<FatLinkType> {
    private view: DiagramView;
    private $buttons: JQuery;
    private $span: JQuery;
    private $linkCountBadge: JQuery;
    private $filterButton: JQuery;

    connectedElementCount: number;

    constructor(options: LinkInToolBoxOptions) {
        super(_.extend({
            tagName: 'li',
            className: 'list-group-item linkInToolBox clearfix'
        }, options));
        this.view = options.view;
        this.listenTo(this.model, 'change:visible', this.onChangeLinkState);
        this.listenTo(this.model, 'change:showLabel', this.onChangeLinkState);
        this.listenTo(this.view, 'change:language', this.updateText);
    }

    public getLinkState(): string {
        if (!this.model.get('visible')) { return 'invisible'; }
        else if (!this.model.get('showLabel')) { return 'withoutLabels'; }
        else { return 'allVisible'; }
    }

    public setLinkState(state: string, options?: {isFromHandler?: boolean}) {
        this.view.model.initBatchCommand();
        if (state === 'invisible') {
            this.model.set({visible: false, showLabel: false}, options);
        } else if (state === 'withoutLabels') {
            this.model.set({visible: true, showLabel: false}, options);
        } else if (state === 'allVisible') {
            this.model.set({visible: true, showLabel: true}, options);
        }
        this.view.model.storeBatchCommand();
    }

    public render(): LinkInToolBox {
        this.$el.empty();
        this.$el.attr('data-linkTypeId', this.model.id);

        let $buttons = $("<span class='btn-group btn-group-xs' data-toggle='buttons'></div>").appendTo(this.$el);
        this.$buttons = $buttons;

        function createButton(optionName: string, selected: boolean, iconClass: string, tooltip: string) {
            let $buttonLabel = $('<label class="btn btn-default"/>').attr('id', optionName)
                                                                    .attr('title', tooltip)
                                                                    .appendTo($buttons);

            let $checkbox = $('<input type="radio" autocomplete="off">')
                .appendTo($buttonLabel);
            $('<span/>').attr('class', iconClass).appendTo($buttonLabel);
            if (selected) {
                $buttonLabel.addClass('active');
                $checkbox.prop('checked', true);
            }
        }

        let linkState = this.getLinkState();
        createButton('invisible', linkState === 'invisible',
            'glyphicon glyphicon-remove', 'Hide links and labels');
        createButton('withoutLabels', linkState === 'withoutLabels',
            'glyphicon glyphicon-resize-horizontal', 'Show links without labels');
        createButton('allVisible', linkState === 'allVisible',
            'glyphicon glyphicon-text-width', 'Show links with labels');

        let self = this;
        $buttons.find('label').click(function(label) {
            self.setLinkState(this.id, {isFromHandler: true});
        });

        this.$span = $('<div class="link-title"/>').appendTo(this.$el);
        let $badgeContainer = $('<div/>').appendTo(this.$el);
        if (this.model.get('isNew')) {
            $("<span class='label label-warning'>new</span>").appendTo($badgeContainer);
        }
        this.$linkCountBadge = $("<span class='badge'></span>").appendTo($badgeContainer);
        this.$filterButton = $('<a class="filter-button"><img/></a>').click(() => {
                this.trigger('filter-click', this.model);
            }).appendTo(this.$el);

        this.updateText();
        return this;
    }

    private updateText() {
        if (this.$span) {
            this.$span.text(this.view.getLocalizedText(this.model.get('label').values).text);
        }
    }

    public updateLinkCount() {
        if (this.connectedElementCount && this.connectedElementCount > 0) {
            this.$linkCountBadge.text(this.connectedElementCount);
        }
    }

    private onChangeLinkState(model: FatLinkType, value: any, options?: {isFromHandler?: boolean}) {
        if (this.$buttons && !(options && options.isFromHandler)) {
            let linkState = this.getLinkState();
            this.$buttons.find('input').each(function () {
                let input: HTMLInputElement = this;
                input.parentElement.classList.remove('active');
                let isActive = input.id === linkState;
                if (isActive) { input.parentElement.classList.add('active'); }
                input.checked = isActive;
            });
        }
    }
}

export interface LinkTypesToolboxOptions extends Backbone.ViewOptions<LinkTypesToolboxModel> {
    view: DiagramView;
}

export class LinkTypesToolbox extends Backbone.View<LinkTypesToolboxModel> {
    private view: DiagramView;
    private $caption: JQuery;
    private $label: JQuery;
    private $allLinksList: JQuery;
    private $connectedLinksList: JQuery;
    private $notConnectedLinksList: JQuery;
    private $connectedElementLabel: JQuery;
    private views: LinkInToolBox[] = [];

    constructor(options: LinkTypesToolboxOptions) {
        super(_.extend({
            tagName: 'div',
            className: 'link-types-toolbox stateBasedProgress',
        }, options));
        this.$el.addClass(_.result(this, 'className') as string);
        this.view = options.view;
        this.listenTo(this.view.model, 'state:dataLoaded', () => {
            this.render();
        });
        this.listenTo(this.view, 'change:language', this.updateGroupingOfLinkTypes);
        this.listenTo(this.view.selection, 'add remove reset', _.debounce(() => {
            // this function is debounced to prevent excessive updates of toolbox
            // when user rapidly clicks on elements
            const single = this.view.selection.length === 1
                ? this.view.selection.first() : null;
            if (single !== this.model.get('selectedElement')) {
                this.model.set('selectedElement', single);
            }
        }, 50));
        this.listenTo(this.model, 'state:beginQuery', () => { this.$el.attr('data-state', 'querying'); });
        this.listenTo(this.model, 'state:endQuery', () => {
            if (this.model.connectionsOfSelectedElement) {
                this.$el.attr('data-state', 'finished');
            } else {
                this.$el.removeAttr('data-state');
            }
            this.updateGroupingOfLinkTypes();
        });
        this.listenTo(this.model, 'state:queryError', () => this.$el.attr('data-state', 'error'));
    }

    private getLinksState(): string {
        if (!this.model.get('visible')) { return 'invisible'; }
        else if (!this.model.get('showLabel')) { return 'withoutLabels'; }
        else { return 'allVisible'; }
    }

    public render(): LinkTypesToolbox {
        this.$el.empty();

        this.$caption = $("<div class='link-types-toolbox-heading'>");
        this.$label = $("<div class='link-types-toolbox-controls'></div>").appendTo(this.$caption);

        let $buttons = $("<div class='btn-group btn-group-xs'></div>").appendTo(this.$label);
        let createButton = (optionName: string, selected: boolean, iconClass: string, tooltip: string) => {
            let $buttonLabel = $('<label class="btn btn-default"/>').attr('title', tooltip).appendTo($buttons);
            $('<input type="hidden">').appendTo($buttonLabel);
            $('<span/>').attr('class', iconClass).appendTo($buttonLabel);
            $buttonLabel.on('click', () => {
                this.view.model.initBatchCommand();
                _.each(this.views, function (link: LinkInToolBox) {
                    link.setLinkState(optionName, {isFromHandler: false});
                    link.$el.find('#' + optionName).addClass('active');
                });
                this.view.model.storeBatchCommand();
            });
        }

        let linkState = this.getLinksState();
        createButton('invisible', linkState === 'invisible',
            'glyphicon glyphicon-remove', 'Hide links and labels');
        createButton('withoutLabels', linkState === 'withoutLabels',
            'glyphicon glyphicon-resize-horizontal', 'Show links without labels');
        createButton('allVisible', linkState === 'allVisible',
            'glyphicon glyphicon-text-width', 'Show links with labels');

        $('<span>Switch all</span>').appendTo(this.$label);
        this.$el.append(this.$caption);

        $('<div class="progress"/>').append($('<div/>').attr({
            'class': 'progress-bar progress-bar-striped active',
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': '100',
            style: 'width: 100%;',
        })).appendTo(this.$el);

        let $container = $('<div class="link-lists"/>').appendTo(this.el);
        this.$allLinksList = $('<ul class="list-group"/>');
        this.$connectedLinksList = $('<ul class="list-group connected-links"/>');
        this.$notConnectedLinksList = $('<ul class="list-group"/>');
        this.$connectedElementLabel = $('<span/>');
        $container
            .append(this.$allLinksList)
            .append($('<h4 class="links-heading">Connected to </h4>').append(this.$connectedElementLabel))
            .append(this.$connectedLinksList)
            .append('<h4 class="links-heading">Other</h4>')
            .append(this.$notConnectedLinksList);

        _.each(this.view.model.linkTypes, (link: FatLinkType) => {
            let elementView = new LinkInToolBox({model: link, view: this.view}).render();
            this.listenTo(elementView, 'filter-click', (linkType: FatLinkType) => {
                let selectedElement: Element = this.model.get('selectedElement');
                this.view.model.graph.trigger('add-to-filter', selectedElement, linkType);
            });
            this.views.push(elementView);
        });

        this.updateGroupingOfLinkTypes();
        return this;
    }

    private updateGroupingOfLinkTypes() {
        if (this.model.connectionsOfSelectedElement) {
            _.each(this.orderedViews(this.views), view => {
                view.$el.detach();
                let connectionCount = this.model.connectionsOfSelectedElement[view.model.id];
                view.connectedElementCount = connectionCount ? connectionCount : 0;
                view.updateLinkCount();
                if (connectionCount && connectionCount > 0) {
                    this.$connectedLinksList.append(view.el);
                } else {
                    this.$notConnectedLinksList.append(view.el);
                }
            });
            let selectedElement: Element = this.model.get('selectedElement');
            this.$connectedElementLabel.text(this.view.getLocalizedText(
                selectedElement.template.label.values).text);
            this.$('.links-heading').show();
        } else {
            _.each(this.orderedViews(this.views), view => {
                view.$el.detach();
                view.connectedElementCount = 0;
                view.updateLinkCount();
                this.$allLinksList.append(view.el);
            });
            this.$('.links-heading').hide();
        }
    }

    private orderedViews(views: LinkInToolBox[]): LinkInToolBox[] {
        return _.sortBy(views, view => this.view.getLocalizedText(
            view.model.get('label').values).text);
    }
}

export default LinkTypesToolbox;
